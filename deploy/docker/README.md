# {{title}} in a container

**{{title}}** as a container image, from `{{package}}`, scaffolded by `viable-harness deploy docker`
(harness {{version}}). The package and its files are in the image. It runs as a user without root.

## Run it

```sh
docker build -t {{name}} .
export VIABLE_HARNESS_TOKEN=$(openssl rand -hex 32)
docker run -d --name {{name}} -p 127.0.0.1:8080:8080 \
  -e VIABLE_HARNESS_TOKEN -e OPENAI_BASE_URL={{endpoint}} -e OPENAI_API_KEY{{#store}} \
  -e VIABLE_HARNESS_KEEP_DAYS=180 -v {{name}}-data:/data{{/store}} \
  {{name}}
```

It speaks plain HTTP: keep it on `127.0.0.1` and put a web server with a certificate in front of it.

**With Compose** instead, which also starts it again if it exits:

```sh
cp .env.example .env    # set OPENAI_BASE_URL, OPENAI_API_KEY and VIABLE_HARNESS_TOKEN
docker compose up -d --build
```

**A model endpoint on this same machine:** in a container, `localhost` is the container. Use
`http://host.docker.internal:<port>/v1`, and have the endpoint listen on more than `127.0.0.1` on Linux. On
Linux, `docker run` also needs `--add-host=host.docker.internal:host-gateway`; `compose.yaml` has it.

## Check it

```sh
viable-harness verify http://127.0.0.1:8080 --token-env VIABLE_HARNESS_TOKEN
viable-harness verify http://127.0.0.1:8080 --token-env VIABLE_HARNESS_TOKEN --turn   # costs one real model call
```

{{#store}}## Stop it, and start it again

`docker stop {{name}}` lets a reply under way finish and be kept, for 10 seconds; add `-t 300` to wait for the longest
run. What it keeps is on the volume: `docker rm {{name}}`, then the same `docker run`, picks it up. A new volume is
writable by its user; a folder you mount with `-v ./data:/data` must be writable by uid 1000, or it won't start.

It also runs with `--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges`. Then `docker cp` can't
read `/tmp`, so below, export to `/data/records`, copy that, and remove it with `docker exec {{name}} rm -r /data/records`.

## A learner's records

```sh
docker exec {{name}} node records.js export --data-dir /data --out /tmp/records
docker cp {{name}}:/tmp/records ./records
docker exec {{name}} node records.js forget <learner's code or ID> --data-dir /data
```

These are `viable-harness records export` and `viable-harness forget`, inside the container. With Compose, write
`docker compose exec {{name}}` for `docker exec {{name}}`.

{{/store}}{{common}}
