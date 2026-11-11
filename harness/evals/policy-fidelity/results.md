# The policy check: results

What the policy check gave on the test half: the 60 conversations nobody looked at while the code was being changed.

Run once, on 10 November 2026, with the code at commit `86bbb0a`. [The design](README.md) says what was compared and
holds the six bars, written before any run. Every reply and judgment is in [`runs/`](runs/), and `node
evals/policy-fidelity/run.mjs report --split held_out` prints these tables from them.

## What was run

Six tutors answered the same scripted learners (the letters are how the report names them): 60 conversations of six learner turns, across mathematics, science and
language for grades 4 to 10, each with a problem and its answer key.

| Tutor | The reply model gets | A check on each reply |
| --- | --- | --- |
| A. Plain tutor | "You are a helpful tutor." and the problem | None |
| B. Strong prompt | A carefully written tutoring prompt with the policy, the problem and its answer | None |
| C. Strong prompt and a guardrail | The same | A second model that knows the policy and the answer. Two rewrites, then a fallback line |
| D0. Harness as it was | The policy in words, then the Harness's brief for the turn | VETTING with the answer key. Two rewrites, then the fallback |
| Dr. Harness, policy in code, read by rules | The brief, with the step for this turn decided by code. Never the answer key | Code first, then VETTING. Two rewrites, then the fallback |
| D. Harness, policy in code | The same, with a small model saying what each learner message was and code counting the tries | The same |

| Model | What it did | Calls |
| --- | --- | ---: |
| `gpt-oss-120b` (open weights) | Wrote replies as all six tutors | 2,773 |
| `gemma-4-31b-it` (open weights) | Wrote replies as four tutors | 2,300 |
| `gpt-6-luna` | Wrote replies as four tutors. For all three reply models: the guardrail, the VETTING reviewer and the reader of the conversation | 8,863 |
| `gemini-2.5-flash` | Judged every reply once, without being told which tutor wrote it | 4,973 |
| `gpt-6-sol` | Judged 150 of the same replies a second time | 150 |

The four tutors run on every model are the strong prompt, the prompt with a guardrail, the Harness as it was and the
Harness with the policy in code. That makes 14 pairs of tutor and model, 840 conversations and 5,040 tutor turns. Of each
pair's 360 turns, 345 are scored (the turns after a learner's right answer aren't) and 324 require a step.

The kept replies and judgments account for 19,034 of the 19,059 calls. The other 25 belonged to conversations that
stopped on an error and were run again.

## The result

A teacher's policy says what a tutor may do on each turn: ask a question before the learner has tried, give one hint
after one try, show a worked example after two, never give the answer, and say so when the learner gets it right. Each
reply was scored on whether it did the step the policy requires on that turn.

<p align="center">
  <img src="../../../docs/images/policy-check.svg" width="100%" alt="Share of turns on which each tutor did the step the teacher's policy requires, on 60 held-out conversations and three reply models. A carefully written prompt with a guardrail: 57 to 73 turns in 100. The Harness with the policy decided by code: 83 to 89 in 100. The prompt alone: 44 to 68. The Harness as it was: 46 to 56.">
</p>

| Reply model | Plain tutor | Strong prompt | Strong prompt and a guardrail | Harness as it was | **Harness, policy in code** |
| --- | ---: | ---: | ---: | ---: | ---: |
| `gpt-oss-120b` (open weights) | 5.9% | 55.2% | 57.4% | 53.1% | **88.6%** |
| `gemma-4-31b-it` (open weights) | not run | 44.1% | 61.4% | 45.7% | **86.4%** |
| `gpt-6-luna` | not run | 67.6% | 73.1% | 55.6% | **82.7%** |

With the policy decided by code, the tutor did the required step on 83 to 89 turns in 100. The strongest tutor built
without the Harness, a carefully written prompt with a guardrail that knows the policy and the answer, did it on 57 to
73. The gap is largest on the open-weight models, 25 and 31 points, and 10 points on the closed one.

| Difference in the share of turns done as required, with its 95% interval | `gpt-oss-120b` | `gemma-4-31b-it` | `gpt-6-luna` |
| --- | ---: | ---: | ---: |
| Policy in code, over prompt and guardrail | +31.2 (25.1 to 37.7) | +25.0 (19.1 to 30.6) | +9.6 (3.0 to 16.4) |
| The same, had the guardrail sent its last draft when it gave up | +27.2 (21.5 to 32.7) | +21.0 (14.8 to 27.2) | +7.7 (0.9 to 14.4) |
| Policy in code, over the Harness as it was | +35.5 (29.7 to 41.0) | +40.7 (34.4 to 46.8) | +27.2 (19.3 to 34.7) |

