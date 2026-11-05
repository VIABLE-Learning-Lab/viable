# VIABLE Harness

**Give any AI agent what a good teacher has in mind, before it replies.**

In the field's terms, a harness is everything around a model that decides what it knows, what it may do, when it stops and
whether the result is any good. General harnesses are tuned for writing code. This one is tuned for teaching, and it goes
around the agent you already have.

A learner writes *"i got 2/5"* for 1/2 + 1/3. Before your model sees it, the Harness adds:

```text
From the teacher of this activity:
How the teacher wants you to help in this activity:

Goal: Learners rewrite fractions with a common denominator before adding or subtracting.
Standard: 5.NF.A.1 (Multi-State, grade 5) Add and subtract fractions with unlike denominators...
How far to go: Give hints and guiding questions, one step at a time. Don't give the answer or do the work for them.

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
| While it works | **Loop** | What happens next? | counts tries, changes approach when a learner keeps failing, brings in the teacher and flags it |
| After the reply | **Checks** | Did it meet the bar? | [VETTING](skills/checking-replies-with-vetting/SKILL.md), which reviews a reply against a policy the learner never sees; [agent tests](docs/agent-tests.md) on your own agent before learners meet it, with judges you can compare against people |
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

Early and honest: on 50 learner messages and two models, a one-line tutor prompt got 8% of first drafts past review, and a teacher's
settings given before the reply got 68 to 74%. Choosing what goes in for each turn added about 10 more points and a quarter fewer tokens,
which isn't yet clear of chance on that set, and is clear on not giving the answer away (18 to 20 points on an open-weight model). Finding
the right misconception for a message worked on only 4 of 19 turns. Rated by a model, on replies, not learning
([what was done](docs/evidence.md)).

## It doesn't compete with where its knowledge comes from

[Learning Commons](https://learningcommons.org) and [Eedi](https://www.eedi.com) keep the shelves: standards, learning components,
misconceptions, evaluators. If you want lookups in your assistant, use their MCP server. The Harness decides at each moment what to
take from them, credits them, and measures whether it helped. It carries their open data under CC BY 4.0, with the attribution to keep
([NOTICE](../NOTICE)).

## Reference

[How it works](docs/how-it-works.md) · [With your stack](docs/with-your-stack.md) · [MCP](docs/mcp.md) · [Skills](skills/) · [Agent tests](docs/agent-tests.md) ·
[Components](docs/components.md) · [Open resources](docs/resources.md) · [Catalog](docs/catalog.md) · [xAPI](docs/xapi.md) ·
[Conformance](conformance/README.md)

```sh
npx @viable-lab/harness --help
```
