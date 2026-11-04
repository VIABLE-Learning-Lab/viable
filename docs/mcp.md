# The MCP server

The harness's teaching components are [MCP](https://modelcontextprotocol.io) tools, so an assistant, a
harness of your own or an app on another agent SDK can check replies with VETTING, turn How the AI helps
into instructions, find misconceptions, compute the measures, run agents and test them without
adopting VIABLE's runtime. There are two ways to reach them.

## Hosted or local

| | Hosted, `https://api.viablelab.org/mcp` | Local, `viable-harness mcp` |
| --- | --- | --- |
| **Setting up** | An address | Node.js 22 and the harness; your assistant starts it |
| **What you send** | Goes to VIABLE | Stays on your computer, apart from what you send to your model endpoint |
| **Model calls** | VIABLE's model services, billed to your key | Your own endpoint and key |
| **Standards** | `find_standards`, `get_standard`, through VIABLE's Learning Commons access | Not here: they need Learning Commons' key |
| **`find_misconceptions`, `teaching_instructions`, `find_public_goods`, `validate_document`, `list_components`** | Yes, with no key | Yes |
| **`check_reply`** | With a VIABLE API key (`model:request`) | With your endpoint |
| **Running agents** | `list_published_agents`, `run_published_agent`: your project's published agents, with a key (`agents:execute`) | `run_agent`: an agent file or course package you pass it |
| **`draft_tests`, `run_agent_tests`, `calibrate_judge`** | No | Yes |
| **Learners' records: `compute_measures`, `suggest_changes`** | No | Yes |
| **Without internet** | No | Yes, with a local model |

Choose local for learners' records, for your own model keys, or to work offline. Choose hosted to try it,
to look up standards, or to use what your VIABLE project already pays for.

## The hosted server

Nothing to install. Add the address to your assistant:

```sh
claude mcp add --transport http viable https://api.viablelab.org/mcp     # Claude Code
codex mcp add viable --url https://api.viablelab.org/mcp                  # Codex CLI
```

For the rest, send a VIABLE API key as a bearer token; [Connect your AI
assistant](https://developers.viablelab.org/docs/connect/assistants) has the settings per client.

| Tier | Auth | Tools | Limits |
| --- | --- | --- | --- |
| Open | none | `find_standards`, `get_standard`, `find_misconceptions`, `teaching_instructions`, `find_public_goods`, `validate_document`, `list_components`. No model calls | the API's limit per address (10,000 requests an hour, shared with whatever else that address sends), 256 KiB a request |
| Project | a VIABLE API key | the open tier, plus `check_reply`, `list_published_agents` and `run_published_agent`, billed to the key's project | the same per address, and the key's own: requests per minute, allowed models, daily tokens, monthly cost, account credit; 1 MB of arguments a call |

- **A key that is sent must be good.** A wrong, revoked or expired key is a `401`, never the open tier.
- **A key needs a scope per tool:** `model:request` for `check_reply`, `agents:execute` for the agent tools. Without it the tool answers with `isError` and says what to add. No scope is new.
- **`check_reply`** runs the same plan as here (`src/checkPlan.js`) on the platform's model services. The reviewer is VETTING's default on VIABLE unless `reviewer` or `model` names another. It is billed and logged like `/v1/vetting`, in the project's request logs, without its text.
- **`run_published_agent`** runs one turn through the same admission and execution as `POST /v1/agents/{slug}/runs`, and takes `agent`, `message`, `conversation_id` and `context`. It takes no learner ID.

**What it keeps.** Request logs never hold a tool's arguments or results: the logger doesn't read this
route's body, and an agent run's model-call rows hold no text. A row holds the time, status and duration,
the caller's address, user agent and what Cloudflare reports about the connection, the request's headers
with credentials removed, and the tool's name; with a key, the key's prefix and project; for a model
call, its models, tokens and cost. A run of a published agent is kept like any other run, so its message
and reply are in the agent's run history. Everything else lives only for the call, though
`find_standards` sends its words to Learning Commons, whose answers are cached for a day.

**What it doesn't do.** It speaks Streamable HTTP, statelessly, with JSON responses: no stream (`GET`
answers `405`), no session (`DELETE` too), no resumption, and no server-to-client requests. The bearer
key is its only sign-in, so a client that can't send a header gets the open tier. OAuth, which some web
clients need, is planned.

