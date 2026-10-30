# VIABLE harness kit

VIABLE's teaching harness without VIABLE's hosted service, on your own model keys: the agent engine
with VETTING, How the AI helps (the teacher's goal, a K-12 standard or durable skill, how far the AI
may go), the open formats as JSON Schema, and the research export's measures. MIT-licensed code; the
standards and skills data it carries stay under CC BY 4.0 (see `NOTICE`).

Version 0.1.0, not published. It lives in the `viablelab-api` repository and imports VIABLE's own
modules from `../src`, so a local run and a course run use the same code. `scripts/export.mjs`
makes the self-contained folder a release would ship (below). Releasing it needs the University of
Florida's approval ([docs/harness-call.md](../docs/harness-call.md)).

## Use it without installing anything

Node 22 or later. There is no `npm install`: from a `viablelab-api` checkout (which has its
dependencies installed), run the CLI with `node` (in an exported folder, drop the `kit/` prefix):

```sh
node kit/bin/viable-harness.mjs run <agent.json | package.json> --input "..." [--teaching teaching.json] [--section id] [--context context.json] [--model id] [--agent ref] [--no-teaching] [--json]
node kit/bin/viable-harness.mjs validate <file> [--kind agent|course-package|learning-events|teaching]
node kit/bin/viable-harness.mjs measure <events.json>
```

`run` calls any OpenAI-compatible `/chat/completions` endpoint: `OPENAI_BASE_URL` (default
`https://api.openai.com/v1`) and `OPENAI_API_KEY`. Without `--model`, VIABLE's model names are sent as
their provider's model (`viable-3` becomes `gpt-6-luna`), which suits OpenAI; anywhere else, `--model`
names the model to use for every step. A local run sends nothing to VIABLE: the learner's message,
the agent's instructions and any context go to the endpoint you chose, and nowhere else.

## Five minutes: an example's agent on your own key

The four examples in `examples/` are the course packages VIABLE's docs offer (argument writing,
fractions practice, library research, a seminar discussion). Run commands from the `viablelab-api`
folder.

1. **Point it at a model.** With OpenAI:

   ```sh
   export OPENAI_API_KEY=sk-...
   ```

   Or an open-weight model on your machine, for example with Ollama (`ollama pull llama3.1`):

   ```sh
   export OPENAI_BASE_URL=http://localhost:11434/v1   # and add --model llama3.1 to the commands below
   ```

2. **Run the argument-writing coach.**

   ```sh
   node kit/bin/viable-harness.mjs run kit/examples/argument-writing.json \
     --input "Is my claim clear? Schools should start later because teenagers need sleep."
   ```

   From a package, the kit runs its first agent (or `--agent <ref>`) with the teaching settings of the
   first activity that uses it: here, the teacher's goal and "only check the learner's own work". It
   prints the reply, then each step with its status, time, model and tokens.

3. **Change how the AI helps.** Write a `teaching.json` (format: `schemas/teaching.schema.json`):

   ```json
   { "goal": "Students make their claim specific and arguable.", "help": "hint" }
   ```

   and run again with `--teaching teaching.json`. The goal, standard, misconceptions to listen for
   and help level join the reply step's instructions, as in a course; `watch_for` never reaches the
   AI. A section's own help level and note (`sections`) apply with `--section <id>`. `--no-teaching`
   runs the agent without any. `schemas/examples/teaching.example.json` keeps a durable skill (Carnegie Skills
   Progressions) as an activity keeps it.

4. **See VETTING at work.** The fractions tutor drafts each reply and has a second model review it,
   retrying when the review fails:

   ```sh
   node kit/bin/viable-harness.mjs run kit/examples/fractions-practice.json --input "What is 1/2 + 1/3?"
   ```

   Under the VETTING step, each round shows its verdict and the reviewer's reason. With
   `--context context.json` holding `{ "question": "What is 1/2 + 1/3?", "answer_key": "5/6" }`, the
   tutor reviews against the answer key instead, as when a Questions panel is open.

5. **Check a file and compute measures.**

   ```sh
   node kit/bin/viable-harness.mjs validate kit/examples/seminar-discussion.json
   node kit/bin/viable-harness.mjs measure kit/schemas/examples/learning-events.example.json
   ```

## What runs locally, and what needs VIABLE

