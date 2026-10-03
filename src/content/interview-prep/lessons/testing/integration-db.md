## Explanation

For an app whose core is SQL, the most valuable tests run your real handler against a **real Postgres**. Mocking the database (a fake `query()` that returns canned rows) only proves your code does what you *assumed* the database does. It can't catch a wrong join, a missing tenant filter, a violated constraint or a transaction that doesn't actually roll back. Those bugs are exactly what reviewers of a QA product worry about.

**The Firebase parallel:** you may have run tests against the Firestore emulator. Same idea, except here the "emulator" *is* Postgres, the same engine as production, running in Docker.

**Three decisions make or break DB integration tests:**

**1. Where the database comes from.**
- Locally: a dedicated test database (never your dev data) in the Docker container from the SQL module: `docker exec qa-postgres createdb -U postgres qa_test`, then load the schema. Point tests at it with `DATABASE_URL`.
- In CI: a Postgres *service container* that the pipeline starts for each run (next lesson).
- Some teams use Testcontainers to start a throwaway container from the test code itself. It's convenient, but it needs Docker wherever the tests run.

**2. How each test gets a clean state.** Options, fastest first:
- **Transaction per test**: `BEGIN` before each test, `ROLLBACK` after. Very fast and perfectly isolated. It needs the code under test to run on the *same connection*, which is a strong argument for passing the database client in as a parameter rather than importing a global pool. It can't test code that manages its own transactions or commits.
- **Truncate and re-seed** between tests or files: slower, but works with anything.
- **A unique tenant per test** (create a fresh company and query only its data): no cleanup needed, and it works with parallel tests.

**3. Test data.** Prefer creating exactly what each test needs in the test, through small helper functions (`createCompany()`, `createLotChecklist({ ... })`), over depending on a big shared seed whose rows other tests might change. This lesson uses the course seed for brevity and *looks up* the rows it needs by their properties rather than hard-coding ids.

**What to assert in a handler test:** the response (status and body shape, which is the contract the frontend relies on) *and* the database side effects (re-query the row). For the error paths, assert that nothing changed.

**Structure the handler for this.** Keep the HTTP or Lambda adapter thin. The core is a function `signOff(db, actor, signOffId)` that returns `{ status, body }`. It doesn't know about Next.js route handlers, API Gateway events or Express, so it's trivial to call from a test and reusable from any adapter. The AWS module wraps this exact function in a Lambda.

**Run integration tests separately from unit tests** if they need a database: for example `vitest run --project unit` versus `--project integration`, or a separate config. Unit tests then stay instant, and integration tests run where Postgres is available.

## Worked example

The handler. Note `Db` is "anything with a `query` method", so a `Pool` in production and a single transaction client in tests both work:

