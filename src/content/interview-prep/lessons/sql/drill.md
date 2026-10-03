## Explanation

This lesson is practice under exam-like conditions. The explanation is the **method**; the exercises are the reps. Time yourself: grade 1 in under 5 minutes, grade 2 in 10, grade 3 in 15–20. Write each query in `psql` or a file before revealing anything.

**A method for any live SQL question.** Interviewers grade the process at least as much as the final query, so do these steps out loud:

1. **Restate the question and pin down the grain.** "So one row per *project*, with…?" Most wrong answers come from the wrong grain. Ask what should happen to the edge cases: things with zero matches (include them as 0?), NULLs, ties, deleted or inactive records.
2. **Name the tables and the path between them.** "Sign-offs hang off lot checklists, which hang off lots, which belong to projects." Draw the foreign-key walk before typing.
3. **Start from the table at the grain you need**, or from the "many" side if you're counting, and `LEFT JOIN` outwards wherever "none" must still show.
4. **Build incrementally with CTEs.** Write the first step, run it, glance at the row count and a few rows, then add the next step. It's much easier to debug and to narrate than one 40-line query typed blind.
5. **Sanity-check the output.** Does the total match a simple `count(*)`? Is there a project you know should be 100%? Did a join fan out (suspiciously large counts)?
6. **Mention performance only after it's correct.** "On a large table I'd want an index on X for this," which is a one-sentence bonus.

**Patterns you've now seen, and their cues:**

| If the question says… | Reach for |
| --- | --- |
| "including those with none" | `LEFT JOIN` + `count(child.id)` + `coalesce` |
| "that have no…" / "never…" | `NOT EXISTS` (anti-join) |
| "every…" / "all of their…" | `bool_and`, or double `NOT EXISTS`, or `count(*) = count(*) FILTER (…)` |
| "latest / current / most recent per…" | `row_number()` or `DISTINCT ON` with a tie-breaker |
| "top N per…" / "rank" | `row_number()` / `rank()` in a CTE, filter outside |
| "change since previous" / "time between" | `lag()` / `lead()` |
| "per week / per day, including empty ones" | `generate_series` of dates, `LEFT JOIN` the data |
| "percentage of" | `100.0 * part / nullif(total, 0)` |
| "more than N days ago" | `ts < now() - interval 'N days'` (keep the column bare so an index can be used) |

**Cross-check against Firestore instincts:** if you catch yourself wanting to "fetch the list then loop", stop. That's a join or a `GROUP BY`.

## Worked example

**"Show sign-offs that have been outstanding for more than seven days: project, lot, which role is needed, who asked, and how many days it's been waiting. Longest first."**

Narrated:

1. *Grain:* one row per unsigned sign-off request. *Edge cases:* "outstanding" means `signed_at IS NULL`; "more than seven days" is measured from `requested_at` to now.
2. *Path:* `sign_offs` → `lot_checklists` → `lots` → `projects`, plus `users` for the requester.
3. *Build it.* Filter first and check the count:

```sql
SELECT count(*)
FROM sign_offs
WHERE signed_at IS NULL
  AND requested_at < now() - interval '7 days';
```

Seven. Now add context and a readable "days waiting":

```sql
SELECT p.code AS project, l.code AS lot, s.signer_role,
       u.full_name AS requested_by,
       s.requested_at::date AS requested_on,
       extract(day FROM now() - s.requested_at)::int AS days_waiting
FROM sign_offs s
JOIN lot_checklists lc ON lc.id = s.lot_checklist_id
JOIN lots l            ON l.id = lc.lot_id
JOIN projects p        ON p.id = l.project_id
JOIN users u           ON u.id = s.requested_by
WHERE s.signed_at IS NULL
  AND s.requested_at < now() - interval '7 days'
ORDER BY s.requested_at;
```

