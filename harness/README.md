# VIABLE Harness

**Give any AI agent what a good teacher has in mind, before it replies.** Building a tool for learners with a coding agent instead?
[That's the other side of the Harness](docs/for-builders.md): what the AI that builds needs to know about a classroom.

In the field's terms, a harness is everything around a model that decides what it knows, what it may do, when it stops and
whether the result is any good. General harnesses are tuned for writing code. This one is tuned for teaching, and it goes
around the agent you already have.

A learner writes *"i got 2/5"* for 1/2 + 1/3. Before your model sees it, the Harness adds:

```text
From the teacher of this activity:
How the teacher wants you to help in this activity:

Goal: Learners rewrite fractions with a common denominator before adding or subtracting.
Standard: 5.NF.A.1 (Multi-State, grade 5) Add and subtract fractions with unlike denominators...
How far to go: Give hints and guiding questions, one step at a time. When they have it, say so. Don't give the answer or do the work for them.

For this turn (how far to go still comes first):

Right now: The learner has given an answer or some working. Work it out yourself first, without showing it. If it is wrong,
don't say it looks right: find out how they got it, or point to the one step to look at again.

What may be behind it, only if it fits what they did:
- Believes that fractions are added by summing numerators and denominators as if they are separate whole numbers
```

The move and the misconception are chosen for this message, and everything else the teacher set stays out. *"just tell me the
answer"* gets a different move; a fourth wrong try brings in the teacher. The learner's own words never enter it, so they can't
write instructions into it.

## Four ways in

**Your assistant, with nothing to install.** A Skill teaches an assistant the moves, and MCP gives it the tools:

```sh
npx skills add VIABLE-Learning-Lab/viable --skill teaching-with-viable
claude mcp add --transport http viable https://api.viablelab.org/mcp
```

**Any app, in any language, by changing one URL.** Each call gets what its moment needs, each reply is checked before your
app sees it, and a record feeds the teacher's page. Nothing else changes:

```sh
npx @viable-lab/harness gateway --upstream https://api.openai.com/v1 --teaching fractions.json --reviewer-model your-reviewer
export OPENAI_BASE_URL=http://127.0.0.1:8090/v1
```

[Recipes](docs/with-your-stack.md) for curl, Python, Node, LangChain, LangGraph, LlamaIndex, the OpenAI Agents SDK and the Vercel
AI SDK, each one run as written.

**Your own code, with three calls** around whatever writes the reply:

```js
// npm i @viable-lab/harness
import { prepare, check, record } from '@viable-lab/harness';

const turn = await prepare({ teaching, message, history });             // before: context and rules
const reply = await yourAgent(`${yourPrompt}\n\n${turn.instructions}`); // anything: a model, a framework, your own loop
const result = await check({ turn, reply, reviewer: 'a-second-model' }); // after: did it meet the bar
await record({ turn, result, learner: 'L-7F3KQ2', store });              // after: what happened
```

**Another harness.** If yours can add to the system prompt before a turn, call `prepare` there and `check` after it. An MCP tool or a
Skill is advice an assistant may ignore; the gateway, your own calls and the [Engine](../engine/README.md) guarantee it runs.

## What it does

| When | Part | The question | How |
| --- | --- | --- | --- |
| Before the reply | **Context** | What should it have in mind at this moment, and nothing more? | what the teacher decided ([How the AI helps](skills/writing-how-the-ai-helps/SKILL.md)); standards and misconceptions from [open resources](docs/resources.md); teaching moves, each with its source; what this learner just did |
| Before the reply | **Rules** | What may it see and do here? | how far it may help; which tools are off, removed rather than only told; no learner's identity; answer keys that reach only the reviewer |
| While it works | **Loop** | What happens next? | counts tries, changes approach when a learner keeps failing, brings in the teacher and flags it; with a ladder, [code decides](docs/policy.md) whether a turn gets a question, a hint or a worked example |
| After the reply | **Checks** | Did it meet the bar? | code first, which stops a draft that states the answer key; then [VETTING](skills/checking-replies-with-vetting/SKILL.md), which reviews a reply against a policy the learner never sees; [agent tests](docs/agent-tests.md) on your own agent before learners meet it, from your own cases or [open benchmarks](docs/resources.md), with judges you can compare against people |
| After the reply | **Evidence** | What happened, did it help, what should change? | records tied to what went in; [measures](docs/xapi.md) with their definitions; suggested changes a teacher accepts or declines |

A small model can read the moment instead of rules (`pickerModel`), and it reads more of them, in any language, for one more call
per turn. Without one, or if it fails, rules do. [How it works](docs/how-it-works.md) says what it chooses from, where that is kept,
and why there is no vector store.

## Not only replies

Each kind of teaching work is a task, prepared the same way. For a task that isn't a conversation, `turn.messages` is the whole
request, and `runTask` sends it and checks the answer:

| Task | What it does |
| --- | --- |
| `tutoring` | A reply to a learner, as above |
| `adapt-plan` | Summarizes a class's evidence against the teacher's goal, and suggests changes with the evidence beside each |
| `differentiate` | Sorts learners into groups by what their records show, for the teacher to confirm, and suggests each group's help level and note |
| `hard-moments` | Adds the strategy a teacher chose for when learners struggle, and gathers flagged moments for a conversation about productive struggle |
| `goals` | Turns a teacher's goal into test cases, to run against each version of the AI |

A model only ever hears a class's numbers: learners stay on your side, and the checks refuse an answer that names one.

## How much does it help?

A teacher's policy holds better when code decides its steps. On 60 test conversations with three reply models, a tutor
built from a carefully written prompt and a guardrail that knows the policy did the step the policy required on 57 to
73 turns in 100. With the Harness deciding the step in code it was 83 to 89, and no reply it delivered stated the
answer. With every model in the tutor open-weight, as in a school that runs its own servers, it was 74 and 75 against
48 and 45 on 60 new conversations ([the policy check](evals/policy-fidelity/README.md)).

<p align="center">
  <img src="../docs/images/policy-check.svg" width="100%" alt="Experiment 1. Share of turns on which each tutor did the step the teacher's policy requires, on 60 test conversations and three reply models. A carefully written prompt with a guardrail: 57 to 73 turns in 100. The Harness with the policy decided by code: 83 to 89 in 100. The prompt alone: 44 to 68. The Harness with the policy in words: 46 to 56.">
</p>

Where a problem is arithmetic, code names the faulty procedure behind a wrong answer as often as the best of three
models asked the same question, and names a wrong one half as often
([computed diagnosis: three tests](evals/diagnosis/README.md)).

What needs no model is checked on every commit, and anyone can run it: eight guarantees on 4,439 checks, such as a
learner's words never entering what the model is told and an answer key reaching only the reviewer. On the half of each
set kept for testing, the rules read 83% of 150 messages as labelled, `review` finds 87% of the problems planted in 30
projects with no false alarm, and code names the faulty procedure behind 70% of 80 wrong answers
([the scorecard](docs/scorecard.md)).

<p align="center">
  <img src="../docs/images/scorecard.svg" width="100%" alt="The scorecard at a glance. Eight guarantees hold on 4,439 checks, among them that a learner's words never enter what the model is told, that an answer key reaches only the reviewer, and that a reply stating the key is stopped by code. On the test half of each set, the rules read 83 percent of 150 English messages as labelled, review finds 87 percent of 53 planted problems with no false alarm, code names the procedure behind 70 percent of 80 wrong answers, and rules decide the step a turn requires on 90 percent of 345 turns.">
</p>

The largest single gain comes from telling a model what the teacher decided before it replies. On 50 learner messages
and two models, a one-line tutor prompt got 8% of first drafts past review, and the teacher's settings got 68 to 74%. Giving
the model only what each turn needs, in place of the settings whole, kept the answer back on 18 to 20 more replies in
100, with a quarter fewer tokens ([what the settings add to a reply](docs/evidence.md#what-the-settings-add-to-a-reply)).

Each of these measures replies or code, on invented cases judged by a model, and none measures learning.
[What has been measured](docs/evidence.md) has every test, where it falls short, and the commands that print its
numbers again.

## Where its knowledge comes from

[Learning Commons](https://learningcommons.org) and [Eedi](https://www.eedi.com) keep the shelves: standards, learning components,
misconceptions, evaluators. If you want lookups in your assistant, use their MCP server. The Harness decides at each moment what to
take from them, credits them, and measures whether it helped. It carries their open data under CC BY 4.0, with the attribution to keep
([NOTICE](../NOTICE)).

## Reference

[How it works](docs/how-it-works.md) · [A teaching policy in code](docs/policy.md) · [With your stack](docs/with-your-stack.md) · [MCP](docs/mcp.md) · [Skills](skills/) · [Agent tests](docs/agent-tests.md) · [Scorecard](docs/scorecard.md) ·
[Ways to arrange an activity](docs/designs.md) · [Add your research](docs/add-your-research.md) · [Components](docs/components.md) · [Open resources](docs/resources.md) · [Catalog](docs/catalog.md) · [xAPI](docs/xapi.md) ·
[Conformance](conformance/README.md)

```sh
npx @viable-lab/harness --help
```
