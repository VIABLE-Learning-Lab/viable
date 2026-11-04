# {{title}} on AWS Lambda

**{{title}}** as a Lambda function with a function URL, from `{{package}}`, scaffolded by
`viable-harness deploy aws-lambda` (harness {{version}}). The package is in the function's code.

{{#store}}**Its store is an S3 bucket, not DynamoDB.** A DynamoDB item stops at 400 KB, which a long
conversation can pass; an S3 object doesn't. The bucket is private. Once a day a second function, `Sweeper`,
deletes what `KeepDays` has passed, each from when it last changed: conversations, runs, turns and their
traces, and a learner's drafts, answers, highlights and events (a learner away that long comes back to an
empty draft). Lifecycle rules delete conversations and runs too, in case it doesn't run. What stays until you delete
it: a learner's code and how far they got (`viable-harness forget`), and Memory steps' facts, under
`memory/<learner>`.
{{/store}}{{^store}}**It keeps nothing between requests:** no conversations, and Memory steps are skipped. Apps send
the earlier messages themselves, with `history_mode: "client"`.
{{/^store}}
## Deploy

You need the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
and an AWS account.

```sh
export VIABLE_HARNESS_TOKEN=$(openssl rand -hex 32)
sam build
sam deploy --guided \
  --stack-name {{name}} --capabilities CAPABILITY_IAM \
  --parameter-overrides "OpenAiBaseUrl={{endpoint}} OpenAiApiKey=$OPENAI_API_KEY HarnessToken=$VIABLE_HARNESS_TOKEN"
```

The key and the token become the function's environment variables. Anyone who can read the function
in your AWS account can read them; use Secrets Manager if that's too wide.

## Check it

`sam deploy` prints the address as the output `Url`.

```sh
viable-harness verify https://YOUR-ID.lambda-url.REGION.on.aws --token-env VIABLE_HARNESS_TOKEN
viable-harness verify https://YOUR-ID.lambda-url.REGION.on.aws --token-env VIABLE_HARNESS_TOKEN --turn   # costs one real model call
```

{{common}}
