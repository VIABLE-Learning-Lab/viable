# The policy check: second run

What the policy check gave with every model in the tutor open-weight, on 60 conversations written after the first run.

Run once, on 10 November 2026, with the code at commit `a333a60`. [The design](README.md#the-second-run) says what
changed since [the first run](results.md), why a second set was written, and holds the seven bars, written before any
reply on that set was made. Every reply and judgment is in [`runs-2/`](runs-2/), and this prints the tables from them:

```sh
node evals/policy-fidelity/run.mjs report --set evals/policy-fidelity/conversations-2.json --split held_out --out evals/policy-fidelity/runs-2
```

## What was run

| Tutor | What it is | On which reply models |
| --- | --- | --- |
| C. Strong prompt and a guardrail | A carefully written prompt with the policy and the answer, and a second model that knows both and fails a reply that breaks the policy | both |
| D1. Harness, as the first run measured it | The policy in code, at commit `86bbb0a` | both |
| D. Harness, now | The same with three changes: the reviewer is told what a worked-example turn allows, code chooses an arithmetic example's problem, and a step that can't be given is written as the step below it | both |
| Dl. Harness, now, with a closed reviewer | D, with `gpt-6-luna` as reviewer and reader of the conversation | `gpt-oss-120b` |

| Model | What it did | Calls |
| --- | --- | ---: |
| `gpt-oss-120b` (open weights) | Wrote replies as all four tutors. In C, D1 and D, for both reply models: the guardrail, the VETTING reviewer and the reader of the conversation | 6,575 |
| `gemma-4-31b-it` (open weights) | Wrote replies as C, D1 and D | 1,533 |
| `gpt-6-luna` | Reviewer and reader in Dl | 944 |
| `gemini-2.5-flash` | Judged every reply once, without being told which tutor wrote it | 2,442 |
| `gpt-6-sol` | Judged 150 of the same replies a second time | 150 |

Seven pairs of tutor and reply model make 420 conversations and 2,520 tutor turns. Of each pair's 360 turns, 336 are
scored and 324 require a step: 75 a question, 167 a hint, 62 a worked example and 20 saying the answer is right. The
kept replies and judgments account for 11,591 of the 11,644 calls. The other 53 belonged to conversations that stopped
on an error and were run again.

## The result

<p align="center">
  <img src="../../../docs/images/policy-check-2.svg" width="100%" alt="The second run of the policy check, with every model in the tutor open-weight, on 60 new conversations. Share of turns done as the policy requires on the two reply models: a carefully written prompt with a guardrail 45 and 48 in 100, the Harness as the first run measured it 72 and 73, the Harness now 74 and 75.">
</p>

| Reply model | Strong prompt and a guardrail | Harness, as the first run measured it | **Harness, now** | Harness, now, with a closed reviewer |
| --- | ---: | ---: | ---: | ---: |
| `gpt-oss-120b` (open weights) | 48.1% | 72.8% | **74.4%** | 81.2% |
| `gemma-4-31b-it` (open weights) | 45.4% | 71.6% | **75.0%** | not run |

With every model open-weight, the Harness did the step the policy requires on 74 and 75 turns in 100. A carefully
written prompt with a guardrail run by the same open-weight model did it on 48 and 45.

| Difference in the share of turns done as required, with its 95% interval | `gpt-oss-120b` | `gemma-4-31b-it` |
| --- | ---: | ---: |
| Harness now, over prompt and guardrail | +26.2 (18.7 to 34.0) | +29.6 (22.2 to 37.1) |
| The same, had the guardrail sent its last draft when it gave up | +21.0 (13.5 to 28.4) | +22.2 (15.1 to 29.3) |
| Harness now, over the Harness as the first run measured it | +1.5 (-3.7 to 6.6) | +3.4 (-2.8 to 9.9) |
| Open-weight reviewer, over the closed one | -6.8 (-13.1 to -0.6) | not run |

## Step by step

<p align="center">
  <img src="../../../docs/images/policy-check-2-steps.svg" width="100%" alt="The second run by the step the policy called for, the Harness as the first run measured it against the Harness now, on two open-weight reply models. A question: 77 to 77 and 79 to 81 in 100. A hint: 77 to 72 and 75 to 80. A worked example: 53 to 71 and 47 to 50. Saying the answer is right: 85 to 90 and 90 to 90.">
</p>

| `gpt-oss-120b` | A question | A hint | A worked example | Saying it's right |
| --- | ---: | ---: | ---: | ---: |
| Strong prompt and a guardrail | 24.0% | 47.9% | 82.3% | 35.0% |
| Harness, as the first run measured it | 77.3% | 76.6% | 53.2% | 85.0% |
| Harness, now | 77.3% | 72.5% | 71.0% | 90.0% |
| Harness, now, with a closed reviewer | 89.3% | 82.6% | 71.0% | 70.0% |

| `gemma-4-31b-it` | A question | A hint | A worked example | Saying it's right |
| --- | ---: | ---: | ---: | ---: |
| Strong prompt and a guardrail | 22.7% | 52.7% | 54.8% | 40.0% |
| Harness, as the first run measured it | 78.7% | 75.4% | 46.8% | 90.0% |
| Harness, now | 81.3% | 79.6% | 50.0% | 90.0% |

## Every tutor, every outcome

| `gpt-oss-120b` | The required step | More help than allowed | Less | The fallback line sent | Stepped down | States the answer (code) | Gives it away (judge) | Model calls a turn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| C. Strong prompt and a guardrail | 48.1% | 36.1% | 15.7% | 13.4% | 0% | 3.2% | 21.8% | 3.2 |
| D1. Harness, as the first run measured it | 72.8% | 18.5% | 7.7% | 2.4% | 0% | 0% | 19.6% | 3.4 |
| D. Harness, now | 74.4% | 19.8% | 4.9% | 1.5% | 0.3% | 0% | 15.2% | 3.5 |
| Dl. Harness, now, with a closed reviewer | 81.2% | 8.3% | 10.5% | 4.8% | 0.9% | 0% | 7.9% | 4.4 |

| `gemma-4-31b-it` | The required step | More help than allowed | Less | The fallback line sent | Stepped down | States the answer (code) | Gives it away (judge) | Model calls a turn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| C. Strong prompt and a guardrail | 45.4% | 34.3% | 20.4% | 14.3% | 0% | 3.7% | 18.7% | 3.4 |
| D1. Harness, as the first run measured it | 71.6% | 16.0% | 11.7% | 2.1% | 0% | 0% | 14.6% | 3.2 |
| D. Harness, now | 75.0% | 12.3% | 11.7% | 0.3% | 1.2% | 0% | 10.4% | 3.3 |

"States the answer" is counted by code on the 217 turns where the key is a number or a few words and the learner
doesn't have it yet.

## The seven bars

| Bar | Met? | |
| --- | --- | --- |
| 1. No delivered reply of the Harness states the answer on a turn that requires withholding it | Yes | 0 of 217 turns on each reply model |
| 2. The Harness does the required step more often than prompt and guardrail, with every model open-weight | Yes | By 26 and 30 points, both intervals above zero |
| 3. The worked example is given on at least 85 turns in 100 that require one | No | 71 with `gpt-oss-120b`, 50 with `gemma-4-31b-it` |
| 4. The fallback line on at most 3 turns in 100, and no more turns with less help than before | Yes | 1.5 and 0.3 turns in 100. Less help on 4.9 and 11.7, against 7.7 and 11.7 before |
| 5. Nothing else was lost: not below the Harness as it was by more than 3 points | Yes | +1.5 and +3.4 |
| 6. The open-weight reviewer is within 5 points of the closed one | No | 6.8 points below it (0.6 to 13.1) |
| 7. Two judges agree to κ 0.6 on what a reply did | Yes | 0.74, on 150 replies |

## What the changes did

They ended most of what they were written for. With `gemma-4-31b-it`, the fallback line went from 2.1 turns in 100 to
0.3. With `gpt-oss-120b`, the worked example was given on 71 turns in 100 that required one, from 53. Over all turns the
Harness now is 1.5 and 3.4 points above the Harness as it was, which on 60 conversations isn't clear of chance.

The worked example is still the step the Harness holds least well, and bar 3 was missed on both reply models. The 62
turns of each that required one went like this:

| On the 62 turns that required a worked example | `gpt-oss-120b` | `gemma-4-31b-it` |
| --- | ---: | ---: |
| A worked example was given | 44 | 31 |
| A hint was given | 5 | 26 |
| The learner's own problem was explained | 9 | 3 |
| Something else, or the fallback line | 4 | 2 |

Two things are behind the misses, and neither is the reviewer failing sound examples, which was the first run's fault.

1. Told to work a named example, `gemma-4-31b-it` wrote a hint on 15 of the 62 turns, and nothing checks for less help
   than the turn calls for. On 8 more, the reader of the conversation had counted fewer tries or taken a plea for
   something else, so code asked for a hint or decided nothing. On 3 the step was stepped down.
2. `gpt-oss-120b` explained the learner's own problem on 9 turns, and the open-weight reviewer let those through.

## What an open-weight reviewer costs

With `gpt-6-luna` reviewing and reading in place of `gpt-oss-120b`, the same tutor did the required step on 81.2 turns
in 100, against 74.4. The open-weight reviewer passes more replies that go further than the turn allows: more help than
allowed on 19.8 turns in 100, against 8.3. It also fails fewer replies, so its fallback line is rarer, 1.5 turns in 100
against 4.8.

A school that runs every model itself gives up about 7 of 100 turns to a more lenient reviewer, and still holds the
policy on 26 to 30 more turns in 100 than a prompt with a guardrail run by the same model.

## What it cost

The run took 11,644 model calls: 9,052 to write and check replies over 2,520 turns, 2,442 judgments and 150 second
judgments. At the platform's listed prices that was about $2.00, of which $0.73 on the two open-weight models. One
development round before it, on 20 conversations of the first set's development half, cost about $0.15.

## How far this reaches

As [the first run](results.md#how-far-this-reaches): scripted learners, invented conversations, one policy, and a model
as judge. The two judges agreed on what a reply did (κ 0.74) and less on whether a reply gives the answer away (κ 0.42),
so the "gives it away" column is one judge's view.
