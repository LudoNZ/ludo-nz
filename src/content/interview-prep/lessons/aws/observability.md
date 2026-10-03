## Explanation

"You build it, you run it" teams expect developers to notice problems before customers do and to explain afterwards what happened. That's three tools and one document.

**Logs.** Lambda sends anything written to stdout or stderr (`console.log`, `console.error`) to **CloudWatch Logs**, one *log group* per function ([Lambda + CloudWatch Logs](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs.html)). Each invocation also emits `START`, `END` and `REPORT` lines. `REPORT` carries the duration, billed duration, memory used and, on a cold start, the init duration. Make your own logs **structured**: one JSON object per line with consistent fields (`level`, `msg`, `requestId`, `companyId`, `lotChecklistId`, `durationMs`). Then you can query them instead of grepping prose. Never log secrets, tokens or personal data you don't need.

**CloudWatch Logs Insights** queries log groups with a pipe syntax ([examples](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-examples.html)):

```text
fields @timestamp, @message
| filter level = "error"
| sort @timestamp desc
| limit 50
```

```text
filter @type = "REPORT"
| stats avg(@duration), max(@duration), min(@duration) by bin(5m)
```

JSON fields in your logs are discovered automatically, so `filter companyId = 2` just works.

**Metrics.** Numbers over time. Lambda publishes `Invocations`, `Errors`, `Throttles`, `Duration` and `ConcurrentExecutions`. API Gateway publishes request counts, 4xx/5xx counts and latency. SQS publishes `ApproximateNumberOfMessagesVisible` and `ApproximateAgeOfOldestMessage`. You can publish your own business metrics too ("sign-offs completed"), via the SDK or by logging in Embedded Metric Format, which CloudWatch extracts from log lines.

**Alarms.** An alarm watches one metric (or a metric math expression) against a threshold over some periods, and notifies (usually an SNS topic → email or chat) when it's breached ([alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)). Good starting alarms for a serverless API:

- Lambda `Errors` > 0 for a few minutes on critical functions, or better, an error *rate*.
- API Gateway 5xx rate above a small percentage.
- p95/p99 `Duration` near the function timeout.
- **DLQ depth > 0**: someone must look.
- SQS `ApproximateAgeOfOldestMessage` growing: consumers are stuck or too slow.
- Database CPU and connections (RDS metrics).

Alarm on **symptoms users feel** (errors, latency, stuck work), not on every internal blip. Noisy alarms get ignored, which is the alerting version of a flaky test.

**Tracing.** AWS X-Ray, or OpenTelemetry, follows a request across API Gateway → Lambda → database or queue. That's useful once there are several hops. Mention it, but logs and metrics come first.

**Root cause analysis (RCA, or post-incident review).** After an incident, write a short **blameless** document. Its purpose is to improve the *system*, not to find who to blame. A common structure:

1. **Summary**: what happened, impact, duration, in two or three sentences a manager can read.
2. **Impact**: who was affected and how (for example, "foremen on two projects couldn't submit sign-offs for 47 minutes; no data lost").
3. **Timeline**: detection, key events and decisions, resolution, in times with time zone.
4. **Root cause and contributing factors**: ask "why" until you reach things you can change. Usually several factors, not one.
5. **What went well / what didn't**: detection, communication, tooling.
6. **Actions**: specific, owned, dated. Prevent recurrence, detect sooner, recover faster.

The interview may well include "tell me about a production problem you diagnosed". The team-practices module has prompts for preparing that story in this shape.

## Worked example

A tiny structured logger. It's dependency-free and testable, and injects the request context once:

