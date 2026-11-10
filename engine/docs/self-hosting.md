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
viable-engine inspect course.viable.zip                         # what it needs, and what won't work
viable-engine deploy cloudflare course.viable.zip --out ./site \
  --map gpt-oss-120b=llama3.1 --reviewer-model mistral             # a folder, with its own README
# ...the commands in ./site/README.md...
viable-engine verify https://its-address --token-env VIABLE_ENGINE_TOKEN
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

Everywhere, the same engine, VETTING and How the AI helps run, and [what a model turns on](#models-set-up-in-the-browser)
is the same: voice, reading aloud, a learner's photos and PDFs, and search by meaning. Websites in a knowledge base
aren't read live. Under an app's run (`POST /v1/agents/<slug>/runs`) on a target with no lasting disk, audio and pictures
come back inside the answer as `data:` URLs, and aren't kept by number for later turns; a learner page keeps its own in
the store.

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
The Engine reads files from the archive without unpacking it, and refuses a file named outside the
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
viable-engine inspect course.viable.zip
```

It lists the agents and their addresses, every model by role (reply, reviewer, helper, speech, image,
transcribe), what those models turn on and why anything is off, the knowledge bases (files, text copies, websites,
how VIABLE searched each), the activities, which steps can't run where, the settings it needs, warnings, and the next command.
`--json` gives the same exactly. `--map` and the other model flags show what they would change.

## 3. Replace the models

The Engine calls an OpenAI-compatible endpoint: OpenAI itself, or an open-weight model behind vLLM,
Ollama, llama.cpp or LM Studio. Agents name VIABLE's models, such as `gpt-oss-120b`, or VIABLE's aliases,
such as `viable-3`. Your endpoint may not know them.

| Flag | What it replaces |
| --- | --- |
| `--map a=b` (repeat it) | The model `a`, in every role, with `b`. |
| `--reviewer-model <id>` | Every reviewer, whatever `--map` says. |
| `--model <id>` | Every chat model not in `--map`, and the reviewer too unless something else names it. |
| `--speech-model`, `--image-model` | Every Speech or Image step's. |
| `--models models.json` | Any of these from a file: `{"reply": "...", "reviewer": "...", "speech": "...", "image": "...", "map": {"a": "b"}}`. It also takes what no flag does: `"transcribe"` (hears learners), `"picker"` (reads the moment), `"meaning"` (searches by meaning), and `"reads": {"model": ["images", "files"]}`, what a model reads. |

**A reviewer should be a second model.** VETTING has one model write a reply and another judge it, and the
point is that the judge didn't write it. When a reviewer ends up the same model as the step it checks,
`inspect`, `deploy`, `serve` and `run` warn you, whether `--model`, a map or the package itself did it.

Every learner's message goes to this endpoint. Have an agreement with its provider first
([deploying.md](deploying.md)). A running server can also be set up in the browser:
[Models](#models-set-up-in-the-browser).

## 4. Scaffold, and deploy

```sh
viable-engine deploy <target> course.viable.zip --out ./site \
  [--endpoint <url>] [--name <name>] [--store none] [--knowledge <id>=<folder>] [the model flags] [--force]
```

This writes a folder and sends nothing anywhere. It holds a short entry file, `README.md` with the exact
commands, `models.json`, your package as one zip in `package/`, and under `vendor/` the Engine's and the
Harness's code it runs. It refuses a folder that isn't empty, unless you add `--force`.

Keep the folder as private as the course: the zip may hold what you uploaded to VIABLE.

**Secrets, everywhere.** `VIABLE_ENGINE_TOKEN` is what callers send as `Authorization: Bearer`; make one
with `openssl rand -hex 32`. A deployed server refuses agent calls until it is set, and `/health` still
answers. `OPENAI_API_KEY` is your endpoint's key, if it needs one. `OPENAI_BASE_URL` isn't secret. The
other settings are `VIABLE_ENGINE_CORS`, `VIABLE_ENGINE_KEEP_DAYS` (default in a scaffold: 180, longer than a term),
`VIABLE_ENGINE_MAX_RUNS` (default: 50), `VIABLE_ENGINE_TIMEOUT` (seconds, default: 300) and, on Node
targets, `VIABLE_ENGINE_ALLOW_COMPONENTS`, the IDs of MCP components this server may start (default: none).

### Node on one machine

```sh
viable-engine deploy node course.viable.zip --out ./site
cd site && npm install && cp .env.example .env    # set the three values
npm start
```

It keeps what it keeps in `./data`, and listens on `127.0.0.1:8080`. It speaks plain HTTP, so put a web
server with a certificate in front of it (Caddy gets one for you).

### A container

```sh
viable-engine deploy docker course.viable.zip --out ./site
cd site && docker build -t site .
export VIABLE_ENGINE_TOKEN=$(openssl rand -hex 32)
docker run -d --name site -p 127.0.0.1:8080:8080 -v site-data:/data -e VIABLE_ENGINE_KEEP_DAYS=180 \
  -e VIABLE_ENGINE_TOKEN -e OPENAI_BASE_URL -e OPENAI_API_KEY site
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
- **A learner's records.** The image has no `viable-engine` command. `docker exec site node records.js export --data-dir
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
viable-engine deploy cloudflare course.viable.zip --out ./site
cd site && npm install && npx wrangler login
npx wrangler d1 create site                       # copy its database_id into wrangler.toml
export VIABLE_ENGINE_TOKEN=$(openssl rand -hex 32)
printf %s "$VIABLE_ENGINE_TOKEN" | npx wrangler secret put VIABLE_ENGINE_TOKEN
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

`npx wrangler dev --local` runs it on your machine first, with a local database, touching nothing on
your account. The package is a private asset: `run_worker_first` means only the Worker can read it. A daily
cron deletes what `VIABLE_ENGINE_KEEP_DAYS` has passed, as a daily function does on Lambda and Firebase.

Use Workers' paid plan. Reading a package and searching it can take more than the free plan's 10 ms of
CPU per request; time waiting on your model doesn't count, so the paid plan's 30 s is plenty. A package is
at most 25 MiB. D1 is
the store, not KV, because KV's writes take up to a minute to reach other places, which a conversation
can't wait for.

### AWS Lambda

```sh
viable-engine deploy aws-lambda course.viable.zip --out ./site
cd site && export VIABLE_ENGINE_TOKEN=$(openssl rand -hex 32)
sam build
sam deploy --guided --stack-name site --capabilities CAPABILITY_IAM \
  --parameter-overrides "OpenAiBaseUrl=https://... OpenAiApiKey=$OPENAI_API_KEY HarnessToken=$VIABLE_ENGINE_TOKEN"
```

A function URL answers, streaming; the template also makes a private S3 bucket whose lifecycle rules
delete old conversations and runs. The store is S3, not DynamoDB, because a DynamoDB item stops at 400
KB, which a long conversation can pass. The key and the token become the function's environment
variables: use Secrets Manager if anyone who can read the function shouldn't read them. Behind API Gateway,
use `lambdaHandler` from `server/lambda.js` instead: it holds the answer until it is whole.

### Google Cloud Run

```sh
viable-engine deploy cloud-run course.viable.zip --out ./site
```

Its README creates the secrets in Secret Manager, the bucket, and the service with `gcloud run deploy
--source .`, with the bucket mounted at `/data`. `--allow-unauthenticated` lets the server be reached; the
token still decides who may run an agent. Set `--max-instances 1` if a lost message in one conversation
matters more than scale.

### Firebase

```sh
viable-engine deploy firebase course.viable.zip --out ./site
cd site && firebase use PROJECT && (cd functions && npm install)
export VIABLE_ENGINE_TOKEN=$(openssl rand -hex 32)
printf %s "$VIABLE_ENGINE_TOKEN" | firebase functions:secrets:set VIABLE_ENGINE_TOKEN --data-file=-
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
export VIABLE_ENGINE_TOKEN=...
viable-engine verify https://its-address --token-env VIABLE_ENGINE_TOKEN
viable-engine verify https://its-address --token-env VIABLE_ENGINE_TOKEN --turn    # costs one model call
```

It checks from outside that the server answers, refuses a caller without the token, takes yours, lists its
agents, says which package and date it runs, and opens its chat page. With the token it also says what is on and off, and
why. Only `--turn` runs a real turn. It prints what to do about anything that failed.

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
  -H "Authorization: Bearer $VIABLE_ENGINE_TOKEN" \
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
| `GET /v1/server` | Its harness version, its packages and when they were downloaded, whether it keeps conversations, and what is on and off. |
| `GET /health` | `{"status": "ok", "agents": <n>}`, without the token, for a load balancer. |

Keep the token on your app's server. Never put it in a web page or a mobile app: anyone who has it can run
your agents on your model keys.

## Without a scaffold: `viable-engine serve`

For one machine, with no folder to keep:

```sh
export VIABLE_ENGINE_TOKEN=$(openssl rand -hex 32)
viable-engine serve course.viable.zip --model llama3.1 --reviewer-model mistral \
  --token-env VIABLE_ENGINE_TOKEN --data-dir ./data --keep-days 180 --media-dir ./media
```

| Option | What it does | Default |
| --- | --- | --- |
| `--port`, `--host` | Where it listens. | `8080`, `127.0.0.1` |
| `--token-env <NAME>` | The environment variable that holds the token callers must send. Without it, the server [answers only this computer](#with-no-token). | none |
| `--cors <origin>` | The one web page origin allowed to call it from a browser. Without it, browsers can't. | none |
| `--max-body <bytes>` | The largest request body. A page that takes recordings or attachments takes up to 14 MB on its message routes, whatever this says. | 1048576 (1 MB) |
| `--timeout <seconds>` | The longest a run may take. Calls to your endpoint still waiting are cut off. | 300 |
| `--max-runs <n>` | How many runs at once. More get 429. Your model endpoint's own limit may be lower. | 30 |
| `--data-dir <dir>` | Keeps conversations, runs, memory and what the console sets in a folder. | it stays stateless |
| `--keep-days <n>` | Deletes from `--data-dir`, this many days after each last changed: conversations, runs, turns and their traces, and a learner's drafts, answers, highlights and events. | keeps them |
| `--memory-dir <dir>` | Keeps Memory steps' facts in a folder of their own, one file per learner. | in `--data-dir`, else skipped |
| `--media-dir <dir>` | Keeps the audio and pictures Speech and Image steps make for an app's run. A learner page's are kept in the store. | a new temporary folder per run |
| `--knowledge <id>=<folder>` | A knowledge base kept in a folder. Repeat it for each. | none |
| `--learner-header <name>` | A header your proxy sets to who is signed in. Needs `--token-env`, and a proxy nothing can get around: whoever can send the header is whoever it says. | none |
| `--panel` | Adds [what the AI did](try.md#the-panel-on-your-own-server), for whoever holds the token, on a page asked for with `?panel=1`. | off |
| `--allow-component <id>` | Lets a component step in these files start this MCP server, or call an address on your own network. Read what `inspect` says it does first. Repeat it for each. | none: [only public http components](../../harness/docs/components.md#a-component-in-a-document) |
| The model flags | See step 3. | as named |
| `--no-speech` | Speech steps pass on without reading aloud, and pages read nothing aloud, whatever a model is set for. | off |

Several files at once work too: `viable-engine serve course.viable.zip coach.agent.json`, or a folder of
them. Two agents with the same slug stop the server from starting. When it starts, it prints each
agent's address, where model calls go, what will fail, and any warning about its models. Stop it with Ctrl-C, or `SIGTERM`.
With no files at all, or a folder that holds none, it starts anyway, says so, and sends you to [the console](#models-set-up-in-the-browser).

`Dockerfile` at the repository's root builds an image of this command, with any files mounted at `/agents`:

```sh
docker build -t viable-engine .
export VIABLE_ENGINE_TOKEN=$(openssl rand -hex 32)
docker run -d --name viable-engine -p 127.0.0.1:8080:8080 -v viable-data:/data -e VIABLE_ENGINE_TOKEN \
  viable-engine --data-dir /data --keep-days 180
```

Open `/console` and sign in with that token. Add `-v "$PWD/agents:/agents:ro"` to serve files, and `-e OPENAI_BASE_URL -e OPENAI_API_KEY` to set the
model outside the console.

It won't start without the token, and without `--data-dir` it keeps nothing between requests. Colima shares only your home
folder unless you tell it otherwise, so a folder elsewhere arrives empty: it says it found no agent file in `/agents`, and
serves only the console until you mount them and start it again.
For a learner's records: `docker exec viable-engine node /app/engine/bin/viable-engine.mjs records export --data-dir /data --out
/tmp/records`, and `forget` the same way.

### Models, set up in the browser

`/console` holds the Engine's own pages for whoever runs it: courses, with [who is in each and how it is going](learner-pages.md#who-a-learner-is), chat pages, agents, knowledge, and Models. On Models, add a provider (OpenAI, OpenRouter,
Ollama, LM Studio, or any other OpenAI-compatible address), test it, and say what each model is for. A feature turns on
when its model is set, and changing one applies to the next message, with no restart. Different roles may be on different
providers, each with its own key.

| Role | Calls | What it turns on |
| --- | --- | --- |
| Writes replies | `/chat/completions` | Replies, word by word where the provider streams and no check step holds them back. Photos and PDFs from learners, when its model's switches say it reads them: a provider doesn't report that reliably, so you do |
| Reviews replies | `/chat/completions` | A second model in an agent's check step. Unset, the step uses the model it names, or the reply model |
| Reads the moment | `/chat/completions` | A small model picks what each moment needs for an activity's turn (or an app's run with teaching settings), from How the AI helps. Rules take over if it fails. Unset, rules read the moment from what the learner wrote, in English; a class in another language needs this model |
| Hears learners | `/audio/transcriptions` | The microphone on activities and chat pages that allow it: a voice message, dictation into the box, and a conversation by voice. An agent with a Transcribe step hears through that step; any other gets the words as its message |
| Reads aloud | `/audio/speech` | An agent's Speech step on a page. An agent with none has a reply read aloud after a spoken message, or after every message where the page's `voice.autoplay` is `always` |
| Draws pictures | `/images/generations`, `/images/edits` | An agent's Image step, and the page shows the picture |
| Searches by meaning | `/embeddings` | Knowledge search by meaning as well as keywords ([below](#knowledge-search)) |

A page's own settings still decide: `voice.input: false` on a chat page or an activity keeps the microphone off. What a
learner sends is sized as on VIABLE: four attachments, 8 MB each and 10 MB in all, and a recording of at most 90 seconds. A
recording or an attachment isn't kept: a conversation keeps what was said, and a note of what was attached. Audio and
pictures a turn made stay in the store, at an address nobody can guess, until `--keep-days` or `forget`; with no store, the
newest 200, until the server stops.

**It takes the same token and session as the teacher's page.** One sign-in opens both, and the token never goes in an
address. A change has to come from the console's own page, or from a program holding the token: another site's post, and
anything but `application/json`, are refused. The same is on offer as JSON at `/console/api/` (`models`, `providers`,
`providers/<id>`, `providers/<id>/test`, `providers/<id>/try`, `providers/<id>/model`, `roles/<role>`). From another device, sign in over HTTPS: over plain HTTP the form isn't offered, because the token would cross the network for anyone on it to read. On the computer that runs the server, `http://127.0.0.1` is fine.

**A key goes in and doesn't come back.** The browser is told only that one is saved. It is encrypted at rest with AES-GCM,
from `VIABLE_ENGINE_SECRET`, or else from a random key the store keeps in its own folder, readable only by its owner
(`.store-key`, on `--data-dir` and the Node and Docker scaffolds). A cloud's store has no folder, so on Cloudflare, Lambda,
Firebase and Cloud Run set `VIABLE_ENGINE_SECRET`, or saving a key is refused. Back that file up with the folder, or set the
secret yourself: without it a saved key can't be read, and the page asks for it again. Changing a provider's address drops
its key unless a new one comes with it, so someone holding a session can't point a saved key at their own server, and a
saved provider's requests never follow a redirect. Someone holding the token can still point a provider at any address this
server can reach, and read what a test says of it, so treat the token as you would the server.

**The environment wins.** Whatever is set where the server starts keeps working, and the page says when a value comes from
there:

- `--model`, `--reviewer-model`, `--speech-model`, `--image-model` and a models file name a role's model.
- `OPENAI_BASE_URL` and `OPENAI_API_KEY` hold the two roles that have always gone there, Writes replies and Reviews replies,
  to that address. You can still choose which of its models each uses. A scaffold sets `OPENAI_BASE_URL` only if you give `--endpoint`,
  so with none, you choose every provider in the console.
- What they say nothing of stays as saved, so hearing or speaking can be on another provider, and that provider never gets
  `OPENAI_API_KEY`.

With no store (no `--data-dir`, or `--store none`), nothing can be saved: the page says so, and models come from the
environment and a models file alone. `inspect` says what a package's models turn on as you give them, and `verify --token-env`
what a running server has on, and why.

### Agents, chat pages and knowledge, in the browser

The console makes what a server runs, with no file to write. Say a library wants a research-help button on its guides:

1. **Knowledge → New knowledge base**, then add its guides as files, or its site by address. **Try a search** runs the real
   search and shows the passages it finds.
2. **Chat pages → New chat page**: a title, what it should do, what it answers from. That makes an agent with a page.
3. **Share it**: the page's link and QR code, and the one line that puts a chat button on a website.

Each page says what it does as it goes; what follows is what it won't tell you.

**Where things live.** An agent or a knowledge base lives in a package, since a package's parts name each other by ref. A
course's stay in its package and travel with its file; anything else is on its own, in a package with no course. An agent
searches only the knowledge bases beside it. A new agent can be made beside a knowledge base or in a course.

**Agents.** The form makes a simple graph: an agent or LLM step with its instructions, a Knowledge step when it searches
something, and a VETTING step with those instructions as its guideline when a second model checks it. Its steps name the model
`default`, which the roles on Models replace, so a role with no model means it can't answer. Reading web pages and remembering
use an Agent step, so a message can take several model calls. An agent with any other graph runs as it is: its page lists its
steps with the model each uses now, and they change on the VIABLE Developer Platform. Its look and its chat page can change here.
**Test it** runs an agent on the real path, as a real call on your key, and keeps nothing but what the agent remembers, under
a test visitor. An agent can be downloaded alone, with the agents it calls and the knowledge they search. On the Developer
Platform, models it doesn't have become its default, and the import says so. It can't be removed while
an activity or another agent uses it. Removing one takes its chat page and what visitors said there.

**Chat pages.** Anyone with the link can use one, on your keys, up to its daily limit. A new page has 300 messages a day, 8 per
visitor per minute and 50 per visitor per day, where a visitor is one browser and a day is UTC. A page in a file added in the
console starts paused. The look is the agent's, shared with the activities that use it. Allowed sites say where the button can
appear and the page can be framed; the link itself opens for anyone either way. A site on https can load the button only
from a server on https. A package's daily spending cap isn't enforced here, since this server doesn't price calls, and the
console doesn't offer one.

**Knowledge.** Files are text, Markdown, CSV, JSON or HTML, up to 25 MB each, 50 to a package. A PDF or Office file isn't read,
unless it came with a text copy from VIABLE, and an unread file fails every search of its knowledge base, so the console refuses
one and flags one that came in a package. A website is read when it is added and when someone presses **Read it again**, with the
same code as `viable-engine knowledge refresh`: one page at a time, as its robots.txt asks, at public https addresses only,
for up to two minutes, keeping what it read by then. An address ending in `.xml` is read as a sitemap; any other as that page and
those it links to under the same folder. For a site too large for that, run the command on a downloaded package. A change reaches
the next search with no restart. Removing a file deletes its bytes, so an older version of the package comes back without it.

All of this is on offer as JSON at `/console/api/`, as the pages use it (`agents`, `chat-pages`, `knowledge`).

### Behind a proxy

A proxy that terminates https in front of the server is the usual way to put it on a network. Then every visitor's address is the
proxy's, and limits per address count them all as one: start with `--trust-proxy` (`VIABLE_ENGINE_TRUST_PROXY=1` on a scaffold) so
they count the last `X-Forwarded-For` entry instead. Use it only where the proxy is the only way in, since anyone reaching the server
directly could say anything in that header. Have the proxy send the real `Host`, too: the links the console shows come from it.
`viable-engine start` on `127.0.0.1` with a kept token answers only to this computer's own names, so a site can't reach it by pointing
its name here. To serve it under another name, use `--host 0.0.0.0` or `--token-env`.

### With no token

`serve` and `gateway` with no token answer this computer only, on every route:

- A name that isn't `localhost`, `127.0.0.1` or `[::1]`, a connection from elsewhere, and a request a proxy
  marks as passed on (`X-Forwarded-For`, `Forwarded` and the like) get 403, so a website that points its own
  name at this address learns nothing.
- A post with another site's `Origin` gets 403, or the one `--cors` names. A program on this computer sends no
  `Origin`, and goes on working.
- The teacher's page and the console still take a token: the server makes one at start and prints it once. Through a reverse
  proxy that sets `Host` to `127.0.0.1` and says nothing else (nginx's default) every visitor looks like this
  computer, so no local grant opens anything a learner must not see.
- That same proxy still gets everyone the agents and the learner pages on your key. A server anyone else can
  reach needs a token: `--token-env`.

On any server, a route that takes JSON refuses any other `Content-Type` with 415, because a web page can't send
`application/json` to another site without asking first. `curl` needs `-H 'Content-Type: application/json'`.

## What a package may do

A package is a file someone sent you. Treat opening one like opening any file from them, and read what
`viable-engine inspect` says first: each component step and Fetch URL step it holds, and what it would contact
or start.

- It can't start a program unless you name it ([components](../../harness/docs/components.md#a-component-in-a-document)).
- It can't reach your own network. On every host, a Fetch URL step, a package's file named by a URL, and an
  http component go only to a public address. A Worker's transport refuses private ones when it connects. On
  a Node host the Engine refuses a name if any answer is private, when it looks the name up and again as the
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
- Keep it short: `--keep-days`, or `VIABLE_ENGINE_KEEP_DAYS`, deletes conversations, runs and what learners wrote on
  a page after that many days without a change. A course longer than that loses a learner's untouched draft, so set it past the
  end of your course. A learner's code, how far they got and Memory's facts stay; `viable-engine forget` takes those.
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
  A picture or file part gets 400 `unsupported_input`: an app's run takes text, and only a learner page takes
  recordings and attachments.
- **`context`** is checked as on VIABLE (an object, at most 128 KiB, 16 levels deep). The fields
  VIABLE composes itself, such as the teacher's instructions, are removed, as on VIABLE. It isn't
  kept as what the learner had open.
- **`user`**: see Memory. It makes no learner record.
- **`learner_group`** is checked as on VIABLE, then not used.
- **`sources`** and **`include: ["trace"]`** work as on VIABLE.
- **`stream: true`** sends `run.started`, `run.delta` (the reply as your endpoint writes it, when it goes
  straight to the reader, or whole if your endpoint won't stream), then `run.completed` with the same result, or
  `run.failed`. There are no `run.progress`, `run.transcript` or `run.audio` events; a learner page's stream has them.
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

The Engine searches by keywords (BM25), as VIABLE does a keyword-only knowledge base, without neighbours,
in passages of the size the package gives the knowledge base (`chunk_size`, 300 to 4,000 characters; 1,200 when
it gives none), so they match the passages VIABLE made. With a model for searching by meaning it also asks your provider's `/embeddings`, and
combines the two lists. Each file's vectors are kept in the store under a hash of what it says, so they aren't paid for
twice; a search spends about 15 seconds at most making them, finds by keywords until they are all there, and goes on from
where it stopped. If embeddings fail, it searches by keywords and tries again a minute later: a search never fails a turn
because of them. Without that model, `inspect` says which knowledge bases VIABLE searched by meaning too, since those may
find less here. It reads text formats only: a PDF or Office file through
the text VIABLE packaged with it, else not at all. A website is searched from the snapshot of its pages the
package carries, and `viable-engine knowledge refresh` or the console's Knowledge page reads it again; it isn't read live. A knowledge base
with a website that has no snapshot, or a file it can't read, fails every search that includes it, so refresh it,
or map it to a folder with `--knowledge` and save the pages or files you want as text there.

### What you don't get without VIABLE

- the editor, its tests and run history;
- accounts, projects, API keys, and limits per key;
- consent, studies and their conditions;
- the Learners view, the research export and its measures over time;
- request logs;
- hosted file conversion, reranking and website crawling;
- background jobs, idempotent retries and ratings;
- credits and billing.

The agent engine, VETTING, How the AI helps and the formats are the same code VIABLE runs.

### Going back

A package can go back to VIABLE: import it there. What a self-hosted server recorded can't be imported into
VIABLE's studies. A new version on VIABLE is a new download: run `deploy` again with `--force`, and deploy.
