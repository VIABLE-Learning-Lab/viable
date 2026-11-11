# Agent test judge

<!-- Written from the manifest in src/components/ by npm run components:build; don’t edit by hand. -->

A component the VIABLE Harness carries: what it does, what learner data it receives, its license and the evidence behind it. [Components](../components.md) says what a component is.

Rates an agent’s reply to a test case pass or fail, with a reason, against what the case says a good reply does and must not do.

| | |
| --- | --- |
| Id | `viable/reply-judge`, version 1.0.0 |
| Slot | judge |
| Runs | In the harness's own process, through `runAgentTests`. |
| Receives | `case`, `reply`, `conversation` |
| Sends it to | no other host |
| Models | calls models, through the host’s model service |
| License | code MIT |
| Authors | VIABLE Lab |
| Risk | medium: A judge that agrees poorly with people makes a change look better or worse than it is. |
| Maintainer | VIABLE Lab |
| Harness | `>=0.2.0 <1.0.0` |
| Fixtures | `test/agentTests.test.js` |

## How to cite

VIABLE Lab (2026). Agent test judge, VIABLE Harness.

## Evidence

**What its authors showed.** A rubric judge written for VIABLE’s agent tests; no published validation.

**What comparisons in the harness showed.** Measured with calibrateJudge (viable-harness calibrate): a person labels each case pass or fail without the judge’s verdict in view, and the judge’s verdicts are compared with theirs (agreement, Cohen’s kappa, every disagreement), from 10 labelled cases. Not measured yet; until it is, read its verdicts as a first pass.

**What nobody has shown yet.** Agreement with teachers’ ratings, by subject and judge model.
