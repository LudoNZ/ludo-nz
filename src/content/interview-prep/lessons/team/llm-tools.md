## Explanation

The team uses LLM coding tools daily, and so do you. Expect questions like "how do you use AI tools?" and "how do you know the output is right?". They want to hear that you're productive with the tools *and* that you remain the engineer responsible. Both halves matter: a candidate who refuses the tools seems slow, and one who trusts them blindly seems dangerous.

**Where they genuinely help:**

- **Boilerplate and scaffolding**: config files, test setup, type definitions from an example, CRUD handlers, migrations from a described schema.
- **Exploring unfamiliar territory**: "explain this CloudFormation error", "what are my options for X in Serverless Framework". A fast starting point, verified against the docs.
- **Tests**: drafting test cases from a function's spec, and suggesting edge cases you missed. You still decide which tests matter and check the expected values independently.
- **Refactoring and mechanical changes** across files, with the test suite as the safety net.
- **Reviewing**: asking it to critique your diff for bugs, security issues or missing cases. It's a useful second pass, not a replacement for a human reviewer.
- **Rubber-ducking** a design: listing trade-offs, then you choose.
- **Writing**: PR descriptions, documentation and RCA drafts, which you then edit for accuracy.

**Where they need close checking:**

- **Invented APIs, flags and config keys.** Tools confidently produce plausible but wrong CLI options, library methods or YAML keys, especially for fast-moving tools (Serverless Framework v4 changed authentication and the TypeScript build; Lambda runtimes get deprecated). Check the current official docs. This course was built by checking each command against its docs, and several things *had* changed.
- **SQL**: it can look right and be subtly wrong. Fan-out double counting, NULL semantics (`NOT IN` with NULLs), missing tenant filters, latest-row bugs, non-sargable predicates. Run it against real data and check the row counts.
- **Security**: injection, missing authorisation checks, overly broad IAM (`"Action": "*"`), secrets in code or logs, permissive CORS.
- **Concurrency and failure handling**: lost updates, non-idempotent retries, unhandled promise rejections, missing `finally { client.release() }`.
- **Tests that test nothing**: assertions copied from the implementation's output, over-mocking, or tests that pass when the code is broken. Make sure a new test fails before the fix.
- **Domain rules**: it doesn't know your company's definition of "complete", what a hold point means legally, or your tenancy model.
- **Licensing and data**: don't paste customer data or secrets into tools your company hasn't approved. Follow the team's policy.

**Working habits that make it safe:**

1. **You own every line you commit.** If you can't explain it in review, don't commit it.
2. **Small steps**: ask for a function, not a feature. Review and test each piece. (The same habit as pairing.)
3. **Tests as the contract**: write or review the tests first, then let the tool help with the implementation, and run them.
4. **Give it context**: types, schema, conventions, an example of existing code. Output quality tracks input quality.
5. **Verify facts against primary sources**: docs, the actual library version, the real database.
6. **Be transparent in reviews**: mention when a chunk was generated and what you checked.

**In ensemble programming**, LLM tools become another participant: the driver might prompt while navigators critique the output on screen. That's a natural fit, because generated code gets reviewed by several people immediately.

## Worked example

A realistic interaction, showing the checking:

> **Prompt:** "Postgres. Tables: sign_offs(id, lot_checklist_id, signed_at, requested_at), lot_checklists(id, lot_id), lots(id, project_id), projects(id, company_id). Write a query for sign-offs unsigned for more than 7 days for company $1, oldest first."
>
> **Tool output (plausible):**
> ```sql norun
> SELECT s.* FROM sign_offs s
> JOIN lot_checklists lc ON lc.id = s.lot_checklist_id
> JOIN lots l ON l.id = lc.lot_id
> JOIN projects p ON p.id = l.project_id
> WHERE p.company_id = $1 AND now() - s.requested_at > 7
> ORDER BY s.requested_at;
> ```

What you check, out loud:

1. **Does it run?** `now() - s.requested_at > 7` compares an `interval` to an integer, which is a type error in Postgres. It needs `interval '7 days'`.
2. **Is it right?** It's missing `s.signed_at IS NULL`, so it would include *signed* sign-offs. That's a real bug, not a style issue.
3. **Is it efficient?** Even fixed, `now() - requested_at > interval '7 days'` wraps the column in an expression. `requested_at < now() - interval '7 days'` keeps it bare so an index can be used (the partial index from the performance lesson).
4. **Is it safe?** Parameterised (`$1`) and tenant-filtered. Good.
5. **Test it** against the seed: 7 rows across all companies, so check the per-company split adds up.