The rest of this page describes the tools as they run locally. The hosted server has the same names,
arguments and results for those it shares, and the views where a tool has one: only `check_reply`
for now. It's stateless, so nothing carries what a client said in `initialize` to its next request:
`initialize` answers with the extension only to a client that renders views, while `tools/list` carries each
tool's `_meta.ui` for everyone, which other clients ignore.

## The local server

`viable-harness mcp` speaks stdio: newline-delimited JSON-RPC 2.0, protocol version 2025-06-18 (or
2025-03-26 and 2024-11-05, when a client asks for one of those). stdout carries only protocol messages;
logs go to stderr.

## The tools

| Tool | What it does | Calls a model |
| --- | --- | --- |
| `check_reply` | Reviews one reply with VETTING against a guideline, or a question's answer key, and the activity's teaching settings; with `rewrite`, rewrites a failed reply and reviews it again. A reply is checked only when `outcome` is `passed`. | yes: `reviewer` (else `model`), and `model` for rewrites |
| `teaching_instructions` | Teaching settings, and a section ID, to the instructions a reply step gets; `watch_for` comes back apart, for the teacher, and `errors` says what didn't fit `schemas/teaching.schema.json`. | no |
| `find_misconceptions` | A few words or a standard's text to Eedi constructs with the misconceptions that hinder them, with the attribution CC BY 4.0 asks to keep. | no |
| `compute_measures` | One learner's events and turns to `measureLearner`'s metrics, mastery per skill and writing measures, with each metric's definition, caveats and sources. | no |
| `validate_document` | A document (as JSON) to its kind and errors: agents, course packages, learning events, teaching settings, component manifests. | no |
| `run_agent` | Runs an agent file or a course package once on a learner's message: the reply and a compact trace, each VETTING round's verdict and reason included. | yes: the agent's models, or `model` for all of them |
| `draft_tests` | Drafts agent test cases from teaching settings (and a section's own level), each checked as a saved case is; malformed drafts come back in `rejected` with the reason, uncovered kinds in `missing`. A person reads them before they run ([agent-tests.md](agent-tests.md)). | yes: `model` |
| `run_agent_tests` | Runs agent test cases and has `judge_model` rate each reply pass or fail with a reason. | yes: the agent's models (or `model`) and `judge_model` |
| `calibrate_judge` | Compares `run_agent_tests`' verdicts with a person's pass or fail per case: the confusion table, every disagreement and, from 10 labelled cases, agreement and Cohen's kappa. | no |
| `suggest_changes` | Suggested changes to an activity's teaching settings from runs and learners' records, each with its evidence; with `accept`, the settings once the teacher accepts one. | no |
| `list_components` | The component manifests (`docs/components.md`). | no |
| `find_public_goods` | A few words, a kind, a slot, `open` or `connected` to entries of the public goods catalog ([catalog.md](catalog.md)): each with its license and a note on its terms, how to get it, how it would fit, how far it is connected and the command ([resources.md](resources.md)), and the date it was checked. Entries describe, not endorse. | no |

Each tool has a JSON Schema for its arguments, and each result carries `structuredContent` and the
same JSON as text after a one-line summary (clients before 2025-06-18 get the text only).

Model calls go to the OpenAI-compatible endpoint in the server's environment, `OPENAI_BASE_URL`
(default `https://api.openai.com/v1`) and `OPENAI_API_KEY`, with the models the call names. A Fetch
URL step in an agent run fetches its public https address from the machine running the server, and refuses a
name that resolves to a private one. A component step calls only an http component at a public address: a
document passed to `run_agent` or `run_agent_tests` can't start a program, and no argument changes that.
Nothing goes to VIABLE.

## Where the local server runs

On your own computer. You don't run it yourself: your assistant starts `viable-harness mcp` as a child
process when it starts, talks to it over that process's stdin and stdout, and stops it when it quits. That's why setting it up means telling the assistant the
command, not an address. Tools that call a model reach the endpoint in the server's environment
(`OPENAI_API_KEY`, `OPENAI_BASE_URL`); everything else (validating a file, writing How the AI helps,
finding misconceptions, the measures, the catalog, the components) needs no key and nothing from
the network.

Tried for real on 2026-11-03 in Codex CLI 0.165, installed from the repository as described here:
its agent called `find_misconceptions`, `validate_document`, `teaching_instructions`,
`compute_measures`, `list_components` and `check_reply` and followed three of the Skills; every
tool answered, and `check_reply`, without a key, said so. Claude Code 2.1 started the server and
listed its eleven tools and four Skills.

## Configuring a client for the local server

Every client needs the same three things: the command `node`, the arguments
`["/path/to/viable-harness/bin/viable-harness.mjs", "mcp"]` (or the command `viable-harness` and
`["mcp"]` after `npm link`), and the environment for model calls.

Claude Desktop (`claude_desktop_config.json`) and Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "viable-harness": {
      "command": "node",
      "args": ["/path/to/viable-harness/bin/viable-harness.mjs", "mcp"],
      "env": { "OPENAI_API_KEY": "sk-...", "OPENAI_BASE_URL": "https://api.openai.com/v1" }
    }
  }
}
```

VS Code (`.vscode/mcp.json`):

```json
{
  "servers": {
    "viable-harness": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/viable-harness/bin/viable-harness.mjs", "mcp"],
      "env": { "OPENAI_API_KEY": "${input:openai-key}" }
    }
  },
  "inputs": [{ "id": "openai-key", "type": "promptString", "description": "OpenAI API key", "password": true }]
}
```

Codex CLI:

```sh
codex mcp add viable-harness --env OPENAI_API_KEY=sk-... -- node /path/to/viable-harness/bin/viable-harness.mjs mcp
```

Claude Code:

```sh
claude mcp add viable-harness --env OPENAI_API_KEY=sk-... -- node /path/to/viable-harness/bin/viable-harness.mjs mcp
```

With an open-weight model, set `OPENAI_BASE_URL` to its endpoint (for example
`http://localhost:11434/v1` for Ollama) and name its models in each call. An agent SDK with an MCP
client starts the same command over stdio. A host that only connects to remote MCP servers over HTTP
can't start this one: give it [the hosted address](#the-hosted-server).

