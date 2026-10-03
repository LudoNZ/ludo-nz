## Explanation

In a live pairing exercise the interviewer is mostly asking one question: *would I enjoy and trust working next to this person every day?* The team does pair and ensemble programming, so this exercise is a sample of the actual job. Correct code matters, but it's not the only thing scored. These habits are what make you visibly good to work with.

**1. Clarify before you code.** Restate the problem in your own words. Ask about inputs, outputs, edge cases and constraints. Agree two or three concrete examples, and write them down as test cases or comments. Ask what "done" looks like for this session. Two minutes here saves twenty later, and it's the habit interviewers mention most when they reject people: "jumped straight into code".

**2. Think aloud.** Your pair can't see your reasoning unless you say it. Narrate intent ("I'll handle the empty case first"), options ("I could use a Map or sort first; Map is O(n) and simpler"), uncertainty ("I don't remember whether `localeCompare` takes options here; I'll check") and when you're stuck ("I'm stuck on how to express the tie-break. Can I talk it through?"). Silence for more than 30 seconds reads as being lost, even when you aren't.

**3. Small steps.** Get *something* running in the first few minutes: a function that returns a hard-coded value, a test that runs. Then grow it one behaviour at a time, running often. Small steps are easier for your pair to follow and review, easier to undo when wrong, and they match the team's continuous-delivery style.

**4. Test early.** Write the first test within five minutes, even a trivial one. It proves the setup works, pins down the function signature, and gives you something to turn green. The TDD kata trained this.

**5. Collaborate, don't perform.** Treat the interviewer as a teammate, not an examiner:

- **Use their hints.** If they ask "what happens if the list is empty?", that's a gift. Say "good catch", then handle and test it.
- **Ask for their view** on genuine choices: "Would you rather I handle validation here or in the caller?"
- **Driver / navigator.** If you're driving, keep the navigator in the loop before big moves. If you're navigating, think strategically ("Shall we add a test for the tie case?") rather than dictating keystrokes.
- **Disagree well.** "I see why you'd do X. My worry is Y. Could we try X and add a test for Y?" Then let the code decide.

**6. Manage the clock.** Glance at time. At the halfway mark, say where you are and what you'll prioritise. If you won't finish, finish *something* properly (one path working and tested) and describe the rest. That beats a half-written everything.

**7. Close the loop.** At the end, summarise: what works, what's tested, what you'd do next (edge cases, refactors, performance), and any assumptions you made. It's the pairing equivalent of a good PR description.

**About LLM tools in the session:** if they're allowed, use them the way you would at work, and say so: "I'll ask the assistant for the regex, then write tests to check it." Never paste output you haven't read. If they're not allowed, don't apologise for it. The timed exercises were practice for exactly this.

**Your edge:** you've run sites. Pairing is like running a pour with a new leading hand: agree the plan, call out what you're doing, check each step, and hand over cleanly. Saying that, briefly, makes the habits feel genuine rather than rehearsed.

## Worked example

The opening three minutes of a typical prompt, *"Write a function that tells us which lots on a project are ready to be closed"*, done well:

> **You:** "Let me check I've got it. Given a project's lots and their checklists, return the lots that can be closed. What makes a lot ready, every checklist signed off?"
> **Interviewer:** "Yes, and no open defects."
> **You:** "OK. What shape is the input, already-loaded objects, or do I query the database?"
> **Interviewer:** "Objects are fine."
> **You:** "And a lot with no checklists at all, ready or not? I'd guess not ready, since nothing's been inspected."
> **Interviewer:** "Good question. Not ready."
> **You:** "Great. I'll write three examples as tests: one ready lot, one with an unsigned checklist, one with no checklists. I'll start with a function that returns an empty list so the tests run, then make them pass one at a time. I'll leave open defects until the checklist part works. Sound OK?"

Notice: one clarifying question about the rule, one about the interface, one edge case that turned out to be a real product decision, a stated plan, a check-in, and the first test before any logic. That's what "clarify first, small steps, test early" sounds like in practice.

## Exercises

### Rehearse the opening [1]

For each prompt, write the clarifying questions you'd ask and the first test you'd write: (a) "Calculate the percentage complete for a checklist." (b) "Add pagination to the lots API." (c) "The sign-off button sometimes double-submits. Fix it."

#### Solution

(a) Does a re-inspection's latest result count? Do N/A items count as complete, and do they count in the denominator? What about an empty checklist (0%? N/A?)? Integer or one decimal place? First test: an empty checklist returns 0 (or whatever was agreed).

(b) Offset or cursor-based? (Cursor is stable when rows are inserted, so ask whether lots change often.) Default and maximum page size? What's the sort order, and is it stable (tie-break on id)? What does the response include: `nextCursor`, total count? First test: requesting page size 2 of 3 lots returns 2 lots and a cursor that fetches the third.

(c) Can I reproduce it: double click, a slow network, a retry? Is the duplicate a second request, or a second row from one request? Is there an idempotency key or a unique constraint server-side? First test: clicking twice quickly calls the submit function once (disable while pending). Then, more importantly, a server test that a repeated request doesn't create a second sign-off. Fixing only the button is the trap answer.

### Recover from being stuck [2]

You're 20 minutes into a 45-minute pairing exercise. Your merge function fails a test and you can't see why. Write what you'd *say* in the next 60 seconds.

#### Solution

> "OK, I'm stuck on this one. Let me step back rather than keep poking. The failing case is the tie: same timestamp, and I expected the server to win. Let me add a log of which branch runs." (adds `console.log`, runs) "Right, it's taking the local branch, so my comparison must be `>=` instead of `>`. Yes, line 9. Fixing it… green. That's a good reminder to test ties explicitly; I'll keep that test. We're at 21 minutes, so next I'd like to handle deletes. Does that sound like the right priority?"

The pattern: name it, narrow it down with a cheap experiment instead of rereading code silently, fix it, extract the lesson, then re-plan against the clock and check in.

### Give a summary at the end [1]

Write the 30-second wrap-up for the "lots ready to close" exercise, assuming the checklist rule is done and tested, open defects aren't implemented, and you noticed the input could be large.

#### Solution

> "Where we got to: `readyToClose` handles the checklist rule. A lot is ready when it has at least one checklist and every checklist is signed off, with tests for the ready case, an unsigned checklist and a lot with no checklists. Not done yet: the open-defects rule. I'd add it as another filter with its own test. One thing I noticed: if we were doing this for a big project it should really be one SQL query rather than loading every checklist into memory. It's the `bool_and` pattern, and I'd want an index on `lot_checklists.lot_id`. With more time I'd also confirm the 'no checklists means not ready' rule with the product owner, since we decided it on the fly."

## Say it aloud

"What makes someone good to pair with?"

#### Model answer

Mostly communication. A good pair makes their thinking visible. They clarify the goal and agree examples before typing, they narrate what they're about to do and why, and they say when they're unsure or stuck instead of going quiet. They work in small steps with tests early, so there's always something running and their partner can follow and catch mistakes. They're collaborative rather than territorial. When navigating they think a step ahead instead of dictating keystrokes, and when driving they check in before big moves. They disagree constructively, suggesting we try one approach and let a test settle it. And they manage time and close the loop with a quick summary of what's done and what's next. It's a lot like running a crew on site: agree the plan at the start, call out what you're doing, check each stage, and hand over cleanly. I've found that's what makes pairing productive rather than tiring.
