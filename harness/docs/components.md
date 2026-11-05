# Components

> Commands here say `viable-harness`. Until it is on npm, use `npx github:VIABLE-Learning-Lab/viable` in its place: it takes every command.

You have research: a framework, a list of misconceptions, a classifier, a way to rate replies. A component is how it reaches
the AIs people are using, with your name on it, without each of them building it in.

## What you have, and what you do

| You have | Its slot | What you write | What happens then |
| --- | --- | --- | --- |
| Guidance, a framework, moves, a list of what goes wrong | `context` | One JSON file. No server, and no learner's data reaches you | Someone adds pieces to an activity, on a screen or from a file, and each turn takes those that fit the moment, with your name beside them |
| A method that writes or checks a reply | `step` | A manifest, and an address or an MCP tool that runs it | A builder puts it in a workflow as a Component step, on the VIABLE Developer Platform or the Engine |
| A way to rate replies | `judge` | The same | Agent tests rate replies with it, and say so in the result |
| A method that reads what happened | `detector` or `measure` | The same | `detect` and `measure` return its marks and numbers, from code or `viable-harness measure --component`. On the Engine, a teacher adds a detector on What to look at and runs it there, and its marks show beside the class |
| A dataset or a benchmark | None: an entry in the [catalog](catalog.md), and a connector | An entry | `viable-engine test --suite` runs it against an agent |

## A context component in five minutes

```sh
viable-harness component new your-lab/your-framework
```

That makes a folder from [the template](../integrations/_template-context/). Write your guidance in its `manifest.json`, a
sentence or two each, saying which moments each is for. Then see what it changes:

```sh
viable-harness component try your-framework/manifest.json --teaching activity.json --message "i got 2/5"
```

```text
What a model is told for "i got 2/5" (the moment read: attempt)

Without your-lab/your-framework:
  ...what the teacher decided, and the teaching move...

With it, this is added, 2 of its 4 items:
  - Before correcting a wrong answer, ask the learner to say how they got it. (Your framework)
  - With unlike denominators, ask what the two fractions need to have in common. (Your framework)
```

A teacher or a builder takes the pieces that fit one activity:

```sh
viable-harness component add your-framework/manifest.json --teaching activity.json --items 1,3
```

They go in that activity's settings as they are then, up to 20, with your citation. From there it works wherever those
settings go, since they travel with the activity: `prepare`, the gateway, the Engine and the VIABLE Developer Platform.
[How the Harness works](how-it-works.md) says how a turn chooses.

## What you get for it

- **Teachers' AIs use your work** without anyone rewriting it, on any model.
- **Your credit travels:** your citation goes with every copy, and a record says which pieces went into a reply.
- **A way to show what it does:** compare replies with and without it in agent tests, and report that apart from what your
  own studies showed.
- **A page** with what it does, what it receives, its license, its evidence and how to cite it, once it is reviewed, and how many
  replies on the VIABLE Developer Platform it went into in the last 30 days. Servers of one's own report nothing.
- **Help with the first ones.** VIABLE writes the adapter for early partners, and you review it.

Not built yet: a reviewed catalog of outside components, and a detector's marks on the VIABLE Developer Platform, where they would send
minors' data to someone else (the Engine's Progress shows them).

## The six slots

The slot says what the work does in the loop and how its value is checked; without one, a component
is an entry in a list that nobody can judge.

| Slot | What it does | How its value is checked |
| --- | --- | --- |
| context | adds knowledge to How the AI helps, or to what a step sees | agent tests with and without it |
| step | a method the graph runs | agent tests with and without it, and its own measure (answer leakage, for a checker) |
| detector | reads turns and work after the turn, and marks something for the teacher | agreement with teachers' labels on a sample |
| judge | rates replies in agent tests | agreement with people's ratings, reported with every result |
| simulated-learner | plays the learner in agent tests | which known errors it reproduces |
| measure | computes something over learning events | how it relates to an outcome, stated with its caveats |

`viable-harness components` lists what the harness carries today; `COMPONENTS` exports the same
manifests from code. Each has a page in `docs/components/` with everything its manifest says,
written by `npm run components:build` (`npm test` checks the pages are current).

