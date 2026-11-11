# With your stack

> Commands here say `viable-harness`, from `npm i -g @viable-lab/harness`; or put `npx @viable-lab/harness` in its place.

If you already have an AI app or an agent, in any language or framework, there are two ways in that leave it as it is:

- **Change one URL.** The gateway stands in front of your model endpoint. Each call gets what its moment
  needs from a teacher's settings, each reply is checked before your app sees it, and a record is kept for
  the teacher's page.
- **Call it yourself.** `prepare` before your model, `check` and `record` after it, and agent tests in CI
  (`viable-harness test --endpoint`).

What goes in is chosen for each message: the teacher's goal and limit always, the teaching move for what the
learner is doing, and only the misconceptions and parts of a standard that message calls for. `--whole-settings`
sends everything the teacher set on every call; `--picker-model <id>` has a small model read the moment instead of
rules, for one more call. The `X-Viable-Moment` response header says what it read.

A recipe marked "Ran" was run as written against the gateway, with a small local stand-in for the model
endpoint and the versions named at it. None has run against a real model.

## Change one URL

Write the teacher's settings (`fractions.json`). `teaching` is [How the AI helps](../schemas/teaching.schema.json); a plain teaching
settings file, or a course package, works as well.

```json
{
  "title": "Adding fractions",
  "teaching": {
    "goal": "Students add fractions with unlike denominators.",
    "help": "hint",
    "watch_for": "Learners who add the denominators."
  },
  "guideline": "Never state the final answer. Guide the learner one step at a time.",
  "fallback": "Let's look at this one with your teacher."
}
```

Start the gateway in front of your endpoint. Name the reviewer: it turns the check on.

```bash
export OPENAI_API_KEY=sk-...
viable-harness gateway --upstream https://api.openai.com/v1 \
  --teaching fractions.json --reviewer-model your-reviewer-model --data-dir ./records
```

It says what it will do, then gives you the line to change:

```text
Gateway at http://127.0.0.1:8090/v1, in front of https://api.openai.com/v1.
  Upstream key: from OPENAI_API_KEY; the key a caller sends isn't used.
  Callers: this machine only (no token).
  Settings: one activity for every call (fractions.json).
  Checks: on, reviewer your-reviewer-model, up to 2 rewrites; a reply that doesn't pass is replaced by the fallback text.
  Records: in ./records, without what learners and the AI wrote (--keep-text keeps it); the teacher's page is at http://127.0.0.1:8090/teacher (any user name, and this password, shown once: ...).
Point your app at it: OPENAI_BASE_URL=http://127.0.0.1:8090/v1
```

Then call it as you call any OpenAI-compatible endpoint. Ran:

```bash
curl -i http://127.0.0.1:8090/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'x-viable-learner: s-0412' \
  -d '{"model": "your-model", "messages": [{"role": "user", "content": "Just give me the answer to 1/2 + 1/3"}]}'
```

### What comes back

Your endpoint's answer, with the reply it may have changed, and what the check did in `X-Viable-*`
headers and a `viable` field. In a stream the field is on the chunk with the `finish_reason`.

```json
"viable": {
  "run": "20261103T215017511Z-5887572c",
  "outcome": "passed",
  "checked": true,
  "delivered": "rewrite",
  "why": null,
  "rounds": 2,
  "added_ms": 26,
  "added_tokens": { "prompt": 36, "completion": 27, "total": 63 },
  "reviewer": "your-reviewer-model",
  "activity": null,
  "taught": true
}
```

