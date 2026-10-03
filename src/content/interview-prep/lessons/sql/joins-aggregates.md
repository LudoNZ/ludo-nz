## Explanation

This is the lesson that gets tested most. Almost every live SQL question is "join a few tables, group, count something, filter the groups".

**Read a query in execution order, not written order.** SQL is written `SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY`, but it's *evaluated* roughly:

1. `FROM` / `JOIN`: build one wide set of rows
2. `WHERE`: throw away rows
3. `GROUP BY`: collapse rows into groups
4. `HAVING`: throw away groups
5. `SELECT`: compute output columns (this is where aliases are born)
6. `ORDER BY` / `LIMIT`

That order explains most beginner errors. You can't use a `SELECT` alias in `WHERE`, because it doesn't exist yet. You can't filter on `count(*)` in `WHERE`, because groups don't exist yet, so that's what `HAVING` is for.

**Joins.** Think of a join as "for each row on the left, find the matching rows on the right":

- `JOIN` (inner): only rows with a match on both sides. A project with no lots disappears.
- `LEFT JOIN`: every left row survives. Where there's no match, the right side's columns are NULL. Use it whenever you need "including the ones with none".
- **Anti-join**: "rows with *no* match" is `LEFT JOIN … WHERE right.id IS NULL`, or `WHERE NOT EXISTS (…)`.
- **Fan-out**: joining a one-to-many relationship multiplies rows. Join projects → lots → responses and each project appears once per response. Aggregates then over-count if you join two independent "many" sides together (responses *and* sign-offs). This is the most common subtle bug in interview SQL. Aggregate each side separately (subquery or CTE), then join.

**Grouping rule:** every column in `SELECT` must either be in `GROUP BY` or be inside an aggregate. Postgres relaxes this when you group by a primary key: `GROUP BY p.id` lets you select any other `p.` column.

**Aggregates:** `count(*)` counts rows. `count(col)` counts non-NULL values of `col`. `count(DISTINCT col)` counts distinct non-NULL values. `sum`, `avg`, `min`, `max` ignore NULLs, and `sum` of no rows is NULL, not 0. Postgres extras worth knowing: `count(*) FILTER (WHERE …)`, `bool_and`/`bool_or`, `string_agg(name, ', ')`, `array_agg`.

**NULL means "unknown"**, and it's not like JavaScript's `null`:

- `NULL = NULL` is NULL, not true. Use `IS NULL` / `IS NOT NULL`, or `IS DISTINCT FROM` for NULL-safe comparison.
- `WHERE x <> 'fail'` silently drops rows where `x` is NULL. In this schema, measurement and text responses have `result` NULL, so watch out.
- `NOT IN (subquery)` returns no rows at all if the subquery contains a NULL. Prefer `NOT EXISTS`.
- `coalesce(a, b, …)` returns the first non-NULL. Use it to show `0` or `'(none)'`.
- Integer division truncates: `3 / 4` is `0`. For percentages, write `100.0 * part / total` and guard against zero with `nullif(total, 0)`.

**LEFT JOIN + WHERE trap.** `LEFT JOIN lots l … WHERE l.status = 'x'` turns your left join back into an inner join, because the NULL rows fail the `WHERE`. Put conditions on the optional side in the `ON` clause instead.

