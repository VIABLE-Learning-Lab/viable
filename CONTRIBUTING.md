# Contributing

Thanks for helping. This is used with minors, so every change is held to what a teacher, a
researcher and a developer would each need from it. This page covers how to get set up, how to make
a change, and how it gets reviewed and merged.

## Ways to help

- **Report a bug or ask for a feature** with an [issue](https://github.com/VIABLE-Learning-Lab/viable/issues/new/choose).
- **Ask, answer or show what you built** in [Discussions](https://github.com/VIABLE-Learning-Lab/viable/discussions).
- **Improve the docs or an example**: small fixes are the best first pull request.
- **Add your work**: research guidance, a dataset or a benchmark, a model or a tool that reads conversations, open
  content, or a resource to list. [Add your work](harness/docs/add-your-research.md) starts each from one already in the
  catalog; [Components](#components), [Catalog entries](#catalog-entries) and [Connectors](#connectors) below hold the rules.
- **Fix or build something**: look for [good first issues](https://github.com/VIABLE-Learning-Lab/viable/labels/good%20first%20issue) and [help wanted](https://github.com/VIABLE-Learning-Lab/viable/labels/help%20wanted); for anything larger than a fix, open an issue first so we can agree on where it belongs.

## Set up

Node 22 or later. No model key is needed for the tests: they script the model's replies and fail if
anything reaches the network.

```sh
git clone https://github.com/VIABLE-Learning-Lab/viable.git
cd viable
npm ci
npm test
```

| Where | What |
| --- | --- |
| `harness/` | **The Harness**, its own package, with no dependencies. `src/harness.js`: `prepare`, `check`, `record`. `src/brief.js`: what a turn gets. `src/tasks/`: the kinds of teaching work. `src/checks/`: VETTING's review. `src/gateway.js`, `src/mcp*.js`: the ways in. `src/utils/`: How the AI helps, measures, the misconception search and the data copies. `src/components/`, `src/resources/`, `catalog/`: others' work joining. `src/ui/`: what every page shares |
| `engine/` | **The Engine**, which stands on the Harness. `src/agents/`: the graph engine and one manifest per step type. `src/server/`: the handler, the runtime and what serves pages. `src/learner/`: the learner pages. `src/console/`: its own pages. `deploy/`: one scaffold per target |
| `harness/schemas/`, `harness/conformance/`, `engine/conformance/` | the open formats, and the fixtures another implementation checks itself against |
| `harness/skills/`, `engine/skills/` | Agent Skills |
| `examples/` | course packages |
| `harness/test/`, `engine/test/` | the tests; each `boundary.test.js` keeps its part standing where it should |

## Making a change

- **Keep the two parts apart.** `harness/` imports only Node's built-ins and its own files, so it installs alone. `engine/`
  adds the Harness, `uqr` (MIT) and `entities` (BSD-2-Clause, the one exception to MIT or Apache-2.0). A new dependency needs a reason a few
  lines of code can't meet. What a host bundles for a server or a browser imports no `node:` built-ins; local-only code may.
- **Protect learners.** No learner's name or identifier is ever sent to a model, and fixtures, tests
  and examples hold no real learner's data: write synthetic ones.
- **Say only what is built.** README lines, step tips, component pages and docs describe what the code
  does today and mark the rest as planned.
- **Formats and settings.** A change to a schema or to what a setting means is at least a minor
  version, with a note in CHANGELOG.md on moving existing files. A changed step manifest needs
  `npm run steps:build`.
- **Tests.** New behavior comes with a test; a bug fix with the test that would have caught it.
- **English** in code, comments and docs (an example may teach another language).
- **AI-assisted contributions** are welcome when a person has read, run and tested them, and says so.

## Pull requests

1. Branch from `main` (`fix/empty-reply`, `feat/judge-component`), and keep a pull request to one
   change.
2. Give it a title in Conventional Commits form, `type(scope): description`, with `feat`, `fix`,
   `docs`, `refactor`, `test`, `perf`, `chore` or `ci`; the scope is optional and `!` marks a breaking
   change (`npm run check:pr-title -- "your title"`). The title becomes the commit's subject.
3. **Sign off every commit** (`git commit -s`): it certifies the [Developer Certificate of
   Origin](https://developercertificate.org), that you wrote the change or may submit it under the
   project's licenses (MIT for code, CC BY 4.0 for data and docs). There is no contributor license
   agreement, and the project's licenses won't change. Forgot? `git rebase --signoff main`.
4. Fill in the template: what and why, how you checked it.

### How a pull request lands

Checks run on every pull request: the tests on Node 22 and 24, the title and the sign-off. A
maintainer reviews it (CODEOWNERS), usually within a week, and squash-merges it, so you are the
author of the commit on `main`.

This repository is also developed inside the lab's platform repository, which runs this exact code. After a pull request
is merged here, a maintainer brings its commit into that repository, keeping you as the author. Changes made there arrive
here as commits whose `Viablelab-Api-Commit:` line names the commit they came from, so the two stay in step.

## Components

A component is another team's work in one of six slots (context, step, detector, judge, simulated
learner, measure), with a manifest stating the learner data it receives, the hosts it calls, its
license and its evidence. [docs/components.md](harness/docs/components.md) has the format, the review
checklist and how to add one; we write the adapter with its authors where we can.

## Catalog entries

The public goods catalog ([docs/catalog.md](harness/docs/catalog.md)) lists open datasets, benchmarks,
knowledge graphs, standards, evaluators, models, tools, open content and learning data repositories
for K-12 AI, one file each in `harness/catalog/`, checked against `harness/schemas/catalog-entry.schema.json`. An
entry describes the work; it doesn't endorse it, and listing it doesn't bring it into the harness
(a connector or a component does).

- **What qualifies**: work for K-12 education that anyone can find and get on its makers' terms,
  released, or announced by its makers with a date. Closed commercial products, and work only its
  marketing describes, stay out.
- **What to verify**, against its primary source (its own site, repository, license file, dataset
  card or paper) on the day you set `verified_at`: the link, the license of each part, with a note
  for gated, non-commercial, mixed or conflicting terms (and `unclear` where the sources disagree,
  rather than a guess), how to get it, and whether it is released.
- **How**: open an [issue](https://github.com/VIABLE-Learning-Lab/viable/issues/new?template=catalog.yml),
  or a pull request with `harness/catalog/<id>.json` and what `npm run catalog:build` writes from it
  (`npm test` checks both).
- **`connect`**: how far it is connected (0 listed, 1 fetchable, 2 one command from an effect, 3 built
  in), as what, the exact command, and a note: what results can show and what they can't, or why it goes
  no further ([docs/resources.md](harness/docs/resources.md)).

## Connectors

A connector turns a public good into what the harness runs: a test suite, a judge, a calibration set, a
knowledge folder, a context lookup or a measure. Fetch the data and read it first, then follow
[Write a connector](harness/docs/resources.md#write-a-connector). Say so in the entry when it can't be done
well: a connector nobody would use is worse than none.

## Releases

Maintainers cut releases from `main`: the version in `package.json`, a CHANGELOG entry, a `vX.Y.Z`
tag and a GitHub release with the changelog's notes.

## Conduct and security

Everyone here follows the [code of conduct](CODE_OF_CONDUCT.md). Report security problems privately
([SECURITY.md](SECURITY.md)), never in an issue.
