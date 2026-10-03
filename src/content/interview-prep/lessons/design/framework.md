## Explanation

A design discussion isn't a quiz with one right answer. It's a sample of how you'd think through a real feature with the team. Interviewers look for structure, sensible defaults, awareness of trade-offs, and the judgement to go deep where it matters. A repeatable structure stops you rambling and makes sure you hit the parts they care about. Use these five steps, in order, and **say each step's name as you start it** so the interviewer can follow.

**1. Requirements (about 5 minutes of a 30–45 minute discussion).** Ask before designing.

- *Functional*: who are the users (foremen, engineers, subcontractors, clients' reps), and what must they be able to do? Get the core two or three use cases. Park the rest explicitly ("I'll leave reporting out unless you want it").
- *Non-functional*, the questions that change the design: how many companies, projects and users? Read-heavy or write-heavy? Connectivity on site? Latency expectations? Data retention and audit rules? Security and tenant isolation? Mobile, web or both?
- Write the answers down where the interviewer can see them, because you'll refer back.

**2. Data model.** The entities and relationships, with the key columns and constraints. This is where your SQL module pays off and where many candidates are weak, so lean into it. Name the primary and foreign keys, uniqueness rules, what's append-only, and which indexes the main queries need. Say what's normalised and what (if anything) you'd denormalise, and why.

**3. API.** The handful of endpoints or messages that serve the use cases: method, path, request, response, error statuses. Mention auth (who is the caller, which company) and idempotency for writes from flaky clients. For async work, the queue message shape.

**4. Failure modes.** What goes wrong, and what the system does about it. Walk the request path and ask "what if this step fails?" at each hop: the client loses signal mid-request, a retry duplicates, two users edit the same thing, a dependency is slow or down, a deploy happens mid-flight, a message is poison, data is corrupted or deleted by mistake. This is where seniority shows. Mention how you'd *detect* each one (logs, alarms) as well as handle it.

**5. Trade-offs.** Name the alternatives you rejected and why: relational vs document, sync vs async, push vs poll, build vs buy, consistency vs availability for this feature. End with what you'd do first (the smallest valuable version) and what you'd revisit at 10× scale. "It depends" is fine *if* you then say what it depends on and pick.

**Running the conversation:**

- **Draw as you talk**: boxes for client, API, workers, database, storage, queue, and arrows for requests. Plain text in a shared doc is fine. Keep it simple; boxes don't need AWS logos.
- **Check in** every few minutes: "Shall I go deeper on sync, or move to the API?" Interviewers often have a part they want to explore. Let them steer.
- **Use real numbers loosely**: "a busy site might produce a few hundred responses and a thousand photos a day; across a few hundred projects that's small for Postgres but large for photo storage." That kind of back-of-envelope estimate drives decisions.
- **Use your domain knowledge**: you know what a hold point is, why a sign-off is legally meaningful, and what the reception is like in a basement. Interviewers at a construction-software company will value that. Use it to justify requirements, not to lecture.

**Common mistakes:** designing for Google scale by default; skipping the data model; a single box labelled "microservices"; ignoring auth and tenancy; never mentioning failure; and talking for ten minutes without checking in.

## Worked example

Prompt: *"Design the sign-off feature: inspectors request sign-off on a completed checklist, and an engineer or foreman signs it."* A compressed walk-through:

**Requirements.** "Users: inspectors request, foremen and engineers sign. Use cases: request sign-off, see my queue of pending sign-offs, sign or reject with a reason. Non-functional questions: is a sign-off a legal record? (Yes. It must never be silently changed, so it's auditable.) Do signers work offline? (Sometimes, but signing can require connectivity in v1.) Scale? (Hundreds of companies, sign-offs in the thousands per day: modest.)"

**Data model.**

```sql norun
sign_offs (id, lot_checklist_id FK, signer_role, requested_by FK users, requested_at,
           signed_by FK users NULL, signed_at NULL, rejected_reason NULL,
           CHECK ((signed_by IS NULL) = (signed_at IS NULL)),
           UNIQUE (lot_checklist_id, signer_role))
-- index: (requested_at) WHERE signed_at IS NULL   -- the pending queue
-- audit_events (append-only) records every request/sign/reject with actor and time
```

**API.** `POST /lot-checklists/:id/sign-off-requests` (validates the checklist is complete and hold points are released, returning 422 otherwise). `GET /sign-offs?status=pending` (the caller's queue, tenant-scoped). `POST /sign-offs/:id/sign` (409 if already signed). `POST /sign-offs/:id/reject {reason}`.

**Failure modes.** Two signers at once: a conditional `UPDATE … WHERE signed_at IS NULL`, so the loser gets 409. Double-submit on a bad connection: the same conditional update, plus an idempotency key. Checklist edited after the request: block new responses on a checklist with a pending or signed sign-off, or invalidate the request, which is a product decision. Notification email fails: send via a queue with retries, off the request path. Detection: alarm on 5xx, and on pending sign-offs older than N days.

**Trade-offs.** Synchronous signing (simple, needs signal) vs an offline queue (complex, conflict-prone). Choose synchronous for v1 because a sign-off is a deliberate act. Store the audit trail as an append-only table now, rather than reconstructing history later. Revisit at scale: the pending-queue index and partitioning audit events by month.

That covered every step in about a page. In the interview, it's 15 minutes of conversation with check-ins.

## Exercises

### Requirements questions [1]

Prompt: *"Design a feature for site teams to log defects (punch-list items) and get them fixed by subcontractors."* Write the eight questions you'd ask before designing, marking which ones would most change the design.

#### Solution

1. Who raises defects, and who fixes them? Do subcontractors log in to our system, or get emails or links? **(Changes auth and tenancy: external users.)**
2. What's on a defect: location, photos, severity, due date, trade?
3. What's the lifecycle: open → fixed → verified → closed? Who verifies? **(State machine.)**
4. Do people raise defects offline on site? **(Big one: offline sync.)**
5. Volume: per project per day, and photo counts?
6. Reporting: per subcontractor, overdue lists, exports for handover?
7. Notifications: email, push, digest?
8. Audit: must history be immutable for disputes or contracts? **(Append-only events vs editable rows.)**

The biggest design drivers are 1, 4 and 8. Say that, so the interviewer knows you can prioritise.

### Spot the missing failure modes [2]

A candidate's design for "photo evidence on checklist responses" is: *client uploads the photo to the API → API stores it in S3 → API inserts the photo row → done.* List the failure modes they missed and what you'd change.

#### Solution

- **Large uploads through the API**: Lambda/API Gateway payload limits and timeouts, and slow 3G. Use presigned URLs so the client uploads straight to S3.
- **Partial failure**: the S3 upload succeeds but the DB insert fails (or the reverse), leaving orphan objects or rows pointing at nothing. Record the photo row as `pending` first (or after upload, via an S3 event), and clean up orphans with an S3 lifecycle rule or a sweeper job.
- **Retries and duplicates**: the client retries after a timeout and gets two photos. Use an idempotency key or a deterministic object key per client-generated photo id.
- **Offline**: photos taken without signal must queue locally and upload later. The `uploaded_at` and `taken_at` gap is real (see the SQL drill's "late uploads").
- **Security**: one tenant fetching another's photo by guessing keys. The bucket must be private, with downloads through short-lived presigned GETs after an authorisation check.
- **Size and format**: phone photos are large, so resize or create thumbnails asynchronously (S3 event → queue → worker), and validate content type and size.
- **Detection**: alarm on upload failures and on a growing count of `pending` photos.

### Run the five steps yourself [3]

Set a 30-minute timer and talk through, out loud, *"Design the dashboard a project manager sees each morning: completion by lot, failed items, overdue sign-offs."* Use all five steps, with check-in prompts written in where you'd pause. Then compare with the model notes.

#### Solution

Model notes:

- **Requirements**: PM per project (or portfolio of projects). Data can be minutes stale (ask!). Must load quickly on a phone on site. Filter by project and date.
- **Data model**: no new tables needed. Completion from latest responses vs expected items, failures from latest-result = fail, overdue sign-offs from the partial index (all queries from the SQL module). Possible addition: a `lot_progress` materialised view refreshed every few minutes, or summary rows maintained on write, *if* measurement shows the live queries are slow.
- **API**: `GET /projects/:id/dashboard` returns `{ completionByLot: [...], failedItems: [...], overdueSignOffs: [...] }`. One round-trip, shaped for the screen, with `Cache-Control` for a short period.
- **Failure modes**: slow queries as data grows (indexes, the view, query timeouts), a stale view refresh failing silently (alarm on refresh age), tenant leakage (company filter in every query, plus integration tests), partial data during a deploy.
- **Trade-offs**: live queries (always fresh, more DB load) vs a precomputed view (fast, slightly stale), choosing live first and measuring. Server-rendered page vs client fetching. Push updates vs refresh, choosing refresh because a morning dashboard doesn't need real time.
- **Check-ins**: after requirements ("is a few minutes stale OK?"), after the data model ("want me to write the completion query?"), before trade-offs.

## Say it aloud

"How do you approach a system design question?"

#### Model answer

I use the same five steps each time and say them out loud so we stay in sync. First requirements. Who the users are, the two or three core use cases, and the non-functional things that change the design, like scale, connectivity on site, latency, audit and retention, and tenant isolation. I write those down and park anything out of scope. Second the data model: entities, keys, constraints, what's append-only, and the indexes the main queries need. In a relational design that's where most of the correctness lives. Third the API: the few endpoints or messages that serve the use cases, including auth and idempotency for writes. Fourth failure modes. I walk the request path asking what happens if each step fails, like lost connectivity, retries and duplicates, concurrent edits, slow dependencies and poison messages, and how we'd detect each one. Fifth trade-offs: what I chose, what I rejected and why, the smallest version I'd ship first, and what I'd revisit at ten times the scale. Throughout I draw simple boxes and arrows and check in, because the interviewer usually has an area they want to dig into.
