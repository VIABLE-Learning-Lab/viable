# Metacognition and motivation

<!-- Written from the manifest in src/components/ by npm run components:build; don’t edit by hand. -->

Helping learners steer their own learning, planning, checking and judging what they know, inside the work at hand; and what holds up on motivation, growth mindset included.

| | |
| --- | --- |
| Id | `viable/metacognition-and-motivation`, version 0.1.0 |
| Slot | context |
| Runs | Nothing runs: its guidance is in this file, and an activity keeps the pieces chosen for it. |
| Receives | nothing |
| Sends it to | no other host |
| Models | calls none |
| License | data CC-BY-4.0 |
| Authors | VIABLE Lab |
| Risk | low: Its text goes to a model as guidance. Nothing runs and nothing about a learner goes anywhere. What the teacher set for how far to go comes first. Most of the research is about human tutors, so a piece can still misfit a learner or a moment. |
| Maintainer | VIABLE Lab |
| Harness | `>=0.3.0 <1.0.0` |

## How to cite

VIABLE Lab (2026). Metacognition and motivation: guidance from research. The wording is VIABLE Lab's; each piece names the studies it draws on.

## Attribution

Wording by VIABLE Lab, CC BY 4.0. The findings belong to the researchers each piece cites.

## Evidence

**What its authors showed.** Metacognition has a strong average and is hard to realize. The EEF Toolkit puts it at +8 months across 355 studies, with a padlock lost because many were not independently evaluated, and warns the impact is hard to achieve in practice; its guidance recommends explicit teaching of planning, monitoring and evaluating within subject lessons, and modeling (EEF Toolkit, 2025; EEF, 2025). Two meta-analyses of 84 school studies found a mean of 0.69, larger when researchers rather than teachers delivered and in math (Dignath & Büttner, 2008). Study skills transfer best when trained in context (Hattie et al., 1996). College students who judged their recall more accurately retained more (Dunlosky & Rawson, 2012), and people often misjudge how they learn (Bjork et al., 2013). Rereading rates low and practice testing high (Dunlosky et al., 2013). Growth mindset, honestly: a meta-analysis of 63 studies found d = 0.05, not significant after correcting for bias, and 0.02 in the best studies (Macnamara & Burgoyne, 2023); another found d = 0.14 for targeted groups with high fidelity, with a prediction interval from -0.08 to 0.35 (Burnette et al., 2023). A national trial with 12,490 US ninth graders raised lower achievers' grades by 0.10 points, more where peer norms fitted, and not higher achievers' (Yeager et al., 2019). Earlier overall effects were weak (Sisk et al., 2018), and replication attempts of the praise-for-intelligence study with 624 children aged 9-13 in China were largely null (Li & Bates, 2019; Mueller & Dweck, 1998). So these lines don't teach mindset; they only avoid trait labels. Choice: 41 studies, raising motivation and effort, strongest for instructionally irrelevant choices (Patall et al., 2008). Relevance: one experiment in first-year high school science, largest for those low in confidence (Hulleman & Harackiewicz, 2009); motivation interventions overall d = 0.49, smaller in randomized designs (Lazowski & Hulleman, 2016).

**What comparisons in the harness showed.** Not yet compared in VIABLE.

**What nobody has shown yet.** Most of this is teachers in schools over weeks, not a model in a single chat. Whether a line or two of prompting about planning or confidence does anything is untested, and these prompts could become one more chore. Growth mindset messages from an AI have not been tested at scale here. AI help may also reduce a learner's own planning and checking (Fan et al., 2025; Darvishi et al., 2024): whether prompts like these offset that is not known.

## Its guidance

What a model is told, and when it fits. A turn takes at most two pieces from what an activity keeps.

1. Before they start, ask what the task wants, what they already know that could help, and how they will begin.

   *For a learner stuck, with nothing tried.* Education Endowment Foundation. (2025). Metacognition and self-regulated learning: Guidance report (2nd ed.). https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/metacognition Dignath, C., & Büttner, G. (2008). Components of fostering self-regulated learning among students. A meta-analysis on intervention studies at primary and secondary school level. Metacognition and Learning, 3(3), 231-264. https://doi.org/10.1007/s11409-008-9029-x

2. Partway through, ask whether this way is getting them closer, and what else they could try.

   *For a learner giving an answer or some working, or still not there after trying.* Education Endowment Foundation. (2025). Metacognition and self-regulated learning: Guidance report (2nd ed.). https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/metacognition

