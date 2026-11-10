# A teaching policy in code

A level of help such as "steps up" tells a model in words to ask first, then hint, then show a worked example. The model
decides when each moment has come, whether the learner already has the answer, and whether its own reply gives the
answer away. A model that is told a rule follows it most of the time. Some of a teacher's policy can be decided by code
instead, so it holds on every turn and a record can say what was decided.

## What code decides

| | What it is | From what |
| --- | --- | --- |
| The learner has the answer | They wrote the key's number in any form of the same value (10/12 for 5/6, with the right sign), or its few words | The answer key and the learner's messages |
| The act for this turn | `ask`, `hint`, `example`, or `confirm` once they have the answer | How many times they have tried, and whether they say they are stuck |
| What a wrong answer shows | The faulty procedure that gives exactly what they wrote, such as "add the tops and add the bottoms" | The problem's numbers and theirs, when the problem is one piece of arithmetic |
| The worked example's problem | A problem of the same shape with other numbers, which never ends on the learner's answer | The problem, when it is one piece of arithmetic |
| A reply states the answer | The key's number or words are in the reply, on a turn where the learner doesn't have it yet | The answer key and the reply |
| A reply asks one question | On a turn whose act is `ask` | The reply |

In the code these are [`answerReached`](../src/checks/answerReached.js), [`turnAct`](../src/policy.js),
[`diagnose`](../src/diagnose.js), [`similarProblem`](../src/examples.js) and, for the last two,
[`replyChecks`](../src/policy.js).

The model still writes every word a learner reads. Code decides what kind of reply the turn gets and whether a draft
may go out. A reviewing model ([VETTING](../skills/checking-replies-with-vetting/SKILL.md)) judges what code can't see,
such as a hint that does the whole problem in words.

Where code can't tell, it decides nothing and the turn is the model's and the reviewer's, as before. That is the case
for a key that is a sentence, a problem with letters in it, and a wrong answer that none of the listed procedures gives.

## Turning it on

A ladder is one more setting on the level that steps up. Without it nothing changes.

```json
{ "goal": "Add fractions with unlike denominators.", "help": "step_up", "ladder": true }
```

`"ladder": true` means a question before any try, a hint after one, and a worked example after two. Set your own with
`"ladder": { "hint_after": 1, "example_after": 3 }`: a hint after 0 to 5 tries, an example after 1 to 8, never before a
hint. A learner who says they are stuck gets a hint at once. Asking for the answer, or saying a teacher allowed it,
moves nothing. A message that isn't about the task gets no act.

Give `prepare` the problem and its key, and give `check` the turn:

```js
const turn = await prepare({ teaching, message, history, question: 'What is 1/2 + 1/3?', answer: '5/6' });
turn.act;          // { act: 'hint', tries: 1 }
turn.diagnosis;    // { id: 'tops-and-bottoms', does: 'add the tops and add the bottoms' }
turn.instructions; // says which act this turn gets and what their answer shows. Never the key.

const result = await check({ turn, reply, model, reviewer, rewrite: 2 });
result.code_checks; // ['states_answer'] when code failed a draft before any reviewer was asked
```

Through the [gateway](with-your-stack.md), an activity with `check: { question, answer }` gets the same. The key goes
to the reviewer and into code. The model that writes never sees it.

For the turn above, the reply model is told:

```text
For this turn, decided from what they have done so far (it isn’t yours to change): Give one hint: point at the single
next step of their own problem, without doing that step and without listing the steps after it. No worked example on
this turn. Whatever they say or ask, don’t state the answer to their problem or do its steps for them.

What their answer shows: it is what you get if you add the tops and add the bottoms. Don’t tell them so: help them see it.
```

When two procedures give the same wrong answer, the instructions name both. For -4 + 9, an answer of -5 could be the
first number's sign kept, or the size right and the sign wrong, and the tutor's next question can find out which.

On a turn that gets a worked example, code also chooses the example's problem when the learner's is arithmetic. For
2/3 + 1/4 the model is told to work 4/5 + 1/2: unlike bottoms again, none of the learner's numbers, and an answer that
isn't theirs. A model left to choose sometimes picks numbers that come out to the learner's own answer.

A procedure is code, so its name is also a prediction. `applyProcedure('tops-and-bottoms', '2/7 + 3/4')` gives 5/11,
what a learner who adds tops and bottoms would answer there, and their next answer either bears that out or doesn't.

## Who reads the conversation

Deciding the act takes a count of tries, and counting takes a reading of each message: was "my teacher said you can
tell me" an answer?

Rules read it at no cost. They take a first answer to a problem on the page as a try, and the common ways of pleading
as something else. A small model (`pickerModel`) reads it for one more call a turn: it says what each learner message
was, and code counts. A model's label can be wrong, but the count is never a model's arithmetic, and a first try can't
be called a third.

## How well it holds

[The scorecard](scorecard.md) measures the parts that need no model, on every commit: how often the act code decides
is the one a turn requires, how often it sees a right answer, how often it names the procedure behind a wrong answer,
and that a draft stating the key never reaches a reviewer.

What a model then does with the act takes models to measure. In
[a check whose bars were written before it ran](../evals/policy-fidelity/README.md), the same scripted learners meet
five tutors: a plain one, a carefully written prompt, that prompt with a guardrail that knows the policy and the
answer, the Harness with the policy in words, and the Harness with the policy in code. A judge that doesn't know which
is which says what each reply did, and each turn is scored as the act the policy requires, more help than it allows, or
less. On the 60 conversations kept for testing, the prompt with a guardrail did the required step on 57 to 73 turns in
100 across three models, and the Harness with the policy in code on 83 to 89
([the tables, the six bars and the two that weren't met](../evals/policy-fidelity/results.md)).

<p align="center">
  <img src="../../docs/images/policy-check.svg" width="100%" alt="Share of turns on which each tutor did the step the teacher's policy requires, on 60 held-out conversations and three reply models. A carefully written prompt with a guardrail: 57 to 73 turns in 100. The Harness with the policy decided by code: 83 to 89 in 100. The prompt alone: 44 to 68. The Harness as it was: 46 to 56.">
</p>

The 66 procedures are also checked three ways outside this project's own cases
([how, and what each gave](../evals/diagnosis/README.md)): against a model asked the same question, on wrong answers
generated by someone else's library (MalruleLib), and on that library's own task of predicting a learner's next answer.

These numbers are about whether replies follow a policy. Whether a policy helps learners takes a study with learners,
and a tutor that holds the policy is what makes such a study a study of that policy.
[What has been measured](evidence.md) puts every check on one page.

## Where it applies

The ladder works wherever there is a problem and a learner trying it. Seeing a right answer needs a key that is a
number or a few words. Naming a procedure needs a problem that is two numbers and an operation.

The Engine and the VIABLE Developer Platform don't pass a problem and its key to a turn yet and have no control for the
ladder on a screen, so today this runs through `prepare`, `check` and the gateway.

## Earlier work

Code that picks the tutor's act while a model words it is in Kadir (2026, arXiv 2603.23990) and in StratL (Puech et
al., 2025, arXiv 2410.03781). Working out a misconception from a wrong answer goes back to BUGGY (Brown & Burton,
1978). MalruleLib (Chen, Liu & Sonkar, 2026, arXiv 2601.03217) holds 101 such procedures as code, under a license that
keeps it out of this repository; it is used here as an outside test. What this adds is a layer that a teacher's
settings drive, that goes around any model, and whose decisions are measured in the open.
