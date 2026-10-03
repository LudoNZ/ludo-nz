# Interview prep practice database

`db/seed.sql` is the construction QA practice database used by the course at
`/interview-prep` (lessons live in `src/content/interview-prep/`).

Load it into an empty PostgreSQL database (14 or newer):

```bash
# Docker
docker run --name qa-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:18
docker exec qa-postgres createdb -U postgres qa_practice
docker exec -i qa-postgres psql -U postgres -d qa_practice -v ON_ERROR_STOP=1 < interview-prep/db/seed.sql

# or a local install
createdb qa_practice
psql -d qa_practice -v ON_ERROR_STOP=1 -f interview-prep/db/seed.sql
```

The script drops and recreates its own tables, so re-run it any time to reset.
Timestamps are relative to `now()`, so "older than seven days" questions give
the same answers whenever it's loaded.

Tables: companies, users, projects, project_members, lots, checklist_templates,
checklist_items, lot_checklists, responses (append-only; latest per item wins),
photos, sign_offs. About 830 rows.
