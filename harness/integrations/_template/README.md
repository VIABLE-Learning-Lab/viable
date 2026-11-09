# Component template

A detector over HTTP in plain Node, to copy when you propose a component
([docs/components.md](../../docs/components.md)). It marks the turns where a learner asks for the
answer, by a few phrases: it shows the shape of a component, not a method worth using.

| File | What |
| --- | --- |
| `manifest.json` | What it does, what it receives, where it runs, its license, citation, evidence and risk |
| `server.mjs` | `detect(payload)` is the method; `server()` serves it at `POST /detect` on 127.0.0.1 |
| `fixtures/input.json` | A synthetic learner's record, as the harness sends it |
| `fixtures/expected.json` | The marks it should answer with |

## Try it

From this folder, or from the copy `viable-harness component new <owner/name> --slot detector` made, in two terminals:

```sh
node server.mjs     # http://127.0.0.1:8787/detect
npx github:VIABLE-Learning-Lab/viable component manifest.json --input fixtures/input.json
```

`test/componentCalls.test.js` runs the same through `callComponent` on 127.0.0.1.

## Make it yours

1. Open an issue first, naming the work, its slot and its license.
2. Copy this folder to `integrations/<owner>-<name>/`.
3. Write the manifest: `receives` only what the method needs; `runs.entry` where it runs (an https
   address) and its host in `sends_to`; the license of its code and data; how to cite it; the
   three parts of its evidence kept apart; its risk from the review checklist; its maintainer.
   Check it with `node harness/bin/viable-harness.mjs validate manifest.json`.
4. Replace `detect` with your method, or point `runs.entry` at where it already runs. An MCP server
   instead: `"runs": { "kind": "mcp", "entry": "<tool name>", "server": { "command": "...", "args": [...] } }`,
   started in the manifest's folder.
5. Write fixtures from synthetic data, never a real learner's, with the answers they should give.
6. Add a test that runs your fixtures through `callComponent`, and run `npm test`.
7. Open a pull request, each commit signed off (`git commit -s`). A maintainer reviews it against
   the checklist in docs/components.md.

What each slot sends and expects back is in docs/components.md, "The slots that call one".
