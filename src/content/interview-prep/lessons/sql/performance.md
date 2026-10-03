## Explanation

**Firestore made indexes mandatory and automatic.** Every query needed an index, single-field ones were created for you, and a missing composite index was an error with a link to create it. Postgres is the opposite: *any* query runs, indexed or not. A missing index doesn't throw. The query just gets slower as the table grows.

**What an index is.** A B-tree index is a sorted copy of one or more columns, each entry pointing at its row. It makes `=`, ranges (`<`, `BETWEEN`), `ORDER BY` and prefix `LIKE 'abc%'` fast. Each index costs some write speed and disk, so add them for real queries.

**Where indexes belong:**

- **Primary keys and UNIQUE constraints** get one automatically.
- **Foreign key columns do NOT** get one automatically. That surprises people. `lot_checklists.lot_id`, `responses.lot_checklist_id` and friends are joined on constantly. Index them once a table is more than trivially small. (The seed leaves them off deliberately so you can see the difference.)
- **Columns you filter or sort on in hot queries**, especially together.
- **Composite indexes** (`(a, b, c)`) serve queries that filter on a *leading prefix*: `a`, or `a and b`, or `a and b` plus sorting by `c`. Not `b` alone. Order columns by "equality filters first, then range or sort".
- **Partial indexes** (`… WHERE signed_at IS NULL`) index only the rows a query cares about. They're small and fast, and ideal for "outstanding" queues.
- **Expression indexes** (`(lower(email))`) match queries that filter on the same expression.

**Low selectivity loses.** If a filter matches a large fraction of the table (say `result = 'pass'`), reading the whole table sequentially is cheaper than bouncing through an index, and the planner will (correctly) ignore your index.

**Reading `EXPLAIN ANALYZE`.** `EXPLAIN` shows the plan. `EXPLAIN ANALYZE` *runs* the query and adds real timings, so be careful with `UPDATE`/`DELETE` (wrap them in `BEGIN … ROLLBACK`). Read it from the most indented line outwards. What to look for:

| You see | It means |
| --- | --- |
| `Seq Scan` on a big table with `Rows Removed by Filter` in the hundreds of thousands | Reading everything to keep a few: a likely missing index |
| `Index Scan` / `Index Only Scan` | Using an index. Index Only means the table wasn't touched at all |
| `Bitmap Index Scan` → `Bitmap Heap Scan` | Index used to collect many matching rows, then fetch them in disk order |
| `rows=` estimate far from `actual … rows=` | Stale statistics or a hard-to-estimate filter. Try `ANALYZE table` |
| `Nested Loop` with large `loops=` | The inner side runs once per outer row: fine if it's an index lookup, bad if it's a scan |
| `Sort` with `external merge Disk` | The sort spilled to disk: an index matching the `ORDER BY` can remove it |

On tiny tables the planner picks sequential scans because they genuinely are faster. To test whether an index *can* be used, `SET enable_seqscan = off;` for your session, then `RESET enable_seqscan;`.

**The N+1 problem.** You load a list (1 query), then load something for each item (N queries). Twenty lots means 21 round trips. Each is fast, but the latency adds up, and it's the classic cause of "the page is slow but every query is fast". It's easy to write by accident in a loop with `await` inside, and ORMs do it silently with lazy-loaded relations. Fixes: one query with a `JOIN` (optionally `json_agg` to build nested results), or a second query that fetches all the children at once with `WHERE lot_id = ANY($1)`. In Postgres, one bigger query almost always beats N small ones.

