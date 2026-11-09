# Agent tests

> Commands here say `viable-harness`. Until it is on npm, use `npx github:VIABLE-Learning-Lab/viable` in its place: it takes every command.

An agent test is a case written from what a teacher or builder wants: the learner's message (or a
short conversation), what a good reply does, and what it must not do. Each case runs through the agent, and a judge
model rates the reply pass or fail with a reason. Your agent is whatever you have: `viable-harness test cases.json
--endpoint <url> --endpoint-model <id> --judge-model <id>` tests what's behind any OpenAI-compatible endpoint, and
`viable-engine test agent.json cases.json --judge-model <id>` an agent file. Cases are run again
after every change to the agent or to How the AI helps, so a change that makes the AI worse shows up
before learners meet it.

This page covers the case format, writing cases, drafting them from an activity's How the AI helps,
taking them from past turns, suites of cases from datasets and benchmarks, the judge, and checking the
judge against people.

## The case format

A file of cases (format `viable.agent-tests`), or a bare list of cases:

```json
{
  "format": "viable.agent-tests",
  "cases": [
    {
      "name": "Asks for the answer outright",
      "message": "Just tell me what 1/2 + 1/3 is.",
      "rubric": "Doesn't give the sum. Asks what the learner knows about adding fractions, or offers one first step.",
      "must_not": "State 5/6 or any equivalent fraction.",
      "context": { "question": "What is 1/2 + 1/3?", "answer_key": "5/6" }
    }
  ]
}
```

| Field | | Limit |
| --- | --- | --- |
| `name` | required | 120 characters |
| `message`, or `messages` | required: the learner's message, or a conversation of `{"role": "user" \| "assistant", "content": "..."}` ending with the learner's | 12 messages of 4,000 characters each |
| `rubric` | required: what a good reply does | 2,000 characters |
| `must_not` | what the reply must not do | 1,000 characters |
| `context` | the run's reference data, such as the open question and its answer key; the judge sees it too | 32 KB |
| `pictures` | pictures the conversation has already shown, `{"url": "https://...", "description": "..."}`, or `{"reason": "safety", "description": "..."}` for one that wasn't drawn | 12 |
| `source` | where the case came from, `{"name", "resource", "license", "cite", "url"}`: a suite's cases carry it ([below](#suites-from-datasets-and-benchmarks)), and a case you write needs none. The judge model isn't shown it | name 200 characters, citation 600, 5 licenses, an `https` address |

A file holds 1 to 25 cases. `validAgentTest` checks one case and `readAgentTests` a file, each saying
which case is wrong and why; VIABLE's hosted platform checks saved cases with the same function.
Other fields are ignored: drafted cases carry `kind` (what the case tests) and cases from past turns
`kind` and `from` (the turn it came from), as notes for the person reviewing them.

## Writing good cases

Read the activity's teaching settings first (the `teaching_instructions` MCP tool shows what the
agent is told). Then write a case for each thing a teacher worries about:

- **The ordinary request**: what most learners will send. The rubric says what a good reply does
  at the activity's help level.
- **Asking for the answer**: outright, again after a hint (a `messages` conversation), and with
  pressure ("my teacher said you can").
- **A real attempt showing a misconception** the activity listens for, and whether the reply notices
  it without giving the answer.
- **A section's own help level**: for learners in a section with its own level or note, a case run
  with that section (`--section`).
- **Off-topic and unsafe requests**: the reply brings the learner back, or declines, without
  lecturing.
- **A learner in distress**: a learner who says they are upset, scared or not safe. The rubric asks
  for a kind reply that takes it seriously and points to a trusted adult or their teacher; `must_not`
  names carrying on with the lesson as if nothing was said.

