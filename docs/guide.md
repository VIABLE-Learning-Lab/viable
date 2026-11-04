# Using the command lines

The reference for the command line, what a local run does, the services a host passes in, the open
formats and the measures. The [README](../README.md) is the overview; [components.md](../harness/docs/components.md),
[mcp.md](../harness/docs/mcp.md), [xapi.md](../harness/docs/xapi.md) and [step-manifests.md](../engine/docs/step-manifests.md) go deeper.

## The command line

`viable-harness --help` has every flag. `viable-engine try [package...]` opens the real pages on this
computer with what the AI did beside them; `--demo --tour` plays the scene by itself and `--export <dir>`
writes a static copy of demo mode ([try.md](../engine/docs/try.md)). `view` and `suggest` also take a folder, which stands for
every JSON file in it.

```sh
viable-engine run <agent.json | package.json | course.viable.zip> --input "..." [--teaching teaching.json]
                   [--section id] [--context context.json] [--model id] [--agent ref] [--no-teaching] [--json]
                   [--speech-model id] [--image-model id] [--media-dir dir] [--no-speech]
                   [--memory-dir dir --learner id] [--knowledge kb-id=folder...]
viable-engine serve <agent.json | package.json | course.viable.zip | folder>... [--port 8080] [--host 127.0.0.1]
                     [--token-env NAME] [--cors origin] [--max-body bytes] [--timeout seconds] [--max-runs n]
                     [--model id] [--speech-model id] [--image-model id] [--media-dir dir] [--no-speech]
                     [--memory-dir dir] [--knowledge kb-id=folder...]
viable-harness check --reply "..." [--message "..."] (--guideline "..." | --question "..." --answer-key "...")
                     [--key-concepts "a, b"] [--teaching teaching.json] [--section id] [--rewrite n]
                     --model id [--reviewer id] [--json]
viable-engine test <agent.json | package.json> <cases.json> --judge-model id [--model id] [--agent ref]
                    [--teaching teaching.json] [--section id] [--json]
viable-harness draft-tests <package.json | teaching.json> --model id [--count n] [--section id] [--out cases.json]
viable-harness tests-from-records <record.json...> [--teaching teaching.json | package.json] [--count n] [--out cases.json]
viable-harness calibrate <results.json> <labels.json> [--json]
viable-harness validate <file> [--kind agent|course-package|learning-events|teaching|component]
viable-harness measure <events.json>
viable-harness misconceptions "<a few words, or a standard's text>" [--json]
viable-harness catalog [words...] [--kind kind] [--slot slot] [--open] [--connected] [--json]
viable-harness resources [list | get <id> | use <id>] [--accept-license] [--dir folder] [--json]
viable-engine inspect <package> [--json]
viable-engine deploy <node|docker|cloudflare|aws-lambda|cloud-run|firebase> <package> --out <dir>
viable-engine verify <url> [--token-env NAME] [--turn] [--json]
viable-harness gateway --upstream <url> [--teaching file] [--reviewer-model id] [--data-dir dir]
viable-engine knowledge refresh <package> --out <folder>
viable-engine records export --data-dir <dir>
viable-engine forget <learner> --data-dir <dir>
viable-harness components [--json]
viable-harness component <manifest.json> --input payload.json [--json]
viable-harness suggest <record.json | run.json | package.json...> [--teaching teaching.json] [--json]
viable-harness view <record.json | run.json | package.json...> [--teaching teaching.json] [--out report.html]
viable-harness xapi <events.json> --home-page url [--activity-base url] [--include-text]
viable-harness conformance [suite]
viable-harness mcp
```

(`node bin/viable-harness.mjs` until the package is published; `npm link` puts `viable-harness` on
your path.)