Still seven rows, so no join fanned out. *Sanity check:* the oldest pair (foreman and engineer) has been waiting about three months on Riverside Apartments, which is worth flagging to the user as a data or process smell, not just reporting. *Performance note:* "a partial index on `requested_at WHERE signed_at IS NULL` would serve this as data grows." Notice that `requested_at < now() - interval '7 days'` keeps the column bare. Writing `now() - requested_at > interval '7 days'` gives the same answer but can't use an index on `requested_at`.

## Exercises

### Template usage [1]

For every checklist template (company name, template name, version, active or not), show how many lot checklists use it. Include templates nobody has used.

#### Solution

```sql
SELECT c.name AS company, t.name, t.version, t.is_active,
       count(lc.id) AS times_used
FROM checklist_templates t
JOIN companies c            ON c.id = t.company_id
LEFT JOIN lot_checklists lc ON lc.template_id = t.id
GROUP BY c.name, t.id, t.name, t.version, t.is_active
ORDER BY c.name, t.name, t.version;
```

Ironbark's inactive waterproofing template shows 0. Totara Ridge's pre-pour v1 still has uses: old lots keep pointing at the version they were inspected against.

### Average time to sign, per signer [2]

For each person who has signed at least one sign-off, show their name, role, how many they've signed, and their average time from request to signature in hours (one decimal place). Slowest first.

#### Solution

```sql
SELECT u.full_name, u.role,
       count(*) AS signed,
       round(avg(extract(epoch FROM s.signed_at - s.requested_at) / 3600)::numeric, 1) AS avg_hours
FROM sign_offs s
JOIN users u ON u.id = s.signed_by
WHERE s.signed_at IS NOT NULL
GROUP BY u.id, u.full_name, u.role
ORDER BY avg_hours DESC;
```

`extract(epoch FROM interval)` gives seconds as a number. The `::numeric` cast is needed because `round(x, 1)` with two arguments exists for `numeric`, not `double precision`.

### Missing photo evidence [2]

Some checklist items require photo evidence. Find **current** responses (latest per checklist item) to photo-required items that have no photos attached. Show project, lot, item prompt, who responded and when.

#### Solution

```sql
WITH latest AS (
  SELECT DISTINCT ON (r.lot_checklist_id, r.checklist_item_id) r.*
  FROM responses r
  ORDER BY r.lot_checklist_id, r.checklist_item_id, r.responded_at DESC, r.id DESC
)
SELECT p.code AS project, l.code AS lot, ci.prompt, u.full_name AS responded_by, latest.responded_at
FROM latest
JOIN checklist_items ci ON ci.id = latest.checklist_item_id
JOIN lot_checklists lc  ON lc.id = latest.lot_checklist_id
JOIN lots l             ON l.id = lc.lot_id
JOIN projects p         ON p.id = l.project_id
JOIN users u            ON u.id = latest.responded_by
WHERE ci.requires_photo
  AND NOT EXISTS (SELECT 1 FROM photos ph WHERE ph.response_id = latest.id)
ORDER BY p.code, l.code;
```

"Latest" matters: a failed response's photos don't count as evidence for the re-inspection that passed. This is the kind of data-quality report a QA product would actually ship.

### Late photo uploads [2]

Photos are taken on site and uploaded later, when the device gets signal. For each user, show how many photos they uploaded, how many arrived more than 24 hours after they were taken, and the worst delay (as an interval). Only include users with at least one late upload.

#### Solution

```sql
SELECT u.full_name,
       count(*) AS photos,
       count(*) FILTER (WHERE ph.uploaded_at - ph.taken_at > interval '24 hours') AS late,
       max(ph.uploaded_at - ph.taken_at) AS worst_delay
FROM photos ph
JOIN users u ON u.id = ph.uploaded_by
GROUP BY u.id, u.full_name
HAVING count(*) FILTER (WHERE ph.uploaded_at - ph.taken_at > interval '24 hours') > 0
ORDER BY late DESC, worst_delay DESC;
```

`HAVING` can't see the `late` alias, so the expression is repeated. Wrap it in a CTE if that bothers you. This question is a lead-in to the offline-sync design case: late uploads are normal, not an error.