```ts file=src/signOffHandler.ts group=testing-integration
import type { PoolClient } from "pg"

export type Db = Pick<PoolClient, "query">
export interface Actor {
  userId: number
  companyId: number
}
export interface HandlerResult {
  status: number
  body: unknown
}

export async function signOff(db: Db, actor: Actor, signOffId: number): Promise<HandlerResult> {
  // tenant check: a sign-off from another company is "not found", not "forbidden"
  const found = await db.query<{ company_id: string }>(
    `SELECT p.company_id
     FROM sign_offs s
     JOIN lot_checklists lc ON lc.id = s.lot_checklist_id
     JOIN lots l            ON l.id = lc.lot_id
     JOIN projects p        ON p.id = l.project_id
     WHERE s.id = $1`,
    [signOffId],
  )
  if (found.rowCount === 0 || Number(found.rows[0].company_id) !== actor.companyId) {
    return { status: 404, body: { error: "Sign-off not found" } }
  }

  // check-and-write in one statement: no lost update between two signers
  const signed = await db.query<{ signed_at: Date }>(
    `UPDATE sign_offs s
     SET signed_by = $2, signed_at = now()
     WHERE s.id = $1
       AND s.signed_at IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM checklist_items ci
         JOIN lot_checklists lc ON lc.template_id = ci.template_id AND lc.id = s.lot_checklist_id
         LEFT JOIN LATERAL (
           SELECT r.result FROM responses r
           WHERE r.lot_checklist_id = lc.id AND r.checklist_item_id = ci.id
           ORDER BY r.responded_at DESC, r.id DESC
           LIMIT 1
         ) latest ON true
         WHERE ci.is_hold_point AND ci.response_type = 'pass_fail'
           AND (latest.result IS NULL OR latest.result NOT IN ('pass', 'na'))
       )
     RETURNING s.signed_at`,
    [signOffId, actor.userId],
  )
  if (signed.rowCount === 1) return { status: 200, body: { signedAt: signed.rows[0].signed_at } }

  // nothing updated: explain why
  const current = await db.query<{ full_name: string | null }>(
    `SELECT u.full_name FROM sign_offs s LEFT JOIN users u ON u.id = s.signed_by WHERE s.id = $1`,
    [signOffId],
  )
  if (current.rows[0].full_name) return { status: 409, body: { error: `Already signed by ${current.rows[0].full_name}` } }
  return { status: 422, body: { error: "A hold point has not been released" } }
}
```

(`LEFT JOIN LATERAL (… LIMIT 1)` is a third way to get the latest row per group: a correlated subquery that can return a whole row.)

The integration test: one connection, a transaction per test, rolled back afterwards.

```ts file=src/signOffHandler.test.ts group=testing-integration
import pg from "pg"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { signOff } from "./signOffHandler"

// e.g. postgres://postgres:postgres@localhost:5432/qa_test, with interview-prep/db/seed.sql loaded
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
let db: pg.PoolClient

beforeEach(async () => {
  db = await pool.connect()
  await db.query("BEGIN")
})
afterEach(async () => {
  await db.query("ROLLBACK")
  db.release()
})
afterAll(async () => {
  await pool.end()
})

/** An open sign-off request whose checklist is eligible, plus its company. */
async function openRequest() {
  const { rows } = await db.query<{ id: string; company_id: string }>(
    `SELECT s.id, p.company_id
     FROM sign_offs s
     JOIN lot_checklists lc ON lc.id = s.lot_checklist_id
     JOIN lots l ON l.id = lc.lot_id
     JOIN projects p ON p.id = l.project_id
     WHERE s.signed_at IS NULL
     ORDER BY s.id LIMIT 1`,
  )
  return { id: Number(rows[0].id), companyId: Number(rows[0].company_id) }
}

describe("signOff handler", () => {
  it("signs an open request and records who signed", async () => {
    const req = await openRequest()

    const res = await signOff(db, { userId: 3, companyId: req.companyId }, req.id)

    expect(res.status).toBe(200)
    const { rows } = await db.query("SELECT signed_by, signed_at FROM sign_offs WHERE id = $1", [req.id])
    expect(rows[0].signed_by).toBe("3")
    expect(rows[0].signed_at).toBeInstanceOf(Date)
  })

  it("returns 409 naming the signer when it's already signed", async () => {
    const req = await openRequest()
    await signOff(db, { userId: 3, companyId: req.companyId }, req.id)

    const second = await signOff(db, { userId: 4, companyId: req.companyId }, req.id)

    expect(second).toEqual({ status: 409, body: { error: "Already signed by Chloe Tan" } })
  })

  it("hides other companies' sign-offs (404) and changes nothing", async () => {
    const req = await openRequest()
    const otherCompany = req.companyId === 1 ? 2 : 1

    const res = await signOff(db, { userId: 3, companyId: otherCompany }, req.id)

    expect(res.status).toBe(404)
    const { rows } = await db.query("SELECT signed_at FROM sign_offs WHERE id = $1", [req.id])
    expect(rows[0].signed_at).toBeNull()
  })
})
```

