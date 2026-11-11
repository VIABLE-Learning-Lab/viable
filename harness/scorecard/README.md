# Scorecard cases

Four sets of invented cases that `viable-harness scorecard` runs ([docs/scorecard.md](../docs/scorecard.md)). No model is
called. Nothing here is a real learner's, and no key in it is real.

| File | What it holds | Fields |
| --- | --- | --- |
| `learner-moments.json` | 360 messages a learner might send an AI tutor, each with the conversation before it and the moment it is: 300 in English (60 of each moment), 30 in Spanish and 30 in Chinese | `id`, `language`, `subject`, `grade`, `history`, `message`, `moment` (`attempt`, `asks_answer`, `stuck`, `repeated`, `other`), `split`, sometimes a `note` where a reader might disagree |
| `wrong-answers.json` | 160 wrong answers to arithmetic problems (fractions, decimals, signed numbers, whole numbers), each with what the learner did in words; 20 are slips with no procedure behind them | `id`, `topic`, `grade`, `problem`, `answer`, `said`, `learner_answer`, `procedure`, sometimes `also` (a second procedure that gives the same answer), `expect` (the ids in `src/diagnose.js` that are the same procedure, or `unlisted`, or `slip`), sometimes a `note`, `split` |
| `tutoring-conversations.json` | 120 conversations of six learner turns on one problem with its answer key, across mathematics, science, language, history and programming: wrong attempts, requests for the answer, claims of permission, being stuck, a right answer, things off the task. The learner's turns are fixed in advance | `id`, `subject`, `grade`, `problem`, `answer`, `key_kind` (`number`, `words`, `sentence`), `turns` (`kind`, `text`, sometimes `error`), `split` |
| `classroom-trips.json` | 60 small projects of the kind a teacher gets from a coding assistant: 40 with one to four of `review`'s sixteen problems planted, 20 with none | `id`, `title`, `stack`, `files` (path to text), `planted` (rule ids), `how` (how each appears), `split` |

Each was written by an AI model from definitions alone, without sight of the code it scores. In `wrong-answers.json` the
`expect` field was added by a second AI model, which saw each label and the list of procedures and never what the code
names; where it and the author's words can be read two ways, `note` says so. `split` was set before any
result was read: odd-numbered cases are `held_out`, the test half, and even-numbered are `dev`, the development half.
Anyone tuning the code should look only at the `dev` half, and report results on `held_out`. Where a project would hold a secret key, the file says `__FAKE_MODEL_KEY__`, and the runner puts a harmless
stand-in there.

`tutoring-conversations.json` is also what [the policy check](../evals/policy-fidelity/README.md) runs models on.

To add cases, keep both halves the same size for every label, and say in the pull request who wrote them and from what.