3. When they finish, ask what worked, what they would change and what they would try first next time.

   *For a learner giving an answer or some working.* Education Endowment Foundation. (2025). Metacognition and self-regulated learning: Guidance report (2nd ed.). https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/metacognition Hattie, J., Biggs, J., & Purdie, N. (1996). Effects of learning skills interventions on student learning: A meta-analysis. Review of Educational Research, 66(2), 99-136. https://doi.org/10.3102/00346543066002099

4. Where the teacher allows it, think aloud on a similar problem: what you notice, what you ask yourself, why you choose a step. Then have them do the same on theirs.

   *For a learner stuck, with nothing tried, or still not there after trying.* Education Endowment Foundation. (2025). Metacognition and self-regulated learning: Guidance report (2nd ed.). https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/metacognition Education Endowment Foundation. (2025). Metacognition and self-regulation [Teaching and Learning Toolkit]. https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/metacognition-and-self-regulation

5. When you suggest a way to check or study, tie it to this problem and have them use it now: general advice on how to learn rarely carries over.

   *For a learner giving an answer or some working, or stuck, with nothing tried.* Hattie, J., Biggs, J., & Purdie, N. (1996). Effects of learning skills interventions on student learning: A meta-analysis. Review of Educational Research, 66(2), 99-136. https://doi.org/10.3102/00346543066002099 Education Endowment Foundation. (2025). Metacognition and self-regulation [Teaching and Learning Toolkit]. https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/metacognition-and-self-regulation

6. Ask how sure they are before you respond, then compare that with how it turned out: many learners misjudge what they know.

   *For a learner giving an answer or some working.* Dunlosky, J., & Rawson, K. A. (2012). Overconfidence produces underachievement: Inaccurate self evaluations undermine students' learning and retention. Learning and Instruction, 22(4), 271-280. https://doi.org/10.1016/j.learninstruc.2011.08.003 Bjork, R. A., Dunlosky, J., & Kornell, N. (2013). Self-regulated learning: Beliefs, techniques, and illusions. Annual Review of Psychology, 64(1), 417-444. https://doi.org/10.1146/annurev-psych-113011-143823

7. If they plan to reread or look over notes, suggest testing themselves instead: rereading feels effective but does less.

   *When the subject is: study revise revision exam test notes reread rereading.* Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students' learning with effective learning techniques: Promising directions from cognitive and educational psychology. Psychological Science in the Public Interest, 14(1), 4-58. https://doi.org/10.1177/1529100612453266 Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. Psychological Science, 17(3), 249-255. https://doi.org/10.1111/j.1467-9280.2006.01693.x

8. Treat a mistake as information about what to try next, in passing. Don't lecture about mindset or brains, and don't call anyone a natural or not a math person.

   *For a learner giving an answer or some working, or still not there after trying.* Macnamara, B. N., & Burgoyne, A. P. (2023). Do growth mindset interventions impact students' academic achievement? A systematic review and meta-analysis with recommendations for best practices. Psychological Bulletin, 149(3-4), 133-173. https://doi.org/10.1037/bul0000352 Burnette, J. L., Billingsley, J., Banks, G. C., Knouse, L. E., Hoyt, C. L., Pollack, J. M., & Simon, S. (2023). A systematic review and meta-analysis of growth mindset interventions: For whom, how, and why might such interventions work? Psychological Bulletin, 149(3-4), 174-205. https://doi.org/10.1037/bul0000368

9. Offer a small real choice that doesn't change the goal, such as which problem first or which way to try.

   *For a learner stuck, with nothing tried, or still not there after trying, or asking for the answer.* Patall, E. A., Cooper, H., & Robinson, J. C. (2008). The effects of choice on intrinsic motivation and related outcomes: A meta-analysis of research findings. Psychological Bulletin, 134(2), 270-300. https://doi.org/10.1037/0033-2909.134.2.270

10. If they ask why this matters, ask them to connect it to something in their own life or plans, rather than telling them why it is useful.

   Hulleman, C. S., & Harackiewicz, J. M. (2009). Promoting interest and performance in high school science classes. Science, 326(5958), 1410-1412. https://doi.org/10.1126/science.1177067 Lazowski, R. A., & Hulleman, C. S. (2016). Motivation interventions in education: A meta-analytic review. Review of Educational Research, 86(2), 602-640. https://doi.org/10.3102/0034654315617832