| Component | Slot | Runs |
| --- | --- | --- |
| [`viable/vetting`](components/viable-vetting.md) | step | `checkReply`, and the graph's VETTING step |
| [`eedi/misconceptions-graph`](components/eedi-misconceptions-graph.md) | context | `findMisconceptions`, over the copy in `src/utils/misconceptionsData.js` |
| [`learning-commons/knowledge-graph-standards`](components/learning-commons-knowledge-graph-standards.md) | context | a standard kept in an activity's teaching settings, through `teachingContext` |
| [`carnegie/skills-progressions`](components/carnegie-skills-progressions.md) | context | `SKILLS`, the copy in `src/utils/skillsData.js` |
| [`viable/learner-measures`](components/viable-learner-measures.md) | measure | `measureLearner` |
| [`viable/reply-judge`](components/viable-reply-judge.md) | judge | `runAgentTests` |
| [`viable/scaffolding`](components/viable-scaffolding.md) | context | 10 pieces of guidance from research |
| [`viable/feedback`](components/viable-feedback.md) | context | 10 pieces of guidance from research |
| [`viable/tutoring-talk`](components/viable-tutoring-talk.md) | context | 10 pieces of guidance from research |
| [`viable/self-explanation`](components/viable-self-explanation.md) | context | 9 pieces of guidance from research |
| [`viable/worked-examples`](components/viable-worked-examples.md) | context | 10 pieces of guidance from research |
| [`viable/productive-struggle`](components/viable-productive-struggle.md) | context | 10 pieces of guidance from research |
| [`viable/retrieval-and-spacing`](components/viable-retrieval-and-spacing.md) | context | 8 pieces of guidance from research |
| [`viable/metacognition-and-motivation`](components/viable-metacognition-and-motivation.md) | context | 10 pieces of guidance from research |

## The manifest

