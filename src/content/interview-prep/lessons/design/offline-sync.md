## Explanation

**The case:** *"Inspectors fill in checklists in basements, tunnels and rural sites with no reception. Design offline capture with sync and conflict handling."* It's the most construction-specific design question there is.

**Why it's hard.** The device is the source of truth for minutes or days, several people may touch the same lot while disconnected, retries are guaranteed, phone clocks drift, and losing or silently overwriting a quality record is unacceptable.

**The key design move: make the data append-only where you can.** In the course schema, `responses` are never updated. A re-inspection adds a row, and the current state is the latest row. That choice dissolves most conflicts: two inspectors offline on the same item produce *two responses*, both kept, ordered by when they happened. There's nothing to overwrite. Conflicts then only arise for genuinely mutable things (a lot's description, an assignee, a checklist's status), and those can use simpler rules or be server-only.

**Client side:**

- **Local storage**: IndexedDB in a web app (or SQLite in a native or React Native app). Store the checklist definition and current state for assigned lots, plus an **outbox** of pending operations.
- **Write locally first**, update the UI immediately (optimistic), and append an operation to the outbox: `{ opId: uuid, type: "addResponse", lotChecklistId, itemId, result, notes, capturedAt, deviceId }`. The `opId` is generated *once per user action* and is the idempotency key for every retry.
- **Photos** go into the outbox as blobs (see the photo-upload case). They're large, so upload them separately from the small data operations.
- **Sync triggers**: on app open, when the `online` event fires, periodically while open, and from a manual "Sync now" button. Don't depend on background sync. MDN marks the Background Synchronization API as limited availability (not Baseline), so it isn't available everywhere.
- **Show sync state** honestly: "3 changes waiting to upload". Site teams need to know before they leave site whether their records are safe. That's a real-world requirement you can speak to.

**Server side:**

- `POST /sync` accepts a batch of operations and processes each **idempotently**: insert with `ON CONFLICT (op_id) DO NOTHING` (the `idempotency_key` pattern from the AWS lessons). It returns a per-operation result (`applied`, `duplicate`, `rejected` with a reason), so the client can clear its outbox precisely.
- **Validation still happens on the server**: tenant and permission checks, the checklist still exists, it's not already signed off. A response submitted offline to a checklist that was signed off while the device was disconnected is a *business conflict*. Accept it as a late record flagged for review, or reject it with a visible reason. Ask the interviewer which they'd prefer. Never drop it silently.
- **Pull changes**: `GET /sync?since=<cursor>` returns everything that changed for the user's assigned lots since their last cursor (a server-generated, monotonically increasing value such as a sequence or `updated_at` with id tie-break, never the device's clock).

