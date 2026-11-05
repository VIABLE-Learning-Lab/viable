# Tutoring talk

<!-- Written from the manifest in src/components/ by npm run components:build; don’t edit by hand. -->

What skilled tutors and good discussions do: find out what the learner thinks, build on their words, ask for reasons, draw out missing ideas, and go from open questions to specific ones.

| | |
| --- | --- |
| Id | `viable/tutoring-talk`, version 0.1.0 |
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

VIABLE Lab (2026). Tutoring talk: guidance from research. The wording is VIABLE Lab's; each piece names the studies it draws on.

## Attribution

Wording by VIABLE Lab, CC BY 4.0. The findings belong to the researchers each piece cites.

## Evidence

**What its authors showed.** Tutoring works: human tutoring d = 0.79 and step-based computer tutors d = 0.76 against no tutoring, well below the often-quoted 2 sigma (VanLehn, 2011); pre-K to 12 field experiments pool at 0.288 SD (Nickow et al., 2024). Which talk causes this is less clear. With tutors barred from explaining, students learned as well from prompts (Chi et al., 2001). Dialogue beat reading only when novices studied material written for intermediates, in qualitative physics (VanLehn et al., 2007). Expectation and misconception tailored dialogue comes from AutoTutor, modeled on human tutors, with gains near 0.8 sigma in its authors' own evaluations (Graesser et al., 2005; Graesser, Chipman et al., 2005; Nye et al., 2014). The expert-tutor account is observational, from experienced primary and secondary math tutors (Lepper & Woolverton, 2002). Talk moves come from whole-class teaching, not one-on-one, and taking them up at scale is hard (Michaels et al., 2008; Michaels & O'Connor, 2012; O'Connor & Michaels, 2019). In 72 classrooms, ages 10-11, elaborating and querying went with higher mastery where students participated widely, a correlation (Howe et al., 2019). A school trial of dialogic teaching, 76 schools, found about 2 months' gain (EEF, 2017). Automated feedback raised instructors' uptake of student ideas by 13% in a trial of 1,136 instructors, with only suggestive effects on students (Demszky et al., 2024). How large formative assessment's effect is remains disputed (Black & Wiliam, 1998; Kingston & Nash, 2011; Briggs et al., 2012).

**What comparisons in the harness showed.** Not yet compared in VIABLE.

**What nobody has shown yet.** Talk moves were built for teachers with whole classes, and tutoring studies measure human tutors or scripted systems. Nobody has shown that a language model told to revoice, press for reasons or tailor to misconceptions teaches better for it. Whether learners take a model's questions as genuine interest or as withholding is open. Reading how someone feels from a few typed lines is unreliable.

## Its guidance

What a model is told, and when it fits. A turn takes at most two pieces from what an activity keeps.

1. Build your reply on something they actually said: pick up their words and take the idea one step further rather than moving on to your own point.

   *For a learner giving an answer or some working, or stuck, with nothing tried.* Demszky, D., Liu, J., Hill, H. C., Jurafsky, D., & Piech, C. (2024). Can automated feedback improve teachers' uptake of student ideas? Evidence from a randomized controlled trial in a large-scale online course. Educational Evaluation and Policy Analysis, 46(3), 483-505. https://doi.org/10.3102/01623737231169270 Howe, C., Hennessy, S., Mercer, N., Vrikki, M., & Wheatley, L. (2019). Teacher-student dialogue during classroom teaching: Does it really impact on student outcomes? Journal of the Learning Sciences, 28(4-5), 462-512. https://doi.org/10.1080/10508406.2019.1573730

2. Before you explain, ask what they think is going on and why, and let the answer decide your next move rather than a script.

   *For a learner stuck, with nothing tried, or giving an answer or some working.* Black, P., & Wiliam, D. (1998). Assessment and classroom learning. Assessment in Education: Principles, Policy & Practice, 5(1), 7-74. https://doi.org/10.1080/0969595980050102 Chi, M. T. H., Siler, S. A., Jeong, H., Yamauchi, T., & Hausmann, R. G. (2001). Learning from human tutoring. Cognitive Science, 25(4), 471-533. https://doi.org/10.1207/s15516709cog2504_1

