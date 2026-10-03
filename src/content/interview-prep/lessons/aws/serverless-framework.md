## Explanation

**Serverless Framework** turns one YAML file (`serverless.yml`) into a CloudFormation stack: Lambda functions, their triggers, IAM permissions and any extra resources such as tables and queues. It plays the role `firebase.json` + `firebase deploy` played for you, with more knobs. The role prefers it, so be comfortable reading and writing a config. All syntax here is from the [Serverless Framework v4 docs](https://www.serverless.com/framework/docs/getting-started).

**Installing and licensing (v4).**

```bash
npm i serverless -g
```

On npm versions that block install scripts by default, the docs give `npm i -g --allow-scripts=serverless serverless`. v4 requires authentication: `serverless login` opens a browser, or a license key in CI. Per the [pricing page](https://www.serverless.com/pricing), the CLI is free except for organisations earning over US$2 million a year. AWS credentials are separate: a profile from `aws configure` / `aws configure sso`, or the docs' recommended `serverless login aws` for short-lived credentials ([credentials guide](https://www.serverless.com/framework/docs/providers/aws/guide/credentials)).

**Anatomy of `serverless.yml`:**

- `service`: the name. It becomes part of every resource name.
- `frameworkVersion: '4'`.
- `provider`: `name: aws`, `runtime` (`nodejs24.x` is current; Lambda's runtime list shows Node 20 already deprecated), `region`, default `stage`, `environment` variables for every function, and `iam.role.statements` (permissions for the shared execution role).
- `functions`: each has a `handler` (`src/handlers/signOff.handler` means "file `src/handlers/signOff`, export `handler`") and `events` (what triggers it). Per-function `iam.role.statements`, `timeout` (seconds) and `memorySize` are optional.
- `resources`: raw CloudFormation for anything else (DynamoDB tables, SQS queues, S3 buckets).
- `stages`: per-stage `params`, referenced as `${param:name}`.

**Events you'll meet** ([HTTP API](https://www.serverless.com/framework/docs/providers/aws/events/http-api), [SQS](https://www.serverless.com/framework/docs/providers/aws/events/sqs), [schedule](https://www.serverless.com/framework/docs/providers/aws/events/schedule)):

- `httpApi: { method: POST, path: /sign-offs/{id}/sign }`: an API Gateway HTTP API route. Payload format 2.0 is the default.
- `sqs: { arn: …, batchSize: 10, functionResponseType: ReportBatchItemFailures }`: consume a queue.
- `schedule: rate(1 day)` or `cron(...)`. With `method: scheduler` you can also set a `timezone`, which is handy for "8am Auckland time" reminders.

**Variables:** `${sls:stage}` (current stage), `${self:service}` (values from this file), `${env:NAME}` (your shell's environment), `${opt:flag}` (CLI options), `${param:name}` (stage params), `${aws:accountId}` and `${aws:region}`. A default goes after a comma: `${env:LOG_LEVEL, 'info'}`. See the [variables guide](https://www.serverless.com/framework/docs/guides/variables).

**Stages** are separate copies of the whole stack: `dev`, `staging`, `prod`, or `pr-123` for a preview. `serverless deploy --stage prod --region ap-southeast-2`. Resource names include the stage, so stages don't collide. Per-stage differences (log level, alarm email, table capacity) go in `stages.<stage>.params`.

**TypeScript:** v4 builds TypeScript handlers with esbuild automatically, with no plugin. The AWS SDK v3 is excluded from the bundle by default because the runtime provides it. Remove `serverless-esbuild` or `serverless-plugin-typescript` if a tutorial adds them: the docs say plugins that build code conflict with the built-in build ([building guide](https://www.serverless.com/framework/docs/providers/aws/guide/building)).

**Commands:**

| Command | Does |
| --- | --- |
| `serverless deploy` | Package, upload, create or update the CloudFormation stack |
| `serverless deploy function -f signOff` | Quick code-only update of one function |
| `serverless info` | Show endpoints and resources (the HTTP API URL appears here) |
| `serverless invoke -f signOff --log` | Run the deployed function and show its logs |
| `serverless logs -f signOff -t` | Tail CloudWatch logs |
| `serverless remove` | Delete the stack. Note the docs' caveat: S3 buckets that still contain objects, and resources with `DeletionPolicy: Retain`, may be left behind ([remove](https://www.serverless.com/framework/docs/providers/aws/cli-reference/remove)) |

**Under the hood** (worth one sentence in an interview): deploy packages each function, uploads the zips to a deployment bucket, and creates or updates a CloudFormation stack. CloudFormation then handles ordering, rollback on failure and drift.

## Worked example

A service with a reminder job (8am Auckland time on weekdays) and one HTTP endpoint, with a per-stage parameter:

```yaml file=serverless.yml group=aws-sls
service: qa-reminders
frameworkVersion: '4'

provider:
  name: aws
  runtime: nodejs24.x
  region: ap-southeast-2
  stage: dev
  environment:
    STAGE: ${sls:stage}
    LOG_LEVEL: ${param:logLevel}

stages:
  default:
    params:
      logLevel: debug
  prod:
    params:
      logLevel: info

functions:
  remindOverdue:
    handler: src/handlers/remindOverdue.handler
    timeout: 60
    events:
      - schedule:
          method: scheduler
          rate:
            - cron(0 8 ? * MON-FRI *)
          timezone: Pacific/Auckland

  health:
    handler: src/handlers/health.handler
    events:
      - httpApi:
          method: GET
          path: /health
```

```ts file=src/handlers/health.ts group=aws-sls
import type { APIGatewayProxyHandlerV2 } from "aws-lambda"

export const handler: APIGatewayProxyHandlerV2 = async () => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ok: true, stage: process.env.STAGE }),
})
```

Deploying to a personal stage, checking it, and removing it:

```bash
serverless deploy --stage ludo
serverless info --stage ludo        # prints the HTTP API URL
curl https://<api-id>.execute-api.ap-southeast-2.amazonaws.com/health
serverless remove --stage ludo
```

`cron(0 8 ? * MON-FRI *)` is AWS's six-field cron: minutes, hours, day-of-month, month, day-of-week, year. `?` means "no specific value" and is needed in one of the two day fields. The `timezone` means 8am Auckland time all year, including daylight saving, which a plain UTC cron would get wrong for half the year.

## Exercises

### Read the config [1]

Using the worked example: (a) what's the full stack name on stage `prod`? (b) what will `LOG_LEVEL` be on stage `ludo`? (c) which IAM permissions does `health` have?

#### Solution

(a) `qa-reminders-prod`. Serverless names stacks `<service>-<stage>`, so each stage is its own stack. (b) `debug`: `ludo` has no entry, so `stages.default.params` applies. (c) Only the basics the framework always adds, which let it write its logs to CloudWatch. No statements were declared, so it can't touch any other AWS resource. That's least privilege by default, and a good thing to point out.

### Add a queue and a consumer [2]

Extend the service: add an SQS queue for report jobs with a dead-letter queue (messages go to the DLQ after 3 failed receives), a `generateReport` function consuming it with batch size 5 and partial batch responses, and give `remindOverdue` permission to send messages to the queue (and nothing else). Put the queue URL in the reminder function's environment.

#### Solution

```yaml file=serverless.queue.yml group=aws-sls
service: qa-reminders
frameworkVersion: '4'

provider:
  name: aws
  runtime: nodejs24.x
  region: ap-southeast-2

functions:
  remindOverdue:
    handler: src/handlers/remindOverdue.handler
    environment:
      REPORT_QUEUE_URL: !Ref ReportQueue
    iam:
      role:
        statements:
          - Effect: Allow
            Action: sqs:SendMessage
            Resource: !GetAtt ReportQueue.Arn
    events:
      - schedule: rate(1 day)

  generateReport:
    handler: src/handlers/generateReport.handler
    timeout: 60
    events:
      - sqs:
          arn: !GetAtt ReportQueue.Arn
          batchSize: 5
          functionResponseType: ReportBatchItemFailures

resources:
  Resources:
    ReportQueue:
      Type: AWS::SQS::Queue
      Properties:
        VisibilityTimeout: 360
        RedrivePolicy:
          deadLetterTargetArn: !GetAtt ReportDLQ.Arn
          maxReceiveCount: 3
    ReportDLQ:
      Type: AWS::SQS::Queue
      Properties:
        MessageRetentionPeriod: 1209600
```

Notes worth saying out loud: the per-function `iam` block gives only the reminder function `sqs:SendMessage`, and only on this queue. The visibility timeout (360 s) is several times the consumer's 60 s timeout, so a message isn't handed to a second consumer while the first is still working on it. `!Ref` on a queue gives its URL and `!GetAtt …Arn` gives its ARN (CloudFormation's short-form functions, which Serverless accepts). The DLQ keeps messages for 14 days (1,209,600 s, the SQS maximum) so someone can inspect and redrive them. Retries and DLQs are the next lesson.

### Stages for a team [2]

The team wants: a stack per developer for experiments, one per pull request in CI, `staging`, and `prod`. Prod alarms email `oncall@…`, other stages email nobody. Sketch the `stages` block and the deploy commands, and say what must happen to PR stacks.

#### Solution

```yaml norun
stages:
  default:
    params:
      alarmEmail: ''          # no alarms outside prod
      logLevel: debug
  prod:
    params:
      alarmEmail: oncall@example.com
      logLevel: info
```

Developers: `serverless deploy --stage ludo`. CI on a PR: `serverless deploy --stage pr-${PR_NUMBER}`, and `serverless remove --stage pr-${PR_NUMBER}` when the PR closes (a separate workflow on the `closed` event). Otherwise abandoned stacks pile up, cost money and hit account limits. `main`: deploy `staging` automatically, then `prod` after checks or approval. Resources that are expensive or slow to create (an RDS database) are usually shared or kept outside per-PR stacks, and referenced by parameter instead.

## Say it aloud

"Walk me through what's in a serverless.yml and what happens when you run deploy."

#### Model answer

A serverless.yml describes the service. The provider section sets AWS, the Node runtime (nodejs24.x currently), the region and the default stage, plus environment variables and IAM statements for the functions. The functions section maps each Lambda to its handler, like a file and an exported function, and to the events that trigger it: HTTP API routes, SQS queues, schedules. I can give a function its own IAM statements so it only has the permissions it needs. Anything else, like queues, tables or buckets, goes in resources as CloudFormation. Stages let one config deploy separate copies, like dev, a stack per pull request, staging and prod, and stage params change things like log level or alarm targets. When I run deploy, v4 bundles the TypeScript with esbuild, packages each function, uploads the packages to a deployment bucket, and creates or updates a CloudFormation stack. CloudFormation works out the order and rolls back if something fails. Then serverless info shows the endpoint, logs tails CloudWatch, and remove tears the stack down. Buckets with objects in them may need emptying first.
