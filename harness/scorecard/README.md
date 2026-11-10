# Scorecard cases

Two sets of invented cases that `viable-harness scorecard` runs ([docs/scorecard.md](../docs/scorecard.md)). No model is
called. Nothing here is a real learner's, and no key in it is real.

| File | What it holds | Fields |
| --- | --- | --- |
| `learner-moments.json` | 360 messages a learner might send an AI tutor, each with the conversation before it and the moment it is: 300 in English (60 of each moment), 30 in Spanish and 30 in Chinese | `id`, `language`, `subject`, `grade`, `history`, `message`, `moment` (`attempt`, `asks_answer`, `stuck`, `repeated`, `other`), `split`, sometimes a `note` where a reader might disagree |
| `classroom-trips.json` | 60 small projects of the kind a teacher gets from a coding assistant: 40 with one to four of `review`'s sixteen problems planted, 20 with none | `id`, `title`, `stack`, `files` (path to text), `planted` (rule ids), `how` (how each appears), `split` |

Each was written by an AI model from definitions alone, without sight of the code it scores. `split` was set before any
result was read: odd-numbered cases are `held_out`, even-numbered are `dev`. Change the rules from `dev` only, and quote
`held_out`. Where a project would hold a secret key, the file says `__FAKE_MODEL_KEY__`, and the runner puts a harmless
stand-in there.

To add cases, keep both halves the same size for every label, and say in the pull request who wrote them and from what.
