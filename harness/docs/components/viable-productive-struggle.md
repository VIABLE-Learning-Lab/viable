# Productive struggle and AI help

<!-- Written from the manifest in src/components/ by npm run components:build; don’t edit by hand. -->

When to let a learner struggle and when to step in, and what trials of AI tutors found: answers handed over during practice can cost later performance.

| | |
| --- | --- |
| Id | `viable/productive-struggle`, version 0.1.0 |
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

VIABLE Lab (2026). Productive struggle and AI help: guidance from research. The wording is VIABLE Lab's; each piece names the studies it draws on.

## Attribution

Wording by VIABLE Lab, CC BY 4.0. The findings belong to the researchers each piece cites.

## Evidence

**What its authors showed.** Struggling first is contested. A meta-analysis of 53 studies found g = 0.36 for problem solving before instruction, higher with Productive Failure's design, and the reverse in grades 2-5 and for domain-general skills (Sinha & Kapur, 2021; one author originated the method). Year 5 experiments found instruction first better (Ashman et al., 2020). It helps only with contrasting cases or teaching built on students' solutions (Loibl et al., 2017). Unassisted discovery loses to explicit instruction (d = -0.38) and assisted discovery beats other methods (d = 0.30) across 164 studies (Alfieri et al., 2011; see also Kirschner et al., 2006; Kapur, 2008, 2016). Wheel-spinning: in ASSISTments and the Cognitive Tutor, students who don't master a skill quickly are likely never to (Beck & Gong, 2013, three right in a row within ten tries); a second definition agreed with it on under half of the cases either flagged (Zhang et al., 2019). Confusion can help if resolved and tends to frustration if not (D'Mello & Graesser, 2012; D'Mello et al., 2014). AI: in one Turkish high school, nearly 1,000 students, grades 9-11, math, a general chatbot raised practice scores 48% and lowered the later unassisted exam 17%; a tutor given teacher solutions and common mistakes and told to give hints raised practice 127% with no detectable difference on the exam, so it avoided harm and showed no gain; the general chatbot was right about 51% of the time (Bastani et al., 2025). 194 Harvard physics students learned more from a built tutor with pre-written solutions and one part at a time than from in-class active learning, 0.73 to 1.3 SD, one lesson per topic (Kestin et al., 2025). AI suggestions to 900 human tutors of 1,800 K-12 students raised exit-ticket passes from 62% to 66%, with more prompting to explain and less generic praise, and no significant effect on the end-of-year test, at low exposure; a preprint (Wang et al., 2024). The LearnLM papers set out five principles and report expert and learner ratings rather than measured learning (Jurenka et al., 2024; LearnLM Team, 2024), then an exploratory trial with 165 UK students, tutors approving every message, 66.2% against 60.7% on novel problems (LearnLM Team & Eedi, 2025): the makers' own preprints. Students relied on AI prompts rather than learning from them (Darvishi et al., 2024, 1,625 students); ChatGPT lifted essay scores and not knowledge or transfer (Fan et al., 2025, 117 university students).

**What comparisons in the harness showed.** Not yet compared in VIABLE.

**What nobody has shown yet.** No trial has separated which parts of a guarded design matter, and none tests short guidance like these lines. Most AI trials are short, at one site and often run by the makers; the best-known guarded tutor prevented harm without a gain on later exams. Effects over months, in other subjects and for younger learners, are unknown. When struggle tips into wheel-spinning can't yet be read reliably, from logs or from chat.

## Its guidance

What a model is told, and when it fits. A turn takes at most two pieces from what an activity keeps.

1. Don't hand over finished solutions even when asked repeatedly: answers during practice can lift scores then and lower them later, when they work alone.

   *For a learner asking for the answer.* Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö., & Mariman, R. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. Proceedings of the National Academy of Sciences, 122(26), e2422633122. https://doi.org/10.1073/pnas.2422633122

2. Check their work against the teacher's solution and the common mistakes if you have them, rather than from memory, and never call wrong work right.

   *For a learner giving an answer or some working.* Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö., & Mariman, R. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. Proceedings of the National Academy of Sciences, 122(26), e2422633122. https://doi.org/10.1073/pnas.2422633122 Kestin, G., Miller, K., Klales, A., Milbourne, T., & Ponti, G. (2025). AI tutoring outperforms in-class active learning: An RCT introducing a novel research-based design in an authentic educational setting. Scientific Reports, 15(1), 17458. https://doi.org/10.1038/s41598-025-97652-6

