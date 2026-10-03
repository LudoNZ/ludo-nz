## Explanation

This is a full rehearsal. Do the mock module **last**, ideally the day or two before the interview, under realistic conditions: a timer, no AI, no peeking, talking out loud as if someone is listening. If you can, get a friend to play the interviewer and read out the questions. Otherwise record yourself.

**Format: 30 minutes, four questions, increasing difficulty.** Use the seed database in `psql` (or your preferred client). For each question:

1. Restate it and pin down the grain and edge cases out loud (the method from the drill lesson).
2. Build incrementally, running each step.
3. Sanity-check the result.
4. Give one sentence on performance (which index would help).

**Time budget:** Q1 5 min, Q2 7 min, Q3 8 min, Q4 10 min. If you overrun a question by more than a couple of minutes, say what you'd do next and move on. That's what you'd do in the real thing.

**Scoring yourself afterwards** (1–3 for each question):

| | 1 | 2 | 3 |
| --- | --- | --- | --- |
| Clarified | Started typing immediately | Asked about some edge cases | Stated the grain and edge cases before writing |
| Correct | Wrong result | Right with nudges / minor issue | Right first time, verified |
| Process | Wrote it all at once | Some incremental steps | CTE by CTE, running each |
| Narration | Silent | Some explanation | Continuous, clear reasoning |

Rate your SQL module confidence afterwards. If any question scored 1 on correctness, redo the matching lesson's exercises.

**If you get stuck mid-question**, don't go silent. Say what you've got, what you expected, and what you'll try: "The count is higher than I expected, so I suspect fan-out from joining both responses and sign-offs. I'll aggregate responses in a CTE first." Then try it. Interviewers care far more about how you recover than about whether the first draft was perfect. If time runs out, describe the remaining steps in words. A clear plan for the last CTE is worth most of the marks.

**After the round**, rerun any question you got wrong without looking at the solution, a day later if possible. That's when it actually sticks.

**Rules of thumb under pressure:** say the grain; `LEFT JOIN` where "none" must show; count a column, not `*`, after a left join; tie-breakers for "latest"; `NOT EXISTS` for "never"; `nullif` for division; keep timestamp columns bare in comparisons.

## Worked example

How to *open* a question you've never seen. Question: *"Which inspectors have recorded responses on more than one project in the last 60 days?"*

> "One row per inspector, so grain is user. 'Inspector' — I'll take anyone who recorded a response, regardless of role, and mention that assumption. 'More than one project' means count distinct projects through response → checklist → lot → project. 'Last 60 days' I'll apply to `responded_at`. Let me get the per-user project counts first."

```sql
SELECT r.responded_by, count(DISTINCT l.project_id) AS projects
FROM responses r
JOIN lot_checklists lc ON lc.id = r.lot_checklist_id
JOIN lots l            ON l.id = lc.lot_id
WHERE r.responded_at >= now() - interval '60 days'
GROUP BY r.responded_by
HAVING count(DISTINCT l.project_id) > 1;
```

> "That gives ids. I'll join users for names and order by count. Sanity check: these should all be from companies with several active projects. Performance-wise, `responses.responded_at` would want an index if this ran often."

Thirty seconds of talking before typing, then build, check, and one performance remark.

## Exercises

### Q1 (5 min): Lots per status [1]

For each project, count its lots that are closed (`closed_at` set) and open. Include projects with no lots. Show the project code, open count and closed count.

#### Solution

```sql
SELECT p.code,
       count(l.id) FILTER (WHERE l.closed_at IS NULL)     AS open_lots,
       count(l.id) FILTER (WHERE l.closed_at IS NOT NULL) AS closed_lots
FROM projects p
LEFT JOIN lots l ON l.project_id = p.id
GROUP BY p.code
ORDER BY p.code;
```

`count(l.id)`, not `count(*)`, so the culvert shows 0 and 0, not 1 open. Checks: Marina Boardwalk (completed) is all closed, and Bridge Street Culvert is 0/0.

### Q2 (7 min): Repeat failures by item [2]

Which checklist **items** (prompt text) fail most often on the *first* attempt across all projects? Show the prompt, how many times it was first answered, the number of first-time fails, and the fail rate as a percentage. Only items first-answered at least 5 times. Highest rate first.

#### Solution

```sql
WITH firsts AS (
  SELECT DISTINCT ON (r.lot_checklist_id, r.checklist_item_id)
         r.checklist_item_id, r.result
  FROM responses r
  ORDER BY r.lot_checklist_id, r.checklist_item_id, r.responded_at, r.id
)
SELECT ci.prompt,
       count(*) AS first_answers,
       count(*) FILTER (WHERE f.result = 'fail') AS first_fails,
       round(100.0 * count(*) FILTER (WHERE f.result = 'fail') / count(*), 1) AS fail_pct
FROM firsts f
JOIN checklist_items ci ON ci.id = f.checklist_item_id
WHERE ci.response_type = 'pass_fail'
GROUP BY ci.prompt
HAVING count(*) >= 5
ORDER BY fail_pct DESC, ci.prompt;
```

Grouping by **prompt** merges the same question across companies' templates. Say that's a choice (versus grouping by item id), and that it's why the pre-pour items aggregate across companies (Totara Ridge's two template versions and Ironbark's). `DISTINCT ON` ordered *ascending* gives the first attempt.

### Q3 (8 min): Signer workload [2]

For each **active** user who can sign (role `engineer`, `foreman` or `project_manager`), show: how many sign-offs they've signed, how many of their company's sign-offs are currently waiting (unsigned) for their role (a project manager counts as foreman for this), and the oldest waiting request's age in days. Include signers with zero of either.

#### Solution