| Steps | In a local run |
| --- | --- |
| Input, LLM, Condition, Router, Agent, VETTING, Guardrail, Transform, State, Loop, Parallel, Ask, Reply (output), Note | Run as on VIABLE. An Agent step loses its tools for knowledge bases, memory and sub-agents; its Fetch URL tool works as the step below. |
| Fetch URL (http) | Reads JSON and plain text. An HTML page fails: VIABLE turns pages into Markdown with Workers AI, which a local run doesn't have (pass a `toMarkdown` service to add it). |
| Memory | Skipped, with its reason in the trace: there is no memory store. |
| Transcribe | Skipped: a local run sends no recording. |
| Knowledge, Sub-agent, Image, Speech | Fail with a message saying the step needs VIABLE: knowledge bases, published agents, image and speech generation live there. |

The engine takes its services as arguments, so code can supply the missing ones: `runAgent(doc, {
services: { searchKnowledge, memory, resolveSubAgent, generateImage, toMarkdown } })` with the shapes
`src/agents/engine.js` calls. Budgets follow the agent's own `run_limits`; without them a local run
gets 20 model calls and 5 minutes (VIABLE gives a turn 60 seconds), since local models are often
slower. The kit doesn't price calls: cost is always 0.

## From code

```js
import { runAgent, validateDocument, measureLearner, teachingContext, SKILLS } from './kit/src/index.js';

const result = await runAgent(agentFile, { input: 'Help me start', teaching, model: 'llama3.1', baseUrl: 'http://localhost:11434/v1' });
result.output.text;   // the reply
result.steps;         // the trace, VETTING rounds in each review step's output.attempt_details
```

`openAICompatible({ baseUrl, apiKey, model, fetch })` is the model service on its own; pass your own
`callChatModel` in `services` to use any other client.

## The open formats

JSON Schema (draft 2020-12) in `schemas/`, each with an example:

| Schema | What | Example |
| --- | --- | --- |
| `agent.schema.json` | An exported agent (`.agent.json`, format `viable.agent`): its graph, profile and what it requires | `schemas/examples/agent.example.json` |
| `course-package.schema.json` | A course with its agents and question sets (`viable.course-package`) | the four files in `examples/` |
| `learning-events.schema.json` | One learner's events (what `POST /v1/learning/events` takes) and turns | `schemas/examples/learning-events.example.json` |
| `teaching.schema.json` | An activity's teaching settings, with its standard or skill, misconceptions and sections | `schemas/examples/teaching.example.json` |

`validate` checks the schema with a small built-in checker (no dependency), then, for agents and
packages, VIABLE's own graph checks (`validateGraph`) and that a package's refs resolve. Model names
aren't checked: a local run sends them to your endpoint.

## The measures

`measureLearner({ events, turns })` returns the research export's learner metrics (messages,
sessions, think time, revision, pasting, accuracy, mastery, wheel-spinning, ...), mastery per skill,
and how the learner wrote in each writing panel. Each metric's definition, computation, rationale,
caveats and sources are exported as `METRICS`, `WRITING`, `PANELS` and `CITATIONS`, from the same file
VIABLE's export and dashboard use (`src/utils/researchMetrics.js`). Graded attempts are graded
Questions answers and the answers an agent graded (a turn's `assessment`); unlike VIABLE, the kit
can't tell a pre- or post-test's answers apart, so leave them out yourself.

## How it relates to the hosted VIABLE

The hosted VIABLE (viablelab.org) runs this same engine, teaching layer and measures, and adds what
a classroom needs on a server: accounts, courses, class lists, sections, knowledge bases, studies with
consent, coding and the research export. The plan is for it to be the teacher-facing demo app and one
user of the kit, with the kit the harness that other apps build on. Today the dependency runs the
other way: the kit imports VIABLE's modules.

## Getting it out

```sh
node kit/scripts/export.mjs [out-dir]   # default kit/kit-dist (gitignored)
```

copies the kit, exactly the `src/` modules its imports reach (into `lib/`, imports rewritten) and the
npm packages they need (hono, MIT; entities, BSD-2-Clause) into a folder that runs and passes its
tests on its own. It lists each module and flags those that touch D1, secrets, billing or
Worker-only APIs. Those flags are the work left before a release: the engine reaches VIABLE's model
router, provider keys and billing, request logging and the VETTING routes, and should take them as
injected services instead of importing them.

## License

MIT (`LICENSE`). Data under CC BY 4.0, with the attribution statements to keep with it: `NOTICE`.
