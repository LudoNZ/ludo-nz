## Explanation

Everything in this module runs against one practice database: a construction QA app with companies, users, projects, lots, checklist templates and items, responses with photo evidence, and sign-offs. The schema and about 800 rows of data live in `interview-prep/db/seed.sql` in this repo. Get it loaded before anything else, because reading SQL without running it is how you stay "intermediate at best".

**Firestore → Postgres, at the level of tooling.** In Firebase you had a console, an emulator and the SDK. Here the equivalents are:

| Firebase | PostgreSQL |
| --- | --- |
| Firestore emulator | A local Postgres server (Docker container or native install) |
| Firebase console data viewer | `psql` (the command-line client), or a GUI such as DBeaver or pgAdmin |
| A project's Firestore database | A *database* inside the server (`qa_practice`) |
| Collections | Tables, which live in a *schema* (`public` by default) |
| Security rules + seed scripts | Roles/grants, plus SQL files you run with `psql -f` |

**Pick one way to run Postgres.**

- **Docker (recommended).** One command, nothing installed on your machine, easy to throw away. The official image's current major version is 18. Its only required setting is `POSTGRES_PASSWORD` ([Docker Hub: postgres](https://hub.docker.com/_/postgres)).
- **Native, Debian/Ubuntu.** `sudo apt install postgresql` gives you your distribution's version. For the newest major version, the PostgreSQL apt repository ([postgresql.org: Debian](https://www.postgresql.org/download/linux/debian/)) gives you `postgresql-18`.
- **Native, macOS.** Homebrew's `postgresql@18` formula, or Postgres.app ([postgresql.org: macOS](https://www.postgresql.org/download/macosx/)).

Any version from 14 up runs every query in this course. The seed only uses standard features.

**psql survival kit.** These backslash commands are psql's, not SQL, so they need no semicolon:

| Command | Does |
| --- | --- |
| `\l` | list databases |
| `\c qa_practice` | connect to a database |
| `\dt` | list tables |
| `\d lots` | describe a table: columns, constraints, indexes, foreign keys |
| `\x auto` | expanded display for wide rows |
| `\timing on` | show how long each query took |
| `\e` | open the last query in your editor |
| `\q` | quit |

SQL statements *do* need a terminating `;`. If psql shows a prompt like `qa_practice-#` instead of `qa_practice=#`, it's waiting for the rest of a statement. Type `;` and press Enter.

**The seed is safe to re-run.** It drops and recreates every table in a transaction. Its timestamps are relative to `now()`, so "older than seven days" questions give the same answers whenever you load it. If an experiment wrecks the data, reload it.

**How the schema hangs together** (read `\d` output for each table once):

- `companies` → `users`, `projects`, `checklist_templates` (every tenant-owned row traces back to a company)
- `projects` ↔ `users` through `project_members` (many-to-many)
- `projects` → `lots` → `lot_checklists` ← `checklist_templates` → `checklist_items`
- `lot_checklists` → `responses` → `photos`
- `lot_checklists` → `sign_offs`

Responses are **append-only**: if an item fails and gets re-inspected, there is a second response row. The current state of an item is its *latest* response. That detail drives several of the harder exercises.

