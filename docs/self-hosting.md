# Running VIABLE agents on your own server

Build an agent or a course on VIABLE's hosted platform, then run it on a machine you control, with
your own model keys. `viable-harness serve` answers your apps the way VIABLE answers their agent
runs: the same address shape, the same request fields, the same results and errors. This page goes
from VIABLE to your server, step by step, and says what changes.

Read [deploying.md](deploying.md) too before learners use it: it covers consent, privacy laws, data
agreements with model providers, and retention.

## 1. Download the course with its files

This is the shortest path, and it keeps the course's knowledge.

1. On VIABLE, open **Teach → Courses** and the course.
2. Press **Download as package**, then **With its files (.zip)**. Only the project's owners and
   editors can.
3. You get `<course>.viable.zip`.

The zip holds `package.viable.json` and, under `files/`, the files it names:

- the course's settings, units and activities, with each activity's How the AI helps;
- each agent the activities use: its published version, or its draft if it was never published;
- the question sets of its Questions panels;
- the knowledge bases its agents search: their uploaded files, pasted texts as `.md` files, and the
  addresses of their websites;
- the PDFs its Reading panels open;
- for each file in another format, such as a PDF or a Word file, the text VIABLE read from it, as a
  Markdown file (the file's `text_path`). A zip downloaded before VIABLE added these has none:
  download it again.

It never holds learners, class lists, sections, keys, logs or study data. A Fetch URL step's headers
are left out. The zip is at most 25 MB; a course with more files has to be downloaded without them
(see step 2 for supplying knowledge yourself).

Serve the zip as it is:

```sh
viable-harness serve course.viable.zip --model llama3.1
```

The harness reads the files from the archive. It never unpacks it, and it refuses a file named
outside the archive, a `package.viable.json` over 2 MB, a file over 15 MB and a zip over 50 MB.

Each of the course's agents answers at its slug on VIABLE, so your app's address keeps its path. An
agent that was never published there, or a package downloaded before packages carried slugs,
answers at its ref in the package instead (`agent-1`, `agent-2`, ...). The server prints each
address with the agent's name when it starts, and `GET /v1/agents` lists them.

A course's agent runs with the How the AI helps settings of the first activity that uses it, as its
learners meet it in the course. VIABLE's `/runs` route runs the published agent without them.

## 2. Or export one agent, and supply its knowledge

1. On VIABLE, open **Build → Agents**.
2. Open the agent's **⋯** menu and choose **Export JSON**.
3. You get `<slug>.agent.json`.

The file holds the agent's workflow as it is in the editor (its draft, which may be newer than its
published version), its profile without its avatar, and what it needs: the models it names, the
knowledge bases it searches, and the published agents its Sub-agent steps call. A knowledge base
comes as its settings and website addresses. Its uploaded files and pasted text are not in the file.

So you supply the files. Put each knowledge base's files in a folder, and map the knowledge base's
ID to it. The ID is `kb_` and a UUID, as the agent's Knowledge steps name it; the file's
`requires.knowledge_bases` gives each ID with its name.

```sh
viable-harness serve essay-coach.agent.json --model llama3.1 \
  --knowledge kb_3f1c2a9e-3b7d-4c55-9a0e-2d8f1b4c7e10=./guides
```

The agent answers at its file's name, `essay-coach`, which is its slug on VIABLE, so your app's
address stays the same.

- The harness reads text, Markdown, CSV, JSON and HTML files in the folder and its subfolders. It
  leaves out hidden files, links, and every other format, and says which when it starts. Save a PDF
  or Word file as text or Markdown first.
- `--knowledge` works for a course package too: `--knowledge kb-1=./folder` replaces the package's
  knowledge base `kb-1` with the folder.
- A Sub-agent step calls only another agent of the same course package. In an agent file it fails.

Several files at once work too: `viable-harness serve course.viable.zip coach.agent.json`, or a
folder of them. Two agents with the same slug stop the server from starting.

## 3. Set your model keys

The harness calls an OpenAI-compatible endpoint: OpenAI itself, or an open-weight model behind vLLM,
Ollama, llama.cpp or LM Studio.

```sh
export OPENAI_BASE_URL=http://127.0.0.1:11434/v1   # without it: https://api.openai.com/v1
export OPENAI_API_KEY=...                          # if your endpoint needs one
```

Agents name VIABLE's models, such as `gpt-oss-120b`, or VIABLE's aliases, such as `viable-3`. Your
endpoint may not know them. `--model <id>` replaces every chat model the agent names.
`--speech-model` and `--image-model` do the same for Speech and Image steps.

Every learner's message goes to this endpoint. Have an agreement with its provider first
([deploying.md](deploying.md)).

## 4. Start the server