Reference: [PostgreSQL tutorial: joins](https://www.postgresql.org/docs/current/tutorial-join.html), [aggregate functions](https://www.postgresql.org/docs/current/functions-aggregate.html).

## Worked example

**Question:** for every project, how many lots and how many lot checklists does it have, including projects with none?

First attempt, with an inner join. Bridge Street Culvert (no lots yet) vanishes:

```sql
SELECT p.code, count(*) AS lots
FROM projects p
JOIN lots l ON l.project_id = p.id
GROUP BY p.code
ORDER BY p.code;
```

Switch to `LEFT JOIN`. But `count(*)` now counts the one all-NULL row as 1, so the culvert shows 1 lot:

```sql
SELECT p.code, count(*) AS lots_wrong, count(l.id) AS lots
FROM projects p
LEFT JOIN lots l ON l.project_id = p.id
GROUP BY p.code
ORDER BY p.code;
```

`count(l.id)` counts only real lots: 0 for HCW-034. Now add checklists. Joining a second level fans out (one row per checklist), so count *distinct* lots:

```sql
SELECT p.code,
       count(DISTINCT l.id) AS lots,
       count(lc.id)         AS checklists
FROM projects p
LEFT JOIN lots l            ON l.project_id = p.id
LEFT JOIN lot_checklists lc ON lc.lot_id = l.id
GROUP BY p.code
ORDER BY p.code;
```

That's the pattern: pick the **grain** (one output row per project), join outwards with `LEFT JOIN` where "none" must still show, and choose `count(col)` or `count(DISTINCT col)` to match what you're actually counting. Say the grain out loud in an interview. It shows you know what the GROUP BY is doing.

## Exercises

### Lots with no location [1]

How many lots are there in total, how many have a location recorded, and how many don't? One row, three numbers, and don't use a `WHERE`.

#### Solution

```sql
SELECT count(*)                              AS total_lots,
       count(location)                       AS with_location,
       count(*) - count(location)            AS without_location,
       count(*) FILTER (WHERE location IS NULL) AS without_location_too
FROM lots;
```

`count(column)` skips NULLs. That's the whole trick.

### Cover measurements per project [2]

The pre-pour template has an item whose prompt starts `Cover to reinforcement`. For each project, show the number of cover measurements recorded and the min, max and average (to one decimal place). Order by average, lowest first.

#### Solution

```sql
SELECT p.code,
       count(r.measured_value)           AS readings,
       min(r.measured_value)             AS min_mm,
       max(r.measured_value)             AS max_mm,
       round(avg(r.measured_value), 1)   AS avg_mm
FROM responses r
JOIN checklist_items ci ON ci.id = r.checklist_item_id
JOIN lot_checklists lc  ON lc.id = r.lot_checklist_id
JOIN lots l             ON l.id = lc.lot_id
JOIN projects p         ON p.id = l.project_id
WHERE ci.prompt LIKE 'Cover to reinforcement%'
GROUP BY p.code
ORDER BY avg_mm;
```

`ORDER BY` can use the alias because it runs after `SELECT`. `LIKE 'x%'` is a prefix match. `ILIKE` would make it case-insensitive.

### Users who have never responded [2]

List active users (name, company name, role) who have never recorded a response. Write it once with `LEFT JOIN … IS NULL` and once with `NOT EXISTS`.

#### Solution

```sql
SELECT u.full_name, c.name AS company, u.role
FROM users u
JOIN companies c ON c.id = u.company_id
LEFT JOIN responses r ON r.responded_by = u.id
WHERE u.is_active AND r.id IS NULL
ORDER BY c.name, u.full_name;
```

```sql
SELECT u.full_name, c.name AS company, u.role
FROM users u
JOIN companies c ON c.id = u.company_id
WHERE u.is_active
  AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.responded_by = u.id)
ORDER BY c.name, u.full_name;
```

Same nine people either way. Admins and project managers make sense. Two Harbour Civil field staff (an engineer and a foreman) are worth a follow-up question to the data: are they on any project's team? `NOT EXISTS` states the intent more directly and is NULL-safe. Postgres usually plans both as the same anti-join.

### Lots with repeated failures [2]

Find lots that have more than one failed response across all their checklists. Show the lot code, its description and the number of failures, most failures first.

#### Solution

```sql
SELECT l.code, l.description, count(*) AS failures
FROM lots l
JOIN lot_checklists lc ON lc.lot_id = l.id
JOIN responses r       ON r.lot_checklist_id = lc.id
WHERE r.result = 'fail'
GROUP BY l.id, l.code, l.description
HAVING count(*) > 1
ORDER BY failures DESC, l.code;
```

`WHERE` filters rows (only fails) *before* grouping. `HAVING` filters groups *after*.

### Percentage of items answered per project [3]

"Percentage complete" for a project here means: of all the checklist items it *should* have answered (every item of every template applied to each of its lots), what percentage has at least one response? Show project code, items expected, items answered and the percentage to one decimal place. Include projects with no checklists, showing 0 expected and a NULL percentage, not a division error.

Watch the fan-out: an item can have several responses (re-inspections).

#### Solution

Build each side at its own grain, then join. Expected items per project:

```sql
WITH expected AS (
  SELECT l.project_id, count(*) AS items_expected
  FROM lot_checklists lc
  JOIN lots l             ON l.id = lc.lot_id
  JOIN checklist_items ci ON ci.template_id = lc.template_id
  GROUP BY l.project_id
),
answered AS (
  SELECT l.project_id,
         count(DISTINCT (r.lot_checklist_id, r.checklist_item_id)) AS items_answered
  FROM responses r
  JOIN lot_checklists lc ON lc.id = r.lot_checklist_id
  JOIN lots l            ON l.id = lc.lot_id
  GROUP BY l.project_id
)
SELECT p.code,
       coalesce(e.items_expected, 0) AS items_expected,
       coalesce(a.items_answered, 0) AS items_answered,
       round(100.0 * coalesce(a.items_answered, 0) / nullif(e.items_expected, 0), 1) AS pct_answered
FROM projects p
LEFT JOIN expected e ON e.project_id = p.id
LEFT JOIN answered a ON a.project_id = p.id
ORDER BY pct_answered DESC NULLS LAST;
```

The `WITH` blocks are CTEs, which are covered properly next lesson. Read them as named subqueries. `count(DISTINCT (a, b))` counts distinct *pairs*, so a re-inspected item counts once. `nullif(x, 0)` turns 0 into NULL, so dividing gives NULL instead of an error. The completed Marina Boardwalk project should be at 100.

## Say it aloud

"What's the difference between WHERE and HAVING, and between an inner and a left join? Give me an example of a bug you could hit with each."

#### Model answer

WHERE filters individual rows before they're grouped. HAVING filters groups after aggregation, so it's where conditions on count or sum go. The bug with those is putting an aggregate condition in WHERE, which is just an error, or doing a row filter in HAVING. That works but it's slower and confusing to read. An inner join keeps only rows that match on both sides. A left join keeps every row from the left table and fills the right side with NULLs where there's no match. The classic bug is a report like "lots per project" using an inner join, so a project with zero lots silently disappears. Then when you switch to a left join, count(*) shows 1 instead of 0 because it counts the NULL row, so you need count of the right table's id. The other one I watch for is putting a filter on the optional table in WHERE, which turns the left join back into an inner join. That condition belongs in the ON clause. And whenever I join two one-to-many relationships at once, I check for fan-out, because the counts get multiplied. Aggregating each side first fixes it.