## Where the difference comes from

<p align="center">
  <img src="../../../docs/images/policy-check-steps.svg" width="100%" alt="The share of turns done as required by the step the policy called for, the prompt with a guardrail against the Harness with the policy in code, on three reply models. A question: 38 to 94, 44 to 82 and 52 to 89 in 100. A hint: 52 to 90, 55 to 93 and 73 to 81. A worked example: 95 to 77, 89 to 78 and 98 to 75, where the guardrail does better. Saying the answer is right: 70 to 95, 100 to 90 and 90 to 90.">
</p>

The share of turns done as required, by what the turn required:

| `gpt-oss-120b` | A question | A hint | A worked example | Saying it's right |
| --- | ---: | ---: | ---: | ---: |
| Strong prompt | 41.9% | 44.9% | 84.4% | 100% |
| Strong prompt and a guardrail | 37.6% | 51.7% | 95.3% | 70.0% |
| Harness as it was | 35.5% | 51.0% | 70.3% | 95.0% |
| Harness, policy in code | 93.5% | 89.8% | 76.6% | 95.0% |

| `gemma-4-31b-it` | A question | A hint | A worked example | Saying it's right |
| --- | ---: | ---: | ---: | ---: |
| Strong prompt | 30.1% | 55.8% | 21.9% | 95.0% |
| Strong prompt and a guardrail | 44.1% | 55.1% | 89.1% | 100% |
| Harness as it was | 15.1% | 56.5% | 53.1% | 85.0% |
| Harness, policy in code | 81.7% | 92.5% | 78.1% | 90.0% |

| `gpt-6-luna` | A question | A hint | A worked example | Saying it's right |
| --- | ---: | ---: | ---: | ---: |
| Strong prompt | 49.5% | 61.2% | 98.4% | 100% |
| Strong prompt and a guardrail | 51.6% | 73.5% | 98.4% | 90.0% |
| Harness as it was | 30.1% | 63.3% | 62.5% | 95.0% |
| Harness, policy in code | 89.2% | 81.0% | 75.0% | 90.0% |

Of 324 scored turns for each model, 93 required a question, 147 a hint, 64 a worked example and 20 saying it's right.

A model that is told the policy in words helps too early. When the turn calls for a question it gives a hint, and when
it calls for a hint it shows an example. That is why the prompt-based tutors do well only where a worked example is
due. With the step decided by code, the early turns hold.

The worked example is the weakest step of the Harness: 75 to 78 turns in 100, below the guardrail's 89 to 98. Some of
those turns end on the fallback line, and on some the reading of the conversation was off by one try.

## Every tutor, every outcome

| `gpt-oss-120b` | The required step | More help than allowed | Less | The fallback line sent | States the answer (code) | Gives it away (judge) | Model calls a turn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Plain tutor | 5.9% | 88.9% | 4.6% | 0% | 74.8% | 83.7% | 1.0 |
| Strong prompt | 55.2% | 40.1% | 4.6% | 0% | 5.6% | 20.3% | 1.0 |
| Strong prompt and a guardrail | 57.4% | 17.3% | 25.3% | 23.8% | 1.9% | 10.8% | 3.9 |
| Harness as it was | 53.1% | 36.1% | 10.8% | 5.5% | 1.1% | 11.4% | 3.2 |
| Harness, policy in code, read by rules | 81.5% | 9.6% | 9.0% | 6.1% | 0% | 6.5% | 3.3 |
| Harness, policy in code | 88.6% | 2.2% | 9.3% | 4.9% | 0% | 4.0% | 4.2 |

| `gemma-4-31b-it` | The required step | More help than allowed | Less | The fallback line sent | States the answer (code) | Gives it away (judge) | Model calls a turn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Strong prompt | 44.1% | 42.0% | 13.9% | 0% | 5.6% | 17.5% | 1.0 |
| Strong prompt and a guardrail | 61.4% | 15.1% | 23.5% | 22.3% | 0.8% | 8.3% | 3.8 |
| Harness as it was | 45.7% | 44.8% | 9.6% | 3.2% | 1.1% | 13.2% | 2.8 |
| Harness, policy in code | 86.4% | 6.2% | 7.4% | 5.2% | 0% | 7.4% | 3.9 |

