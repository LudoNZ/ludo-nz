import type { CourseOutline } from "@/components/interviewPrep/types"

/** The /interview-prep course outline. Edit freely:
 *  - interviewDate: "YYYY-MM-DD" turns on the day-by-day plan.
 *  - each lesson's content lives in lessons/<module id>/<lesson slug>.md
 *  - `core: true` marks the short-on-time subset.
 *  - minutes should add up to roughly the module's hours. */
export const course: CourseOutline = {
  interviewDate: null,
  hoursPerDay: 2,
  modules: [
    {
      id: "sql",
      title: "SQL and relational modelling",
      hours: 7,
      summary:
        "Your biggest gap and the role's hard requirement. Every query runs against the construction QA seed database in interview-prep/db/seed.sql.",
      lessons: [
        { slug: "setup", title: "Local PostgreSQL and the seed database", minutes: 25, core: true },
        { slug: "thinking-relationally", title: "Thinking relationally after Firestore", minutes: 45, core: true },
        { slug: "joins-aggregates", title: "Joins, grouping, aggregates, HAVING and NULL", minutes: 70, core: true },
        { slug: "subqueries-ctes-windows", title: "Subqueries, CTEs and window functions", minutes: 70, core: true },
        { slug: "schema-design", title: "Schema design, migrations and transactions", minutes: 60, core: false },
        { slug: "performance", title: "Indexes, EXPLAIN ANALYZE and N+1", minutes: 55, core: true },
        { slug: "sql-from-typescript", title: "SQL from TypeScript", minutes: 45, core: true },
        { slug: "drill", title: "Graded query drill", minutes: 50, core: false },
      ],
    },
    {
      id: "testing",
      title: "Automated testing",
      hours: 5,
      summary:
        "From beginner to able to talk about, and write, unit and integration tests during a pairing session. Uses Vitest, React Testing Library and a real Postgres test database.",
      lessons: [
        { slug: "what-to-test", title: "Unit, integration, end-to-end: deciding what to test", minutes: 35, core: true },
        { slug: "unit-tests", title: "Unit tests with Vitest", minutes: 55, core: true },
        { slug: "react-testing-library", title: "React Testing Library", minutes: 55, core: true },
        { slug: "integration-db", title: "Integration tests against a real database", minutes: 60, core: true },
        { slug: "tdd-kata", title: "TDD kata: checklist completion rules", minutes: 40, core: true },
        { slug: "ci", title: "Tests in CI and continuous delivery", minutes: 25, core: false },
        { slug: "project", title: "Project: test a real feature", minutes: 30, core: false },
      ],
    },
    {
      id: "aws",
      title: "AWS serverless",
      hours: 4,
      summary:
        "Enough AWS to hold a sensible conversation and deploy something small: each service mapped to the Firebase piece you already know.",
      lessons: [
        { slug: "services-map", title: "The AWS services, mapped from Firebase", minutes: 50, core: true },
        { slug: "serverless-framework", title: "Serverless Framework", minutes: 45, core: true },
        { slug: "tradeoffs", title: "Cold starts, connections, retries and idempotency", minutes: 55, core: true },
        { slug: "observability", title: "Logs, metrics, alarms and root cause analysis", minutes: 30, core: false },
        { slug: "project", title: "Project: deploy a sign-off API, then tear it down", minutes: 60, core: false },
      ],
    },
    {
      id: "ts-react",
      title: "TypeScript and React under interview conditions",
      hours: 3,
      summary:
        "Your strength, but interview conditions are different: no AI, someone watching, explain as you go.",
      lessons: [
        { slug: "typescript", title: "Generics, unions, narrowing and utility types", minutes: 50, core: true },
        { slug: "react-questions", title: "React questions interviewers ask", minutes: 50, core: true },
        { slug: "timed-exercises", title: "Six timed exercises, aloud, without AI", minutes: 60, core: true },
        { slug: "pairing-habits", title: "Pairing habits", minutes: 20, core: false },
      ],
    },
    {
      id: "design",
      title: "System design and architecture walkthrough",
      hours: 3,
      summary:
        "A repeatable structure for design questions, five worked cases from construction QA, and a ten-minute walkthrough of something you built.",
      lessons: [
        { slug: "framework", title: "A repeatable structure for design questions", minutes: 30, core: true },
        { slug: "offline-sync", title: "Case: offline checklist capture and sync", minutes: 35, core: true },
        { slug: "photo-upload", title: "Case: photo upload on poor reception", minutes: 25, core: false },
        { slug: "audit-record", title: "Case: a permanent audit record", minutes: 25, core: false },
        { slug: "multi-tenant", title: "Case: multi-tenant data separation", minutes: 25, core: true },
        { slug: "background-reports", title: "Case: background report generation", minutes: 20, core: false },
        { slug: "app-walkthrough", title: "Your ten-minute app walkthrough", minutes: 20, core: true },
      ],
    },
    {
      id: "team",
      title: "Team practices and stories",
      hours: 1.5,
      summary: "Code review, ensemble programming, LLM tools, and three stories prepared in advance.",
      lessons: [
        { slug: "review-ensemble-increments", title: "Code review, ensemble programming and small increments", minutes: 30, core: true },
        { slug: "llm-tools", title: "Using LLM coding tools well", minutes: 25, core: true },
        { slug: "stories", title: "Your three stories", minutes: 35, core: true },
      ],
    },
    {
      id: "mock",
      title: "Mock interview",
      hours: 1.5,
      summary: "Timed rounds under realistic conditions, then a final readiness check. Do this last.",
      lessons: [
        { slug: "sql-round", title: "Timed SQL round", minutes: 30, core: true },
        { slug: "pairing-round", title: "Timed pairing exercise", minutes: 30, core: true },
        { slug: "design-round", title: "Design question", minutes: 20, core: true },
        { slug: "readiness", title: "Final readiness checklist", minutes: 10, core: true },
      ],
    },
  ],
}
