# Running VIABLE agents on your own server or cloud

Build an agent or a course on VIABLE's hosted platform, then run it somewhere you control, with your
own model keys: Cloudflare, AWS, Google Cloud, Firebase, a container, or one machine. It answers your apps
the way VIABLE answers them: the same address shape, the same request fields, the same results and
errors. This page says how, and what changes.

Read [deploying.md](deploying.md) too before learners use it: it covers consent, privacy laws, data
agreements with model providers, and retention.

**Have a coding AI?** Give it the package and
[the deploying Skill](../skills/deploying-a-viable-course/SKILL.md), and say where it should run.
It does everything below, and stops to ask you about logins, money and learners' data.

## The whole path

```sh
viable-harness inspect course.viable.zip                         # what it needs, and what won't work
viable-harness deploy cloudflare course.viable.zip --out ./site \
  --map gpt-oss-120b=llama3.1 --reviewer-model qwen3             # a folder, with its own README
# ...the commands in ./site/README.md...
viable-harness verify https://its-address --token-env VIABLE_HARNESS_TOKEN
```

`inspect`, `deploy` and `verify` all take `--json`, and exit 0 when done, 1 when something failed, and 2
when the command was given wrongly.

## Where it can run

| | `node` | `docker` | `cloudflare` | `aws-lambda` | `cloud-run` | `firebase` |
| --- | --- | --- | --- | --- | --- | --- |
| **Runs on** | your machine | your containers | Workers | a function URL | a service | Functions, 2nd gen |
| **Keeps conversations in** | a folder | a volume | D1 | S3 | a bucket mounted as a folder | Firestore |
| **Streams replies** | yes | yes | yes | yes, on the function URL | yes | yes |
| **MCP components, once you name them** | yes | if its command is in the image | no | no | if its command is in the image | no |
| **Longest run** | 300 s here; yours to set | 300 s here; yours to set | 300 s here; no limit of its own while the caller stays connected | 280 s here; 900 s at most | 280 s here; 3600 s at most | 300 s here; 3600 s at most |
| **Largest package** | 50 MB | 50 MB | 25 MiB | 50 MB | 50 MB | 50 MB |
| **When the caller leaves a run nobody could find again** (a conversation in progress always finishes and is kept) | it stops | it stops | it stops, by Workers' `request.signal`; under `wrangler dev` a streamed run stopped within 30 s, and a plain one wasn't seen to | it goes on to its end: Lambda doesn't tell the function | it stops | it stops, if the platform closes the connection |
| **Two at once in one conversation** | one waits | one waits | on two isolates, one can be lost | one can be lost | on two instances, one can be lost | one can be lost |
| **Needs** | Node 22.9 | Docker | Workers' paid plan | the SAM CLI | gcloud | the Blaze plan |
| **How far it has been tried** | run for real | run for real under Docker with Colima, on arm64 and as `linux/amd64` under QEMU; not on Docker Desktop or a Linux server | run for real with `wrangler dev --local`; never on Cloudflare | handler invoked with function URL events; never on AWS | its image built and run under Docker; never on Cloud Run | run for real in the Functions emulator, with Firestore stubbed; never on Firebase |

Everywhere, the same engine, VETTING and How the AI helps run. Everywhere, recordings aren't taken
(Transcribe steps are skipped), websites in a knowledge base aren't read, and search is by keywords. On a
target with no lasting disk, audio and pictures come back inside the answer as `data:` URLs, and
aren't kept by number for later turns.

Each scaffold states its own store and limits in its `README.md`. `--store none` keeps nothing between
requests, on any target: no conversations, and Memory steps are skipped.

## 1. Download the package

**A course, with its files.** This is the shortest path, and it keeps the course's knowledge. On VIABLE,
open **Teach → Courses** and the course. Press **Download as package**, then **With its files (.zip)**.
Only the project's owners and editors can. You get `<course>.viable.zip`.

**An agent on its own, with its knowledge.** For a chat page with no course. On **Agents**, open the
agent's **⋯** menu, choose **Export…**, then **With its knowledge (.zip)**. It is the same kind of
package with no course in it, holding the agents and everything below that isn't about a course.

The zip holds `package.viable.json` and, under `files/`, the files it names:

