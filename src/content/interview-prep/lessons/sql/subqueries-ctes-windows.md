## Explanation

Three tools for questions that don't fit one flat `GROUP BY`.

**Subqueries** are queries inside queries. Three shapes:

- **Scalar**, returning one value: `WHERE measured_value > (SELECT avg(measured_value) FROM responses)`.
- **Set**, used with `IN` / `EXISTS`: `WHERE lot_id IN (SELECT …)`.
- **Correlated**, which refers to the outer row: `WHERE EXISTS (SELECT 1 FROM sign_offs s WHERE s.lot_checklist_id = lc.id AND s.signed_at IS NULL)`. Read it as "for each outer row, check…". Postgres usually turns these into joins, so they're not automatically slow.

**CTEs** (`WITH name AS (…)`) give a subquery a name so you can build a query in steps, like assigning intermediate variables in TypeScript. They're the single best tool for live-coding SQL: write step one, run it, check the rows, then add step two on top. Since Postgres 12, a CTE that's referenced once is inlined into the main query, so there's no performance penalty for the readability. `WITH RECURSIVE` walks hierarchies (for example, a tree of locations), which is good to know exists.

**Window functions** compute across related rows *without collapsing them*. `GROUP BY` turns many rows into one. A window keeps every row and adds a column computed over its "window" of related rows.

```sql norun
function_name(...) OVER (PARTITION BY <group> ORDER BY <order> [frame])
```

- `PARTITION BY` is like `GROUP BY` for the window: which rows are related.
- `ORDER BY` inside `OVER` gives the order within each partition.
- Ranking: `row_number()` (1, 2, 3, never ties), `rank()` (1, 1, 3), `dense_rank()` (1, 1, 2).
- Offsets: `lag(col)` / `lead(col)` read the previous or next row's value, which is great for "time since the last inspection".
- Running totals: `sum(x) OVER (PARTITION BY … ORDER BY …)`.
- Any aggregate works as a window: `count(*) OVER (PARTITION BY project_id)` puts the project total on every row.

Windows are evaluated after `WHERE`/`GROUP BY`/`HAVING`, so you can't filter on them directly. Wrap the query in a CTE and filter outside.

**Latest row per group.** This is the pattern you'll use most, and it's very likely in an interview. Responses here are append-only, so "the current state of each item" means "the latest response per (checklist, item)". Two standard solutions:

1. **`row_number()`** (portable, works in any SQL database):
   `row_number() OVER (PARTITION BY lot_checklist_id, checklist_item_id ORDER BY responded_at DESC, id DESC)`, then keep `rn = 1`.
2. **`DISTINCT ON`** (Postgres only, shorter): `SELECT DISTINCT ON (a, b) … ORDER BY a, b, responded_at DESC` keeps the first row of each `(a, b)` group in that order.

Always add a tie-breaker (`id DESC`), because two rows with the same timestamp otherwise give a non-deterministic answer. Say that out loud in an interview. It's the detail that marks you as careful.

**Firestore comparison:** in Firestore you'd have stored `currentResult` on the item document and kept it updated. Here the history *is* the data, and "current" is a query. If that query becomes hot, a view (`CREATE VIEW current_responses AS …`) gives it a name, and a denormalised column is the later optimisation.

