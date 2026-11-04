# The pages learners see

`viable-harness serve` and every scaffold from `viable-harness deploy` serve the same pages VIABLE does,
from the same code: an agent's chat page, the chat button for your website, a course's home and its
activities (questions, writing, reading, embedded pages, with the AI beside them).

```sh
export OPENAI_BASE_URL=https://your-endpoint/v1 OPENAI_API_KEY=...
viable-harness serve course.viable.zip --data-dir ./data --token-env TEACHER_TOKEN --max-runs 30
```

It prints where each page opens.

| Page | Address |
| --- | --- |
| A chat page | `/chat/<agent>` |
| The chat button | `<script src="https://your-server/embed.js" data-agent="<agent>" async></script>` |
| A course | `/course/<course>` |
| An activity | `/course/<course>/<activity>` |
| The teacher's page | `/teacher`, behind the token. With none set, the server makes one at start and prints it once |

An agent has a chat page only where its file or package says so (`chat_page`), and not when that says
`paused`. Pages from a server of your own are named after the course's and the activity's titles.

## What travels from VIABLE

A package downloaded with its files carries each agent's profile (name, greeting, starters, look) and
chat page settings (limits, allowed sites), the course and its activities, and a snapshot of each
crawled page's text. It never carries the key behind a chat page, learners, class lists or study data.

| Setting | On your server |
| --- | --- |
| Allowed sites | enforced: who may frame the page (`frame-ancestors`), and whose page the button draws on |
| Messages per visitor, per minute and per day | enforced |
| The page's daily message cap | enforced |
| A high ceiling per address | enforced, so a class on one address isn't turned away. Its number is this server's |
| The daily spending cap | not enforced: this server doesn't price calls. `serve` says so when it starts |
| An activity hidden or not yet open | stays closed, and its questions stay off the network. To open one, change `release` in the package and deploy again |

With more than one instance, per-minute limits count per instance, and the daily cap can undercount a
little when two instances write at once.

## Who a learner is

Never a name or an email.

| Way | How it works |
| --- | --- |
| Each browser (the default) | A browser holds a random ID, and the server gives it a code, shown on the home. "Not you?" asks for a code, or starts fresh. The code brings the learner's work back on another computer |
| A class code | `--class-code-env <NAME>` (`VIABLE_HARNESS_CLASS_CODE` on a cloud). Only someone with the code gets in, and each still gets a code of their own |
| Your school's sign-in | `--learner-header <name>` (`VIABLE_HARNESS_LEARNER_HEADER`): a reverse proxy passes who is signed in, and the server keeps only a hash of it. Use it only where nothing else can reach the server: whoever can send that header is whoever it says |

A course that takes codes from a class list on VIABLE has no class list here, so it uses one of these. A
course set for shared computers (`shared_devices`) asks "Are you …?" on each visit and after 20 idle minutes.

A code is the key to a learner's work. Someone who has it can open that work, and the teacher's page shows
codes, so treat what it exports as private.

A proxy's `--learner-header` needs `--token-env` too. Who it names is stored as a salted hash, with the salt in
the same store: a list of emails hashed elsewhere finds nobody, but someone holding the store could still try
one person's email against it.

Signing in at `/teacher` gives a session that ends when the browser closes, or after 8 hours, whichever comes
first. The server checks the time; it can't end one early from its side, short of changing the token. The
cookie reaches only `/teacher`, unless the server has the panel (`--panel`), whose pages are elsewhere. Sign-in
tries are limited to 10 a minute from one address and 600 a minute overall, and a shared address, such as a
school's or a proxy's, shares that 10.

## What is kept, and for how long

With `--data-dir` (or a store on a cloud), drafts, events, answers and turns are kept in the shape
`viable-harness view` and `suggest` read. `--keep-days <n>` deletes, that long after each last changed, turns and
their traces, conversations, drafts, answers, highlights and events. A learner's code and how far they got stay, so
a learner can come back, to an empty draft if they were away that long.

```sh
viable-harness records export --data-dir ./data --out ./records
viable-harness view ./records/<course>/*.json --out report.html
viable-harness forget <learner's code or ID> --data-dir ./data --memory-dir ./memory
```

`forget` removes that learner's work, conversations, runs, memory and gateway records. A chat page's
visitors are anonymous, so nobody can name one of them to forget: use `--keep-days`.

## What isn't here, and what happens instead

| On VIABLE | Here |
| --- | --- |
| Voice, reading replies aloud | The microphone isn't offered, and Speech steps pass on |
| Pictures and PDFs attached to a message | The button isn't offered |
| Spoken questions | Not asked: recordings are kept and scored on VIABLE |
| Studies, consent, conditions | None: no notice, form or "About the study" |
| Class lists, sections | Every learner is in one class. A section's own How the AI helps doesn't apply |
| Previews, changing an activity while it runs | A new version is a new deploy |
| A short title for each new chat | The page titles it from the first message |

## The website a knowledge base reads

A package's snapshot is what is searched here. To read the sites again, on the rules the package lists
(a list's pages, a sitemap's, or a crawl under its path prefix, up to its page limit):

```sh
viable-harness knowledge refresh course.viable.zip --out ./refreshed
```

It reads one page at a time with a pause, as `robots.txt` asks, stops reading a site that answers 429 or
503, and refuses a name that resolves to a private address. A page it can't reach keeps its snapshot and
is reported; a page that answers 404 or 410 leaves it. Serve or deploy `./refreshed`, and run it on your
cloud's own schedule to keep it current.

A citation links to a page at its own address. A file with no address of its own is linked at
`/package-files/...` only where its knowledge base says `file_links`; the server sends anything but a PDF
as a download, so nothing in a package runs on your server's address.

## On your own host

`createHandler({ routes: [learnerRoutes(options)] })` (`server/learner.js`) is web-standard. Its pages'
browser files are built by `npm run build:assets` into `dist/`, which the npm package and the image carry
and this repository doesn't, since they bundle third-party libraries (NOTICE). `deploy` puts them beside
the package on Cloudflare and in the function elsewhere. Without them pages still work: replies show as
plain text, and Reading panels are left out.

To let someone read what the AI did on a turn (its instructions, drafts and reviewers' reasons), set
`traces` in those options: `'token'` for whoever holds the token, or `'local'` for a try-out on this machine.
It is off by default, and a learner never gets it: `GET /teacher/turns/<run>/trace`. With `panel` too, a page
shows it beside itself only when its address asks (`?panel=1`) and its request holds the token, and no other
site may frame that page.
