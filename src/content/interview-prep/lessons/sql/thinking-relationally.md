## Explanation

In Firestore you design around **reads**: work out which screens you'll render, then shape documents so each screen is one or two document fetches. You nest data, copy fields (the project name onto every checklist) and accept that updates have to fan out. That's the right call for Firestore, because it has no joins and charges per document read.

A relational database flips this. You design around the **facts**: each fact is stored exactly once, in the table it belongs to, and the database joins facts back together at query time. Reads are flexible (any question, any shape) and writes are simple (change a fact in one place).

**The mapping:**

| Firestore | Relational |
| --- | --- |
| Collection | Table: a fixed set of typed columns |
| Document | Row |
| Document ID | Primary key (`id bigint`) |
| Field holding another doc's ID | Foreign key column, which the database *enforces* |
| Subcollection (`projects/{id}/lots`) | Child table with a `project_id` foreign key |
| Array of maps inside a document | Child table, one row per element |
| Copied field (`projectName` on a lot) | Usually nothing. Join to `projects` when you need it |
| Security rules checking `companyId` | A `company_id` column plus a `WHERE` (and optionally row-level security) |

**Normalisation** is the discipline of "each fact once". The practical version, without the textbook numbering:

1. **One value per cell.** No comma-separated lists, no arrays of things you'll want to query individually. A checklist's items go in `checklist_items`, not in a JSON array on the template.
2. **Every column describes the whole key.** In `project_members (project_id, user_id, member_role)`, the role is about *that user on that project*, so it belongs there. The user's email does not: it's about the user alone, so it lives in `users`.
3. **No column describes another non-key column.** If `lots` stored `project_id` *and* `project_name`, the name depends on the project, not the lot. Two lots could disagree about the name, and renaming a project means updating every lot. That's an *update anomaly*, and it's exactly the fan-out you hand-wrote in Cloud Functions.

**Foreign keys** are the big upgrade over Firestore. `lots.project_id REFERENCES projects (id)` means the database refuses a lot pointing at a project that doesn't exist, and refuses to delete a project that still has lots (unless you said `ON DELETE CASCADE`). The orphaned documents you've cleaned up in Firestore simply can't happen.

**When to denormalise anyway.** Copying data is a deliberate trade, not a sin. Do it when:

- **You need history.** A sign-off should record who signed and when, and a report should show the template *as it was* when the checklist was filled in. That's why the seed has template `version`s rather than editing templates in place.
- **A measured hot read is too slow** even with good indexes. Then add a cached count or a materialised view, and own the job of keeping it in sync.
- **The data crosses a service boundary.** For example, a search index or an analytics warehouse.

Interviewers like hearing "normalise first, denormalise with a reason and a sync strategy". The usual order of tools to reach for: a better index → a view → a materialised view → a denormalised column maintained in the same transaction.

**Joins aren't slow by default.** Joining on an indexed key is cheap, and it's what Postgres is built for. The cost you're used to in Firestore (one read per document) doesn't exist here. One query joining five tables is usually much faster than five round-trips.

## Worked example

Here's a Firestore-shaped checklist document, the kind you'd have built:

```json
{
  "projectName": "Riverside Apartments",
  "lotCode": "TRC-101-L03",
  "templateName": "Pre-pour concrete inspection",
  "assignedTo": { "uid": "u3", "name": "Chloe Tan" },
  "items": [
    { "prompt": "Formwork clean, braced and to line", "result": "pass", "photos": ["a.jpg", "b.jpg"] },
    { "prompt": "Cover to reinforcement (mm)", "value": 55 }
  ],
  "signOffs": [{ "role": "foreman", "by": "Dave Wiremu", "at": "2026-09-01T10:00:00Z" }]
}
```

Pull it apart fact by fact:

- `projectName` and `lotCode` describe the lot and project → `lots`, `projects`. The checklist keeps only `lot_id`.
- `templateName` describes the template → `checklist_templates`. The checklist keeps `template_id`.
- `assignedTo.name` describes the user → `users`. Keep `assigned_to` (a user id).
- `items[]` is two different things mixed together: the *questions* (the same for every lot using this template) → `checklist_items`, and the *answers* → `responses`, one row per answer, pointing at both the checklist and the item.
- `photos[]` inside an item → `photos`, one row per photo, pointing at a response.
- `signOffs[]` → `sign_offs`.