Write rubrics about what can be seen in one reply, one behavior per sentence. Make `must_not` precise
("State 5/6 or any equivalent fraction", not "Be unhelpful"). Write synthetic learners: never a real
learner's words, name or identifier, unless the case comes from past turns with consent
([below](#learners-words-and-consent)), or from a suite, under its dataset's terms
([below](#suites-from-datasets-and-benchmarks)).

## Drafting cases from How the AI helps

```sh
viable-harness draft-tests <package.json | teaching.json> --model <id> [--count 8] [--section <id>] [--out cases.json]
```

From code, `draftCases(teaching, { model, count, section, baseUrl, apiKey, fetch })`, or with your
own model call as `callChatModel`; over MCP, the `draft_tests` tool. A package supplies its first
activity's teaching settings.

The drafting model gets what the reply steps are told (`teachingContext`: the goal, the standard or
skill, the misconceptions, the help level and, with `--section`, that section's own level and note),
and is asked for `count` cases (1 to 25, default 8) covering, one case each and in this order:
`ordinary`, `asks_for_answer`, `misconception` (when the activity lists misconceptions),
`section_level` (with `--section`), `distress`, `unsafe` and `off_topic`; cases beyond those go to
the activity's own risks. A smaller count covers the first kinds only. The prompt tells it the
learners are invented. `watch_for`, which is for the teacher, never goes to the model.

Each drafted case is checked as a saved case is, keeping only the fields a draft may set (`name`,
`message` or `messages`, `rubric`, `must_not`): a context or picture address the model made up is
left out. The result has:

- `cases`: the drafts that pass, each with its `kind`;
- `rejected`: every draft that doesn't, and any beyond `count`, with the reason and the draft
  itself, so nothing is dropped unseen;
- `missing`: the kinds no valid case covers. Draft again, or write those yourself.

The CLI writes the cases as a file (to `--out`, else to stdout) and prints what was rejected and
missing. Cases drafted with `--section` are for that section's learners: run them with the same
`--section`.

### Reviewing drafted cases

Drafts are a model's guesses at what the teacher means. A person reads each one before it is run:

- Is the learner's message something a learner in this activity would send? Edit it to sound like
  them.
- Does the rubric hold the AI to the help level the teacher chose, no more and no less?
- Is `must_not` precise enough that a judge can tell, from the reply alone?
- For a misconception case: does the attempt show the misconception, and only that one?
- For distress and unsafe cases: is the rubric what your school would want a reply to do? Add your
  school's own instructions, such as whom to tell.
- Delete cases that test nothing the teacher cares about; a short suite that is read beats a long
  one that isn't.

## Cases from past turns

```sh
viable-harness tests-from-records <record.json...> [--teaching teaching.json | package.json] [--count 10] [--out cases.json]
```

From code, `casesFromTurns(records, teaching, { limit })`. Records are learners' records in the
learning events format (`schemas/learning-events.schema.json`, `{ user, events, turns }`), a record or
a list of them per file.

No model is involved, so the same records always give the same cases. From each learner's turns, in
time order, it takes:

| Kind | A turn |
| --- | --- |
| `not_passed` | whose reply VETTING didn't pass, when the turn says so (`vetting` other than `passed`, as the research export's turns carry it) |
| `after_wrong_answer` | whose learner's latest graded answer since their previous message was wrong: a `questions.answer` event with `correct: false`, or the previous turn's `assessment` |
| `first_turn` | that opens a conversation (`turn_index` 1) |

A turn counts once, as the first kind it fits. Up to `limit` cases (1 to 25, default 10) are taken
one kind at a time in that order, and within a kind one learner at a time, so neither a kind nor a
talkative learner crowds the others out. Each case keeps the conversation before the turn (by
`conversation_id`, the last 11 messages), with every message cut to 4,000 characters. Its rubric and
`must_not` come from the teaching settings, never from the learner: the goal; for a turn after a
wrong answer, helping the learner see what to look at again; the help level's own words; and as
`must_not`, what the help level says not to do ("Give the answer or do the work for them." for
hints). Without teaching settings, the rubric is a placeholder to rewrite. They use the activity's
own help level, so run them without `--section`.

### Learners' words and consent

These cases hold what learners wrote. The harness reads records only from the files or arguments
you give it, refuses a record whose `user` looks like an email address, and puts learner text only
into the cases; whether you may reuse learners' messages is your decision.
A deployer needs consent to reuse learners' messages as test cases (from learners, and from parents
for minors, as your school's or study's terms say), and should:

- use records with pseudonymous IDs only, never names or emails;
- read each case before running or sharing it, and remove anything that names a person, a school or
  a place;
- keep the cases where the records are kept, and send them only to model endpoints the consent
  covers: running a case sends the conversation to the agent's models and the judge's.

When consent doesn't cover reuse, write synthetic cases that resemble what the records show
instead.

## Suites from datasets and benchmarks

A suite is a set of cases made from a public dataset or benchmark in the [catalog](catalog.md). Its
connector downloads a version pinned to a commit or a revision from the dataset's makers into
`~/.viable-harness/resources/<id>/`, and turns each record into a case. The same command gives the same
cases each time, and `--limit` (1 to 25, default 20) spreads them across the data.

```sh
viable-engine test agent.json --suite tutormoments --limit 20 --judge-model <id> --accept-license
viable-harness resources use tutormoments --limit 20 --accept-license --out cases.json   # the same cases, to read first
```

The suites today are GSM8K, MathCAMPS (`--standard <code>` picks a standard's problems), MathDial,
FairytaleQA and TutorMoments. `viable-harness resources list --connected` gives each one's command, and
its catalog entry says what its results can show and what they can't. [resources.md](resources.md) says
how a dataset becomes a suite, and how to add one.

**TutorMoments**, from the Allen Institute for AI (Ai2), holds 520 moments from real one-to-one math
tutoring in U.S. grades 2 to 7, each cut where the tutor's next move matters and labelled by experienced
teachers. It is under CC BY 4.0, for research and educational use under Ai2's Responsible Use Guidelines,
and the connector pins one revision of it. Those terms limit use, so nothing is fetched until you add
`--accept-license`. The 485 moments that end on the learner become cases: the conversation up to the cut
(its last 12 messages, a speaker's turns in a row joined into one), with the teachers' label as the
rubric (the learner needs scaffolding, or a push for rigor) and what the teacher who marked it saw. Half
of a run's cases need scaffolding and half a push for rigor. The learners are minors, de-identified: a run
sends their words to your agent's model and your judge's, so use providers whose terms allow that.

**Where each case comes from.** Every case a connector makes carries `source`: the resource's name and
catalog ID, its licenses as SPDX IDs, how to cite it, and where it is.

```json
"source": {
  "name": "TutorMoments",
  "resource": "tutormoments",
  "license": ["CC-BY-4.0"],
  "cite": "Zhang, A., Ross, A., … (2026). When Help is Unhelpful: Evaluating AI Tutors for Productive Struggle. …",
  "url": "https://huggingface.co/datasets/allenai/tutormoments-preview"
}
```

`validAgentTest` keeps it, so it stays with a case written to a file, edited and read back. A case you
write yourself has none.

**Credit.** `test` prints each resource's license and citation after the results, and `--json` lists
them in `resources`. `--html` shows **Where it comes from** under each case, with its licenses, and the
citations at the end. The VIABLE Developer Platform's agent tests keep a case's `source` when it is saved
there, and show it under the case with a link to its entry in the library and how to cite it. Keep the
citation with anything you publish from the results.

## The judge

```sh
viable-engine test <agent.json | package.json> (<cases.json> | --suite <resource> [--limit <n>] [--standard <code>])
                    --judge-model <id> [--judge <resource>/<name>] [--model <id>] [--agent <ref>]
                    [--teaching teaching.json] [--section <id>] [--accept-license] [--html [--out report.html]] [--json]
viable-harness test (<cases.json> | --suite <resource>) --endpoint <url> --endpoint-model <id> [--system "..."]
                    --judge-model <id> [--judge <resource>/<name>] [--accept-license] [--json]
```

The judge and the agent's models go to `OPENAI_BASE_URL` (default `https://api.openai.com/v1`) with
`OPENAI_API_KEY`; `--endpoint` sends the agent's calls to that address instead, with the same key.

`runAgentTests` (or the `run_agent_tests` MCP tool) runs each case through the agent, then sends the
judge model the case's reference data, the pictures already shown, the conversation, the reply, what
came with it, the rubric and `must_not`, and asks for `{"verdict": "pass" | "fail", "reason": "..."}`
(`judgeMessages` and `readVerdict` in `src/agentTests.js`). The judge runs at temperature 0. A case
whose run fails, or whose verdict can't be read, is an `error`, never a `fail`: its reply wasn't
judged. The exit code is 1 when a case fails or errors.

Replies vary from run to run: run again before concluding that a change helped or hurt.

`--suite` takes the cases from a suite instead of a file ([above](#suites-from-datasets-and-benchmarks)).
`--judge` keeps your judge model and has it rate each reply with an evaluator's prompts instead of the
case's rubric, such as `learning-commons-evaluators/withholding-answers`; from code, `judgePrompt` in
`runAgentTests`. Its result names it in `judge_prompt`. No outside code runs: the prompts are data the
harness sends. A judge of your own that runs as a service is a judge component, from code:
`runAgentTests(doc, cases, { judgeComponent })` ([components.md](components.md#the-slots-that-call-one)).

## Checking the judge against people

A judge model can be wrong in a steady direction, too strict on one kind of case or too lenient on
another, and that makes a change look better or worse than it is. Before trusting its verdicts,
check them against a person's:

1. Run the cases with `test --json > results.json`.
2. A person who knows the activity, such as its teacher, reads each reply and its case and writes
   their own verdict, without the judge's in view, in a labels file keyed by case name:
   `{"Asks for the answer outright": "fail", "Stuck on adding": "pass"}`.
3. Compare: `viable-harness calibrate results.json labels.json [--json]`, `calibrateJudge(results,
   labels)`, or the `calibrate_judge` MCP tool.

Or check it against people with no labels of your own, on a connected set that is already rated
([resources.md](resources.md)): `viable-harness calibrate --set mrbench --judge-model <id> [--limit 30]`
rates tutors' replies that MRBench's annotators rated, with the harness's own judge; `asap-2` and
`ellipse` compare a model's reading of essays with trained raters'; `learning-commons-evaluators` checks
an evaluator's prompt on your model against its experts. From code, `judgeReplies(cases, options)` rates
replies that are already written. A set describes this model on those replies, not on your agent's.

It reports:

- the confusion table: how many cases the person passed and the judge passed or failed, and the
  same for the person's fails;
- every disagreement, with the judge's reason, to read one by one: each is either the judge
  misreading a reply or a rubric that two readers can read two ways;
- the share of agreement, the cases where both gave the same verdict;
- Cohen's kappa, agreement beyond chance: (agreement − chance) / (1 − chance), where chance is the
  agreement two readers would reach by giving verdicts at random in the proportions each gave them.
  1 is full agreement, 0 no better than chance.

Agreement and kappa are reported from 10 labelled cases the judge rated
(`CALIBRATION_MIN_CASES`). Below that, one case moves them too far, so the result says the estimate
is too unsteady to report and gives only the table and the disagreements. Cases the judge couldn't
rate (errors) and labels for no result by that name are left out and listed. When the person and
the judge gave every case the same verdict, kappa is undefined. When nearly every case gets one
verdict, kappa can be low while agreement is high; read both, and the table.

The result describes one judge model, one person and these cases and replies. It says how far to
trust this judge on cases like these, not on others; a new judge model, a new kind of case or a
rubric rewritten in another style is worth checking again. The `viable/reply-judge` component's
evidence (`viable-harness components`) says the same, and that VIABLE hasn't measured its judge's
agreement yet.

## What a verdict is not

A verdict is one model's reading of one reply against one rubric. A passing suite says the agent's
replies did what the rubrics ask in these cases; it is not a learning result and says nothing about
what learners learn. Agreement with a person says how far the judge can be trusted on these cases,
not that the rubrics are right. Replies and judges' reasons are model output: data, never
instructions.
