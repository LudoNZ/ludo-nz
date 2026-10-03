## Explanation

The last ten minutes of preparation: a final check that you're ready, and a short plan for the day itself. Go through the checklist honestly. Anything you can't tick goes into your last study session, or becomes something you say confidently that you're still building ("I've been learning X; here's what I've done so far").

**Technical readiness. Can you, without notes:**

- [ ] Write a multi-table `JOIN` with `GROUP BY`/`HAVING`, using `LEFT JOIN` and `count(col)` correctly for "including none"?
- [ ] Write latest-row-per-group with `row_number()` *and* with `DISTINCT ON`, with a tie-breaker?
- [ ] Explain normalisation and when you'd denormalise, using the QA schema as the example?
- [ ] Read an `EXPLAIN ANALYZE` plan and say why an index is or isn't used?
- [ ] Explain the N+1 problem and two fixes?
- [ ] Write a parameterised query in TypeScript and explain injection, including why identifiers need an allowlist?
- [ ] Explain transactions, Read Committed, a lost update, and the conditional-`UPDATE` fix?
- [ ] Write a Vitest unit test with a test double, and an RTL test with `userEvent` and `findBy…`?
- [ ] Describe how you'd integration-test an API handler against a real Postgres, including isolation between tests?
- [ ] Do a TDD cycle out loud: red, green, refactor?
- [ ] Map Lambda, API Gateway, S3, SQS, DynamoDB, RDS, IAM and CloudWatch to their Firebase equivalents?
- [ ] Read a `serverless.yml` and explain deploy, stages and least-privilege IAM?
- [ ] Explain cold starts, DB connections from Lambda (RDS Proxy), retries, idempotency and DLQs?
- [ ] Describe the alarms you'd set and the shape of an RCA?
- [ ] Explain discriminated unions, generics and two utility types with examples?
- [ ] Explain effect cleanup, keys and when to memoise?
- [ ] Run a design question through the five steps in 20 minutes?

**Stories and personal pitch:**

- [ ] 30-second "tell me about yourself", ending with why this role.
- [ ] Production problem story (STAR + learning), under 3 minutes.
- [ ] Supporting others story.
- [ ] Explaining a trade-off to a non-technical person.
- [ ] Ten-minute app walkthrough, timed, with "what I'd change".
- [ ] How you use LLM tools, and where you check them closely.

**Questions to ask them.** Prepare three or four genuine ones. Good ones for this kind of team:
- "What does a typical ensemble session look like: how long, how do you rotate, how do you handle disagreements?"
- "How do you approach testing: what's the balance between unit and integration tests against the database?"
- "What's the hardest technical problem the team is working on right now?"
- "How do you get feedback from site users, and how often do developers see the product used on site?"
- "What would success look like for someone in this role after three and six months?"

**Logistics (the day before):**
- [ ] Time, place or link confirmed. Time zone checked if remote.
- [ ] For remote: camera, mic, screen sharing tested. Notifications off. A quiet room.
- [ ] Editor ready, with a scratch project containing Vitest set up, and the seed database running in case you're allowed to use your own environment. AI completion turned off if it isn't allowed.
- [ ] Water, a notepad and a pen for the design question.
- [ ] Sleep. Seriously: it's worth more than one more lesson.

**On the day:** clarify first, think aloud, take small steps, test early, check in. If you don't know something, say so and reason it through. That's what they'd want from a teammate too.

## Worked example

How to use the checklist: suppose you can't confidently tick "read an `EXPLAIN ANALYZE` plan". With one day left, do this and nothing new:

1. Reload the seed and recreate `responses_big` (performance lesson worked example).
2. Run the four plans from that lesson: no index, with an index, low selectivity, the expression index. Say out loud what each line means.
3. Do the *say it aloud* for that lesson with a timer.
4. Tick it, or decide on your honest line: "I'm comfortable reading basic plans: scans, index usage, row estimates. I'd lean on the team for deeper tuning while I build that up."

Targeted repetition of a weak spot beats skimming everything once more.

## Exercises

### Final self-assessment [1]

Go through every checkbox above, then update the confidence rating (1–5) for each module on this page. The readiness summary at the top will show your weakest modules. Pick the single most valuable lesson to redo, and schedule it.

#### Solution

Your readiness summary is the answer. Rules for choosing what to redo: the role treats SQL as essential, so any SQL module rating below 4 comes first. Then testing (strongly expected), then design (it's half the interview), then AWS (preferred, and can be honest "learning" territory). Redo the *exercises* of the weakest core lesson without looking at solutions, rather than rereading explanations.

### Your opening and closing lines [1]

Write the first two sentences you'll say when asked "tell me about yourself", and the last thing you'll say when they ask "anything else you'd like us to know?"

#### Solution

Opening (example shape): *"I'm a full-stack developer with about three years of commercial experience in React, TypeScript, Next.js and Firebase, and before that I worked in construction as a carpenter and site foreman. So quality assurance on site is something I've lived from the other side."* Closing: *"Only that I'm genuinely excited about building software for people I used to work alongside. And I've enjoyed going deep on Postgres, testing and AWS to prepare. I'd love to keep building on that with your team."* Keep both true, short, and in your own words.

## Say it aloud

"Why should we hire you for this role?"

#### Model answer

"Three reasons. First, I understand your users. I've been the foreman waiting on an engineer's sign-off with a concrete truck on the way, so I know what makes QA software help or get in the way on site, and I'd bring that judgement to every feature. Second, I own things end to end. I've built and shipped full-stack features in React, TypeScript and Next.js, and I care about how they behave for real users after they ship. Third, I learn deliberately and quickly. For this role I've built a Postgres practice database for a QA domain and worked through joins, window functions, indexes and transactions against it. I've written unit and integration tests with Vitest, Testing Library and a real database, and [once you've done the AWS project] deployed and torn down a small serverless API with tests. Only say what you've actually done. I know there's more to learn, especially operating AWS in production, and I'd expect to learn it fastest in exactly the kind of pairing and ensemble environment you have."
