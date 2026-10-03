## Explanation

This is where serverless design questions actually go: not "what is Lambda" but "what goes wrong, and what do you do about it".

**Cold starts.** Lambda runs your code in *execution environments*. When none is free, Lambda creates one: it downloads your code, starts the runtime, and runs your module's top-level code (the "init" phase). Then it calls your handler. That first request is slower. Later requests reuse the warm environment, including anything you created at module scope ([execution environment lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html)). What helps:

- Create clients (database pool, SDK clients) **once at module scope**, not per request.
- Keep bundles small. v4's esbuild bundling helps, and avoid giant dependencies.
- More memory also means more CPU, so init can be faster.
- For strict latency needs, provisioned concurrency keeps environments warm (at a cost).
- For a QA app, an occasional slower first request is usually acceptable. Say that you'd *measure* (init duration appears in the `REPORT` log line) before optimising.

Firebase parallel: Cloud Functions have exactly the same cold-start behaviour. You've probably seen it.

**Database connections from Lambda**, the classic gotcha. Each concurrent Lambda environment holds its own connections. With 200 concurrent requests and a pool of 10 each, that's 2,000 connections, and Postgres falls over long before that. Mitigations:

- Pool size **1** per environment (one environment handles one request at a time), created at module scope.
- **RDS Proxy** sits between Lambda and Postgres and multiplexes many client connections onto a few database connections. AWS: "proxies are recommended for production" ([Lambda with RDS](https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html)).
- Cap the function's reserved concurrency so it can't exceed what the database can take.
- Alternatives: an HTTP-based data API for Aurora, or DynamoDB, which has no connections at all.

