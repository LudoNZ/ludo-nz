## Explanation

A 20-minute rehearsal of the design discussion, on a question you haven't prepared specifically. Use the five-step structure from the design framework lesson: **requirements → data model → API → failure modes → trade-offs**. Say each step's name as you start it. If you have a friend to play interviewer, give them the "interviewer prompts" below to drop in. Otherwise record yourself and read them at the marked times.

**The question:**

> "Subcontractors on our customers' projects need to submit **inspection test plans' evidence for their own work**: for example, the waterproofing sub submits membrane checklists and flood-test photos. Today they email PDFs to the main contractor. Design a feature that lets subcontractor companies submit evidence into the main contractor's project, for the main contractor's engineer to review and accept or reject."

**Interviewer prompts:**
- **At 5 min** (if not asked): "Subcontractors often work for several main contractors at once."
- **At 10 min:** "How do you stop a subcontractor seeing anything else on the project?"
- **At 15 min:** "An engineer rejects a submission. What happens to the history?"

**Timing:** requirements about 4 min, data model about 5, API about 3, failure modes about 4, trade-offs and wrap-up about 4. Check in at least twice.

**What good looks like.** In real design interviews, the strongest candidates spend the first few minutes on questions, and their data model is concrete enough to write `CREATE TABLE` from. They name the security boundary out loud, describe failures *and* how they'd notice them, and end with a clear v1 plus what they'd defer. Weaker answers jump to boxes and services, stay vague about data, and never say "I'd choose X because…". You don't need to cover everything. Covering the important things clearly, and saying what you're leaving out, scores better than racing through every box.

**After the round**, compare your notes with the reference outline. For each gap, ask whether it was missing knowledge (go back to the matching design case) or missing process (you knew it but didn't think to say it). The second kind is fixed by practising the five-step script out loud once more.

**Self-score (1–3 each):** asked requirements that changed the design · data model with keys and constraints · tenancy handled explicitly · failure modes with detection · trade-offs named with a choice · checked in · stayed within time.

## Worked example

How the first minute might sound:

> "Before designing, a few questions. Who are the users: the subcontractor's staff, and the main contractor's engineer? Do subcontractor staff already have accounts, or are they invited per project? Can one subcontractor company work for several main contractors? (That changes the tenancy model a lot.) What's being submitted: our standard checklists, or arbitrary documents and photos? Does the main contractor need an audit trail of what was submitted and when, for handover? And volume: how many subs per project, and how many submissions a week? Let me note the answers, then I'll start on the data model."

The prompt at 5 minutes, *subs work for several main contractors*, is the crux. A subcontractor isn't a tenant user inside one company. It's a separate organisation with relationships to several tenants. Candidates who model subs as ordinary users of the main contractor's company get stuck at the 10-minute prompt.

## Exercises

### Run the round (20 min) [3]

Do the full question with the prompts. Afterwards, write down your data model and compare it with the reference outline below.

#### Solution

Reference outline. Yours can differ, but should cover the same ground:

**Requirements.** Users: subcontractor staff (submit) and the main contractor's engineer (review). Subcontractor companies are separate organisations that may work with many main contractors, so they're invited per project and see only what's shared with them. Submissions: checklist responses using the main contractor's template, plus photos and documents. Audit: every submission, review and resubmission kept. Scale: tens of subs per project, low hundreds of submissions a week. Small.

**Data model.**
- `companies` gets a `kind` (main contractor or subcontractor), or the model treats all as organisations.
- `project_participants (project_id, company_id, role: 'subcontractor', trade, invited_by, invited_at, revoked_at)`: the many-to-many between projects and *other* companies.
- `work_packages (id, project_id, subcontractor_company_id, lot_id NULL, template_id, due_on)`: what a sub must evidence. The template belongs to the main contractor (versioned).
- `submissions (id, work_package_id, submitted_by, submitted_at, status: submitted|accepted|rejected, reviewed_by, reviewed_at, review_note)`: **each resubmission is a new row**, never an update, so the history is preserved (the 15-minute prompt).
- `submission_responses`, `submission_files`: the evidence, hashed at upload.
- Constraints: a submission's `submitted_by` user must belong to the work package's subcontractor company (enforced in the app, or with composite keys).

**API.** `POST /projects/:id/participants` (invite a sub), `GET /work-packages?mine` (the sub's list across *all* projects they're invited to), `POST /work-packages/:id/submissions` (with an idempotency key, photos via presigned URLs), `POST /submissions/:id/review {decision, note}` (conditional on status `submitted`, so a 409 if already reviewed).

**Tenancy (the 10-minute prompt).** Authorisation is relationship-based: a sub's user can access a work package only if their company is an active participant on that project *and* the work package is assigned to their company. RLS policies (or repository scopes) for subs key on `subcontractor_company_id`, not the project's company. Photos are under keys namespaced by project *and* sub, with presigned access after that check. Revoking a participant takes access away immediately but keeps their submissions in the record. Cross-tenant tests cover a sub trying another sub's work package and another project.

**Failure modes.** Duplicate submissions (idempotency key), large uploads on site (presigned and multipart, an outbox), reviewing a stale submission (status check), a sub removed mid-project (revoked_at, read-only history), template changed after submission (the submission references a template *version*). Detection: alarms on upload errors, and a dashboard of overdue work packages.

**Trade-offs.** Relationship-based access vs giving subs accounts inside each main contractor's tenant (duplicate accounts, but simpler RLS). I'd choose relationship-based because subs work across many contractors and want one login. Append-only submissions vs editable ones: append-only for audit. Email notifications vs in-app: both, with email digests. v1: invite, submit, accept or reject, with no offline support for subs. Later: offline, and APIs for subs' own systems.

### Critique a weak answer [2]

A candidate's whole answer was: *"Add a `role = 'subcontractor'` to users, give them the main contractor's company_id so they can log in, and hide pages they shouldn't see in the UI."* List the problems.

#### Solution

1. **Subs work for several main contractors.** One `company_id` per user forces duplicate accounts per contractor, and their history fragments.
2. **Security by hiding UI**: the API would still return everything the main contractor's company can see. Authorisation must be server-side (scoped queries and RLS), not UI hiding.
3. **Over-broad access**: tenancy is by company, so a sub inside the main contractor's tenant could read every project, defect and other sub's work. A serious confidentiality problem between competing subs.
4. **No audit model** for submissions and reviews, and no resubmission history.
5. **No offboarding**: when the sub's contract ends, how is access revoked without deleting their records?
6. **No failure handling** (uploads, duplicates, concurrent reviews).

The fix is to model subcontractors as their own organisations with explicit project relationships, as in the reference outline.

## Say it aloud

"In one minute: what was the most important decision in your design, and why?"

#### Model answer

"The most important decision was modelling subcontractors as their own organisations with explicit, revocable relationships to projects, rather than as users inside each main contractor's company. Subs work for several contractors at once, so they need one login and one view of all their work packages. More importantly, a sub must see only the work packages assigned to them, never the rest of the project or a competing sub's submissions. Making access relationship-based, and enforcing it server-side in scoped queries with row-level security as a backstop, makes that boundary explicit and testable. The second key decision was append-only submissions, so a rejection and resubmission keeps the full history, which matters for handover and disputes."