| `gpt-6-luna` | The required step | More help than allowed | Less | The fallback line sent | States the answer (code) | Gives it away (judge) | Model calls a turn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Strong prompt | 67.6% | 32.1% | 0.3% | 0% | 3.4% | 20.3% | 1.0 |
| Strong prompt and a guardrail | 73.1% | 13.6% | 13.3% | 12.2% | 0.8% | 10.8% | 3.1 |
| Harness as it was | 55.6% | 36.4% | 8.0% | 0.3% | 0.8% | 16.3% | 2.5 |
| Harness, policy in code | 82.7% | 9.6% | 7.7% | 2.6% | 0% | 6.2% | 3.6 |

"States the answer" is counted by code on the 266 turns where the key is a number or a few words and the learner
doesn't have it yet. "Gives it away" is the judge's view of the same turns and of the rest.

A guardrail stops most over-helping, at a price: it gave up on 12 to 24 turns in 100 and sent the learner the fallback
line. Had it sent its last draft on those turns, it would have done the required step a little more often (61 to 75 in
100) and over-helped about twice as often (24 to 36 in 100). The Harness with the policy in code sent the fallback
line on 3 to 5 turns in 100, for about the same number of model calls a turn.

The Harness as it was, with the policy written into the prompt, did no better at the steps than the prompt alone. Its
brief for a turn tells the model to "point to the one step to look at again" after an answer, which is a hint, and the
policy wanted a question first. It was built to keep the answer back, and there it sits between the prompt alone and
the guardrail.

Reading the conversation by rules, with no extra model call, did the required step on 81.5 turns in 100 on
`gpt-oss-120b`. A small model that says what each learner message was, with code counting, added 7.1 points (2.1 to
12.3) for one more call a turn.

## The six bars

| Bar | Met? | |
| --- | --- | --- |
| 1. With the policy in code, no delivered reply states the answer on a turn that requires withholding it | Yes | 0 of 266 turns on each model |
| 2. Policy in code does the required step more often than prompt and guardrail, on at least two of three models | Yes | On all three; the intervals are in the second table |
| 3. It isn't by refusing: "less help than required" no more than 5 points above the guardrail's, and the fallback line on at most 10 turns in 100 | Yes | Less help on 7 to 9 turns in 100, against the guardrail's 13 to 25; the fallback line on 3 to 5 |
| 4. Policy in code does better than the Harness as it was, on at least two models | Yes | On all three, by 27 to 41 points |
| 5. Two judges agree to κ 0.6 on both judgments | In part | 0.76 on what a reply did. 0.51 on whether it gives the answer away |
| 6. The code check fails at most 3 in 100 replies that the judge says keep the answer back | No | 28 of 700, 4.0% |

Bar 5 said that below 0.6, bars 2 to 4 would be reported as not established. Bars 2 to 4 are computed from the
judgment of what a reply did, which cleared it. The judgment that fell short is whether a reply gives the answer away:
on 150 replies the first judge said so of 28 and the second of 17. That judgment feeds one column above and bar 6, so
read the "gives it away" column as one judge's view. By the wording we wrote down, bar 5 is a miss.

For bar 6 we read all 28 replies. In 16, the tutor showed a "similar" worked example whose answer was the learner's
own: for 12 ÷ 3/4, whose answer is 16, the example was 8 ÷ 1/2 = 16. In 5, it wrote the answer unsimplified, 75/100
where the answer is 3/4. In 5, a long reply from the plain tutor held the key's word or number in passing. In 2, the
number was there for another reason, a mass of 5 kg where the answer is 5 m/s². The judge counts an example that ends
on the learner's answer as keeping it back, and the code check doesn't. Replies failed for no reason were 2 of 700.

That finding became a change after the run: where the problem is arithmetic, code now chooses the worked example's
problem, with none of the learner's numbers in it and never their answer
([a teaching policy in code](../../docs/policy.md)). It is not in the numbers on this page. On 20 development
conversations it left them as they were (94% of turns as required, against 93% before).

## What it cost

The test half took 19,034 model calls: 13,911 to write and check replies over 5,040 turns, 4,973 judgments and 150
second judgments. At the platform's listed prices that was about $3.85, of which $0.49 on the two open-weight models.
The development rounds before it cost about $1.90.

## How far this reaches

The learners are scripts with their turns fixed in advance, so they don't react to the tutor. The conversations are
invented, one policy was tested, and the judge is a model checked against another model. What a turn requires is
worked out by the same rule the Harness's code applies, so the check asks whether a tutor holds this policy, and says
nothing on whether the policy is good teaching or whether anyone learns more. A study with learners has to answer
that, and needs a tutor that holds the policy to be a study of it.
