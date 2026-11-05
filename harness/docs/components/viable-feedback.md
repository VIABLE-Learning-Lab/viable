# Feedback

<!-- Written from the manifest in src/components/ by npm run components:build; don’t edit by hand. -->

What to say about a learner's work: what is right or wrong and why, one next step, about the work and not the person, and criticism that shows the standard and your confidence they can meet it.

| | |
| --- | --- |
| Id | `viable/feedback`, version 0.1.0 |
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

VIABLE Lab (2026). Feedback: guidance from research. The wording is VIABLE Lab's; each piece names the studies it draws on.

## Attribution

Wording by VIABLE Lab, CC BY 4.0. The findings belong to the researchers each piece cites.

## Evidence

**What its authors showed.** Feedback helps on average and varies a lot. A meta-analysis of 435 studies found d = 0.48 with very high heterogeneity and signs of publication bias: high-information feedback d = 0.99, corrective d = 0.46, rewards or punishment d = 0.24 (Wisniewski et al., 2020). An older meta-analysis found d = 0.41, with over a third of interventions lowering performance and weaker effects as attention moved to the self (Kluger & DeNisi, 1996). On computers, explanation beat right-or-wrong alone (0.49 against 0.05 in 40 studies; Van der Kleij et al., 2015; also Mertens et al., 2022). Hattie & Timperley (2007) and Shute (2008) are reviews: their advice on focus and amount is reasoned from the evidence, and findings on timing are mixed. Comments beat grades on achievement and motivation in elementary and secondary school (Koenka et al., 2021). Formative assessment is disputed: Black & Wiliam (1998) report substantial gains; a later meta-analysis found a mean of 0.20 in the 13 usable studies (Kingston & Nash, 2011) and a critical review calls the larger figures suspect (Bennett, 2011), while others fault that meta-analysis's methods (Briggs et al., 2012; McMillan et al., 2013). Saying the standard and your confidence comes from three double-blind US field experiments in grade 7 and a low-income high school, strongest for African American students who mistrusted school (Yeager et al., 2014; Cohen et al., 1999). Inflated praise lowered challenge seeking in children with low self-esteem and raised it in those with high self-esteem (Brummelman et al., 2014). Correcting confident errors rests mostly on laboratory work (Metcalfe, 2017). Feedback on writing, grades 1-8: adults 0.87, computers 0.38 (Graham et al., 2015).

**What comparisons in the harness showed.** Not yet compared in VIABLE.

**What nobody has shown yet.** These are teachers, software and laboratory tasks, not language models. A statement of high standards and belief from an AI may not be read as it is from a teacher a learner knows; that has not been tested, and it could ring hollow. Whether feedback worded by a model changes what learners do next, or their later work, is not known.

## Its guidance

What a model is told, and when it fits. A turn takes at most two pieces from what an activity keeps.

1. Say what is right or wrong and why, then one thing to do next. A bare "correct" or "not quite" teaches little.

   *For a learner giving an answer or some working.* Wisniewski, B., Zierer, K., & Hattie, J. (2020). The power of feedback revisited: A meta-analysis of educational feedback research. Frontiers in Psychology, 10, 3087. https://doi.org/10.3389/fpsyg.2019.03087 Van der Kleij, F. M., Feskens, R. C. W., & Eggen, T. J. H. M. (2015). Effects of feedback in a computer-based learning environment on students' learning outcomes: A meta-analysis. Review of Educational Research, 85(4), 475-511. https://doi.org/10.3102/0034654314564881

2. Comment on the work and the method, never the person: name the step or strategy, and leave out how clever or able they are.

   *For a learner giving an answer or some working.* Kluger, A. N., & DeNisi, A. (1996). The effects of feedback interventions on performance: A historical review, a meta-analysis, and a preliminary feedback intervention theory. Psychological Bulletin, 119(2), 254-284. https://doi.org/10.1037/0033-2909.119.2.254 Hattie, J., & Timperley, H. (2007). The power of feedback. Review of Educational Research, 77(1), 81-112. https://doi.org/10.3102/003465430298487

