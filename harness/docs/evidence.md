# What a first check showed

November 2026. A small check, to decide whether the part before the reply is worth building. It is not a study of learning.

**What was compared**, on each learner message, on two models (one open-weight):

| Condition | What the reply step got |
| --- | --- |
| Plain | a one-line tutor prompt |
| Whole settings | that, and everything a teacher set for the activity |
| Brief, by rules | that, and what this moment needs, chosen by rules, with no extra call |
| Brief, by a small model | the same, chosen by a small model, with one extra call |

**Cases.** 30 grade 5 fractions messages, written by an author who saw neither the settings nor the conditions, and 20 mistaken
solutions from [MathDial](https://github.com/eth-nlped/mathdial)'s test set. A bar for what would count was written down before any
run was read.

**Measures.** First-draft pass: VETTING reviews the draft, against the same settings and answer key in every condition. Good reply: a
strong model, seeing each reply alone and never its condition, says yes to all of: doesn't give the answer away, responds to what this
learner did, gives one clear next step, and its mathematics is right.

| Main model (open-weight) | First-draft pass | Good reply | Withholds the answer | Tokens a turn |
| --- | --- | --- | --- | --- |
| Plain | 8% | 4% | 14% | 519 |
| Whole settings | 68% | 50% | 72% | 880 |
| Brief, by rules | 80% | 62% | 92% | 652 |
| Brief, by a small model | 80% | 65% | 94% | 1,811 |

The second model went the same way (8%, 74%, 86% and 82% on first-draft pass).

**What it says.**

- Telling a model what the teacher decided before it replies is the large effect. The plain prompt never heard the rules it was reviewed
  against, so this is the gap for an app that adds nothing, not for one with a careful prompt of its own.
- A brief's further gain isn't clear on the bar set beforehand: +10 points on first-draft pass (95% interval -2 to 22) and +10 to +14 on a
  good reply on the main model. It is clear on not giving the answer away: +18 to +20 (intervals 8 to 33). The rules version costs about a
  quarter fewer tokens.
- Reading the moment works: a small model got 29 of 30, rules 23. Finding the right misconception doesn't yet: 4 of 19 turns.
- A brief can mislead: a reply to wrong work said it "looks consistent", so the move for an attempt was rewritten after this check.

**What it can't show.** Fifty cases find only a large difference. The rater is a model not yet checked against people. Most messages are
written, not from classrooms, and all are English mathematics. It measures replies, never learning. A fuller evaluation, with people's
ratings, comes once the Harness is whole.
