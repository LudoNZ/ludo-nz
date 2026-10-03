## Explanation

**Constraints are business rules the database enforces for you.** In Firestore, rules like "a sign-off must have a signer and a time" lived in security rules or Cloud Functions, and any code path that skipped them could write bad data. In Postgres you declare them once on the table, and *every* writer (your API, a migration, someone in psql at 2am) is held to them.

| Constraint | Use it for | Example in the seed |
| --- | --- | --- |
| `NOT NULL` | Required fields | `lots.code` |
| `PRIMARY KEY` | Identity (implies unique + not null) | `id bigint GENERATED … AS IDENTITY` |
| `FOREIGN KEY` | The row it points at must exist | `lots.project_id REFERENCES projects (id)` |
| `UNIQUE` | No duplicates, often across several columns | `UNIQUE (project_id, code)`: lot codes are unique *within* a project |
| `CHECK` | A rule about one row's own values | `CHECK ((signed_by IS NULL) = (signed_at IS NULL))` |
| Partial unique index | Unique among a subset | "only one active version per template name" |

Foreign keys take an `ON DELETE` action: `NO ACTION`/`RESTRICT` (the default: refuse), `CASCADE` (delete children too: fine for `project_members`, dangerous for QA records), `SET NULL`. For an audit-heavy domain like QA, the default "refuse" plus soft deletes is usually right. You don't want deleting a user to cascade away their inspection history.

**Many-to-many** relationships get a junction table whose primary key is the pair: `project_members (project_id, user_id, member_role)`. Columns about the *relationship* (role on this project, date added) live there. It's the relational version of keeping an array of user IDs on a project document plus an array of project IDs on each user, without the two going out of sync.

