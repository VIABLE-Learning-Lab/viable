# Worked examples and mental load

<!-- Written from the manifest in src/components/ by npm run components:build; don’t edit by hand. -->

A component the VIABLE Harness carries: what it does, what learner data it receives, its license and the evidence behind it. [Components](../components.md) says what a component is.

For beginners, how to show a method without doing their work: a worked example of a similar problem, fewer steps shown as they improve, and replies that hold one idea at a time.

| | |
| --- | --- |
| Id | `viable/worked-examples`, version 0.1.0 |
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

VIABLE Lab (2026). Worked examples and mental load: guidance from research. The wording is VIABLE Lab's; each piece names the studies it draws on.

## Attribution

Wording by VIABLE Lab, CC BY 4.0. The findings belong to the researchers each piece cites.

## Evidence

**What its authors showed.** For beginners, studying worked examples beats solving problems alone: a meta-analysis of 55 math studies, elementary to postsecondary, found g = 0.48 (Barbieri et al., 2023), after early algebra experiments and reviews (Sweller & Cooper, 1985; Atkinson et al., 2000). Contested: in that meta-analysis correct examples alone did better than incorrect ones and adding prompts to explain did worse, while separate experiments found incorrect examples help conceptual understanding (Booth et al., 2013, Algebra I; Durkin & Rittle-Johnson, 2012, grades 4-5). Fading helped in one field and two lab experiments, at least for near transfer (Renkl et al., 2002). The advantage falls or reverses as expertise grows (Kalyuga et al., 2003). Comparing cases: 57 experiments, d = 0.50 (Alfieri et al., 2013); grade 7 algebra (Rittle-Johnson & Star, 2007). Explanations alone often add little: 21 experiments (Wittwer & Renkl, 2008, 2010). Cognitive load theory is the usual account (Sweller et al., 2019), and its concepts and measures are questioned (de Jong, 2010). Segmenting (56 investigations; Rey et al., 2019), removing interesting but irrelevant detail (Sundararajan & Adesope, 2020), placing related information together (50 studies; Ginns, 2006) and conversational style (retention d = 0.30, transfer d = 0.54, small beyond 35 minutes; Ginns et al., 2013) come from multimedia lessons and written text, not chat.

**What comparisons in the harness showed.** Not yet compared with and without it in this harness.

**What nobody has shown yet.** None of it tested a language model's replies. Whether a model's example is well chosen, correct and at the right level is not known, and a wrong example can teach the error. Where the line falls between example and problem for one learner has to be judged from a few messages. Reply length and one idea per reply have not been tested as such in tutoring chats.

## Its guidance

What a model is told, and when it fits. A turn takes at most two pieces from what an activity keeps.

1. Where the teacher allows explaining, show a similar problem worked step by step, then give them a matching one to do at once. Never work the problem they were set.

   *For a learner stuck, with nothing tried, or still not there after trying.* Barbieri, C. A., Miller-Cotto, D., Clerjuste, S. N., & Chawla, K. (2023). A meta-analysis of the worked examples effect on mathematics performance. Educational Psychology Review, 35(1), 11. https://doi.org/10.1007/s10648-023-09745-1 Sweller, J., & Cooper, G. A. (1985). The use of worked examples as a substitute for problem solving in learning algebra. Cognition and Instruction, 2(1), 59-89. https://doi.org/10.1207/s1532690xci0201_3

2. Keep any explanation short, tied to what they just said, and follow it with something they must do with it: explanations alone often don't help.

   *For a learner stuck, with nothing tried, or still not there after trying, or asking for the answer.* Wittwer, J., & Renkl, A. (2008). Why instructional explanations often do not work: A framework for understanding the effectiveness of instructional explanations. Educational Psychologist, 43(1), 49-64. https://doi.org/10.1080/00461520701756420 Wittwer, J., & Renkl, A. (2010). How effective are instructional explanations in example-based learning? A meta-analytic review. Educational Psychology Review, 22(4), 393-409. https://doi.org/10.1007/s10648-010-9136-5

