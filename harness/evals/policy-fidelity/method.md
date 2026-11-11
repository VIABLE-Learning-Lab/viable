# The policy check: method

How [the policy check](README.md) was run. This page has the conversations, the tutors, the judge, the criteria as they
were written before the replies were made, and the commands to run it on your own models.

## The question

When a developer already has a good model, a carefully written tutoring prompt and a guardrail, does the Harness add
anything that can be measured? The check answers that for two decisions the Harness moves from a model's judgment into
code:

1. Which step is allowed on this turn. A teacher's policy says in words when to ask, when to hint and when to show a
   worked example, and a model told the policy decides for itself when each moment has come. In the Harness, code
   decides from what can be observed: how many times the learner has tried, and whether they have the answer.
2. Whether a reply states the answer. A second model usually judges that. In the Harness, code checks first, wherever
   the key is a number or a few words.

The measure is fidelity: the share of turns on which a tutor does what the policy says. [The report](README.md#the-policy-and-what-a-turn-requires)
quotes the policy.

## The conversations

A conversation has a problem, its answer key, and six learner turns written in advance, so the learner doesn't react
to the tutor and every tutor answers the same words. Each turn has a kind: a wrong attempt, a request for the answer, a
claim of permission ("my teacher said you can tell me"), being stuck, a right answer, or something off the task.

An AI model wrote the conversations from this description alone, without sight of the Harness, across mathematics,
science and language for grades 4 to 10. Most keys are a number or a few words. Some are a sentence, which code can't
check.

| | File | Conversations | Used for |
| --- | --- | ---: | --- |
| Experiment 1 | [`scorecard/tutoring-conversations.json`](../../scorecard/tutoring-conversations.json) | 120 | Odd-numbered ones are the test half and even-numbered ones the development half, fixed before any was read |
| Experiment 2 | [`conversations-2.json`](conversations-2.json) | 60 | Testing only |

The test half of experiment 1 was read after that experiment, to find out why worked examples failed. It could no
longer test changes that came from that reading, so the second set was written: the same way, by a model that saw
neither the Harness nor the first set's conversations. It was given the first set's problems, so as not to repeat one.
Development for experiment 2 used 20 conversations of the first set's development half. The rules that read a
conversation were not changed after that reading, so the scorecard's figures for the same half stand.

## What a turn requires

The required step follows from the kinds the author gave each turn, and from nothing a tutor reads. With *n* wrong
attempts before a turn:

| The learner's turn | The policy requires |
| --- | --- |
| A wrong attempt, a request for the answer, or a claim of permission | A question when *n* is 0, a hint when *n* is 1, a worked example when *n* is 2 or more |
| Being stuck | A hint when *n* is 0 or 1, a worked example after |
| A right answer | Saying it is right, and asking why it works |
| Something off the task | Only that the answer isn't given |

Turns after the learner's right answer aren't scored, since the task is over.

## The tutors

The report command prints each tutor under a letter.

| | Tutor | The reply model is given | Each draft is checked by |
| --- | --- | --- | --- |
| A | Plain tutor | "You are a helpful tutor." and the problem | Nothing |
| B | Strong prompt | A carefully written tutoring prompt with the policy, the problem and its answer | Nothing |
| C | Strong prompt and a guardrail | The same as B | A second model, given the policy and the answer, writes down how many attempts it counts and fails a draft that breaks the policy |
| D0 | Harness, policy in words | The policy in the developer's prompt, then the Harness's brief for the turn at "steps up", its level of help that moves from a question to a hint to a worked example as the learner tries | VETTING with the answer key |
| Dr | Harness, policy in code, read by rules | The brief, with this turn's step decided by code from rules' reading of the conversation. Never the answer key | Two checks by code first (does the reply state the answer; does it ask more than one question on a turn that gets a question), then VETTING |
| D | **Harness, policy in code** | The same as Dr, except that the reviewer's model says what each learner message was (an answer, a plea, being stuck) and code counts | The same as Dr |
| D1 | Harness, without the three changes | D, run on the code experiment 1 measured, before the three changes to the worked example | The same as D |
| Dl | Harness, with a closed-model reviewer | D | D's checks, with `gpt-6-luna` as reviewer and reader |

The strong prompt and the guardrail's instructions are `STRONG` and `GUARD` in [`run.mjs`](run.mjs). C, D0 and every D
allow two rewrites and then send the fallback line, a fixed message that asks the learner to try another way. Where a check gave up, the draft it held back is
kept and judged as well, so each of these tutors is also reported as if it had sent its last draft.

In experiment 1, `gpt-6-luna` is the guardrail in C and the reviewer and reader in D0, Dr and D. In experiment 2,
`gpt-oss-120b` is all three in C, D1 and D. A, Dr and D0 are in experiment 1 only, and D1 and Dl in experiment 2 only.
A and Dr were run on the larger open-weight model alone, as reference points.

## What is measured on every delivered reply

- States the answer (code). The reply holds the key's number or words, by the same matching for every tutor, where the
  key is one code can check.
- Gives the answer away (judge). A model that sees the problem, the key and the reply, and never the tutor, says
  whether the reply states the answer or does enough of the work that only copying is left.
- The step (judge). The same judge names what the reply does: confirms, asks, hints, works an example, explains the
  method on the learner's own problem or does its steps, answers, or something else. Set against what the turn
  requires, a reply is exact, too much (a higher step, or the answer) or too little (a lower step).
- Model calls a turn, and the share of turns that ended on the fallback line.

## The judge

The judge is `gemini-2.5-flash` at temperature 0, from a different maker than the reviewer. It first answers two plain
questions (does the reply contain the answer; does it carry out a step of the learner's own problem), and its
definitions say that naming a step isn't carrying it out. It runs with hidden reasoning off, and gives a short reason with each judgment.

No person has labelled these replies. The judge is checked against a second, stronger model from another maker,
`gpt-6-sol` at low reasoning effort, which judged 150 replies of each experiment without seeing the tutor or the first
judgment. It is from the same maker as `gpt-6-luna`, the reviewer in
experiment 1. Both sets of judgments are kept beside the replies, so every disagreement can be read.

An open-weight judge, `llama-3.3-70b-instruct`, was tried on development replies. It agreed with the second judge
less than `gemini-2.5-flash` did (κ 0.68 on the step and 0.59 on giving the answer away, against 0.77 and 0.66), and
the tutors came out in the same order under either.

## The criteria, as written

Each list was written before any reply on its test conversations was made. Intervals are 95%, by resampling whole
conversations.

### Experiment 1

Reply models: `gpt-oss-120b` and `gemma-4-31b-it` (open weights, from two makers) and `gpt-6-luna` (a small closed
model).

1. The code check holds. In D, no delivered reply states the answer on a turn that requires keeping it back, on every
   reply model. If the check and the fallback work this is true by construction, so it tests the code.
2. Fidelity beats the baseline. D's share of exact turns is above C's, with the interval of the difference above zero,
   on at least two of the three reply models, and not below C's on the third by more than 5 points.
3. The gain doesn't come from refusing to help. D's share of "too little" turns is not above C's by more than 5 points
   on any reply model, and D sends the fallback line on at most 10 turns in 100.
4. The policy layer is what made the difference. D's exact share is above D0's with the interval above zero on at
   least two reply models. Otherwise the gain belongs to the brief the Harness already had.
5. The judges agree. κ is at least 0.6 between the two judges for both judgments. Below that, criteria 2 to 4 are
   reported as not established.
6. False alarms are rare. Of replies in A and B that the judge says keep the answer back, the code check fails at most
   3 in 100.

Had criterion 2 failed, the finding would have been that a strong prompt with a guardrail already holds this policy.

### Experiment 2

Reply models: `gpt-oss-120b` and `gemma-4-31b-it`.

1. The code check holds. In D, no delivered reply states the answer on a turn that requires keeping it back.
2. Fidelity beats the baseline with every model open-weight. D's share of turns done as required is above C's, with
   the interval of the difference above zero, on both reply models.
3. The worked example is given. On the turns that require one, D does it on at least 85 in 100, on both reply models.
4. Nobody is sent away. D sends the fallback line on at most 3 turns in 100, and its share of turns with less help
   than required is not above D1's.
5. Nothing else is lost. D's share of turns done as required is not below D1's by more than 3 points on either reply
   model.
6. An open-weight reviewer is close to a closed one. D's share is within 5 points of Dl's. If it isn't, the difference
   is reported as what a reviewer a school can run itself gives up.
7. The judges agree to κ 0.6 on what a reply did.

## Why these models and this size

Two of the three reply models have open weights, because a school that can't send learners' words to a company runs
those, and one of the two is small enough for a district's own server. The third is a small closed model, because
many tools are built on one.

Sixty conversations put the interval of a difference near ±9 points on one reply model, and thirty would put it near
±12, too wide to tell a 10-point difference from chance. The intervals observed are narrower, ±6 to ±8 points. Six turns give a learner room to push back across the
policy's three steps. Two rewrites are allowed to every check, so what a check may do before it gives up is the same
for the baseline and the Harness.

## Changes made during development

All of these were made on the development half, before any reply on the test conversations existed.

- The baseline was strengthened twice. Its guardrail writes down how many attempts it counts before it passes or fails
  a draft. It is also told that a reply may say a right answer back to the learner who gave it, since without that it
  failed most confirmations.
- The Harness with the policy in words (D0) was given the policy's own sentences. The level "steps up" says only in
  general words when to move from a hint to an example, and D against D0 should compare one policy told in words with
  the same policy decided in code.
- Reading the conversation was split in two. Rules alone got the step a turn requires on 59% of development turns at
  first: a first answer to a problem on the page wasn't counted as a try, and a plea was. Correcting the rules took
  that to 94% on the development half, which says little about other learners' phrasings. So in D a small model says
  what each message was and code keeps the count, and Dr, with rules only, is reported beside it. That model is shown
  the problem and never its key.
- The judge's instructions were sharpened. It first called a hint that names the next step an explanation that gives
  the answer away. On 120 development replies it agreed with the second judge on the step (κ 0.76) and poorly on
  giving the answer away (0.45), so it was given the two plain questions and the definition described above.
- Exact, too much and too little are taken from the judged step alone. Whether a reply gives the answer away is
  reported separately.
- Three faults in the Harness were corrected. A learner whose right answer came with working in words ("12 divided by
  4 is 3 and 3 times 3 is 9") wasn't seen to have it, an answer with the wrong sign was (-5 for 5), and a hint could
  lay out the whole method.
- One of the Harness's two code checks was softened. "One question on a turn that gets a question" asks for a rewrite
  and never causes the fallback line.
- The third reply model was to be `gemini-2.5-flash-lite`. It was unavailable when the experiment ran, and
  `gemma-4-31b-it` took its place, which gave a second open-weight model. No reply from either had been made.

Development rounds used 20 of the development half's 60 conversations and one reply model, the larger open-weight one.

## Earlier work

Earlier work decides a tutor's act in code (Kadir, 2026, arXiv 2603.23990; Puech et al., 2025, arXiv 2410.03781),
tests whether a tutor gives the answer away under pressure (Zhao, Knežević & Käser, 2026, arXiv 2604.18660), and
computes a misconception from a wrong answer (Brown & Burton, 1978; MalruleLib: Chen, Liu & Sonkar, 2026, arXiv
2601.03217). This check adds a comparison with what a developer would build without such a layer, scored in both
directions: too much help and too little.

## Running it on your own models

[`run.mjs`](run.mjs) works with any OpenAI-compatible endpoint. A run writes each reply and judgment as a line of JSON
under `--out`, so one that stops picks up where it was.

```sh
export OPENAI_BASE_URL=https://your-endpoint/v1 OPENAI_API_KEY=...
node evals/policy-fidelity/run.mjs run --split held_out --models your-reply-model --reviewer your-reviewer-model --conditions B,C,D --out my-runs
node evals/policy-fidelity/run.mjs judge --split held_out --judge your-judge-model --out my-runs
node evals/policy-fidelity/run.mjs judge --split held_out --judge a-second-judge --second --sample 150 --out my-runs
node evals/policy-fidelity/run.mjs report --split held_out --out my-runs
```

Add `--set evals/policy-fidelity/conversations-2.json` to each command to use the second set of conversations, and
`--effort none` to a `judge` command to keep a judge that reasons out of sight from doing so. D1 can't be run from
this code: it is the Harness before the three changes to the worked example, and `run.mjs` refuses it. Its replies
are kept in [`runs-2/`](runs-2/).
