# Changelog

Changes that matter to people who build on the harness. Versions follow semantic versioning; a change
to a format or to what a step's setting means is at least a minor version and says how to move
existing files.

## Unreleased (0.2.0)

The first version as its own repository.

- **Docker has been run.** The root `Dockerfile` didn't build before; it now does, for `linux/amd64` from an arm64 Mac
  too. A docker scaffold has a health check, `compose.yaml`, and `records.js` for `records export` and `forget` inside the
  container. Its README says how to reach a model endpoint on the same machine.
- **A stopped scaffold finishes the run under way.** On `SIGTERM` it answers and keeps that run, then exits, as `serve` did.
- **A wrong setup says what to do.** A server that can't write its folder won't start. An endpoint it can't reach is 502
  `provider_error`, not 500 `agent_run_failed`, naming the address and what to check. At start, it prints where model calls go.

- **With no token, a server answers this computer and its own pages.** `serve`, `gateway` and `try` refuse any
  other name in `Host`, a proxy that says it passed a request on, and a post with another site's `Origin` (or
  `--cors`'s). Routes that take JSON answer 415 to anything else: `curl` needs a `Content-Type`.
- **The teacher's page always takes a token.** With none set, `serve` and `gateway` make one at start and print
  it once. `--panel` likewise, and it shows only on a page asked for with `?panel=1`, for a session that ends
  with the browser or after 8 hours, with a Sign out. `--learner-header` needs `--token-env`.
- **`try --export` refuses anything but the bundled examples** without `--publish-answers`. `/?tour=1` does
  nothing unless started with `--demo --tour`.
- **`--keep-days` takes all a learner wrote**: drafts, answers, highlights and events as well as turns, each from
  its last change, and Lambda and Firebase scaffolds now sweep daily. A course longer than the setting loses an untouched draft.
- **`readZip` bounds what it inflates** by default, 64 MiB an entry and 256 MiB in all; pass `maxBytes` or
  `maxTotalBytes` for more.
- **A document can't start a program.** A component step in an agent file or a package calls only `http`
  components at a public address, unless the person running it names the ID (`--allow-component`,
  `VIABLE_HARNESS_ALLOW_COMPONENTS`). If you run an MCP component from a file, add the flag. `inspect` says
  what each step would contact or start.
- **A Node host refuses private addresses** in Fetch URL steps, `fetch_url`, files named by URL and http
  components, when a name is looked up and again as the connection is made
  (`server/publicFetch.js`; `createRuntime` takes it as `services.httpFetch`, `server/onNode.js`).
- **A caller who leaves a conversation they named still gets the turn:** it finishes and is kept, as on the
  platform and on chat pages. Any other run stops when its caller leaves, since nobody could find its reply.
- **Gateway records keep a reviewer's reasons only with `--keep-text`,** since a reason can quote what was said.
- **The core, standing alone**: the engine, its 23 step types, VETTING, How the AI helps, the
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
- **`viable-harness try`, and no command at all**: the real pages on this computer, with a panel showing what the
  AI did with each message. Scripted replies without a key, your own model with one. A scripted tour, and a static
  copy for a website. `serve --panel` gives the same panel to the token holder; `test --html` shows a run as a page.
  The engine tells `hooks.onVettingDraft` and `hooks.onVettingRound` as a review happens.
- **The learner pages are in the core** (`src/learner/`) and served by `serve` and every scaffold, at VIABLE's paths
  (`server/learner.js`). Course packages and agent files may carry `profile` and `chat_page`; a package's websites
  may carry a `snapshot`, `path_prefix` and `include_subpages`; knowledge bases `file_links` and `search_mode`; a
  course `shared_devices`. `viable-harness knowledge refresh`, `records export` and `forget`; `serve --class-code-env`
  and `--learner-header`.
- **A package runs on your own cloud**: `inspect` reports everything it needs, `deploy` writes a folder for node,
  docker, cloudflare, aws-lambda, cloud-run or firebase with a README of exact commands, and `verify` checks the
  result from outside and prints the line for your site. `skills/deploying-a-viable-course` walks a coding AI through
  all of it, and `AGENTS.md` says where an AI starts. The server is one web-standard handler (`server/handler.js`)
  with thin adapters and a store interface. With a store, the runs route keeps conversations as VIABLE does. Models
  are replaced by role and by name (`--map`, `--models`, `--reviewer-model`), with a warning when a reviewer ends up
  the model it checks. A caller who hangs up stops the run, except on AWS Lambda.
- **The gateway**: `viable-harness gateway` and `gatewayHandler`, an OpenAI-compatible endpoint that adds How the AI
  helps, a check on each reply and a record to any app, with plain-HTTP routes for the check, instructions and
  misconceptions. `checkReply` has no Node imports, and takes `instructions` so a rewrite keeps to the app's own.
  `view` and `suggest` take a folder. A learning-events turn may carry `words`.
- **Connectors**: `viable-harness resources` turns public goods into what the harness runs: test suites (GSM8K,
  MathCAMPS, MathDial, FairytaleQA), a judge and its check (Learning Commons Evaluators), calibration sets against
  people (MRBench, ASAP 2.0, ELLIPSE), knowledge folders (WWC guides, Illustrative Mathematics), a local standards
  search (Learning Commons Knowledge Graph) and a measure (pyBKT). Each catalog entry says its level in `connect`, a
  license that limits use is accepted before anything is fetched, and `runAgentTests` takes `judgePrompt`, with
  `judgeReplies` for replies already written.
- **MCP without a transport**: `mcpTools()` and `handleMcpMessage()` serve the tools from any transport with no
  `node:` imports, and `checkPlan()` and `checkOutcome()` make `checkReply`'s review on a host's own services.
- **One look**: `src/ui/theme.js` holds VIABLE's tokens in light and dark, Atkinson Hyperlegible Next and Mono (SIL OFL
  1.1), the mark and base components. `src/ui/parts.js` writes a VETTING round, a test case and a suggestion once.
  The teacher's page and the MCP views are redrawn on them: drafts marked as a teacher would, measures as small marks
  with definitions on demand, and in an assistant a check that plays out with the verdict last.
- **A package needs no course**: `course` is optional in `viable.course-package`, which holds a course or at least one agent, so an agent with a chat page downloads whole. Existing files need no change; a reader of your own that requires `course` must accept its absence. A package's sub-agents are found by the slug they were published under, as well as by ref or name. `inspect` reports what a download left out, calls to agents the file doesn't hold, and a chat page's daily spending cap, which isn't enforced on your own server. `validate` reads a `.viable.zip`.
- **A sample class**: `examples/class/`, four made-up learners' records and eight runs for trying
  `suggest` and `view` without a model key.
- **Conformance fixtures** for the formats, graphs, expressions, teaching settings, VETTING, the
  measures and xAPI, and **an xAPI profile** for learning events.

## 0.1.0

The harness kit inside VIABLE's platform repository: `run`, `validate` and `measure` over agent files
and course packages, and the open formats as JSON Schema.