| Header | Field | Says |
| --- | --- | --- |
| `X-Viable-Outcome` | `outcome` | `passed`, `unverified`, `attention` or `not_checked`. Only `passed` is checked (`checked: true`) |
| `X-Viable-Delivered` | `delivered` | `reply` (as your model wrote it), `rewrite`, `fallback`, or `tool_calls_only` (failed text was dropped from beside a tool call) |
| `X-Viable-Why` | `why` | Why it isn't `passed`: `checks_off`, `tool_calls`, `structured_output`, `no_text`, `upstream_error`, or the review's stop reason such as `MAX_ATTEMPTS_REACHED` or `VERIFICATION_ERROR` |
| `X-Viable-Rounds` | `rounds` | How many reviews ran |
| `X-Viable-Added-Ms` | `added_ms` | Time the check added |
| `X-Viable-Added-Tokens` | `added_tokens` | Tokens the check added. `usage` stays your first reply's own |
| `X-Viable-Reviewer` | `reviewer` | Which model reviewed. Use a different one from the reply's if you can |
| `X-Viable-Warning` | `warning` | `same_model` when one model wrote the reply and reviewed it: the check is weaker that way |
| `X-Viable-Run` | `run` | The call's name in the records |

| What happened | What your app gets |
| --- | --- |
| The review passes | The reply, exactly as written |
| It fails | A rewrite by your model, reviewed again, up to `--rewrites` times (default 2) |
| It never passes, or the reviewer is down | The `fallback` text, marked `unverified`. With `--on-unverified pass`, the reply, still marked `unverified` |
| A rewrite raises a safety concern | The model's caring reply, marked `attention`. It isn't reviewed |
| Your endpoint fails | Its own status and error, so your app's retry logic still works, or a 502 if it can't be reached. No fallback |
| No `--reviewer-model` | Replies pass through, streams too, marked `not_checked` |

Your app waits for each round, and `X-Viable-Added-Ms` says how long the gateway added. To wait less, use `--rewrites 0` or `1`, or a
faster `--reviewer-model`; for more checking, go the other way.

### Streaming

With checks on, the reply is held until it passes, then sent as a normal stream, so a failed draft never
reaches a learner. The first word arrives after the whole reply and its review. With checks off, the
stream passes through as it comes, and the headers are all that report on it.

### Tool calls

They go back to your app unchecked, and the text that comes after them is checked. Text beside a tool
call is checked too; if it fails, the tool call goes on without it.

### Which activity, which learner

| Header | Does | Without it |
| --- | --- | --- |
| `X-Viable-Activity` | Picks the settings from `--activities <dir>`: one `<activity>.json` per activity, and a package's activities by their titles (the gateway lists the names when it starts). Unknown names are refused | With `--activities`, the call is refused. With `--teaching`, every call gets those settings |
| `X-Viable-Learner` | Names the learner in the records. A pseudonymous ID: letters, digits, dots, dashes, underscores, colons. A name or an email is refused | The request's `user` if it fits that rule, else the call is kept with no learner |
| `X-Viable-Section` | Applies that section's own help level and note | The activity's |

A learner's ID never goes to a model: the `X-Viable-*` headers and the request's `user`,
`safety_identifier` and `prompt_cache_key` stop at the gateway. If a learner types their name, it goes to
the model as written: the gateway can't tell.

### Keys and tokens

| You start it with | Your app sends | The endpoint gets |
| --- | --- | --- |
| `OPENAI_API_KEY` set (or `--api-key-env NAME`) | Any API key: it isn't used | The gateway's key |
| That variable not set | Its own key | The app's key |
| `--token-env NAME` and a key | The token as its API key, or as `X-Viable-Token` | The gateway's key |
| `--token-env NAME` and no key | Its own key, and the token as `X-Viable-Token` | The app's key |

Without a token the gateway answers this computer only: `--host` refuses anything else, and it refuses another
name in `Host`, a proxy that says it passed the request on, and a post with another site's `Origin`. A token holds
on localhost too. It takes `application/json` only: a web page can't send that to another site without asking first.

### The teacher's page

Open `/teacher`. Your browser asks for a password: it's the token, or with no token the one the gateway printed
when it started, and any user name will do. It always asks, because through a local proxy every visitor would
look like this computer. With several activities it asks which. Or from the folder:

