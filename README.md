# VIABLE harness

The open core of [VIABLE](https://viablelab.org): the layer between AI models and learners that turns
what a teacher intends into what the AI does with each learner, and keeps the evidence.

- **The teacher's intent reaches the AI on every turn.** How the AI helps (a goal, a K-12 standard or
  durable skill, how far the AI may go, misconceptions to listen for, a section's own level and note)
  becomes part of the instructions of every step that writes a reply.
- **A second model checks each reply before the learner sees it.** VETTING (Li, Zhang & Botelho,
  2026) keeps the reviewer's rules apart from the reply model, so a learner can't talk the reviewer
  out of them; a failed review rewrites the draft, and a reply that can't be verified is flagged.
- **The evidence is tied to the version that produced it**, and the research measures over it are
  defined in the open, with their caveats and sources.

It runs agent files and course packages on your own model keys or an open-weight model. VIABLE's
hosted platform runs the same code for teachers and researchers who don't write code, and is never a
dependency.

**Status: 0.2.0, private.** The code is MIT-licensed and will be public once the University of
Florida approves its release; until then this repository is the lab's.

## Quick start

Node 22 or later.

```sh
git clone https://github.com/VIABLE-Learning-Lab/viable-harness.git
cd viable-harness
npm install
export OPENAI_API_KEY=sk-...
node bin/viable-harness.mjs run examples/fractions-practice.json --input "What is 1/2 + 1/3?"
```

The fractions tutor drafts a reply and a second model reviews it; under the VETTING step the trace
shows each round's verdict and the reviewer's reason. With an open-weight model instead, for example
Ollama (`ollama pull llama3.1`):

```sh
export OPENAI_BASE_URL=http://localhost:11434/v1
node bin/viable-harness.mjs run examples/argument-writing.json --model llama3.1 \
  --input "Is my claim clear? Schools should start later because teenagers need sleep."
```

`run` calls any OpenAI-compatible `/chat/completions` endpoint (`OPENAI_BASE_URL`, default
`https://api.openai.com/v1`, and `OPENAI_API_KEY`). `--model` replaces every model the agent names. A
local run sends nothing to VIABLE: the learner's message, the agent's instructions and any context
go to the endpoint you chose, and nowhere else.

## The command line

```sh
viable-harness run <agent.json | package.json> --input "..." [--teaching teaching.json] [--section id]
                   [--context context.json] [--model id] [--agent ref] [--no-teaching] [--json]
viable-harness validate <file> [--kind agent|course-package|learning-events|teaching]
viable-harness measure <events.json>
```

(`node bin/viable-harness.mjs` until the package is published; `npm link` puts `viable-harness` on
your path.)

- **run**: from a course package, the first agent (or `--agent <ref>`) with the teaching settings of
  the first activity that uses it. `--teaching` replaces them with a file
  (`schemas/teaching.schema.json`), `--section` applies a section's own help level and note,
  `--no-teaching` runs without any. With `--context` holding `{ "question": "...", "answer_key": "..." }`,
  VETTING reviews against the answer key.
- **validate**: the open formats' schemas, then the engine's own graph checks and that a package's
  refs resolve. Model names aren't checked: a local run sends them to your endpoint.
- **measure**: the research export's learner measures from a list of learning events and turns.

## What runs locally

| Steps | In a local run |
| --- | --- |
| Input, LLM, Condition, Router, Agent, VETTING, Guardrail, Transform, State, Loop, Parallel, Ask, Reply (output), Note | Run as on VIABLE. An Agent step loses its tools for knowledge bases, memory and sub-agents; its Fetch URL tool works as the step below. |
| Fetch URL (http) | Reads JSON and plain text. An HTML page needs a `toMarkdown` service. |
| Memory | Skipped, with its reason in the trace: there is no memory store. |
| Transcribe | Skipped: a local run sends no recording. |
| Knowledge, Sub-agent, Image, Speech | Fail with a message saying the step needs a service a local run doesn't have. |

## From code

```js
import { runAgent, validateDocument, measureLearner, teachingContext, SKILLS } from '@viable-lab/harness';

const result = await runAgent(agentFile, { input: 'Help me start', teaching, model: 'llama3.1', baseUrl: 'http://localhost:11434/v1' });
result.output.text;   // the reply
result.steps;         // the trace, VETTING rounds in each review step's output.attempt_details
```

### Services

The engine takes whatever only a host has as services, so a host decides where models, knowledge,
memory and media come from: `runAgent(doc, { services: { callChatModel, searchKnowledge, memory,
resolveSubAgent, generateImage, generateSpeech, transcribeAudio, toMarkdown, models } })`, with the
shapes `src/agents/engine.js` calls. `openAICompatible({ baseUrl, apiKey, model, fetch })` is the
model service on its own. Without `models` (a model catalog), every model gets a 128,000-token
window, `max_tokens` and JSON mode. A step whose service is missing fails with a message saying so.
Budgets follow the agent's own `run_limits`; without them a local run gets 20 model calls and 5
minutes. The harness doesn't price calls: cost is always 0.

## The open formats

JSON Schema (draft 2020-12) in `schemas/`, each with an example:

| Schema | What | Example |
| --- | --- | --- |
| `agent.schema.json` | An exported agent (`.agent.json`, format `viable.agent`): its graph, profile and what it requires | `schemas/examples/agent.example.json` |
| `course-package.schema.json` | A course with its agents and question sets (`viable.course-package`) | the six files in `examples/` |
| `learning-events.schema.json` | One learner's events and turns | `schemas/examples/learning-events.example.json` |
| `teaching.schema.json` | An activity's teaching settings, with its standard or skill, misconceptions and sections | `schemas/examples/teaching.example.json` |

`schemas/steps.json` describes each step type an agent graph can use: its settings (with their
tips, defaults and bounds), outputs, flow and the plain-language sentence VIABLE's editor shows. It is
written from the step manifests in `src/agents/steps/` by `npm run steps:build`, never by hand
([docs/step-manifests.md](docs/step-manifests.md)).

## The measures

`measureLearner({ events, turns })` returns the research export's learner metrics (messages,
sessions, think time, revision, pasting, accuracy, mastery, wheel-spinning, ...), mastery per skill,
and how the learner wrote in each writing panel. Each metric's definition, computation, rationale,
caveats and sources are exported as `METRICS`, `WRITING`, `PANELS` and `CITATIONS`, from the same
file VIABLE's export and dashboard use (`src/utils/researchMetrics.js`).