**Migrations** are versioned, ordered SQL files (or code that generates SQL) checked into the repo. A tool records which ones have run in a table in the database. Popular choices in TypeScript land: [node-pg-migrate](https://github.com/salsita/node-pg-migrate), Knex/Kysely migrations, Prisma Migrate, Drizzle Kit. Principles that matter more than the tool:

- **Never edit a migration that has run anywhere shared.** Write a new one.
- **Postgres DDL is transactional**, so a failed migration rolls back cleanly. (Exception: `CREATE INDEX CONCURRENTLY` can't run in a transaction.)
- **Zero-downtime changes use expand/contract.** With continuous delivery, old and new code run at the same time during a deploy. To rename a column: *expand* (add the new column, write to both, backfill), deploy code that reads the new one, then *contract* (drop the old one) in a later release. Adding a `NOT NULL` column to a big table: add it nullable, backfill in batches, then add the constraint.

**Transactions** make several statements all-or-nothing: `BEGIN; … COMMIT;` (or `ROLLBACK;`). Signing off a checklist might update a sign-off, insert an audit row and close the lot. Either all of that happens or none of it does. This is Firestore's `runTransaction`, minus the automatic retries and the read-before-write restrictions.

**Isolation basics.** Postgres's default level is **Read Committed**: each *statement* sees data committed before it started. That's fine for most work, but it allows a **lost update**. Two people read "2 approvals", both write "3", and one approval disappears. Three fixes, from simplest:

1. **Do it in one statement**: `UPDATE t SET n = n + 1`, or a conditional update `UPDATE sign_offs SET … WHERE id = $1 AND signed_at IS NULL`. The row lock taken by `UPDATE` serialises concurrent writers, and the `WHERE` re-check means the second one updates 0 rows.
2. **Lock what you read**: `SELECT … FOR UPDATE` inside the transaction, then decide and write.
3. **`SERIALIZABLE`** isolation: Postgres detects anomalies and aborts one transaction with a serialization failure, which your code must retry. This is the closest to Firestore's optimistic transactions.

Reference: [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).

## Worked example

**Rule:** a company may have many versions of a template, but only **one active** version per name. A plain `UNIQUE (company_id, name)` is wrong because it would forbid old versions. A partial unique index says exactly what we mean:

```sql
CREATE UNIQUE INDEX one_active_template_version
  ON checklist_templates (company_id, name)
  WHERE is_active;
```

Now try to activate the old v1 pre-pour template for Totara Ridge, while v2 is active:

```sql error
CREATE UNIQUE INDEX one_active_template_version
  ON checklist_templates (company_id, name)
  WHERE is_active;

UPDATE checklist_templates SET is_active = true WHERE id = 1;
```

Postgres rejects it with `duplicate key value violates unique constraint "one_active_template_version"`. To publish a new version properly, do both changes in one transaction:

```sql fresh
CREATE UNIQUE INDEX one_active_template_version
  ON checklist_templates (company_id, name)
  WHERE is_active;

BEGIN;
UPDATE checklist_templates SET is_active = false
WHERE company_id = 1 AND name = 'Pre-pour concrete inspection' AND is_active;

INSERT INTO checklist_templates (company_id, name, version, is_active)
SELECT 1, 'Pre-pour concrete inspection', max(version) + 1, true
FROM checklist_templates
WHERE company_id = 1 AND name = 'Pre-pour concrete inspection'
RETURNING id, version;
COMMIT;
```

The order matters: deactivate first, then insert, because unique indexes are checked per statement. If the insert failed, the transaction would roll back the deactivation too, and the company would never be left with no active template.

## Exercises

### A CHECK constraint [1]

A response should never have both a pass/fail `result` *and* a `measured_value`. Add a CHECK constraint enforcing that, then show it rejects a bad insert.

#### Solution

```sql error
ALTER TABLE responses
  ADD CONSTRAINT result_or_measurement
  CHECK (result IS NULL OR measured_value IS NULL);

INSERT INTO responses (lot_checklist_id, checklist_item_id, result, measured_value, responded_by)
VALUES (1, 3, 'pass', 55, 3);
```

`ALTER TABLE … ADD CONSTRAINT` validates every existing row first, so it fails if old data already breaks the rule. On a big table you can add it `NOT VALID` (new rows only) and run `VALIDATE CONSTRAINT` later. A rule that spans tables ("measured_value only for measurement items") can't be a CHECK. It needs a trigger or application logic. Say that in an interview.

### People on several projects [1]

Using the junction table, list users who are members of more than one project, with the project codes as one comma-separated string.

#### Solution

```sql
SELECT u.full_name,
       count(*) AS projects,
       string_agg(p.code, ', ' ORDER BY p.code) AS project_codes
FROM project_members pm
JOIN users u    ON u.id = pm.user_id
JOIN projects p ON p.id = pm.project_id
GROUP BY u.id, u.full_name
HAVING count(*) > 1
ORDER BY projects DESC, u.full_name;
```

### Model trades on templates [2]

Templates should be tagged with one or more trades (concrete, carpentry, plumbing, waterproofing, civil), and a trade applies to many templates. Create the tables, tag Totara Ridge's waterproofing template with `waterproofing`, and make tagging the same pair twice impossible.

#### Solution

```sql
CREATE TABLE trades (
  id   bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE template_trades (
  template_id bigint NOT NULL REFERENCES checklist_templates (id) ON DELETE CASCADE,
  trade_id    bigint NOT NULL REFERENCES trades (id),
  PRIMARY KEY (template_id, trade_id)
);

INSERT INTO trades (name)
VALUES ('concrete'), ('carpentry'), ('plumbing'), ('waterproofing'), ('civil');

INSERT INTO template_trades (template_id, trade_id)
SELECT t.id, tr.id
FROM checklist_templates t, trades tr
WHERE t.company_id = 1 AND t.name = 'Waterproofing membrane' AND tr.name = 'waterproofing';

SELECT t.name, tr.name AS trade
FROM template_trades tt
JOIN checklist_templates t ON t.id = tt.template_id
JOIN trades tr            ON tr.id = tt.trade_id;
```

The composite primary key is what stops duplicates. `ON DELETE CASCADE` is right *here*: a tag means nothing without its template. `INSERT … SELECT` looks the IDs up by name instead of hard-coding them.

### An expand-style migration [2]

Product wants `lot_checklists.signed_off_at`: the moment the checklist's last required sign-off was signed. Write a migration that adds the column and backfills it from `sign_offs` for checklists that are fully signed off. Make it safe to deploy while the old code is still running.

#### Solution

```sql fresh
BEGIN;

ALTER TABLE lot_checklists ADD COLUMN signed_off_at timestamptz;

UPDATE lot_checklists lc
SET signed_off_at = s.last_signed
FROM (
  SELECT lot_checklist_id, max(signed_at) AS last_signed
  FROM sign_offs
  GROUP BY lot_checklist_id
  HAVING bool_and(signed_at IS NOT NULL)
) s
WHERE s.lot_checklist_id = lc.id;

COMMIT;

SELECT count(*) FILTER (WHERE signed_off_at IS NOT NULL) AS signed_off,
       count(*) AS total
FROM lot_checklists;
```

It's nullable, has no default and no constraint yet, so old code that doesn't know about it keeps working. Next, deploy code that maintains the column inside the same transaction as each sign-off. Only after that would you consider a constraint. This is a denormalisation (it duplicates what `sign_offs` already says), so mention why it's worth it, such as a fast "signed off this week" dashboard, and who keeps it in sync. On a very large table you'd backfill in batches instead of one big `UPDATE`.

### Sign off without a lost update [3]

Two engineers open the same sign-off request and both press "Sign". Write the single statement your API should run so that exactly one of them succeeds, and the other can be told "already signed by X". Use sign-off request id 1 and user 3. It must also refuse to sign if any of the checklist's items currently has a failing latest response.

#### Solution

```sql
UPDATE sign_offs s
SET signed_by = 3, signed_at = now()
WHERE s.id = (SELECT min(id) FROM sign_offs WHERE signed_at IS NULL)
  AND s.signed_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT ON (r.checklist_item_id) r.result
      FROM responses r
      WHERE r.lot_checklist_id = s.lot_checklist_id
      ORDER BY r.checklist_item_id, r.responded_at DESC, r.id DESC
    ) latest
    WHERE latest.result = 'fail'
  )
RETURNING s.id, s.lot_checklist_id, s.signed_at;
```

(The `min(id)` subquery just picks an open request so the example runs against the seed. In the API it's `WHERE s.id = $1`.)

How it works: `UPDATE` locks the row. The second concurrent request waits, then re-checks `signed_at IS NULL` against the newly committed row, finds it false, and updates **0 rows**. Your code treats "0 rows returned" as a conflict: re-select the row to report who signed it. No read-then-write gap means no lost update, and you don't need `SERIALIZABLE`. The `NOT EXISTS` makes the business rule part of the same atomic check.

## Say it aloud

"What's a database transaction, and what isolation level does Postgres use by default? Describe a concurrency bug that can still happen and how you'd prevent it."

#### Model answer

A transaction groups statements so they all commit or none do. If I sign off a checklist, write an audit row and close the lot, a failure halfway can't leave a half-signed state. Postgres defaults to Read Committed, where each statement sees whatever was committed before it started. That still allows a lost update. Two requests both read a sign-off as unsigned, both decide to sign, and the second write silently overwrites the first. Or two people increment a counter they read in application code. My first fix is to make the check and the write one statement: a conditional UPDATE with `WHERE signed_at IS NULL ... RETURNING`. The row lock serialises the writers, and the loser updates zero rows, which I turn into a "someone already signed this" response. If the decision needs several reads, I'd lock with SELECT FOR UPDATE inside the transaction. For complex invariants I'd use SERIALIZABLE with a retry loop on serialization failures, which is close to how Firestore transactions retry automatically. And constraints back all of it up: a unique or check constraint is the last line of defence when application logic gets it wrong.
