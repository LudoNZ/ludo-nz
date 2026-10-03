## Explanation

**Continuous integration (CI)** means every push or pull request is automatically built and tested on a clean machine. **Continuous delivery (CD)** goes further: every change that passes the pipeline is releasable, and often released automatically. The role mentions continuous delivery, so expect a question about how tests make that safe.

**Why tests are the foundation of CD.** If a merge goes to production within minutes, nobody does a manual regression pass. The pipeline *is* the regression pass. That puts requirements on the suite:

- **Fast.** Developers wait for it on every PR. Unit tests in seconds, the whole pipeline in single-digit minutes ideally. Slow suites get skipped or batched, which defeats the point.
- **Trustworthy.** A *flaky* test (sometimes fails for no real reason) is worse than none: people learn to re-run until it's green, and then ignore real failures. Common causes: real time or time zones, test order dependence, shared database state, unawaited promises, network calls. Fix or quarantine flakes quickly.
- **Representative.** Same Postgres major version as production, migrations run from scratch, the same Node version.

**A typical pipeline for this kind of app:**

1. Install dependencies (`npm ci`: exact versions from the lockfile).
2. Static checks: type-check (`tsc --noEmit`) and lint. They're cheap and catch a lot.
3. Unit tests.
4. Start Postgres, run migrations, run integration tests.
5. Build.
6. Deploy to a test or staging stage, run a few E2E smoke tests.
7. Deploy to production, often automatically on `main`, sometimes with a manual approval.

Steps 1–5 run on every PR, and branch protection requires them to pass before merging.

**GitHub Actions** is a common choice. A workflow is YAML in `.github/workflows/`. **Service containers** start alongside the job. GitHub's own example runs Postgres as a service with a health check and maps port 5432 so steps on the runner can reach it on `localhost` ([GitHub docs: PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)). The current major versions of the official checkout and setup-node actions are `v7`.

**Making CD safer beyond tests**, which is good to mention:

- **Small changes**: small PRs are easier to review, test and roll back.
- **Feature flags**: merge unfinished work switched off.
- **Expand/contract migrations**: old and new code run side by side during a deploy (SQL module).
- **Monitoring and alarms** after deploy, with a quick rollback path (AWS module).
- **Trunk-based development**: short-lived branches merged daily, not long-running feature branches.

**What to say about your own experience:** you've deployed with `npm run deploy` from your machine, and a Firebase App Hosting backend can deploy from source. Being able to describe what a pipeline would add (tests gating the deploy, reproducible builds, no "works on my machine") shows you understand why the team works this way.

## Worked example

A GitHub Actions workflow for the course's code: unit tests, then integration tests against a Postgres 18 service container. The schema is loaded with `psql`, which GitHub's Ubuntu runner images include.

```yaml file=.github/workflows/test.yml
name: test

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: qa_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/qa_test

    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm

      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint

      - name: Unit tests
        run: npx vitest run --exclude "**/*.integration.test.ts"

      - name: Load schema and seed
        run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f interview-prep/db/seed.sql

      - name: Integration tests
        run: npx vitest run integration
```

Read it as a story: on every PR and every push to `main`, start Postgres, wait until it's healthy, install exactly the locked dependencies, fail fast on types and lint, run the quick tests, then load the database and run the slower ones. `npx vitest run integration` runs only test files whose path contains "integration". The naming convention (`*.integration.test.ts`) is what splits the two runs. In a real project you'd run *migrations* there instead of a seed file.

## Exercises

### Find the flake [2]

This test passes locally and fails roughly once a week in CI. Why, and how do you fix it?

```ts norun
it("lists sign-offs older than seven days", async () => {
  await insertSignOff({ requestedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) })
  const rows = await listOutstandingSignOffs(db, companyId, 7)
  expect(rows).toHaveLength(1)
})
```

#### Solution

The data sits *exactly* on the boundary. It's created "7 days ago" by the Node clock, and the query compares against the **database's** `now()` a few milliseconds later, so whether it counts as "more than seven days" depends on timing and on clock drift between the CI runner and the Postgres container. Fixes: put test data clearly on one side of the boundary (8 days and 6 days, and assert both), and write a separate, deliberate boundary test with a *controlled* clock, by passing the reference time as a query parameter (`$3::timestamptz` instead of `now()`) so the test can pin it. General rule: never let a test depend on two clocks agreeing.

### Gate the deploy [2]

The team deploys with `serverless deploy --stage prod`. Extend the workflow (in words or YAML) so that production deploys happen automatically, only from `main`, and only after the test job passes. Where do the AWS credentials come from?

#### Solution

```yaml norun
  deploy:
    needs: test                       # runs only if the test job passed
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production           # can require a manual approval in repo settings
    permissions:
      id-token: write                 # lets the job request a short-lived OIDC token
      contents: read
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ap-southeast-2
      - run: npx serverless deploy --stage prod
```

`needs: test` plus the `if` gives "main only, tests first". For credentials, prefer GitHub's **OIDC** federation: the job assumes an IAM role with a short-lived token, and no long-lived access keys are stored as secrets. The role should allow only what deployment needs. Serverless Framework v4 also needs its own authentication in CI (a license key or access key from their dashboard). Check the [Serverless Framework docs](https://www.serverless.com/framework/docs) for the current method. (Verify the `configure-aws-credentials` major version on its [GitHub page](https://github.com/aws-actions/configure-aws-credentials) before use. This snippet isn't run by the course.)

### Make it faster [1]

The pipeline takes 14 minutes and developers have started pushing less often. Name four things you'd look at.

#### Solution

1. **Measure first**: which steps take the time? (The Actions UI shows per-step durations.)
2. **Cache dependencies** (`cache: npm` in setup-node) and avoid re-installing in every job.
3. **Run independent jobs in parallel**: lint and type-check alongside unit tests, and E2E only after a deploy, not on every PR.
4. **Speed up the slow tests**: transaction-per-test instead of re-seeding, fewer E2E tests pushed down to integration tests, no `sleep`s, and use Vitest's parallelism for unit tests.

Also: split the integration suite into shards across jobs, and only run E2E on `main` or on PRs with a label. And delete tests that don't earn their keep.

## Say it aloud

"How do automated tests support continuous delivery? What makes a test suite fit for that?"

#### Model answer

With continuous delivery, every merge to main is potentially in production within minutes, so nobody does a manual regression pass. The automated pipeline is the regression pass. On every pull request it type-checks, lints and runs unit tests, then spins up Postgres as a service, runs migrations from scratch, and runs integration tests. Branch protection means nothing merges red, and deploys only run from main after the test job passes, ideally using short-lived credentials. For that to work the suite has to be fast, so people don't batch up changes, and trustworthy, because a flaky test trains everyone to ignore failures. So I'd fix or quarantine flakes quickly, usually caused by clocks, shared state or order dependence. It also has to be representative: same Postgres version, real migrations. Tests aren't the only safety net, though. Small changes, feature flags, backwards-compatible migrations, and good monitoring with a fast rollback are what make deploying on every merge comfortable rather than scary.