Now a question that's painful in Firestore, *"for each project, how many responses have failed?"*, becomes one query:

```sql
SELECT p.name, count(*) AS failed_responses
FROM responses r
JOIN lot_checklists lc ON lc.id = r.lot_checklist_id
JOIN lots l            ON l.id = lc.lot_id
JOIN projects p        ON p.id = l.project_id
WHERE r.result = 'fail'
GROUP BY p.name
ORDER BY failed_responses DESC;
```

Read the joins as walking up the foreign keys: response → its checklist → its lot → its project. In Firestore you'd either keep a counter on each project document, updated by a Cloud Function, or read every response.

## Exercises

### Spot the anomaly [1]

A teammate proposes adding `company_name text` to `projects` "so the dashboard doesn't need a join". Name the anomaly this creates, and write the query the dashboard should use instead, listing each project's code with its company's name.

#### Solution

It's an update anomaly: renaming a company means updating every project, and if one update is missed the data disagrees with itself. The join is cheap:

```sql
SELECT p.code, p.name AS project, c.name AS company
FROM projects p
JOIN companies c ON c.id = p.company_id
ORDER BY c.name, p.code;
```

### Model a defects list [2]

Site teams want to raise **defects** (punch-list items) against a lot: a description, a severity (`minor`, `major`, `critical`), who raised it and when, and optionally who closed it and when. A defect can have several photos. Write the `CREATE TABLE` statement(s). Reuse existing tables where it makes sense.

#### Solution

```sql
CREATE TABLE defects (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  lot_id      bigint NOT NULL REFERENCES lots (id),
  description text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  raised_by   bigint NOT NULL REFERENCES users (id),
  raised_at   timestamptz NOT NULL DEFAULT now(),
  closed_by   bigint REFERENCES users (id),
  closed_at   timestamptz,
  CHECK ((closed_by IS NULL) = (closed_at IS NULL))
);

CREATE TABLE defect_photos (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  defect_id   bigint NOT NULL REFERENCES defects (id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  uploaded_by bigint NOT NULL REFERENCES users (id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO defects (lot_id, description, severity, raised_by)
VALUES (3, 'Honeycombing on slab edge, grid C', 'major', 4)
RETURNING id, raised_at;
```

The photos get their own table rather than being forced into `photos` (which requires a `response_id`). You could argue for one polymorphic `attachments` table instead. That's a fair design conversation: it saves a table but you lose a real foreign key. Note the same paired-NULL CHECK as `sign_offs`, and that `company_id` isn't stored: it's reachable through lot → project → company.

### Walk the foreign keys [2]

List every photo's storage key with the project code and lot code it belongs to, for lot `TRC-101-L01` only.

#### Solution

```sql
SELECT p.code AS project, l.code AS lot, ph.storage_key
FROM photos ph
JOIN responses r       ON r.id = ph.response_id
JOIN lot_checklists lc ON lc.id = r.lot_checklist_id
JOIN lots l            ON l.id = lc.lot_id
JOIN projects p        ON p.id = l.project_id
WHERE l.code = 'TRC-101-L01'
ORDER BY ph.storage_key;
```

Four hops from photo to lot. In Firestore you'd have stored `lotCode` on each photo. Here you write the joins once (or put them in a view) and never have to keep copies in sync.

## Say it aloud

"You've mostly used Firestore. How does designing a schema for Postgres differ, and when would you denormalise?"

#### Model answer

In Firestore I design around reads. I work out the screens, then shape and duplicate documents so each screen is a couple of fetches, because there are no joins and every document read costs money. In Postgres I design around facts. Each fact lives once, in the table it describes. Relationships are foreign keys the database enforces, and I join at query time. Writes get simpler because a rename happens in one place, and reads get more flexible because I can answer questions I didn't plan for. So my starting point is normalised: no lists in cells, attributes on the table they actually describe, a child table instead of an array of maps. I denormalise when there's a reason I can name. The main ones are history, like snapshotting what a template looked like when a checklist was signed, or a hot read that's still too slow after indexing and query tuning. Even then I prefer a view or a materialised view first, and if I copy a column I keep it in sync in the same transaction and write down who owns it.
