# Learner measures

<!-- Written from the manifest in src/components/ by npm run components:build; don’t edit by hand. -->

A component the VIABLE Harness carries: what it does, what learner data it receives, its license and the evidence behind it. [Components](../components.md) says what a component is.

The research export’s learner measures from learning events and turns: messages, sessions, think time, revision, pasting, accuracy, mastery, wheel-spinning, writing; each with its definition, caveats and sources.

| | |
| --- | --- |
| Id | `viable/learner-measures`, version 1.0.0 |
| Slot | measure |
| Runs | In the harness's own process, through `measureLearner`. |
| Receives | `learning_events` |
| Sends it to | no other host |
| Models | calls none |
| License | code MIT |
| Authors | VIABLE Lab |
| Risk | low |
| Maintainer | VIABLE Lab |
| Harness | `>=0.2.0 <1.0.0` |
| Fixtures | `test/measures.test.js` |

## How to cite

VIABLE Lab (2026). Learner measures, VIABLE Harness. Each measure cites its own sources.

## Evidence

**What its authors showed.** Each measure follows the published work its entry in METRICS cites (for example, mastery after a streak of correct answers; wheel-spinning after many attempts without mastery).

**What comparisons in the harness showed.** Not yet compared with other measures in this harness. The same code computes the VIABLE Developer Platform’s research export.

**What nobody has shown yet.** How each measure relates to learning in a given course: they are descriptive, never learning gains.
