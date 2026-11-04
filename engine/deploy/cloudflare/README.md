# {{title}} on Cloudflare Workers

**{{title}}** as a Worker on your own Cloudflare account, {{package_from}}, scaffolded by
`viable-engine deploy cloudflare` (Engine {{version}}). {{#package}}The package is a private asset of the Worker:
nothing serves it to the public.{{/package}}

## Deploy

You need a Cloudflare account on the paid Workers plan: reading a package and searching it can take
more than the free plan's 10 ms of CPU per request.

```sh
npm install
npx wrangler login
{{#store}}npx wrangler d1 create {{name}}          # copy the database_id it prints into wrangler.toml
{{/store}}export VIABLE_ENGINE_TOKEN=$(openssl rand -hex 32)
printf %s "$VIABLE_ENGINE_TOKEN" | npx wrangler secret put VIABLE_ENGINE_TOKEN
npx wrangler secret put OPENAI_API_KEY   # if your endpoint needs a key
npx wrangler deploy
```

Models are set at `/console` once it runs. `OPENAI_BASE_URL` in `wrangler.toml`, if you set it, wins over that. Keep a copy of the token somewhere safe: a secret can't
be read back.

## Try it on this machine first

```sh
npm install
cp .dev.vars.example .dev.vars      # then put a token in it: openssl rand -hex 32
npx wrangler dev --local --port 8787
```

{{#store}}`--local` keeps its database in `.wrangler/` and touches nothing on your account. {{/store}}A model endpoint on
this machine works here, for instance `http://127.0.0.1:11434/v1`; once deployed, the Worker can only
reach public addresses.

## Check it

`wrangler deploy` prints the Worker's address.

```sh
viable-engine verify https://{{name}}.YOUR-SUBDOMAIN.workers.dev --token-env VIABLE_ENGINE_TOKEN
viable-engine verify https://{{name}}.YOUR-SUBDOMAIN.workers.dev --token-env VIABLE_ENGINE_TOKEN --turn   # costs one real model call
```

{{common}}
