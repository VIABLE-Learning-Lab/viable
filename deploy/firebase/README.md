# {{title}} on Firebase

**{{title}}** as a Firebase Function (2nd gen), from `{{package}}`, scaffolded by
`viable-harness deploy firebase` (harness {{version}}). The package is in the function's code.

## Deploy

You need the [Firebase CLI](https://firebase.google.com/docs/cli) and a project on the Blaze plan, which
Functions require. Replace `PROJECT`.

```sh
firebase use PROJECT
(cd functions && npm install)
export VIABLE_HARNESS_TOKEN=$(openssl rand -hex 32)
printf %s "$VIABLE_HARNESS_TOKEN" | firebase functions:secrets:set VIABLE_HARNESS_TOKEN --data-file=-
firebase functions:secrets:set OPENAI_API_KEY      # any text if your endpoint needs no key
firebase deploy --only functions{{#store}},firestore{{/store}}
```

It asks for `OPENAI_BASE_URL` on the first deploy, and keeps your answer in `functions/.env.PROJECT`. Keep
a copy of the token somewhere safe. {{#store}}Once a day the `sweep` function deletes what
`VIABLE_HARNESS_KEEP_DAYS` (default 180; set it in `functions/.env`, empty to keep everything) has passed, each
from when it last changed: conversations, runs, turns and their traces, and a learner's drafts, answers,
highlights and events (a learner away that long comes back to an empty draft). What stays until you delete it:
a learner's code and how far they got (`viable-harness forget`), and Memory steps' facts, under `memory/<learner>`.{{/store}}

## Try it on this machine first

A `demo-` project touches nothing on any account. This needs no plan and no login.

```sh
(cd functions && npm install)
printf 'VIABLE_HARNESS_TOKEN=local-token\nOPENAI_API_KEY=unused\n' > functions/.secret.local
printf 'OPENAI_BASE_URL=http://127.0.0.1:11434/v1\n' > functions/.env
firebase emulators:start --only functions{{#store}},firestore{{/store}} --project demo-harness
```

It answers at `http://127.0.0.1:5001/demo-harness/us-central1/harness`.{{#store}} The Firestore emulator needs Java.{{/store}}

## Check it

`firebase deploy` prints the function's address.

```sh
viable-harness verify https://harness-YOUR-ID.REGION.run.app --token-env VIABLE_HARNESS_TOKEN
viable-harness verify https://harness-YOUR-ID.REGION.run.app --token-env VIABLE_HARNESS_TOKEN --turn   # costs one real model call
```

## What about App Hosting?

Firebase App Hosting is built for web frameworks (Next.js, Angular), and this isn't one. Its docs are the
authority on what it will build today. If you want it anyway, it needs what any Node server does: a
root `package.json` whose `start` script listens on `$PORT`, the secrets from `apphosting.yaml` in Cloud
Secret Manager, and a store that isn't the disk. `viable-harness deploy node` gives you such a server,
and `apphosting.yaml` here its settings. This path hasn't been tried. The simpler way to a single address
on Google is Functions, as here, or `viable-harness deploy cloud-run` in the same project.

{{common}}
