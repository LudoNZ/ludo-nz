## Explanation

Behavioural questions ("tell me about a time…") are where technical candidates often ramble. Prepare **three stories**, practise them aloud, and bend them to fit most questions. The content has to be yours. Don't invent anything: interviewers ask follow-ups, and specific, true details are what make a story convincing.

**Structure: STAR, with the emphasis in the right place.**

- **Situation** (2–3 sentences): just enough context. Where, what was at stake.
- **Task**: what *you* were responsible for.
- **Action** (most of the time): what *you* did, step by step, including your reasoning and the options you rejected. Say "I", not "we", for your part.
- **Result**: the outcome, with a number if you have one. Then **what you learned** or would do differently, which is often the part interviewers remember.

Aim for **two to three minutes** per story. Stop and let them ask follow-ups rather than covering everything.

**The three stories to prepare:**

**1. A production problem you diagnosed.** Shows debugging method, calm, ownership and learning. Prompts to find it:
- When did something break for real users? What was the first sign: an error report, a user call, a metric?
- How did you narrow it down: logs, reproducing locally, bisecting commits, querying data?
- What was the actual root cause, and what *contributing* factors let it happen?
- What did you change so it couldn't happen again, or would be caught sooner (a test, an alarm, a validation)?
- Bonus: tell it in the RCA shape from the AWS observability lesson.

**2. Supporting less experienced developers.** Shows leadership without a title, and how you'd behave in an ensemble. Prompts:
- Who did you help: a junior, an apprentice, a new starter, someone from another discipline? On site, apprentices and new crew count, and the skills transfer. Use one tech example if you have it, and mention site leadership briefly as background.
- What did they struggle with, and how did you work out what they actually needed?
- What did you do: pair with them, review their code, explain a concept, set up a safe task, give feedback?
- How did they progress? What did you learn about teaching?
- Watch the balance: show that you helped them *grow*, not that you fixed their work for them.

**3. Explaining a technical trade-off to a non-technical person.** Shows communication with clients, PMs and site teams, which really matters for a construction-software company whose users are foremen and engineers. Prompts:
- When did a non-technical person need to decide something with technical consequences: speed vs completeness, offline support, cost, a deadline vs quality?
- How did you frame it in *their* terms: time, money, risk, what happens on site?
- Did you use an analogy? (Your construction background is a superpower here: temporary works vs permanent, "we can pour today but we can't drill that slab later", hold points.)
- What did they decide, and how did it turn out?

**Bending stories to other questions.** "A time you disagreed with someone" → story 3 or a review disagreement. "A mistake you made" → story 1 if the bug was yours (owning it is a strength). "A time you had to learn something fast" → your SQL, testing or AWS preparation for *this* interview is a perfectly good, honest answer.

**Your career change is an asset; frame it that way.** Carpenter and site foreman → developer means you understand the users, you've run teams under time pressure, you know what quality assurance means when concrete is on the truck, and you know why a sign-off matters. Prepare a 30-second version for "tell me about yourself" that ends with why *this* role fits.

## Worked example

A **model shape** for story 1. The content is illustrative, so replace every detail with your own:

> **Situation.** "At [company] we had a [Firebase/Next.js] app that [users] used to [task]. One Monday, several users reported that [symptom: their saved data was missing / the page hung]."
>
> **Task.** "I owned that feature, so I took the incident."
>
> **Action.** "First I checked whether it was everyone or a subset. It was only users with [characteristic], which suggested data rather than a deploy. I found the failing requests in [logs], and the error was [error]. I reproduced it locally by [how]. The root cause was [cause, e.g. a query/listener that assumed X]; a contributing factor was that we had no test covering [case] and no alert on [signal], so we only heard from users. I shipped a fix that [fix], verified it with the affected users' data, and then [backfilled/repaired] the records that were affected."
>
> **Result.** "Users were back within [time]. [N] records repaired, none lost. Afterwards I added [a test for the case] and [an alert], and wrote up a short post-incident note for the team."
>
> **Learning.** "Since then I always [habit: test the boundary case / add monitoring with new features / check how data looks for the oldest accounts]."

Notice the proportions: two sentences of setup, most of the time on *how you thought*, one concrete technical detail (an error message, a query), and a learning that's a real habit.

## Exercises

### Draft your three stories [2]

Using the prompts, write each story as five bullet points (S, T, A, R, learning). Then say each aloud with a timer, aiming for 2–3 minutes. Note any place where you said "we" for something you did.

#### Solution

Self-check each story:
- [ ] The situation is under 30 seconds and includes why it mattered.
- [ ] At least half the time is on **your actions and reasoning**, including an option you rejected.
- [ ] There's one concrete, checkable detail (an error, a number, a tool, a query).
- [ ] The result is specific ("in two hours", "the next three releases had none", "she now leads the reviews").
- [ ] The learning is a habit you can show still applies.
- [ ] No invented details. Everything survives a follow-up question.
- [ ] Under three minutes out loud.

### Map stories to questions [1]

For each question, say which of your three stories you'd use (and the angle): (a) "Tell me about a time you made a mistake." (b) "How do you handle disagreement in a team?" (c) "Tell me about mentoring." (d) "When did you have to learn something quickly?" (e) "How do you explain technical things to clients?"

#### Solution

(a) The production problem story, if the bug was yours or your team's. Emphasise ownership and the prevention you added. (b) The trade-off story, if the decision involved differing views. Otherwise a code review disagreement, focusing on data and testing to settle it. (c) The supporting-others story. (d) This interview prep: you identified gaps (SQL, testing, AWS), made a plan, built a practice database, deployed and tore down an AWS stack, and practised under time pressure. It's true and directly relevant. (e) The trade-off story, perhaps with a construction analogy. If a question doesn't fit any story, it's fine to take a moment: "Let me think of the best example…"

### The 30-second introduction [1]

Write your answer to "Tell me about yourself" in five sentences: past, present, strengths, why this company, why now.

#### Solution

Shape (fill with your facts): *"I spent [N] years in construction as a carpenter and then site foreman, running crews and dealing with inspections and sign-offs first-hand. I moved into software [N] years ago and have been working as a full-stack developer with React, TypeScript, Next.js and Firebase, owning features end to end. My strengths are product ownership and understanding how sites actually run, so I'm good at building things site teams will actually use. I'm excited about [company] because QA software is exactly where those two halves meet. And I've been deliberately building up the parts I've used less, like relational modelling in Postgres, automated testing and AWS serverless, because I know they matter in your stack."* Keep it under 45 seconds. They'll ask follow-ups.

## Say it aloud

"Tell me about a time you explained a technical trade-off to someone non-technical."

#### Model answer

(This is a shape. Use your own true example.) "On a [project], the [PM/client/site manager] wanted [feature] by [date]. The trade-off was [quick version with limitation X] versus [fuller version taking Y longer]. Rather than talk about [technical detail], I framed it like a pour decision on site: we can pour the slab on Friday if we accept that [limitation], like coring for services later instead of casting sleeves in now. It's possible, but it costs more and it's messier. I laid out what each option meant for their people day to day, what it cost in time, and the risk if we chose wrong. They chose [option], and we [result]. I learned that when people see the consequences in their own terms they make good decisions quickly, and that it's worth writing the decision down so nobody's surprised later."
