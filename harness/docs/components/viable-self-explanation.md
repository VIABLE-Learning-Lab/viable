# Explaining and doing the thinking

<!-- Written from the manifest in src/components/ by npm run components:build; don’t edit by hand. -->

A component the VIABLE Harness carries: what it does, what learner data it receives, its license and the evidence behind it. [Components](../components.md) says what a component is.

Getting the learner to do the mental work: asking why, in their own words; having them produce rather than only read or agree; and what to do when this feels harder than being told.

| | |
| --- | --- |
| Id | `viable/self-explanation`, version 0.1.0 |
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

VIABLE Lab (2026). Explaining and doing the thinking: guidance from research. The wording is VIABLE Lab's; each piece names the studies it draws on.

## Attribution

Wording by VIABLE Lab, CC BY 4.0. The findings belong to the researchers each piece cites.

## Evidence

**What its authors showed.** Prompting learners to explain works on average: g = 0.55 across 64 reports and a range of tasks, subjects and levels (Bisra et al., 2018). The founding study was small: 14 prompted and 10 control eighth graders reading about the circulatory system (Chi et al., 1994). A major review rates self-explanation and elaborative questioning as moderate, since they were little tested in real classrooms (Dunlosky et al., 2013). ICAP, in which constructive and interactive work beats active and passive, is a framework with review-level support (Chi & Wylie, 2014); when teachers tried it they seldom managed interactive activities, though students learned more in constructive than active ones (Chi et al., 2018). Fiorella & Mayer (2016) review eight ways of having learners generate, with their limits. Students learned as well from tutors who only prompted as from tutors who explained (Chi et al., 2001). Contested: in math, adding prompts to explain to worked examples did worse (Barbieri et al., 2023). Preparing to teach and teaching: 28 studies, g = 0.35 and 0.56 (Kobayashi, 2019), though peer tutors tend to tell rather than build knowledge (Roscoe & Chi, 2007). Students in an active college class learned more and felt they learned less (Deslauriers et al., 2019), and people often misjudge how they learn (Bjork et al., 2013). Reciprocal teaching began with seventh graders who struggled with comprehension; median effects are 0.32 on standardized tests and 0.88 on researcher-made ones (Palincsar & Brown, 1984; Rosenshine & Meister, 1994).

**What comparisons in the harness showed.** Not yet compared with and without it in this harness.

**What nobody has shown yet.** The prompts studied were written by instructors and researchers; Bisra et al. recommend testing generated ones, and whether a model's prompts work as well is not known. Whether learners explain to an AI with the effort they give a person, and how much prompting they tolerate before they leave, is untested. Explaining costs time and attention for beginners, and the balance is not settled.

## Its guidance

What a model is told, and when it fits. A turn takes at most two pieces from what an activity keeps.

1. After a correct step, ask why it follows from the one before, in their own words, before going on.

   *For a learner giving an answer or some working.* Bisra, K., Liu, Q., Nesbit, J. C., Salimi, F., & Winne, P. H. (2018). Inducing self-explanation: A meta-analysis. Educational Psychology Review, 30(3), 703-725. https://doi.org/10.1007/s10648-018-9434-x Chi, M. T. H., de Leeuw, N., Chiu, M.-H., & LaVancher, C. (1994). Eliciting self-explanations improves understanding. Cognitive Science, 18(3), 439-477. https://doi.org/10.1207/s15516709cog1803_3

2. Ask questions they can't answer by copying: why is this true, what would change if the numbers changed, how does this fit what they already knew.

   *For a learner giving an answer or some working.* Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students' learning with effective learning techniques: Promising directions from cognitive and educational psychology. Psychological Science in the Public Interest, 14(1), 4-58. https://doi.org/10.1177/1529100612453266 Chi, M. T. H., & Wylie, R. (2014). The ICAP framework: Linking cognitive engagement to active learning outcomes. Educational Psychologist, 49(4), 219-243. https://doi.org/10.1080/00461520.2014.965823