```sh
export VIABLE_HARNESS_TOKEN=$(openssl rand -hex 32)
viable-harness serve course.viable.zip --model llama3.1 --token-env VIABLE_HARNESS_TOKEN \
  --memory-dir ./memory --media-dir ./media
```

| Option | What it does | Default |
| --- | --- | --- |
| `--port`, `--host` | Where it listens. | `8080`, `127.0.0.1` |
| `--token-env <NAME>` | The environment variable that holds the token callers must send. Without it, the server refuses any host but this machine (`127.0.0.1`, `localhost`, `::1`). | none |
| `--cors <origin>` | The one web page origin allowed to call it from a browser. Without it, browsers can't. | none |
| `--max-body <bytes>` | The largest request body. | 1048576 (1 MB) |
| `--timeout <seconds>` | The longest a run may take. Calls to your endpoint still waiting are cut off. | 300 |
| `--max-runs <n>` | How many runs at once. More get 429. | 4 |
| `--memory-dir <dir>` | Keeps Memory steps' facts, one file per learner. | Memory steps are skipped |
| `--media-dir <dir>` | Keeps the audio and pictures Speech and Image steps make. | a new temporary folder per run |
| `--knowledge <id>=<folder>` | A knowledge base kept in a folder. Repeat it for each. | none |
| `--model`, `--speech-model`, `--image-model` | Replace the models the agents name. | as named |
| `--no-speech` | Speech steps pass on without reading aloud. | off |

When it starts, it prints each agent's address. It also prints what will fail, such as a knowledge
base with no folder, or one holding a website.

Each run writes one JSON line to standard output: the time, the request ID, the agent, the run ID,
the status, the error code if any, the duration, the model calls and the tokens. It never holds
what the learner wrote or their ID.

Stop it with Ctrl-C, or `SIGTERM`.

## 5. Call it from your app

Send the request you send to VIABLE. Change the address and the key.

```sh
curl http://127.0.0.1:8080/v1/agents/agent-1/runs \
  -H "Authorization: Bearer $VIABLE_HARNESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input": "Can you help me start my essay?", "user": "s-0412", "include": ["trace"]}'
```

The answer is VIABLE's: `object: "agent.run.result"`, `run_id`, `output` (with `text`, and
`citations` when the reply cites knowledge), `usage`, `cost` and, with `include`, `trace`. An error
is VIABLE's `error` object with `message`, `type`, `code` and `request_id`. Branch on `code`.

| Route | What it does |
| --- | --- |
| `POST /v1/agents/{slug}/runs` | Runs one turn, as on VIABLE. |
| `GET /v1/agents/{slug}/runs/{run_id}` | Reads a run back, with its trace, as on VIABLE. The server keeps the newest 500 runs, until it stops. |
| `GET /v1/agents/{slug}` | The agent's slug, name and description, as on VIABLE. `published_version` is null. |
| `GET /v1/agents` | Lists the agents it serves. VIABLE has no such route for apps. |
| `GET /health` | `{"status": "ok", "agents": <n>}`, without the token, for a load balancer. |

## 6. Put it behind HTTPS

