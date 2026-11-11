# The scorecard

What the Harness guarantees, checked on every case, and how well its rules read, measured on cases they were not written
from. It calls no model and reaches no network, so anyone gets the same numbers in under a second:

```sh
npx @viable-lab/harness scorecard
```

<p align="center">
  <img src="../../docs/images/scorecard.svg" width="100%" alt="The scorecard at a glance. Eight guarantees hold on 4,439 checks, among them that a learner's words never enter what the model is told, that an answer key reaches only the reviewer, and that a reply stating the key is stopped by code. On the test half of each set, the rules read 83 percent of 150 English messages as labelled, review finds 87 percent of 53 planted problems with no false alarm, code names the procedure behind 70 percent of 80 wrong answers, and rules decide the step a turn requires on 90 percent of 345 turns.">
</p>

Guarantees are things the code does every time, such as never copying a learner's words into what the model is told.
The measures say how often code reads a message, a wrong answer or a conversation the way its label says, and how
much `review`, a check for people building a tool for learners, finds of what was planted.

The tables below are what the command prints. A test fails if this page, the figure and a run ever differ.

<!-- scorecard:begin -->
| Guarantee | Checks | Failed |
| --- | ---: | ---: |
| What a learner writes changes what is chosen for a turn, and is never copied into what the model is told. | 1,800 | 0 |
| How far the teacher lets the AI go is in every turn's instructions, whatever the learner wrote. | 1,800 | 0 |
| A record of a turn holds neither the learner's words nor the reply, unless it was asked to. | 360 | 0 |
| Nothing that names a learner goes on to the model's endpoint through the gateway: not its own header, not the fields a request names an end user in. | 60 | 0 |
| A tool the teacher switched off is taken out of the request, not left in with a note asking the model not to use it. | 72 | 0 |
| An answer key goes to the model that reviews a reply and never to the one that writes or rewrites it. | 30 | 0 |
| A reply that states the answer key’s number is failed by code before any reviewer is asked, and what the reply model is then told never holds the answer. (Where the question itself holds that number, the reviewer decides.) | 158 | 0 |
| A worked example that code chooses the problem for has none of the learner’s numbers in it and never their answer, so working it through can’t give theirs away. | 159 | 0 |

| Reading the moment, by rules | Messages | Read as labelled |
| --- | ---: | --- |
| Test half, English | 150 | 83.3% (125 of 150; 95% interval 76.6 to 88.4) |
| Test half, Spanish | 15 | 86.7% (13 of 15; 95% interval 62.1 to 96.3) |
| Test half, Chinese | 15 | 86.7% (13 of 15; 95% interval 62.1 to 96.3) |
| Development half, English | 150 | 94.7% (142 of 150; 95% interval 89.8 to 97.3) |
| Development half, Spanish | 15 | 80% (12 of 15; 95% interval 54.8 to 93) |
| Development half, Chinese | 15 | 86.7% (13 of 15; 95% interval 62.1 to 96.3) |

| `review`, on projects with problems planted | Projects | Planted problems found | Pointed at, and not planted |
| --- | ---: | --- | ---: |
| Test half | 30 (10 with nothing planted) | 86.8% (46 of 53; 95% interval 75.2 to 93.5) | 0 |
| Development half | 30 (10 with nothing planted) | 100% (59 of 59; 95% interval 93.9 to 100) | 0 |

| The procedure behind a wrong answer, by code | Wrong answers | Named as labelled | Named as something else | Slips named |
| --- | ---: | --- | --- | ---: |
| Test half | 80 of 80 read as arithmetic | 70% (56 of 80; 95% interval 59.2 to 78.9) | 10% (8 of 80; 95% interval 5.2 to 18.5) | 0 of 6 |
| Development half | 80 of 80 read as arithmetic | 77.5% (62 of 80; 95% interval 67.2 to 85.3) | 5% (4 of 80; 95% interval 2 to 12.2) | 0 of 14 |

| A policy in code, by rules | Conversations | The step decided is the one the turn requires | A right answer is seen | Seen where the learner gave none |
| --- | ---: | --- | --- | ---: |
| Test half | 60 | 89.9% (310 of 345; 95% interval 86.2 to 92.6) | 90% (18 of 20; 95% interval 69.9 to 97.2) | 0 of 301 turns |
| Development half | 60 | 94.2% (325 of 345; 95% interval 91.2 to 96.2) | 100% (18 of 18; 95% interval 82.4 to 100) | 0 of 274 turns |
<!-- scorecard:end -->

## How to read it

### Guarantees

