# What has been measured

What the Harness has been tested on, what each test found, and where it falls short. Each section links to its full
account.

A tutor built on a language model is usually left to judge four things for itself: which kind of help a turn calls
for, whether the learner already has the answer, which mistake produced a wrong answer, and whether its own draft
gives the answer away. The Harness has code decide those four, from what a teacher set and what the learner has done.
A model still writes every reply. The tests below ask whether a tutor built this way does what the teacher decided
more often than one in which a model makes those calls.

Four terms recur. A turn is one learner message and the tutor's reply to it. A guardrail is a second model that checks
each draft before the learner sees it. When no draft passes after two rewrites, the learner is sent a fixed fallback
line in place of a reply. An open-weight model is one whose weights are published, so a school can run it on its own
servers.

## At a glance

| Question | Result | Tested on |
| --- | --- | --- |
| [Does a tutor do what a teacher's policy says, turn after turn?](#holding-the-policy-a-teacher-set) | The required step on 83 to 89 turns in 100 with the Harness, and on 57 to 73 with a carefully written prompt and a guardrail | 60 test conversations and three reply models |
| [Does that hold when a school runs every model itself?](#when-a-school-runs-every-model-itself) | 74 and 75 turns in 100 with the Harness, and 48 and 45 with a prompt and an open-weight guardrail | 60 new conversations and two open-weight reply models |
| [Does a reply state the answer it has to keep back?](#holding-the-policy-a-teacher-set) | No reply the Harness delivered contained the answer's number or words. A judge's wider reading found the answer given away on 4 to 7 turns in 100, and on 15 and 10 with every model open-weight | The same two experiments |
| [Can code tell which mistake produced a wrong answer?](#naming-the-mistake-behind-a-wrong-answer) | Code names the right procedure on 70 answers in 100 and a wrong one on 10. The best of three models: 71 and 21 | 80 wrong answers kept for testing |
| [Does that hold on cases another team made?](#naming-the-mistake-behind-a-wrong-answer) | A small open-weight model predicts a learner's next answer on 33 pairs in 100, and on 60 with code first | 100 cross-template pairs from MalruleLib |
| [What holds before any model is involved?](#what-holds-with-no-model) | Eight guarantees, none failed on 4,439 checks | Every commit |
| [What does a model gain from the teacher's settings?](#what-the-settings-add-to-a-reply) | First drafts that pass review: 8 in 100 with a plain prompt, 68 with the settings, 80 with a brief for the turn | 50 learner messages and two models |

## Holding the policy a teacher set

A teacher's policy says what a tutor may do on each turn: ask a question before the learner has tried, give one hint
after one try, show a worked example after two, never give the answer, and say so when the learner gets it right. A
model that is told this in a prompt has to judge which of those moments it is in. In the Harness, code counts the
tries and decides the step, and the model words it.

Six tutors met the same 60 scripted conversations, four of them on all three reply models. A judge that wasn't told which tutor wrote a
reply said what each reply did, and a turn counts when the reply did the step the policy requires on that turn.

<p align="center">
  <img src="../../docs/images/policy-check.svg" width="100%" alt="Experiment 1. Share of turns on which each tutor did the step the teacher's policy requires, on 60 test conversations and three reply models. A carefully written prompt with a guardrail: 57 to 73 turns in 100. The Harness with the policy decided by code: 83 to 89 in 100. The prompt alone: 44 to 68. The Harness with the policy in words: 46 to 56.">
</p>

With the step decided by code, the tutor did it on 83 to 89 turns in 100. The strongest tutor built without the
Harness, a carefully written prompt with a guardrail that knows the policy and the answer, did it on 57 to 73. The
difference is 31 points on `gpt-oss-120b` (95% interval 25 to 38), 25 on `gemma-4-31b-it` (19 to 31) and 10 on
`gpt-6-luna` (3 to 16).

A model told the policy in words helps too early: it gives a hint where a question is due, and an example where a hint
is due. Code holds those early turns. A guardrail stops most of the over-helping by refusing, and sent the learner a
fallback line in place of a reply on 12 to 24 turns in 100, where the Harness did on 3 to 5.

No reply the Harness delivered contained the answer's number or words on a turn that had to keep it back, on 266 such
turns for each reply model. The prompt with a guardrail delivered it on 1 to 2 turns in 100. A judge that also counts a
reply leaving only copying to do found the answer given away on 4 to 7 turns in 100 with the Harness, and on 8 to 11
with the prompt and guardrail.

The Harness is weakest at the worked example: it gave one on 75 to 78 turns in 100 that required one, where the
guardrail's tutor gave one on 89 to 98.

[The policy check](../evals/policy-fidelity/README.md) is the full report, with every tutor and outcome.
[Its method](../evals/policy-fidelity/method.md) has the conversations, the judge and the criteria set beforehand.
[A teaching policy in code](policy.md) says what the policy layer does.

## When a school runs every model itself

In the first experiment a closed model reviewed the replies. A school that can't send learners' words to a company
runs open-weight models, whose weights are published, on its own servers. The second experiment put an open-weight
model in every place of the tutor: writing, reviewing, and reading the conversation. It used 60 new conversations.

<p align="center">
  <img src="../../docs/images/policy-check-2.svg" width="100%" alt="Experiment 2, with every model in the tutor open-weight, on 60 new conversations. Share of turns done as the policy requires on the two reply models: a carefully written prompt with a guardrail 48 and 45 in 100, the Harness with the policy in code 74 and 75. With a closed model as reviewer, on one reply model, the Harness did it on 81.">
</p>

The Harness did the required step on 74 and 75 turns in 100. A prompt with an open-weight guardrail did it on 48 and
45. That is 26 points more with `gpt-oss-120b` (95% interval 19 to 34) and 30 with `gemma-4-31b-it` (22 to 37). Again
no reply the Harness delivered contained the answer, on 217 turns for each reply model. By the judge's wider reading
it gave the answer away on 15 and 10 turns in 100, and the prompt with a guardrail on 22 and 19.

Two of the seven criteria set beforehand were missed, and they are where the Harness is weakest:

- The worked example was given on 71 and 50 turns in 100 that required one, against a criterion of 85. One reply model
  writes a hint where an example is due, which the Harness doesn't yet check for, and the other sometimes explains the
  learner's own problem, which the open-weight reviewer passes.
- The open-weight reviewer held the policy on 7 fewer turns in 100 than a closed one (74 against 81), by passing more
  replies that go further than the turn allows.

[Experiment 2 in the report](../evals/policy-fidelity/README.md#experiment-2-every-model-open-weight-on-new-conversations)

## Naming the mistake behind a wrong answer

A tutor that knows which mistake a learner made can speak to it. For a problem that is two numbers and an operation,
the Harness applies each of 66 faulty procedures to the problem and names the one that gives exactly what the learner
wrote. When none does, it names nothing. Three tests compare that with asking a model.

<p align="center">
  <img src="../../docs/images/diagnosis-checks.svg" width="100%" alt="Computing a mistake against asking a model. Naming the faulty procedure behind 80 wrong answers: code is right on 70 percent and wrong on 10; gpt-6-luna 71 and 21; gpt-oss-120b 63 and 34; gemma-4-31b-it 44 and 56. Predicting a learner's next answer on 100 MalruleLib pairs from another template: code is right on 45 percent and wrong on 7; gemma-4-31b-it 33 and 65; gpt-oss-120b 56 and 41; code first and then gemma-4-31b-it 60 and 39; code first and then gpt-oss-120b 63 and 34.">
</p>

On the 80 wrong answers kept for testing, code names the labelled procedure as often as the best of three models, and
a wrong one half as often. `gemma-4-31b-it`, the smaller open-weight model, never answered "none" and was wrong on 56 answers in 100.

[MalruleLib](https://github.com/sonkar-lab/malrulelib) is another team's library of 101 faulty procedures, with
generated wrong answers and a task of its own: from one wrong answer, predict the same learner's answer to a second
problem. Where code makes a prediction it is right about nine times in ten, and it makes one for half to two thirds of
the pairs it can read. With code first and a model asked only where code has no prediction, `gemma-4-31b-it` goes
from 33 right in 100 to 60 when the second problem comes from another problem template. For `gpt-oss-120b` the change,
from 56 to 63, is within what chance could give: with 100 pairs in a cell, a difference under about 14 points could
be chance.

[Computed diagnosis: three tests](../evals/diagnosis/README.md)

## What holds with no model

<p align="center">
  <img src="../../docs/images/scorecard.svg" width="100%" alt="The scorecard at a glance. Eight guarantees hold on 4,439 checks, among them that a learner's words never enter what the model is told, that an answer key reaches only the reviewer, and that a reply stating the key is stopped by code. On the test half of each set, the rules read 83 percent of 150 English messages as labelled, review finds 87 percent of 53 planted problems with no false alarm, code names the procedure behind 70 percent of 80 wrong answers, and rules decide the step a turn requires on 90 percent of 345 turns.">
</p>

Some of what the Harness promises doesn't depend on a model, and can be checked exactly. The scorecard runs on every
commit with no model and no key. It holds eight guarantees on 4,439 checks, such as that a learner's words are never
copied into what the model is told, and that an answer key reaches the reviewer and never the model that writes the
reply. It also scores five things code does, on cases set aside for testing: the rules read 83% of 150 learner
messages as labelled, `review` finds 87% of 53 planted problems with no false alarm, code names the procedure behind
70% of 80 wrong answers, decides the step a turn requires on 90% of 345 turns, and sees a right answer on 18 of 20
turns.

[The scorecard](scorecard.md)

## What the settings add to a reply

A smaller, earlier test asked what a reply gains when the model is given the teacher's settings before it writes, and
whether a brief for the turn does better than the settings whole. A brief holds only what this moment needs: the goal,
how far the AI may go, and what fits what the learner just did.

| Condition | What the reply model got |
| --- | --- |
| Plain | A one-line tutor prompt |
| Whole settings | That, and everything a teacher set for the activity |
| Brief, by rules | That, and what this moment needs, chosen by rules with no extra model call |
| Brief, by a small model | The same, chosen by a small model with one extra call |

The cases are 30 grade 5 fractions messages, most of them written by an AI model that saw neither the settings nor the
conditions, and 20 mistaken solutions from [MathDial](https://github.com/eth-nlped/mathdial)'s test set. Two models
wrote replies. The main one is `gpt-oss-120b`, which is open-weight.

Each reply was measured twice. For first-draft pass, VETTING reviewed the draft against the same settings and answer
key in every condition. For a good reply, a strong model that saw each reply alone, and never its condition, had to
say yes to all of: it doesn't give the answer away, it responds to what this learner did, it gives one clear next
step, and its mathematics is right.

| `gpt-oss-120b` | First-draft pass | Good reply | Withholds the answer | Tokens a turn |
| --- | ---: | ---: | ---: | ---: |
| Plain | 8% | 4% | 14% | 519 |
| Whole settings | 68% | 50% | 72% | 880 |
| Brief, by rules | 80% | 62% | 92% | 652 |
| Brief, by a small model | 80% | 65% | 94% | 1,811 |

The second model went the same way: 8%, 74%, 86% and 82% on first-draft pass.

- Most of the effect comes from telling the model what the teacher decided. A plain prompt never hears the rules its
  reply is reviewed against.
- A brief adds to that on keeping the answer back. Taken case by case, it kept the answer back on 18 to 20 more
  replies in 100 than the whole settings (95% intervals 8 to 33). On first-draft pass it adds 10 points, with an
  interval of -2 to 22 that includes zero. Differences are over the cases rated in both conditions, so they can be a
  point or two from the columns above. The brief chosen by rules uses about a quarter fewer tokens than the whole
  settings.
- Reading the moment works: a small model read 29 of 30 moments as labelled, and rules 23. Matching a learner's words
  to a misconception doesn't: it found the labelled one on 4 of 19 turns, so the Harness
  [computes it](#naming-the-mistake-behind-a-wrong-answer) for arithmetic.

Fifty cases can show only a large difference, and all of them are English mathematics.

## How the tests were made

- The policy check's conversations and the scorecard's cases were written by an AI model given only a description of
  each task, without sight of the Harness. MalruleLib's wrong answers are generated by that library's own procedures,
  and 20 cases of the settings test come from MathDial. No case comes from a learner using VIABLE.
- The scorecard's sets and the policy check's first set of conversations were each split in two before anything was
  read. The development half is the one that was read while the code was changed. The test half was run once, and its
  numbers are the ones on this page. The second set of conversations was used once, for testing only.
- For the policy check, the criteria for success were written before the test replies were made, and the misses are
  reported with the rest.
- The judges are models. They aren't told which tutor wrote a reply, a second model judges a sample again, and their
  agreement is reported.

These are measurements of replies, and of decisions made by code, on scripted learners. No person has checked the
labels yet, and no learner took part. Whether a policy helps learners is a question for a study with learners. Such a
study needs a tutor that holds its policy, so that what it tests is the policy.

## Print the numbers yourself

Every reply, judgment and model answer behind these tests is kept in the repository, so the tables print again with
no model and no key:

```sh
git clone https://github.com/VIABLE-Learning-Lab/viable && cd viable/harness
node bin/viable-harness.mjs scorecard
node evals/policy-fidelity/run.mjs report --split held_out
node evals/policy-fidelity/run.mjs report --set evals/policy-fidelity/conversations-2.json --split held_out --out evals/policy-fidelity/runs-2
node evals/diagnosis/ask-a-model.mjs --models gpt-6-luna,gpt-oss-120b,gemma-4-31b-it --kept evals/diagnosis/runs/asked.jsonl
```

The policy check's report prints each tutor under a letter and lists them in its first line. Scoring MalruleLib's
task also needs a clone of MalruleLib, which its license keeps out of this repository
([how](../evals/diagnosis/README.md#on-wrong-answers-from-another-library)). The replies of the earliest test, on what
the settings add, were not kept, so its table is the one here that can't be printed again.
