# Try it

This page is for educators, IT staff and developers who want to see the Engine work on their own computer before deciding to
deploy it. `try` opens real learner pages with six example courses and a panel that shows what the AI was told and how it
replied, using scripted replies or your own model.

```sh
npx github:VIABLE-Learning-Lab/viable
```

Or, in a clone, `viable-engine try`, with a package or an agent file if you have one. It opens a page on
your own computer with six example courses (or what you named). They are the real learner pages, with one
thing added beside them: a panel called **What the AI did**.

Ask the fractions tutor "just tell me the answer" and watch. You see what the teacher told the AI, the
draft, the reviewer striking it with its reason, the rewrite, and what reached the learner. Change how far
the AI may help, ask again, and the reply changes.

## Demo mode, and your own model

With no key it runs in **demo mode**: the model's words are scripted, and everything around them is the real
harness. No model is called, and what you type stays on your computer. With `OPENAI_API_KEY` or
`OPENAI_BASE_URL` set, it runs on your model, and says so. `--demo` keeps it scripted anyway. The example courses
name the chat model they were written for (`gpt-oss-120b`), so add `--model <id>` with one your endpoint serves.

On your own model, a package with misconceptions to listen for costs one more call per message: it
asks the model which of them the message shows. Learners' names and identifiers are never sent.

| Flag | What it does |
| --- | --- |
| `--port <n>` | where it answers (5730, or a free port if that's taken) |
| `--no-open` | doesn't open a browser |
| `--demo` | scripted replies, even with a key |
| `--demo --tour` | plays the scene by itself, the same each time, for recording. Only then does `/?tour=1` do anything, since any website can send a person there |
| `--model <id>`, `--reviewer-model <id>` | replace the models a package names |
| `--export <dir>`, `--base <path>`, `--publish-answers` | a static copy of demo mode, below |

It answers on this computer only: it binds to 127.0.0.1, refuses any other name, and refuses a post from
another website, so a page you are visiting can't change its settings, read what the AI did or spend your
key. What you change in a try-out lasts until it stops. In demo mode a package's Fetch URL steps and http
components stop too, so nothing leaves. Don't put a try-out behind a proxy: what the AI did is granted to
whoever looks like this computer, and only a proxy that says it is one can be told apart.

## What's on the page

- **The panel.** The teacher's settings, then each message as it happens. A small control changes how far the
  AI may help, and the goal, for this try only.
- **The teacher's page** (`/teacher`), with a made-up class from `examples/class/`. Accepting a suggestion
  changes the try-out's settings too. With your own package it shows what happened in the try-out.
- **Resources** (`/resources`): the catalog, the connected ones first, with what each does.
- **Take it live**: the commands from `viable-engine deploy`, and a prompt to give an AI assistant.

The density lab's frame loads from developers.viablelab.org, and its card says so. Nothing else on these
pages loads from anywhere else.

## A static copy for a website

```sh
viable-engine try --export site --base /try
```

This writes the same pages, with a small script answering their requests in the visitor's browser from the
scripted replies, using the real engine. Put the folder on any static host. `--base` is the path it will be
served under; leave it out for a site's root. Nothing a visitor types leaves their browser. The script is
written only into a copy: no server route serves it.

**A copy publishes what it runs on.** The real engine answers in the visitor's browser, so all of it is in a
file anyone can read: each agent's instructions, every question with its answer key, hints and explanations,
and what the package holds for its knowledge bases. The bundled examples are public already. Anything else is
refused unless you add `--publish-answers`, and even then a teacher's notes (`watch_for`) and the package's
notes are left out. A course with a real quiz doesn't belong in one: use `viable-engine deploy`.

**Give it its own path or subdomain, and not an origin with accounts.** A static page can't have a fresh
nonce per request, so its pages carry a fixed one and allow scripts from their own origin
(`script-src 'self'`). On an origin where people sign in, those pages are a weaker neighbor than the site
deserves. In a static copy, `--demo --tour` clears only the browser storage that copy created (`viable-chat:` and `viable-try:`).

## The panel on your own server

It is off by default. It carries instructions, drafts and reviewers' reasons, so a learner must never get it.
The route decides on each request, never the page. A try-out from the console's **Try it** has it on any server,
since only the token holder reaches one, with the help levels to try for that try alone
([learner-pages.md](learner-pages.md)).

`viable-engine serve ... --panel` grants it to whoever holds the token. With no `--token-env`, the server
makes a token at start and prints it once, so the grant is never decided by a header. Sign in at `/teacher`;
its links open a page with `?panel=1`, which is what asks for the panel. A page without it stays a learner's
page, even in the browser you signed in on.

That browser is the thing to watch on a shared computer. The session ends when the browser closes, or after 8
hours, and the panel and the teacher's page each have a **Sign out**: use it before a learner sits down. Until
then, anyone at that browser who types `?panel=1` sees what you see. In code, `learnerRoutes({ traces, panel })`;
see `src/learner/watch.js`, where `watchSlot` is what a page gets and `watchHooks` is what a run tells it.

## Test results as a page

```sh
viable-engine test agent.json cases.json --judge-model <id> --html
```

This serves the results on this computer until you press Ctrl-C. Add `--out report.html` for one file instead.
Each case shows the learner's message, what a good reply does and must not do, the agent's reply and the judge's
reason. A case from a suite (`--suite`) also shows where it comes from, with its licenses, and the page ends with
each suite's citation ([agent tests](../../harness/docs/agent-tests.md#suites-from-datasets-and-benchmarks)).