```sql
WITH signed AS (
  SELECT signed_by AS user_id, count(*) AS signed
  FROM sign_offs
  WHERE signed_by IS NOT NULL
  GROUP BY signed_by
),
waiting AS (
  SELECT p.company_id, s.signer_role, count(*) AS waiting, max(now() - s.requested_at) AS oldest_wait
  FROM sign_offs s
  JOIN lot_checklists lc ON lc.id = s.lot_checklist_id
  JOIN lots l            ON l.id = lc.lot_id
  JOIN projects p        ON p.id = l.project_id
  WHERE s.signed_at IS NULL
  GROUP BY p.company_id, s.signer_role
)
SELECT u.full_name, u.role,
       coalesce(sg.signed, 0)  AS signed,
       coalesce(w.waiting, 0)  AS waiting_for_my_role,
       extract(day FROM w.oldest_wait)::int AS oldest_wait_days
FROM users u
LEFT JOIN signed sg  ON sg.user_id = u.id
LEFT JOIN waiting w  ON w.company_id = u.company_id
                    AND w.signer_role = CASE WHEN u.role = 'engineer' THEN 'engineer' ELSE 'foreman' END
WHERE u.is_active AND u.role IN ('engineer', 'foreman', 'project_manager')
ORDER BY waiting_for_my_role DESC, u.full_name;
```

Two aggregates at different grains (per user, per company and role), each in its own CTE, then joined. Doing it in one `GROUP BY` would fan out. The role mapping lives in the join condition. Mention that `waiting` is the company's queue for that role, shared by every eligible signer, which is a product nuance worth stating.

### Q4 (10 min): Lot readiness report [3]

For each **open** lot (no `closed_at`) on **active** projects, report: project code, lot code, number of checklists, how many are complete (every item's latest response completes it: pass/na for pass/fail, a value for measurement, non-blank notes for text), how many are fully signed off, and a `ready_to_close` flag that's true only if the lot has at least one checklist and all are signed off. Order: ready lots first, then by project and lot code.

#### Solution

```sql
WITH latest AS (
  SELECT DISTINCT ON (r.lot_checklist_id, r.checklist_item_id)
         r.lot_checklist_id, r.checklist_item_id, r.result, r.measured_value, r.notes
  FROM responses r
  ORDER BY r.lot_checklist_id, r.checklist_item_id, r.responded_at DESC, r.id DESC
),
checklist_complete AS (
  SELECT lc.id AS lot_checklist_id,
         bool_and(CASE ci.response_type
                    WHEN 'pass_fail'   THEN coalesce(latest.result IN ('pass', 'na'), false)
                    WHEN 'measurement' THEN latest.measured_value IS NOT NULL
                    ELSE coalesce(trim(latest.notes) <> '', false)
                  END) AS complete
  FROM lot_checklists lc
  JOIN checklist_items ci ON ci.template_id = lc.template_id
  LEFT JOIN latest        ON latest.lot_checklist_id = lc.id AND latest.checklist_item_id = ci.id
  GROUP BY lc.id
),
checklist_signed AS (
  SELECT lc.id AS lot_checklist_id,
         count(s.id) > 0 AND bool_and(s.signed_at IS NOT NULL) AS signed_off
  FROM lot_checklists lc
  LEFT JOIN sign_offs s ON s.lot_checklist_id = lc.id
  GROUP BY lc.id
)
SELECT p.code AS project, l.code AS lot,
       count(lc.id) AS checklists,
       count(*) FILTER (WHERE cc.complete) AS complete,
       count(*) FILTER (WHERE cs.signed_off) AS signed_off,
       count(lc.id) > 0 AND count(lc.id) = count(*) FILTER (WHERE cs.signed_off) AS ready_to_close
FROM lots l
JOIN projects p                  ON p.id = l.project_id AND p.status = 'active'
LEFT JOIN lot_checklists lc      ON lc.lot_id = l.id
LEFT JOIN checklist_complete cc  ON cc.lot_checklist_id = lc.id
LEFT JOIN checklist_signed cs    ON cs.lot_checklist_id = lc.id
WHERE l.closed_at IS NULL
GROUP BY p.code, l.code
ORDER BY ready_to_close DESC, p.code, l.code;
```

The `coalesce(…, false)` calls matter: an unanswered item gives NULL, and `bool_and` *ignores* NULLs. Without them, a checklist with only unanswered items in some positions could look complete. That's exactly the kind of NULL trap to call out. The `count(lc.id) > 0` guard stops a lot with no checklists counting as ready: without it, 0 = 0 would make an empty lot ready. (Every open lot on an active project has checklists in the seed, so add one without, inside a transaction, to prove the guard works.) If you finish early, mention the index you'd want (`lot_checklists (lot_id)`, `responses (lot_checklist_id, checklist_item_id, responded_at DESC)`) and that this is a natural candidate for a view.

## Say it aloud

"You've just finished a SQL exercise in an interview. The interviewer asks: 'How confident are you that's right, and how would you check?'"

#### Model answer

Reasonably confident, and here's how I'd check rather than just assert it. First, row counts at each step. The base set should match a simple count, like the number of open lots on active projects, and the final row count should equal that, which tells me no join fanned out. Second, spot-check known cases: a lot I know is fully signed off should be ready, a lot with no checklists shouldn't be, and a checklist with a failed latest response shouldn't count as complete. If the data doesn't contain a case I care about, I'd create it inside a transaction, re-run and roll back. Third, look at the NULL paths specifically. Left joins, bool_and ignoring NULLs and coalesce choices are where these queries usually go wrong. And if this were going into the product, I'd turn those checks into integration tests with small purpose-built data, so the rules are pinned down as the schema evolves.