- the course's settings, units and activities, with each activity's How the AI helps;
- each agent the activities use: its published version, or its draft if it was never published;
- the question sets of its Questions panels;
- the knowledge bases its agents search: their uploaded files, pasted texts as `.md` files, the
  addresses of their websites, and how VIABLE searched each;
- the PDFs its Reading panels open;
- for each file in another format, such as a PDF or a Word file, the text VIABLE read from it, as a
  Markdown file (the file's `text_path`). A zip downloaded before VIABLE added these has none:
  download it again.

It never holds learners, class lists, sections, keys, logs or study data. A Fetch URL step's headers
are left out. The zip is at most 25 MB; a course with more files has to be downloaded without them.
The harness reads files from the archive without unpacking it, and refuses a file named outside the
archive, a `package.viable.json` over 2 MB, a file over 15 MB and a zip over 50 MB.

**Or one agent.** On VIABLE, open **Build → Agents**, the agent's **⋯** menu, and **Export JSON**. You get
`<slug>.agent.json`: its workflow as it is in the editor (its draft, which may be newer than its
published version), its profile, and what it needs. A knowledge base comes as its settings and website
addresses, without its files. So you supply them: put each one's files in a folder, and map the
knowledge base's ID (`kb_` and a UUID, in the file's `requires.knowledge_bases`) to it, with
`--knowledge kb_3f1c...=./guides` on `deploy` or `serve`.

`--knowledge` takes text, Markdown, CSV, JSON and HTML files, subfolders included, and leaves out hidden
files, links, and every other format. Save a PDF or Word file as text or Markdown first. It works on a
course too: `--knowledge kb-1=./folder` replaces the package's knowledge base `kb-1`. It's also how to
supply a website's pages today: save them as text in a folder.

Each agent answers at its slug on VIABLE, so your app's address keeps its path. An agent never published
there answers at its ref in the package (`agent-1`, `agent-2`, ...). A course's agent runs with the How the
AI helps settings of the first activity that uses it.

## 2. See what it needs

```sh
viable-harness inspect course.viable.zip
```

It lists the agents and their addresses, every model by role (reply, reviewer, helper, speech, image,
transcribe), the knowledge bases (files, text copies, websites, how VIABLE searched each), the
activities, which steps can't run where, the settings it needs, warnings, and the next command.
`--json` gives the same exactly. `--map` and the other model flags show what they would change.

## 3. Replace the models

The harness calls an OpenAI-compatible endpoint: OpenAI itself, or an open-weight model behind vLLM,
Ollama, llama.cpp or LM Studio. Agents name VIABLE's models, such as `gpt-oss-120b`, or VIABLE's aliases,
such as `viable-3`. Your endpoint may not know them.

| Flag | What it replaces |
| --- | --- |
| `--map a=b` (repeat it) | The model `a`, in every role, with `b`. |
| `--reviewer-model <id>` | Every reviewer, whatever `--map` says. |
| `--model <id>` | Every chat model not in `--map`, and the reviewer too unless something else names it. |
| `--speech-model`, `--image-model` | Every Speech or Image step's. |
| `--models models.json` | Any of these from a file: `{"reply": "...", "reviewer": "...", "speech": "...", "image": "...", "map": {"a": "b"}}`. |

**A reviewer should be a second model.** VETTING has one model write a reply and another judge it, and the
point is that the judge didn't write it. When a reviewer ends up the same model as the step it checks,
`inspect`, `deploy`, `serve` and `run` warn you, whether `--model`, a map or the package itself did it.

Every learner's message goes to this endpoint. Have an agreement with its provider first
([deploying.md](deploying.md)).

## 4. Scaffold, and deploy

```sh
viable-harness deploy <target> course.viable.zip --out ./site \
  [--endpoint <url>] [--name <name>] [--store none] [--knowledge <id>=<folder>] [the model flags] [--force]
```

This writes a folder and sends nothing anywhere. It holds a short entry file, `README.md` with the exact
commands, `models.json`, your package as one zip in `package/`, and under `vendor/harness/` the harness's
code it runs. It refuses a folder that isn't empty, unless you add `--force`.

Keep the folder as private as the course: the zip may hold what you uploaded to VIABLE.

