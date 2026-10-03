## Explanation

Expect some version of *"Walk us through something you've built. What were the key decisions, and what would you change?"* It's your best chance to show ownership end to end, which is one of your strengths, so prepare it like a short talk, not an improvisation. Ten minutes, with room for questions.

**Pick the right app.** Ideally a commercial one you owned substantially: you can talk about real users, constraints and production issues. Choose one where you made real decisions (data model, architecture, trade-offs), not just implemented tickets. If confidentiality limits what you can show, describe it at the architecture level and say so; interviewers respect that. A personal project such as the decking calculator on this site is a good *second* example, especially for a construction-software company, because it shows domain depth and initiative.

**The ten-minute template:**

1. **Context (1 min).** What it is, who uses it, why it exists. One sentence on scale (users, data volume, team size). Your role: what *you* owned.
2. **Architecture (2 min).** The boxes: frontend, backend, data, hosting, integrations. Have a simple diagram ready (a sketch you can share, or describe it clearly).
3. **Two or three key decisions (4 min).** For each: the problem, the options you considered, what you chose and *why*, and how it turned out. This is the heart of it. Good candidates: data model choices, an offline or real-time decision, how you handled auth or permissions, a performance fix, a testing or deploy approach.
4. **A hard problem (1.5 min).** A bug, outage, performance issue or tricky requirement: how you diagnosed it, what you changed, what you learned. (This can be the same story as the "production problem" one in the team-practices module.)
5. **What I'd change (1.5 min).** With hindsight: what you'd do differently and why. This is where you show growth, and for this role it's a natural place to say *"I'd model this relationally"* or *"I'd add integration tests around X"*, credibly, because you've now done both.

**Prompts to prepare answers for** (write bullet answers for your chosen app):

- What were the main entities and how were they stored? What did the data model make easy or hard?
- Where was the business logic, and how did you keep it testable?
- How did authentication and authorisation work? Could one user see another's data by mistake? How do you know?
- What happened when the network failed or a request was retried?
- How did you deploy? How did you know a deploy was healthy?
- What was the worst bug, and how did you find it?
- What would break first at 10× the users or data?
- What did you get wrong, and when did you realise?
- If you had another month, what would you do?

**Delivery tips:** lead with the user problem, not the tech stack. Use concrete numbers and names ("the cut list for a 40 m² deck has about 120 boards"). Say "I" for what you did and "we" for the team. Don't hide the warts; owning a mistake and its fix is more convincing than a flawless story. Stop at ten minutes and invite questions: "Happy to go deeper on any of those."

**Mapping to this role:** where your app used Firestore, be ready for "how would that look in Postgres?" Sketch the tables in a sentence or two. Where it had no tests, be ready for "how would you test it now?" Name a unit-tested pure function and one integration test.

## Worked example

A skeleton for the **decking layout and cut-list calculator** on this site (`/decking`), as a model of the shape. Adapt it to your commercial app.

**Context.** "A tool I built for laying out deck boards: given the deck's shape, joist spacing and the boards I actually have, it plans every row's boards and joins so joins are staggered across joists, produces a cut list, and walks the person cutting through it board by board on site. I built it end to end: about 5,000 lines of TypeScript across the layout engine and UI, around 70 commits. [Say how it's been used: on your own jobs, by others?]"

**Architecture.** "Next.js and React on the client. The layout engine is a set of pure TypeScript functions (`computeDeckLayout(config)` takes a deck config and returns rows, segments and joins), separate from the UI components. Decks are saved in Firestore: private decks per user, plus public shareable decks, protected by security rules with schema checks."

**Decisions.**
1. *A pure layout engine.* "The hard logic, picking join positions on joists so they don't line up with neighbouring rows and using up real stock lengths, lives in pure functions that take config and return a plan. That made it easy to iterate on the rules and to preview a change, like 'would a join here clash?', without touching state."
2. *Locking rows once cut.* "Once a board in a row is marked as cut, that row's arrangement is snapshotted and kept on every recompute. On site, the plan can't be allowed to change under boards that are already cut. [If it came from a real job, say so: that's a strong detail.]"
3. *Finite stock instead of infinite boards.* "Real jobs have a pile of specific lengths, so the layout draws from an inventory, and a prediction feature estimates a supplier pack's length mix from past orders."