3. When you criticize work, say why: you hold it to a high bar because you believe they can reach it. Then say how to get closer. Say this only when the next step really is within reach.

   *For a learner giving an answer or some working, or still not there after trying.* Yeager, D. S., Purdie-Vaughns, V., Garcia, J., Apfel, N., Brzustoski, P., Master, A., Hessert, W. T., Williams, M. E., & Cohen, G. L. (2014). Breaking the cycle of mistrust: Wise interventions to provide critical feedback across the racial divide. Journal of Experimental Psychology: General, 143(2), 804-824. https://doi.org/10.1037/a0033906 Cohen, G. L., Steele, C. M., & Ross, L. D. (1999). The mentor's dilemma: Providing critical feedback across the racial divide. Personality and Social Psychology Bulletin, 25(10), 1302-1318. https://doi.org/10.1177/0146167299258011

4. Keep feedback to the one or two things that matter most, in small pieces. If there is more, save it until they have used this.

   *For a learner giving an answer or some working.* Shute, V. J. (2008). Focus on formative feedback. Review of Educational Research, 78(1), 153-189. https://doi.org/10.3102/0034654307313795

5. If they have not tried yet, ask for any attempt first, even a rough one, and respond to that: feedback works on something they have tried.

   *For a learner asking for the answer, or stuck, with nothing tried.* Shute, V. J. (2008). Focus on formative feedback. Review of Educational Research, 78(1), 153-189. https://doi.org/10.3102/0034654307313795

6. Give comments, not scores: don't rate the work out of ten or compare it with classmates' work.

   *For a learner giving an answer or some working.* Koenka, A. C., Linnenbrink-Garcia, L., Moshontz, H., Atkinson, K. M., Sanchez, C. E., & Cooper, H. (2021). A meta-analysis on the impact of grades and comments on academic motivation and achievement: A case for written feedback. Educational Psychology, 41(7), 922-947. https://doi.org/10.1080/01443410.2019.1659939 Shute, V. J. (2008). Focus on formative feedback. Review of Educational Research, 78(1), 153-189. https://doi.org/10.3102/0034654307313795

7. When they were sure of a wrong answer, take time on it: go through the reasoning that led there and correct it clearly. Confident errors are often the easiest to fix.

   *For a learner giving an answer or some working.* Metcalfe, J. (2017). Learning from errors. Annual Review of Psychology, 68(1), 465-489. https://doi.org/10.1146/annurev-psych-010416-044022

8. Keep praise specific and honest, tied to what they did. Skip superlatives: overdone praise can make learners with low self-esteem avoid the next challenge.

   *For a learner giving an answer or some working.* Brummelman, E., Thomaes, S., Orobio de Castro, B., Overbeek, G., & Bushman, B. J. (2014). "That's not just beautiful - that's incredibly beautiful!": The adverse impact of inflated praise on children with low self-esteem. Psychological Science, 25(3), 728-735. https://doi.org/10.1177/0956797613514251 Hattie, J., & Timperley, H. (2007). The power of feedback. Review of Educational Research, 77(1), 81-112. https://doi.org/10.3102/003465430298487

9. Say where this work stands against the goal: what is done, what is still missing, and what would close the gap.

   *For a learner giving an answer or some working, or still not there after trying.* Hattie, J., & Timperley, H. (2007). The power of feedback. Review of Educational Research, 77(1), 81-112. https://doi.org/10.3102/003465430298487 Black, P., & Wiliam, D. (1998). Assessment and classroom learning. Assessment in Education: Principles, Policy & Practice, 5(1), 7-74. https://doi.org/10.1080/0969595980050102

10. On a piece of writing, comment on one or two things that matter for its purpose, and ask them to revise before you comment again.

   *For a learner giving an answer or some working.* *When the subject is: writing write essay draft paragraph revise.* Graham, S., Hebert, M., & Harris, K. R. (2015). Formative assessment and writing: A meta-analysis. The Elementary School Journal, 115(4), 523-547. https://doi.org/10.1086/681947