**Secrets, everywhere.** `VIABLE_HARNESS_TOKEN` is what callers send as `Authorization: Bearer`; make one
with `openssl rand -hex 32`. A deployed server refuses agent calls until it is set, and `/health` still
answers. `OPENAI_API_KEY` is your endpoint's key, if it needs one. `OPENAI_BASE_URL` isn't secret. The
other settings are `VIABLE_HARNESS_CORS`, `VIABLE_HARNESS_KEEP_DAYS` (default in a scaffold: 180, longer than a term),
`VIABLE_HARNESS_MAX_RUNS` (default: 50), `VIABLE_HARNESS_TIMEOUT` (seconds, default: 300) and, on Node
targets, `VIABLE_HARNESS_ALLOW_COMPONENTS`, the IDs of MCP components this server may start (default: none).

### Node on one machine

```sh
viable-harness deploy node course.viable.zip --out ./site
cd site && npm install && cp .env.example .env    # set the three values
npm start
```

It keeps what it keeps in `./data`, and listens on `127.0.0.1:8080`. It speaks plain HTTP, so put a web
server with a certificate in front of it (Caddy gets one for you).

### A container

```sh
viable-harness deploy docker course.viable.zip --out ./site
cd site && docker build -t site .
export VIABLE_HARNESS_TOKEN=$(openssl rand -hex 32)
docker run -d --name site -p 127.0.0.1:8080:8080 -v site-data:/data -e VIABLE_HARNESS_KEEP_DAYS=180 \
  -e VIABLE_HARNESS_TOKEN -e OPENAI_BASE_URL -e OPENAI_API_KEY site
```

Or `docker compose up -d --build` in the folder, with the settings in your shell or a `.env` beside its `compose.yaml`.

The package is in the image, about 20 MB on top of `node:22-slim`'s 350 MB. It runs as a user without root, keeps what
it keeps on the volume, and tells Docker its health.

- **Stopping.** `docker stop` lets a reply under way finish and be kept, for 10 seconds; `-t 300` waits for the longest
  run. If the kill comes first, that reply is lost, and what was kept before it stays whole.
- **Starting again.** `docker rm`, then the same `docker run` on the same volume, goes on with every conversation. A new
  named volume is writable by the user it runs as. A folder you mount must be writable by uid 1000: a server that can't
  write won't start, and says so.
- **Locked down.** It also runs with `--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges`.
- **A learner's records.** The image has no `viable-harness` command. `docker exec site node records.js export --data-dir
  /data --out /tmp/records` and `docker exec site node records.js forget <code> --data-dir /data` do what those two
  commands do. `docker cp` can't read a tmpfs, so under `--tmpfs /tmp`, export to `/data/records` and remove it after.
- **Another platform.** `docker build --platform linux/amd64` builds an image for most servers. From an arm64 Mac, it
  ran under QEMU.

**A model endpoint on the same machine.** In a container, `localhost` is the container, and the server's error says so.
Use `http://host.docker.internal:<port>/v1`.

| Docker on | `host.docker.internal` | An endpoint listening only on `127.0.0.1` |
| --- | --- | --- |
| Colima | answers by itself | is reached |
| Linux | needs `--add-host=host.docker.internal:host-gateway`; `compose.yaml` has it | isn't reached: have it listen on `0.0.0.0` or the bridge's address |
| Docker Desktop | answers by itself, Docker's documentation says; not run | not run |

The Colima row was run on a Mac. Of the Linux row, the last column was run inside Colima's Linux VM, calling the bridge's
gateway, the address `host-gateway` means on Linux. The flag is Docker's documented way, and neither was run on a Linux
server, where a firewall may have its own say.

### Cloudflare Workers

```sh
viable-harness deploy cloudflare course.viable.zip --out ./site
cd site && npm install && npx wrangler login
npx wrangler d1 create site                       # copy its database_id into wrangler.toml
export VIABLE_HARNESS_TOKEN=$(openssl rand -hex 32)
printf %s "$VIABLE_HARNESS_TOKEN" | npx wrangler secret put VIABLE_HARNESS_TOKEN
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

`npx wrangler dev --local` runs it on your machine first, with a local database, touching nothing on
your account. The package is a private asset: `run_worker_first` means only the Worker can read it. A daily
cron deletes what `VIABLE_HARNESS_KEEP_DAYS` has passed, as a daily function does on Lambda and Firebase.

Use Workers' paid plan. Reading a package and searching it can take more than the free plan's 10 ms of
CPU per request; time waiting on your model doesn't count, so the paid plan's 30 s is plenty. A package is
at most 25 MiB. D1 is
the store, not KV, because KV's writes take up to a minute to reach other places, which a conversation
can't wait for.

### AWS Lambda

```sh
viable-harness deploy aws-lambda course.viable.zip --out ./site
cd site && export VIABLE_HARNESS_TOKEN=$(openssl rand -hex 32)
sam build
sam deploy --guided --stack-name site --capabilities CAPABILITY_IAM \
  --parameter-overrides "OpenAiBaseUrl=https://... OpenAiApiKey=$OPENAI_API_KEY HarnessToken=$VIABLE_HARNESS_TOKEN"
