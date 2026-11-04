# {{title}} on your own machine

**{{title}}** as a Node server, {{package_from}}, scaffolded by `viable-engine deploy node`
(Engine {{version}}). Needs Node 22.9 or newer.

## Run it

```sh
npm install
cp .env.example .env     # set VIABLE_ENGINE_TOKEN
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
export VIABLE_ENGINE_TOKEN=...   # the same token
viable-engine verify http://127.0.0.1:8080 --token-env VIABLE_ENGINE_TOKEN
viable-engine verify http://127.0.0.1:8080 --token-env VIABLE_ENGINE_TOKEN --turn   # costs one real model call
```

{{common}}
