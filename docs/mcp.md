# The MCP server

`viable-harness mcp` serves the harness's teaching components as [MCP](https://modelcontextprotocol.io)
tools, so an assistant, a harness of your own or an app on another agent SDK can check replies with
VETTING, turn How the AI helps into instructions, find misconceptions, compute the measures, run
agents and test them without adopting VIABLE's runtime.

It speaks stdio: newline-delimited JSON-RPC 2.0, protocol version 2025-06-18 (or 2025-03-26 and
2024-11-05, when a client asks for one of those). stdout carries only protocol messages; logs go to
stderr.

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
| `find_public_goods` | A few words, a kind, a slot or `open` to entries of the public goods catalog ([catalog.md](catalog.md)): each with its license and a note on its terms, how to get it, how it would fit and the date it was checked. Entries describe, not endorse. | no |

Each tool has a JSON Schema for its arguments, and each result carries `structuredContent` and the
same JSON as text after a one-line summary (clients before 2025-06-18 get the text only).

Model calls go to the OpenAI-compatible endpoint in the server's environment, `OPENAI_BASE_URL`
(default `https://api.openai.com/v1`) and `OPENAI_API_KEY`, with the models the call names. A Fetch
URL step in an agent run fetches its public https address from the machine running the server.
Nothing goes to VIABLE.

## Where the server runs

On your own computer. You don't run it yourself and nothing hosts it: your assistant starts
`viable-harness mcp` as a child process when it starts, talks to it over that process's stdin and
stdout, and stops it when it quits. That's why setting it up means telling the assistant the
command, not an address. Tools that call a model reach the endpoint in the server's environment
(`OPENAI_API_KEY`, `OPENAI_BASE_URL`); everything else (validating a file, writing How the AI helps,
finding misconceptions, the measures, the catalog, the components) needs no key and nothing from
the network.

Tried for real on 2026-11-03 in Codex CLI 0.165, installed from the repository as described here:
its agent called `find_misconceptions`, `validate_document`, `teaching_instructions`,
`compute_measures`, `list_components` and `check_reply` and followed three of the Skills; every
tool answered, and `check_reply`, without a key, said so. Claude Code 2.1 started the server and
listed its eleven tools and four Skills.

A hosted server that assistants reach by address, with nothing to install, isn't built: it would
run on the VIABLE Developer Platform with a project's key.

## Configuring a client

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
client starts the same command over stdio. Hosts that only connect to remote MCP servers over HTTP,
such as ChatGPT's connectors, can't start this one: it speaks stdio only.

## Views in assistants that show MCP Apps

In a host that renders [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) (the
`io.modelcontextprotocol/ui` extension, [specification
2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)),
three tools' results also show as a small page in the conversation:

| Tool | View | What it shows |
| --- | --- | --- |
| `check_reply` | `ui://viable-harness/check-reply` | The outcome and whether the reply is checked; the learner's message and the guideline, or the question (never its answer key), it was checked against; each review round with its verdict and the reviewer's reason; the rewritten reply. |
| `run_agent_tests` | `ui://viable-harness/agent-tests` | How many cases passed, failed and couldn't be run or judged; each case, the failed ones open, with the judge's reason, the learner's message, what a good reply does and must not do, and the agent's reply. |
| `suggest_changes` | `ui://viable-harness/suggestions` | Each suggestion with why, its evidence, the setting it proposes and the id to accept it; after `accept`, the new settings. |

**Which hosts.** The extension's [client matrix](https://modelcontextprotocol.io/extensions/client-matrix)
lists the hosts that render MCP Apps. Of those, the ones that start a local stdio server, such as
Claude Desktop, VS Code with GitHub Copilot, Cursor and Goose, can show these views. The server
offers them only to a client that says in `initialize` that it renders them
(`capabilities.extensions["io.modelcontextprotocol/ui"].mimeTypes` holding
`text/html;profile=mcp-app`). To that client it adds `resources` and the extension to its
capabilities, gives the three tools `_meta.ui.resourceUri` (and the older `_meta["ui/resourceUri"]`),
and serves the pages through `resources/list` and `resources/read`.

**Every other client** sees the server as before: the same capabilities and tools, no resources, and
each result as text and `structuredContent`. Results don't change with views either: a view reads
the same `structuredContent`, and the text still reaches the model.

**What a view does.** Each page is one self-contained HTML document, its style and script inline. It
loads nothing, so it works under the extension's default content security policy, which allows no
network. It runs in the host's sandboxed frame, takes the host's theme and colours when the host
sends them (otherwise the system's light or dark setting), and tells the host its height. Text that
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
runs it over stdin and stdout. `src/mcpViews.js` has the views: pure functions that turn a result
into what its page shows, and the page they are embedded in.