```

A function URL answers, streaming; the template also makes a private S3 bucket whose lifecycle rules
delete old conversations and runs. The store is S3, not DynamoDB, because a DynamoDB item stops at 400
KB, which a long conversation can pass. The key and the token become the function's environment
variables: use Secrets Manager if anyone who can read the function shouldn't read them. Behind API Gateway,
use `lambdaHandler` from `server/lambda.js` instead: it holds the answer until it is whole.

### Google Cloud Run

```sh
viable-harness deploy cloud-run course.viable.zip --out ./site
```

Its README creates the secrets in Secret Manager, the bucket, and the service with `gcloud run deploy
--source .`, with the bucket mounted at `/data`. `--allow-unauthenticated` lets the server be reached; the
token still decides who may run an agent. Set `--max-instances 1` if a lost message in one conversation
matters more than scale.

### Firebase

```sh
viable-harness deploy firebase course.viable.zip --out ./site
cd site && firebase use PROJECT && (cd functions && npm install)
export VIABLE_HARNESS_TOKEN=$(openssl rand -hex 32)
printf %s "$VIABLE_HARNESS_TOKEN" | firebase functions:secrets:set VIABLE_HARNESS_TOKEN --data-file=-
firebase functions:secrets:set OPENAI_API_KEY
firebase deploy --only functions,firestore
```

`firebase emulators:start` runs it on your machine first; its README has the commands. Functions need the
Blaze plan. Firestore holds what it keeps, and its rules allow no browser in. A request
alone never sweeps, so to delete old conversations, set a Firestore TTL policy or call `sweep` from a
scheduled function.

App Hosting is built for web frameworks, and this isn't one. If you want it anyway, it needs what any
Node server does: a root `package.json` whose `start` script listens on `$PORT` (`deploy node` gives you
that), the secrets in `apphosting.yaml` in Cloud Secret Manager, and a store that isn't the disk. That path
hasn't been tried. Functions, or Cloud Run in the same project, is simpler.

## 5. Check it

```sh
export VIABLE_HARNESS_TOKEN=...
viable-harness verify https://its-address --token-env VIABLE_HARNESS_TOKEN
viable-harness verify https://its-address --token-env VIABLE_HARNESS_TOKEN --turn    # costs one model call
```

It checks from outside that the server answers, refuses a caller without the token, takes yours, lists its
agents, says which package and date it runs, and opens its chat page. Only `--turn` runs a real turn. It
prints what to do about anything that failed.

Where the server has a chat page, it also prints the line for your site and the origins your site's
Content-Security-Policy must allow:

```html
<script src="https://its-address/embed.js" data-agent="library-help" async></script>
```

```text
script-src https://its-address
connect-src https://its-address
frame-src https://its-address
img-src https://its-address
```

## 6. Call it from your app

Send the request you send to VIABLE. Change the address and the key.

```sh
curl https://its-address/v1/agents/library-help/runs \
  -H "Authorization: Bearer $VIABLE_HARNESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input": "Where do I start on my essay?", "user": "s-0412", "include": ["trace"]}'