The corrected version is the one in the SQL drill. The point: the first draft *looked* finished, had a type error and a logic bug, and only careful reading and running caught them.

## Exercises

### Find the AI bug [2]

A tool generated this hook for loading a lot's checklists. Find three problems.

```ts norun
export function useChecklists(lotId: number) {
  const [data, setData] = useState([])
  useEffect(async () => {
    const res = await fetch(`/api/lots/${lotId}/checklists`)
    setData(await res.json())
  }, [])
  return data
}
```

#### Solution

1. **`useEffect(async () => …)`**: an effect callback must return nothing or a cleanup function, but an async function returns a Promise. React warns about this, and you can't return a cleanup. Define an async function inside and call it.
2. **Missing dependency**: `[]` ignores `lotId`, so switching lots shows the first lot's checklists forever. Use `[lotId]`.
3. **No race handling, no error or loading state**: a slow response for a previous lot can overwrite the current one (needs an `ignore` flag or `AbortController`). `res.ok` isn't checked, so a 500's error JSON becomes "data". `useState([])` infers `never[]`, so type it properly. The React lesson's `useResponses` hook is the corrected pattern.

### Write the guidance [1]

Your new team asks you to draft five bullet points of guidance for using LLM tools on a codebase containing customer QA data. Write them.

#### Solution

1. Use only the company-approved tools and settings. Never paste customer data, credentials or production logs containing personal data into prompts.
2. The author owns all generated code: read every line, make sure you can explain it in review, and mention significant generated sections in the PR.
3. Verify against primary sources: run generated SQL against the dev database and check the row counts, and check CLI flags, config keys and library APIs against current docs.
4. Pay extra attention to security-sensitive code (tenant filters, authorisation, IAM policies, SQL construction, file uploads) and concurrency (idempotency, transactions).
5. Tests are the contract: generated tests must fail before the fix, and expected values come from the spec, not from the implementation's output.

### Prompt for a migration [2]

Write the prompt you'd give a tool to generate a safe migration adding a required `trade` column to `checklist_templates` on a live system, and list what you'd check in its output.

#### Solution

Prompt: *"PostgreSQL 18, zero-downtime deploys (old and new app versions run side by side). Table `checklist_templates (id bigint pk, company_id bigint, name text, version int, is_active bool)`, about 50k rows. Add `trade text NOT NULL` with allowed values concrete, carpentry, plumbing, waterproofing, civil. Use expand/contract: give separate migrations for (1) adding the nullable column and a CHECK constraint, (2) a batched backfill (existing rows default to 'concrete' where name ILIKE '%concrete%' else 'carpentry' as a placeholder for review), (3) adding NOT NULL safely. Explain what app code must change between steps."*

Check: step 1 adds the column nullable with no volatile default. The CHECK is added `NOT VALID` then `VALIDATE`d, or validated against existing NULLs (NULL passes CHECK). The backfill is batched and idempotent. Step 3 uses the `CHECK (trade IS NOT NULL) NOT VALID` → `VALIDATE` → `SET NOT NULL` pattern, which avoids a long lock. Every statement is valid for the stated Postgres version. Then run all three against a copy of the seed. The placeholder backfill rule is a *product* decision to confirm, not something to accept because the tool wrote it.

## Say it aloud

"How do you use AI coding tools, and where do you not trust them?"

#### Model answer

I use them every day. They're great for scaffolding, config, types, drafting tests and edge cases, mechanical refactors, explaining unfamiliar errors, and as a second reviewer on my own diffs. But I treat output as a draft from a very fast colleague who hasn't read our docs. I work in small steps, ask for a function rather than a feature, give it real context like types and schema, and review and run everything. I own every line I commit, so if I can't explain it in review it doesn't go in. The places I check hardest: invented APIs and config, especially fast-moving tools like Serverless or the Lambda runtimes, where I go to the official docs. SQL, which can look right but double count or mishandle NULLs, so I run it and check row counts. And security, like tenant filters, authorisation, IAM scope and injection. Plus concurrency and retries, and tests that don't actually test anything, where I make sure they fail first. I also follow the team's rules on data, so no customer data in prompts. In an ensemble setting it works nicely, because the whole group reviews the output as it appears.
