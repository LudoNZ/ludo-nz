## Explanation

You need to talk sensibly about the main serverless pieces, and the fastest route is mapping each from the Firebase piece you know. The big conceptual shift: **Firebase is one integrated product with sensible defaults. AWS is a box of separate services that you wire together and grant permissions between, explicitly.**

| You know (Firebase / Google Cloud) | AWS | What changes |
| --- | --- | --- |
| Cloud Functions | **Lambda** | Same model: your function runs per event, scales automatically, billed per use. You choose memory (CPU scales with it) and a timeout. The handler receives an *event* whose shape depends on the trigger. |
| HTTPS functions / Hosting rewrites | **API Gateway** (HTTP API) | A separate service that receives HTTP requests and invokes Lambda. Routes, auth (JWT authorizers), CORS and throttling live here. |
| Firestore | **DynamoDB** (closest match) | Serverless NoSQL key-value/document store. You design around access patterns with partition and sort keys. No joins. Conditional writes. |
| (no equivalent; you used Firestore) | **RDS** (managed PostgreSQL/MySQL), **Aurora** | A real relational database. The role's SQL requirement lives here. It runs inside a VPC and has connection limits (next lessons). |
| Firebase Storage (Cloud Storage) | **S3** | Object storage in *buckets*. Clients upload directly with **presigned URLs** issued by your backend, instead of Storage security rules. |
| Pub/Sub, Cloud Tasks | **SQS** (queues), SNS/EventBridge (fan-out, events) | SQS is a durable queue that Lambda polls. It's the standard way to decouple slow or retryable work. Failed messages can go to a **dead-letter queue**. |
| Security rules + service accounts | **IAM** | Every call between AWS services is checked against IAM policies. Your Lambda's *execution role* lists exactly what it may do ("PutItem on this table"). End-user login is a separate service (Cognito, or your own auth). |
| Cloud Logging / Monitoring | **CloudWatch** | Logs (Lambda's `console.log` goes here automatically), metrics, dashboards and alarms. |
| `firebase.json` + `firebase deploy` | **CloudFormation**, usually via Serverless Framework, SAM or CDK | Infrastructure as code. Your YAML or TS describes resources, and deploy creates or updates a *stack*. |

**Request flow for a typical serverless API:** Browser → API Gateway (auth, routing) → Lambda (your TypeScript) → RDS via RDS Proxy, or DynamoDB → response. Slow work (generate a PDF report, resize photos) is put on SQS and processed by another Lambda.

**Regions.** Resources live in a region you choose, typically the one closest to users. For New Zealand the options are `ap-southeast-6` (Asia Pacific (New Zealand), an opt-in region you must enable on the account first) and the long-established `ap-southeast-2` (Sydney). Check that every service you need is available in a region before choosing it ([AWS Regions](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html)). Data residency can matter to construction clients.

**Accounts and cost hygiene.** Use a personal AWS account for practice, enable MFA on the root user and don't use root day to day, set a budget alert, and **tear down** what you deploy. The free tier's structure changes over time, so read the current terms on the [AWS Free Tier page](https://aws.amazon.com/free/). This course deliberately doesn't quote prices.

**Things that surprise Firebase developers:**

- **Nothing can talk to anything** until IAM allows it. "AccessDenied" is the first error you'll meet.
- **Databases in a VPC.** RDS sits in a private network, so a Lambda that talks to it must be configured into that VPC. AWS's guidance: "To connect to a database, your function must be in the same Amazon VPC where your database runs" ([Lambda with RDS](https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html)).
- **Event shapes vary by trigger.** An API Gateway HTTP API event (payload v2.0) has `pathParameters`, `body` (a string!) and `requestContext`. An SQS event has `Records[]`. Type them with `@types/aws-lambda`.
- **No real-time listeners.** There's no `onSnapshot` built in. Push updates need WebSockets (API Gateway WebSocket APIs, AppSync) or polling.

## Worked example

**Photo upload, both ways.** In Firebase, the client calls `uploadBytes(ref(storage, path), file)` and Storage security rules decide whether that user may write that path.

On AWS the common pattern is a presigned URL:

1. The client asks *your* API: `POST /responses/123/photos/upload-url`.
2. Your Lambda checks the user may attach photos to response 123 (tenant, project membership), then asks the S3 SDK to **sign** a URL that allows exactly one `PUT` of one object key, expiring in a few minutes.
3. The client `PUT`s the file straight to S3 with that URL, so the bytes never pass through Lambda.
4. The client (or an S3 event → Lambda) records the photo row in the database.

Generating the signed URL is local cryptography with the Lambda's credentials. It doesn't even call AWS:

```ts file=src/uploadUrl.ts group=aws-map
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const s3 = new S3Client({}) // region and credentials come from the Lambda environment

export async function photoUploadUrl(opts: {
  bucket: string
  companyId: number
  projectId: number
  responseId: number
  photoNumber: number
}) {
  const key = `companies/${opts.companyId}/projects/${opts.projectId}/responses/${opts.responseId}/${opts.photoNumber}.jpg`
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: opts.bucket, Key: key, ContentType: "image/jpeg" }),
    { expiresIn: 300 }, // seconds
  )
  return { key, url }
}
```

The key layout matches `photos.storage_key` in the seed database, and it starts with the company, so a bucket policy or lifecycle rule can work per tenant. The Lambda's IAM role needs `s3:PutObject` on that bucket's objects. The URL inherits the *signer's* permissions, limited to that one key and method. See [S3 presigned uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html).

## Exercises

### Map an architecture [1]

Here's a Firebase design: Hosting serves a Next.js app; an HTTPS Cloud Function handles `/api/*`; Firestore stores data; a Firestore-triggered function generates a PDF report when a lot is closed and saves it to Storage; Firebase Auth handles login. Name the AWS equivalent for each part.

#### Solution

- Next.js hosting → S3 + CloudFront for static assets, or a managed option such as Amplify Hosting. (Many teams keep the frontend wherever is simplest.)
- HTTPS function `/api/*` → API Gateway HTTP API + Lambda functions.
- Firestore → RDS PostgreSQL for relational data (this role), or DynamoDB for key-value access patterns.
- Firestore trigger on lot close → the API (or a database event) puts a message on **SQS** → a report Lambda consumes it. Prefer an explicit message over a database trigger: it's easier to retry, observe and test.
- Storage for PDFs → S3, downloaded via presigned GET URLs.
- Firebase Auth → Cognito user pools, or an external identity provider, validated by an API Gateway JWT authorizer.

### Test the presigned URL [2]

Write a unit test for `photoUploadUrl` that runs with **no AWS account**: give the SDK fake credentials and a region, and assert the key layout, the bucket host, the expiry and that it's signed. Why does this work offline?

#### Solution

```ts file=src/uploadUrl.test.ts group=aws-map
import { beforeAll, expect, it } from "vitest"

beforeAll(() => {
  // the default credential chain reads these, so the client needs no real account
  process.env.AWS_REGION = "ap-southeast-2"
  process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLEEXAMPLE00"
  process.env.AWS_SECRET_ACCESS_KEY = "not-a-real-secret"
})

it("signs a short-lived PUT for a tenant-scoped key", async () => {
  const { photoUploadUrl } = await import("./uploadUrl")

  const { key, url } = await photoUploadUrl({ bucket: "qa-photos-dev", companyId: 1, projectId: 2, responseId: 123, photoNumber: 1 })
  const u = new URL(url)

  expect(key).toBe("companies/1/projects/2/responses/123/1.jpg")
  expect(u.hostname).toBe("qa-photos-dev.s3.ap-southeast-2.amazonaws.com")
  expect(u.pathname).toBe("/companies/1/projects/2/responses/123/1.jpg")
  expect(u.searchParams.get("X-Amz-Expires")).toBe("300")
  expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/)
})
```

Signing is just an HMAC over the request using the secret key, computed locally. AWS only checks it when the URL is *used*. The env vars are set before importing the module because the `S3Client` is created at module load (a common Lambda pattern, as the cold-starts lesson explains). A real upload test would need a bucket, which is integration territory.

### Explain IAM to a Firebase developer [1]

In three or four sentences, explain to a teammate who knows only Firebase why their new Lambda gets `AccessDeniedException` writing to a DynamoDB table, and how to fix it properly.

#### Solution

In AWS every call between services is authorised by IAM, not by app-level security rules. The Lambda runs as an *execution role*, and that role has no permission to write to the table yet. The fix is to add a policy statement to the function's role allowing `dynamodb:PutItem` (and only the actions it needs) on *that table's ARN*, not `dynamodb:*` on `*`. With Serverless Framework that's an `iam.role.statements` entry in `serverless.yml`, so the permission is versioned with the code.

## Say it aloud

"You've mainly used Firebase. How would you describe the AWS serverless equivalents, and what's genuinely different?"

#### Model answer

The mapping is quite direct. Cloud Functions become Lambda, the HTTP side becomes API Gateway in front of Lambda, Firebase Storage becomes S3, Pub/Sub or Cloud Tasks become SQS, logging and monitoring become CloudWatch, and for data it's DynamoDB if you want something Firestore-like or RDS Postgres for relational data. What's genuinely different is that AWS is a set of separate services you wire together explicitly. Every interaction is authorised by IAM, so each Lambda has an execution role with least-privilege permissions on specific resources. That's more work, but much clearer than broad service accounts. Patterns change too. Instead of client SDKs talking to the database under security rules, the client talks to my API, and for files my API hands out short-lived presigned URLs so uploads go straight to S3. A relational database lives in a VPC with connection limits, which shapes how Lambdas connect. And infrastructure is defined as code, in something like Serverless Framework or CDK, deployed through CloudFormation. That's honestly where I have the least hands-on experience, so I've been [say what you've actually done, e.g. deploying and tearing down a small sign-off API] to learn it properly.