Each component has one manifest (`src/components/` for those in this repository; a JSON file beside
an outside component's code), checked against `schemas/component.schema.json` (`viable-harness
validate manifest.json`).

| Field | What |
| --- | --- |
| `id` | `owner/name`, never reused |
| `version` | the component's own version; agents pin it |
| `slot` | one of the six above |
| `label`, `summary` | what a teacher or builder reads in a list |
| `runs` | `core` (JavaScript in this repository, with the export that runs it in `entry` and the step type, if any), `mcp` (the tool's name in `entry`, and in `server` the `command` and `args` that start the server), `http` (the endpoint's URL in `entry`) or `data` (a context component's `items`, here in the manifest: nothing runs and nothing is sent) |
| `receives` | the only learner data passed to it: `reply`, `learner_message`, `conversation`, `guideline`, `answer_key`, `reference`, `teaching_settings`, `learning_events`, `case` or `teacher_text`; never a learner's name, and no identifier beyond the pseudonymous id learning events carry |
| `sends_to` | every host it contacts itself, besides the host's own model endpoint |
| `uses_models` | whether it calls models: in the harness's process through the host's model service; out of process on its own, with that model's host in `sends_to` |
| `license` | SPDX identifiers for its code and, if any, its data |
| `authors`, `cite`, `attribution` | carried into every package that uses it |
| `evidence` | three statements kept apart on purpose: `original` (what its authors showed, and for whom), `integration` (what comparisons with and without it in the harness showed, with the runs), `unknown` (what nobody has shown yet, such as effects on learning) |
| `risk`, `risk_notes` | low, medium or high, from the checklist below |
| `maintainer` | a named person or team, and where to report issues |
| `harness` | the harness versions its fixtures pass on |
| `fixtures` | its inputs and expected outputs |

A test result never stands for a learning gain: `integration` says what the harness's comparisons
showed, and `unknown` says what nobody has shown.

## Where a component runs

In the harness's own process only if its code is in this repository, reviewed and tested like the
core. Anything else runs out of process, as an MCP server or an HTTP endpoint, and receives only
what `receives` lists; an HTTP one is called only at the hosts in `sends_to`. Work in another
language (pyBKT, VETTING's Python reference) stays in its own repository and joins out of process;
two implementations of one method share fixtures, which decide when they disagree.

## Calling one out of process

`callComponent(manifest, payload, options)` calls an `http` or `mcp` component with `payload`, an
object of the fields `receives` may name, and returns its answer as its slot reads it (below).
`viable-harness component <manifest.json> --input payload.json [--json]` does the same from the
command line, and says which fields it left out. Both are for a manifest you point at yourself. A
component step in an agent file or a package is someone else's choice, and is
[held to more](#a-component-in-a-document).

- **http**: the harness POSTs the payload as JSON to `runs.entry` and reads JSON back. The entry
  is an `https` address (`http` only on `localhost` or `127.0.0.1`) without credentials, on a host
  `sends_to` lists; a redirect isn't followed. `options.fetch` replaces the global `fetch`.
- **mcp**: the harness starts `runs.server` without a shell, in `options.dir` (default: the current
  folder; the CLI uses the manifest's folder), and speaks newline-delimited JSON-RPC 2.0 on its
  stdin and stdout: `initialize`, then `tools/call` of the tool `runs.entry` names, with the
  payload as its arguments. It reads the result's `structuredContent`, else its first text as
  JSON, and stops the server. The server's environment holds only `PATH` and `options.env`, so
  your model keys don't reach it. A request from the server (sampling, roots) gets an error: the
  harness lends a component nothing.

What the harness enforces:

| Check | Otherwise |
| --- | --- |
| The manifest fits `schemas/component.schema.json` and runs out of process | `component_refused` |
| Every field of the payload is one a component may receive; those the manifest doesn't list are left out | `component_refused` |
| An HTTP entry is on a host in `sends_to`, over https unless on this machine | `component_refused` |
| An answer within `options.timeoutMs` (default 30 s) | `component_timeout`, and an MCP server is stopped |
| At most `options.maxBytes` back (default 1 MiB; for MCP, all the server writes to stdout), as JSON, with a 2xx status or no MCP error | `component_failed` |
| The answer fits its slot's shape | `component_failed` |

`component_refused` means nothing was sent. The code is in `error.code`, and a graph's Component
step takes its When something goes wrong path on any of the three (below). The answer is data, never
instructions: the harness keeps only the fields its slot reads, and cuts their text (a judge's
reason to 600 characters, a mark's label to 120 and its evidence to 1,000, an item's text to 4,000,
a step's text output to 20,000 and a flag's label to 120 and its reason to 600).

These checks and the slots' readings are in `src/components/contract.js`, which imports no Node
built-ins: a host that bundles the engine for a server calls an HTTP component with its `callOut`
and `overHttp`, adding its own address rules (`checkEntry`). `call.js` adds the MCP transport.

What it can't enforce:

- What an MCP server does on its own, once you have named it. It runs on your machine with your user's
  rights, so it can read your files and reach hosts its `sends_to` doesn't list. Run servers you've
  reviewed, or in a container.
- What an HTTP component does with a payload once it has it: keep it, or pass it on. `sends_to`,
  `risk` and the review checklist say what it may do; the harness can't check.
- What a field holds. The harness checks which fields go, not their text: keep learners' names and
  other identifiers out of what you pass. A record's pseudonymous id stays out already: `detect`
  and `measure` send only its events and turns.
- `uses_models`. A component out of process that calls a model calls it itself, so that model's
  host belongs in `sends_to`; the harness doesn't lend it the host's model service.

## The slots that call one

| Slot | Call | Sends | Expects back |
| --- | --- | --- | --- |
| judge | `runAgentTests(doc, cases, { judgeComponent: manifest })` | `case` (its name, rubric, must_not, context and pictures), `reply`, `conversation` (the case's messages) | `{ verdict: "pass" or "fail", reason }` |
| detector | `detect(manifest, record)` | `learning_events`: the record's `events` and `turns` | `{ marks: [{ turn_index, label, evidence }] }`, `turn_index` being the turn's place in the record's `turns`, from 0 |
| measure | `measure(manifest, record)` | `learning_events`, as above | `{ measures: [{ id, value }] }`, each value a number, text, true, false or null |
| context | `lookup(manifest, query)`, then `guidanceFrom(manifest, { items, chosen })` for an activity's `teaching.guidance` | `teacher_text` for a string, or the payload you pass; nothing for `data` | `{ items: [{ text, when, about, source, attribution }] }`; an item without its own attribution gets the component's (`attribution`, else `cite`) |
| step | a graph's Component step (below) | the fields its `inputs` map, each worked out from the run | `{ output, flags }`: `output` any JSON value, `flags` (optional) at most 20 `{ label, reason }` |

`detect`, `measure` and `lookup` take `callComponent`'s options last. With a judge component, the
tests' result names it in `judge_component` (`id@version`), `judge_model` is null, and a judge
that fails, times out or answers out of shape makes that case an error, never a fail; a manifest
that isn't a judge is refused before any case runs.

### A step in a graph

A `component` step holds a step component's manifest inline and calls it once per run:

```json
{ "id": "hint", "type": "component", "next": "reply", "config": {
  "manifest": { "id": "acme/fraction-hints", "version": "0.1.0", "slot": "step", "runs": { "kind": "http", "entry": "https://hints.example.org/v1/hint" }, "receives": ["learner_message", "reply"], "sends_to": ["hints.example.org"], "…": "…" },
  "inputs": { "learner_message": "{{input}}", "reply": "{{tutor.content}}" },
  "on_error": "continue"
} }
```

- **Checked when the graph is**: the manifest fits the schema, its slot is `step`, it runs `http` or
  `mcp` (a host may allow fewer: VIABLE runs `http` only, and a run allows `mcp` only [by name](#a-component-in-a-document)), an HTTP entry is on a host in `sends_to`,
  and `inputs` names only fields the manifest receives.
- **Sends** each field of `inputs`, a template worked out like any step's setting (a lone
  `{{…}}` keeps its value's type, so `{{history}}` goes as a list). A field `inputs` leaves out isn't
  sent. The run trace records the component (`id@version`), its entry and what was sent, credential-like
  names redacted.
- **Answers** `{ output, flags }`. Later steps read `{{hint.output}}`, `{{hint.flags}}` and
  `{{hint.component}}`; `status` is `completed`.
- **When something goes wrong**: `component_refused`, `component_timeout` or `component_failed` stops
  the run (status 422 for a refusal, else 502), unless `on_error` is `continue`: then `output` is null,
  `flags` empty, `status` `failed` and `error` `{ code, message }`, and the run goes on. A Branch, or a
  Reply's `{{ hint.status == "failed" ? … : hint.output }}`, decides what the learner sees.
- **Time**: the call's 30 seconds, or less when the run has less time left.
- **Hosts**: the engine calls `services.callComponent(manifest, payload, { timeoutMs })`; a run
  without one fails saying so. `runAgent`, `run`, `serve`, `test` and a Node scaffold pass
  `documentComponents`, below. VIABLE passes an HTTP-only one under its Fetch URL step's address rules:
  public HTTPS on port 443, no IP addresses or local names, and the deployment's allowlist.

### A component in a document

A package or an agent file is a file someone sent you, so opening one must not run their program. A
component step in a document may use only `http` components, at a public address (HTTPS on port 443, a
name that doesn't resolve to a private address), by default (`componentRuns: ['http']`).

An MCP component starts only when the person running it names its ID:

```sh
viable-engine inspect course.viable.zip      # says what each component step would contact or start
viable-engine run course.viable.zip --input "..." --allow-component acme/fraction-hints
viable-engine serve course.viable.zip --allow-component acme/fraction-hints
```

A Node scaffold reads the same list from `VIABLE_ENGINE_ALLOW_COMPONENTS` (comma-separated). The `run_agent`
and `run_agent_tests` MCP tools never allow one: whoever calls a tool, it isn't the person at the keyboard
choosing. A name lifts the address rule for that component too, for one on your own machine.

The name is the ID the file claims, so it says "I trust this file's component called that", not who wrote
it. Read what `inspect` shows it starts, each time you take a new copy of a file. Without the name the step
fails with `component_refused`, and nothing is started or sent.

A connector can bring a judge's prompts without a component (`judgePrompt`, [resources.md](resources.md)):
they are data the harness's own judge call sends, so no outside code runs.

Planned, not built:

- **simulated-learner**: no agent test uses one yet; `callComponent` returns its answer as it came.

## The review checklist

Applied to every component, VIABLE's included:

1. The license of its code, its data and every dependency (code under MIT or Apache-2.0; data
   under CC BY or more open). Data under a non-commercial license is only ever opt-in context, never
   in a package and never a default.
2. What learner data it receives, and where that goes.
3. What happens when it fails or times out: the step's When something goes wrong path.
4. Attribution, carried into every package that uses it.
5. Fixtures and tests; fixtures are synthetic or licensed for redistribution, never a real learner's
   data.
6. A named maintainer.
7. A risk level: low (data or a pure function, no model and no other host), medium (calls a model,
   or a wrong answer reaches a learner or misleads a teacher), high (sends learner data to another
   host, or acts without a person's review).

## Leaving the catalog

A component with no answer to a security report in 14 days, or failing its fixtures on two minor
versions of the harness, is marked unmaintained, and leaves the catalog 60 days later. Agent
versions that pinned it keep their record.

## Contributing one

Open an issue first, naming the work, its slot and its license. An outside component goes in
`integrations/<owner>-<name>/`: its manifest, the adapter, fixtures, a README and how to cite it.
Start from `integrations/_template/`: a detector's manifest, a small HTTP component in plain Node,
its fixtures, and a README with the steps.
VIABLE writes the adapter with the authors where it can, the authors review it for fidelity to their
work and its limits, and the comparison with and without it fills `evidence.integration`.