Guarantees are claims this repository makes in plain words, each turned into a check that has to hold on every case: a
single failure fails the command. They are run on the 360 messages below, each with a line added that tries to pass for an
instruction, at each of the five levels of help. They cover what the code does. They say nothing of what a model then does
with its instructions: that is what [VETTING](../skills/checking-replies-with-vetting/SKILL.md) and
[agent tests](agent-tests.md) are for.

### Reading the moment

Reading the moment is the first thing a turn does without a model: is this an answer, a request for the answer, being
stuck, another try after two, or something else? The rules are scored on 360 messages (300 in English, 30 in Spanish, 30 in
Chinese) across mathematics, science, reading, writing, history and programming, for grades 3 to 12, each with its
conversation. A small picker model (`pickerModel`) reads the moment instead of the rules where one is set, and isn't scored
here, since scoring it calls a model.

### The procedure behind a wrong answer

The procedure behind a wrong answer is worked out by code when the problem is one piece of arithmetic. Each of 66
faulty procedures a teacher of the topic knows is applied to the numbers, and one that gives exactly what the learner
wrote is named ([`src/diagnose.js`](../src/diagnose.js)). It is scored on 160 wrong answers, 20 of them slips that no
procedure explains. "Named as labelled" compares the first procedure named with the one a second reader matched the
author's words to. "Named as something else" also counts any name given to a slip, or to a procedure the list doesn't
hold. One wrong answer often fits two procedures (-5 for -4 + 9 is the first number's sign kept, or the size right and
the sign wrong), and then a turn's instructions give both. The same code is run on
[another library's wrong answers](../evals/diagnosis/README.md).

### A policy in code

A policy in code is a level of help whose steps code decides: a question first, a hint after one try, a worked
example after two ([policy.md](policy.md)). Code has to read the conversation to do that. On 120 scripted
conversations, with the tutor's turns replaced by one neutral line, it is scored on whether the step it decides is the
one each turn requires, and on whether it sees that a learner has written the answer. What a model then does with the
step takes models to measure, and [has its own page](../evals/policy-fidelity/README.md).

### `review`

`review` is the check for someone building a tool for learners ([for builders](for-builders.md)). It is scored on 60
small projects in about thirty stacks: 40 with one to four of its sixteen problems planted, 112 in all, and 20 that do the
same things properly, several with look-alikes such as a public Firebase key.

## How the cases were made

- Written apart from the code. Each set was written by an AI model given only definitions: the five moments in the
  words the picker is told, the sixteen problems in a sentence each, the kinds of wrong answer, and the kinds of turn. It was told not to open this repository. Every
  message and project is invented, with no learner's data and no real key.
- Split before anything was read. Each set is in two halves, fixed by case number before any result was looked at.
  The development half is the one that was read while the code was changed. The test half was then run once, and is
  what to quote.

## What to keep in mind when using the numbers

The labels are a model's. A model wrote each message, wrong answer and conversation together with its label, about one
message in six was written to be arguable, and no teacher has gone through them. The test half is the number to
quote, and it is a number about invented cases.

The rules count whatever a learner says back to a tutor who left them something to do as an answer, unless it is a
question, a plea, being stuck or small talk. On the test half's English messages, 30 of each moment:

| Moment | Read as labelled |
| --- | ---: |
| An answer or some working | 29 |
| Asks for the answer | 23 |
| Stuck | 28 |
| Another try after two | 29 |
| Something else | 16 |

So the rules lean toward reading a message as an answer. Of the 30 messages that were small talk or a question about
the task, 9 are read as answers, because "we did this in class yesterday" looks like one after a tutor's question.
Such a turn gets the move for an answer, and the teacher's limit as always.

Spanish and Chinese rest on 15 test messages each, so their intervals are wide. A multilingual class should set a
picker model.

`review` reads patterns in text. It misses about one planted problem in eight on projects it hasn't seen, and it can't
see whether a budget works or what a teacher would notice, so a clean result still needs a person's look.

A wrong answer is named only when a listed procedure gives it exactly. Three in ten wrong answers in the test half get no name
or another one, and the turn then goes on as it would have without a name.

How replies come out on models is measured separately: what a reply gains from the teacher's settings in
[what has been measured](evidence.md#what-the-settings-add-to-a-reply), and whether a tutor holds a teacher's policy in
[the policy check](../evals/policy-fidelity/README.md).

## The files

[`learner-moments.json`](../scorecard/learner-moments.json), [`classroom-trips.json`](../scorecard/classroom-trips.json),
[`wrong-answers.json`](../scorecard/wrong-answers.json) and
[`tutoring-conversations.json`](../scorecard/tutoring-conversations.json), described in
[`scorecard/README.md`](../scorecard/README.md), with the runner in [`src/scorecard.js`](../src/scorecard.js). Score your own
reader of moments on the same cases: each has `message`, `history`, `moment` and `split`.
