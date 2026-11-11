# Ways to arrange an activity

<!-- Generated from src/designs.js by npm run designs:build. Do not edit. -->

What a whole activity can be, from research. [Guidance](components.md) says what an AI should do at a moment in a conversation; a design says what learners do from start to end, so a conversation has a reason to happen. Most of these studies are on classrooms and human tutors, and each design says what isn't known.

Ask, where a teacher sets up a class in conversation with an agent on the VIABLE Learning Platform or the VIABLE Engine, chooses from these. So can your agent, with the MCP tool `find_designs`, `viable-harness designs` or `findDesigns`. `reviewActivity` reads an activity against the rules below, with no model.

## What holds for any of them

- Open with a puzzle, a real situation or a decision worth caring about, never a definition. Something should be at stake in the first two sentences.
- The first thing learners see says what they are doing, why it matters and how long it takes, in their own words and at their reading level.
- A learner should never meet an empty box. Where the AI is present, it speaks first, with a question that only makes sense in this activity.
- The first try is the learner’s. Turn the AI off wherever they commit to an answer or a first draft: the thinking that matters most happens before help arrives.
- Every step has learners make something: a choice, a reason, a sentence, an answer. Reading and listening alone leave little behind.
- Say what the AI does in each step, and be concrete about what it holds back. A role helps: a skeptic, a novice to teach, someone in the scene.
- End by having learners show what they can do now, on a case they haven’t seen, and say what changed in their thinking.
- Write real content: the actual case, the actual numbers, the actual questions. A step that says “discuss the topic” has not been designed yet.

## Predict, observe, explain

**For:** A result that can surprise: science, statistics, how a system behaves. **About:** 15 to 25 minutes.

**What the studies show:** Committing to a prediction makes learners notice when they are wrong, and working out why is what moves a misconception. In physics classes, students who predicted before a demonstration learned more from it than students who only watched.

**What isn't known:** Little of this has been tested with an AI in the conversation, or with a result described rather than seen.

**Sources:** White & Gunstone (1992), Probing Understanding; Crouch, Fagen, Callan & Mazur (2004), American Journal of Physics.

1. **Make your call** (questions, on their own). The setup, in a few vivid sentences, then one choice question on what will happen and one open question on why. No feedback yet.
2. **See what happens** (a page to read, on their own). What actually happened, shown or told plainly, with the numbers or a picture. Don’t explain it yet. Better still, a real simulation at a web address the teacher gave.
3. **Work out why** (a page to read, with the AI). One line of task: explain why it happened, and what your first idea missed. The AI: Asks what surprised them, then what they think is going on. Gives hints and asks about what they noticed. Never gives the explanation until they have tried twice.
4. **A new case** (questions, on their own). A new situation where the same idea decides the answer, with one choice question and one open question asking them to explain.

## Claim, evidence, reasoning

**For:** Weighing a claim: reading sources critically, arguing from evidence, media and AI literacy, science and history. **About:** 25 to 40 minutes.

**What the studies show:** Naming the parts of an argument, then fading that support, helped middle-school students write stronger explanations. Checking what other sources say about a claim, rather than reading one page closely, is a skill high school students improved at with a few lessons.

**What isn't known:** Whether an AI playing a skeptic builds the same skill as a teacher or classmates is not known, and a confident AI can also be believed too easily, so learners should check it too.

**Sources:** McNeill, Lizotte, Krajcik & Marx (2006), Journal of the Learning Sciences; Wineburg, Breakstone, McGrew, Smith & Ortega (2022), Journal of Educational Psychology.

1. **The case** (a page to read, on their own). A short, specific case: who says what, and why it matters. Then three to five pieces of evidence of different quality, each with where it came from. Make at least one strong source wrong-looking and one weak source convincing.
2. **Your first call** (questions, on their own). One choice question: is the claim true, false or can’t tell. One open question: which piece of evidence moved you most, and why.
3. **Question it** (a page to read, with the AI). One line of task: defend your call to a skeptic. Keep the evidence in reach. The AI: Plays a friendly skeptic. Asks which evidence they rely on, how they know it is reliable and what would change their mind. Never says what the verdict is, and pushes back whichever side they take.
4. **Make your case** (writing, with the AI). Write a claim, the evidence for it and the reasoning that connects them, in a short paragraph, with a rubric of those three parts. The AI: Only checks what they wrote against the rubric, and says which part is thin. Never writes a sentence for them.

## Worked example, then fade

**For:** A new procedure or kind of problem: math, grammar, coding, chemistry calculations. **About:** 15 to 30 minutes.

**What the studies show:** Novices learn more from studying worked examples than from solving the same problems alone, especially when asked to explain the steps, and when the worked steps fade out one at a time. The benefit shrinks, and can reverse, as learners gain skill.