**Hard problem.** "Label placement and row numbering near a change in rake angle went wrong in edge cases: [your specific diagnosis and fix]."

**What I'd change.** "Add unit tests around `computeDeckLayout` and the join-clash rules. They're pure, so it's cheap, and they're exactly the kind of rules that regress. For the shared project stock and order history, which are relational data (projects, decks, stock orders, lengths), I'd consider Postgres for reporting across jobs. And I'd validate deck configs server-side as well as in the rules."

## Exercises

### Fill in the template for your main app [2]

Write your own walkthrough using the five-part template: context, architecture, two or three decisions, one hard problem, what you'd change. Bullet points only, fitting on one page.

#### Solution

There's no single answer. Check yours against this list:
- Context names the **users and their problem** in the first sentence, and states **your role** honestly.
- Architecture fits in about five boxes and you can draw it in 30 seconds.
- Each decision has **options considered** and a **reason**, not just "we used Firebase".
- The hard problem has **symptom → diagnosis → fix → lesson**, with one concrete detail (a log line, a query, a number).
- "What I'd change" includes at least one item that connects to this role (relational modelling, automated tests, infrastructure as code, observability), framed as something you've since learned to do.
- It runs **under ten minutes** out loud. Time it.

### The Postgres question [2]

For your app, an interviewer asks: *"How would your data model look in Postgres?"* Write the four or five main tables (names, key columns, foreign keys) and one query that would have been hard in Firestore but is easy now.

#### Solution

Example for the decking tool: `decks (id, owner_id, name, width_mm, side_a_mm, side_b_mm, joist_spacing_mm, board_width_mm, created_at)`, `deck_points (deck_id FK, position, x_mm, y_mm)`, `stock_items (id, project_id FK, length_mm, quantity)`, `deck_projects (id, owner_id, name)` with `decks.project_id FK NULL`, `cut_log (id, deck_id FK, segment_id, row_index, cut_length_mm, duration_ms, completed_at)`. Query: *"average cutting time per board length across all my decks this year"*: `SELECT cut_length_mm / 100 * 100 AS bucket, avg(duration_ms) FROM cut_log c JOIN decks d ON d.id = c.deck_id WHERE d.owner_id = $1 AND c.completed_at >= date_trunc('year', now()) GROUP BY 1 ORDER BY 1`. In Firestore that's reading every log document client-side. Do the same for your commercial app's main entities.

### Rehearse the hard questions [1]

Answer each in under 45 seconds, out loud: "What would break first at 10× scale?", "What's a decision you regret?", "How did you test it?"

#### Solution

Good answers are specific and honest:
- **10×**: name the actual bottleneck (a query or listener that reads too much, client-side computation on big inputs, a single document hot-spot) and the fix (an index or pagination, moving work to the server, sharding the hot document).
- **Regret**: a real one plus what you learned. For example, "storing derived totals on documents and keeping them in sync with functions. It drifted. Now I'd compute them in a query or keep one source of truth."
- **Testing**: say what existed truthfully, what you'd add now (unit tests on the pure rules, integration tests for data access, a smoke test after deploy), and that you've since practised exactly this. Never overclaim test coverage. Interviewers probe.

## Say it aloud

"Walk me through an app you built, in two minutes: the short version."

#### Model answer

(Adapt to your app. This is the shape.) "The one I'm proudest of is [app], which [users] use to [problem]. I built it end to end: [stack]. The core decision was [decision], because [reason]. For example, keeping the business logic in pure functions separate from the UI, which made the hard rules easy to change and reason about. The hardest problem was [bug or performance issue]. I found it by [diagnosis] and fixed it by [fix]. With hindsight, I'd [change]: probably model the data relationally, since it's naturally relational with projects, items and history, and add automated tests around the core rules and the data access, which I've since been practising. I'm happy to go deeper on the architecture or any of those decisions."
