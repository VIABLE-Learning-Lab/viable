# Add your work

Guidance from research, a dataset, a tool that reads conversations, open material or a resource to list: each has its own way into the [library](catalog.md).

Find what you have below, look at the example already in the library, and make yours the same way. Or open an issue with the
papers or a link, and the lab writes it with you.

| You have | It becomes | Look at |
| --- | --- | --- |
| [Research guidance](#research-guidance) | Guidance a teacher chooses for an activity | Feedback |
| [A dataset or a benchmark](#a-dataset-or-a-benchmark) | A test suite or a calibration set | TutorMoments |
| [A model or a tool that reads conversations](#a-model-or-a-tool-that-reads-conversations) | A measure, a detector or a step | Edu-ConvoKit |
| [Standards, a curriculum or open content](#standards-a-curriculum-or-open-content) | A knowledge folder | IM K–12 Math |
| [A resource to list](#a-resource-to-list) | An entry in the library | OpenStax |

## Research guidance

You have studied what helps learners. This is how a teacher setting up an activity can use it, with your name on it, in whatever AI
they use. There is nothing to host, no learner's data comes to you, and no code to write if you'd rather not.

**Look at** [Feedback](components/viable-feedback.md), one of the eight topics the VIABLE Harness carries, and
[its file](../src/components/guidance/feedback.json).

### What it looks like once it's in

A teacher opens **How the AI helps** in an activity and sees your topic beside the others, each piece with its source. They tick the ones
that fit.

Later a learner writes *"i got 2/5"*. Only the pieces that fit that moment reach the model, and they arrive saying where they came from:

```text
From research, where it fits:
- Before correcting a wrong answer, ask the learner to say how they got it. (Your name 2024)
```

Anyone who reads what the AI was given sees your citation with your words. Your work gets a page in the [library](catalog.md),
with what you showed, what comparing replies showed, and what nobody has shown yet. To show you that it's used, the VIABLE
Developer Platform counts replies that drew on a component, per day, with nothing about a class or a learner.

### What you write

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

`evidence` matters most. It keeps apart three things that are easy to blur: what your study found, what this particular use of it has been shown to do, and what is still unknown.

### See what it changes

If you have Node installed, the first line makes the folder, the second writes an activity's settings to try it on (any teacher's settings will do), and the third shows what a model is told with your file and without it:

```sh
npx github:VIABLE-Learning-Lab/viable component new your-lab/your-framework
echo '{ "goal": "Add fractions with unlike denominators.", "help": "hint" }' > activity.json
npx github:VIABLE-Learning-Lab/viable component try your-framework/manifest.json --teaching activity.json --message "i got 2/5"
```

```text
What a model is told for "i got 2/5" (the moment read: attempt)

Without your-lab/your-framework:
  ...what the teacher decided, and the teaching move...

With it, this is added, 2 of its 4 items:
  - Before correcting a wrong answer, ask the learner to say how they got it: the mistake is often in a step they can find themselves. (Feedback moves (template))
  - With unlike denominators, ask what the two fractions need to have in common before asking them to add. (Feedback moves (template))
```

No model is called and nothing is sent anywhere. [Components](components.md) has the details.

### If you don't write code

[Tell us about your work](https://github.com/VIABLE-Learning-Lab/viable/issues/new?template=component.yml) with the sentences and the papers, and we'll write the file with you. You review it before anyone else sees it.

### How it lands

1. It comes as a pull request, from you or from us, with you as its maintainer.
2. We check it against [the review checklist](components.md#the-review-checklist), and that each piece says what its source says.
3. We add it to the guidance the Harness carries, and it appears in the library with the next release. Teachers can then choose it on the VIABLE Developer Platform and on any Engine.

The license stays yours to choose, as long as it lets the words be used: CC BY 4.0 is the usual one. You can correct or withdraw it at any time. A new version goes out with the next release.

## A dataset or a benchmark

Records to test an agent's replies against, or replies people already rated, to check a judge model against. It is used to
test an AI, not while it teaches.

**Look at** [TutorMoments](catalog.md#tutormoments), connected as a test suite: [its entry](../catalog/tutormoments.json) and
[its connector](../src/resources/tutormoments.js). Replies people rated come in as a calibration set, as the
[conversational uptake annotations](catalog.md#conversational-uptake) do.

1. List it in one file, `catalog/<id>.json`, that says what it is, who made it, its license, how to cite it and how far it is
   connected. Open a [catalog issue](https://github.com/VIABLE-Learning-Lab/viable/issues/new?template=catalog.yml) and the lab
   writes it with you, or send it as a pull request with what `npm run catalog:build` writes from it.
2. Connect it, if its records would make cases worth running. A connector downloads a pinned version from its makers and
   turns each record into a case. [Write a connector](resources.md#write-a-connector) has the steps.
3. Try it: `viable-harness resources use <id> --out cases.json`, and read the cases. Then
   `viable-engine test agent.json --suite <id> --judge-model <model>` runs a test suite, and
   `viable-harness calibrate --set <id> --judge-model <model>` a calibration set.

## A model or a tool that reads conversations

Code that reads what a learner and an AI said: it marks or counts something, writes or checks a reply, or rates replies in a
test. It runs where you run it, and receives only the learner data its manifest lists.

**Look at** [Edu-ConvoKit](catalog.md#edu-convokit), connected as a measure with a detector beside it:
[its folder](../integrations/stanford-edu-convokit/) holds both manifests, the adapter and the fixtures.

1. Propose it in a [component proposal](https://github.com/VIABLE-Learning-Lab/viable/issues/new?template=component.yml),
   naming the work, its slot and its license.
2. Copy the template: `viable-harness component new <owner/name> --slot detector` makes a folder from
   [the template](../integrations/_template/), a detector over HTTP in plain Node.
3. Write its manifest: what it receives, where it runs, its license, how to cite it, its evidence and its risk.
   [Components](components.md#the-manifest) has the format, and [the review checklist](components.md#the-review-checklist)
   what is checked.
4. Try it with synthetic fixtures: `viable-harness component manifest.json --input fixtures/input.json`, or for a
   measure `viable-harness measure record.json --component manifest.json`.
5. Open a pull request with the folder and a test that runs its fixtures.

A simulated learner is planned: no agent test uses one yet.
[Tell us about yours](https://github.com/VIABLE-Learning-Lab/viable/issues/new?template=component.yml).

## Standards, a curriculum or open content

Lessons, guides or standards an agent can search and cite while it teaches.

**Look at** [IM K–12 Math](catalog.md#illustrative-mathematics), connected as a knowledge folder:
`viable-harness resources get illustrative-mathematics --grade 6 --unit 4` brings one unit's student lessons from its makers,
and [its connector](../src/resources/illustrativeMath.js) shows how.

1. List it, as for [a dataset](#a-dataset-or-a-benchmark), with the license of each part.
2. Connect it. A connector whose `use` returns `{ knowledge }` gives the files a Knowledge step searches. Fetch only the
   parts whose license allows the use. [Write a connector](resources.md#write-a-connector) has the steps.
3. Try it: `viable-engine run agent.json --input "..." --knowledge <kb-id>=resource:<id>`.

Standards can also come in as a lookup that puts one into an activity's teaching settings, as the
[Learning Commons Knowledge Graph](catalog.md#learning-commons-knowledge-graph) does.

## A resource to list

Anything public for K-12 AI that people should know about, connected or not. An entry describes it; it doesn't endorse it.

**Look at** [OpenStax](catalog.md#openstax), listed with why it goes no further: [its entry](../catalog/openstax.json).

1. Check it against its primary source, its own site, repository, license file, dataset card or paper: the link, the
   license of each part, how to get it, and whether it is released. That day is its `verified_at`.
2. Send it: a [catalog issue](https://github.com/VIABLE-Learning-Lab/viable/issues/new?template=catalog.yml), or a pull
   request with `catalog/<id>.json` and what `npm run catalog:build` writes from it.
   [CONTRIBUTING.md](../../CONTRIBUTING.md#catalog-entries) says what qualifies.