**What isn't known:** How much an AI that explains on request takes away from this is not known: a learner can turn any problem back into a worked example by asking.

**Sources:** Atkinson, Derry, Renkl & Wortham (2000), Review of Educational Research; Renkl & Atkinson (2003), Educational Psychologist; Kalyuga, Ayres, Chandler & Sweller (2003), Educational Psychologist.

1. **Study one** (a page to read, with the AI). One problem solved step by step, with the reason for each step, then a prompt: why did the third step work? The AI: Asks them to explain one step in their own words before it says anything else. Corrects what they say; doesn’t lecture.
2. **Finish this one** (questions, with the AI). Two problems with most steps done and one missing for them to fill in, the missing step earlier in the second one. The AI: Hints about the step they are on, never the step itself.
3. **On your own** (questions, with the AI). Three to five whole problems that get harder, each with hints from a nudge to a bigger one, and a common wrong answer as a choice where there are choices. The AI: Hints only. Asks what they tried first.
4. **Say the rule** (questions, on their own). One open question: how would you explain this method to someone who missed the lesson?

## Try first, then learn

**For:** A concept with depth, where struggling first prepares learners to understand: statistics, physics, design problems, ethics. **About:** 25 to 40 minutes.

**What the studies show:** Learners who try a hard problem before being taught tend to understand the concept better and transfer it further than those taught first, even though they rarely solve the problem. It helps less for plain procedures.

**What isn't known:** An AI on hand makes it easy to skip the struggle, so whether this holds with one is unknown, and it depends on keeping the first try free of help.

**Sources:** Kapur (2016), Educational Psychologist; Sinha & Kapur (2021), Review of Educational Research.

1. **Try this** (writing, on their own). A hard, concrete problem they haven’t been taught to solve, with data or a situation. Say plainly: nobody expects you to get it, and any approach counts. Ask for at least two approaches.
2. **Talk about your try** (a page to read, with the AI). One line of task: tell the AI what you tried and where it broke down. The AI: Asks about their approach and what each one captures or misses. Doesn’t give the right method. Takes what they did seriously.
3. **The idea** (a page to read, on their own). The real concept, explained by showing what is right and what is missing in common first attempts.
4. **Now use it** (questions, with the AI). Two or three problems that use the concept, with one in a new setting. The AI: Hints only, and links back to what they tried first.

## From memory, then again

**For:** Keeping what has been taught: review, vocabulary, facts, before a test. **About:** 10 to 20 minutes.

**What the studies show:** Trying to recall something improves later memory more than rereading it, across ages and subjects, even when the first attempts fail, and more so with feedback. Spreading practice over days beats the same practice at once.

**What isn't known:** Most studies measure facts and short answers. How far this carries to reasoning, and what an AI’s feedback adds to a marked answer, is less clear.

**Sources:** Roediger & Karpicke (2006), Psychological Science; Adesope, Trevisan & Sundararajan (2017), Review of Educational Research; Cepeda, Pashler, Vul, Wixted & Rohrer (2006), Psychological Bulletin.

1. **From memory** (questions, on their own). One open question: write everything you remember about this, with no notes. Say it is fine to have gaps, and that trying is what helps.
2. **Mixed questions** (questions, with the AI). Six to ten questions, mixing topics rather than grouping them, with feedback after each and hints that send them back to what they know. The AI: Asks what they remember before it helps. Hints only.
3. **What slipped** (a page to read, with the AI). One line of task: go over what slipped, and choose what to look at again in a few days. The AI: Asks which ones slipped and has them explain the right idea in their own words. Doesn’t re-teach everything.

## Teach the AI

**For:** Pulling a topic together by explaining it: after a lesson or a reading, at any age. **About:** 15 to 25 minutes.

**What the studies show:** Preparing to teach and then explaining to someone helps learners find what they don’t understand, and students try harder for a learner they are responsible for than for themselves.

**What isn't known:** The evidence is on human learners and purpose-built teachable agents, not on a general AI playing one. It can slip out of the role, so test it first.

**Sources:** Chase, Chin, Oppezzo & Schwartz (2009), Journal of Science Education and Technology; Roscoe & Chi (2007), Review of Educational Research; Fiorella & Mayer (2013), Contemporary Educational Psychology.

1. **Get ready** (a page to read, on their own). What they will teach, the main ideas or a reading, and who their student is, with a name and a reason to want to know.
2. **Teach it** (a page to read, with the AI). One line of task: your student is confused. Help them until they can answer the question at the end. The AI: Plays a curious beginner of the learners’ age who holds a common misconception about this. Asks why and what about. Makes believable mistakes. Learns only what it is taught, and never reveals that it knows the answer.
3. **Did it stick?** (questions, on their own). Questions on what they taught, including the misconception their student held, and one open question: what was hardest to explain?