Reference: [WITH queries](https://www.postgresql.org/docs/current/queries-with.html), [window functions tutorial](https://www.postgresql.org/docs/current/tutorial-window.html), [DISTINCT ON](https://www.postgresql.org/docs/current/sql-select.html#SQL-DISTINCT).

## Worked example

**Question:** which checklist items are *currently failing*? That means their latest response is a fail, even if an earlier one passed, or an earlier fail has since been fixed.

Step 1. Rank each item's responses, newest first, and look at the rows:

```sql
SELECT r.lot_checklist_id, r.checklist_item_id, r.result, r.responded_at,
       row_number() OVER (
         PARTITION BY r.lot_checklist_id, r.checklist_item_id
         ORDER BY r.responded_at DESC, r.id DESC
       ) AS rn
FROM responses r
ORDER BY r.lot_checklist_id, r.checklist_item_id, rn
LIMIT 12;
```

Step 2. Keep `rn = 1` in a CTE, filter to fails, and join out for context:

```sql
WITH latest AS (
  SELECT r.*,
         row_number() OVER (
           PARTITION BY r.lot_checklist_id, r.checklist_item_id
           ORDER BY r.responded_at DESC, r.id DESC
         ) AS rn
  FROM responses r
)
SELECT l.code AS lot, ci.prompt, latest.notes, latest.responded_at
FROM latest
JOIN lot_checklists lc  ON lc.id = latest.lot_checklist_id
JOIN lots l             ON l.id = lc.lot_id
JOIN checklist_items ci ON ci.id = latest.checklist_item_id
WHERE latest.rn = 1 AND latest.result = 'fail'
ORDER BY latest.responded_at;
```

The same thing with `DISTINCT ON`:

```sql
SELECT *
FROM (
  SELECT DISTINCT ON (r.lot_checklist_id, r.checklist_item_id)
         r.lot_checklist_id, r.checklist_item_id, r.result, r.notes
  FROM responses r
  ORDER BY r.lot_checklist_id, r.checklist_item_id, r.responded_at DESC, r.id DESC
) latest
WHERE latest.result = 'fail';
```

Compare with the naive `WHERE result = 'fail'`. That also returns fails that were later fixed by a re-inspection, which is exactly the bug the interviewer is fishing for.

## Exercises

### Above-average cover [1]

Using a scalar subquery, list cover-to-reinforcement readings that are above the overall average cover reading. Show lot code, reading and the average for comparison.

#### Solution

```sql
SELECT l.code, r.measured_value,
       (SELECT round(avg(r2.measured_value), 1)
        FROM responses r2
        JOIN checklist_items ci2 ON ci2.id = r2.checklist_item_id
        WHERE ci2.prompt LIKE 'Cover to reinforcement%') AS overall_avg
FROM responses r
JOIN checklist_items ci ON ci.id = r.checklist_item_id
JOIN lot_checklists lc  ON lc.id = r.lot_checklist_id
JOIN lots l             ON l.id = lc.lot_id
WHERE ci.prompt LIKE 'Cover to reinforcement%'
  AND r.measured_value > (
        SELECT avg(r2.measured_value)
        FROM responses r2
        JOIN checklist_items ci2 ON ci2.id = r2.checklist_item_id
        WHERE ci2.prompt LIKE 'Cover to reinforcement%')
ORDER BY r.measured_value DESC;
```

Repeating the subquery is ugly, and that's the cue for a CTE (`WITH avg_cover AS (…)`) or a window (`avg(measured_value) OVER ()`). Try rewriting it both ways.

### Lots with every checklist signed off [3]

A lot checklist counts as signed off when it has at least one sign-off row and none of its sign-off rows are unsigned. List lots where **every** checklist is signed off (and the lot has at least one checklist), with project code and the number of checklists.

#### Solution

```sql
WITH checklist_status AS (
  SELECT lc.id, lc.lot_id,
         count(s.id) > 0 AND bool_and(s.signed_at IS NOT NULL) AS signed_off
  FROM lot_checklists lc
  LEFT JOIN sign_offs s ON s.lot_checklist_id = lc.id
  GROUP BY lc.id, lc.lot_id
)
SELECT p.code AS project, l.code AS lot, l.description, count(*) AS checklists
FROM checklist_status cs
JOIN lots l     ON l.id = cs.lot_id
JOIN projects p ON p.id = l.project_id
GROUP BY p.code, l.id, l.code, l.description
HAVING bool_and(cs.signed_off)
ORDER BY p.code, l.code;
```

Two levels of "every": every sign-off on a checklist, then every checklist on a lot. `bool_and` is "all true". On a checklist with no sign-offs, `bool_and` over NULLs gives NULL, which is why `count(s.id) > 0` is there. The portable alternative to `bool_and` is a double `NOT EXISTS` ("there's no checklist on this lot that has no sign-off or has an unsigned one"). It's worth writing too.

### Top inspector per project [2]

For each project, find the person who recorded the most responses. Show ties if there are any.

#### Solution

```sql
WITH counts AS (
  SELECT l.project_id, r.responded_by, count(*) AS responses
  FROM responses r
  JOIN lot_checklists lc ON lc.id = r.lot_checklist_id
  JOIN lots l            ON l.id = lc.lot_id
  GROUP BY l.project_id, r.responded_by
),
ranked AS (
  SELECT counts.*, rank() OVER (PARTITION BY project_id ORDER BY responses DESC) AS rnk
  FROM counts
)
SELECT p.code, u.full_name, ranked.responses
FROM ranked
JOIN projects p ON p.id = ranked.project_id
JOIN users u    ON u.id = ranked.responded_by
WHERE rnk = 1
ORDER BY p.code;
```

`rank()` rather than `row_number()`, because the question says to show ties. Aggregate first (`GROUP BY` in a CTE), then window over the aggregates. Windows can sit on top of a `GROUP BY` in the same query, but splitting it is clearer.

### Time to fix a failure [2]

For each item that failed and was later re-inspected, show the lot code, the prompt, and how long it took from the fail to the next response, using `lead()`. Longest first.

#### Solution

```sql
WITH seq AS (
  SELECT r.*,
         lead(r.result)       OVER w AS next_result,
         lead(r.responded_at) OVER w AS next_at
  FROM responses r
  WINDOW w AS (PARTITION BY r.lot_checklist_id, r.checklist_item_id ORDER BY r.responded_at, r.id)
)
SELECT l.code, ci.prompt, seq.next_result,
       seq.next_at - seq.responded_at AS time_to_reinspect
FROM seq
JOIN lot_checklists lc  ON lc.id = seq.lot_checklist_id
JOIN lots l             ON l.id = lc.lot_id
JOIN checklist_items ci ON ci.id = seq.checklist_item_id
WHERE seq.result = 'fail' AND seq.next_at IS NOT NULL
ORDER BY time_to_reinspect DESC;
```

`WINDOW w AS (…)` names a window so you don't repeat it. Subtracting two `timestamptz` values gives an `interval`. Use `extract(epoch FROM …) / 3600` for hours as a number.

### True percentage complete per project [3]

Upgrade last lesson's "answered" percentage. An item now counts as **complete** only if its *latest* response is `pass` or `na` (for pass/fail items) or has a non-NULL `measured_value` or `notes` (for measurement and text items). Show project code, expected items, complete items and the percentage, including projects with nothing expected.

#### Solution

```sql
WITH latest AS (
  SELECT DISTINCT ON (r.lot_checklist_id, r.checklist_item_id)
         r.lot_checklist_id, r.checklist_item_id, r.result, r.measured_value, r.notes
  FROM responses r
  ORDER BY r.lot_checklist_id, r.checklist_item_id, r.responded_at DESC, r.id DESC
),
item_state AS (
  SELECT l.project_id,
         CASE ci.response_type
           WHEN 'pass_fail'   THEN latest.result IN ('pass', 'na')
           WHEN 'measurement' THEN latest.measured_value IS NOT NULL
           ELSE latest.notes IS NOT NULL
         END AS complete
  FROM lot_checklists lc
  JOIN lots l             ON l.id = lc.lot_id
  JOIN checklist_items ci ON ci.template_id = lc.template_id
  LEFT JOIN latest        ON latest.lot_checklist_id = lc.id AND latest.checklist_item_id = ci.id
)
SELECT p.code,
       count(s.project_id)                       AS items_expected,
       count(*) FILTER (WHERE s.complete)        AS items_complete,
       round(100.0 * count(*) FILTER (WHERE s.complete) / nullif(count(s.project_id), 0), 1) AS pct_complete
FROM projects p
LEFT JOIN item_state s ON s.project_id = p.id
GROUP BY p.code
ORDER BY pct_complete DESC NULLS LAST;
```

The key move is starting from *expected* items (checklist × template item) and `LEFT JOIN`ing the latest response, so unanswered items are present with NULLs. Then `complete` is NULL for them, and `FILTER (WHERE complete)` doesn't count NULL. `count(s.project_id)` rather than `count(*)` so the culvert with no items shows 0. Compare the numbers with last lesson's: anything lower means items whose latest response is still a fail.

## Say it aloud

"How would you get the most recent response for each checklist item in SQL? What are the pitfalls?"

#### Model answer

It's the greatest-row-per-group problem. My default is a window function. I number the rows with row_number over a partition by checklist and item, ordered by responded_at descending, put that in a CTE, and keep the rows where the number is 1. In Postgres there's a shorter version with DISTINCT ON over the same two columns, ordering by those columns then responded_at descending. The pitfalls: first, ties. If two responses share a timestamp the result isn't deterministic, so I add a tie-breaker like id descending. Second, if I need items with no response at all, like for a completion percentage, I start from the expected items and left join the latest response, otherwise the unanswered items vanish. Third, you can't filter on a window function in the same query's WHERE, so the filter goes outside the CTE. For performance, an index on checklist, item and responded_at descending lets Postgres read the latest row per group straight from the index. If it became a hot path I'd wrap it in a view, and only then think about storing a current-state column.
