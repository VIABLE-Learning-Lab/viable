# Components

Another team's work, or VIABLE's own, joins the harness as a **component** in one of six **slots**.
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
| `runs` | `core` (JavaScript in this repository, with the export that runs it in `entry` and the step type, if any), `mcp` (the tool's name in `entry`, and in `server` the `command` and `args` that start the server) or `http` (the endpoint's URL in `entry`) |
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
command line, and says which fields it left out.

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

`component_refused` means nothing was sent. The code is in `error.code`, for a step's When something
goes wrong path once a step can call a component (planned, below). The answer is data, never
instructions: the harness keeps only the fields its slot reads, and cuts their text (a judge's
reason to 600 characters, a mark's label to 120 and its evidence to 1,000, an item's text to 4,000).

What it can't enforce:

- What an MCP server does on its own. It runs on your machine with your user's rights, so it can
  read your files and reach hosts its `sends_to` doesn't list. Run servers you've reviewed, or in a
  container.
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
| context | `lookup(manifest, query)` | `teacher_text` for a string, or the payload you pass | `{ items: [{ text, source, attribution }] }`; an item without its own attribution gets the component's (`attribution`, else `cite`) |

`detect`, `measure` and `lookup` take `callComponent`'s options last. With a judge component, the
tests' result names it in `judge_component` (`id@version`), `judge_model` is null, and a judge
that fails, times out or answers out of shape makes that case an error, never a fail; a manifest
that isn't a judge is refused before any case runs.

Planned, not built:

- **step**: a component as a step of an agent graph needs VIABLE's editor to place it and give it
  a When something goes wrong path. Until then `callComponent` calls a step component on its own,
  and no graph runs one.
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