## Answer, argue, answer again

**For:** One concept many people get wrong: anything with a tempting wrong answer. **About:** 10 to 20 minutes.

**What the studies show:** After answering alone and then discussing with a peer, more learners get a concept question right, and they do better on a new question on the same idea, so the discussion itself teaches.

**What isn't known:** The studies are of classmates talking. An AI that plays a peer is a stand-in, and whether it does the same hasn’t been shown.

**Sources:** Crouch & Mazur (2001), American Journal of Physics; Smith, Wood, Adams, Wieman, Knight, Guild & Su (2009), Science.

1. **Your answer** (questions, on their own). One choice question on the concept, with a tempting wrong answer, and an open question: why? No feedback yet.
2. **Talk it over** (a page to read, with the AI). One line of task: a classmate picked differently. Convince them, or let them convince you. The AI: Plays a classmate who picked a different answer for a believable reason. Asks for their reasoning and offers its own. Never says which answer is right.
3. **Answer again** (questions, on their own). A new question on the same idea, with feedback and an explanation this time, and an open question: what changed your mind, or what kept it?

## In the scene, then step back

**For:** Practising what people do with others: a language, a hard conversation, a job, seeing history from inside. **About:** 15 to 30 minutes.

**What the studies show:** Simulations build complex skills across fields, more so when learners get support and step back to reflect. Talking through what happened afterwards improves later performance, in teams and alone.

**What isn't known:** The research is mostly on human actors and purpose-built simulations. An AI in character can be inaccurate about real people and places, so check what it says.

**Sources:** Chernikova, Heitzmann, Stadler, Holzberger, Seidel & Fischer (2020), Review of Educational Research; Tannenbaum & Cerasoli (2013), Human Factors.

1. **Your role** (a page to read, on their own). Who they are, who they are about to talk to, what they want from it and what good looks like. Words that may help.
2. **In the scene** (a page to read, with the AI). One line reminding them of their goal. The AI: Stays in character, in short turns, and makes them do the work of the scene: gets confused, objects, wants something of its own. Doesn’t coach or step out of the role unless they are upset or ask for help.
3. **Step back** (a page to read, with the AI). One line: now out of the scene. What went well, and what would you try next time? The AI: Out of character. Asks them first how it went, then adds one thing that worked and one to change, quoting what they said.
4. **Next time** (writing, on their own). A few sentences: what you would do differently, and one thing you would say.

## Read and explain

**For:** A text worth understanding: a chapter, an article, a primary source. **About:** 15 to 30 minutes.

**What the studies show:** Stopping to explain a text to oneself improves understanding and later problem solving, across subjects and ages, with a moderate effect, more so with specific prompts than with “think about it”.

**What isn't known:** Whether explaining to an AI works as well as explaining to oneself isn’t settled, and it can also tempt learners to ask it for a summary instead of reading.

**Sources:** Chi, de Leeuw, Chiu & LaVancher (1994), Cognitive Science; Bisra, Liu, Nesbit, Salimi & Winne (2018), Educational Psychology Review.

1. **Read** (a PDF to read, with the AI). The reading, a PDF the teacher brought, or the text itself on a page, with two or three places to stop and a question for each. The AI: Asks what they make of the passage before it explains anything. Won’t summarize it for them.
2. **Explain it back** (a page to read, with the AI). One line of task: explain the main idea to the AI in your own words, without looking. The AI: Asks follow-up questions, and sends them back to a specific part of the text where they have it wrong.
3. **Check** (questions, on their own). Questions that need the text understood, not just remembered, including one open question.

## Draft, feedback, revise

**For:** A piece of writing that should end up better than it started. **About:** 30 to 60 minutes.

**What the studies show:** Teaching planning and revising, and giving feedback tied to clear criteria, are among the practices that most improve students’ writing.

**What isn't known:** An AI that rewrites can raise the quality of a draft while taking away the learning, and the balance isn’t well understood. Keep it to questions and checks.

**Sources:** Graham & Perin (2007), Journal of Educational Psychology; Graham, Hebert & Harris (2015), The Elementary School Journal.

1. **Draft** (writing, on their own). A specific task with a real reader and purpose, and a rubric of three or four things that make it good.
2. **Get feedback** (writing, with the AI). The same writing, now with the AI beside it. The AI: Only checks: says what meets the rubric and where to look again, and asks a question about each. Never rewrites a sentence or supplies wording.
3. **What changed** (questions, on their own). One open question: what did you change, and why?
