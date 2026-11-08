// What a learning activity can be, from research: ways of arranging what learners do, each with what the studies showed and what
// isn't known. Guidance (components/guidance.js) says what an AI should do at a moment in a conversation; a design says what the
// whole activity is, so that a conversation has a reason to happen. Most of these studies are on classrooms and human tutors, and
// each design says so. No model, no network.

/** What holds for any design: what an activity needs before it has earned a learner's time. */
export const DESIGN_RULES = [
  'Open with a puzzle, a real situation or a decision worth caring about, never a definition. Something should be at stake in the first two sentences.',
  'The first thing learners see says what they are doing, why it matters and how long it takes, in their own words and at their reading level.',
  'A learner should never meet an empty box. Where the AI is present, it speaks first, with a question that only makes sense in this activity.',
  'The first try is the learner’s. Turn the AI off wherever they commit to an answer or a first draft: the thinking that matters most happens before help arrives.',
  'Every step has learners make something: a choice, a reason, a sentence, an answer. Reading and listening alone leave little behind.',
  'Say what the AI does in each step, and be concrete about what it holds back. A role helps: a skeptic, a novice to teach, someone in the scene.',
  'End by having learners show what they can do now, on a case they haven’t seen, and say what changed in their thinking.',
  'Write real content: the actual case, the actual numbers, the actual questions. A step that says “discuss the topic” has not been designed yet.'
];

