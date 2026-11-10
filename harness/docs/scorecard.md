# The scorecard

What the Harness guarantees, checked on every case, and how well its rules read, measured on cases they were not written
from. It calls no model and reaches no network, so anyone gets the same numbers in under a second:

```sh
npx github:VIABLE-Learning-Lab/viable scorecard
```

<p align="center">
  <img src="../../docs/images/scorecard.svg" width="100%" alt="The scorecard at a glance. Six guarantees hold on 4,122 checks, among them that a learner's words never enter what the model is told and that an answer key reaches only the reviewer. On held-out cases, the rules read 84 percent of 150 English messages as labelled, from 51 percent before, and review finds 87 percent of 53 planted problems, from 79 percent, with no false alarm.">
</p>

The tables below are what that prints. A test fails if this page, the figure and a run ever differ.

<!-- scorecard:begin -->
| Guarantee | Checks | Failed |
| --- | ---: | ---: |
| What a learner writes changes what is chosen for a turn, and is never copied into what the model is told. | 1,800 | 0 |
| How far the teacher lets the AI go is in every turn's instructions, whatever the learner wrote. | 1,800 | 0 |
| A record of a turn holds neither the learner's words nor the reply, unless it was asked to. | 360 | 0 |
| Nothing that names a learner goes on to the model's endpoint through the gateway: not its own header, not the fields a request names an end user in. | 60 | 0 |
| A tool the teacher switched off is taken out of the request, not left in with a note asking the model not to use it. | 72 | 0 |
| An answer key goes to the model that reviews a reply and never to the one that writes or rewrites it. | 30 | 0 |

| Reading the moment, by rules | Messages | Read as labelled |
| --- | ---: | --- |
| Held out, English | 150 | 84% (126 of 150; 95% interval 77.3 to 89) |
| Held out, Spanish | 15 | 86.7% (13 of 15; 95% interval 62.1 to 96.3) |
| Held out, Chinese | 15 | 86.7% (13 of 15; 95% interval 62.1 to 96.3) |
| Development, English | 150 | 94.7% (142 of 150; 95% interval 89.8 to 97.3) |
| Development, Spanish | 15 | 80% (12 of 15; 95% interval 54.8 to 93) |
| Development, Chinese | 15 | 86.7% (13 of 15; 95% interval 62.1 to 96.3) |

| `review`, on projects with problems planted | Projects | Planted problems found | Pointed at, and not planted |
| --- | ---: | --- | ---: |
| Held out | 30 (10 with nothing planted) | 86.8% (46 of 53; 95% interval 75.2 to 93.5) | 0 |
| Development | 30 (10 with nothing planted) | 100% (59 of 59; 95% interval 93.9 to 100) | 0 |
<!-- scorecard:end -->

## How to read it

**Guarantees** are claims this repository makes in plain words, each turned into a check that has to hold on every case: a
single failure fails the command. They are run on the 360 messages below, each with a line added that tries to pass for an
instruction, at each of the five levels of help. They cover what the code does. They say nothing of what a model then does
with its instructions: that is what [VETTING](../skills/checking-replies-with-vetting/SKILL.md) and
[agent tests](agent-tests.md) are for.

**Reading the moment** is the first thing a turn does without a model: is this an answer, a request for the answer, being
stuck, another try after two, or something else? The rules are scored on 360 messages (300 in English, 30 in Spanish, 30 in
Chinese) across mathematics, science, reading, writing, history and programming, for grades 3 to 12, each with its
conversation. A small picker model (`pickerModel`) reads the moment instead of the rules where one is set, and isn't scored
here, since scoring it calls a model.

**`review`** is the check for someone building a tool for learners ([for builders](for-builders.md)). It is scored on 60
small projects in about thirty stacks: 40 with one to four of its sixteen problems planted, 112 in all, and 20 that do the
same things properly, several with look-alikes such as a public Firebase key.

## How the cases were made, so the numbers mean something

- **Written apart from the code.** Both sets were written by an AI model given only definitions: the five moments in the
  words the picker is told, and the sixteen problems in a sentence each. It was told not to open this repository. Every
  message and project is invented, with no learner's data and no real key.
- **Split before anything was read.** Odd-numbered cases are held out and even-numbered are for development, fixed before
  any result was looked at. The rules were changed from the development half's mistakes only. The held-out half was then
  run once, and is what to quote.
- **What changed.** Before this set existed, the rules read 50.7% of the held-out English messages as labelled (76 of 150),
  and `review` found 79.2% of what was planted in the held-out projects (42 of 53). The rules had been written from
  fractions, where an answer has figures in it: "gravity", "he loves it" and a line of code were read as nothing. They now
  count whatever a learner says back to a tutor who left them something to do, unless it is a question, a plea, being stuck
  or small talk. On the held-out English messages, 30 of each moment:

  | Moment | Read as labelled, before | Now |
  | --- | ---: | ---: |
  | An answer or some working | 11 | 29 |
  | Asks for the answer | 14 | 23 |
  | Stuck | 23 | 28 |
  | Another try after two | 3 | 29 |
  | Something else | 25 | 17 |

## What it doesn't show

- **Nobody has checked the labels.** A model wrote each message and its label together. About one in six messages was
  written to be arguable, and a teacher might label some differently. Agreement between people comes before any claim
  that leans on these labels.
- **Written messages aren't a classroom's.** Real learners write things nobody thought to invent. The held-out number is
  the best this page has, and it is still for invented messages.
- **The price of reading more answers.** Of 30 held-out English messages that were small talk or a question about the
  task, 9 are now read as answers, because "we did this in class yesterday" looks like one after a tutor's question. Such
  a turn gets the move for an answer, and the teacher's limit as always. Before, 19 of 30 real answers got no move at all.
- **Spanish and Chinese rest on 15 held-out messages each,** so their intervals are wide. A multilingual class should
  set a picker model.
- **`review` reads patterns in text.** It misses about one planted problem in eight on projects it hasn't seen, and it
  can't see whether a budget works or what a teacher would notice. A clean result isn't a pass.
- **None of this is about learning,** or about how good a reply is. What a first check of replies showed, on models, is
  in [evidence.md](evidence.md), and the comparison registered before it runs is the platform's to run.

## The files

[`scorecard/learner-moments.json`](../scorecard/learner-moments.json) and
[`scorecard/classroom-trips.json`](../scorecard/classroom-trips.json), described in
[`scorecard/README.md`](../scorecard/README.md), with the runner in [`src/scorecard.js`](../src/scorecard.js). Score your own
reader of moments on the same cases: each has `message`, `history`, `moment` and `split`.
