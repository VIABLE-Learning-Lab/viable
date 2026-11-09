# Changelog

Changes that matter to people who build on this. Versions follow semantic versioning; a change
to a format or to what a step's setting means is at least a minor version and says how to move
existing files.

## Unreleased

- **What Ask remembers.** `memory.js`: a person's memory for an assistant, as short sentences, never a learner's (`memoryRefusal` refuses a name from their class lists, an address, more than a sentence). `pickMemories` gives a message what is kept always in mind (up to 8) and the few others its words meet (up to 4), in any language; `memoryNote` words them as context that what the person says now overrides; `searchConversations` finds earlier conversations by their words. On the Engine, Ask keeps and changes what the person tells it (`remember`, `forget`) in front of them, looks up the rest (`recall`) and their earlier conversations (`search_conversations`), and says in a step when something it remembered came up; What Ask remembers (`/console/ask/memory`) shows all of it, to change, move, delete or switch off (`storeMemory`).
- **Archived courses.** A course's Settings archive it: learners can't open it, and it waits under Archived at the foot of Courses, kept as it is, until Restore brings it back as it was or Delete deletes it. The library's `archive`, `archived` and `unarchive`; on a host that keeps what learners did (`archives`), Delete takes the course out of the teacher's courses, and on the Engine it deletes the course and their work from the server. Ask's Undo of a course it made archives it on the Engine, so Redo can bring it back.
- **No page from before a change.** The console's answer to a change says `Clear-Site-Data: "prefetchCache"`, so a page the browser fetched ahead as a pointer rested on its link isn't shown as it was before the change (Chrome 138 and later; other browsers don't fetch ahead).
- **Open to learners.** An activity's card in Ask says who its button opens it to, and once it is open shows the course's link, the poster to show the class and a QR code, unless the conversation already has them.
- **A hint isn't giving the answer away.** VETTING's answer-key review fails a reply that states the answer, points out the correct choice or does the remaining work, and no longer one that names the idea, rule or method or points at the next step: before, with no `key_concepts` listed, it was told to fail "any of the key concepts" and took hints for them. Only listed key concepts are held back. `explanation`, and the `Explanation:` line a question panel's key ends with, are told to the reviewer as how the answer is reached, no longer as part of the answer.
- **Where misconceptions came from.** What the AI did names the source of the misconceptions it listens for (`settingsShown(...).listens_from`) and of one heard in a message, and a Creative Commons license by its short name (CC BY 4.0). A turn brief's misconceptions, parts of a standard and skills to go back to keep their `source`, so the panel names it on each turn; the brief's text for the model doesn't change. Its `control` may also be `{ param, own, tried }` for a host that keeps no try's settings: choosing a level opens the page again with it in its address.
- **Whose work it is, where a teacher sees it.** The Engine's activity page names the source and license of a chosen standard or skill, of misconceptions (the one searched too) and of each piece of guidance, opening to its attribution; a skill search names where its results come from, and its levels are the Carnegie Skills Progressions' own (Exploring to Extending) instead of names they didn't match. Ask's look-ups and `set_how_ai_helps` say where what they found or set came from, a host's `standards` service can name its `source`, and What the AI did shows a chosen standard or skill with its source (`settingsShown(...).standard.from`). `sourceName` and `skillsSource` are exported.
- **A section's own moments, and ways the AI helps.** A section's own settings (`teaching.sections`) can say when the AI writes first for its learners: its own moments, or `'off'` for never. `teachingWith(teaching, way)` lays a way (`wayOf`: `help`, `speaks_up` or `'off'`) over an activity's settings, and `teachingForSection` does it for a learner's section; the Engine's learner server and a console's activity page go by them, and a learning page takes its learner's moments from the `learner` endpoint (`speaks_up`). `schemas/teaching.schema.json` now holds `speaks_up`, `reviewer_reads` and a section's `speaks_up`: before, a package that carried them was refused.
- **One scale for how much the AI does.** The levels run from the least to the most, each the one before and one thing more: `check_only` (Only checks), `ask_first` (Asks questions), `hint` (Gives hints), `step_up` (Shows an example), `explain` (Explains), in `HELP_LADDER` (`ui/parts.js`) with what each adds, when to use it and what it sounds like. `ask_first` now means only asking: its instruction no longer allows hints, so an activity that had it is stricter; `check_only` says it doesn't teach. A console's activity page shows them as one scale and lights up, in what the AI reads, the paragraph a choice changes.
- **The AI can write first, unasked.** `teaching.speaks_up` (`speakUp.js`): after some quiet minutes on a step (`quiet`), after working a while without asking (`alone`), after a wrong answer (`wrong`) or every so many right ones (`right`), while writing every so many new words at a pause (`writing`), and when writing is handed in (`handed_in`); on writing, `how` (ask, point, fix) and `focus` (language, ideas, rubric); for any moment, `say`, what the AI does then in the teacher's words. At most `most` times in a step each day and `gap` minutes apart (429 `speaks_first_soon`), off unless chosen. The page carries only when each moment comes (`speaksUpOnPage`), never what the AI is told. A learning page sees the moment and posts `messages` with `event: { kind }` and no words; the server checks the teacher chose it and holds to how often (409 `speaks_first_off`, 429 `speaks_first_limit`), the AI is told what to do at that moment with the studies it rests on, and the turn is kept with `signals.source` `ai_first`, `signals.moment`, and no message. A learner sees why it began.
- **What a reviewer reads.** VETTING's `reviewer_reads`: only the reply, as before, unless the step or the activity's teacher (`teaching.reviewer_reads`) lets it read the learner's last message too, as data, when it also fails a reply that doesn't answer them. Never on a turn the AI writes first. The step's choice wins.
- **What the AI did is kept with each run.** A run keeps `context.turn_record` (the step and what the Harness read of the moment); `turnEvents` reads a kept turn back as the panel's events, `turnTree` draws one on a server, and `keptTurnEvents` reads the Engine's. The panel reads every turn again from its host when it opens (`…/watch`, only where it was granted) instead of twelve in a browser. The Engine marks a teacher's try-out turns (`tried`) and `records.tried(code, key)` lists them, as the hosted service lists its previews, for **What the AI did in your tries** on an activity's page.
- **Ways to arrange a whole activity.** Ten activity designs from research (`designs.js`: predict-observe-explain, claim-evidence-reasoning, worked-example fading, try first, retrieval practice, teach the AI, vote-argue-revote, role play and debrief, explain as you read, draft-feedback-revise), each with what it suits, what isn't known, its sources and its steps, and eight rules for any of them. `findDesigns`, `reviewActivity`, the MCP tool `find_designs`, `viable-harness designs`.
- **A page to read, and an AI that speaks first.** A new panel, `page`: Markdown, up to 12,000 characters. A step can say what the AI does there (`brief`, for the AI only) and what it says first (`says`), and an activity with no steps its `opening`. `teaching.role` says who the AI is here. `teaching.design` names what it is built on, and doesn't reach the AI. Up to six steps and eight panels. All optional: nothing saved before needs changing.
- **A level that steps up.** `step_up` asks first, then hints, and once they have really tried shows a worked example with other numbers, then sends them back to their own. `ask_first` and `hint` now say so when a learner has it: hints only limits giving the answer, not telling them they're right. One name for each level on every screen: Steps up, Hints only, Explains, Only checks, Asks first.
- **A learner who has it is told so.** `context.answer_holds` says yes or no, worked out on the server, for what they have chosen or written and not sent, where pressing Check would tell them anyway. VETTING's reviewer doesn't fail praise of a method, and a rewrite changes only what the reason objects to, staying on what the learner said.
- **What the AI did says where each part came from**, and "Passed" says what it passed.
- **Ask writes whole activities.** `add_activity` and `change_activity` take `steps`, `says`, `starters` and `design`; `read_activity` shows them with what a teacher would want to fix first; `find_designs`; `file_materials`. A second activity of one name is refused, and one that can't be found says what the course has. A step has the AI only where it was given something to do.
- **For hosts.** `threads` gains `keepCheckpoint` and `checkpoint`, for Undo and Redo; `library` gains `unarchive`; `materials` gains `folders`, `makeFolder`, `renameFolder`, `removeFolder`, `move` and `courseFolder`, and `list`, `add`, `addLink` and `search` take a folder, none of them required. The console's shared code and styles are files that can be kept for good (`consoleAsset`), so a click brings only the page.
- **Ask opens links.** Put an address in a message, and it reads the page. Only an address the teacher wrote or a search found opens, whole, and an address a page names doesn't. An activity's web page takes the same. A site that won't let a program read it is said plainly.
- **Class lists in tables.** A table's names are found in any column, under a heading that says so or not, in what's pasted, in a material and at a link.
- **For hosts.** `web` gives Ask a way to the web: `read(url)` for a page, and `search(words, run)` with `searches()` for a search of the host's own. A server reads pages over its outward fetch and has no search. `chat` is told `trace` (the run, the conversation, the call and how many messages are new), for a host's logs, and `askModel.kept` is said beside the box.
- **Ask works like an agent.** Its box stays at the foot of the page, and its work shows as a timeline of steps with the time and a Stop button, then folds to a line. Words arrive as they are written where a host's model streams. A course or activity can be brought in from its page or from +; `read_activity`, `change_activity`, `change_questions`, `change_course` and `copy_activity` change what is there, and show a button instead where learners would meet the change. Conversations can be deleted, one or all.
- **For hosts.** `materials` gives Ask and a Materials page files to read; `askModel.hear` and `askModel.hears` let a teacher say it instead of typing; `chat` may take `onText` for words as they come; `consoleApp` takes `home`, where its name leads, and `who`, who is signed in; `library.titles` lists courses without reading them.
- **The console's own controls.** Every select is dressed as the console's menu, with a hint under an option where it has one, and the select stays underneath for forms and for a browser that can't. Every file input is a place to drop a file. A form with `data-confirm` and no `data-api` asks, then goes the browser's way. A page that isn't there says so in the console's shell. New course shows what each example holds.
- **For the AI that builds.** A Skill, `building-for-learners`, for coding agents making something learners will use: what to ask first, the least to build, what a class does to a tool (one address, a budget per class, shared computers), learners' data, and when to stop and say so. `viable-harness review` reads a project for what classrooms trip on, with no model and nothing leaving the computer. `tutor-tests.json` is a ready set of tests for a tutor it builds. [docs/for-builders.md](harness/docs/for-builders.md).
- **Ask.** With a model set, the console opens on a conversation: say what you're teaching, and it makes the course, activities and questions through the console's own routes, showing each step, and hands back cards for the link, QR code, class list and progress. What reaches learners waits for a person's click, enforced on the server, and names never reach its model. The role `assistant` is optional.
- **What reaches learners stays a person's.** Ask won't change teaching or questions on what's open, for everyone or for a section, or add a first section to a course in use. It says why, and where the teacher can do it.
- **Class lists.** Pasted lists read as lists in any script or case, numbered, with IDs or emails, with a button to send a note that only looks like one. Two columns of first and last names are refused rather than read as sections.
- **A preview shows everything.** Trying a course opens activities learners can't yet, and says so on each.
- **For hosts.** `consoleApp` gives a host the console's routes and pages for whoever it has signed in, with `library`, `classes`, `records` and `threads` of its own. `simple` leaves out what such a host decides for teachers.

## 0.3.0 (2026-11-05)

Two parts, one repository.

- **The Harness and the Engine are separate.** The repository is `viable`. `@viable-lab/harness` has no dependencies and nothing
  of the Engine; `@viable-lab/engine` stands on it. `viable-engine` takes every `viable-harness` command, and the commands that
  run agents (`run`, `serve`, `try`, `inspect`, `deploy`, `verify`, `knowledge`, `records`, `forget`, `test` on an agent file) moved
  to it. `VIABLE_HARNESS_*` variables are now `VIABLE_ENGINE_*`. A scaffold's code is in `vendor/engine` and `vendor/harness`.
- **Agents, chat pages and knowledge, in the console.** From an empty server, in the browser: a knowledge base from files and
  websites, an agent from a form, a chat page with its link, QR code and chat button. A package can now hold knowledge bases
  with no agent yet (`anyOf` in its schema), and keeps and downloads its files' text copies and its websites' pages, which it
  used to lose when added in the console. `uqr` (MIT) is a new dependency of the Engine. A scaffold's `package.json` lists it.
- **Before the reply.** `prepare` reads the moment and gives a model what it needs (`turnBrief`), `check` and `record` take the turn, and
  five tasks prepare other teaching work. The gateway and the Engine read the moment by default: `--whole-settings` on the gateway sends
  everything the teacher set, as before.
- **Rules.** `tools_off` in How the AI helps says which tools are off, and they are removed, not only told.
- **A learner who is right is told so.** The rule read "Yes, 3 5/6" as giving the answer away, and a rewrite dropped it. A reply that treats
  the answer as the learner's own now passes, one that supplies it still fails, and one that calls a wrong answer right fails. Code compares
  what the learner wrote with the key (`answerReached`, or a question panel's own marking) and tells both models only whether they have it,
  so the reply says they are right and may discuss the answer. Where code can check and they haven't written it, the reviewer hears that too, so a learner who only claims the answer doesn't get it confirmed; an answer in words code can't read counts as not written. The reviewer still reads nothing the learner wrote. A rewrite keeps the reaction. A review's default limit is now 1,024 tokens in both modes, so a reasoning model
  doesn't run out before it answers: an empty review counts as a failure.
- **Guidance from research, ready to choose.** 77 pieces on 8 topics (scaffolding, feedback, tutoring talk, self-explanation, worked examples, productive struggle, recall and spacing, metacognition), each naming the studies it draws on and saying what isn't known. Chosen in How the AI helps in the console, with `viable-harness component add viable/feedback`, or found with the MCP tool `find_guidance`. Those for a moment take turns, so a learner doesn't hear the same two every time.
- **Others' research reaches a reply.** A `context` component can be one JSON file (`runs.kind: data`), with nothing to host. Its pieces go in an
  activity's settings (`teaching.guidance`, `guidanceFrom`), and a turn's brief takes at most two that fit the moment, with their source.
  `viable-harness component new`, `try` (what a model is told with and without it) and `add`. [docs/how-it-works.md](harness/docs/how-it-works.md) says how a turn chooses.
- **What the AI did** closes at any width, so you can see the page as a learner does, and `watchSlot({ fontBase: null })` carries its type in the page for a host that serves none.
- **`checkReply` no longer runs a graph.** The review is in `checks/vetting.js`, and the graph's VETTING step runs the same one.
- **`viable-harness test --endpoint`** tests whatever is behind an OpenAI-compatible endpoint.
- **A course's setting for who its learners are now applies on your own server.** A package with `identify: code` opens only for
  personal codes on its class list, which a package doesn't carry, so add one in the console, on People; one with `identify: ask` asks
  for a name or ID. Each browser stays the default, and a class code or a proxy's header still wins. To keep the old behaviour for a
  package, set `identify` to `browser`.
- **Hardened after an adversarial review.** A page that isn't for everyone holds only its panels' names until the server knows who is asking (`/panels`). A package added in the browser can't start a program, take another course's address or turn on its own chat page, and an image at another address is dropped from it. Going back to a version keeps who can get in. New limits: wrong tokens per address, new learners per address and per course, large messages with no stated size. `--trust-proxy` counts a proxy's visitors apart. A `start` server on this computer answers only to its names. A store's files are its owner's alone. A survey's host gets an ID that signs in to nothing.
- **People, Share and Progress in the console.** A class list with personal codes, cards and a CSV; sections, with their own links, help
  level, note and opening; a QR code and a poster; who has done what, one learner's work, and what to look at, with a suggested change
  accepted in one button. A name never reaches a model. Scaffolds and images now also install `uqr`, which draws the QR codes.

## 0.2.0

The first version as its own repository.

- **Models, set up in the browser.** `/console` is the Engine's own pages, behind the teacher's token and session; its first
  is Models. Add any OpenAI-compatible provider, test it, and say what each model is for, as seven roles, each on its own
  provider and key. Keys are encrypted at rest, with `VIABLE_ENGINE_SECRET` or a key in the store's folder, and never reach a
  browser. The environment and the model flags keep working and win. `serve` with no agents starts, and sends you there.
- **What a model makes possible turns on, on any target.** Voice on the learner pages (dictation, voice messages and
  conversations) through `/audio/transcriptions`, reading aloud through `/audio/speech`, a learner's photos and PDFs for a
  reply model switched on as reading them, pictures from an Image step on the page, and knowledge search by meaning through
  `/embeddings`, kept per file and falling back to keywords. `inspect` and `GET /v1/server` (so `verify`) report what is on and
  off and why. A models file also takes `transcribe`, `picker`, `meaning` and `reads`. Replies reach a page and `stream: true`
  word by word where the endpoint streams.

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
  `VIABLE_ENGINE_ALLOW_COMPONENTS`). If you run an MCP component from a file, add the flag. `inspect` says
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
- **Your own server**: `viable-engine serve` answers apps' agent runs as VIABLE does
  (`POST /v1/agents/{slug}/runs`, reading a run back), with a token, limits, memory per pseudonymous
  learner and one log line per run; a `Dockerfile` serves `/agents` ([self-hosting.md](engine/docs/self-hosting.md)).
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
  `on_error: continue` goes on without it. `runAgent` and `viable-engine run` call HTTP components
  and MCP servers; `validateGraph(graph, { componentRuns })` lets a host allow fewer.
  `agent.schema.json` adds `component` to the step types: files without one need no change. A step
  component's answer from `callComponent` is read like the other slots': only `output` (text cut to
  20,000 characters) and `flags` (at most 20 `{ label, reason }`).
- **`viable-engine try`, and no command at all**: the real pages on this computer, with a panel showing what the
  AI did with each message. Scripted replies without a key, your own model with one. A scripted tour, and a static
  copy for a website. `serve --panel` gives the same panel to the token holder; `test --html` shows a run as a page.
  The engine tells `hooks.onVettingDraft` and `hooks.onVettingRound` as a review happens.
- **The learner pages are in the core** (`src/learner/`) and served by `serve` and every scaffold, at VIABLE's paths
  (`server/learner.js`). Course packages and agent files may carry `profile` and `chat_page`; a package's websites
  may carry a `snapshot`, `path_prefix` and `include_subpages`; knowledge bases `file_links` and `search_mode`; a
  course `shared_devices`. `viable-engine knowledge refresh`, `records export` and `forget`; `serve --class-code-env`
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
