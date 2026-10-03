## Explanation

**The Firebase SDK hid the database protocol from you.** With Postgres your server code talks to the database directly over a TCP connection. In Node that's usually [node-postgres](https://node-postgres.com/) (`pg`), either directly or underneath a query builder or ORM.

**Connections and pools.** Opening a Postgres connection is expensive (a process on the server, authentication, TLS), and the server has a hard `max_connections` limit. So a server keeps a **pool**: `new Pool({ connectionString })` opens connections lazily and lends them out. `pool.query(...)` borrows one for one statement and hands it back. For a transaction you must hold *one* connection for several statements: `const client = await pool.connect()`, then `BEGIN`/`COMMIT`, then `client.release()` in a `finally`. Forgetting the release leaks connections until the pool is exhausted and every request hangs. That's a nice war story to have ready. (In Lambda, pools behave differently, which is covered in the AWS module.)

**Parameterised queries.** You never build SQL by gluing user input into the string. You send the SQL text with placeholders (`$1`, `$2`…) and the values *separately*:

```ts norun
await pool.query("SELECT * FROM lots WHERE code = $1", [code])
```

The server parses the SQL first and only then binds the values as data, so a value can never change the query's structure. node-postgres's docs say it plainly: string-concatenating parameters into query text "can (and often does) lead to sql injection vulnerabilities" ([node-postgres: queries](https://node-postgres.com/features/queries)).

**SQL injection, concretely.** `` `… WHERE code = '${code}'` `` with `code = "x' OR '1'='1"` returns every lot, across every company. Worse, a query *without* parameters is sent using the simple protocol, which accepts multiple statements, so `'; DELETE FROM sign_offs; --` can run. Template literals make this mistake look tidy, which is why it survives code review.

**What parameters can't do:** identifiers. Table names, column names and `ASC`/`DESC` can't be `$1`. For a user-chosen sort, map input to an **allowlist** of known column names in code. Also, `LIKE` patterns treat `%` and `_` in the *value* as wildcards, so escape them if users shouldn't be able to use them.

**Types at the boundary.** `pg` returns rows as `any` unless you supply a generic, and it converts some types surprisingly: `bigint` (our ids) and `numeric` come back as **strings**, because JavaScript numbers can't hold them exactly. Cast in SQL (`id::int`) or convert in a mapping function, and treat the row mapping as the place where the database's shape becomes your domain type. `timestamptz` comes back as a `Date`.

**Raw SQL vs query builder vs ORM**, which is a common interview discussion:

| | Raw SQL (`pg`) | Query builder (Kysely, Knex) | ORM (Prisma, Drizzle, TypeORM) |
| --- | --- | --- | --- |
| You write | SQL strings | TypeScript that *composes* SQL | Model operations (`findMany({ include })`) |
| Type safety | Manual (generics, mapping) | Strong: columns checked against a schema type | Strong, generated from the schema |
| Complex queries (CTEs, windows) | Full power | Mostly, with an escape hatch to raw SQL | Often awkward, so you drop to raw SQL |
| Dynamic filters | Fiddly string building | Natural | Natural |
| Risk | Injection if careless, drift between SQL and types | Learning the API | Hidden N+1s, surprising generated SQL, abstraction leaks |

A defensible position: *"I'd want to see the SQL. A typed query builder is a good default, with raw parameterised SQL for the complex reporting queries, and whatever we choose, we check the generated SQL with EXPLAIN on the hot paths."* Don't claim one is always right. If the team already has a choice, adopting it consistently matters more.

## Worked example

A small data-access module. Every query that touches a user-supplied value is parameterised, and the row → domain mapping converts the `bigint` id.

```ts file=src/db.ts group=sql-ts
import pg from "pg"

// one pool per process; reads DATABASE_URL, e.g. postgres://postgres:postgres@localhost:5432/qa_practice
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
```

```ts file=src/signOffs.ts group=sql-ts
import type { Pool } from "pg"

export interface OutstandingSignOff {
  id: number
  projectCode: string
  lotCode: string
  signerRole: "foreman" | "engineer"
  requestedAt: Date
  daysWaiting: number
}

interface Row {
  id: string // bigint arrives as a string
  project_code: string
  lot_code: string
  signer_role: "foreman" | "engineer"
  requested_at: Date
  days_waiting: number
}

/** Sign-offs for one company still unsigned after `olderThanDays` days, oldest first. */
export async function listOutstandingSignOffs(
  db: Pool,
  companyId: number,
  olderThanDays: number,
): Promise<OutstandingSignOff[]> {
  const { rows } = await db.query<Row>(
    `SELECT s.id, p.code AS project_code, l.code AS lot_code, s.signer_role, s.requested_at,
            extract(day FROM now() - s.requested_at)::int AS days_waiting
     FROM sign_offs s
     JOIN lot_checklists lc ON lc.id = s.lot_checklist_id
     JOIN lots l            ON l.id = lc.lot_id
     JOIN projects p        ON p.id = l.project_id
     WHERE p.company_id = $1
       AND s.signed_at IS NULL
       AND s.requested_at < now() - make_interval(days => $2)
     ORDER BY s.requested_at`,
    [companyId, olderThanDays],
  )
  return rows.map((r) => ({
    id: Number(r.id),
    projectCode: r.project_code,
    lotCode: r.lot_code,
    signerRole: r.signer_role,
    requestedAt: r.requested_at,
    daysWaiting: r.days_waiting,
  }))
}
```

Notice that `company_id` is a parameter in the `WHERE`. In a multi-tenant app the tenant filter belongs in every query, and it should come from the authenticated session, never from the request body. `make_interval(days => $2)` keeps the number a bound value instead of splicing it into an interval string.

And the version you must never write:

```ts norun
// ❌ injectable: lotCode = "x' OR '1'='1" returns every company's lots
const { rows } = await pool.query(`SELECT * FROM lots WHERE code = '${lotCode}'`)
```

## Exercises

### Fix the injection [1]

This search is injectable. Rewrite it with parameters, keeping the "contains, case-insensitive" behaviour, and make sure a user typing `%` doesn't match everything.

```ts norun
export const searchLots = (db: Pool, projectId: number, term: string) =>
  db.query(`SELECT id, code, description FROM lots
            WHERE project_id = ${projectId} AND description ILIKE '%${term}%'`)
```

#### Solution

```ts file=src/searchLots.ts group=sql-ts
import type { Pool } from "pg"

// escape LIKE wildcards in user input so they match literally (backslash is the default escape character)
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c)

export async function searchLots(db: Pool, projectId: number, term: string) {
  const { rows } = await db.query<{ id: string; code: string; description: string }>(
    `SELECT id, code, description FROM lots
     WHERE project_id = $1 AND description ILIKE '%' || $2 || '%'
     ORDER BY code`,
    [projectId, escapeLike(term)],
  )
  return rows
}
```

The wildcards stay in the SQL text and the user's term is concatenated *inside the database* as a value. `searchLots(pool, 1, "slab")` returns the four slab lots on project 1. `searchLots(pool, 1, "%")` now returns nothing, instead of everything.

### A safe user-chosen sort [2]

The lots table UI lets users sort by `code`, `description` or `opened_at`, ascending or descending, via query-string values. Write `listLots(db, projectId, sort, direction)` so that no query-string value ever reaches the SQL text directly.

#### Solution

```ts file=src/listLots.ts group=sql-ts
import type { Pool } from "pg"

const SORT_COLUMNS = {
  code: "l.code",
  description: "l.description",
  opened: "l.opened_at",
} as const

export type LotSort = keyof typeof SORT_COLUMNS

export async function listLots(db: Pool, projectId: number, sort: string, direction: string) {
  // unknown input falls back to a default instead of reaching the SQL
  const column = SORT_COLUMNS[sort as LotSort] ?? SORT_COLUMNS.code
  const dir = direction === "desc" ? "DESC" : "ASC"
  const { rows } = await db.query<{ id: string; code: string; description: string; opened_at: Date }>(
    `SELECT l.id, l.code, l.description, l.opened_at
     FROM lots l
     WHERE l.project_id = $1
     ORDER BY ${column} ${dir}, l.id`,
    [projectId],
  )
  return rows
}
```

Interpolation is acceptable here *only* because both interpolated pieces come from constants in our own code. Say exactly that when you explain it. The trailing `l.id` makes the order deterministic for ties, which matters for pagination.

### A transaction helper [2]

Write `withTransaction(pool, fn)`, which checks out a client, runs `BEGIN`, calls `fn(client)`, commits, rolls back on any error (then rethrows), and always releases the client. Use it to sign a sign-off *and* close its lot (set `closed_at`) atomically.

#### Solution

```ts file=src/withTransaction.ts group=sql-ts
import type { Pool, PoolClient } from "pg"

export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}

export async function signAndCloseLot(pool: Pool, signOffId: number, userId: number) {
  return withTransaction(pool, async (client) => {
    const signed = await client.query<{ lot_checklist_id: string }>(
      `UPDATE sign_offs SET signed_by = $2, signed_at = now()
       WHERE id = $1 AND signed_at IS NULL
       RETURNING lot_checklist_id`,
      [signOffId, userId],
    )
    if (signed.rowCount === 0) throw new Error(`Sign-off ${signOffId} is already signed or doesn't exist`)
    await client.query(
      `UPDATE lots SET closed_at = now()
       WHERE id = (SELECT lot_id FROM lot_checklists WHERE id = $1)`,
      [signed.rows[0].lot_checklist_id],
    )
    return Number(signed.rows[0].lot_checklist_id)
  })
}
```

The generic `T` lets callers get a typed result out of the transaction. Every statement inside must use `client`, not `pool`: `pool.query` would run on a *different* connection, outside the transaction. That's a classic bug. (A real rule would only close the lot once *all* its checklists are signed off. The previous lessons have the query for that.)

### Raw SQL vs a query builder [2]

Rewrite `searchLots` using Kysely, a typed query builder. Then give two advantages and one risk compared with your raw version.

#### Solution

```ts file=src/kysely.ts group=sql-ts
import { Kysely, PostgresDialect, type Generated } from "kysely"
import { pool } from "./db"