```

The answer is VIABLE's: `object: "agent.run.result"`, `conversation_id`, `run_id`, `output` (with `text`, and
`citations` when the reply cites knowledge), `usage`, `cost` and, with `include`, `trace`. An error is
VIABLE's `error` object with `message`, `type`, `code` and `request_id`. Branch on `code`.

| Route | What it does |
| --- | --- |
| `POST /v1/agents/{slug}/runs` | Runs one turn, as on VIABLE. |
| `GET /v1/agents/{slug}/runs/{run_id}` | Reads a run back, with its trace, as on VIABLE. With a store it lasts until it is deleted; without one the server keeps the newest 500, until it stops. |
| `GET /v1/agents/{slug}` | The agent's slug, name and description, as on VIABLE. `published_version` is null. |
| `GET /v1/agents` | Lists the agents it serves. VIABLE has no such route for apps. |
| `GET /v1/server` | Its harness version, its packages and when they were downloaded, and whether it keeps conversations. |
| `GET /health` | `{"status": "ok", "agents": <n>}`, without the token, for a load balancer. |

Keep the token on your app's server. Never put it in a web page or a mobile app: anyone who has it can run
your agents on your model keys.

## Without a scaffold: `viable-harness serve`

For one machine, with no folder to keep:

```sh
export VIABLE_HARNESS_TOKEN=$(openssl rand -hex 32)
viable-harness serve course.viable.zip --model llama3.1 --reviewer-model qwen3 \
  --token-env VIABLE_HARNESS_TOKEN --data-dir ./data --keep-days 180 --media-dir ./media
```

| Option | What it does | Default |
| --- | --- | --- |
| `--port`, `--host` | Where it listens. | `8080`, `127.0.0.1` |
| `--token-env <NAME>` | The environment variable that holds the token callers must send. Without it, the server [answers only this computer](#with-no-token). | none |
| `--cors <origin>` | The one web page origin allowed to call it from a browser. Without it, browsers can't. | none |
| `--max-body <bytes>` | The largest request body. | 1048576 (1 MB) |
| `--timeout <seconds>` | The longest a run may take. Calls to your endpoint still waiting are cut off. | 300 |
| `--max-runs <n>` | How many runs at once. More get 429. Your model endpoint's own limit may be lower. | 30 |
| `--data-dir <dir>` | Keeps conversations, runs and memory in a folder. | it stays stateless |
| `--keep-days <n>` | Deletes from `--data-dir`, this many days after each last changed: conversations, runs, turns and their traces, and a learner's drafts, answers, highlights and events. | keeps them |
| `--memory-dir <dir>` | Keeps Memory steps' facts in a folder of their own, one file per learner. | in `--data-dir`, else skipped |
| `--media-dir <dir>` | Keeps the audio and pictures Speech and Image steps make. | a new temporary folder per run |
| `--knowledge <id>=<folder>` | A knowledge base kept in a folder. Repeat it for each. | none |
| `--learner-header <name>` | A header your proxy sets to who is signed in. Needs `--token-env`, and a proxy nothing can get around: whoever can send the header is whoever it says. | none |
| `--panel` | Adds [what the AI did](try.md#the-panel-on-your-own-server), for whoever holds the token, on a page asked for with `?panel=1`. | off |
| `--allow-component <id>` | Lets a component step in these files start this MCP server, or call an address on your own network. Read what `inspect` says it does first. Repeat it for each. | none: [only public http components](components.md#a-component-in-a-document) |
| The model flags | See step 3. | as named |
| `--no-speech` | Speech steps pass on without reading aloud. | off |

Several files at once work too: `viable-harness serve course.viable.zip coach.agent.json`, or a folder of
them. Two agents with the same slug stop the server from starting. When it starts, it prints each
agent's address, where model calls go, what will fail, and any warning about its models. Stop it with Ctrl-C, or `SIGTERM`.

`Dockerfile` at the harness's root builds an image of this command, with the files mounted at `/agents`:

```sh
docker build -t viable-harness .
docker run -d --name harness -p 127.0.0.1:8080:8080 -v "$PWD/agents:/agents:ro" -v harness-data:/data \
  -e VIABLE_HARNESS_TOKEN -e OPENAI_BASE_URL -e OPENAI_API_KEY \
  viable-harness --model llama3.1 --data-dir /data --keep-days 180