Point `DATABASE_URL` at your test database and run `npx vitest run src/signOffHandler.test.ts`. Every test starts from the same seeded state, because nothing is ever committed.

## Exercises

### The hold-point path [2]

Add a test for the 422: make the checklist's hold point fail (insert a newer failing response *inside the test's transaction*), then try to sign. Assert the status, the error, and that the sign-off is still unsigned.

#### Solution

```ts file=src/signOffHandler.holdpoint.test.ts group=testing-integration
import pg from "pg"
import { afterAll, afterEach, beforeEach, expect, it } from "vitest"
import { signOff } from "./signOffHandler"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
let db: pg.PoolClient
beforeEach(async () => {
  db = await pool.connect()
  await db.query("BEGIN")
})
afterEach(async () => {
  await db.query("ROLLBACK")
  db.release()
})
afterAll(async () => {
  await pool.end()
})

it("refuses (422) while a hold point's latest result is a fail", async () => {
  const { rows } = await db.query<{ sign_off_id: string; lot_checklist_id: string; item_id: string; company_id: string }>(
    `SELECT s.id AS sign_off_id, s.lot_checklist_id, ci.id AS item_id, p.company_id
     FROM sign_offs s
     JOIN lot_checklists lc  ON lc.id = s.lot_checklist_id
     JOIN checklist_items ci ON ci.template_id = lc.template_id AND ci.is_hold_point AND ci.response_type = 'pass_fail'
     JOIN lots l ON l.id = lc.lot_id
     JOIN projects p ON p.id = l.project_id
     WHERE s.signed_at IS NULL
     ORDER BY s.id LIMIT 1`,
  )
  const target = rows[0]
  await db.query(
    `INSERT INTO responses (lot_checklist_id, checklist_item_id, result, responded_by, responded_at)
     VALUES ($1, $2, 'fail', 3, now())`,
    [target.lot_checklist_id, target.item_id],
  )

  const res = await signOff(db, { userId: 3, companyId: Number(target.company_id) }, Number(target.sign_off_id))

  expect(res).toEqual({ status: 422, body: { error: "A hold point has not been released" } })
  const after = await db.query("SELECT signed_at FROM sign_offs WHERE id = $1", [target.sign_off_id])
  expect(after.rows[0].signed_at).toBeNull()
})
```

Arranging data *inside* the test's transaction keeps the test self-contained, and the rollback removes it.

### A test data builder [2]

Tests that depend on the seed break when the seed changes. Write `createChecklistWithSignOff(db, { holdPointResult })` that inserts a fresh company, user, project, lot, template with one hold-point item, a lot checklist, a response and an open sign-off request, and returns the ids. Use it to test the 200 path without touching seed rows.

#### Solution

```ts file=src/builders.ts group=testing-integration
import type { Db } from "./signOffHandler"

const one = async (db: Db, sql: string, values: unknown[]) => Number((await db.query<{ id: string }>(sql, values)).rows[0].id)

export async function createChecklistWithSignOff(db: Db, opts: { holdPointResult: "pass" | "fail" }) {
  const suffix = Math.random().toString(36).slice(2, 8) // unique names keep UNIQUE constraints happy
  const companyId = await one(db, "INSERT INTO companies (name) VALUES ($1) RETURNING id", [`Test Co ${suffix}`])
  const userId = await one(
    db,
    "INSERT INTO users (company_id, full_name, email, role) VALUES ($1, 'Test Engineer', $2, 'engineer') RETURNING id",
    [companyId, `eng-${suffix}@test.example`],
  )
  const projectId = await one(db, "INSERT INTO projects (company_id, code, name) VALUES ($1, 'T-1', 'Test project') RETURNING id", [companyId])
  const lotId = await one(db, "INSERT INTO lots (project_id, code, description) VALUES ($1, 'T-1-L01', 'Test slab') RETURNING id", [projectId])
  const templateId = await one(db, "INSERT INTO checklist_templates (company_id, name) VALUES ($1, 'Test template') RETURNING id", [companyId])
  const itemId = await one(
    db,
    "INSERT INTO checklist_items (template_id, position, prompt, response_type, is_hold_point) VALUES ($1, 1, 'Hold point', 'pass_fail', true) RETURNING id",
    [templateId],
  )
  const lotChecklistId = await one(db, "INSERT INTO lot_checklists (lot_id, template_id) VALUES ($1, $2) RETURNING id", [lotId, templateId])
  await db.query("INSERT INTO responses (lot_checklist_id, checklist_item_id, result, responded_by) VALUES ($1, $2, $3, $4)", [
    lotChecklistId, itemId, opts.holdPointResult, userId,
  ])
  const signOffId = await one(
    db,
    "INSERT INTO sign_offs (lot_checklist_id, signer_role, requested_by) VALUES ($1, 'engineer', $2) RETURNING id",
    [lotChecklistId, userId],
  )
  return { companyId, userId, signOffId }
}
```

