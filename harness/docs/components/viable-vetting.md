# VETTING reply check

<!-- Written from the manifest in src/components/ by npm run components:build; don’t edit by hand. -->

A component the VIABLE Harness carries: what it does, what learner data it receives, its license and the evidence behind it. [Components](../components.md) says what a component is.

A second model reviews each reply against the teacher’s guideline or a question’s answer key, and the activity’s teaching settings, before the learner sees it; a failed reply is rewritten or flagged.

| | |
| --- | --- |
| Id | `viable/vetting`, version 1.0.0 |
| Slot | step |
| Runs | In the harness's own process, through `checkReply` and the graph's `vetting` step. |
| Receives | `reply`, `learner_message`, `conversation`, `guideline`, `answer_key`, `reference`, `teaching_settings` |
| Sends it to | no other host |
| Models | calls models, through the host’s model service |
| License | code MIT |
| Authors | Hongming Li, Shan Zhang, Anthony F. Botelho |
| Risk | medium: A reply it passes still reaches a learner: a weak reviewer model passes replies it should fail. An unverified reply is a flag, never a checked one. |
| Maintainer | VIABLE Lab |
| Harness | `>=0.2.0 <1.0.0` |
| Fixtures | `test/check.test.js` |

## How to cite

Li, H., Zhang, S., & Botelho, A. F. (2026). VETTING: A dual-LLM framework for in-loop safety verification via policy isolation in educational AI. Computers and Education: Artificial Intelligence, 11, 100646. https://doi.org/10.1016/j.caeai.2026.100646

## Evidence

**What its authors showed.** In a middle-school writing activity, the reviewer’s decisions agreed with a human audit (precision .943, recall .913, F1 .928) and learners’ estimated exposure to inappropriate content fell by 91.2%, at 19.6% more tokens (Li, Zhang & Botelho, 2026).

**What comparisons in the harness showed.** Not yet compared with and without in this harness.

**What nobody has shown yet.** Its effect on learning; how well open-weight models do as the reviewer; how it does in subjects and grades beyond the published study.
