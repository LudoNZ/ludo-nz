## Explanation

You'll deploy a small TypeScript **sign-off API** to your own AWS account with Serverless Framework, test it, call it, and then **tear it down**. Expect about an hour the first time. The goal is to be able to say "I've deployed and torn down a Lambda/API Gateway service with IaC and tests", and to have hit the real errors (permissions, event shapes) yourself.

**Why DynamoDB here, not RDS?** RDS means a VPC, subnets, security groups and a database instance that bills by the hour while it exists. That's a lot of setup for a learning exercise, and easy to forget to delete. DynamoDB with on-demand capacity has no servers or VPC, and is deleted with the stack. The architecture is the same either way: a thin Lambda adapter → a pure core → a repository interface. The repository is the only part that changes for Postgres, and you've already written its SQL (the conditional `UPDATE` from the SQL module). Say exactly that if asked.

**Before you start:**

1. An AWS account you control, with MFA on the root user, an admin IAM user or SSO for yourself (not root), and a **budget alert**. Read the current [AWS Free Tier](https://aws.amazon.com/free/) terms. This course doesn't quote prices.
2. The AWS CLI ([install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)) with a profile (`aws configure sso` or `aws configure`), or use `serverless login aws`.
3. Serverless Framework v4 installed and logged in (previous lesson).
4. Node 22.12+ locally (Vitest 5's minimum). The functions run on `nodejs24.x`.

**Design.**

| Route | Does |
| --- | --- |
| `POST /sign-offs` | create a sign-off request `{ lotChecklistId, signerRole }` → 201 with its id |
| `GET /sign-offs/{id}` | fetch one → 200 or 404 |
| `POST /sign-offs/{id}/sign` | sign it as the caller → 200, 404, or 409 if already signed |

The "caller" comes from an `x-user-id` header. **That's a stand-in for real authentication**: anyone who knows the URL can call this API. Keep the stack up only while you're using it, and in a real system validate a JWT with an API Gateway authorizer instead.

**The important bit is the conditional write.** DynamoDB's `ConditionExpression: "attribute_exists(id) AND attribute_not_exists(signedAt)"` makes "sign only if not yet signed" atomic, just like `UPDATE … WHERE signed_at IS NULL`. If the condition fails, the SDK throws `ConditionalCheckFailedException` and nothing is written. That's your 409 (or 404, after one read to tell which). Same idea, different database: a strong point to make in the interview.

**Structure** (each file is in the worked example):

- `src/core.ts`: pure validation and the sign-off rules. No AWS imports.
- `src/repo.ts`: a `SignOffRepo` interface, an in-memory implementation for tests, and a DynamoDB implementation.
- `src/handlers.ts`: API Gateway adapters that parse the event, call the core and repo, and shape the HTTP response.
- `serverless.yml`: table, functions, routes, per-function least-privilege IAM.
- Tests: core and handlers run against the in-memory repo. The DynamoDB repo is tested with a stubbed client to check the condition and the error mapping.

## Worked example

```json file=package.json group=aws-project
{
  "name": "signoff-api",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.0.0",
    "@aws-sdk/lib-dynamodb": "^3.0.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.0.0",
    "vitest": "^5.0.0"
  }
}
```

```ts file=src/core.ts group=aws-project
export type SignerRole = "foreman" | "engineer"

export interface SignOff {
  id: string
  lotChecklistId: number
  signerRole: SignerRole
  requestedBy: string
  requestedAt: string
  signedBy?: string
  signedAt?: string
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseCreateRequest(body: unknown): Parsed<{ lotChecklistId: number; signerRole: SignerRole }> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Body must be a JSON object" }
  const { lotChecklistId, signerRole } = body as Record<string, unknown>
  if (!Number.isInteger(lotChecklistId) || (lotChecklistId as number) <= 0) {
    return { ok: false, error: "lotChecklistId must be a positive integer" }
  }
  if (signerRole !== "foreman" && signerRole !== "engineer") {
    return { ok: false, error: "signerRole must be 'foreman' or 'engineer'" }
  }
  return { ok: true, value: { lotChecklistId: lotChecklistId as number, signerRole } }
}
```

```ts file=src/repo.ts group=aws-project
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb"
import type { SignOff } from "./core"

export type SignResult = { status: "signed"; signOff: SignOff } | { status: "already_signed"; signOff: SignOff } | { status: "not_found" }

export interface SignOffRepo {
  create(s: SignOff): Promise<void>
  get(id: string): Promise<SignOff | undefined>
  sign(id: string, userId: string, at: string): Promise<SignResult>
}

/** For tests: same contract, no AWS. */
export function memoryRepo(): SignOffRepo {
  const items = new Map<string, SignOff>()
  return {
    async create(s) {
      items.set(s.id, { ...s })
    },
    async get(id) {
      const s = items.get(id)
      return s && { ...s }
    },
    async sign(id, userId, at) {
      const s = items.get(id)
      if (!s) return { status: "not_found" }
      if (s.signedAt) return { status: "already_signed", signOff: { ...s } }
      Object.assign(s, { signedBy: userId, signedAt: at })
      return { status: "signed", signOff: { ...s } }
    },
  }
}

export function dynamoRepo(doc: Pick<DynamoDBDocumentClient, "send">, tableName: string): SignOffRepo {
  return {
    async create(s) {
      await doc.send(new PutCommand({ TableName: tableName, Item: s, ConditionExpression: "attribute_not_exists(id)" }))
    },
    async get(id) {
      const res = await doc.send(new GetCommand({ TableName: tableName, Key: { id } }))
      return res.Item as SignOff | undefined
    },
    async sign(id, userId, at) {
      try {
        const res = await doc.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { id },
            // atomic check-and-set: the DynamoDB version of UPDATE ... WHERE signed_at IS NULL
            ConditionExpression: "attribute_exists(id) AND attribute_not_exists(signedAt)",
            UpdateExpression: "SET signedBy = :u, signedAt = :t",
            ExpressionAttributeValues: { ":u": userId, ":t": at },
            ReturnValues: "ALL_NEW",
          }),
        )
        return { status: "signed", signOff: res.Attributes as SignOff }
      } catch (err) {
        if (!(err instanceof ConditionalCheckFailedException)) throw err
        const existing = await this.get(id)
        return existing ? { status: "already_signed", signOff: existing } : { status: "not_found" }
      }
    },
  }
}
```

```ts file=src/handlers.ts group=aws-project
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"
import { randomUUID } from "node:crypto"
import { parseCreateRequest } from "./core"
import { dynamoRepo, type SignOffRepo } from "./repo"

type Handler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2>

const json = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
})

/** Builds the three handlers around a repo and a clock, so tests can inject both. */
export function makeHandlers(repo: SignOffRepo, now: () => Date = () => new Date()) {
  const userId = (e: APIGatewayProxyEventV2) => e.headers?.["x-user-id"] // stand-in for real auth

  const create: Handler = async (event) => {
    const caller = userId(event)
    if (!caller) return json(401, { error: "x-user-id header required" })
    let body: unknown
    try {
      body = JSON.parse(event.body ?? "")
    } catch {
      return json(400, { error: "Body must be valid JSON" })
    }
    const parsed = parseCreateRequest(body)
    if (!parsed.ok) return json(400, { error: parsed.error })
    const signOff = { id: randomUUID(), ...parsed.value, requestedBy: caller, requestedAt: now().toISOString() }
    await repo.create(signOff)
    return json(201, signOff)
  }

  const get: Handler = async (event) => {
    const found = await repo.get(event.pathParameters?.id ?? "")
    return found ? json(200, found) : json(404, { error: "Sign-off not found" })
  }

  const sign: Handler = async (event) => {
    const caller = userId(event)
    if (!caller) return json(401, { error: "x-user-id header required" })
    const result = await repo.sign(event.pathParameters?.id ?? "", caller, now().toISOString())
    if (result.status === "not_found") return json(404, { error: "Sign-off not found" })
    if (result.status === "already_signed") return json(409, { error: `Already signed by ${result.signOff.signedBy}` })
    return json(200, result.signOff)
  }

  return { create, get, sign }
}

// Lambda entry points: real DynamoDB, created once per execution environment
const live = makeHandlers(
  dynamoRepo(DynamoDBDocumentClient.from(new DynamoDBClient({})), process.env.SIGN_OFFS_TABLE ?? ""),
)
export const create = live.create
export const get = live.get
export const sign = live.sign
```

```yaml file=serverless.yml group=aws-project
service: signoff-api
frameworkVersion: '4'

provider:
  name: aws
  runtime: nodejs24.x
  region: ap-southeast-2
  stage: dev
  environment:
    SIGN_OFFS_TABLE: ${self:service}-${sls:stage}-sign-offs

functions:
  create:
    handler: src/handlers.create
    iam:
      role:
        statements:
          - Effect: Allow
            Action: dynamodb:PutItem
            Resource: !GetAtt SignOffsTable.Arn
    events:
      - httpApi:
          method: POST
          path: /sign-offs
  get:
    handler: src/handlers.get
    iam:
      role:
        statements:
          - Effect: Allow
            Action: dynamodb:GetItem
            Resource: !GetAtt SignOffsTable.Arn
    events:
      - httpApi:
          method: GET
          path: /sign-offs/{id}
  sign:
    handler: src/handlers.sign
    iam:
      role:
        statements:
          - Effect: Allow
            Action:
              - dynamodb:UpdateItem
              - dynamodb:GetItem
            Resource: !GetAtt SignOffsTable.Arn
    events:
      - httpApi:
          method: POST
          path: /sign-offs/{id}/sign

resources:
  Resources:
    SignOffsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:service}-${sls:stage}-sign-offs
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
```

Each function's role can do exactly what that function needs to this one table, and no more. `sign` needs `GetItem` too, because it reads the item after a failed condition to tell 404 from 409.

**Run it:**

```bash
npm install
npm test                              # unit + handler tests, no AWS needed
npx tsc --noEmit

serverless deploy --stage dev         # prints the HTTP API URL
API=https://<api-id>.execute-api.ap-southeast-2.amazonaws.com

curl -s -X POST "$API/sign-offs" -H 'x-user-id: dave' -H 'content-type: application/json' \
  -d '{"lotChecklistId": 12, "signerRole": "engineer"}'
# → 201 {"id":"<uuid>", ...}

curl -s -X POST "$API/sign-offs/<uuid>/sign" -H 'x-user-id: chloe'   # → 200
curl -s -X POST "$API/sign-offs/<uuid>/sign" -H 'x-user-id: finn'    # → 409 Already signed by chloe

serverless logs -f sign --stage dev   # see the invocations in CloudWatch
```

**Tear it down** (do this the same day):

```bash
serverless remove --stage dev

# confirm the stack is gone; this should report that the stack does not exist
aws cloudformation describe-stacks --stack-name signoff-api-dev --region ap-southeast-2

# and that nothing is left behind
aws dynamodb list-tables --region ap-southeast-2
aws lambda list-functions --region ap-southeast-2 --query 'Functions[].FunctionName'
```

`serverless remove` deletes the stack: functions, API, table, roles and log groups the stack created. The Serverless docs warn that S3 buckets containing objects, resources with `DeletionPolicy: Retain`, and the framework's deployment bucket can remain. Check the S3 console for a deployment bucket you no longer need, and empty and delete it if you're done with Serverless on this account. Finally, glance at the Billing console a day later.

## Exercises

### Test the handlers without AWS [2]

Write handler tests using `memoryRepo` and a fixed clock: create returns 201 with the caller and time; invalid bodies return 400; signing twice gives 200 then 409 naming the first signer; an unknown id gives 404; a missing `x-user-id` gives 401.

#### Solution

```ts file=src/handlers.test.ts group=aws-project
import type { APIGatewayProxyEventV2 } from "aws-lambda"
import { describe, expect, it } from "vitest"
import { makeHandlers } from "./handlers"
import { memoryRepo } from "./repo"

const NOW = new Date("2026-10-01T08:00:00Z")
const ev = (over: Partial<APIGatewayProxyEventV2>) => ({ headers: {}, ...over }) as APIGatewayProxyEventV2
const body = (r: { body?: string }) => JSON.parse(r.body ?? "null")

describe("sign-off API handlers", () => {
  it("creates a request stamped with the caller and time", async () => {
    const h = makeHandlers(memoryRepo(), () => NOW)
    const res = await h.create(ev({ headers: { "x-user-id": "dave" }, body: JSON.stringify({ lotChecklistId: 12, signerRole: "engineer" }) }))
    expect(res.statusCode).toBe(201)
    expect(body(res)).toMatchObject({ lotChecklistId: 12, signerRole: "engineer", requestedBy: "dave", requestedAt: NOW.toISOString() })
  })

  it.each([
    ["not JSON", "{oops"],
    ["missing role", JSON.stringify({ lotChecklistId: 12 })],
    ["bad id", JSON.stringify({ lotChecklistId: -1, signerRole: "foreman" })],
  ])("rejects a body that is %s", async (_name, raw) => {
    const h = makeHandlers(memoryRepo(), () => NOW)
    const res = await h.create(ev({ headers: { "x-user-id": "dave" }, body: raw }))
    expect(res.statusCode).toBe(400)
  })

  it("signs once, then reports who signed", async () => {
    const h = makeHandlers(memoryRepo(), () => NOW)
    const created = body(await h.create(ev({ headers: { "x-user-id": "dave" }, body: JSON.stringify({ lotChecklistId: 12, signerRole: "engineer" }) })))

    const first = await h.sign(ev({ headers: { "x-user-id": "chloe" }, pathParameters: { id: created.id } }))
    const second = await h.sign(ev({ headers: { "x-user-id": "finn" }, pathParameters: { id: created.id } }))

    expect(first.statusCode).toBe(200)
    expect(body(first)).toMatchObject({ signedBy: "chloe", signedAt: NOW.toISOString() })
    expect(second.statusCode).toBe(409)
    expect(body(second)).toEqual({ error: "Already signed by chloe" })
  })

  it("404s an unknown id and 401s a missing caller", async () => {
    const h = makeHandlers(memoryRepo(), () => NOW)
    expect((await h.sign(ev({ headers: { "x-user-id": "chloe" }, pathParameters: { id: "nope" } }))).statusCode).toBe(404)
    expect((await h.get(ev({ pathParameters: { id: "nope" } }))).statusCode).toBe(404)
    expect((await h.sign(ev({ pathParameters: { id: "x" } }))).statusCode).toBe(401)
  })
})
```

Because `makeHandlers` takes the repo and the clock, the same handler code runs in Lambda with DynamoDB and in Vitest with a `Map`. Note that importing `./handlers` also builds the `live` handlers at module scope. That's harmless here, because creating SDK clients makes no network calls.

### Test the DynamoDB mapping [2]

The memory repo can't prove the DynamoDB repo is right. Without AWS, test that `dynamoRepo.sign` sends an `UpdateCommand` with the conditional expression, and maps `ConditionalCheckFailedException` to `already_signed` or `not_found`. Stub `send`.

#### Solution

```ts file=src/repo.dynamo.test.ts group=aws-project
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb"
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb"
import { describe, expect, it, vi } from "vitest"
import { dynamoRepo } from "./repo"

const conditionFailed = () => new ConditionalCheckFailedException({ message: "The conditional request failed", $metadata: {} })

describe("dynamoRepo.sign", () => {
  it("sends a conditional update", async () => {
    const send = vi.fn().mockResolvedValue({ Attributes: { id: "a", signedBy: "chloe" } })
    const res = await dynamoRepo({ send } as never, "t").sign("a", "chloe", "2026-10-01T08:00:00.000Z")

    expect(res.status).toBe("signed")
    const cmd = send.mock.calls[0][0]
    expect(cmd).toBeInstanceOf(UpdateCommand)
    expect(cmd.input.ConditionExpression).toBe("attribute_exists(id) AND attribute_not_exists(signedAt)")
  })

  it("maps a failed condition on an existing item to already_signed", async () => {
    const send = vi.fn(async (cmd: unknown) => {
      if (cmd instanceof UpdateCommand) throw conditionFailed()
      if (cmd instanceof GetCommand) return { Item: { id: "a", signedBy: "chloe" } }
    })
    const res = await dynamoRepo({ send } as never, "t").sign("a", "finn", "2026-10-01T08:00:00.000Z")
    expect(res).toMatchObject({ status: "already_signed", signOff: { signedBy: "chloe" } })
  })

  it("maps a failed condition on a missing item to not_found", async () => {
    const send = vi.fn(async (cmd: unknown) => {
      if (cmd instanceof UpdateCommand) throw conditionFailed()
      return { Item: undefined }
    })
    expect(await dynamoRepo({ send } as never, "t").sign("x", "finn", "t")).toEqual({ status: "not_found" })
  })

  it("rethrows other errors", async () => {
    const send = vi.fn().mockRejectedValue(new Error("throttled"))
    await expect(dynamoRepo({ send } as never, "t").sign("a", "finn", "t")).rejects.toThrow("throttled")
  })
})
```

These tests check *our* mapping logic and the request we build, not DynamoDB itself. The deployed smoke test (the `curl` 200 then 409) is what proves the condition really works against the real service. Running against DynamoDB Local in Docker would be the integration-test middle ground.

### Swap in Postgres [3]

Describe (or write) what changes to run the same API on RDS Postgres. Which files change, which don't, and what new infrastructure and failure modes appear?

#### Solution

**Unchanged:** `core.ts`, `handlers.ts` (except how `live` is built) and the handler tests. They depend only on the `SignOffRepo` interface. **New:** `pgRepo(pool)`, implementing `sign` with the conditional `UPDATE sign_offs SET signed_by = $2, signed_at = $3 WHERE id = $1 AND signed_at IS NULL RETURNING *`, then on zero rows a `SELECT` to choose between 404 and 409. That's the same shape as the DynamoDB version. Its tests run against a real Postgres (the testing module's integration pattern). **Infrastructure:** an RDS instance in a VPC, the Lambdas attached to the VPC's private subnets with security groups allowing them to reach the database, credentials in Secrets Manager, ideally RDS Proxy in front, and migrations run as part of the deploy. **New failure modes:** connection exhaustion (pool `max: 1`, Proxy, reserved concurrency), cold starts slightly longer with VPC and DB connection set-up, migrations that must stay compatible with the running code, and the database as something to back up, patch and monitor. The repository boundary is what made this a contained change, which is a good design point to make in an interview.

## Say it aloud

"Tell me about something you've deployed on AWS."

#### Model answer

To learn the AWS side properly, I built and deployed a small sign-off API, the same domain as the QA work I've done. It's three Lambda functions behind an API Gateway HTTP API, with a DynamoDB table, all defined in a serverless.yml and deployed with Serverless Framework v4, which bundles the TypeScript with esbuild. I structured it as a pure core for validation, a repository interface, and thin Lambda adapters built by a factory that takes the repository and a clock. That let me test the handlers in Vitest with an in-memory repository, and test the DynamoDB repository by stubbing the client. The key piece is the sign-off itself. It's a conditional update, only set signedAt if it doesn't exist, so two people signing at once can't both succeed, and the loser gets a 409 naming who signed. Each function has its own least-privilege IAM role on that one table. I smoke-tested it with curl, read the logs in CloudWatch, then removed the stack and checked nothing was left. If I did it on RDS instead, only the repository and infrastructure change: I'd add VPC config, RDS Proxy and migrations.