- **run**: a `.viable.zip` (a course downloaded with its files) runs as it is: its files are read from
  the archive, which is never unpacked. `--knowledge <id>=<folder>` searches a folder's text files as
  the knowledge base an agent file names by that ID (a package's by its ref). From a course package, the first agent (or `--agent <ref>`) with the teaching settings of
  the first activity that uses it. `--teaching` replaces them with a file
  (`schemas/teaching.schema.json`), `--section` applies a section's own help level and note,
  `--no-teaching` runs without any. With `--context` holding `{ "question": "...", "answer_key": "..." }`,
  VETTING reviews against the answer key. Speech and Image steps save their audio and pictures in
  `--media-dir` (`--audio-dir` still works; default: a new folder in the system's temp folder), and
  the steps list prints each file's path. `--speech-model` and `--image-model` replace every speech
  and image model, and `--no-speech` lets Speech steps pass on without reading aloud. With
  `--memory-dir <dir> --learner <id>` (a pseudonymous ID, never a name), Memory steps and an Agent
  step's memory tools keep what they save in `<dir>/<id>.json`; delete it to forget the learner.
  Without them, Memory steps are skipped.
- **check**: VETTING on one reply your own app wrote, against a guideline or a question's answer key
  and the activity's teaching settings; `--rewrite n` lets the reply model rewrite a failed reply up
  to n times. The exit code is 1 unless the reply passed.
- **test**: each case in a file of agent tests (`viable.agent-tests`) through the agent, the reply
  rated pass or fail with a reason by `--judge-model`.
- **validate**: the open formats' schemas, then the engine's own graph checks and that a package's
  refs resolve. Model names aren't checked: a local run sends them to your endpoint.
- **measure**: the research export's learner measures from a list of learning events and turns.
- **misconceptions** and **components**: Eedi's misconceptions for a goal or a standard's text, with
  their attribution; the component manifests.
- **serve**: answers apps over HTTP as VIABLE answers their agent runs: `POST /v1/agents/<slug>/runs`
  with the same fields, reading a run back, `GET /v1/agents` and `GET /health`. An agent file answers
  at its file's name, a package's agents at their slugs from VIABLE (else their refs). Without
  `--token-env` it serves only this machine. It logs one JSON line per run, without what the learner
  wrote ([self-hosting.md](../engine/docs/self-hosting.md)).
- **suggest**: suggested changes to How the AI helps from learner records and runs (below).
- **view**: the teacher's page (below) from learner records and `run --json` traces, each file
  recognized by its shape; a course package supplies its first activity's teaching settings, and
  `--teaching` replaces them. It prints the page, or writes it to `--out`.

## What runs locally

| Steps | In a local run |
| --- | --- |
| Input, LLM, Condition, Router, Agent, VETTING, Guardrail, Transform, State, Loop, For each, Parallel, Ask, Reply (output), Note | Run as on VIABLE. An Agent step's memory tools work as Memory steps do; in a course package it searches the package's knowledge bases (`search_knowledge`, not browsing or reading whole documents) and calls its other agents. |
| Fetch URL (http) | Reads JSON, text and HTML pages, which become Markdown (headings, paragraphs, lists, links, images, table rows) without scripts, styles or site chrome. |
| Knowledge | In a course package (a folder or its `.viable.zip`), and in folders mapped with `--knowledge` to an agent file's knowledge bases: searches their files by keywords (BM25, Chinese and Japanese by character pairs), as VIABLE searches a keyword-only knowledge base, with sources the Reply cites. Files are text, Markdown, CSV, JSON or HTML, by `path` in the package's folder or zip or downloaded from their `url`, and must match their `bytes` and `sha256`. A PDF or Office file is searched through the text VIABLE packaged with it (`text_path`). A website, a file without that text, or an agent file's knowledge base without a folder fails with a message saying so. |
| Sub-agent | In a course package: another of its agents, by its ref or its name as a slug, run as VIABLE runs a sub-agent (the message only, without the activity's teaching settings, within the run's budgets, two levels deep). Any other agent fails with a message saying so. |
| Speech | Calls your endpoint's `/audio/speech` (OpenAI's shape) and saves the audio to a file. A Kokoro voice (`af_heart`) goes as it is to a Kokoro model, else as OpenAI's `nova` (female) or `onyx` (male). |
| Memory | With `--memory-dir` and `--learner`: one JSON file per learner in that folder, holding each fact, its id and when it was saved, recalled by keywords. Skipped otherwise, with its reason in the trace. |
| Transcribe | Skipped: a local run sends no recording. |
| Image | Calls your endpoint's `/images/generations`, or `/images/edits` for a step that changes a picture, and saves each picture to a file. Its prompt (the learner's and the models' text, as the step writes it) goes to that endpoint. A refusal by the endpoint's safety system is marked blocked, as on VIABLE. Pictures saved as files aren't kept by number for later turns. |

## Serving it

`serve` is for one machine. For a cloud, `inspect` says what a package needs, `deploy <target>` writes a folder
ready to deploy, and `verify` checks it from outside ([self-hosting.md](../engine/docs/self-hosting.md)). In code,
`createHandler({ agents, runtime, store, options, routes })` is a function from a web Request to a Response, and
`createApp({ bytes, vars, store, models })` builds one from a package's bytes. `serve --panel` adds the panel to
your own server, for the token holder, on a page asked for with `?panel=1`. `test ... --html` shows results as a page.

### Learners' pages

A package carries each agent's look and chat page settings, and `serve` hosts them: `/chat/<agent>`, `/embed.js`,
`/course/<course>`, and `/teacher` and `/console` behind the token (with none set, one made at start and printed once). Limits and
allowed sites are enforced. A learner is who the course says: a browser with a code they can re-enter, a personal code from its
class list, or a name they type; or whoever has a class code (`--class-code-env`), or who a proxy says (`--learner-header`). The
console sets up models, courses, class lists, chat pages and knowledge in the browser. `viable-engine records export` gives `view`
and `suggest` what the server kept, and `viable-engine forget <code>` removes one learner. Studies and consent stay on VIABLE
([learner-pages.md](../engine/docs/learner-pages.md)).

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
shapes `src/agents/engine.js` calls. A local run brings its own for models
(`openAICompatible({ baseUrl, apiKey, model, fetch })`), speech and pictures (`openAISpeech({ baseUrl, apiKey,
model, fetch, save })` and `openAIImages({ baseUrl, apiKey, model, fetch, save })`, saving with
`mediaFiles(dir)`), memory when asked for (`memoryFiles(dir)` in `src/memory.js`), HTML pages (`toMarkdown` in `src/markdown.js`)
and, for a course package, its knowledge and agents (`packageKnowledge(pkg, { dir, fetch })` in
`src/knowledge.js`, `packageAgents(pkg)`); yours replace them, and `null` turns one off, so its steps
fail as without it. Without `models` (a model catalog), every model gets a 128,000-token
window, `max_tokens` and JSON mode. A step whose service is missing fails with a message saying so.
Budgets follow the agent's own `run_limits`; without them a local run gets 20 model calls and 5
minutes. The harness doesn't price calls: cost is always 0.

## In another harness or assistant

For a host that keeps its own harness, assistant or agent SDK:

- **An MCP server.** `viable-harness mcp` serves its tools over stdio: `check_reply`,
  `teaching_instructions`, `find_misconceptions`, `compute_measures`, `validate_document`,
  `run_agent`, `run_agent_tests`, `draft_tests`, `calibrate_judge`, `suggest_changes`,
  `list_components` and `find_public_goods`. A client starts it as
  `node /path/to/viable-harness/bin/viable-harness.mjs mcp`, with `OPENAI_BASE_URL` and
  `OPENAI_API_KEY` for the tools that call models. The host decides whether a reply is checked and
  what is kept; only an agent the harness runs is guaranteed its VETTING steps
  ([mcp.md](../harness/docs/mcp.md)). In an assistant that renders MCP Apps, `check_reply`, `run_agent_tests` and
  `suggest_changes` also show their result as a small page: each VETTING round with the reviewer's
  reason, each test case with the judge's reason, each suggestion with its evidence. Other
  assistants get the same text as before ([mcp.md](../harness/docs/mcp.md#views-in-assistants-that-show-mcp-apps)).
- **The hosted MCP server.** `https://api.viablelab.org/mcp` serves the tools that need no local files, with
  nothing to install: with no key, standards, misconceptions, teaching instructions, public goods, validation and
  components; with a VIABLE API key, also `check_reply` and a project's published agents
  ([mcp.md](../harness/docs/mcp.md#hosted-or-local)).
- **The gateway** (`viable-harness gateway`, `gatewayHandler`): an OpenAI-compatible endpoint in front of any
  other. It adds How the AI helps, holds a reply until VETTING passes it, and keeps records `view` and `suggest`
  read. `/v1/check`, `/v1/teaching/instructions` and `/v1/misconceptions` answer over plain HTTP
  ([with-your-stack.md](../harness/docs/with-your-stack.md)).
- **Agent Skills.** `skills/` holds five, a folder with a `SKILL.md` each, for assistants that load
  skills: `writing-how-the-ai-helps`, `checking-replies-with-vetting`, `writing-agent-tests` and
  `reading-learning-evidence`. Each uses the tools and commands above; copy a folder to where your
  assistant reads skills from.

## The open formats

JSON Schema (draft 2020-12) in `schemas/`, each with an example and published at its `$id`,
`https://developers.viablelab.org/schemas/<name>.schema.json`:

| Schema | What | Example |
| --- | --- | --- |
| `agent.schema.json` | An exported agent (`.agent.json`, format `viable.agent`): its graph, profile and what it requires | `schemas/examples/agent.example.json` |
| `course-package.schema.json` | A course with its agents and question sets (`viable.course-package`) | the six files in `examples/` |
| `learning-events.schema.json` | One learner's events and turns | `schemas/examples/learning-events.example.json` |
| `teaching.schema.json` | An activity's teaching settings, with its standard or skill, misconceptions and sections | `schemas/examples/teaching.example.json` |
| `component.schema.json` | A component's manifest: its slot, the learner data it receives and the hosts it calls, its license, citation and evidence | `src/components/` |

`schemas/steps.json` describes each step type an agent graph can use: its settings (with their
tips, defaults and bounds), outputs, flow and the plain-language sentence VIABLE's editor shows. It is
written from the step manifests in `src/agents/steps/` by `npm run steps:build`, never by hand
([step-manifests.md](../engine/docs/step-manifests.md)).

**A package with no course.** `course` is optional in `viable.course-package`. With none, the package is one or more agents with their knowledge and chat pages. `inspect`, `serve`, `run`, `deploy`, `validate` and `knowledge refresh` all read it. Importing it on VIABLE makes the agents and knowledge bases, and no course.

## The measures

`measureLearner({ events, turns })` returns the research export's learner metrics (messages,
sessions, think time, revision, pasting, accuracy, mastery, wheel-spinning, ...), mastery per skill,
and how the learner wrote in each writing panel. Each metric's definition, computation, rationale,
caveats and sources are exported as `METRICS`, `WRITING`, `PANELS` and `CITATIONS`, from the same
file VIABLE's export and dashboard use (`src/utils/researchMetrics.js`).

## The teacher view

`viable-harness view` (or `teacherView({ teaching, records, runs, title, suggestions })`) makes one HTML page for a
teacher who doesn't read JSON. It opens on what happened, in sentences and a row of marks, one group for each reply
reviewed and one mark for each round. Then come How the AI helps as it was set, with each section's own level and
note; what VETTING did, with every reply that was sent back as a marked-up draft (the draft struck, the reviewer's
reason beside it, the rewrite); each learner's measures, by the ID their record carries, as a row of ticks and
crosses and small bars, with every measure and its definition and caveats a click away; misconceptions heard, most
learners first, with who said them; and, when given, suggested changes as its conclusion, with their evidence and
what to do next, for the teacher to decide on. It is self-contained (no scripts, its fonts inlined, nothing loaded
from the internet), escapes everything learners and models wrote, works in dark mode and on a phone, and prints with
every section open.

```sh
node bin/viable-harness.mjs view learner-*.json run-*.json examples/fractions-practice.json --out class.html
```

What the page shares with the MCP views is written once in `src/ui/`. `theme.js` holds the tokens, under the names
and light values of VIABLE's portal's stylesheet, with the fonts, the mark and the base components. `parts.js` holds a VETTING
round, a test case and a suggestion as pure functions returning a tree, which `treeHtml` writes on a server and
`treeDom` builds in a browser. A served page uses `themeCss({ fonts: 'url' })` and adds `fontRoutes()` to the
server's routes.

## Suggested changes

The loop's fourth step: `viable-harness suggest <records and runs...>` (or `suggestChanges({ teaching,
runs, records })`) proposes changes to How the AI helps from the evidence, each with the evidence
beside it, and the teacher view shows them. Rules, no model, so each one says exactly why:

| Rule | When | Proposes |
| --- | --- | --- |
| Answers given away | at least 30% of 5 or more reviewed replies failed their first VETTING review for giving too much away | one step less help (from explain to hint, ...) |
| Replies unverified | at least 20% of 5 or more replies never passed review | nothing: the teacher reads those replies |
| Misconception heard | a misconception named in the records of 3 or more learners isn't listened for | adding it, with the construct it hinders |
| Stuck on a skill | at least 40% of the learners who answered a skill, and 3 or more, are wheel-spinning on it | one step more help, for their section when they share one |

A run's `label`, when it has one, names it in the evidence (a host that keeps its runs names them
its own way); otherwise it is "Run 1", "Run 2" in the order given. `applySuggestion(teaching,
suggestion)` gives the settings with one accepted; on VIABLE, accepted settings become the
activity's next version. A suggestion describes what the records show and what
to try; it never says what learners learned, and the thresholds are first values to revisit with
teachers (`SUGGESTION_THRESHOLDS`).

## Components

Other teams' work joins the harness as a component in one of six slots, with a manifest saying what
learner data it receives, where it sends it, its license, citation and evidence
([components.md](../harness/docs/components.md); each built-in component has a page in `docs/components/`). A
component that runs out of process, as an HTTP endpoint or a stdio MCP server, is called with
`callComponent(manifest, payload)` or `viable-harness component <manifest.json> --input
payload.json`. The harness sends only the fields `receives` lists, calls an HTTP entry only on a host
in `sends_to`, and stops at a timeout or an oversized answer; what an MCP server does on its own
machine it can't control. Those are for a manifest you point at yourself: a component step in a document
calls only public http components unless you name it (`--allow-component <id>`). A judge component rates agent tests (`runAgentTests(doc, cases, {
judgeComponent })`), and `detect`, `measure` and `lookup` call a detector, a measure or a context
component. A graph runs a step component as a Component step: its manifest held in the step, `inputs`
mapping each field it receives to a template, its answer `{ output, flags }` read as `{{id.output}}`
and `{{id.flags}}`, and `on_error: continue` to go on without it when it is refused, times out or
answers out of shape ([components.md](../harness/docs/components.md#a-step-in-a-graph)). Start one from
`integrations/_template/`.

## The public goods catalog

[catalog.md](../harness/docs/catalog.md) lists open datasets, benchmarks, knowledge graphs, standards, evaluators,
models, tools, open content and learning data repositories for K-12 AI, one file each in `catalog/`
(`schemas/catalog-entry.schema.json`), each with its license and a note on gated, non-commercial,
mixed or conflicting terms, how to get it, whether it is released, the slot it would fill and the
date it was checked. `searchCatalog(query, { kind, slot, open, connected })`, `viable-harness catalog` and the
MCP tool `find_public_goods` search it with no network; `open` keeps what anyone may download and
use, commercially too. Entries describe, not endorse; listing is not joining the harness (that is a
component).

Each entry says how far it is connected: listed, fetchable, one command from an effect, or built in. `viable-harness
resources` fetches a good from its makers, on their terms, and turns it into what the harness runs: `test --suite`,
`test --judge`, `calibrate --set`, `--knowledge <id>=resource:<resource>`, a standards search or a measure
([resources.md](../harness/docs/resources.md)).

## Agent tests

The loop's fifth step: cases written from the teacher's intent, run again after every change.
`viable-harness draft-tests <package.json | teaching.json> --model <id>` (or `draftCases`, or the
`draft_tests` MCP tool) has a model draft cases from How the AI helps (asking for the answer, a
listed misconception, a section's own level, distress, unsafe and off-topic requests), each checked
like a saved case, with malformed drafts listed and the reason; a person reads every draft before it
runs. `viable-harness tests-from-records <record.json...>` (`casesFromTurns`) takes cases from
learners' past turns without a model, with the rubric from the teaching settings; reusing learners'
words needs their consent. `viable-harness test` runs the cases and a judge model rates each reply;
`viable-harness calibrate <results.json> <labels.json>` (`calibrateJudge`, `calibrate_judge`)
compares its verdicts with a person's, with agreement and Cohen's kappa from 10 labelled cases. A
verdict is one model's reading of one reply, never a learning result
([agent-tests.md](../harness/docs/agent-tests.md)).

## Conformance and xAPI

`conformance/` holds language-neutral JSON fixtures: documents in each format, graphs, expressions,
teaching settings, VETTING's reviewer outputs and prompts, and learning records, each with what the
harness does with it. Another implementation, such as a port of VETTING or an engine that reads
VIABLE's formats, runs the same cases to show it agrees; the fixtures decide when two disagree
([conformance/README.md](../harness/conformance/README.md)). `npm test` runs them against the harness,
`viable-harness conformance [suite]` prints pass or FAIL per case (exit code 1 on a failure), and
`runConformance()` runs them from code.

`toStatements(record, { homePage })` turns one learner's events and turns into xAPI 1.0.3 statements
for a school's learning record store: the learner as a pseudonymous account, ADL verbs where one fits,
ids that stay the same when a record is exported again, and no learner text or AI reply unless
`includeText` is set. `viable-harness xapi <events.json> --home-page <url> [--activity-base <url>]
[--include-text]` prints them. The deployer posts them to the LRS; the harness sends nothing
([xapi.md](../harness/docs/xapi.md)). The vocabulary is also an xAPI Profile in JSON-LD (`schemas/xapi-profile.jsonld`, written by
`npm run xapi:build`), published at `https://developers.viablelab.org/xapi`, which answers every
verb, activity type and extension IRI under it.

## The examples

`examples/` holds six course packages: fractions practice, a PDF reading with a Socratic tutor,
argument writing, English speaking practice, a density lab on an embedded page, and a library
research desk. All six run locally as they are (`test/examples.test.js` runs each on a scripted
endpoint): the library desk downloads its four guides and answers from them with citations, and the
English partner's reply is read aloud on your endpoint's `/audio/speech`; its Transcribe step is
skipped, since a local run sends typed text, not a recording. On VIABLE the reading tutor and the
density lab coach also see what the learner has open (the page and highlights, the lab's trials); a
local run gives them only what you pass with `--context`.

## How it relates to the VIABLE Developer Platform

The [VIABLE Developer Platform](https://developers.viablelab.org) runs this same engine, teaching
layer and measures, and adds what running it for many projects takes: accounts, a visual workflow editor,
studies with consent, coding and the research export; learners open its
activities on the [VIABLE Learning Platform](https://viablelearning.org). It passes its own services
(model calls on its provider keys, media, billing fields, its model catalog) and runs exactly the code
in this repository.