export const ACTIVITY_DESIGNS = [
  {
    id: 'predict-observe-explain',
    label: 'Predict, observe, explain',
    for: 'A result that can surprise: science, statistics, how a system behaves.',
    words: 'predict prediction observe experiment phenomenon demonstration simulation surprise science physics chemistry biology statistics probability misconception why happens',
    minutes: '15 to 25',
    shows: 'Committing to a prediction makes learners notice when they are wrong, and working out why is what moves a misconception. In physics classes, students who predicted before a demonstration learned more from it than students who only watched.',
    unknown: 'Little of this has been tested with an AI in the conversation, or with a result described rather than seen.',
    sources: ['White & Gunstone (1992), Probing Understanding', 'Crouch, Fagen, Callan & Mazur (2004), American Journal of Physics'],
    steps: [
      { title: 'Make your call', panel: 'questions', ai: 'off', write: 'The setup, in a few vivid sentences, then one choice question on what will happen and one open question on why. No feedback yet.' },
      { title: 'See what happens', panel: 'page', ai: 'off', write: 'What actually happened, shown or told plainly, with the numbers or a picture. Don’t explain it yet. Better still, a real simulation at a web address the teacher gave.' },
      { title: 'Work out why', panel: 'page', ai: 'on', write: 'One line of task: explain why it happened, and what your first idea missed.', ai_does: 'Asks what surprised them, then what they think is going on. Gives hints and asks about what they noticed. Never gives the explanation until they have tried twice.' },
      { title: 'A new case', panel: 'questions', ai: 'off', write: 'A new situation where the same idea decides the answer, with one choice question and one open question asking them to explain.' }
    ]
  },
  {
    id: 'claim-evidence-reasoning',
    label: 'Claim, evidence, reasoning',
    for: 'Weighing a claim: reading sources critically, arguing from evidence, media and AI literacy, science and history.',
    words: 'claim evidence reasoning argument argue source sources misinformation media literacy fact check detective critical thinking debate history science ai literacy trust verify',
    minutes: '25 to 40',
    shows: 'Naming the parts of an argument, then fading that support, helped middle-school students write stronger explanations. Checking what other sources say about a claim, rather than reading one page closely, is a skill high school students improved at with a few lessons.',
    unknown: 'Whether an AI playing a skeptic builds the same skill as a teacher or classmates is not known, and a confident AI can also be believed too easily, so learners should check it too.',
    sources: ['McNeill, Lizotte, Krajcik & Marx (2006), Journal of the Learning Sciences', 'Wineburg, Breakstone, McGrew, Smith & Ortega (2022), Journal of Educational Psychology'],
    steps: [
      { title: 'The case', panel: 'page', ai: 'off', write: 'A short, specific case: who says what, and why it matters. Then three to five pieces of evidence of different quality, each with where it came from. Make at least one strong source wrong-looking and one weak source convincing.' },
      { title: 'Your first call', panel: 'questions', ai: 'off', write: 'One choice question: is the claim true, false or can’t tell. One open question: which piece of evidence moved you most, and why.' },
      { title: 'Question it', panel: 'page', ai: 'on', write: 'One line of task: defend your call to a skeptic. Keep the evidence in reach.', ai_does: 'Plays a friendly skeptic. Asks which evidence they rely on, how they know it is reliable and what would change their mind. Never says what the verdict is, and pushes back whichever side they take.' },
      { title: 'Make your case', panel: 'writing', ai: 'on', write: 'Write a claim, the evidence for it and the reasoning that connects them, in a short paragraph, with a rubric of those three parts.', ai_does: 'Only checks what they wrote against the rubric, and says which part is thin. Never writes a sentence for them.' }
    ]
  },
  {
    id: 'worked-example-fading',
    label: 'Worked example, then fade',
    for: 'A new procedure or kind of problem: math, grammar, coding, chemistry calculations.',
    words: 'worked example procedure steps solve solving math algebra fractions equation calculation grammar coding method practice problem new skill beginner',
    minutes: '15 to 30',
    shows: 'Novices learn more from studying worked examples than from solving the same problems alone, especially when asked to explain the steps, and when the worked steps fade out one at a time. The benefit shrinks, and can reverse, as learners gain skill.',
    unknown: 'How much an AI that explains on request takes away from this is not known: a learner can turn any problem back into a worked example by asking.',
    sources: ['Atkinson, Derry, Renkl & Wortham (2000), Review of Educational Research', 'Renkl & Atkinson (2003), Educational Psychologist', 'Kalyuga, Ayres, Chandler & Sweller (2003), Educational Psychologist'],
    steps: [
      { title: 'Study one', panel: 'page', ai: 'on', write: 'One problem solved step by step, with the reason for each step, then a prompt: why did the third step work?', ai_does: 'Asks them to explain one step in their own words before it says anything else. Corrects what they say; doesn’t lecture.' },
      { title: 'Finish this one', panel: 'questions', ai: 'on', write: 'Two problems with most steps done and one missing for them to fill in, the missing step earlier in the second one.', ai_does: 'Hints about the step they are on, never the step itself.' },
      { title: 'On your own', panel: 'questions', ai: 'on', write: 'Three to five whole problems that get harder, each with hints from a nudge to a bigger one, and a common wrong answer as a choice where there are choices.', ai_does: 'Hints only. Asks what they tried first.' },
      { title: 'Say the rule', panel: 'questions', ai: 'off', write: 'One open question: how would you explain this method to someone who missed the lesson?' }
    ]
  },
  {
    id: 'try-first',
    label: 'Try first, then learn',
    for: 'A concept with depth, where struggling first prepares learners to understand: statistics, physics, design problems, ethics.',
    words: 'productive failure struggle try first invent concept deep understanding transfer problem solving explore challenge before instruction why',
    minutes: '25 to 40',
    shows: 'Learners who try a hard problem before being taught tend to understand the concept better and transfer it further than those taught first, even though they rarely solve the problem. It helps less for plain procedures.',
    unknown: 'An AI on hand makes it easy to skip the struggle, so whether this holds with one is unknown, and it depends on keeping the first try free of help.',
    sources: ['Kapur (2016), Educational Psychologist', 'Sinha & Kapur (2021), Review of Educational Research'],
    steps: [
      { title: 'Try this', panel: 'writing', ai: 'off', write: 'A hard, concrete problem they haven’t been taught to solve, with data or a situation. Say plainly: nobody expects you to get it, and any approach counts. Ask for at least two approaches.' },
      { title: 'Talk about your try', panel: 'page', ai: 'on', write: 'One line of task: tell the AI what you tried and where it broke down.', ai_does: 'Asks about their approach and what each one captures or misses. Doesn’t give the right method. Takes what they did seriously.' },
      { title: 'The idea', panel: 'page', ai: 'off', write: 'The real concept, explained by showing what is right and what is missing in common first attempts.' },
      { title: 'Now use it', panel: 'questions', ai: 'on', write: 'Two or three problems that use the concept, with one in a new setting.', ai_does: 'Hints only, and links back to what they tried first.' }
    ]
  },
  {
    id: 'retrieval-practice',
    label: 'From memory, then again',
    for: 'Keeping what has been taught: review, vocabulary, facts, before a test.',
    words: 'review recall retrieval memory remember quiz practice test vocabulary revision exam check last week spaced spacing retention',
    minutes: '10 to 20',
    shows: 'Trying to recall something improves later memory more than rereading it, across ages and subjects, even when the first attempts fail, and more so with feedback. Spreading practice over days beats the same practice at once.',
    unknown: 'Most studies measure facts and short answers. How far this carries to reasoning, and what an AI’s feedback adds to a marked answer, is less clear.',
    sources: ['Roediger & Karpicke (2006), Psychological Science', 'Adesope, Trevisan & Sundararajan (2017), Review of Educational Research', 'Cepeda, Pashler, Vul, Wixted & Rohrer (2006), Psychological Bulletin'],
    steps: [
      { title: 'From memory', panel: 'questions', ai: 'off', write: 'One open question: write everything you remember about this, with no notes. Say it is fine to have gaps, and that trying is what helps.' },
      { title: 'Mixed questions', panel: 'questions', ai: 'on', write: 'Six to ten questions, mixing topics rather than grouping them, with feedback after each and hints that send them back to what they know.', ai_does: 'Asks what they remember before it helps. Hints only.' },
      { title: 'What slipped', panel: 'page', ai: 'on', write: 'One line of task: go over what slipped, and choose what to look at again in a few days.', ai_does: 'Asks which ones slipped and has them explain the right idea in their own words. Doesn’t re-teach everything.' }
    ]
  },
  {
    id: 'teach-the-ai',
    label: 'Teach the AI',
    for: 'Pulling a topic together by explaining it: after a lesson or a reading, at any age.',
    words: 'teach explain teachable learning by teaching protege novice student explain back summarize understand concept fun game',
    minutes: '15 to 25',
    shows: 'Preparing to teach and then explaining to someone helps learners find what they don’t understand, and students try harder for a learner they are responsible for than for themselves.',
    unknown: 'The evidence is on human learners and purpose-built teachable agents, not on a general AI playing one. It can slip out of the role, so test it first.',
    sources: ['Chase, Chin, Oppezzo & Schwartz (2009), Journal of Science Education and Technology', 'Roscoe & Chi (2007), Review of Educational Research', 'Fiorella & Mayer (2013), Contemporary Educational Psychology'],
    steps: [
      { title: 'Get ready', panel: 'page', ai: 'off', write: 'What they will teach, the main ideas or a reading, and who their student is, with a name and a reason to want to know.' },
      { title: 'Teach it', panel: 'page', ai: 'on', write: 'One line of task: your student is confused. Help them until they can answer the question at the end.', ai_does: 'Plays a curious beginner of the learners’ age who holds a common misconception about this. Asks why and what about. Makes believable mistakes. Learns only what it is taught, and never reveals that it knows the answer.' },
      { title: 'Did it stick?', panel: 'questions', ai: 'off', write: 'Questions on what they taught, including the misconception their student held, and one open question: what was hardest to explain?' }
    ]
  },
  {
    id: 'vote-argue-revote',
    label: 'Answer, argue, answer again',
    for: 'One concept many people get wrong: anything with a tempting wrong answer.',
    words: 'concept misconception vote discussion peer instruction argue debate conceptual understanding wrong answer tempting multiple choice convince',
    minutes: '10 to 20',
    shows: 'After answering alone and then discussing with a peer, more learners get a concept question right, and they do better on a new question on the same idea, so the discussion itself teaches.',
    unknown: 'The studies are of classmates talking. An AI that plays a peer is a stand-in, and whether it does the same hasn’t been shown.',
    sources: ['Crouch & Mazur (2001), American Journal of Physics', 'Smith, Wood, Adams, Wieman, Knight, Guild & Su (2009), Science'],
    steps: [
      { title: 'Your answer', panel: 'questions', ai: 'off', write: 'One choice question on the concept, with a tempting wrong answer, and an open question: why? No feedback yet.' },
      { title: 'Talk it over', panel: 'page', ai: 'on', write: 'One line of task: a classmate picked differently. Convince them, or let them convince you.', ai_does: 'Plays a classmate who picked a different answer for a believable reason. Asks for their reasoning and offers its own. Never says which answer is right.' },
      { title: 'Answer again', panel: 'questions', ai: 'off', write: 'A new question on the same idea, with feedback and an explanation this time, and an open question: what changed your mind, or what kept it?' }
    ]
  },
  {
    id: 'role-play-debrief',
    label: 'In the scene, then step back',
    for: 'Practising what people do with others: a language, a hard conversation, a job, seeing history from inside.',
    words: 'role play roleplay simulation scene conversation speaking language practice interview history perspective character empathy negotiate customer patient practice speaking',
    minutes: '15 to 30',
    shows: 'Simulations build complex skills across fields, more so when learners get support and step back to reflect. Talking through what happened afterwards improves later performance, in teams and alone.',
    unknown: 'The research is mostly on human actors and purpose-built simulations. An AI in character can be inaccurate about real people and places, so check what it says.',
    sources: ['Chernikova, Heitzmann, Stadler, Holzberger, Seidel & Fischer (2020), Review of Educational Research', 'Tannenbaum & Cerasoli (2013), Human Factors'],
    steps: [
      { title: 'Your role', panel: 'page', ai: 'off', write: 'Who they are, who they are about to talk to, what they want from it and what good looks like. Words that may help.' },
      { title: 'In the scene', panel: 'page', ai: 'on', write: 'One line reminding them of their goal.', ai_does: 'Stays in character, in short turns, and makes them do the work of the scene: gets confused, objects, wants something of its own. Doesn’t coach or step out of the role unless they are upset or ask for help.' },
      { title: 'Step back', panel: 'page', ai: 'on', chat: 'new', write: 'One line: now out of the scene. What went well, and what would you try next time?', ai_does: 'Out of character. Asks them first how it went, then adds one thing that worked and one to change, quoting what they said.' },
      { title: 'Next time', panel: 'writing', ai: 'off', write: 'A few sentences: what you would do differently, and one thing you would say.' }
    ]
  },
  {
    id: 'explain-as-you-read',
    label: 'Read and explain',
    for: 'A text worth understanding: a chapter, an article, a primary source.',
    words: 'read reading text article chapter pdf comprehension source primary source passage understand book literature self explanation',
    minutes: '15 to 30',
    shows: 'Stopping to explain a text to oneself improves understanding and later problem solving, across subjects and ages, with a moderate effect, more so with specific prompts than with “think about it”.',
    unknown: 'Whether explaining to an AI works as well as explaining to oneself isn’t settled, and it can also tempt learners to ask it for a summary instead of reading.',
    sources: ['Chi, de Leeuw, Chiu & LaVancher (1994), Cognitive Science', 'Bisra, Liu, Nesbit, Salimi & Winne (2018), Educational Psychology Review'],
    steps: [
      { title: 'Read', panel: 'reading', ai: 'on', write: 'The reading, a PDF the teacher brought, or the text itself on a page, with two or three places to stop and a question for each.', ai_does: 'Asks what they make of the passage before it explains anything. Won’t summarize it for them.' },
      { title: 'Explain it back', panel: 'page', ai: 'on', write: 'One line of task: explain the main idea to the AI in your own words, without looking.', ai_does: 'Asks follow-up questions, and sends them back to a specific part of the text where they have it wrong.' },
      { title: 'Check', panel: 'questions', ai: 'off', write: 'Questions that need the text understood, not just remembered, including one open question.' }
    ]
  },
  {
    id: 'draft-feedback-revise',
    label: 'Draft, feedback, revise',
    for: 'A piece of writing that should end up better than it started.',
    words: 'writing essay draft revise revision paragraph feedback rubric composition argument narrative story peer review edit',
    minutes: '30 to 60',
    shows: 'Teaching planning and revising, and giving feedback tied to clear criteria, are among the practices that most improve students’ writing.',
    unknown: 'An AI that rewrites can raise the quality of a draft while taking away the learning, and the balance isn’t well understood. Keep it to questions and checks.',
    sources: ['Graham & Perin (2007), Journal of Educational Psychology', 'Graham, Hebert & Harris (2015), The Elementary School Journal'],
    steps: [
      { title: 'Draft', panel: 'writing', ai: 'off', write: 'A specific task with a real reader and purpose, and a rubric of three or four things that make it good.' },
      { title: 'Get feedback', panel: 'writing', ai: 'on', write: 'The same writing, now with the AI beside it.', ai_does: 'Only checks: says what meets the rubric and where to look again, and asks a question about each. Never rewrites a sentence or supplies wording.' },
      { title: 'What changed', panel: 'questions', ai: 'off', write: 'One open question: what did you change, and why?' }
    ]
  }
];