Reference: [Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html), [indexes](https://www.postgresql.org/docs/current/indexes.html), [CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html).

## Worked example

The seed is too small for indexes to matter, so make a 110,000-row copy of `responses`: 400 copies, each with its own range of checklist ids. This block deliberately *keeps* the table, and the exercises below use it. (Reloading the seed doesn't drop it. `DROP TABLE responses_big;` when you're done.)

```sql keep
CREATE TABLE responses_big AS
SELECT row_number() OVER () AS id,
       r.lot_checklist_id + 1000 * (g - 1) AS lot_checklist_id,
       r.checklist_item_id, r.result, r.measured_value, r.notes, r.responded_by,
       r.responded_at - (g || ' minutes')::interval AS responded_at
FROM responses r, generate_series(1, 400) g;

ANALYZE responses_big;
```

Find one checklist's responses:

```sql
EXPLAIN ANALYZE
SELECT * FROM responses_big WHERE lot_checklist_id = 18042;
```

Without an index (your numbers will differ). This is PostgreSQL 18 output, trimmed: 18 also prints `Buffers:` and `Planning` lines by default, and older versions print whole numbers for `rows`.

```text
Seq Scan on responses_big  (cost=0.00..2527.00 rows=6 width=77) (actual time=1.039..20.290 rows=2.00 loops=1)
  Filter: (lot_checklist_id = 18042)
  Rows Removed by Filter: 109998
Execution Time: 20.476 ms
```

It read all 110,000 rows to return 2. Index the foreign key and re-run:

```sql
CREATE INDEX responses_big_checklist_idx ON responses_big (lot_checklist_id);

EXPLAIN ANALYZE
SELECT * FROM responses_big WHERE lot_checklist_id = 18042;
```

```text
Index Scan using responses_big_checklist_idx on responses_big  (cost=0.29..8.40 rows=6 width=77) (actual time=0.171..0.180 rows=2.00 loops=1)
  Index Cond: (lot_checklist_id = 18042)
Execution Time: 0.234 ms
```

That's about 100× faster, and the gap grows with the table. Now try a low-selectivity filter. About 11% of rows are fails, so the planner reads the whole table even if you index `result`:

```sql
EXPLAIN ANALYZE
SELECT count(*) FROM responses_big WHERE result = 'fail';
```

Know why that's *correct* behaviour. Interviewers like asking "why isn't Postgres using my index?"

## Exercises

### Index the foreign keys [1]

Write `CREATE INDEX` statements for the foreign-key columns the course's queries join on most: `lots.project_id`, `lot_checklists.lot_id`, `responses.lot_checklist_id` and `sign_offs.lot_checklist_id`. Then show that Postgres *can* use the `lots` one, even though it won't choose to on such a small table.

#### Solution

```sql
CREATE INDEX lots_project_id_idx              ON lots (project_id);
CREATE INDEX lot_checklists_lot_id_idx        ON lot_checklists (lot_id);
CREATE INDEX responses_lot_checklist_id_idx   ON responses (lot_checklist_id);
CREATE INDEX sign_offs_lot_checklist_id_idx   ON sign_offs (lot_checklist_id);

SET enable_seqscan = off;
EXPLAIN SELECT * FROM lots WHERE project_id = 1;
RESET enable_seqscan;
```

On a live production table use `CREATE INDEX CONCURRENTLY`. It doesn't block writes while it builds, but it can't run inside a transaction, so migration tools need it flagged.

### A case-insensitive search [2]

Users search response notes by prefix, case-insensitively, for example notes starting with "pressure". Write the query against `responses_big`, add an index that makes it use an index scan, and confirm with `EXPLAIN ANALYZE`.

#### Solution

```sql
CREATE INDEX responses_big_notes_lower_idx
  ON responses_big (lower(notes) text_pattern_ops);

EXPLAIN ANALYZE
SELECT * FROM responses_big WHERE lower(notes) LIKE 'pressure%';
```

You should see a `Bitmap Index Scan on responses_big_notes_lower_idx` with an `Index Cond` that turned the prefix into a range (`~>=~ 'pressure' AND ~<~ 'pressurf'`). Two details: the index is on the *expression* `lower(notes)`, so the query must use the same expression; and `text_pattern_ops` lets a B-tree serve `LIKE 'prefix%'` when the database's collation isn't `C` (most installs aren't). Searching *inside* text (`'%leak%'`) needs a trigram index (`pg_trgm`) or full-text search instead.

### The outstanding sign-offs queue [2]

The dashboard runs *"sign-offs requested more than seven days ago that still aren't signed"* constantly. Write the query, then design the smallest index that serves it, and say why it's small.

#### Solution

```sql
SELECT s.id, s.lot_checklist_id, s.signer_role, s.requested_at
FROM sign_offs s
WHERE s.signed_at IS NULL
  AND s.requested_at < now() - interval '7 days'
ORDER BY s.requested_at;

CREATE INDEX sign_offs_outstanding_idx
  ON sign_offs (requested_at)
  WHERE signed_at IS NULL;

SET enable_seqscan = off;
EXPLAIN SELECT id FROM sign_offs
WHERE signed_at IS NULL AND requested_at < now() - interval '7 days';
RESET enable_seqscan;
```

It's a **partial index**: only unsigned rows are in it, and most sign-offs get signed, so it stays tiny no matter how much history accumulates. On a 108,000-row test copy with 2% unsigned, the partial index was 56 kB against 992 kB for a full index on `requested_at`. The query's `WHERE signed_at IS NULL` must match the index's predicate for the planner to use it. It's sorted by `requested_at`, so the `ORDER BY` is free too.

### Kill an N+1 [3]

An API handler does this:

```ts norun
const lots = await db.query("SELECT id, code FROM lots WHERE project_id = $1", [projectId])
for (const lot of lots.rows) {
  lot.checklists = (await db.query(
    "SELECT lc.id, t.name FROM lot_checklists lc JOIN checklist_templates t ON t.id = lc.template_id WHERE lc.lot_id = $1",
    [lot.id],
  )).rows
}
```

For project 1 that's 13 queries. Rewrite it as **one** SQL query returning one row per lot, with its checklists as a JSON array (`[{ "id": …, "template": … }]`). Lots with no checklists should get `[]`.

#### Solution

```sql
SELECT l.id, l.code,
       coalesce(
         json_agg(json_build_object('id', lc.id, 'template', t.name) ORDER BY lc.id)
           FILTER (WHERE lc.id IS NOT NULL),
         '[]'
       ) AS checklists
FROM lots l
LEFT JOIN lot_checklists lc     ON lc.lot_id = l.id
LEFT JOIN checklist_templates t ON t.id = lc.template_id
WHERE l.project_id = 1
GROUP BY l.id, l.code
ORDER BY l.code;
```

`json_agg` builds the nested shape you'd have stored as a Firestore document, but at read time from normalised tables. `FILTER (WHERE lc.id IS NOT NULL)` avoids `[{"id": null, …}]` for lots without checklists, and `coalesce(…, '[]')` turns the resulting NULL into an empty array. The two-query alternative (all lots, then `WHERE lot_id = ANY($1)` for all their checklists, grouped in TypeScript) is just as valid, and often clearer when the child rows are wide.

## Say it aloud

"A page that lists a project's lots got slow in production but is fast locally. How would you investigate?"

#### Model answer

First I'd find out where the time actually goes, rather than guessing. I'd check the request logs or APM trace to see if it's one slow query or many fast ones. Many fast ones means an N+1, which is very common in list pages: one query for the lots, then one per lot for its checklists. The fix there is a join with json_agg, or a single second query using ANY on the list of ids. If it's one slow query, I'd take it with production-like parameters and run EXPLAIN ANALYZE against a copy of production data, because local data is too small to show the problem. Locally Postgres sensibly does sequential scans. In the plan I look for sequential scans on big tables with lots of rows removed by the filter, nested loops with a high loop count, sorts spilling to disk, and estimates that are way off actuals. Usually the cause is a missing index on a foreign key or filter column, since Postgres doesn't index foreign keys automatically. I'd add an index that matches the filter and sort order, possibly composite or partial, create it CONCURRENTLY in production, and confirm the plan changed and the timing improved.