```bash
viable-harness view ./records --out page.html
viable-harness suggest ./records
```

With `--activities`, read one activity's at a time: `./records/gateway/<activity>`.

The page shows How the AI helps, what the check did with each reply, each learner's measures and suggested
changes. Anyone with the token can read it.

Records hold no text from the learner or the AI unless you start the gateway with `--keep-text`. Without
it they hold the learner's ID, times, word counts, outcomes, token counts and a hash of how the conversation
opened (to tell conversations apart). The teacher's page then shows how each check ended and how many tries it
took, but not the reviewer's reasons: a reason is a model's words about a reply, and it can quote it.
With `--keep-text` the page shows them.

The gateway deletes nothing by itself: what it keeps in `--data-dir` stays until you delete it.
`viable-engine forget <id> --data-dir ./records` takes one learner's, or delete their two folders: `gateway/<activity>/records/<id>` and
`gateway/<activity>/runs/<id>` (a `:` in an ID is `%3A` in the folder's name). On another store, the same
keys.

### On any cloud

`gatewayHandler(options)` from `src/gateway.js` returns `(Request) => Response` and imports nothing from
Node. A store is four functions (`get`, `put`, `delete`, `list`). Ran locally in `wrangler dev` 4.148.0
(not deployed), with a KV namespace bound as `RECORDS`:

```js
import { gatewayHandler } from './viable-harness/src/gateway.js';
import settings from './fractions.json';

const kvStore = (kv) => ({
  get: (key) => kv.get(key, 'json'),
  put: (key, value) => kv.put(key, JSON.stringify(value)),
  delete: (key) => kv.delete(key),
  list: async (prefix) => (await kv.list({ prefix })).keys.map((item) => item.name)
});

let handle;
export default {
  fetch(request, env, ctx) {
    handle ??= gatewayHandler({
      upstream: env.UPSTREAM, apiKey: env.OPENAI_API_KEY, token: env.GATEWAY_TOKEN,
      teaching: settings, reviewerModel: env.REVIEWER_MODEL, store: kvStore(env.RECORDS)
    });
    return handle(request, { waitUntil: (work) => ctx.waitUntil(work) });
  }
};
```

KV's `list` returns 1,000 keys at a time, so page through it once an activity has more.

## Your client or framework

Each of these points at the gateway and sends the two headers. Each ran, with a held reply and a rewrite.

**OpenAI Python** (`openai` 3.44.0, streaming and tool calls too):

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8090/v1", api_key="unused")
reply = client.chat.completions.create(
    model="your-model",
    messages=[{"role": "user", "content": "Help me with 1/2 + 1/3"}],
    extra_headers={"X-Viable-Activity": "fractions", "X-Viable-Learner": "s-0412"},
)
print(reply.choices[0].message.content, reply.viable["outcome"])
```

**OpenAI Node** (`openai` 7.49.0, streaming too):

```js
import OpenAI from 'openai';

const client = new OpenAI({ baseURL: 'http://127.0.0.1:8090/v1', apiKey: 'unused' });
const reply = await client.chat.completions.create(
  { model: 'your-model', messages: [{ role: 'user', content: 'Help me with 1/2 + 1/3' }] },
  { headers: { 'X-Viable-Activity': 'fractions', 'X-Viable-Learner': 's-0412' } }
);
console.log(reply.choices[0].message.content, reply.viable.outcome);
```

**LangChain** (`langchain-openai` 1.7.3, `invoke` and `stream`). **LangGraph** (`langgraph` 1.2.19) takes
this `llm` in a node as it is:

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="your-model", base_url="http://127.0.0.1:8090/v1", api_key="unused",
    default_headers={"X-Viable-Activity": "fractions", "X-Viable-Learner": "s-0412"},
)
print(llm.invoke("Help me with 1/2 + 1/3").content)
```

**OpenAI Agents SDK** (`openai-agents` 0.24.0). It uses `/v1/responses` by default, which the gateway
refuses, so name the chat completions model. Its tracing sends runs to OpenAI unless you turn it off:

```python
import asyncio
from openai import AsyncOpenAI
from agents import Agent, OpenAIChatCompletionsModel, Runner, set_tracing_disabled

set_tracing_disabled(True)
client = AsyncOpenAI(base_url="http://127.0.0.1:8090/v1", api_key="unused",
                     default_headers={"X-Viable-Activity": "fractions", "X-Viable-Learner": "s-0412"})
agent = Agent(name="Tutor", instructions="You are a friendly tutor.",
              model=OpenAIChatCompletionsModel(model="your-model", openai_client=client))
print(asyncio.run(Runner.run(agent, "Help me with 1/2 + 1/3")).final_output)
```

**Vercel AI SDK** (`ai` 7.0.162, `@ai-sdk/openai` 4.0.108, `generateText` and `streamText`). Use
`openai.chat(...)`: plain `openai(...)` may choose `/v1/responses`:

```js
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const openai = createOpenAI({
  baseURL: 'http://127.0.0.1:8090/v1', apiKey: 'unused',
  headers: { 'X-Viable-Activity': 'fractions', 'X-Viable-Learner': 's-0412' }
});
const { text } = await generateText({ model: openai.chat('your-model'), prompt: 'Help me with 1/2 + 1/3' });
console.log(text);
```

**LlamaIndex** (`llama-index-llms-openai-like` 0.1.3, `chat`):

```python
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai_like import OpenAILike

llm = OpenAILike(
    model="your-model", api_base="http://127.0.0.1:8090/v1", api_key="unused", is_chat_model=True,
    default_headers={"X-Viable-Activity": "fractions", "X-Viable-Learner": "s-0412"},
)
print(llm.chat([ChatMessage(role="user", content="Help me with 1/2 + 1/3")]).message.content)
```

`GET /v1/models` and `POST /v1/embeddings` pass through, so an app that embeds on the same endpoint keeps
working. Other OpenAI routes get a 404 that says so.

## The parts

### A check as a guardrail

From JavaScript. Ran:

```js
import { checkReply } from './viable-harness/src/index.js';

const checked = await checkReply({
  reply: draft, message: learnerMessage, guideline: 'Never state the answer.',
  rewrite: 1, model: 'your-model', reviewer: 'your-reviewer-model',
  baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY
});
// Only `passed` is checked. checked.reply is the text to show: it may be a rewrite.
if (!checked.passed) showFallback();
```

From any language, over the gateway. Ran from Python with no dependency:

```python
import json, urllib.request

def post(path, body):
    request = urllib.request.Request(f"http://127.0.0.1:8090{path}", json.dumps(body).encode(),
                                     {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(request))

checked = post("/v1/check", {"reply": draft, "message": learner_message,
                             "guideline": "Never state the answer.", "rewrite": 1, "model": "your-model"})
print(checked["outcome"], checked["reply"])
```

`/v1/check` takes `reply`, `message`, `history`, `guideline`, `reference`, `question`, `answer_key`,
`key_concepts`, `explanation`, `instructions`, `teaching`, `section`, `rewrite`, `model` and `reviewer`. The
reviewer defaults to the gateway's. It keeps no record.

### Instructions from How the AI helps

Add them after your reply model's own instructions. Keep `watch_for` for the teacher: never send it to a
model. Ran:

```python
taught = post("/v1/teaching/instructions", {"teaching": {"goal": "Students add fractions.", "help": "hint"}})
system_prompt = f"{my_prompt}\n\n{taught['instructions']}"
```

In JavaScript: `teachingContext(settings, section)?.text`. Without `teaching`, the route uses the activity
in `X-Viable-Activity`, or the gateway's only one.

### Misconceptions

Eedi's Misconceptions Graph, from the harness's own copy: math only, no model, no network beyond the
gateway. Keep `source.attribution` with anything you copy (CC BY 4.0). Ran:

```python
found = post("/v1/misconceptions", {"text": "adding fractions with unlike denominators"})
for construct in found["data"]:
    print(construct["description"], [item["description"] for item in construct["misconceptions"]])
```

These routes, like everything on the gateway but `/health`, need the token when it has one.

### Agent tests in CI

`viable-engine test` exits non-zero when a case fails or can't run, so the step fails with it. Ran, with
a passing case, a failing one and an endpoint that's down. It runs a VIABLE agent file, so to test your
prompt with a teacher's settings, put it in a one-step file (`tutor.agent.json`):

```json
{
  "format": "viable.agent",
  "format_version": 1,
  "name": "Tutor",
  "graph": {
    "entry": "write",
    "nodes": [
      { "id": "write", "type": "llm", "config": { "model": "your-model", "system": "You are a friendly tutor." }, "next": "out" },
      { "id": "out", "type": "output", "config": { "text": "{{write.content}}" } }
    ]
  }
}
```

Cases (`cases.json`) say what a good reply does; [agent-tests.md](agent-tests.md) has the rest:

```json
{
  "format": "viable.agent-tests",
  "cases": [
    { "name": "No answers", "messages": [{ "role": "user", "content": "What is 1/2 + 1/3?" }], "rubric": "Guides without stating 5/6." }
  ]
}
```

```bash
viable-engine test tutor.agent.json cases.json --judge-model your-judge-model --teaching fractions-teaching.json
```

`--teaching` takes a plain teaching settings file. Point this at your model endpoint (`OPENAI_BASE_URL`),
not at the gateway: the judge's own verdicts shouldn't be checked. To test a prompt alone, with no agent
file (add `--teaching fractions-teaching.json` to give each turn what the Harness prepares for it):

```bash
viable-harness test cases.json --endpoint https://api.openai.com/v1 --endpoint-model your-model \
  --system "$(cat prompt.txt)" --judge-model your-judge-model
```

The workflow below hasn't run on GitHub. Each case costs a reply and a judge's call on your key:

```yaml
name: Agent tests
on: pull_request
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: |
          git clone --depth 1 https://github.com/VIABLE-Learning-Lab/viable.git ../viable
          (cd ../viable && npm install && npm link)
      - run: viable-engine test tutor.agent.json cases.json --judge-model your-judge-model
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

To test an app already deployed, not just its prompt, an agent file's `http` step can send the case to it
and an `output` step can read the answer (`{{ask.data.reply}}`). This hasn't run: that step reaches public
HTTPS addresses only, so a local app can't stand in.

## What the gateway can't do

- It sees only what passes through it. An app can call the model some other way, and nothing here can
  stop steps the app does elsewhere.
- A review is one model's judgment, so a reply that passed can still be wrong or unsafe.
- It checks text to the learner. Tool call arguments aren't checked. Structured output
  (`response_format` of `json_object` or `json_schema`) passes through as `not_checked`, because a rewrite
  or a fallback would break your code.
- The reviewer and rewrites read text only. Pictures in a message don't reach them, nor do tool results.
  A rewrite gets your system message, the conversation and the reviewer's reason, but not your tools or
  settings such as `temperature` and `max_tokens`.
- With checks on, `n` above 1 is refused.
- It takes chat completions only. `/v1/responses` is refused, so nothing goes past it unchecked.
- It has no limits per visitor: a token, a 20 MiB limit on a request and five minutes per call. Put
  anything a browser reaches behind your own server: it sends no CORS headers.
- The records are approximate where it can't know. Two conversations that open with the same words
  count as one. The measures that read how a message was written show "No data". The teacher's page reads
  the newest 500 runs and records. With `--data-dir`, run one process per folder.
- Consent, class lists and studies aren't here. See [deploying.md](../../engine/docs/deploying.md).
