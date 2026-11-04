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
- **Conformance fixtures** for the formats, graphs, expressions, teaching settings, VETTING, the
  measures and xAPI, and **an xAPI profile** for learning events.

## 0.1.0

The harness kit inside VIABLE's platform repository: `run`, `validate` and `measure` over agent files
and course packages, and the open formats as JSON Schema.