3. Have them produce something of their own, such as an example, a short summary, a sketch or a prediction. Asking them to read, agree or pick an option does less.

   *For a learner giving an answer or some working, or stuck, with nothing tried, or still not there after trying.* Chi, M. T. H., & Wylie, R. (2014). The ICAP framework: Linking cognitive engagement to active learning outcomes. Educational Psychologist, 49(4), 219-243. https://doi.org/10.1080/00461520.2014.965823 Chi, M. T. H., Adams, J., Bogusch, E. B., Bruchok, C., Kang, S., Lancaster, M., Levy, R., Li, N., McEldoon, K. L., Stump, G. S., Wylie, R., Xu, D., & Yaghmourian, D. L. (2018). Translating the ICAP theory of cognitive engagement into practice. Cognitive Science, 42(6), 1777-1832. https://doi.org/10.1111/cogs.12626

4. Build on each other: add to what they produced and ask them to add to what you said, rather than you delivering and them confirming.

   *For a learner giving an answer or some working.* Chi, M. T. H., & Wylie, R. (2014). The ICAP framework: Linking cognitive engagement to active learning outcomes. Educational Psychologist, 49(4), 219-243. https://doi.org/10.1080/00461520.2014.965823 Chi, M. T. H., Siler, S. A., Jeong, H., Yamauchi, T., & Hausmann, R. G. (2001). Learning from human tutoring. Cognitive Science, 25(4), 471-533. https://doi.org/10.1207/s15516709cog2504_1

5. If they say they get it, ask them to show it: explain it as if to a classmate who missed the lesson, including why as well as what.

   *For a learner giving an answer or some working.* Kobayashi, K. (2019). Learning by preparing-to-teach and teaching: A meta-analysis. Japanese Psychological Research, 61(3), 192-203. https://doi.org/10.1111/jpr.12221 Roscoe, R. D., & Chi, M. T. H. (2007). Understanding tutor learning: Knowledge-building and knowledge-telling in peer tutors' explanations and questions. Review of Educational Research, 77(4), 534-574. https://doi.org/10.3102/0034654307309920

6. With a worked example, ask for one explanation at the step that matters, not at every line: prompts added to examples don't always help.

   *For a learner stuck, with nothing tried, or still not there after trying.* Barbieri, C. A., Miller-Cotto, D., Clerjuste, S. N., & Chawla, K. (2023). A meta-analysis of the worked examples effect on mathematics performance. Educational Psychology Review, 35(1), 11. https://doi.org/10.1007/s10648-023-09745-1

7. If they say being told would be easier, agree that working it out feels slower and harder, and say people often learn more this way even when it feels like less. Then offer the next small step.

   *For a learner asking for the answer.* Deslauriers, L., McCarty, L. S., Miller, K., Callaghan, K., & Kestin, G. (2019). Measuring actual learning versus feeling of learning in response to being actively engaged in the classroom. Proceedings of the National Academy of Sciences, 116(39), 19251-19257. https://doi.org/10.1073/pnas.1821936116 Bjork, R. A., Dunlosky, J., & Kornell, N. (2013). Self-regulated learning: Beliefs, techniques, and illusions. Annual Review of Psychology, 64(1), 417-444. https://doi.org/10.1146/annurev-psych-113011-143823

8. While they read, stop after a short section and ask what it means and how it connects to what they already knew.

   *For a learner stuck, with nothing tried, or giving an answer or some working.* *When the subject is: reading read passage text story article chapter book comprehension.* Chi, M. T. H., de Leeuw, N., Chiu, M.-H., & LaVancher, C. (1994). Eliciting self-explanations improves understanding. Cognitive Science, 18(3), 439-477. https://doi.org/10.1207/s15516709cog1803_3

9. For a text, take turns with them: summarize a part, ask a question about it, clear up what is unclear and predict what comes next, then let them lead.

   *For a learner stuck, with nothing tried, or giving an answer or some working.* *When the subject is: reading read passage text story article chapter book comprehension.* Palincsar, A. S., & Brown, A. L. (1984). Reciprocal teaching of comprehension-fostering and comprehension-monitoring activities. Cognition and Instruction, 1(2), 117-175. https://doi.org/10.1207/s1532690xci0102_1 Rosenshine, B., & Meister, C. (1994). Reciprocal teaching: A review of the research. Review of Educational Research, 64(4), 479-530. https://doi.org/10.3102/00346543064004479
