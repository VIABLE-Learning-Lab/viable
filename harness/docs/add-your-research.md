# Add your research

You have studied what helps learners. This is how a teacher setting up an activity can use it, with your name on it, in whatever AI
they use. There is nothing to host, no learner's data comes to you, and no code to write if you'd rather not.

## What it looks like once it's in

A teacher opens **How the AI helps** in an activity and sees your topic beside the others, each piece with its source. They tick the ones
that fit.

Later a learner writes *"i got 2/5"*. Only the pieces that fit that moment reach the model, and they arrive saying where they came from:

```text
From research, where it fits:
- Before correcting a wrong answer, ask the learner to say how they got it. (Your name 2024)
```

Three things follow from that:

- **Your citation travels with your words.** Anyone who reads what the AI was given sees it.
- **Your work gets a page** in the [library](catalog.md), with what you showed, what comparing replies showed, and what nobody has shown yet.
- **You can see that it's used.** The VIABLE Developer Platform counts replies that drew on a component, per day. Nothing about a class or a learner comes with the count.

## What you write

One file, in plain sentences. Each piece says which moments it is for: `attempt` (they gave an answer), `asks_answer`, `stuck` or `repeated` (they keep trying). `about` is optional: words that have to come up in the conversation.

```json
{
  "id": "your-lab/your-framework",
  "version": "0.1.0",
  "slot": "context",
  "label": "What it's called",
  "summary": "One sentence a teacher can read.",
  "runs": {
    "kind": "data",
    "items": [
      {
        "text": "Before correcting a wrong answer, ask the learner to say how they got it.",
        "when": ["attempt"],
        "source": "Your name 2024"
      },
      {
        "text": "With unlike denominators, ask what the two fractions need to have in common.",
        "when": ["attempt", "stuck"],
        "about": "fractions denominators adding common",
        "source": "Your name 2024"
      }
    ]
  },
  "receives": [],
  "sends_to": [],
  "uses_models": false,
  "license": { "data": "CC-BY-4.0" },
  "authors": ["Your name"],
  "cite": "Your name (2024). Your paper. Your journal. https://doi.org/...",
  "evidence": {
    "original": "What your work showed, and for whom.",
    "integration": "What comparing replies with and without it showed. None yet is a fine answer.",
    "unknown": "What nobody has shown yet, such as whether it changes what learners learn."
  },
  "risk": "low",
  "risk_notes": "Its text goes to a model as guidance. Nothing runs and nothing about a learner goes anywhere.",
  "maintainer": { "name": "Your name" },
  "harness": ">=0.3.0 <1.0.0",
  "fixtures": "fixtures/"
}
```

`evidence` is the part that matters most. It keeps three things apart that are easy to blur: what your study found, what this particular use of it has been shown to do, and what is still unknown. Nobody is asked to claim more than they have.

## See what it changes

If you have Node installed, this makes the folder, and the second line shows what a model is told with your file and without it:

```sh
npx github:VIABLE-Learning-Lab/viable component new your-lab/your-framework
npx github:VIABLE-Learning-Lab/viable component try your-framework/manifest.json --teaching activity.json --message "i got 2/5"
```

```text
What a model is told for "i got 2/5" (the moment read: attempt)

Without your-lab/your-framework:
  ...what the teacher decided, and the teaching move...

With it, this is added, 2 of its 4 items:
  - Before correcting a wrong answer, ask the learner to say how they got it. (Your name 2024)
  - With unlike denominators, ask what the two fractions need to have in common. (Your name 2024)
```

No model is called and nothing is sent anywhere. [Components](components.md) has the details, including other kinds of work: a method that checks a reply, a way to rate replies, a dataset or a benchmark.

## If you don't write code

[Tell us about your work](https://github.com/VIABLE-Learning-Lab/viable/issues/new?template=component.yml) with the sentences and the papers, and we'll write the file with you. You review it before anyone else sees it.

## How it lands

1. It comes as a pull request, from you or from us, with you as its maintainer.
2. We check [seven things](components.md): among them that the source says what the piece says, and that the license lets it travel.
3. We add it to the guidance the Harness carries, and it appears in the library with the next release. Teachers can then choose it on the VIABLE Developer Platform and on any Engine.

The license stays yours to choose, as long as it lets the words be used: CC BY 4.0 is the usual one. You can correct or withdraw it at any time. A new version goes out with the next release.