## Views in assistants that show MCP Apps

In a host that renders [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) (the
`io.modelcontextprotocol/ui` extension, [specification
2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)),
three tools' results also show as a small page in the conversation:

| Tool | View | What it shows |
| --- | --- | --- |
| `check_reply` | `ui://viable-harness/check-reply` | The outcome and whether the reply is checked; the learner's message and the guideline, or the question (never its answer key), it was checked against; each review round with its verdict and the reviewer's reason; the rewritten reply. |
| `run_agent_tests` | `ui://viable-harness/agent-tests` | How many cases passed, failed and couldn't be run or judged; each case, the failed ones open, with the judge's reason, the learner's message, what a good reply does and must not do, and the agent's reply. |
| `suggest_changes` | `ui://viable-harness/suggestions` | Each suggestion with why, its evidence, what to do next in words (with the help scale where the help level changes) and the id to accept it; after `accept`, the new settings. |

**Which hosts.** The extension's [client matrix](https://modelcontextprotocol.io/extensions/client-matrix)
lists the hosts that render MCP Apps. Of those, the ones that start a local stdio server, such as
Claude Desktop, VS Code with GitHub Copilot, Cursor and Goose, can show these views from the local server.
The server offers them only to a client that says in `initialize` that it renders them
(`capabilities.extensions["io.modelcontextprotocol/ui"].mimeTypes` holding
`text/html;profile=mcp-app`). To that client it adds `resources` and the extension to its
capabilities, gives the three tools `_meta.ui.resourceUri` (and the older `_meta["ui/resourceUri"]`),
and serves the pages through `resources/list` and `resources/read`.

