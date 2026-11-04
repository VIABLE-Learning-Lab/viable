# Contributing

Thank you for helping. The harness is used with minors, so every change is held to what a teacher,
a researcher and a developer would each need from it.

## Before you start

- Open an issue for anything larger than a fix, so we can agree on where it belongs: in the core,
  as a component (`integrations/`), or as an example.
- English only, in code, comments, docs and examples' own text (an example may teach another
  language).
- Copy promises only what is built: a README line, a step's tip or a component's page says what the
  code does today, and marks the rest as planned.

## The change itself

- `npm test` passes, including `test/boundary.test.js`: the code imports only Node's built-ins, its
  own files and the npm packages listed there, each under MIT or Apache-2.0. A new dependency needs a
  reason a few lines of code can't meet.
- A new or changed step type changes its manifest in `src/agents/steps/`, then
  `npm run steps:build` ([docs/step-manifests.md](docs/step-manifests.md)).
- A change to a format (`schemas/`) or to what a setting means is at least a minor version, with a
  note on moving existing files.
- No learner's name or identifier ever reaches a model from the core, and fixtures hold no real
  learner's data: write synthetic ones.
- AI-assisted contributions are welcome when a person has read, run and tested them, and says so.

## Sign-off (DCO)

Each commit carries a `Signed-off-by:` line (`git commit -s`), certifying the
[Developer Certificate of Origin](https://developercertificate.org): that you wrote the change or
otherwise may submit it under the project's license (MIT for code, CC BY 4.0 for data and docs).
There is no contributor license agreement, and the project's licenses won't change.

## Review

A maintainer (MAINTAINERS.md) reviews every pull request. Components are also reviewed against the
checklist in [docs/components.md](docs/components.md) once it exists; until then, open an issue
first.