## The examples

`examples/` holds six course packages: fractions practice, a PDF reading with a Socratic tutor,
argument writing, English speaking practice, a density lab on an embedded page, and a library
research desk. Four run locally as they are; the English partner's Speech step and the library
desk's Knowledge step need services a local run doesn't have yet.

## How it relates to the hosted VIABLE

The hosted VIABLE runs this same engine, teaching layer and measures, and adds what a classroom needs
on a server: accounts, courses, class lists, sections, knowledge bases, studies with consent, coding
and the research export. It passes its own services (model calls on its provider keys, media,
billing fields, its model catalog), and takes each release of this repository as it is: it never
changes the core in place.

## Developing

```sh
npm test              # the tests, including the boundary test
npm run steps:build   # after changing a step manifest
```

`test/boundary.test.js` keeps the harness standing alone: its code imports only Node's built-ins,
its own files and the npm packages it lists, each under MIT or Apache-2.0 (with `entities`,
BSD-2-Clause, the one exception), and touches no database, secret or Worker-only API.

## License

Code under MIT (`LICENSE`). The data it carries (Learning Commons Knowledge Graph standards, the
Carnegie Skills Progressions and Eedi's Misconceptions Graph) stays under CC BY 4.0, with the
attribution statements to keep with it in `NOTICE`.
