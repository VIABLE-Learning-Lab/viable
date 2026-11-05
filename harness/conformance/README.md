# Conformance fixtures

Language-neutral JSON cases that let another implementation show it reads VIABLE's formats and
behaves as the harness does: a port of VETTING, an engine that runs agent files, a tool that computes
the research measures or sends xAPI. The harness is the reference, and the fixtures decide when two
implementations disagree. Every fixture is synthetic: no real learner's data.

## Running them

```sh
npm test                                         # test/conformance.test.js runs every case
node harness/bin/viable-harness.mjs conformance          # pass or FAIL per case; exit code 1 on a failure
node harness/bin/viable-harness.mjs conformance vetting  # one suite
```

A case with `"only": "engine"` needs the graph checks, so `viable-engine conformance` runs it and `viable-harness conformance` leaves it out.

From code, `runConformance(['vetting'])` (all suites without an argument) and `runSuite(doc)`, for a
suite file you read yourself, from `src/conformance.js`. Each returns
`{ suite, cases: [{ id, description, passed, problems }] }`.

Another implementation reads each file, runs every case's `input` through its own code, builds the
result the suite describes below, and checks it against `expect` by the rules here.

The formats the suites check are published on the VIABLE Developer Platform: each schema at its
`$id`, `https://developers.viablelab.org/schemas/<name>.schema.json` (`agent`, `course-package`,
`learning-events`, `teaching`, `component`), and the xAPI profile the `xapi` suite follows at
`https://developers.viablelab.org/xapi`, which answers every IRI under it with the profile as JSON-LD
(`schemas/xapi-profile.jsonld` here).

## The format

Each file is one suite:

```json
{
  "suite": "vetting",
  "version": 1,
  "cases": [
    { "id": "simple-pass", "description": "PASS passes.", "input": { "mode": "simple", "reviewer": "PASS" }, "expect": { "passed": true, "reason": null } }
  ]
}
```

- `version` is the fixture format's version, 1. A runner refuses a version it doesn't read.
- `id` is unique in its suite and stays the same, so results can be compared over time.
- `description` says what the case shows, in a sentence.
- `input` depends on the suite. `expect` lists checks on the result, each key one check:
  - **A value**: the result's field equals it. An object lists only the fields it checks (in
    `expressions` it must match whole); a list matches item by item and has the same length; numbers
    match within 1e-9; `null` matches a field that is null or absent.
  - **`includes`** / **`excludes`**: substrings the result's `text` must or must not contain.
  - **`error: true`**: the input is refused.

The checks state meaning where they can: the JSON paths of a document's errors rather than their
messages, a verdict rather than its wording, a phrase that must or must never reach a model.

## The suites

| Suite | `input` | Result |
| --- | --- | --- |
| `formats` | `{ kind, document }`, or `{ kind, file }` with a path from the repository root | `{ valid, errors }`: the sorted, distinct JSON paths of the document's errors (`$` is the document; an error about a property's name is at `<path> (name)`). The schema for `kind` (`agent`, `course-package`, `learning-events`, `teaching`) comes first; once the shape fits, an agent's graph gets the graph checks (an error at `$.graph`) and a course package its agents' graphs and refs. |
| `graph` | `{ graph }` | `{ valid, code, text }`: `code` is `invalid_graph` for every rejection, and `text` the error's messages; `includes` names the step or setting at fault. |
| `expressions` | `{ expression, scope }` or `{ template, scope }` | `{ value }` or `{ text }`; an expression that doesn't parse is an error. The grammar and functions are in `src/agents/expression.js`. |
| `teaching` | `{ teaching, section }` | `{ text }`: the instructions (system message) of the step that writes the reply, an LLM step whose own instructions are `You are a tutor.`, when an agent of that step runs with these teaching settings for a learner in `section` (null: none). |
| `vetting` | `{ mode, reviewer }` | `{ passed, reason }`: what the reviewer's output means in `simple` or `full` mode, `reason` null when it passed. |
| | `{ reply }` | `{ requires_attention, content }`: whether a reply carries the safety prefix, and the reply without it. |
| | `{ answer, question, said }` | `{ reached, now, checkable }`: whether the learner's turns, oldest first, hold the answer key's answer, by code, whether their latest does, and whether code can tell at all. |
| | `{ prompt, config, teaching, message }` | `{ text }`: the system message a VETTING step with this `config` (and these teaching settings) sends in its first round, to the reply model (`prompt: "generation"`) or the reviewer (`"verification"`), when the learner's message is `message`. |
| `measures` | `{ events, turns }` | `{ metrics, skills, writing }`: one learner's metrics, mastery per skill by the skill's name, and writing rows by `panel/field` (`src/measures.js`). |
| `xapi` | `{ record, options }` | `{ count, statements, text }`, `text` being the statements as JSON, or an error: the record as xAPI statements ([docs/xapi.md](../docs/xapi.md)). |

## Changing them

A change to the harness that changes a fixture's result changes what VIABLE does: update the case in
the same change and say why, since other implementations follow the fixtures. A new case is
synthetic, small, and shows one thing its description names.

## Implementations checked against them

| Implementation | Suites | Result | Checked |
| --- | --- | --- | --- |
| This harness | all | every case passes (`npm test`) | on every change |
| [vetting-python](https://github.com/hichipli/vetting-python) 0.1.0, VETTING's Python reference | `vetting`, the reviewer-verdict cases | 9 of 9 agree; its prompts are worded differently and aren't compared | 2026-11-03, by hand |

An implementation that runs a suite and wants to be listed opens a pull request adding its row, with
how to reproduce the run.