The server speaks plain HTTP. Keep it on `127.0.0.1` and put a web server in front of it that has a
certificate. With [Caddy](https://caddyserver.com), which gets one for you:

```text
harness.example.edu {
  reverse_proxy 127.0.0.1:8080
}
```

Keep the token on your app's server. Never put it in a web page or a mobile app: anyone who has it
can run your agents on your model keys. With `--cors`, a web page calls the server directly, so the
page needs the token. Only do this on a network you trust.

## Run it in a container

`Dockerfile` in the harness builds an image that serves the files mounted at `/agents` on port 8080,
to callers with the token in `VIABLE_HARNESS_TOKEN`. It runs as a user without root. Options after
the image name are added.

```sh
docker build -t viable-harness .
docker run -d -p 127.0.0.1:8080:8080 \
  -v "$PWD/agents:/agents:ro" -v viable-data:/data \
  -e VIABLE_HARNESS_TOKEN -e OPENAI_BASE_URL -e OPENAI_API_KEY \
  viable-harness --model llama3.1 --memory-dir /data/memory --media-dir /data/media
```

A knowledge folder is another mount: `-v "$PWD/guides:/knowledge/guides:ro"` and
`--knowledge <id>=/knowledge/guides`.

## Memory, and forgetting a learner

With `--memory-dir`, a run's `user` is the learner for Memory steps. Their facts are kept in
`<memory-dir>/<user>.json`: each fact, its ID and when it was saved, nothing else. A learner keeps
their newest 200 facts. Without `user`, Memory steps are skipped.

- `user` must be a pseudonymous ID: 1 to 128 letters, digits, dots, dashes, underscores or colons,
  starting with a letter or digit, such as `s-0412` or `my-app:student-0001` (kept as
  `my-app%3Astudent-0001.json`). A name or an email address gets 400 `invalid_learner`. VIABLE
  accepts any ID of up to 128 characters without control characters.
- Every agent this server runs shares the folder: a learner's facts from one agent are recalled by
  another. VIABLE keeps them per agent. Use a server, or a folder, per agent to keep them apart.
- To forget a learner, delete `<memory-dir>/<user>.json`. To forget everyone, delete the folder.
- Without `--memory-dir`, `user` is checked as VIABLE checks it and otherwise not used.

## What is different from VIABLE

The request:

- **`input`, `message`, `messages`** work as on VIABLE, as text: a string, text parts, or messages.
  A picture or file part gets 400 `unsupported_input`.
- **There are no server conversations.** Every reply has `conversation_id: null`. Send
  `conversation_id` and you get 400 `unsupported_agent_parameter`. Send the earlier messages instead:
  `messages` with `history_mode: "client"`, as on VIABLE. `messages` with two or more entries and no
  mode also works: the ones before the last are the history.
- Without conversations, an Ask step's question comes back with `awaiting_input: true`, but the next
  message starts the agent from the beginning. State steps keep nothing between turns, an Input
  step's `"summarize"` history isn't kept, and pictures aren't kept by number for later turns.
- **`context`** is checked as on VIABLE (an object, at most 128 KiB, 16 levels deep). The fields
  VIABLE composes itself, such as the teacher's instructions, are removed, as on VIABLE. It isn't
  kept as what the learner had open.
- **`user`**: see Memory. It makes no learner record.
- **`learner_group`** is checked as on VIABLE, then not used.
- **`sources`** and **`include: ["trace"]`** work as on VIABLE.
- **`stream: true`** sends `run.started`, `run.delta` (the reply, whole, when it goes straight to the
  reader), then `run.completed` with the same result, or `run.failed`. There are no `run.progress`,
  `run.transcript` or `run.audio` events, and no token-by-token reply: the harness asks your endpoint
  for whole answers.
- **`Idempotency-Key`** is ignored: a retry runs the turn again. **`X-Platform-ID`** and
  **`X-Platform-Name`** are ignored.
- The body may be 1 MB (`--max-body`); VIABLE takes 12 MB.

The result:

- `cost` is always 0: your endpoint, your bill. `input_assets` is empty. There is no `transcript`,
  and no `X-Viable-Billing` header.
- A picture's or a recording's `url` in `output.attachments` is the file's path on the server, in
  `--media-dir`, not a web address. Serve that folder yourself if your app needs the files.
- A citation links to its source only when the package names the file by a web address. Files from a
  zip or a folder have no link.

Errors:

- Your endpoint's errors are 502 `provider_error` (429 when the endpoint says it is busy), with the
  endpoint's own reason, since it is yours. A run past `--timeout` is 504 `provider_timeout`.
- More runs than `--max-runs` get 429 `rate_limit_exceeded` with `Retry-After: 1`.
- A missing or wrong token is 401 `invalid_api_key`.
- An agent's limits are its own `run_limits`, else 20 model calls and 5 minutes. VIABLE gives an
  app's run 60 seconds unless the agent says otherwise.
- There are no 402, 403, 409, 410 or 424 errors: no credits, keys per agent, idempotency or model
  catalog.

Routes it doesn't serve: `/chat/completions`, `/jobs`, `/runs/{run_id}/rating`, the hosted chat
pages and `embed.js`.

### Knowledge search

VIABLE searches a knowledge base by keywords and by meaning together (embeddings, then a reranking
model), unless the knowledge base is set to keywords only. It brings back a passage's neighbours from
the same section, up to 4,000 characters. It converts PDFs, Office files and pictures to text, reads
and refreshes websites, and can link a citation to an uploaded file, at a PDF's page.

The harness searches by keywords only (BM25), as VIABLE does a keyword-only knowledge base, in
1,200-character passages, without neighbours. It reads text formats only: a PDF or Office file through
the text VIABLE packaged with it, else not at all. It never reads a website. A knowledge base with a
website address, or a file it can't read, fails every search that includes it, so map it to a folder
with `--knowledge`: save the pages or files you want as text there.

### What you don't get without VIABLE

- the editor, its tests and run history;
- accounts, projects, API keys, and limits per key;
- courses, class lists, sections and learner pages;
- consent, studies and their conditions;
- the Learners view, the research export and its measures over time;
- request logs, and each run's steps kept for you to read later;
- hosted knowledge search, file conversion and website crawling;
- transcription: Transcribe steps are skipped, since the server takes text;
- background jobs, idempotent retries and ratings;
- credits and billing.

The agent engine, VETTING, How the AI helps and the formats are the same code VIABLE runs.
