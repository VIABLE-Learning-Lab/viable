# Changelog

Changes that matter to people who build on the harness. Versions follow semantic versioning; a change
to a format or to what a step's setting means is at least a minor version and says how to move
existing files.

## Unreleased (0.2.0)

The first version as its own repository.

- **The core, standing alone**: the engine, its 22 step types, VETTING, How the AI helps, the
  research measures and the data they use (Eedi's misconceptions, the Carnegie Skills Progressions),
  importing nothing but Node's built-ins and one dependency, checked by `test/boundary.test.js`.
- **VETTING as a function**: `checkReply` and `viable-harness check` run the engine's own VETTING
  step on a reply your app wrote.
- **Agent tests**: the case format, the judge and `viable-harness test`.
- **Suggested changes**: `suggestChanges` and `viable-harness suggest`, rules over runs and learner
  records, each suggestion with its evidence.
- **The teacher view**: `viable-harness view`, one self-contained page.
- **Local runs** search a course package's own files, call its other agents, speak through
  `/audio/speech` and read HTML pages; all six examples run locally.
- **Components**: the manifest format (`schemas/component.schema.json`) and six built-in components.
- **MCP server and Agent Skills**: `viable-harness mcp` and `skills/`.
- **MCP Apps views**: in assistants that render MCP Apps (`io.modelcontextprotocol/ui`),
  `check_reply`, `run_agent_tests` and `suggest_changes` show their result as a self-contained page
  that loads nothing; the server offers them only to a client that says it renders them.
- **Your own server**: `viable-harness serve` answers apps' agent runs as VIABLE does
  (`POST /v1/agents/{slug}/runs`, reading a run back), with a token, limits, memory per pseudonymous
  learner and one log line per run; a `Dockerfile` serves `/agents` ([self-hosting.md](docs/self-hosting.md)).
- **Courses as they are downloaded**: `run` and `serve` take a `.viable.zip` and read its files from
  the archive; `--knowledge <id>=<folder>` searches a folder as the knowledge base an exported agent
  file names.
- **Course packages**: a file may carry `text_path` and `text_sha256`, a Markdown copy of its text,
  which VIABLE writes for PDFs and Office files and a local run searches; an agent may carry the
  `slug` it had where it was downloaded. Existing packages need no change.
- **Public goods catalog**: 41 entries in `catalog/` (`schemas/catalog-entry.schema.json`), each
  checked against its primary source, listed in `docs/catalog.md` by `npm run catalog:build`;
  searched by `searchCatalog`, `viable-harness catalog` and the MCP tool `find_public_goods`.
- **Component steps**: a graph's `component` step runs a step component from its manifest held in
  `config.manifest`, sending the fields `config.inputs` maps; its answer is `{ output, flags }`, and
  `on_error: continue` goes on without it. `runAgent` and `viable-harness run` call HTTP components
  and MCP servers; `validateGraph(graph, { componentRuns })` lets a host allow fewer.
  `agent.schema.json` adds `component` to the step types: files without one need no change. A step
  component's answer from `callComponent` is read like the other slots': only `output` (text cut to
  20,000 characters) and `flags` (at most 20 `{ label, reason }`).
- **A sample class**: `examples/class/`, four made-up learners' records for trying `suggest` and
  `view` without a model key.
- **Conformance fixtures** for the formats, graphs, expressions, teaching settings, VETTING, the
  measures and xAPI, and **an xAPI profile** for learning events.

## 0.1.0

The harness kit inside VIABLE's platform repository: `run`, `validate` and `measure` over agent files
and course packages, and the open formats as JSON Schema.