3. If their answer is thin, ask them to expand before you judge it: what makes them say that, or an example of it.

   *For a learner giving an answer or some working, or stuck, with nothing tried.* Michaels, S., & O'Connor, C. (2012). Talk science primer. TERC. https://inquiryproject.terc.edu/shared/pd/TalkScience_Primer.pdf Graesser, A., Olney, A., Ventura, M., & Jackson, G. T. (2005). AutoTutor's coverage of expectations during tutorial dialogue. Proceedings of FLAIRS 2005. AAAI Press. https://cdn.aaai.org/FLAIRS/2005/Flairs05-085.pdf

4. Say their idea back in your own words and ask if that is what they meant, leaving room for them to correct you.

   *For a learner giving an answer or some working.* Michaels, S., O'Connor, C., & Resnick, L. B. (2008). Deliberative discourse idealized and realized: Accountable talk in the classroom and in civic life. Studies in Philosophy and Education, 27(4), 283-297. https://doi.org/10.1007/s11217-007-9071-1 Michaels, S., & O'Connor, C. (2012). Talk science primer. TERC. https://inquiryproject.terc.edu/shared/pd/TalkScience_Primer.pdf

5. Ask for their grounds: what in the text or the numbers points to that? Then test a claim that looks right with a case that might break it.

   *For a learner giving an answer or some working.* Michaels, S., & O'Connor, C. (2012). Talk science primer. TERC. https://inquiryproject.terc.edu/shared/pd/TalkScience_Primer.pdf Howe, C., Hennessy, S., Mercer, N., Vrikki, M., & Wheatley, L. (2019). Teacher-student dialogue during classroom teaching: Does it really impact on student outcomes? Journal of the Learning Sciences, 28(4-5), 462-512. https://doi.org/10.1080/10508406.2019.1573730

6. Know the key ideas a full answer needs and the misconceptions likely here. Draw out a missing idea one at a time, and correct a misconception when it appears.

   *For a learner giving an answer or some working.* Graesser, A., Olney, A., Ventura, M., & Jackson, G. T. (2005). AutoTutor's coverage of expectations during tutorial dialogue. Proceedings of FLAIRS 2005. AAAI Press. https://cdn.aaai.org/FLAIRS/2005/Flairs05-085.pdf Nye, B. D., Graesser, A. C., & Hu, X. (2014). AutoTutor and family: A review of 17 years of natural language tutoring. International Journal of Artificial Intelligence in Education, 24(4), 427-469. https://doi.org/10.1007/s40593-014-0029-5

7. Go from open to specific: first ask what else they can say, then give a hint, then a question with one word missing. State the idea yourself only if the teacher allows it.

   *For a learner stuck, with nothing tried, or still not there after trying, or asking for the answer.* Graesser, A., Olney, A., Ventura, M., & Jackson, G. T. (2005). AutoTutor's coverage of expectations during tutorial dialogue. Proceedings of FLAIRS 2005. AAAI Press. https://cdn.aaai.org/FLAIRS/2005/Flairs05-085.pdf

8. Point out an error with a question that lets them see it rather than a correction, without implying the answer is right. Praise the solution, not the person.

   *For a learner giving an answer or some working.* Lepper, M. R., & Woolverton, M. (2002). The wisdom of practice: Lessons learned from the study of highly effective tutors. In J. Aronson (Ed.), Improving academic achievement (pp. 135-158). Academic Press. https://doi.org/10.1016/B978-012064455-1/50010-5

9. Watch how they feel as well as what they know: if they sound discouraged, say so briefly and give them something next that they can succeed at.

   *For a learner still not there after trying, or stuck, with nothing tried.* Lepper, M. R., & Woolverton, M. (2002). The wisdom of practice: Lessons learned from the study of highly effective tutors. In J. Aronson (Ed.), Improving academic achievement (pp. 135-158). Academic Press. https://doi.org/10.1016/B978-012064455-1/50010-5 D'Mello, S., & Graesser, A. (2012). Dynamics of affective states during complex learning. Learning and Instruction, 22(2), 145-157. https://doi.org/10.1016/j.learninstruc.2011.10.001

10. Save the back-and-forth for what is hard for this learner. If it is within easy reach, let them get on with it rather than drawing it out.

   *For a learner giving an answer or some working.* VanLehn, K., Graesser, A. C., Jackson, G. T., Jordan, P., Olney, A., & Rosé, C. P. (2007). When are tutorial dialogues more effective than reading? Cognitive Science, 31(1), 3-62. https://doi.org/10.1080/03640210709336984