### Responses from outside the team [2]

Authorisation check: find responses recorded by someone who is **not a member** of the project the response belongs to. Show the project, the person, and how many such responses they made.

#### Solution

```sql
SELECT p.code AS project, u.full_name, u.role, count(*) AS responses
FROM responses r
JOIN lot_checklists lc ON lc.id = r.lot_checklist_id
JOIN lots l            ON l.id = lc.lot_id
JOIN projects p        ON p.id = l.project_id
JOIN users u           ON u.id = r.responded_by
WHERE NOT EXISTS (
  SELECT 1 FROM project_members pm
  WHERE pm.project_id = l.project_id AND pm.user_id = r.responded_by
)
GROUP BY p.code, u.id, u.full_name, u.role
ORDER BY p.code, responses DESC;
```

Against the seed this returns no rows. Prove the query works the same way as the hold-point exercise below: insert a response from a non-member inside a transaction. If it returns rows in real data, you'd ask: were they removed from the team later, or did the app fail to enforce membership? It's a good example of SQL as an *investigation* tool, which is a strong thing to mention in an interview.

### Hold points not released [3]

A **hold point** is an item that must pass before work continues. Find lot checklists where a sign-off has been *requested* but at least one hold-point item's current (latest) result is not `pass` or `na`, or has no response at all. Show project, lot, template name and the offending prompt(s) as one comma-separated string.

#### Solution

```sql
WITH latest AS (
  SELECT DISTINCT ON (r.lot_checklist_id, r.checklist_item_id)
         r.lot_checklist_id, r.checklist_item_id, r.result, r.measured_value
  FROM responses r
  ORDER BY r.lot_checklist_id, r.checklist_item_id, r.responded_at DESC, r.id DESC
),
unreleased AS (
  SELECT lc.id AS lot_checklist_id, ci.prompt
  FROM lot_checklists lc
  JOIN checklist_items ci ON ci.template_id = lc.template_id AND ci.is_hold_point
  LEFT JOIN latest        ON latest.lot_checklist_id = lc.id AND latest.checklist_item_id = ci.id
  WHERE CASE ci.response_type
          WHEN 'pass_fail' THEN latest.result IS NULL OR latest.result NOT IN ('pass', 'na')
          ELSE latest.measured_value IS NULL
        END
)
SELECT p.code AS project, l.code AS lot, t.name AS template,
       string_agg(u.prompt, ', ' ORDER BY u.prompt) AS unreleased_hold_points
FROM unreleased u
JOIN lot_checklists lc     ON lc.id = u.lot_checklist_id
JOIN lots l                ON l.id = lc.lot_id
JOIN projects p            ON p.id = l.project_id
JOIN checklist_templates t ON t.id = lc.template_id
WHERE EXISTS (SELECT 1 FROM sign_offs s WHERE s.lot_checklist_id = lc.id)
GROUP BY p.code, l.code, t.name
ORDER BY p.code, l.code;
```

If the seed's data is clean this returns **no rows**, because sign-offs were only requested once every item was answered. That's a perfectly good answer, so *say* that you expected it and why. To prove your query works, make it fail on purpose inside a transaction:

```sql
BEGIN;
INSERT INTO responses (lot_checklist_id, checklist_item_id, result, responded_by)
SELECT s.lot_checklist_id, ci.id, 'fail', s.requested_by
FROM sign_offs s
JOIN lot_checklists lc  ON lc.id = s.lot_checklist_id
JOIN checklist_items ci ON ci.template_id = lc.template_id AND ci.is_hold_point AND ci.response_type = 'pass_fail'
ORDER BY s.id
LIMIT 1;
-- …re-run the query above here: one row appears…
ROLLBACK;
```

Testing a query with zero results by constructing data that *should* match is a habit worth showing.

### Weekly activity with empty weeks [3]

For Harbour Civil Works (company 3), show the number of responses recorded in each of the last 12 weeks, **including weeks with zero**. One row per week, starting Monday, oldest first.