**Every other client** sees the server as before: the same capabilities and tools, no resources, and
each result as text and `structuredContent`. Results don't change with views either: a view reads
the same `structuredContent`, and the text still reaches the model.

**What a view does.** Each page is one self-contained HTML document, its style and script inline. It
loads nothing, so it works under the extension's default content security policy, which allows no
network. It runs in the host's sandboxed frame, takes the host's theme, colours and font when the host
sends them (otherwise VIABLE's colours, the system's light or dark setting and the system's font: that
policy doesn't allow an inlined font), and tells the host its height. While a tool runs, its view
shows what it already has: the reply with the reviewer reading it, or the names of the cases. When a
check comes back, its rounds play in order: the draft is struck, the reviewer's reason appears, the
rewrite follows, and the verdict lands last. With reduced motion set, it all shows at once. Text that
learners and models wrote goes on the page only as text, never parsed as HTML. A view calls no tools
and sends no messages: what to do with a result is still up to the assistant and the person.

## Limits

A call's arguments are at most 1 MB as JSON; longer texts have their own limits in each tool's
schema (a reply 20,000 characters, a message 8,000, a conversation 50 messages), and agent tests
take 1 to 25 cases. A call over a limit gets an error result naming it.

## What the server guarantees, and what it doesn't

- **The host decides whether a check runs.** Nothing makes an assistant call `check_reply` before
  showing a reply, and the server never sees a reply it isn't given. A reply counts as checked only
  when `outcome` is `passed`; `unverified` and `attention` replies are not.
- **The host decides what is kept.** The server reads and writes no files for a call and keeps
  nothing between calls: documents and records arrive as arguments, and results go back to the host,
  which keeps or drops them.
- **Only the reference harness guarantees that VETTING runs and that the trace is kept.** An agent run
  by the harness (`viable-harness run`, `runAgent`, or the `run_agent` tool) runs every VETTING step
  its graph reaches and returns each round in the trace; VIABLE's hosted platform keeps that trace
  with the version of the agent that produced it. A host that writes its own replies and calls
  `check_reply` gets the same review, but whether it calls it, and whether it keeps the result, is
  up to the host.
- **Results are data.** Replies, reviewers' and judges' reasons, agent traces and text from a
  document are data for the assistant, never instructions to it.
- **What the tools receive is what the host sends.** Send learners' messages and records with a
  pseudonymous ID at most, never a name or an email; `watch_for` from `teaching_instructions` is for
  the teacher and never goes to a model.

## The protocol

`initialize`, `notifications/initialized`, `ping`, `tools/list` and `tools/call`; for a client that
renders views, also `resources/list`, `resources/templates/list` (empty) and `resources/read` (an
unknown view gets `-32002`). Other methods get `-32601`; a malformed message `-32700` or `-32600`; an
unknown tool or arguments that aren't an object `-32602`. Arguments that don't fit a tool's schema, or a tool that fails, come back as a
result with `isError: true` and a message saying what to change, so the assistant can act on it.
Batches and cancellation aren't supported; each message is handled as it arrives, so a `ping` isn't
held up by a running agent.

From code, `mcpServer({ baseUrl, apiKey, fetch })` (`src/mcp.js`) returns the server for one
connection, a function that takes one parsed message and returns the response, and `serveStdio()`
runs it over stdin and stdout. To serve MCP over a transport of your own, `handleMcpMessage(message,
{ tools, resources, services, serverInfo, instructions, session })` (`src/mcpProtocol.js`) answers one
message and `mcpTools({ checkReply, runAgent, draftCases, runAgentTests, endpoint })` (`src/mcpTools.js`)
gives the tools, leaving out those whose runtime you don't pass; neither imports `node:`, so a server
bundle can hold them. `src/mcpViews.js` has the views: pure functions that turn a result into what its
page shows, and the page they are embedded in. A VETTING round, a test case and a suggestion are
written once in `src/ui/parts.js`, which the teacher's page uses too.