Reference: [psql documentation](https://www.postgresql.org/docs/current/app-psql.html).

## Worked example

**With Docker**, from the repo root:

```bash
# start Postgres 18 in the background, exposed on localhost:5432
docker run --name qa-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:18

# create the database and load the seed (stdin is redirected into psql inside the container)
docker exec qa-postgres createdb -U postgres qa_practice
docker exec -i qa-postgres psql -U postgres -d qa_practice -v ON_ERROR_STOP=1 < interview-prep/db/seed.sql

# open an interactive session
docker exec -it qa-postgres psql -U postgres -d qa_practice
```

Stop it with `docker stop qa-postgres` and start it again later with `docker start qa-postgres`. `docker rm -f qa-postgres` deletes it entirely.

**Native install on Debian/Ubuntu:**

```bash
sudo apt install postgresql
# make yourself a Postgres superuser with the same name as your login, so psql "just works"
sudo -u postgres createuser --superuser "$USER"
createdb qa_practice
psql -d qa_practice -v ON_ERROR_STOP=1 -f interview-prep/db/seed.sql
psql -d qa_practice
```

Then check the data loaded. This query counts the rows in every table:

```sql
SELECT 'companies' AS table_name, count(*) FROM companies
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'projects', count(*) FROM projects
UNION ALL SELECT 'project_members', count(*) FROM project_members
UNION ALL SELECT 'lots', count(*) FROM lots
UNION ALL SELECT 'checklist_templates', count(*) FROM checklist_templates
UNION ALL SELECT 'checklist_items', count(*) FROM checklist_items
UNION ALL SELECT 'lot_checklists', count(*) FROM lot_checklists
UNION ALL SELECT 'responses', count(*) FROM responses
UNION ALL SELECT 'photos', count(*) FROM photos
UNION ALL SELECT 'sign_offs', count(*) FROM sign_offs;
```

You should see 3 companies, 26 users, 7 projects, 45 lots, 54 lot checklists, 275 responses, 246 photos and 54 sign-offs. `UNION ALL` stacks result sets with the same column shape. (`UNION` without `ALL` also removes duplicates, which costs a sort.)

Now describe a table:

```psql
\d lot_checklists
```

Read the output top to bottom: columns and types, then `Indexes` (the primary key and the `UNIQUE (lot_id, template_id)` constraint each created one), then `Foreign-key constraints`, then `Referenced by` (which tables point at this one).

## Exercises

### Your first filter [1]

List every active project: code, name and the date it started, oldest first.

#### Solution

```sql
SELECT code, name, started_on
FROM projects
WHERE status = 'active'
ORDER BY started_on;
```

Five rows. String literals use single quotes in SQL. Double quotes are for identifiers, such as a column name with a capital letter in it.

### Read the schema [1]

Using `\d`, answer: which tables does `responses` reference, and which tables reference `responses`? Which column on `sign_offs` is allowed to be NULL, and what CHECK constraint ties two of them together?

#### Solution

```psql
\d responses
\d sign_offs
```

`responses` references `lot_checklists`, `checklist_items` and `users` (`responded_by`), and is referenced by `photos`. On `sign_offs`, `signed_by` and `signed_at` are nullable, and `CHECK ((signed_by IS NULL) = (signed_at IS NULL))` makes sure they are either both set or both empty. A sign-off can't have a signer without a time.

### Who works where [2]

For each company, show its name and how many users it has, and how many of those are inactive.

#### Solution

```sql
SELECT c.name,
       count(*) AS users,
       count(*) FILTER (WHERE NOT u.is_active) AS inactive
FROM companies c
JOIN users u ON u.company_id = c.id
GROUP BY c.name
ORDER BY c.name;
```

`FILTER (WHERE …)` is Postgres's tidy way to count a subset inside one aggregate. The portable version is `sum(CASE WHEN NOT u.is_active THEN 1 ELSE 0 END)`. Joins and grouping get a full lesson next, so don't worry if this one felt like a leap.

## Say it aloud

"How would you make sure every developer on the team, and the CI pipeline, is working against the same database schema and test data?"

#### Model answer

I'd treat the schema as code. Every change is a migration file in the repo, applied in order by a migration tool, so any database (a laptop, CI, staging, production) can be brought to the same version by running the migrations. For local work I'd run Postgres in Docker at the same major version as production, ideally through a compose file so it's one command. Then there's a seed script for realistic development data, kept separate from the migrations because production must never get fake data. In CI, the pipeline starts a fresh Postgres service container, runs the migrations from zero, and runs the integration tests against it. That also proves the migrations themselves work. The seed is idempotent, like the one I practised with that drops and recreates its tables, so anyone can reset to a known state in seconds. It's the same idea as using the Firebase emulator with seeded data, just with a real schema to keep in step.