interface LotsTable {
  id: Generated<string> // bigint → string, as with pg
  project_id: string
  code: string
  description: string
  location: string | null
  opened_at: Generated<Date>
  closed_at: Date | null
}

export interface Database {
  lots: LotsTable
}

export const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) })

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c)

export const searchLotsKysely = (projectId: number, term: string) =>
  db
    .selectFrom("lots")
    .select(["id", "code", "description"])
    .where("project_id", "=", String(projectId))
    .where("description", "ilike", `%${escapeLike(term)}%`)
    .orderBy("code")
    .execute()
```

Advantages: column names and result types are checked by the compiler (misspell `descripton` and it won't build), and values are always parameterised, so the injection mistake is hard to make. Dynamic conditions, like adding a `where` only if a filter is set, are also plain code instead of string building. Risk: the `Database` interface can drift from the real schema unless it's generated from it (tools like kysely-codegen exist for this). And for the gnarly reporting queries you'll still want raw SQL via Kysely's `sql` template tag, so the team needs both skills. Note the `%…%` here is built in TypeScript, but it's still sent as a bound parameter, not spliced into SQL.

## Say it aloud

"How do you prevent SQL injection, and are there cases parameterised queries don't cover?"

#### Model answer

The main defence is to never build SQL text from user input. I use parameterised queries, placeholders like $1 with values sent separately, so the database parses the statement before it ever sees the values. A value can't change the query's structure no matter what it contains. A query builder or ORM does this automatically, which is one of their benefits. Parameters don't cover identifiers, so things like a user-chosen sort column or direction can't be placeholders. There I map the input through an allowlist of known column names in code and fall back to a default, so only constants ever get interpolated. Another subtle one is LIKE: the value is safe, but percent and underscore inside it still act as wildcards, so I escape them if users shouldn't search with patterns. Beyond that, defence in depth: the app's database user gets only the privileges it needs, tenant filters come from the authenticated session rather than the request body, and I'd flag any template literal containing SQL in code review.
