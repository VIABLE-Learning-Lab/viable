# What has been measured

Every check of the Harness run so far, with its numbers on this page and its full account one link away.

The Harness has code decide four things a model is usually left to judge: which step a turn gets, whether the learner
already has the answer, which mistake gives a wrong answer, and whether a draft states the answer key. A model still
writes every reply. The checks below ask whether a tutor built this way does what a teacher decided more often than one
where a model makes those calls.

## At a glance

| Question | Run on | Result |
| --- | --- | --- |
| [Does a tutor do what a teacher's policy says, turn after turn?](#a-teaching-policy-turn-after-turn) | Six tutors and three reply models, on 60 conversations kept for testing: 5,040 tutor turns and 19,034 model calls | The required step on 83 to 89 turns in 100 with the policy decided by code, and on 57 to 73 with a carefully written prompt and a guardrail |
| [Does that hold when a school runs every model itself?](#with-every-model-open-weight) | Four tutors and two open-weight reply models, on 60 conversations written after the first run: 2,520 tutor turns and 11,644 model calls | The required step on 74 and 75 turns in 100 with the Harness, and on 48 and 45 with a prompt and a guardrail run by the same open-weight model |
| [Can code work out the mistake behind a wrong answer?](#a-mistake-worked-out-by-code) | Code and three models, on 80 wrong answers kept for testing | Code names the right procedure on 70 in 100 and a wrong one on 10. The best model: 71 and 21 |
| [Does that hold on cases another team made?](#a-mistake-worked-out-by-code) | Code and two open-weight models, on MalruleLib: 547 problems and 779 pairs for code, 200 of the pairs for the models | A small open-weight model predicts a learner's next answer on 33 pairs in 100, and on 60 with code first |
| [What holds with no model at all?](#what-holds-with-no-model) | 4,439 checks and five measures, on every commit | Eight guarantees, none failed |
| [Is the part before the reply worth building?](#the-first-check) | Four conditions and two models, on 50 learner messages | First-draft pass from 8% with a plain prompt to 80% with a brief for the turn |

## Print these numbers yourself

Every reply, judgment and model answer behind the checks is kept in the repository, so their tables print again with
no model and no key:

```sh
git clone https://github.com/VIABLE-Learning-Lab/viable && cd viable/harness
node bin/viable-harness.mjs scorecard
node evals/policy-fidelity/run.mjs report --split held_out
node evals/policy-fidelity/run.mjs report --set evals/policy-fidelity/conversations-2.json --split held_out --out evals/policy-fidelity/runs-2
node evals/diagnosis/ask-a-model.mjs --models gpt-6-luna,gpt-oss-120b,gemma-4-31b-it --kept evals/diagnosis/runs/asked.jsonl
```

The report names each tutor by a letter and lists them in its first line: C is the prompt with a guardrail, and D the
Harness with the policy in code. Scoring MalruleLib's task also needs a clone of MalruleLib, which its license keeps
out of this repository ([the three checks](../evals/diagnosis/README.md) say how). The first check's replies were not
kept, so its table is the one on this page that can't be printed again.

## A teaching policy, turn after turn

A teacher's policy says what a tutor may do on each turn: ask a question before the learner has tried, give one hint
after one try, show a worked example after two, never give the answer, and say so when the learner gets it right. The
same 60 scripted conversations were put to six tutors on three reply models. A judge that isn't told which tutor wrote a
reply said what each reply did. A turn counts when the reply did the step the policy requires on that turn, and
otherwise as more help than the policy allows or less than it requires.

<p align="center">
  <img src="../../docs/images/policy-check.svg" width="100%" alt="Share of turns on which each tutor did the step the teacher's policy requires, on 60 held-out conversations and three reply models. A carefully written prompt with a guardrail: 57 to 73 turns in 100. The Harness with the policy decided by code: 83 to 89 in 100. The prompt alone: 44 to 68. The Harness as it was: 46 to 56.">
</p>

With the step decided by code, the tutor did it on 83 to 89 turns in 100. The strongest tutor built without the
Harness, a carefully written prompt with a guardrail that knows the policy and the answer, did it on 57 to 73. The
difference is 31 points on `gpt-oss-120b` (95% interval 25 to 38), 25 on `gemma-4-31b-it` (19 to 31) and 10 on
`gpt-6-luna` (3 to 16).

<p align="center">
  <img src="../../docs/images/policy-check-steps.svg" width="100%" alt="The share of turns done as required by the step the policy called for, the prompt with a guardrail against the Harness with the policy in code, on three reply models. A question: 38 to 94, 44 to 82 and 52 to 89 in 100. A hint: 52 to 90, 55 to 93 and 73 to 81. A worked example: 95 to 77, 89 to 78 and 98 to 75, where the guardrail does better. Saying the answer is right: 70 to 95, 100 to 90 and 90 to 90.">
</p>

A model told the policy in words helps too early: it gives a hint where a question is due, and an example where a hint
is due. Code holds the early turns. The worked example is the Harness's weakest step, at 75 to 78 turns in 100 against
the guardrail's 89 to 98.

Six bars were written down before any run. Four were met. On the fifth, two judges agreed on what a reply did (κ 0.76)
and less on whether a reply gives the answer away (κ 0.51, under the bar of 0.6). On the sixth, the code check failed
4.0% of the replies the judge passed, against a bar of 3%.

| The run | |
| --- | --- |
| Reply models | `gpt-oss-120b` and `gemma-4-31b-it` (open weights), `gpt-6-luna` |
| Reviewer and guardrail | `gpt-6-luna` |
| Judges | `gemini-2.5-flash` on every reply, `gpt-6-sol` on 150 of them |
| Size | 840 conversations run, 5,040 tutor turns, 4,973 judgments, 19,034 model calls |

[The results in full](../evals/policy-fidelity/results.md) ·
[The design and the bars, written before each run](../evals/policy-fidelity/README.md) ·
[What the policy layer does](policy.md)

### With every model open-weight

The first run's reviewer was a closed model, so it didn't show that a school could run every model itself. A second
run put an open-weight model in every place of the tutor (writing, reviewing, reading the conversation), on 60
conversations written after the first run. It also compared the Harness as the first run measured it with the Harness
after three changes to how it handles a worked example.

<p align="center">
  <img src="../../docs/images/policy-check-2.svg" width="100%" alt="The second run of the policy check, with every model in the tutor open-weight, on 60 new conversations. Share of turns done as the policy requires on the two reply models: a carefully written prompt with a guardrail 45 and 48 in 100, the Harness as the first run measured it 72 and 73, the Harness now 74 and 75.">
</p>

The Harness did the required step on 74 and 75 turns in 100, against 48 and 45 for the prompt with a guardrail: 26
points more with `gpt-oss-120b` (95% interval 19 to 34) and 30 with `gemma-4-31b-it` (22 to 37). Five of seven bars
were met. The two missed say where it is weakest:

- The worked example was given on 71 and 50 turns in 100 that required one, against a bar of 85. The changes ended the
  first run's fault, a reviewer failing sound examples. What is left is a reply model that writes a hint where an
  example is due, which nothing checks for, and one that explains the learner's own problem, which the open-weight
  reviewer lets through.
- The open-weight reviewer cost 7 of 100 turns against the closed one (74 against 81), by passing more replies that go
  further than the turn allows.

[The second run in full](../evals/policy-fidelity/results-2.md)

## A mistake worked out by code

For a problem that is two numbers and an operation, the Harness applies each of 66 faulty procedures to the problem and
names the one that gives exactly what the learner wrote. When none does, it names nothing. Three checks compare that
with asking a model.

<p align="center">
  <img src="../../docs/images/diagnosis-checks.svg" width="100%" alt="Computing a mistake against asking a model. Naming the faulty procedure behind 80 wrong answers: code is right on 70 percent and wrong on 10; gpt-6-luna 71 and 21; gpt-oss-120b 63 and 34; gemma-4-31b-it 44 and 56. Predicting a learner's next answer on 100 MalruleLib pairs from another template: code is right on 45 percent and wrong on 7; gemma-4-31b-it 33 and 65; gpt-oss-120b 56 and 41; code first and then gemma-4-31b-it 60 and 39; code first and then gpt-oss-120b 63 and 34.">
</p>

On the 80 wrong answers kept for testing, code names the labelled procedure as often as the best of three models and a
wrong one half as often. The smallest model never answered "none" and was wrong on 56 in 100.

[MalruleLib](https://github.com/sonkar-lab/malrulelib) is another team's library of 101 faulty procedures, with
generated wrong answers and a task of its own: from one wrong answer, predict the same learner's answer to a second
problem. On the pairs code can take, a prediction from code is right about nine times in ten, and code makes one for
half to two thirds of the pairs. With code first and a model asked only where code has no prediction, `gemma-4-31b-it`
goes from 33 right in 100 to 60 when the second problem is from another template, and `gpt-oss-120b` from 56 to 63.
With 100 pairs in a cell, a difference under about 14 points could be chance.

[The three checks in full](../evals/diagnosis/README.md)

## What holds with no model

<p align="center">
  <img src="../../docs/images/scorecard.svg" width="100%" alt="The scorecard at a glance. Eight guarantees hold on 4,439 checks, among them that a learner's words never enter what the model is told, that an answer key reaches only the reviewer, and that a reply stating the key is stopped by code. On the test half of each set, the rules read 83 percent of 150 English messages as labelled, from 51 percent before, and review finds 87 percent of 53 planted problems, from 79 percent, with no false alarm.">
</p>

The scorecard runs on every commit with no model and no key: eight guarantees on 4,439 checks, and five measures on
cases split in halves before any result was read. On the test halves, the rules read 83% of 150 learner messages as
labelled, `review` finds 87% of 53 planted problems with no false alarm, code names the procedure behind 70% of 80 wrong
answers, decides the step a turn requires on 90% of 345 turns, and sees a right answer on 18 of 20 turns.

[The scorecard](scorecard.md)

## The first check

November 2026, before the policy layer existed. A small check, to decide whether the part before the reply was worth
building.

Four conditions on each learner message, on two models (one open-weight):

| Condition | What the reply step got |
| --- | --- |
| Plain | a one-line tutor prompt |
| Whole settings | that, and everything a teacher set for the activity |
| Brief, by rules | that, and what this moment needs, chosen by rules, with no extra call |
| Brief, by a small model | the same, chosen by a small model, with one extra call |

The cases are 30 grade 5 fractions messages, written by an author who saw neither the settings nor the conditions, and
20 mistaken solutions from [MathDial](https://github.com/eth-nlped/mathdial)'s test set. A bar for what would count was
written down before any run was read.

There are two measures. First-draft pass: VETTING reviews the draft, against the same settings and answer key in every
condition. Good reply: a strong model, seeing each reply alone and never its condition, says yes to all of: doesn't give
the answer away, responds to what this learner did, gives one clear next step, and its mathematics is right.

| Main model (open-weight) | First-draft pass | Good reply | Withholds the answer | Tokens a turn |
| --- | --- | --- | --- | --- |
| Plain | 8% | 4% | 14% | 519 |
| Whole settings | 68% | 50% | 72% | 880 |
| Brief, by rules | 80% | 62% | 92% | 652 |
| Brief, by a small model | 80% | 65% | 94% | 1,811 |

The second model went the same way (8%, 74%, 86% and 82% on first-draft pass).

- The large effect comes from telling a model what the teacher decided before it replies. The plain prompt never heard the rules it was
  reviewed against, so this is the gap for an app that adds nothing. An app with a careful prompt of its own is what
  [the policy check](#a-teaching-policy-turn-after-turn) compared against.
- A brief's further gain isn't clear on the bar set beforehand: +10 points on first-draft pass (95% interval -2 to 22) and +10 to +14 on a
  good reply on the main model. It is clear on not giving the answer away: +18 to +20 (intervals 8 to 33). The rules version costs about a
  quarter fewer tokens.
- Reading the moment works: a small model got 29 of 30, rules 23. Finding the right misconception by matching words doesn't: 4 of 19
  turns. For arithmetic it is now [computed](#a-mistake-worked-out-by-code).
- A brief can mislead: a reply to wrong work said it "looks consistent", so the move for an attempt was rewritten after this check.

Fifty cases find only a large difference, and all are English mathematics.

## What these numbers cover

Replies and decisions made by code, on invented cases: scripted learners, conversations and wrong answers written by a
model from a description of the task, and judges that are models. No person has checked the labels yet, and no learner
took part. Whether a policy helps learners takes a study with learners, and a tutor that holds the policy is what makes
such a study a study of that policy.
