# Edu-ConvoKit

> Commands here say `viable-harness`. Until it is on npm, use `npx github:VIABLE-Learning-Lab/viable` in its place: it takes every command.

[Edu-ConvoKit](https://github.com/EduNLP/edu-convokit), from Rose E. Wang and Dorottya Demszky at Stanford, annotates
conversations in education: who talks how much, how much math is in the talk, where students reason, where teachers ask
focusing questions and where they build on what students say. This folder runs its annotators over a learner's turns with an
AI, on your own computer, as two components of the Harness ([components](https://github.com/VIABLE-Learning-Lab/viable/blob/main/harness/docs/components.md)).

| File | What |
| --- | --- |
| `measure.json` | A measure: talk time and math density, with no model |
| `manifest.json` | A detector: marks for reasoning, focusing questions and uptake, from classifiers you download and turn on |
| `server.py` | The adapter: `POST /measure` and `POST /detect` on 127.0.0.1:8790, calling Edu-ConvoKit's own annotators |
| `fixtures/input.json` | A synthetic learner's record, as the Harness sends it |
| `fixtures/expected-measures.json`, `fixtures/expected.json` | What `/measure` answers, and what `/detect` answers with the reasoning and focusing classifiers on |

The VIABLE Lab wrote this adapter from Edu-ConvoKit's published package. Its authors haven't reviewed it yet.

## What each one means

The adapter reads each turn's `message` as the learner's and its `reply` as the AI's, the way Edu-ConvoKit reads a student and a
teacher in a transcript. A turn kept without its text is skipped.

| Annotator | Answers | How Edu-ConvoKit decides | Read it with care |
| --- | --- | --- | --- |
| Talk time | `convokit.talk_time.learner_share`, `.learner_words`, `.ai_words` | Words, split on spaces: the learner's share of all the words, and each side's count | An AI writes long replies by design, so a low share isn't a problem on its own |
| Math density | `convokit.math_density.learner`, `.ai` | Terms from its glossary of math vocabulary, per message, as Himmelsbach et al. (2024) counted them | The glossary holds everyday words such as line, value and total, and counts a term whether or not it is used correctly |
| Student reasoning (`--with reasoning`) | The mark "Learner explained their reasoning" | A classifier reads each learner message of 8 words or more | Trained on 4th and 5th graders speaking in math lessons |
| Focusing question (`--with focusing`) | The mark "AI asked a focusing question" | A classifier reads each AI reply | Trained on teachers' questions in math lessons. A focusing question asks the student to reflect on their own thinking, where a funneling one leads them toward an expected answer (Alic et al., 2022) |
| Uptake (`--with uptake`) | The mark "AI built on what the learner said" | The uptake model scores each AI reply to a learner message of 5 words or more; above 0.8, Edu-ConvoKit's line for high uptake, it marks the turn | Uptake is building on what someone said, such as by acknowledging, repeating or reformulating it (Demszky et al., 2021). Learned without labels from teachers' replies to students in math lessons, and checked against experts' ratings |

The three classifiers learned from spoken classroom talk (the reasoning and focusing ones from people's labels of the
[NCTE transcripts](https://github.com/ddemszky/classroom-transcript-analysis)), not from typed chats with an AI, and nobody
has checked them against teachers' labels there. A mark or a number says what Edu-ConvoKit read, not what the learner
learned. English only.

## Run it

Edu-ConvoKit 0.4.0 needs Python 3.10 or 3.11. It installs PyTorch and Transformers, about 1.4 GB. Its uptake model
doesn't load with Transformers 5, so keep it below:

```sh
python3.11 -m venv .venv
.venv/bin/pip install edu-convokit==0.4.0 "transformers<5"
.venv/bin/python server.py              # http://127.0.0.1:8790: /measure
```

In another terminal, with a learner record of your own or the fixture:

```sh
viable-harness measure record.json --component measure.json
viable-harness component measure.json --input fixtures/input.json
```

The classifiers are models of about 440 MB each, from Hugging Face, each under its own license (below). Download them once;
`--download` prints each license and fetches nothing until you add `--accept-license`:

```sh
.venv/bin/python server.py --download reasoning,focusing,uptake --accept-license
.venv/bin/python server.py --with reasoning,focusing,uptake
viable-harness component manifest.json --input fixtures/input.json
```

Turn on only those you need. Without any, `/detect` answers 409 and says so. While it serves, the adapter reads models only
from this computer's Hugging Face cache (`HF_HUB_OFFLINE`), so a record's words go nowhere else; `--download` is the only
step that contacts huggingface.co, and it sends no learner's data. Each classifier is pinned to the revision checked, in
`server.py`'s `CLASSIFIERS`; Edu-ConvoKit calls them `ddemszky/...`, and they now live under `stanford-nlpxed/...`.

On the Engine, a teacher adds a detector on What to look at, and the Engine calls it at a public https address: that page
can't start a program. To use this there, run `server.py` behind https on a server you control, put that address in
`manifest.json`'s `runs.entry` and its host in `sends_to`, and settle with the school that learners' words go to it.

## What was checked

On 2026-11-09, with Python 3.11.18, edu-convokit 0.4.0, Transformers 4.57.6, PyTorch 2.15.0 and pandas 3.1.1 on macOS:

- `fixtures/input.json` through `/measure`, by `viable-harness component` and `measure`, gives `fixtures/expected-measures.json`.
  Its counts were checked by hand.
- Through `/detect` with `--with reasoning,focusing`, it gives `fixtures/expected.json`.
- The uptake model itself wasn't run, since its card asks each user to agree to its terms. Its branch was run with
  Edu-ConvoKit's uptake model class on random weights, which checks the pairing, the 5-word rule and the threshold, not a score.

## Licenses

Nothing from Edu-ConvoKit or its models is in this folder: each person installs and downloads their own copy.

| Part | License |
| --- | --- |
| Edu-ConvoKit | MIT, copyright 2023 Rose E. Wang ([LICENSE](https://github.com/EduNLP/edu-convokit/blob/d845ffdafda3f710dc0b5a2834e4f756d8eeb312/LICENSE)) |
| This adapter and its fixtures | MIT, as the Harness. The fixtures are synthetic |
| Student reasoning model, [`stanford-nlpxed/student-reasoning`](https://huggingface.co/stanford-nlpxed/student-reasoning) | Its card says GPL and names no version. GPL sets the terms for passing a work on, so ask its authors which version they mean before you share it or anything built from it |
| Focusing question model, [`stanford-nlpxed/focusing-questions`](https://huggingface.co/stanford-nlpxed/focusing-questions) | CC BY-NC 3.0: non-commercial use only |
| Uptake model, [`stanford-nlpxed/uptake-model`](https://huggingface.co/stanford-nlpxed/uptake-model) | CC BY-NC-ND 4.0. Its card asks each user to agree not to use it commercially, not to try to recover its training data, and not to share it beyond their research team and project |

## Cite

- Wang, R. E., & Demszky, D. (2024). Edu-ConvoKit: An Open-Source Library for Education Conversation Data. NAACL 2024
  (System Demonstrations), 61-69. https://doi.org/10.18653/v1/2024.naacl-demo.6
- Student reasoning: Demszky, D., & Hill, H. (2023). The NCTE Transcripts: A Dataset of Elementary Math Classroom
  Transcripts. BEA 2023, 528-538. https://doi.org/10.18653/v1/2023.bea-1.44
- Focusing questions: Alic, S., Demszky, D., Mancenido, Z., Liu, J., Hill, H., & Jurafsky, D. (2022). Computationally
  Identifying Funneling and Focusing Questions in Classroom Discourse. BEA 2022, 224-233. https://doi.org/10.18653/v1/2022.bea-1.27
- Uptake: Demszky, D., Liu, J., Mancenido, Z., Cohen, J., Hill, H., Jurafsky, D., & Hashimoto, T. (2021). Measuring
  Conversational Uptake: A Case Study on Student-Teacher Interactions. ACL 2021, 1638-1653. https://doi.org/10.18653/v1/2021.acl-long.130
- Math density: Himmelsbach, Z., Hill, H. C., Liu, J., & Demszky, D. (2024). A Quantitative Study of Mathematical Language
  in Upper Elementary Classrooms. EdWorkingPaper 24-1029. https://edworkingpapers.com/ai24-1029