```ts file=src/logger.ts group=aws-obs
type Level = "debug" | "info" | "warn" | "error"
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export function createLogger(base: Record<string, unknown>, opts: { level?: Level; write?: (line: string) => void } = {}) {
  const min = ORDER[opts.level ?? "info"]
  const write = opts.write ?? ((line: string) => console.log(line))
  const log = (level: Level, msg: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[level] < min) return
    write(JSON.stringify({ level, msg, ...base, ...fields, ts: new Date().toISOString() }))
  }
  return {
    debug: (msg: string, f?: Record<string, unknown>) => log("debug", msg, f),
    info: (msg: string, f?: Record<string, unknown>) => log("info", msg, f),
    warn: (msg: string, f?: Record<string, unknown>) => log("warn", msg, f),
    error: (msg: string, f?: Record<string, unknown>) => log("error", msg, f),
  }
}
```

Used in a handler as `const log = createLogger({ requestId: context.awsRequestId, fn: "signOff" }, { level: process.env.LOG_LEVEL as "info" })`, then `log.info("signed", { signOffId, companyId, durationMs })`. Every line is then queryable by request, tenant and entity:

```text
fields @timestamp, msg, signOffId, durationMs
| filter fn = "signOff" and companyId = 2
| sort @timestamp desc
```

An alarm on the report queue's DLQ, added to `serverless.yml` resources, notifying an email address through SNS:

```yaml file=serverless.alarms.yml group=aws-obs
resources:
  Resources:
    AlertsTopic:
      Type: AWS::SNS::Topic
      Properties:
        Subscription:
          - Protocol: email
            Endpoint: ${param:alarmEmail}
    ReportDLQNotEmpty:
      Type: AWS::CloudWatch::Alarm
      Properties:
        AlarmDescription: Report jobs are failing repeatedly and landing in the DLQ
        Namespace: AWS/SQS
        MetricName: ApproximateNumberOfMessagesVisible
        Dimensions:
          - Name: QueueName
            Value: !GetAtt ReportDLQ.QueueName
        Statistic: Maximum
        Period: 300
        EvaluationPeriods: 1
        Threshold: 0
        ComparisonOperator: GreaterThanThreshold
        TreatMissingData: notBreaching
        AlarmActions:
          - !Ref AlertsTopic
```

(SNS sends a confirmation email that must be accepted before alerts arrive.)

## Exercises

### Test the logger [1]

Write tests showing that (a) debug lines are dropped at the default level, and (b) each line is valid JSON containing the base context and the per-call fields.

#### Solution

```ts file=src/logger.test.ts group=aws-obs
import { expect, it } from "vitest"
import { createLogger } from "./logger"

it("drops debug at the default info level", () => {
  const lines: string[] = []
  const log = createLogger({ fn: "signOff" }, { write: (l) => lines.push(l) })
  log.debug("noisy detail")
  log.info("signed")
  expect(lines).toHaveLength(1)
})

it("writes one JSON object per line with base and call fields", () => {
  const lines: string[] = []
  const log = createLogger({ requestId: "r-1", fn: "signOff" }, { write: (l) => lines.push(l) })
  log.error("sign-off failed", { signOffId: 42, companyId: 2 })
  expect(JSON.parse(lines[0])).toMatchObject({
    level: "error",
    msg: "sign-off failed",
    requestId: "r-1",
    fn: "signOff",
    signOffId: 42,
    companyId: 2,
  })
})
```

Injecting `write` is the same dependency-injection move as the unit tests lesson. No `console` spying needed.

### Choose the alarms [2]

For the sign-off API (API Gateway → Lambda → RDS via RDS Proxy) and the report pipeline (SQS → Lambda → S3), list the five alarms you'd create first, each with the metric and why.

#### Solution

1. **API 5xx rate** (API Gateway `5xx` ÷ `Count`) above about 1% for 5 minutes: users are seeing failures.
2. **API latency p95** (API Gateway `Latency`) above a target such as 1 s: slow is the new down for people standing on site.
3. **Report DLQ depth** (`ApproximateNumberOfMessagesVisible` > 0 on the DLQ): jobs failing repeatedly need a human.
4. **Report queue age** (`ApproximateAgeOfOldestMessage` > 15 min): consumer stuck, throttled or crashing before it can report failures.
5. **Database connections or CPU** (RDS `DatabaseConnections` near the limit, `CPUUtilization` high): an early warning before the API alarms fire.

