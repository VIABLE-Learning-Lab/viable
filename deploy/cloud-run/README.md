# {{title}} on Google Cloud Run

**{{title}}** as a Cloud Run service, from `{{package}}`, scaffolded by `viable-harness deploy cloud-run`
(harness {{version}}). The package and its files are in the image, built from this folder's Dockerfile.

## Deploy

Replace `PROJECT` and `REGION`. Secrets go in Secret Manager, never in the image.

```sh
gcloud config set project PROJECT
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com

export VIABLE_HARNESS_TOKEN=$(openssl rand -hex 32)
printf %s "$VIABLE_HARNESS_TOKEN" | gcloud secrets create {{name}}-token --data-file=-
printf %s "$OPENAI_API_KEY" | gcloud secrets create {{name}}-model-key --data-file=-
{{#store}}gcloud storage buckets create gs://PROJECT-{{name}} --location=REGION --uniform-bucket-level-access
{{/store}}
gcloud run deploy {{name}} --source . --region REGION --allow-unauthenticated \
  --timeout 300 --concurrency 40 --memory 1Gi \
  --set-env-vars OPENAI_BASE_URL={{endpoint}},VIABLE_HARNESS_TIMEOUT=280{{#store}},VIABLE_HARNESS_KEEP_DAYS=180{{/store}} \
  --set-secrets VIABLE_HARNESS_TOKEN={{name}}-token:latest,OPENAI_API_KEY={{name}}-model-key:latest{{#store}} \
  --add-volume 'name=data,type=cloud-storage,bucket=PROJECT-{{name}},mount-options=uid=1000;gid=1000' \
  --add-volume-mount volume=data,mount-path=/data{{/store}}
```

`--allow-unauthenticated` lets the server be reached; the token still decides who may run an agent.
{{#store}}An instance deletes what `VIABLE_HARNESS_KEEP_DAYS` has passed when it starts and every 6 hours while it
runs. A service nobody opens has no instance, so nothing is deleted until someone next does. If that matters,
add a Cloud Scheduler job that opens `/health` once a day.
{{/store}}The service's account needs access to the two secrets (`roles/secretmanager.secretAccessor`){{#store}}
and the bucket (`roles/storage.objectUser`){{/store}}.

## Check it

`gcloud run deploy` prints the service's address. Later, read the token back with
`gcloud secrets versions access latest --secret {{name}}-token`.

```sh
viable-harness verify https://YOUR-SERVICE.run.app --token-env VIABLE_HARNESS_TOKEN
viable-harness verify https://YOUR-SERVICE.run.app --token-env VIABLE_HARNESS_TOKEN --turn   # costs one real model call
```

{{common}}
