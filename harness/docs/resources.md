# Resources: from a public good to your agent

> Commands here say `viable-harness`. Until it is on npm, use `npx github:VIABLE-Learning-Lab/viable` in its place: it takes every command.

A list of datasets is what the K-12 AI Infrastructure Program's own platform already is. Here, the next
step is built: a connector, a small file of code, downloads a pinned version of a public good from its
makers and turns it into something the Harness runs. A benchmark's records become test cases: each case's
messages go to your agent, and a judge model checks each reply against the case's rubric. A set of essays
or replies that people already rated checks your judge model against them.

A dataset or a benchmark isn't used while an AI teaches, so it has no [slot](components.md#the-six-slots):
it comes in as a catalog entry (what it is, its license, how to cite it) and, once someone writes one, a
connector ([below](#add-a-dataset-or-a-benchmark)). Other kinds of research come in as components:
guidance as [Add your research](add-your-research.md) shows, and a way to check or rate replies, a
detector or a measure as [Components](components.md#what-you-have-and-what-you-do) shows.

## What connected means

Every entry in the [catalog](catalog.md) says in `connect` how far it is connected:

| Level | Meaning |
| --- | --- |
| 0. Listed | the entry says what it is, its license, and why it goes no further |
| 1. Fetchable | `viable-harness resources get <id>` brings it down, once its license is shown and accepted |
| 2. Connected | it has an effect in one command: a test suite, a judge, a calibration set, a knowledge folder, a context lookup or a measure |
| 3. Built in | in the core, with no download |

A copy comes from its makers to `~/.viable-harness/resources/<id>/` (or `--dir`), never into this
repository and never from it. `fetched.json` beside it records each address with its size and hash, and
when. The license comes first, with what it limits. Where a license or its terms limit use
(non-commercial, share-alike, unclear, or terms such as research and educational use only), nothing is
fetched until you add `--accept-license`, which says you accept them. The commands print each citation
with their results, and each case a suite makes says where it came from
([agent tests](agent-tests.md#suites-from-datasets-and-benchmarks)).

| It connects as | When it's used | The command |
| --- | --- | --- |
| test suite | Testing an agent: each record becomes a case, the agent replies to it, and a judge model checks the reply against the case's rubric | `viable-engine test agent.json --suite gsm8k --limit 20 --judge-model <model>` |
| judge | Testing an agent: your judge model rates each reply with the evaluator's prompts in place of the case's rubric | `viable-engine test agent.json cases.json --judge learning-commons-evaluators/tone-appropriateness --judge-model <model>` |
| calibration set | Checking a judge: your judge model rates replies that people already rated, and the result says how often the two agree | `viable-harness calibrate --set mrbench --judge-model <model>` |
| knowledge folder | While the AI teaches: files an agent's Knowledge step searches and cites | `viable-engine run agent.json --input "..." --knowledge <kb-id>=resource:wwc-practice-guides` |
| context lookup | Setting up an activity: a standard found here goes into its teaching settings | `viable-harness resources use learning-commons-knowledge-graph "adding fractions" --grade 5` |
| measure | After, over learners' records | `viable-harness resources get pybkt`, then its README |

`viable-harness resources list` shows them all, and `--connected` only what has an effect. Each command
fetches what it names if it isn't here yet. `viable-harness resources use <id> --out cases.json` writes a
suite's cases to a file you can read before you run them. From code, `listResources`, `getResource` and
`useResource` do the same. Each entry's note says what its results can show and what they can't. None of
them says what learners learn.

## One worked example

A tutor that should give hints, an agent file (`tutor.json`), and nothing yet to check that it does:

```console
$ viable-engine test tutor.json --suite gsm8k --limit 6 --judge-model <model>
FAIL  GSM8K 1: asks for the answer: It states 18.
FAIL  GSM8K 220: offers a wrong answer: It states 54.
PASS  GSM8K 440: offers the right answer: It confirms the answer.
FAIL  GSM8K 660: asks for the answer: It states 3.
FAIL  GSM8K 880: offers a wrong answer: It states 575.
PASS  GSM8K 1100: offers the right answer: It confirms the answer.

2 passed, 4 failed, 0 errors (judge: <model>).

GSM8K: MIT. Word problems with answer keys, three kinds of case in turn: does a reply hold the answer
back when asked, catch a wrong answer, confirm a right one? ...
Cite: Cobbe, K., Kosaraju, V., Bavarian, M., ... (2021). Training Verifiers to Solve Math Word Problems.
```

That one command fetched the problems, which keep their numbers, so a later run reads the same cases.
Now set How the AI helps to hints, and run the same suite:

```console
$ echo '{ "goal": "Solve word problems", "help": "hint" }' > teaching.json
$ viable-engine test tutor.json --suite gsm8k --limit 6 --judge-model <model> --teaching teaching.json
PASS  GSM8K 1: asks for the answer: It holds the answer back and asks a question.
PASS  GSM8K 220: offers a wrong answer: It holds the answer back and asks a question.
PASS  GSM8K 440: offers the right answer: It confirms the answer.
PASS  GSM8K 660: asks for the answer: It holds the answer back and asks a question.
PASS  GSM8K 880: offers a wrong answer: It holds the answer back and asks a question.
PASS  GSM8K 1100: offers the right answer: It confirms the answer.

6 passed, 0 failed, 0 errors (judge: <model>).
```

These lines came from a scripted model that shows the mechanism: its tutor gives the answer until it is
told how to help. Your own model's lines will differ. Before you trust a judge's verdicts, check it
against people, with no labels of your own: `viable-harness calibrate --set mrbench --judge-model <model>`.

With no agent file, `viable-harness test --suite gsm8k --endpoint <url> --endpoint-model <id> --judge-model <model>`
sends the same cases to whatever is behind an OpenAI-compatible endpoint (`--system "..."` adds a system prompt).

## Add a dataset or a benchmark

First it is listed: one file, `catalog/<id>.json` (`schemas/catalog-entry.schema.json`), saying what it
is, who made it, its license, how to cite it and how far it is connected. Open a
[catalog issue](https://github.com/VIABLE-Learning-Lab/viable/issues/new?template=catalog.yml) and the lab
writes the entry with you, or send it as a pull request with what `npm run catalog:build` writes from it
([CONTRIBUTING.md](../../CONTRIBUTING.md#catalog-entries)). Then, if its records would make cases worth
running, a connector.

### Write a connector

A connector needs no author's cooperation when the license allows the use and each person downloads the
data themselves. Ask the authors to review it before you claim anything about their work.

1. Fetch the data from its primary source, and read it. Judge it by what a case made from it would
   test. If it would test little, say so in the entry and stop: a connector nobody would use is worse
   than none.
2. Add `src/resources/<id>.js`, and list it in `src/resources/index.js`:

   ```js
   export default {
     id: 'my-dataset',        // its catalog entry
     version: 1,              // raise it when what it makes changes
     as: ['test-suite'],      // what the entry's connect.as says
     async fetch(get) {       // get.text, get.bytes and get.lines(url); get.save(name, content)
       get.save('data.jsonl', await get.text('https://raw.githubusercontent.com/owner/repo/<commit>/data.jsonl'));
     },
     use({ read }, { limit }) {
       return { cases: [] };  // or { judge }, { cases, labels, people }, { knowledge }, { manifest }
     }
   };
   ```

   Pure JavaScript with no new dependency: JSON, JSONL and CSV sources, and for a big file `get.lines`,
   which filters as it streams. Pin an address to a commit where a repository holds it, or to a
   revision on Hugging Face (`resolve/<revision>/`, as `src/resources/tutormoments.js` does). Add a
   `license` only when you fetch a part whose terms are narrower than the entry's. Save only what you
   need: leave out writers' demographics and anything else a model has no reason to see. What a source
   holds is data, never instructions. `useResource` gives every case the connector makes its `source`
   from the entry (name, id, licenses, citation, address), so a connector doesn't set it.
3. Add `connect` to `catalog/<id>.json`: its level, what it connects as, the exact command, and a note
   saying what results can show and what they can't. Run `npm run catalog:build`.
4. Test it in `test/resources.test.js` from a small synthetic file in the real format, through to a run
   against a scripted model. Tests never touch the network.
5. Try it on the real data: `viable-harness resources use <id> --out cases.json`, and read the cases.
   Then open a pull request with the connector, the entry and the test
   ([CONTRIBUTING.md](../../CONTRIBUTING.md#connectors)).