Honourable mentions: Lambda `Throttles` > 0 and `Duration` near the timeout. Each alarm should have an owner and a short note on what to check first, which is a lightweight runbook.

### Write an RCA [3]

Write a blameless RCA (summary, impact, timeline, root cause and contributing factors, actions) for this incident:

*Tuesday 07:05 NZT a deploy added a `NOT NULL` column `signed_off_at` to `lot_checklists` with no default. The old Lambda version, still serving traffic for a few minutes during the deploy, inserts lot checklists without that column, so those inserts failed. The new version also had a bug: it set `signed_off_at` only on update. From 07:06 creating checklists returned 500 for all users. An API 5xx alarm fired at 07:12 and went to an unmonitored inbox. A site engineer phoned support at 07:40. The developer rolled back the application at 07:52, but the column remained, so errors continued until 08:05, when a migration made the column nullable. Eleven checklist creations failed; site teams re-entered them on paper and later in the app.*

#### Solution

**Summary.** On Tuesday from 07:06 to 08:05 NZT (59 minutes), creating lot checklists failed for all customers after a deploy added a non-nullable column that existing code didn't populate. Eleven creations failed. No existing data was lost or corrupted.

**Impact.** Site teams couldn't start new checklists during the morning pre-pour window. They recorded them on paper and re-entered them later, which cost time and introduced a risk of transcription errors.

**Timeline (NZT).** 07:05 deploy begins (migration then code). 07:06 first 500s on `POST /lot-checklists`. 07:12 API 5xx alarm fires to `alerts@` inbox (not monitored). 07:40 site engineer calls support; incident opened. 07:48 cause identified from logs (`null value in column "signed_off_at" violates not-null constraint`). 07:52 application rolled back; errors continue. 08:05 hotfix migration makes the column nullable; errors stop. 08:30 customers notified.

**Root cause.** The migration added a `NOT NULL` column without a default in the same release as the code that writes it, so the version already running (and the new code's insert path) couldn't satisfy the constraint.

**Contributing factors.** The migration wasn't backwards-compatible (it didn't follow expand/contract). The integration tests ran the *new* code against the new schema only, never old code against the new schema. The rollback procedure covered code, not schema. The alarm routed to an unmonitored destination, adding 28 minutes to detection.

**Went well.** Logs pinpointed the constraint quickly. No data corruption.

**Actions.** (1) Adopt expand/contract for schema changes: add columns nullable, backfill, enforce later. Owner: dev lead, by next sprint. (2) Add a CI check that runs the previous release's integration tests against the new migrations. Owner: platform, two weeks. (3) Route production alarms to the on-call chat channel and test them monthly. Owner: dev lead, this week. (4) Document schema rollback steps in the deploy runbook. Owner: author of the change, this week.

Notice the tone: no names attached to mistakes, factors rather than a single culprit, and actions with owners and dates.

## Say it aloud

"How would you know your serverless app is unhealthy in production, and what do you do after an incident?"

#### Model answer

I'd want structured JSON logs from every function, with consistent fields like request id, function, tenant and entity ids. Then in CloudWatch Logs Insights I can slice by company or by sign-off, and the REPORT lines give duration and cold starts. On top of that, metrics and a small set of alarms on symptoms users feel: API 5xx rate, p95 latency, a dead-letter queue that's not empty, the age of the oldest message on a work queue, and database connections. They go to a channel someone actually watches, each with a note on what to check first. I'd rather have five alarms people trust than fifty they ignore. After an incident I'd write a blameless root cause analysis: a short summary and the impact in user terms, a timeline including when we detected it versus when it started, the root cause and the contributing factors, found by asking why until we reach things we can change, and a handful of actions with owners and dates. Often the most valuable actions are about detecting faster and recovering faster, not just preventing the exact same bug.