**Retries.** How a failure is retried depends on how the function was invoked ([retry behaviour](https://docs.aws.amazon.com/lambda/latest/dg/invocation-retries.html)):

- **Synchronous** (API Gateway): no automatic retry. The error goes back to the client, and the *client* may retry.
- **Asynchronous** (S3 events, EventBridge): Lambda "retries function errors twice", then can send the event to a dead-letter queue or failure destination.
- **SQS**: a failed message becomes visible again after the queue's **visibility timeout** and is retried, until `maxReceiveCount`, then it goes to the queue's **DLQ**. By default *one* failure fails the whole batch. With `ReportBatchItemFailures` you return only the failed message IDs ([SQS error handling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html)).

**Idempotency** follows directly: since anything can run twice (client retries, SQS at-least-once delivery, a timeout after the work actually finished), every handler with side effects must be safe to repeat. AWS's retry docs say to "ensure that your function's code can handle the same event multiple times without causing duplicate transactions or other unwanted side effects." Techniques:

- **Natural idempotency**: "set signed_at if it's null" is safe to repeat. "Increment a counter" is not.
- **Idempotency keys**: the client sends `Idempotency-Key: <uuid>` (or you use the SQS `messageId`). Record it in a table with a unique constraint *in the same transaction* as the side effect. A repeat hits the constraint and is skipped.
- **Conditional writes**: SQL `WHERE` conditions, DynamoDB `ConditionExpression`.
- Libraries: [Powertools for AWS Lambda (TypeScript) idempotency](https://docs.aws.amazon.com/powertools/typescript/latest/features/idempotency/).

**Dead-letter queues** hold messages that keep failing, so one poison message doesn't block or loop forever. A DLQ is only useful if someone *looks*: alarm on its depth, and have a redrive process.

**Least-privilege IAM.** Each function's role allows only the actions it needs, on specific resource ARNs. No `*:*`, no shared god-role. The blast radius of a bug or a leaked credential is then one function's permissions. Also: secrets in Secrets Manager or SSM rather than plain environment variables, and separate accounts or stages for prod. See [IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html).

## Worked example

An SQS consumer that generates a lot report. It's idempotent via a `processed_messages` table, and reports only the failed messages. The pool is created once per environment with `max: 1`:

```ts file=src/handlers/generateReport.ts group=aws-tradeoffs
import type { SQSBatchResponse, SQSEvent } from "aws-lambda"
import pg from "pg"

// module scope: created once per execution environment, reused while warm
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })

interface ReportJob {
  lotId: number
}

/** Does the work once per message id, even if SQS delivers it twice. */
export async function processJob(db: pg.Pool, messageId: string, job: ReportJob): Promise<"done" | "duplicate"> {
  const client = await db.connect()
  try {
    await client.query("BEGIN")
    const claimed = await client.query(
      "INSERT INTO processed_messages (message_id) VALUES ($1) ON CONFLICT (message_id) DO NOTHING",
      [messageId],
    )
    if (claimed.rowCount === 0) {
      await client.query("ROLLBACK")
      return "duplicate"
    }
    const lot = await client.query("SELECT id FROM lots WHERE id = $1", [job.lotId])
    if (lot.rowCount === 0) throw new Error(`Lot ${job.lotId} not found`)
    // the real work: here, record that a report was generated
    await client.query("INSERT INTO lot_reports (lot_id, message_id) VALUES ($1, $2)", [job.lotId, messageId])
    await client.query("COMMIT")
    return "done"
  } catch (err) {
    await client.query("ROLLBACK") // also releases the claim, so a retry can try again
    throw err
  } finally {
    client.release()
  }
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchResponse["batchItemFailures"] = []
  for (const record of event.Records) {
    try {
      await processJob(pool, record.messageId, JSON.parse(record.body) as ReportJob)
    } catch (err) {
      console.error(JSON.stringify({ msg: "report job failed", messageId: record.messageId, error: String(err) }))
      batchItemFailures.push({ itemIdentifier: record.messageId })
    }
  }
  return { batchItemFailures }
}
```

The supporting tables (a migration):

```sql
CREATE TABLE processed_messages (
  message_id   text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE lot_reports (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  lot_id       bigint NOT NULL REFERENCES lots (id),
  message_id   text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
```

Three properties to point out: the claim and the work commit **together**, so a crash midway leaves no claim and the retry redoes the work cleanly. A duplicate delivery is a no-op. And a bad message (a lot that doesn't exist) fails alone. It's retried until `maxReceiveCount`, then goes to the DLQ, while the good messages in the same batch complete.

## Exercises

### Prove it's idempotent [2]

Write tests for `handler`: (1) the same message delivered twice produces one report; (2) a batch with one good and one bad message reports only the bad one's id. Use a real Postgres via `DATABASE_URL`, with the two tables created in `beforeAll`.

#### Solution

```ts file=src/handlers/generateReport.test.ts group=aws-tradeoffs
import type { SQSEvent, SQSRecord } from "aws-lambda"
import pg from "pg"
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest"
import { handler } from "./generateReport"

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })

beforeAll(async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS processed_messages (message_id text PRIMARY KEY, processed_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS lot_reports (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      lot_id bigint NOT NULL REFERENCES lots (id), message_id text NOT NULL, generated_at timestamptz NOT NULL DEFAULT now());`)
})
beforeEach(async () => {
  await db.query("TRUNCATE processed_messages, lot_reports")
})
afterAll(async () => {
  await db.end()
})

const record = (messageId: string, body: unknown) => ({ messageId, body: JSON.stringify(body) }) as SQSRecord
const event = (...records: SQSRecord[]): SQSEvent => ({ Records: records })

it("generates one report even when a message is delivered twice", async () => {
  await handler(event(record("m-1", { lotId: 1 })))
  const again = await handler(event(record("m-1", { lotId: 1 })))

  expect(again.batchItemFailures).toEqual([])
  const { rows } = await db.query("SELECT count(*)::int AS n FROM lot_reports WHERE message_id = 'm-1'")
  expect(rows[0].n).toBe(1)
})

it("fails only the bad message in a batch, and keeps the good one's work", async () => {
  const res = await handler(event(record("ok-1", { lotId: 2 }), record("bad-1", { lotId: 999999 })))

  expect(res.batchItemFailures).toEqual([{ itemIdentifier: "bad-1" }])
  const { rows } = await db.query("SELECT message_id FROM lot_reports ORDER BY message_id")
  expect(rows.map((r) => r.message_id)).toEqual(["ok-1"])
  const claims = await db.query("SELECT message_id FROM processed_messages")
  expect(claims.rows.map((r) => r.message_id)).toEqual(["ok-1"]) // the failed claim was rolled back
})
```

The SQS event objects are built by hand with only the fields the handler reads, cast to the SDK type. That's a pragmatic, common shortcut in handler tests. The last assertion proves the rollback released the failed message's claim, so its retry won't be wrongly skipped as a duplicate.

### Connection maths [2]

Your API Lambda keeps `new Pool({ max: 10 })` at module scope. RDS Postgres allows about 100 connections. During a site-wide morning rush, the function reaches 40 concurrent executions. What happens, and what are three fixes, in order of preference?

#### Solution

Up to 40 environments × up to 10 connections = 400 potential connections, against a limit of about 100. New connections start failing ("too many connections"), errors cascade, client retries make it worse, and other services sharing the database fail too. In practice each environment handles one request at a time and rarely opens all 10, but you can't rely on that. Fixes:

1. **`max: 1`** per environment. One request per environment never needs more.
2. **RDS Proxy** in front of the database, to pool and multiplex connections across all environments. This is AWS's production recommendation.
3. **Reserved concurrency** on the function as a hard cap matched to database capacity, plus alarms on database connections. Optionally move hot read paths to a cache.

Also mention: make sure handlers don't leak clients (always `release()` in `finally`).

### Idempotency for an HTTP API [3]

A foreman on 3G taps "Submit response". The request reaches the server and commits, but the response is lost, so the app retries and creates a duplicate response row. Design the fix for `POST /lot-checklists/:id/responses`. Write the table and the single SQL statement that inserts the response at most once per idempotency key.

#### Solution

The client generates a UUID per *user action* (not per HTTP attempt), stores it with the queued submission, and sends it as an `Idempotency-Key` header on every retry. The server records the key with the response, protected by a unique constraint, and returns the original result on a repeat:

```sql
ALTER TABLE responses ADD COLUMN idempotency_key uuid;
CREATE UNIQUE INDEX responses_idempotency_key_idx ON responses (idempotency_key);

WITH ins AS (
  INSERT INTO responses (lot_checklist_id, checklist_item_id, result, responded_by, idempotency_key)
  VALUES (1, 1, 'pass', 3, 'a3c1e1c2-6f1a-4f51-9d4e-0f3f6a1b2c3d')
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id, true AS created
)
SELECT id, created FROM ins
UNION ALL
SELECT id, false FROM responses WHERE idempotency_key = 'a3c1e1c2-6f1a-4f51-9d4e-0f3f6a1b2c3d'
  AND NOT EXISTS (SELECT 1 FROM ins);
```

The first call returns `created = true` (respond 201). A retry returns the *same id* with `created = false` (respond 200 with the same body). The client can't tell the difference, which is the point. A unique index allows any number of NULLs, so old rows without keys are fine. Scope keys per user or tenant if they could collide, and say how long you keep them. This same pattern is the core of the offline-sync design case.

## Say it aloud

"What are the main trade-offs and pitfalls of building on Lambda, especially with a relational database?"

#### Model answer

The first is cold starts. A new execution environment has to load the code and run init, so I create clients like the database pool once at module scope, keep bundles small, and measure init duration before reaching for provisioned concurrency. For a QA app the odd slower request is usually fine. The bigger one with Postgres is connections. Every concurrent environment holds its own connections, so a burst can exhaust the database. I'd use a pool of one per environment, put RDS Proxy in front, which is what AWS recommends for production, and cap concurrency to what the database can take. Then retries. API Gateway calls don't retry but clients do, async invocations retry twice, and SQS redelivers after the visibility timeout. So everything must be idempotent. I use conditional writes, or an idempotency key stored with a unique constraint in the same transaction as the work. For queues I return partial batch failures so one bad message doesn't retry the whole batch, with a dead-letter queue and an alarm on it so failures get looked at. And each function gets a least-privilege IAM role scoped to the exact resources it touches.
