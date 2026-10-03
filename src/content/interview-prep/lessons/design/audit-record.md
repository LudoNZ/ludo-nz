## Explanation

**The case:** *"Inspection records can end up in disputes, insurance claims or regulatory audits years later. Design a permanent, trustworthy audit record."*

You know why this matters: when a slab cracks or a membrane leaks, the first question is "who signed this off, when, and what did they see?". The system must answer that years later, and the answer must be believable, meaning nobody could have quietly changed it.

**Requirements to pin down:** What must be recorded (every response, photo, sign-off, rejection, template change, user and permission change)? How long (often many years for building records, so ask, and mention that the company's own legal obligations decide)? Who can read the trail? Must it be tamper-*evident* (we can detect changes) or tamper-*proof* (changes are impossible even for admins)? Export format for auditors (a PDF report with photos, a CSV)?

**Design principles:**

1. **Append-only facts.** The course schema already does this for responses: re-inspections add rows, and nothing is updated. Extend it: sign-offs are *signed* once, and corrections are new events ("sign-off revoked by X because Y"), never edits. An append-only `audit_events` table records every significant action: who (user id and their role at the time), what (event type and payload), when (server time, plus device time where relevant), and where from (request id, IP or device).
2. **Snapshot what was seen.** Templates change over time. The audit trail must show the checklist *as the inspector saw it*. The seed's template `version`s do this. Never edit a template in place once it's been used. Store denormalised context in the event payload (lot code, item prompt text, the signer's name at the time) so the record reads correctly even if names change later. This is one of the legitimate reasons to denormalise.
3. **Enforce immutability in the database, not just the app.** Revoke `UPDATE` and `DELETE` on audit tables from the application's database role, and/or add a trigger that rejects them. Then a bug or a compromised API can't rewrite history.
4. **Tamper evidence.** Hash-chain the events: each row stores `hash = sha256(previous_hash || canonical payload)`. Any edit or deletion breaks the chain from that point, and a periodic job verifies it. For stronger guarantees, export periodic digests (or the events) to write-once storage such as S3 Object Lock in compliance mode, which can't be deleted by anyone, including admins, until the retention date.
5. **Photos are evidence too.** Store the original's hash (SHA-256) with the photo row at upload, keep originals in a versioned bucket with lifecycle rules for retention, and never overwrite.
6. **Time.** Server timestamps are authoritative for ordering. Device time is kept as a claim. Clocks in UTC (`timestamptz`), displayed in the site's time zone.

**Soft delete vs hard delete.** Users will ask to "delete" things. Model it as an event ("response withdrawn by X, reason Y") plus a flag the UI respects. Hard deletion of audit data only via a deliberate, logged retention process. Privacy requests (personal data) can conflict with retention. That's a policy question to flag, not to solve in code.

**Trade-offs:** event-sourcing everything (the state is derived from events) is powerful but a big architectural commitment. A pragmatic middle ground: a normal relational model for current state, plus an append-only audit table written *in the same transaction* as each change, so they can never disagree.

## Worked example

An append-only audit table, enforced by a trigger and hash-chained:

```sql keep
CREATE TABLE audit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies (id),
  actor_id    bigint NOT NULL REFERENCES users (id),
  event_type  text NOT NULL,
  entity      text NOT NULL,
  entity_id   bigint NOT NULL,
  payload     jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  prev_hash   bytea,
  hash        bytea NOT NULL
);

CREATE FUNCTION audit_events_chain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT hash INTO NEW.prev_hash FROM audit_events ORDER BY id DESC LIMIT 1;
  NEW.hash := sha256(
    coalesce(NEW.prev_hash, ''::bytea) ||
    convert_to(NEW.company_id || '|' || NEW.actor_id || '|' || NEW.event_type || '|' || NEW.entity || '|' ||
               NEW.entity_id || '|' || NEW.payload::text || '|' || NEW.occurred_at::text, 'UTF8'));
  RETURN NEW;
END $$;

CREATE FUNCTION audit_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (% blocked)', TG_OP;
END $$;

CREATE TRIGGER audit_events_chain BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_chain();
CREATE TRIGGER audit_events_no_update_delete BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();

INSERT INTO audit_events (company_id, actor_id, event_type, entity, entity_id, payload)
VALUES (1, 3, 'sign_off.signed', 'sign_off', 1,
        '{"lot": "TRC-101-L01", "role": "engineer", "signer_name": "Chloe Tan"}'),
       (1, 4, 'response.recorded', 'response', 2,
        '{"item": "Formwork clean, braced and to line", "result": "pass"}');
```

Each row's hash covers its content and the previous hash, so changing an old row (if someone bypassed the trigger as a superuser) would break every later link. The concurrency caveat to mention: two simultaneous inserts could read the same `prev_hash`. Serialise chain writes with an advisory lock or a single writer, or chain per company. `sha256(bytea)` has been built into Postgres since version 11, so no extension is needed.

## Exercises

### Prove it's append-only [1]

Try to change the first audit event's payload, and to delete it. Both must fail.

#### Solution

```sql error
UPDATE audit_events SET payload = '{"lot": "TRC-101-L01", "role": "engineer", "signer_name": "Someone Else"}' WHERE id = 1;
```

```sql error
DELETE FROM audit_events WHERE id = 1;
```

Both raise `audit_events is append-only`. In production you'd *also* revoke `UPDATE, DELETE` on the table from the app's role (`REVOKE UPDATE, DELETE ON audit_events FROM app_user;`), which is defence in depth. A superuser can still disable triggers, which is why tamper *evidence* (the hash chain, external digests) matters as well.

### Verify the chain [2]

Write a query that recomputes each event's hash from its content and `prev_hash`, and reports any row where the stored hash doesn't match, or where `prev_hash` doesn't equal the previous row's hash.

#### Solution

```sql
SELECT e.id,
       e.hash = sha256(
         coalesce(e.prev_hash, ''::bytea) ||
         convert_to(e.company_id || '|' || e.actor_id || '|' || e.event_type || '|' || e.entity || '|' ||
                    e.entity_id || '|' || e.payload::text || '|' || e.occurred_at::text, 'UTF8')) AS content_ok,
       e.prev_hash IS NOT DISTINCT FROM lag(e.hash) OVER (ORDER BY e.id) AS link_ok
FROM audit_events e
ORDER BY e.id;
```

Both columns should be `true` for every row. `IS NOT DISTINCT FROM` handles the first row, where both sides are NULL (plain `=` would give NULL). `lag()` is the window function from the SQL module, fetching the previous row's hash. A nightly job running this, with an alarm on any `false`, turns the chain from a nice idea into a control.

### What goes in the payload? [2]

An auditor in five years asks: "Show me exactly what the engineer saw when they signed off TRC-101-L03." List what the sign-off audit event (and related data) must contain to answer that, given that templates, user names and lot descriptions may all have changed since.

#### Solution

At signing time, record: the sign-off id, lot checklist id, **template id and version**, lot code and description *as text*, project code and name, the signer's user id, **name and role at the time**, the signer role required, and server timestamp. Plus a **snapshot of each item's current response** (prompt text, result or measurement, the response id, notes, and photo ids with their SHA-256 hashes), or a hash of that snapshot with the snapshot stored alongside. Also the request id, client app version and IP or device id. The principle: the event must be readable on its own, without joining to tables whose rows may have changed. Referenced photos must still exist (retention) and match their stored hashes.

## Say it aloud

"How would you make inspection records trustworthy for years, for disputes and audits?"

#### Model answer

I'd treat the records as append-only facts. Responses are never updated, since a re-inspection is a new row, and sign-offs are signed once, with corrections recorded as new events like a revocation with a reason, never as edits. Every significant action writes an audit event in the same transaction as the change: who, with their role at the time, what, when in server time, and a payload snapshot of what they saw, like the template version, the prompts and the results. That way the record still reads correctly after templates or names change. I'd enforce immutability in the database, revoking update and delete from the app's role and adding a trigger that rejects them, so a bug can't rewrite history. For tamper evidence I'd hash-chain the events and verify the chain nightly with an alarm, and periodically export digests to write-once storage like S3 Object Lock. Photos get a SHA-256 hash at upload and live in a versioned bucket with retention rules. Things like retention periods and privacy deletion requests I'd flag as policy decisions for the business, rather than guessing in code.