3. Put one new idea in each reply. Don't stack a definition, a method and a question: give the next piece when they have used this one.

   *For a learner stuck, with nothing tried, or still not there after trying.* Sweller, J., van Merriënboer, J. J. G., & Paas, F. (2019). Cognitive architecture and instructional design: 20 years later. Educational Psychology Review, 31(2), 261-292. https://doi.org/10.1007/s10648-019-09465-5 Rey, G. D., Beege, M., Nebel, S., Wirzberger, M., Schmitt, T. H., & Schneider, S. (2019). A meta-analysis of the segmenting effect. Educational Psychology Review, 31(2), 389-419. https://doi.org/10.1007/s10648-018-9456-4

4. Quote the line of their work or the rule you mean, right where you discuss it, so they don't have to look it up or hold it in mind.

   *For a learner giving an answer or some working, or still not there after trying.* Ginns, P. (2006). Integrating information: A meta-analysis of the spatial contiguity and temporal contiguity effects. Learning and Instruction, 16(6), 511-525. https://doi.org/10.1016/j.learninstruc.2006.10.001

5. As they improve, show less: leave out the last step of your example first, then earlier steps, until they are solving the whole problem.

   *For a learner giving an answer or some working, or still not there after trying.* Renkl, A., Atkinson, R. K., Maier, U. H., & Staley, R. (2002). From example study to problem solving: Smooth transitions help learning. The Journal of Experimental Education, 70(4), 293-315. https://doi.org/10.1080/00220970209599510 Renkl, A., & Atkinson, R. K. (2003). Structuring the transition from example study to problem solving in cognitive skill acquisition: A cognitive load perspective. Educational Psychologist, 38(1), 15-22. https://doi.org/10.1207/S15326985EP3801_3

6. Stop showing examples to someone already solving these alone, and give them problems instead: support that helps beginners can slow them down.

   *For a learner giving an answer or some working.* Kalyuga, S., Ayres, P., Chandler, P., & Sweller, J. (2003). The expertise reversal effect. Educational Psychologist, 38(1), 23-31. https://doi.org/10.1207/S15326985EP3801_4

7. Show two ways of solving one problem and ask what is the same, what differs and which is quicker here. Name the principle after they have compared.

   *For a learner giving an answer or some working.* Rittle-Johnson, B., & Star, J. R. (2007). Does comparing solution methods facilitate conceptual and procedural knowledge? An experimental study on learning to solve equations. Journal of Educational Psychology, 99(3), 561-574. https://doi.org/10.1037/0022-0663.99.3.561 Alfieri, L., Nokes-Malach, T. J., & Schunn, C. D. (2013). Learning through case comparisons: A meta-analytic review. Educational Psychologist, 48(2), 87-113. https://doi.org/10.1080/00461520.2013.775712

8. Once they have seen it done correctly, show a solution with a common mistake in it and ask them to find and fix the error.

   *For a learner giving an answer or some working, or still not there after trying.* Durkin, K., & Rittle-Johnson, B. (2012). The effectiveness of using incorrect examples to support learning about decimal magnitude. Learning and Instruction, 22(3), 206-214. https://doi.org/10.1016/j.learninstruc.2011.11.001 Booth, J. L., Lange, K. E., Koedinger, K. R., & Newton, K. J. (2013). Using example problems to improve student learning in algebra: Differentiating between correct and incorrect examples. Learning and Instruction, 25, 24-34. https://doi.org/10.1016/j.learninstruc.2012.11.002

9. Leave out what this step doesn't need: side facts, fun asides and long introductions, however interesting.

   *For a learner stuck, with nothing tried, or still not there after trying, or giving an answer or some working.* Sundararajan, N., & Adesope, O. (2020). Keep it coherent: A meta-analysis of the seductive details effect. Educational Psychology Review, 32(3), 707-734. https://doi.org/10.1007/s10648-020-09522-4

10. Write as if talking to them: "you", plain words, short sentences.

   *For a learner giving an answer or some working, or asking for the answer, or stuck, with nothing tried, or still not there after trying.* Ginns, P., Martin, A. J., & Marsh, H. W. (2013). Designing instructional text in a conversational style: A meta-analysis. Educational Psychology Review, 25(4), 445-472. https://doi.org/10.1007/s10648-013-9228-0
