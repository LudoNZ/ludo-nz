## Explanation

**The case:** *"Many construction companies use the product. How do you make sure one company can never see another's data?"* For a B2B SaaS product this is the first security question, and a leak would be existential: a competitor's inspection records, or a client's defect history, shown to the wrong company.

**Three isolation models:**

| Model | How | Pros | Cons |
| --- | --- | --- | --- |
| **Shared tables, `company_id` column** (pooled) | Every tenant-owned row carries or reaches a `company_id`. Every query filters by it | Simple ops, one schema, easy cross-tenant analytics and migrations | Isolation depends on every query being right |
| **Schema per tenant** | Same tables in a Postgres schema per company | Stronger separation, per-tenant restore | Migrations × N schemas, connection and search-path complexity, awkward at hundreds of tenants |
| **Database per tenant** (silo) | Separate database or instance | Strongest isolation, per-tenant performance and residency | Highest cost and ops burden, migrations across fleets |

For a product with many small and medium construction companies, **shared tables with `company_id`** is the usual and defensible default, sometimes with a silo option for a big enterprise customer that needs it (data residency, contractual isolation). Say that, and say what would push you to change it.

**Making shared tables safe: defence in depth.**

1. **Tenant from the session, never the request.** The company id comes from the authenticated token or session (`actor.companyId`), not from a request body or query string. Many real leaks are an API that trusts `?companyId=`.
2. **A data-access layer that always scopes.** Repository functions take the actor and add the tenant filter, so handlers can't "forget". Code review checks it, and the integration tests from the testing module assert the 404 for another company's ids.
3. **Constraints that keep relationships inside one tenant.** A lot must belong to a project of the same company as its template, and so on. Composite foreign keys that include `company_id` (`FOREIGN KEY (company_id, project_id) REFERENCES projects (company_id, id)`) make cross-tenant links impossible at the database level. Alternatively, validate on write.
4. **Postgres row-level security (RLS)** as the safety net. Policies on each table restrict visible rows to `current_setting('app.company_id')`, which the API sets per request or transaction. Even a query missing its `WHERE company_id = …` returns only the tenant's rows. Caveats: the table owner and superusers bypass RLS unless you `FORCE` it, so the app must connect as a non-owner role. Policies add a little query overhead. And the setting must be scoped carefully with pooled connections (`SET LOCAL` inside a transaction, so it can't leak to the next request on that connection).
5. **Storage and caches too.** S3 keys prefixed by company plus authorisation before presigning, cache keys that include the tenant, search indexes filtered by tenant, background jobs that carry the tenant in the message.
6. **Tests and monitoring.** A cross-tenant test suite (log in as company A, try every endpoint with company B's ids, expect 404), and audit logs of cross-tenant access attempts.

**Tenancy is not just security:** "noisy neighbour" performance (one huge company's reports slowing everyone: per-tenant rate limits, queue fairness), per-tenant configuration (templates, branding), and data export or deletion when a customer leaves.

**Where the seed stands:** `companies` owns `users`, `projects` and `checklist_templates` directly. `lots`, `lot_checklists`, `responses`, `photos` and `sign_offs` reach a company through joins. That's normalised, but every tenant check needs a join. Denormalising `company_id` onto deep tables (responses, photos) is a common, deliberate trade-off for simpler RLS policies and faster tenant filtering, kept consistent by composite foreign keys.

## Worked example

Row-level security on `projects`, with an application role that isn't the table owner:

```sql
CREATE ROLE app_user;
GRANT SELECT ON projects TO app_user;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING (company_id = nullif(current_setting('app.company_id', true), '')::bigint);

SET ROLE app_user;
SET LOCAL app.company_id = '2';   -- what the API does at the start of each request's transaction

SELECT code, name FROM projects ORDER BY code;   -- no WHERE clause, still only company 2's projects
```

The `SELECT` returns only Ironbark's two projects, though the query has no tenant filter. `current_setting(name, true)` returns NULL instead of erroring when the setting has never been defined. But once *any* transaction on that connection has set it, it reads back as an **empty string** after the transaction ends, and `''::bigint` is an error. With a connection pool, that's every connection after its first request. `nullif(…, '')` turns both cases into NULL, and `company_id = NULL` matches nothing, so a request that forgets to set the tenant sees **no rows**: it fails closed. (This course's verifier hit exactly that error before the `nullif` was added: a nice example of a bug that only appears on a reused connection.) `SET LOCAL` lasts only until the end of the transaction, which matters with connection pools.

## Exercises

### Fail closed [1]

Show what `app_user` sees when no tenant has been set, and explain why that's the right default.

#### Solution

```sql
CREATE ROLE app_user;
GRANT SELECT ON projects TO app_user;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING (company_id = nullif(current_setting('app.company_id', true), '')::bigint);

SET ROLE app_user;
SELECT count(*) AS visible_projects FROM projects;
```

Zero rows. A missing tenant is a bug, and the safe outcome of a bug here is "show nothing", not "show everything". The opposite policy style (`USING (nullif(current_setting(...), '') IS NULL OR company_id = …)`) would leak all tenants on every forgotten `SET`. Spotting that is a good review comment.

### Composite foreign keys [2]

Make it impossible, at the database level, for a lot checklist to use a template from a *different* company than the lot's project. Sketch the columns and constraints you'd add.

#### Solution

Give the deep tables a `company_id` and make the foreign keys include it, so a mismatched company can't satisfy the reference:

```sql error
ALTER TABLE projects ADD CONSTRAINT projects_company_id_id_key UNIQUE (company_id, id);
ALTER TABLE checklist_templates ADD CONSTRAINT templates_company_id_id_key UNIQUE (company_id, id);

ALTER TABLE lots ADD COLUMN company_id bigint;
UPDATE lots l SET company_id = p.company_id FROM projects p WHERE p.id = l.project_id;
ALTER TABLE lots ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE lots ADD CONSTRAINT lots_company_project_fk
  FOREIGN KEY (company_id, project_id) REFERENCES projects (company_id, id);
ALTER TABLE lots ADD CONSTRAINT lots_company_id_id_key UNIQUE (company_id, id);

ALTER TABLE lot_checklists ADD COLUMN company_id bigint;
UPDATE lot_checklists lc SET company_id = l.company_id FROM lots l WHERE l.id = lc.lot_id;
ALTER TABLE lot_checklists ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE lot_checklists ADD CONSTRAINT lot_checklists_company_lot_fk
  FOREIGN KEY (company_id, lot_id) REFERENCES lots (company_id, id);
ALTER TABLE lot_checklists ADD CONSTRAINT lot_checklists_company_template_fk
  FOREIGN KEY (company_id, template_id) REFERENCES checklist_templates (company_id, id);

-- now this cross-tenant link is rejected: lot 1 is company 1's, template 10 is company 3's
INSERT INTO lot_checklists (company_id, lot_id, template_id) VALUES (1, 1, 10);
```

That last insert fails with a foreign-key violation, which is the point. It's denormalisation with a *constraint* keeping it honest. You'd roll it out as an expand/contract migration on a live system.

### The tenant-isolation test suite [2]

Describe an automated test that would catch a missing tenant filter on *any* endpoint, including ones added next year.

#### Solution

A table-driven integration test: seed two companies with parallel data (projects, lots, checklists, sign-offs), keep a registry of every route with how to build a request for a given entity id (ideally generated from the router or OpenAPI spec, so new routes are included automatically, or a test that fails if a route is missing from the registry), then for each route authenticate as company A and call it with company B's ids. Assert 404 (or 403) and that the response body contains none of B's identifiers. Run it in CI on every PR. Pair it with RLS, so even a missed case returns empty in production. Interviewers like "make the safe thing automatic, and test the invariant, not the examples".

## Say it aloud

"How would you isolate tenants' data in a multi-tenant SaaS on Postgres?"

#### Model answer

For many small and medium construction companies I'd use shared tables with a company id, because it keeps operations, migrations and analytics simple, and offer a dedicated database only if a large customer needed it for residency or contractual reasons. Then I'd make the shared model safe in layers. The tenant always comes from the authenticated session, never from request parameters. Data access goes through repository functions that always scope by the actor's company. Composite foreign keys that include the company id make it impossible to link a lot to another company's template. Postgres row-level security acts as a safety net: each request sets the tenant with SET LOCAL inside its transaction, the app connects as a non-owner role, and policies fail closed if the setting is missing. The same thinking applies outside the database, with S3 keys prefixed by company and authorisation before presigning, and caches and queue messages carrying the tenant. And I'd have an automated cross-tenant test suite that calls every endpoint as company A with company B's ids and expects not-found, so a new endpoint can't quietly skip the check.
