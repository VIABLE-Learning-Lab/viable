# Recall, spacing and mixing

<!-- Written from the manifest in src/components/ by npm run components:build; don’t edit by hand. -->

A component the VIABLE Harness carries: what it does, what learner data it receives, its license and the evidence behind it. [Components](../components.md) says what a component is.

Making learning last: asking learners to bring ideas back from memory, coming back to them after a gap, and mixing kinds of problems once each is learned.

| | |
| --- | --- |
| Id | `viable/retrieval-and-spacing`, version 0.1.0 |
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

VIABLE Lab (2026). Recall, spacing and mixing: guidance from research. The wording is VIABLE Lab's; each piece names the studies it draws on.

## Attribution

Wording by VIABLE Lab, CC BY 4.0. The findings belong to the researchers each piece cites.

## Evidence

**What its authors showed.** Among the best replicated findings in the science of learning. Repeated recall beat restudy on delayed tests, even though restudy raised confidence (Roediger & Karpicke, 2006, students reading prose). Recall gives more than recognition (Rowland, 2014); classroom quizzing g = 0.499 across 222 studies and 48,478 students, moderated by corrective feedback among other things (Yang et al., 2021). A systematic review of 50 classroom experiments found mostly medium or large benefits, only 6% in non-WEIRD countries (Agarwal et al., 2021). Trying before studying helps even when the attempt fails, in lab experiments with the answer shown after; size varies by procedure (Kornell et al., 2009; Richland et al., 2009; Pan & Carpenter, 2023). Spacing: 317 experiments (Cepeda et al., 2006); the best gap grows with how long the learning must last (Cepeda et al., 2008). A major review rates practice testing and spacing high, interleaving moderate (Dunlosky et al., 2013). Relearning: three correct recalls, then three spaced sessions (Rawson & Dunlosky, 2011). Interleaving in math: college students (Rohrer & Taylor, 2007); grade 7, d = 0.42 and 0.79 (Rohrer et al., 2015); 54 grade 7 classes, 61% against 38%, d = 0.83 (Rohrer et al., 2020). Across materials g = 0.42, math 0.34, nothing clear for expository text, and blocking is better for words (Brunmair & Richter, 2019).

**What comparisons in the harness showed.** Not yet compared with and without it in this harness.

**What nobody has shown yet.** Few of these studies involve a tutor in conversation, and none an AI. Spacing needs a learner to come back: within one chat the gaps are short, and the Harness keeps no memory across sessions unless a host passes history. How many recall questions a learner will accept from a tutor before it feels like a quiz is not known. Interleaving's classroom evidence is almost all math.

## Its guidance

What a model is told, and when it fits. A turn takes at most two pieces from what an activity keeps.

1. Once they have worked through something, ask them to bring it back from memory without looking, rather than showing it again.

   *For a learner giving an answer or some working.* Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. Psychological Science, 17(3), 249-255. https://doi.org/10.1111/j.1467-9280.2006.01693.x Yang, C., Luo, L., Vadillo, M. A., Yu, R., & Shanks, D. R. (2021). Testing (quizzing) boosts classroom learning: A systematic and meta-analytic review. Psychological Bulletin, 147(4), 399-435. https://doi.org/10.1037/bul0000309

2. Have them write or say the answer themselves rather than pick from options: recalling helps more than recognizing.

   *For a learner giving an answer or some working.* Rowland, C. A. (2014). The effect of testing versus restudy on retention: A meta-analytic review of the testing effect. Psychological Bulletin, 140(6), 1432-1463. https://doi.org/10.1037/a0037559

3. After they try to recall, say what was right and what was missing: practice with correction works better than practice alone.

   *For a learner giving an answer or some working.* Yang, C., Luo, L., Vadillo, M. A., Yu, R., & Shanks, D. R. (2021). Testing (quizzing) boosts classroom learning: A systematic and meta-analytic review. Psychological Bulletin, 147(4), 399-435. https://doi.org/10.1037/bul0000309 Butler, A. C., & Roediger, H. L. (2008). Feedback enhances the positive effects and reduces the negative effects of multiple-choice testing. Memory & Cognition, 36(3), 604-616. https://doi.org/10.3758/MC.36.3.604

4. When they are stuck, ask what they remember about it before you re-explain, and say a wrong guess is fine: even a failed attempt helps what they learn next to stick.

   *For a learner stuck, with nothing tried, or asking for the answer.* Kornell, N., Hays, M. J., & Bjork, R. A. (2009). Unsuccessful retrieval attempts enhance subsequent learning. Journal of Experimental Psychology: Learning, Memory, and Cognition, 35(4), 989-998. https://doi.org/10.1037/a0015729 Pan, S. C., & Carpenter, S. K. (2023). Prequestioning and pretesting effects: A review of empirical research, theoretical perspectives, and implications for educational practice. Educational Psychology Review, 35(4), 97. https://doi.org/10.1007/s10648-023-09814-5

5. Come back to an idea after other work, later in the conversation or in a later session, and ask for it again rather than repeating it straight away.

   *For a learner giving an answer or some working.* Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. Psychological Bulletin, 132(3), 354-380. https://doi.org/10.1037/0033-2909.132.3.354 Carpenter, S. K., Pan, S. C., & Butler, A. C. (2022). The science of effective learning with spacing and retrieval practice. Nature Reviews Psychology, 1(9), 496-511. https://doi.org/10.1038/s44159-022-00089-1

6. Don't stop at the first correct recall: ask again a few times, and return to it on a later day.

   *For a learner giving an answer or some working.* Rawson, K. A., & Dunlosky, J. (2011). Optimizing schedules of retrieval practice for durable and efficient learning: How much is enough? Journal of Experimental Psychology: General, 140(3), 283-302. https://doi.org/10.1037/a0023956

7. Once they can do each kind of problem, mix in an earlier kind so they must decide which method applies, rather than repeating the last one.

   *For a learner giving an answer or some working.* *When the subject is: math mathematics maths algebra equation fraction decimal geometry arithmetic ratio percent calculus statistics.* Rohrer, D., Dedrick, R. F., Hartwig, M. K., & Cheung, C.-N. (2020). A randomized controlled trial of interleaved mathematics practice. Journal of Educational Psychology, 112(1), 40-52. https://doi.org/10.1037/edu0000367 Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. Instructional Science, 35(6), 481-498. https://doi.org/10.1007/s11251-007-9015-8

8. If two kinds of problem get confused, mix them on purpose and ask which is which before solving. Don't do this with word lists or a text: there it hasn't been shown to help.

   *For a learner giving an answer or some working, or still not there after trying.* Brunmair, M., & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning and its moderators. Psychological Bulletin, 145(11), 1029-1052. https://doi.org/10.1037/bul0000209
