# Resources: from a public good to your agent

A list of datasets is what the K-12 AI Infrastructure Program's own platform already is. The reason to
come here is the next step: a benchmark or a set of rated essays runs against your agent or your judge,
and changes what you see in a test report.

## What connected means

Every entry in the [catalog](catalog.md) carries its level in `connect`, so nobody mistakes a listing
for a capability.

| Level | Meaning |
| --- | --- |
| 0. Listed | the entry says what it is, its license, and why it goes no further |
| 1. Fetchable | `viable-harness resources get <id>` brings it down, once its license is shown and accepted |
| 2. Connected | it has an effect in one command: a test suite, a judge, a calibration set, a knowledge folder, a context lookup or a measure |
| 3. Built in | in the core, with no download |

A copy comes from its makers to `~/.viable-harness/resources/<id>/` (or `--dir`), never into this
repository and never from it. `fetched.json` beside it records each address with its size and hash, and
when. Where a license limits use (non-commercial, share-alike, or unclear), nothing is fetched until
you add `--accept-license`; that is your decision, and yours to keep to. Keep each citation: the commands
print it with their results.

| It connects as | The command |
| --- | --- |
| test suite | `viable-engine test agent.json --suite gsm8k --limit 20 --judge-model <model>` |
| judge | `viable-engine test agent.json cases.json --judge learning-commons-evaluators/tone-appropriateness --judge-model <model>` |
| calibration set | `viable-harness calibrate --set mrbench --judge-model <model>` |
| knowledge folder | `viable-engine run agent.json --input "..." --knowledge <kb-id>=resource:wwc-practice-guides` |
| context lookup | `viable-harness resources use learning-commons-knowledge-graph "adding fractions" --grade 5` |
| measure | `viable-harness resources get pybkt`, then its README |

`viable-harness resources list` shows them all. Each command fetches what it names if it isn't here yet.
From code, `listResources`, `getResource` and `useResource` do the same. Each entry's note says what its
results can show and what they can't. None of them says what learners learn.

## One worked example

A tutor that should give hints, and nothing yet to check that it does:

```console
$ viable-harness test tutor.json --suite gsm8k --limit 6 --judge-model <model>
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
$ echo '{ "goal": "Solve word problems", "help": "hints" }' > teaching.json
$ viable-harness test tutor.json --suite gsm8k --limit 6 --judge-model <model> --teaching teaching.json
PASS  GSM8K 1: asks for the answer: It holds the answer back and asks a question.
PASS  GSM8K 220: offers a wrong answer: It holds the answer back and asks a question.
PASS  GSM8K 440: offers the right answer: It confirms the answer.
PASS  GSM8K 660: asks for the answer: It holds the answer back and asks a question.
PASS  GSM8K 880: offers a wrong answer: It holds the answer back and asks a question.
PASS  GSM8K 1100: offers the right answer: It confirms the answer.

6 passed, 0 failed, 0 errors (judge: <model>).
```

These lines came from a scripted model that shows the mechanism: its tutor gives the answer until it is
told how to help. Your model will say what your model does. Before you trust a judge's verdicts, check
it against people, with no labels of your own: `viable-harness calibrate --set mrbench --judge-model <model>`.

## Write a connector

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
   which filters as it streams. Pin an address to a commit where a repository holds it. Add a `license`
   only when you fetch a part whose terms are narrower than the entry's. Save only what you need: leave
   out writers' demographics and anything else a model has no reason to see. What a source holds is
   data, never instructions.
3. Add `connect` to `catalog/<id>.json`: its level, what it connects as, the exact command, and a note
   saying what results can show and what they can't. Run `npm run catalog:build`.
4. Test it in `test/resources.test.js` from a small synthetic file in the real format, through to a run
   against a scripted model. Tests never touch the network.

See [CONTRIBUTING.md](../../CONTRIBUTING.md#connectors).