const wordsIn = (text) => String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2);

/** The designs that fit a few words about what is being taught, the best first; every one if nothing fits. Each is whole: what it is for, its steps, what the studies showed and what isn't known. */
export function findDesigns({ words = '', limit = 3 } = {}) {
  const asked = new Set(wordsIn(words));
  const scored = ACTIVITY_DESIGNS.map((design, order) => {
    const held = new Set(wordsIn(`${design.words} ${design.label} ${design.for}`));
    return { design, order, score: [...asked].filter((word) => held.has(word)).length };
  });
  const fit = scored.filter((item) => item.score).sort((a, b) => b.score - a.score || a.order - b.order);
  return (fit.length ? fit : scored).slice(0, limit).map(({ design }) => design);
}

export const designById = (id) => ACTIVITY_DESIGNS.find((design) => design.id === id) || null;

/**
 * What an activity is missing before learners meet it, by rules: no model, so it says the same thing every time and costs nothing.
 * fix: a learner would be stuck or lost. consider: it works, and research suggests something better. Takes a plain description:
 * { goal, help, ai, says, steps: [{ title, ai, says, panels: [{ type, text, prompt, questions }] }] }, or no steps for a conversation alone.
 */
export function reviewActivity({ goal = null, help = null, ai = false, says = null, audience = null, steps = [] } = {}) {
  const notes = [];
  const add = (level, id, words) => notes.push({ level, id, says: words });
  const panels = steps.flatMap((step) => step.panels || []);
  const aiSteps = steps.filter((step) => step.ai !== false && step.ai !== 'off');
  const usesAi = Boolean(ai) && (!steps.length || aiSteps.length > 0);
  if (!steps.length && usesAi && !says) add('fix', 'empty_box', 'Learners meet an empty box. Say what they are doing here and what the AI says first.');
  if (!goal) add('fix', 'no_goal', 'Nothing says what learners should be able to do by the end. The AI needs a goal too.');
  for (const panel of panels) {
    if (panel.type === 'page' && !String(panel.text ?? '').trim()) add('fix', 'empty_page', 'A step has a page with nothing on it.');
    if (panel.type === 'writing' && !String(panel.prompt ?? '').trim()) add('fix', 'no_task', 'A writing step doesn’t say what to write.');
    if (panel.type === 'questions' && panel.questions === 0) add('fix', 'no_questions', 'A step has questions to answer, and none written yet.');
    if (panel.type === 'reading' && panel.file === false) add('fix', 'no_reading', 'A reading step has no PDF yet.');
  }
  for (const step of aiSteps) {
    const here = step.panels || [];
    if (!step.says && here.length && !here.some((panel) => panel.type === 'questions' || panel.type === 'writing')) add('consider', 'ai_silent', `In “${step.title}” learners have to think of what to say. Give the AI a first message.`);
  }
  if (usesAi && !help) add('consider', 'no_limit', 'You haven’t said how much the AI does, so it follows its own instructions. Shows an example is a good start.');
  if (steps.length && !panels.some((panel) => panel.type === 'questions' || panel.type === 'writing')) add('consider', 'nothing_made', 'Nothing here shows what learners understood. A short question or a few sentences at the end would.');
  if (!steps.length && usesAi) add('consider', 'conversation_alone', 'A conversation alone leaves learners to steer it, and little to show for it. Steps give them something to do first and something to make at the end.');
  if (steps.length > 1 && steps[0].ai !== false && steps[0].ai !== 'off' && (steps[0].panels || []).some((panel) => panel.type === 'questions' || panel.type === 'writing')) add('consider', 'help_first', 'The AI is there from the first step, so learners can ask before they have thought. Turning it off there keeps the first try theirs.');
  if (audience === 'children') for (const panel of panels) if (panel.type === 'page' && wordsIn(panel.text).length > 350) { add('consider', 'long_page', 'A page here is long for children. Break it up, or cut it to what they need for this step.'); break; }
  return notes;
}