```ts file=src/signOffHandler.builder.test.ts group=testing-integration
import pg from "pg"
import { afterAll, afterEach, beforeEach, expect, it } from "vitest"
import { createChecklistWithSignOff } from "./builders"
import { signOff } from "./signOffHandler"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
let db: pg.PoolClient
beforeEach(async () => {
  db = await pool.connect()
  await db.query("BEGIN")
})
afterEach(async () => {
  await db.query("ROLLBACK")
  db.release()
})
afterAll(async () => {
  await pool.end()
})

it("signs a freshly built eligible checklist", async () => {
  const { companyId, userId, signOffId } = await createChecklistWithSignOff(db, { holdPointResult: "pass" })
  expect((await signOff(db, { userId, companyId }, signOffId)).status).toBe(200)
})

it("refuses a freshly built checklist whose hold point failed", async () => {
  const { companyId, userId, signOffId } = await createChecklistWithSignOff(db, { holdPointResult: "fail" })
  expect((await signOff(db, { userId, companyId }, signOffId)).status).toBe(422)
})
```

The builder needs only the schema, not the seed, so these tests would run against an empty migrated database in CI. In a bigger codebase each entity gets its own small builder with defaults, so a test only states what it cares about.

### Why not mock the database? [1]

A teammate says: "Integration tests are slow. Mock `db.query` and assert the SQL string instead." Give two bugs from this lesson that their approach would miss.

#### Solution

Asserting the SQL string only proves the code sends the text you wrote. It can't tell whether that text is *right*. Missed bugs: (1) a wrong or missing tenant join, so another company's sign-off gets signed. The string looks plausible and the test passes. (2) The hold-point subquery picking the wrong "latest" row, or an `IN` that's thrown off by NULLs. Only real data exercises that logic. Also missed: constraint violations (the paired-NULL CHECK), and the conditional `UPDATE` actually updating 0 rows on a second sign. A fair compromise: unit-test the pure rules with no database, and keep a smaller number of real-database tests for the SQL.

## Say it aloud

"How would you write integration tests for an API endpoint that reads and writes Postgres?"

#### Model answer

I'd keep the HTTP layer thin, so the endpoint's core is a function that takes a database client, the authenticated actor and the input, and returns a status and body. Then I test that function against a real Postgres, not a mock. Locally it's a Docker container with a dedicated test database, and in CI a Postgres service container with migrations run from scratch. For isolation I'd usually run each test inside a transaction and roll it back afterwards, which is fast and leaves no residue. That works because the handler takes the client as a parameter. Where the code commits its own transactions, I'd truncate and re-seed or give each test its own tenant instead. Each test builds the data it needs with small builder helpers rather than leaning on a big shared fixture. Then it asserts both the response and the database side effects, like the row being signed by the right user, or nothing changing on an error. I make sure to cover the paths that matter most in a QA app: tenant isolation returning 404, the conflict on a double sign-off, and business-rule rejections like an unreleased hold point.