#### Solution

```sql
WITH weeks AS (
  SELECT generate_series(
           date_trunc('week', now()) - interval '11 weeks',
           date_trunc('week', now()),
           interval '1 week'
         ) AS week_start
),
company_responses AS (
  SELECT r.responded_at
  FROM responses r
  JOIN lot_checklists lc ON lc.id = r.lot_checklist_id
  JOIN lots l            ON l.id = lc.lot_id
  JOIN projects p        ON p.id = l.project_id
  WHERE p.company_id = 3
)
SELECT w.week_start::date AS week_of, count(cr.responded_at) AS responses
FROM weeks w
LEFT JOIN company_responses cr
  ON cr.responded_at >= w.week_start
 AND cr.responded_at <  w.week_start + interval '1 week'
GROUP BY w.week_start
ORDER BY w.week_start;
```

Harbour Civil has a couple of quiet weeks, which show as 0. `GROUP BY date_trunc('week', responded_at)` alone would skip them entirely. Generating the calendar first and `LEFT JOIN`ing onto it is the standard fix. The half-open range (`>= start AND < end`) avoids double-counting anything exactly on a boundary. `date_trunc('week', …)` starts weeks on Monday.

### Failure rate ranking [3]

Within each project, rank lots by their **first-time pass rate**: of the pass/fail items on that lot that have been answered, what percentage passed on the *first* response (no fail before the pass)? Show project, lot, items answered, first-time passes, rate, and the rank within the project (best = 1, ties share a rank). Only lots with at least one answered pass/fail item.

#### Solution

```sql
WITH firsts AS (
  SELECT DISTINCT ON (r.lot_checklist_id, r.checklist_item_id)
         r.lot_checklist_id, r.checklist_item_id, r.result
  FROM responses r
  JOIN checklist_items ci ON ci.id = r.checklist_item_id
  WHERE ci.response_type = 'pass_fail'
  ORDER BY r.lot_checklist_id, r.checklist_item_id, r.responded_at, r.id
),
per_lot AS (
  SELECT l.project_id, l.id AS lot_id, l.code,
         count(*) AS answered,
         count(*) FILTER (WHERE f.result IN ('pass', 'na')) AS first_time
  FROM firsts f
  JOIN lot_checklists lc ON lc.id = f.lot_checklist_id
  JOIN lots l            ON l.id = lc.lot_id
  GROUP BY l.project_id, l.id, l.code
)
SELECT p.code AS project, per_lot.code AS lot, answered, first_time,
       round(100.0 * first_time / answered, 1) AS first_time_pct,
       rank() OVER (PARTITION BY per_lot.project_id ORDER BY 1.0 * first_time / answered DESC) AS rank_in_project
FROM per_lot
JOIN projects p ON p.id = per_lot.project_id
ORDER BY p.code, rank_in_project, per_lot.code;
```

The trick is `DISTINCT ON` ordered **ascending**, which gives the *first* response per item rather than the latest. Same pattern, opposite direction. `rank()` shares ranks between ties, as asked. No `nullif` is needed because `answered` is at least 1 by construction (say so).

## Say it aloud

"Talk me through how you'd approach a SQL question you haven't seen before, live, with me watching."

#### Model answer

I start by restating the question and pinning down the grain, meaning what one output row represents, and I ask about edge cases up front. Should things with no matches show as zero, how do NULLs count, what about ties or inactive records? Then I name the tables and the foreign-key path between them out loud, so we agree on the model before I type. I build the query incrementally, usually with CTEs. I write the first step, run it, look at the row count and a few rows, then add the next step on top. That keeps me from writing a big query blind and lets you follow my reasoning. When I join one-to-many relationships I watch for fan-out, and when "none" needs to show I use a left join and count a column from the right side. Once I have an answer I sanity-check it against something I know, like a simple count or a project I know is complete. If a query legitimately returns nothing, I'll construct data inside a transaction that should match, to prove it works, then roll back. Only after it's correct do I mention performance, such as which index would serve it.