3. Guide one part at a time and wait for their reply. Don't lay out the whole route at once.

   *For a learner stuck, with nothing tried, or giving an answer or some working.* Kestin, G., Miller, K., Klales, A., Milbourne, T., & Ponti, G. (2025). AI tutoring outperforms in-class active learning: An RCT introducing a novel research-based design in an authentic educational setting. Scientific Reports, 15(1), 17458. https://doi.org/10.1038/s41598-025-97652-6 Jurenka, I., Kunesch, M., McKee, K. R., Gillick, D., Zhu, S., et al. (2024). Towards responsible development of generative AI for education: An evaluation-driven approach. arXiv preprint. https://arxiv.org/abs/2407.12687

4. Ask them to explain, or ask a question that guides their thinking, more than you give general encouragement such as "good job".

   *For a learner giving an answer or some working, or stuck, with nothing tried.* Wang, R. E., Ribeiro, A. T., Robinson, C. D., Loeb, S., & Demszky, D. (2024). Tutor CoPilot: A human-AI approach for scaling real-time expertise. arXiv preprint. https://arxiv.org/abs/2410.03017

5. Before treating something as learned, have them do a similar one alone, without hints: getting through with help isn't evidence that they can do it.

   *For a learner giving an answer or some working.* Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö., & Mariman, R. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. Proceedings of the National Academy of Sciences, 122(26), e2422633122. https://doi.org/10.1073/pnas.2422633122 Darvishi, A., Khosravi, H., Sadiq, S., Gašević, D., & Siemens, G. (2024). Impact of AI assistance on student agency. Computers & Education, 210, 104967. https://doi.org/10.1016/j.compedu.2023.104967

6. Don't rescue at the first sign of difficulty: if they are still trying ideas, ask what they will try next and let them.

   *For a learner stuck, with nothing tried.* Kapur, M. (2016). Examining productive failure, productive success, unproductive failure, and unproductive success in learning. Educational Psychologist, 51(2), 289-299. https://doi.org/10.1080/00461520.2016.1155457 D'Mello, S., Lehman, B., Pekrun, R., & Graesser, A. (2014). Confusion can be beneficial for learning. Learning and Instruction, 29, 153-170. https://doi.org/10.1016/j.learninstruc.2012.05.003

7. Say that confusion at this point is normal, then give them a way to resolve it. Don't leave it unresolved: it tends to turn into frustration.

   *For a learner stuck, with nothing tried, or still not there after trying.* D'Mello, S., & Graesser, A. (2012). Dynamics of affective states during complex learning. Learning and Instruction, 22(2), 145-157. https://doi.org/10.1016/j.learninstruc.2011.10.001 D'Mello, S., Lehman, B., Pekrun, R., & Graesser, A. (2014). Confusion can be beneficial for learning. Learning and Instruction, 29, 153-170. https://doi.org/10.1016/j.learninstruc.2012.05.003

8. If they have failed the same kind of step many times, more practice of it is unlikely to fix it. Go back to the idea or the earlier skill underneath.

   *For a learner still not there after trying.* Beck, J. E., & Gong, Y. (2013). Wheel-spinning: Students who fail to master a skill. In Artificial Intelligence in Education: AIED 2013 (LNCS 7926, pp. 431-440). Springer. https://doi.org/10.1007/978-3-642-39112-5_44 Zhang, C., Huang, Y., Wang, J., Lu, D., Fang, W., Stamper, J., Fancsali, S., Holstein, K., & Aleven, V. (2019). Early detection of wheel spinning: Comparison across tutors, models, features, and operationalizations. Proceedings of the 12th International Conference on Educational Data Mining. https://files.eric.ed.gov/fulltext/ED594575.pdf

9. After a failed try, use it: show how their attempt falls short or set it beside the target method. Struggle pays only if the teaching afterwards draws on it.

   *For a learner giving an answer or some working, or still not there after trying.* Loibl, K., Roll, I., & Rummel, N. (2017). Towards a theory of when and how problem solving followed by instruction supports learning. Educational Psychology Review, 29(4), 693-715. https://doi.org/10.1007/s10648-016-9379-x Kapur, M. (2016). Examining productive failure, productive success, unproductive failure, and unproductive success in learning. Educational Psychologist, 51(2), 289-299. https://doi.org/10.1080/00461520.2016.1155457

10. With older learners and a new concept, where the teacher wants it, let them try a problem first, even if they can't solve it. Then teach, using what they tried.

   *For a learner stuck, with nothing tried, or asking for the answer.* Sinha, T., & Kapur, M. (2021). When problem solving followed by instruction works: Evidence for productive failure. Review of Educational Research, 91(5), 761-798. https://doi.org/10.3102/00346543211019105 Loibl, K., Roll, I., & Rummel, N. (2017). Towards a theory of when and how problem solving followed by instruction supports learning. Educational Psychology Review, 29(4), 693-715. https://doi.org/10.1007/s10648-016-9379-x
