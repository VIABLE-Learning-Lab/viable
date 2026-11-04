# Learner measures

<!-- Written from the manifest in src/components/ by npm run components:build; don’t edit by hand. -->

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

VIABLE, src/utils/researchMetrics.js; each measure cites its own sources (CITATIONS).

## Evidence

**What its authors showed.** Each measure follows the published work its entry in METRICS cites (for example, mastery after a streak of correct answers; wheel-spinning after many attempts without mastery).

**What comparisons in the harness showed.** The same code computes VIABLE’s research export and dashboard.

**What nobody has shown yet.** How each measure relates to learning in a given course: they are descriptive, never learning gains.
