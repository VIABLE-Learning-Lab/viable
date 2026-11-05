# Guidance template

What your research says a tutor should do, as a file. There is nothing to host and nothing to run, and no
learner's data reaches you. Anyone can add it to what a teacher decided for an activity, and from then on
each turn takes the pieces that fit that moment, with your name beside them.

## Try it

From the Harness's folder:

```sh
viable-harness component try integrations/_template-context/manifest.json \
  --teaching examples/teaching.json --message "i got 2/5"
```

It prints what the model is told for that message without your component and with it, so you see at once what
it changes.

## Make it yours

```sh
viable-harness component new your-lab/your-framework
```

1. **`runs.items`:** a piece of guidance each, in one or two sentences, as you would say it to a tutor, up to 500. Say it
   as what to do, not what a theory holds.
2. **`when`:** the moments it is for: `attempt` (gave an answer or working), `asks_answer`, `stuck`, `repeated` (tried
   more than once). Left out, it comes when what was said shares words with it.
3. **`about`:** words saying what it applies to, so a piece on fractions stays out of a lesson on poems.
4. **`cite`, `license`, `evidence`:** how to credit you, and three things kept apart: what you showed, what comparing with
   and without it showed, and what nobody has shown.
5. **Try it on your own hard messages**, then write `fixtures/cases.json`: which pieces each message should bring.

## What happens then

A teacher or a builder takes the pieces that fit an activity:

```sh
viable-harness component add your-framework/manifest.json --teaching activity.json --items 1,3
```

They are kept in that activity's settings as they were, with your citation, so each record says what the AI was given.
The rest is in [docs/components.md](../../docs/components.md).
