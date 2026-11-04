# {{title}} on your own machine

**{{title}}** as a Node server, from `{{package}}`, scaffolded by `viable-harness deploy node`
(harness {{version}}). Needs Node 22.9 or newer.

## Run it

```sh
npm install
cp .env.example .env     # set OPENAI_BASE_URL, OPENAI_API_KEY and VIABLE_HARNESS_TOKEN
npm start
```

It listens on `127.0.0.1:8080`. It speaks plain HTTP, so keep it there and put a web server with a
certificate in front of it. With [Caddy](https://caddyserver.com):

```text
harness.example.edu {
  reverse_proxy 127.0.0.1:8080
}
```

## Check it

```sh
export VIABLE_HARNESS_TOKEN=...   # the same token
viable-harness verify http://127.0.0.1:8080 --token-env VIABLE_HARNESS_TOKEN
viable-harness verify http://127.0.0.1:8080 --token-env VIABLE_HARNESS_TOKEN --turn   # costs one real model call
```

{{common}}