```

It won't start without the token, and without `--data-dir` it keeps nothing between requests. Colima shares only your home
folder unless you tell it otherwise, so a folder elsewhere arrives empty, and it says it found no agent file in `/agents`.
For a learner's records: `docker exec harness node /app/bin/viable-harness.mjs records export --data-dir /data --out
/tmp/records`, and `forget` the same way.

### With no token

`serve` and `gateway` with no token answer this computer only, on every route:

- A name that isn't `localhost`, `127.0.0.1` or `[::1]`, a connection from elsewhere, and a request a proxy
  marks as passed on (`X-Forwarded-For`, `Forwarded` and the like) get 403, so a website that points its own
  name at this address learns nothing.
- A post with another site's `Origin` gets 403, or the one `--cors` names. A program on this computer sends no
  `Origin`, and goes on working.
- The teacher's page still takes a token: the server makes one at start and prints it once. Through a reverse
  proxy that sets `Host` to `127.0.0.1` and says nothing else (nginx's default) every visitor looks like this
  computer, so no local grant opens anything a learner must not see.
- That same proxy still gets everyone the agents and the learner pages on your key. A server anyone else can
  reach needs a token: `--token-env`.

On any server, a route that takes JSON refuses any other `Content-Type` with 415, because a web page can't send
`application/json` to another site without asking first. `curl` needs `-H 'Content-Type: application/json'`.

## What a package may do

A package is a file someone sent you. Treat opening one like opening any file from them, and read what
`viable-harness inspect` says first: each component step and Fetch URL step it holds, and what it would contact
or start.

- It can't start a program unless you name it ([components](components.md#a-component-in-a-document)).
- It can't reach your own network. On every host, a Fetch URL step, a package's file named by a URL, and an
  http component go only to a public address. A Worker's transport refuses private ones when it connects. On
  a Node host the harness refuses a name if any answer is private, when it looks the name up and again as the
  connection is made, so an answer that changes in between doesn't get through. A redirect is checked hop by hop.
- It can send what its steps say to public addresses. A Fetch URL step's address may come from a learner's
  words, through a template or the `fetch_url` tool, and a component receives what its `inputs` give it.
  That is what such a step is for, and why `inspect` lists them.
- In a deployed scaffold, its title and file name are stripped of anything that could break out of the
  generated code they land in.

## Logs

Each run writes one JSON line to standard output: the time, the request ID, the agent, the run ID, the
status, the error code if any, the duration, the model calls and the tokens. It never holds what the
learner wrote or their ID.

## Conversations

With a store (`--data-dir`, or a scaffold's), the runs route keeps conversations as VIABLE does: a turn
without `conversation_id` starts one, its answer has the ID, and a turn with it continues it, reading its
latest 100 messages (400 for an agent that summarizes). Ask steps wait for the next message, State lasts
between turns, and an Input step's `"summarize"` works. `messages` with two or more entries starts a
conversation with them. `history_mode: "client"` or `"none"` keeps no conversation for that turn; the run itself, with its reply and
trace, is still kept until `--keep-days` removes it.

- A conversation holds what learners wrote, so check who can read the store, and how long you may keep it.
- Keep it short: `--keep-days`, or `VIABLE_HARNESS_KEEP_DAYS`, deletes conversations, runs and what learners wrote on
  a page after that many days without a change. A course longer than that loses a learner's untouched draft, so set it past the
  end of your course. A learner's code, how far they got and Memory's facts stay; `viable-harness forget` takes those.
- It's kept only once a turn succeeds. If keeping it fails, the learner still gets the reply, and the
  server logs the failure. A server that can't write its folder when it starts won't start.
- A conversation keeps its newest 400 messages, and fewer if they pass 900 KB.

Without a store there are no conversations. Every reply has `conversation_id: null`, and sending one gets 400
`unsupported_agent_parameter`. Send the earlier messages in `messages` with `history_mode: "client"`, as on
VIABLE. An Ask step's question still comes back with `awaiting_input: true`, but the next message starts
the agent from the beginning. State keeps nothing between turns.

## Memory, and forgetting a learner

With a store or `--memory-dir`, a run's `user` is the learner for Memory steps. Each fact is kept with its ID
and when it was saved, nothing else. A learner keeps their newest 200 facts. Without `user`, Memory steps
are skipped.

- `user` must be a pseudonymous ID: 1 to 128 letters, digits, dots, dashes, underscores or colons,
  starting with a letter or digit, such as `s-0412` or `my-app:student-0001`. A name or an email address
  gets 400 `invalid_learner`. VIABLE accepts any ID of up to 128 characters without control characters.
- Every agent a server runs shares its memory: a learner's facts from one agent are recalled by another.
  VIABLE keeps them per agent. Use a server per agent to keep them apart.
- To forget a learner with `--memory-dir`, delete `<memory-dir>/<user>.json`. In a store, delete the key
  `memory/<user>`: in `--data-dir` that is `memory/<user>.json`, with a colon written `%3A`. To
  forget everyone, delete the folder.
- Memory isn't touched by `--keep-days`. Delete it yourself.

## What is different from VIABLE

The request:

- **`input`, `message`, `messages`** work as on VIABLE, as text: a string, text parts, or messages.
  A picture or file part gets 400 `unsupported_input`.
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
- The body may be 1 MB; VIABLE takes 12 MB.

The result:

- `cost` is always 0: your endpoint, your bill. `input_assets` is empty. There is no `transcript`,
  and no `X-Viable-Billing` header.
- A picture's or a recording's `url` in `output.attachments` is, under `serve`, the file's path on the
  server, in `--media-dir`: serve that folder yourself if your app needs the files. Under a scaffold it
  is a `data:` URL. A run kept in a store leaves those out.
- A citation links to its source only when the package names the file by a web address. Files from a
  zip or a folder have no link.

Errors:

- Your endpoint's errors are 502 `provider_error` (429 when the endpoint says it is busy), with the
  endpoint's own reason, since it is yours. An endpoint it can't reach is the same, says why and what to do, and goes
  in the log. A learner's page says only that the assistant couldn't answer. A run past the timeout is 504 `provider_timeout`.
- More runs than the limit get 429 `rate_limit_exceeded` with `Retry-After: 1`. The limit is per process, so
  on a cloud it is per instance.
- A missing or wrong token is 401 `invalid_api_key`. A deployed server with no token set answers 503
  `token_not_set`.
- A turn in a conversation the caller named finishes when they leave, and is kept there, as on the platform and
  on a chat page. A retry that sends the same message while it is running runs it again. At most four turns of a
  conversation run or wait at once; another gets 429 `conversation_busy` with `Retry-After: 2`.
- Any other run stops when its caller leaves, since nobody could find its reply: its model calls are cut off, none
  more is made, and the log line says 499 `client_closed_request`. On AWS Lambda the run goes on to its end
  instead.
- A conversation that isn't there, belongs to another agent, or has passed its keep-days is 404
  `agent_conversation_not_found`.
- An agent's limits are its own `run_limits`, else 20 model calls and 5 minutes. VIABLE gives an
  app's run 60 seconds unless the agent says otherwise.
- There are no 402, 403, 409, 410 or 424 errors: no credits, keys per agent, idempotency or model
  catalog.

Routes it doesn't serve: `/chat/completions`, `/jobs` and `/runs/{run_id}/rating`.

### Knowledge search

VIABLE searches a knowledge base by keywords and by meaning together (embeddings, then a reranking
model), unless the knowledge base is set to keywords only. It brings back a passage's neighbours from
the same section, up to 4,000 characters. It converts PDFs, Office files and pictures to text, reads
and refreshes websites, and can link a citation to an uploaded file, at a PDF's page.

The harness searches by keywords only (BM25), as VIABLE does a keyword-only knowledge base, in
1,200-character passages, without neighbours. `inspect` says which knowledge bases VIABLE searched by
meaning too, since those may find less here. It reads text formats only: a PDF or Office file through
the text VIABLE packaged with it, else not at all. A website is searched from the snapshot of its pages the
package carries, and `viable-harness knowledge refresh` reads it again; it isn't read live. A knowledge base
with a website that has no snapshot, or a file it can't read, fails every search that includes it, so refresh it,
or map it to a folder with `--knowledge` and save the pages or files you want as text there.

### What you don't get without VIABLE

- the editor, its tests and run history;
- accounts, projects, API keys, and limits per key;
- class lists, sections from a roster, and sign-in;
- consent, studies and their conditions;
- the Learners view, the research export and its measures over time;
- request logs;
- hosted knowledge search, file conversion and website crawling;
- transcription: Transcribe steps are skipped, since the server takes text;
- background jobs, idempotent retries and ratings;
- credits and billing.

The agent engine, VETTING, How the AI helps and the formats are the same code VIABLE runs.

### Going back

A package can go back to VIABLE: import it there. What a self-hosted server recorded can't be imported into
VIABLE's studies. A new version on VIABLE is a new download: run `deploy` again with `--force`, and deploy.
