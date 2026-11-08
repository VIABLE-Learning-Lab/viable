# The pages learners see

`viable-engine serve` and every scaffold from `viable-engine deploy` serve the same pages VIABLE does,
from the same code: an agent's chat page, the chat button for your website, a course's home and its
activities (a page to read, questions, writing, a PDF to read, embedded pages, in steps if you want, with the AI beside them where you say).

```sh
export OPENAI_BASE_URL=https://your-endpoint/v1 OPENAI_API_KEY=...
viable-engine serve course.viable.zip --data-dir ./data --token-env TEACHER_TOKEN --max-runs 30
```

It prints where each page opens.

| Page | Address |
| --- | --- |
| A chat page | `/chat/<agent>` |
| The chat button | `<script src="https://your-server/embed.js" data-agent="<agent>" async></script>` |
| A course | `/course/<course>` |
| An activity | `/course/<course>/<activity>` |
| The teacher's page | `/teacher`, behind the token. With none set, the server makes one at start and prints it once |
| The console | `/console`, behind the same token: [what each model is for](self-hosting.md#models-set-up-in-the-browser), courses, their [people](#who-a-learner-is) and [progress](#progress) |

An agent has a chat page only where its file or package says so (`chat_page`), and not when that says
`paused`. Pages from a server of your own are named after the course's and the activity's titles.

## What travels from VIABLE

A package downloaded with its files carries each agent's profile (name, greeting, starters, look) and
chat page settings (limits, allowed sites), the course and its activities, and a snapshot of each
crawled page's text. It never carries the key behind a chat page, learners, class lists, sections or study data.

| Setting | On your server |
| --- | --- |
| Allowed sites | enforced: who may frame the page (`frame-ancestors`), and whose page the button draws on |
| Messages per visitor, per minute and per day | enforced |
| The page's daily message cap | enforced |
| A high ceiling per address | enforced, so a class on one address isn't turned away. Its number is this server's |
| The daily spending cap | not enforced: this server doesn't price calls. `serve` says so when it starts |
| An activity hidden or not yet open | stays closed, and its questions stay off the network. To open one, use the console, or change `release` in the package and deploy again |

With more than one instance, per-minute limits count per instance, and the daily cap can undercount a
little when two instances write at once.

## Who a learner is

Each course says how, on its People tab in the console (the package's `identify`):

| Way | How it works |
| --- | --- |
| Each browser (`browser`, the default) | Nobody signs in. A browser holds a random ID, and the server gives it a personal code, shown on the home. "Not you?" asks for a code, or starts fresh. The code brings the learner's work back on another computer |
| Personal codes (`code`) | You add your class to the list, and print a card for each learner. Only a code on the list opens the course, typed with or without its dash, in any case, or from the QR code on the card. A package carries no class list, so a course set this way opens for nobody until you add one, and the server says so when it starts |
| A typed name or ID (`ask`, with `identify_ask`: `name` or `student_id`) | The same rules as on VIABLE. An entry is the same however it is typed (NFKC, format characters gone, spaces collapsed, any case). It opens a learner only the first time, or on the device already theirs. Anywhere else it takes their personal code, or anyone could type a classmate's name and read their work. Two people with one name are never guessed: they use their codes. With `identify_match` set to `roster`, an entry not on the list is refused; otherwise a new one is shown back to them to check, and joins the course |

The server's own way, when it has one, wins over the course's:

| Way | How it works |
| --- | --- |
| A class code | `--class-code-env <NAME>` (`VIABLE_ENGINE_CLASS_CODE` on a cloud). Only someone with the code gets in, and each still gets a code of their own |
| Your school's sign-in | `--learner-header <name>` (`VIABLE_ENGINE_LEARNER_HEADER`): a reverse proxy passes who is signed in, and the server keeps only a hash of it. Use it only where nothing else can reach the server: whoever can send that header is whoever it says |

A try-out (`viable-engine try`) and a server with no store (no `--data-dir`) have no class list, so each browser is a learner there, whatever the package says.

A course set for shared computers (`shared_devices`) asks "Are you …?" on each visit and after 20 idle minutes.

The list has one column for who someone is: a name, or for a course that asks for student IDs, the ID. A name stays
in the store, on this server. It is shown behind the token and to the browser that is that learner, and it never reaches
a model: a run's user, memory, trace and the records all use a pseudonymous ID or the code.

While a course asks who learners are, or an activity is open only for some sections, its page holds only its panels' names until the server knows who is asking and that it's open for them. A code is the key to a learner's work. Someone who has it can open that work, and the teacher's page shows
codes, so treat what it exports as private. A new code on People ends the old one and signs out browsers holding it.
Off the list, a learner's name goes and their code stops opening a course that signs in by the list; their work stays
under that code, and giving them a name again brings them back. Deleting their work there is `forget`, below.

Thirty learners on one address can sign in at once. Sign-in tries are limited to 10 a minute per browser and
300 a minute per address, and a code is 8 characters from an alphabet of 31.

### Sections

A section is a class period or a group, on People, with a link of its own (`?section=<key>`). Sections are in the
store, not the package. A learner's section comes from the class list, from a section's link, or from their own
choice, once (`sections_from`: `roster`, `link`, `choose`); only a teacher changes it after that. Someone who opens the
course's own link where sections come from links is asked which class they're in, once.

A section can have its own help level, a note for the AI and its own moments the AI writes first at, or none, on the
activity (`teaching.sections`); they reach only that section's learners' runs, and their page watches for their section's
moments. An activity can also be opened or hidden for one section at once, on Activities. That is kept
in the store and isn't a new version of the course, since a teacher does it mid-class. It applies on the home and on every
endpoint. While an activity is open for one section, its page is served to anyone with its address, because a page
doesn't know who is asking until it has loaded; everyone else is told it isn't open for them, and nothing they send is
taken, but a question's wording (never its answer) is in that page.

### Progress

Progress is a course's grid of who has done what, one learner's conversations, drafts and answers, read only, and for
each activity with an AI, what to look at: how replies went, hard moments and suggested changes, each accepted in one
button as a new version of the course, and suggested again only if what learners do after it calls for it. Who was only
trying the course out isn't counted. What it exports is the records, which name each learner by their code, and the class list as a CSV,
the only file that joins names and codes.

A proxy's `--learner-header` needs `--token-env` too. Who it names is stored as a salted hash, with the salt in
the same store: a list of emails hashed elsewhere finds nobody, but someone holding the store could still try
one person's email against it.

Signing in at `/teacher` or `/console` gives a session that ends when the browser closes, or after 8 hours, whichever comes
first. The server checks the time; it can't end one early from its side, short of changing the token. The
cookie reaches only `/teacher`, `/console` and `/course`, where, at an address with `?try=1` (the console's **Try it**), it lets you try a course as a learner apart who isn't counted. At any other address it lifts nothing, so a session left on a shared computer doesn't change what a learner sees, unless the server has the panel (`--panel`), whose pages are elsewhere. Sign-in
tries with the token are limited to 10 a minute from one address and 600 a minute overall, and a shared address, such as a
school's or a proxy's, shares that 10.

## What is kept, and for how long

With `--data-dir` (or a store on a cloud), drafts, events, answers and turns are kept in the shape
`viable-harness view` and `suggest` read. `--keep-days <n>` deletes, that long after each last changed, turns and
their traces, conversations, drafts, answers, highlights and events. A learner's code, name and how far they got stay, so
a learner can come back, to an empty draft if they were away that long.

```sh
viable-engine records export --data-dir ./data --out ./records
viable-harness view ./records/<course>/*.json --out report.html
viable-engine forget <learner's code or ID> --data-dir ./data --memory-dir ./memory
```

`forget` removes that learner's work, conversations, runs, memory and gateway records, and their place on the class
list. A chat page's visitors are anonymous, so nobody can name one of them to forget: use `--keep-days`.

## What isn't here, and what happens instead

| On VIABLE | Here |
| --- | --- |
| Voice, reading replies aloud | Offered when a model is set for hearing and for speaking ([Models](self-hosting.md#models-set-up-in-the-browser)). Until then, the microphone isn't offered, and Speech steps pass on. A browser asks for the microphone only on `localhost` or over HTTPS |
| Pictures and PDFs attached to a message | Offered when the reply model is set and switched on as reading them. Until then, the button isn't offered |
| Spoken questions | Not asked: recordings are kept and scored on VIABLE |
| Studies, consent, conditions | None: no notice, form or "About the study" |
| Previews, changing an activity while it runs | Whoever holds the token tries a course as a learner apart, who isn't counted. The console changes an activity at once; with no store, a new version is a new deploy |
| A short title for each new chat | The page titles it from the first message |

## The website a knowledge base reads

A package's snapshot is what is searched here. To read the sites again, on the rules the package lists
(a list's pages, a sitemap's, or a crawl under its path prefix, up to its page limit):

```sh
viable-engine knowledge refresh course.viable.zip --out ./refreshed
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

The panel reads every turn of the page's learner in that activity again when it opens (`POST …/watch`, under the
same rule), from the kept turn: its review, what a search found and `turn_record` (the step, and what the Harness
read of the moment). A teacher's try-out (Try it on the console, `?try=1` with the token) marks its turns `tried`,
and the console's activity page lists them under **What the AI did in your tries**.

## When the AI writes first

An activity's `teaching.speaks_up` lets the AI write first, unasked: quiet on a step, working a while without asking,
an answer wrong or right where the learner sees which, every so many new words of writing at a pause, writing handed
in. The page carries only when each moment comes, not what the AI is told then, and posts `messages` with
`event: { kind }` and no words when one comes; it never asks on a clock of its own. The server checks the teacher
chose it, for a learner it knows, and counts it against `most` in a step each day and `gap` minutes since the last
(409 `speaks_first_off`, 429 `speaks_first_limit`, 429 `speaks_first_soon`). The AI is told what to do at that moment, its reviewer reads no
message, and the turn is kept with `signals.source` `ai_first`, its `moment`, and no message. The learner sees
why it began, and a message of theirs goes first.