**Ordering and time.** Record both `captured_at` (device time, for display and audit, since it's when the inspector stood there) and `received_at` (server time, for ordering and sync cursors). Device clocks can be wrong. Ordering *security-relevant* events by device time lets a wrong clock rewrite history.

**For mutable fields**, choose per field: last-writer-wins with server versions (the client sends the version it edited, the server rejects stale versions with a 409, and the client shows a merge prompt); server-only edits (only the office edits lot descriptions); or field-level merge.

**What to say about scope:** v1 can be "offline capture of responses and photos, sign-off requires connectivity". That covers most of the value with a fraction of the conflict surface.

## Worked example

The sync endpoint's core. Each operation is applied at most once, and stale or invalid operations are reported, not dropped. Against the course schema, with an `op_id` column added to `responses`:

```sql
ALTER TABLE responses ADD COLUMN op_id uuid UNIQUE;
ALTER TABLE responses ADD COLUMN captured_at timestamptz;

-- one operation from a device's outbox: applied once, however many times it arrives
WITH op AS (
  SELECT '6b0f7c1e-3a7d-4a43-9a51-1c2f3e4d5a6b'::uuid AS op_id,
         1::bigint AS lot_checklist_id, 1::bigint AS checklist_item_id,
         'pass'::text AS result, 4::bigint AS responded_by,
         now() - interval '2 days' AS captured_at
),
ins AS (
  INSERT INTO responses (op_id, lot_checklist_id, checklist_item_id, result, responded_by, responded_at, captured_at)
  SELECT op_id, lot_checklist_id, checklist_item_id, result, responded_by, now(), captured_at
  FROM op
  WHERE NOT EXISTS (  -- business rule: no new responses once every sign-off on the checklist is signed
    SELECT 1 FROM sign_offs s
    WHERE s.lot_checklist_id = op.lot_checklist_id
    GROUP BY s.lot_checklist_id
    HAVING bool_and(s.signed_at IS NOT NULL)
  )
  ON CONFLICT (op_id) DO NOTHING
  RETURNING op_id
)
SELECT op.op_id,
       CASE
         WHEN EXISTS (SELECT 1 FROM ins) THEN 'applied'
         WHEN EXISTS (SELECT 1 FROM responses r WHERE r.op_id = op.op_id) THEN 'duplicate'
         ELSE 'rejected: checklist already signed off'
       END AS outcome
FROM op;
```

Checklist 1 in the seed is already fully signed off, so this returns `rejected: checklist already signed off`. That's the "late record" business conflict, reported back to the device rather than silently dropped. Change `lot_checklist_id` to a checklist with an open sign-off, and the first run returns `applied`, the second `duplicate`. `responded_at` is server time and `captured_at` is the device's.

## Exercises

### Prove applied, then duplicate [2]

Using the block above, find a lot checklist whose sign-offs are *not* all signed, then run the operation twice in one transaction and show the outcomes are `applied` then `duplicate`, with exactly one row inserted.

#### Solution

```sql
ALTER TABLE responses ADD COLUMN op_id uuid UNIQUE;
ALTER TABLE responses ADD COLUMN captured_at timestamptz;

CREATE TEMP TABLE outcomes (run int, outcome text);

-- pick an open checklist: one with an unsigned sign-off
CREATE TEMP TABLE target AS
SELECT min(lot_checklist_id) AS lot_checklist_id FROM sign_offs WHERE signed_at IS NULL;

WITH op AS (
  SELECT '0d9c4b8a-1111-4c2b-9e3f-aaaaaaaaaaaa'::uuid AS op_id, t.lot_checklist_id,
         (SELECT ci.id FROM lot_checklists lc JOIN checklist_items ci ON ci.template_id = lc.template_id
          WHERE lc.id = t.lot_checklist_id ORDER BY ci.position LIMIT 1) AS checklist_item_id
  FROM target t
),
ins AS (
  INSERT INTO responses (op_id, lot_checklist_id, checklist_item_id, result, responded_by, captured_at)
  SELECT op_id, lot_checklist_id, checklist_item_id, 'pass', 4, now() FROM op
  ON CONFLICT (op_id) DO NOTHING
  RETURNING op_id
)
INSERT INTO outcomes
SELECT 1, CASE WHEN EXISTS (SELECT 1 FROM ins) THEN 'applied' ELSE 'duplicate' END;

WITH op AS (
  SELECT '0d9c4b8a-1111-4c2b-9e3f-aaaaaaaaaaaa'::uuid AS op_id, t.lot_checklist_id,
         (SELECT ci.id FROM lot_checklists lc JOIN checklist_items ci ON ci.template_id = lc.template_id
          WHERE lc.id = t.lot_checklist_id ORDER BY ci.position LIMIT 1) AS checklist_item_id
  FROM target t
),
ins AS (
  INSERT INTO responses (op_id, lot_checklist_id, checklist_item_id, result, responded_by, captured_at)
  SELECT op_id, lot_checklist_id, checklist_item_id, 'pass', 4, now() FROM op
  ON CONFLICT (op_id) DO NOTHING
  RETURNING op_id
)
INSERT INTO outcomes
SELECT 2, CASE WHEN EXISTS (SELECT 1 FROM ins) THEN 'applied' ELSE 'duplicate' END;

SELECT o.run, o.outcome,
       (SELECT count(*) FROM responses WHERE op_id = '0d9c4b8a-1111-4c2b-9e3f-aaaaaaaaaaaa') AS rows_with_op
FROM outcomes o ORDER BY o.run;
```

Two runs, one row. (A data-modifying CTE has to sit at the top level of the statement, hence `WITH … INSERT INTO outcomes SELECT …` rather than `INSERT INTO outcomes WITH …`.) The device can safely retry a whole batch after a timeout without knowing which operations got through.

### Conflict policy per entity [2]

For each, choose a conflict strategy and justify it: (a) checklist item responses; (b) a lot's location text; (c) the assignee of a checklist; (d) a sign-off.

#### Solution

(a) **Append-only**, so there's no conflict. Keep both and order by `captured_at` for display. The latest by `received_at` (or captured, which is a product choice to raise) is the current state. Every observation is evidence. (b) **Last-writer-wins with server versions**: the client sends `If-Match: version`, and a stale edit gets a 409 with the current value to merge. Low stakes, rarely contested. (c) **Server-authoritative**: only allow when online, or accept offline but re-validate permissions on sync, rejecting with a visible message if someone else reassigned it. (d) **Online-only** in v1. It's a deliberate legal act, so the signer should see the current state when signing. If offline signing is required later, record it as a *signed intent* that the server validates and can reject (because new failures arrived), never as an automatic overwrite.

### What the user sees [1]

Describe three UI states the foreman needs to see for offline work, and why each matters on site.

#### Solution

1. **"Saved on this device, waiting to upload (3)"**: so they don't leave site thinking records are safe in the office when they're only on the phone. A lost or broken phone means lost evidence.
2. **"Uploading photos 4 of 12"** with progress: photos are the slow part, and people need to know whether to stay near the site office's Wi-Fi.
3. **"1 change needs attention: checklist was signed off before your response arrived"**: a rejected or conflicting operation needs a clear explanation and a next step (contact the engineer, or re-raise as a defect), not a silent disappearance.

## Say it aloud

"How would you design offline checklist capture for sites with no reception?"

#### Model answer

I'd start by making the data model friendly to offline work. Responses are append-only, so a re-inspection adds a new row and the latest wins. Then two inspectors working offline on the same item just produce two records rather than a conflict. On the device, the assigned checklists are cached in IndexedDB or SQLite, every action writes locally first, and an outbox records operations, each with a UUID generated once per user action. Sync happens when the app opens, when connectivity returns and on demand, because background sync isn't supported everywhere. The server processes each operation idempotently using that UUID with a unique constraint, so retries are safe, and it returns a per-operation result. It still enforces business rules, so a response that arrives after the checklist was signed off is rejected or flagged with a reason, never silently dropped. I keep device time as captured-at for the record, but use server time and server cursors for ordering and pulling changes, because phone clocks drift. Photos go up separately via presigned URLs. For v1 I'd keep sign-off online-only, since it's a deliberate act. And the UI must show clearly what's still only on the phone, because on site that's what people actually worry about.
