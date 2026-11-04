/**
 * Demo mode: an OpenAI-compatible model, in a function, that answers from a script. The harness around
 * it is the real one, so the drafts, the reviews and the rewrites travel the real engine, and only the
 * words are written in advance. Deterministic: the same message, settings and question get the same
 * reply. demoModel({ docs, files, pace }) returns a fetch to give the runtime. No Node built-ins: a
 * static copy of demo mode runs this in a browser.
 */
import { HELP_LEVELS } from '../../../harness/src/utils/teaching.js';

/** Where the examples' files live on the web; their copies are in examples/files/. */
export const EXAMPLE_FILES = 'https://developers.viablelab.org/docs/examples/files/';
export const LISTENING = 'Which of these misconceptions does the learner\'s message show?';
const FEEDBACK = 'Reviewer feedback (not from the user):';
const PICKING = 'You prepare a tutor\'s next reply.';
const MS = { draft: 1100, review: 1500, direct: 1300, listen: 450 };

const ASKS_ANSWER = /\b(answers?|tell me|just give|give me|solve|do it for me|write it for me)\b/i;
const ADDS_BOTTOMS = /\b(\d+\/\d+ *\+ *\d+\/\d+ *= *)?2\/5\b|\badd(ed|ing)?\b.*\b(bottoms?|denominators?)\b/i;
const EQUAL_TOPS = /Believes equal numerators mean equal fractions/;
const UNSAFE = /\b(hurt|kill)(ing)? (myself|me)\b|\bsuicid|\bwant to die\b/i;
const CARE = 'That sounds really hard, and I’m glad you said something. Please talk to a grown-up you trust today, like a parent, a teacher or a school counselor. You don’t have to handle this alone.';

const answerOf = (item) => (item?.answer?.choice ? item.choices?.find((choice) => choice.id === item.answer.choice)?.text : item?.answer?.accept?.[0]) ?? null;
const helpIn = (system) => Object.entries(HELP_LEVELS).find(([, says]) => system.includes(says))?.[0] ?? null;
const goalIn = (system) => /^Goal: (.+)$/m.exec(system)?.[1] ?? null;

// The fractions tutor: what makes the small drama. A draft that overreaches carries the reviewer's reason.
function tutor({ learner, help, item, prepared }) {
  const answer = answerOf(item);
  const hint = item?.hints?.[0] ?? 'Look for a number both bottom numbers go into.';
  const gives = answer ? `The answer is ${answer}. ${item.explanation ?? ''}`.trim() : 'Just add the tops and the bottoms and you’re done.';
  if (ADDS_BOTTOMS.test(learner)) {
    if (help === 'check_only') return [{ text: 'Look again at the bottom numbers. You added them, and they tell you the size of the pieces. What should stay the same when you add pieces?' }];
    if (prepared) return [{ text: 'Nice try. How did you get the 5 on the bottom? Think about what the bottom number tells you about the size of the pieces.' }];
    return [{ text: 'Nice try, and I can see what you did. You added the bottom numbers, but the bottom number tells you the size of the pieces. Can you cut 1/2 and 1/3 into pieces of the same size first?' }];
  }
  const worked = 'Here is one like it. To write 1/2 in sixths, ask what turns 2 into 6: times 3. Do the same to the top: 1 × 3 = 3. So 1/2 = 3/6. Now try yours the same way. What do you get?';
  const steps = {
    hint: { flaw: 'It gives the answer away. The teacher set this activity to hints, one step at a time.', then: `I won’t just tell you, because you can get this one. ${hint} What do you get?`, plain: `${hint} What do you notice?` },
    explain: { flaw: 'It works this very question for them. The teacher allows a worked example, and then a similar one for the learner to try.', then: worked, plain: worked },
    ask_first: { flaw: 'It helps before asking. The teacher wants the AI to ask first what the learner thinks or has tried.', then: 'Before I help: what have you tried so far? Even a guess is useful.', plain: 'Before I help: what have you tried so far? Even a guess is useful.' },
    check_only: { flaw: 'It explains something new. The teacher set this activity to checking only.', then: 'On this one I can only check your work. Tell me what you think it is and why, and I’ll say what’s right and what to look at again. What’s your answer?', plain: 'On this one I can only check your work. Tell me what you think it is and why, and I’ll say what’s right and what to look at again. What’s your answer?' }
  }[help] ?? { flaw: 'It gives the answer away.', then: `${hint} What do you get?`, plain: `${hint} What do you get?` };
  // Told before it writes what this moment calls for, the model doesn't overreach; left alone, the reviewer catches it.
  if (ASKS_ANSWER.test(learner)) return prepared ? [{ text: steps.then }] : [{ text: gives, flaw: steps.flaw }, { text: steps.then }];
  return [{ text: steps.plain }];
}

const byHelp = (help, lines) => lines[help] ?? lines.default;

function reader({ learner, help }) {
  if (ASKS_ANSWER.test(learner)) return [{ text: 'Those questions are yours to answer after you read, so I won’t give them away. Which sentence on this page do you think matters most?' }];
  if (/shadow|dark part/i.test(learner)) return [{ text: byHelp(help, {
    explain: 'Lots of people think so, but no. Half of the Moon is always lit by the Sun, and the dark part is the half facing away from it. Earth’s shadow only reaches the Moon in an eclipse. Does the figure on this page fit with that?',
    hint: 'Look at the figure on this page and find the Sun. Which side of the Moon does it light up?',
    check_only: 'Tell me what you think and point to the sentence you used. I’ll say what’s right and what to look at again.',
    default: 'Good thing to check. What do you think makes the dark part? Then find the sentence on this page that talks about Earth’s shadow.'
  }) }];
  if (/diagram|figure|picture/i.test(learner)) return [{ text: byHelp(help, {
    explain: 'The figure looks at the Moon from above. The Sun lights one half of it, and from Earth we see only part of that half. Which Moon in the figure would look full to us?',
    default: 'Let’s start with one part. Where is the Sun in the figure, and which side of the Moon is lit?'
  }) }];
  if (/about|mean|main/i.test(learner)) return [{ text: byHelp(help, {
    explain: 'This page says the Moon’s shape seems to change because we see different amounts of its sunlit half. What in your own sky could you check that against?',
    default: 'What do you think it’s mostly about, in your own words? Read the first sentence again and tell me what it makes you expect.'
  }) }];
  return [{ text: 'What did the text say about that? Find the sentence and read it to me, and we can go from there.' }];
}

function labCoach({ learner, help }) {
  if (/float|sink|why/i.test(learner)) return [{ text: byHelp(help, {
    explain: 'Compare two numbers on the screen: the block’s density and the liquid’s density. Here’s one you can check: a block of 0.5 g/mL in water, 1.0 g/mL, floats. What do your last two trials show?',
    default: 'What did you predict before you dropped it, and why? Look at your last two trials: what changed between them?'
  }) }];
  if (/next|try/i.test(learner)) return [{ text: 'Pick one thing to change and keep the rest the same. What would you change, and what do you predict will happen?' }];
  return [{ text: 'What did you expect to happen just now? Try one more and tell me if the result surprised you.' }];
}

function essayCoach({ learner }) {
  if (ASKS_ANSWER.test(learner) || /write|fix|rewrite/i.test(learner)) return [{ text: 'That part has to stay yours, so I won’t write it. Tell me the one sentence you most want a reader to believe, and I’ll tell you what’s working in it.' }];
  if (/claim/i.test(learner)) return [{ text: 'Check your first paragraph against the rubric’s “claim” row: does one sentence say what should change and why? Which sentence would you point to?' }];
  if (/evidence|reason/i.test(learner)) return [{ text: 'Look at each reason and find the fact or source under it. The rubric asks for evidence for every reason. Which reason has the least under it right now?' }];
  if (/other side|counter|fair/i.test(learner)) return [{ text: 'The rubric asks for an honest answer to the other side. Would someone who disagrees say you described their view fairly? Which sentence shows it?' }];
  return [{ text: 'Go through the rubric one row at a time and mark what you’d point to for each. Which row was hardest to find a sentence for?' }];
}

function cafe({ learner }) {
  const drink = /\b(coffee|tea|latte|juice|water|hot chocolate)\b/i.exec(learner)?.[1];
  const food = /\b(muffin|sandwich|cookie|bagel|croissant)\b/i.exec(learner)?.[1];
  const wants = /\bi want\b/i.test(learner);
  if (food) return [{ text: `${wants ? `You’d like a ${food}?` : `One ${food}.`} Sure! That’s six dollars, please. Anything else?` }];
  if (drink) return [{ text: `${wants ? `You’d like a ${drink}?` : `A ${drink}.`} Sure! Small or large?` }];
  if (/\b(small|large)\b/i.test(learner)) return [{ text: 'Great. Would you like something to eat? We have muffins and sandwiches.' }];
  if (/how much|price|cost/i.test(learner)) return [{ text: 'That’s six dollars in all. Would you like anything else?' }];
  if (/thank/i.test(learner)) return [{ text: 'You’re welcome! Have a nice day. See you next time.' }];
  return [{ text: 'Welcome! What would you like to drink today? We have coffee, tea and juice.' }];
}

// The research desk answers from the passages the Knowledge step found, by their numbers: the first
// sentence of the best passage from each of two guides.
function desk({ system, help }) {
  const found = new Map();
  for (const block of system.split(/\n(?=\[\d+\] )/).slice(1)) {
    const [, number, title] = /^\[(\d+)\] (.+?)(?: \(.*\))?\n/.exec(block) ?? [];
    if (!number || found.has(title)) continue;
    const sentence = block.split('\n').slice(1).filter((line) => line.trim() && !/^#|^\*.*\*$/.test(line.trim())).join(' ').replace(/[*_`]/g, '').match(/[^.!?]+[.!?]/)?.[0]?.trim();
    if (sentence) found.set(title, `${title}: ${sentence} [${number}]`);
  }
  const close = byHelp(help, { ask_first: 'What do you have so far?', hint: 'Which of these would you try first?', default: 'What will you look at next?' });
  return [{ text: `From the library’s guides. ${[...found.values()].slice(0, 2).join(' ')} ${close}`.trim() }];
}

const SCENES = [
  [/patient math tutor|--- Context Questions ---/, tutor],
  [/reading tutor/, reader],
  [/sink-or-float/, labCoach],
  [/writing coach/, essayCoach],
  [/server in a café/, cafe],
  [/research help desk/, desk]
];
const SCRIPTLESS = (learner) => [{ text: `This is demo mode, so this reply is scripted and no model read your agent’s instructions. To hear it for real, set OPENAI_API_KEY and start again. You wrote: “${learner}”` }];

/** Just as a reviewer would see them: the drafts for one turn. What the launcher shows, and the tests read. */
export function draftsFor({ system = '', learner = '', docs = [] }) {
  const vetted = system.includes('IMPORTANT SAFETY RULE');
  if (UNSAFE.test(learner)) return [{ text: `${vetted ? '[REQUIRES_ATTENTION] ' : ''}${CARE}` }];
  const items = docs.flatMap((doc) => (doc.question_sets || []).flatMap((set) => set.items || []));
  const item = items.find((entry) => entry.prompt && system.includes(`Text: ${entry.prompt}`)) ?? null;
  const help = helpIn(system);
  const scene = SCENES.find(([pattern]) => pattern.test(system))?.[1];
  const drafts = scene ? scene({ system, learner, help, item, prepared: /Right now: /.test(system) }) : SCRIPTLESS(learner);
  const goal = goalIn(system);
  const own = !goal || docs.some((doc) => (doc.course?.activities || []).some((activity) => activity.teaching?.goal === goal));
  // What a teacher adds shows: a new goal, and the misconception the example class's suggestion adds.
  const added = [own ? null : `Today’s goal: ${goal}`, !EQUAL_TOPS.test(system) ? null : 'Careful: two fractions with the same top number aren’t always the same size.'].filter(Boolean);
  return added.length ? drafts.map((draft) => (draft.flaw ? draft : { ...draft, text: `${draft.text}\n\n${added.join(' ')}` })) : drafts;
}

/** The scene the launcher shows: what the fractions tutor does when asked for the answer. */
export function sampleRounds(docs = []) {
  const item = docs.flatMap((doc) => (doc.question_sets || []).flatMap((set) => set.items || [])).find((entry) => entry.explanation && entry.hints?.length) ?? { answer: { accept: ['4/6'] }, explanation: 'Multiply the top and the bottom of 2/3 by 2.', hints: ['Multiply the top and the bottom by the same number.'] };
  const [first, second] = tutor({ learner: 'Just tell me the answer.', help: 'hint', item });
  return [{ attempt: 1, source: 'generated', verdict: 'fail', reply: first.text, feedback: first.flaw }, { attempt: 2, source: 'generated', verdict: 'pass', reply: second.text, feedback: null }];
}

const textOf = (content) => (Array.isArray(content) ? content.map((part) => part?.text ?? '').join(' ') : String(content ?? ''));
const reply = (content) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (!ms) return resolve();
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new Error('Stopped.')); }, { once: true });
});

/**
 * A fetch for the runtime. docs: the packages served, for their questions' hints and answers. files:
 * async (path under examples/files/) => bytes, for the examples' files. pace: how long each call takes,
 * as a share of a person's reading time; 0 for tests. Any other address goes to `pass`.
 */
export function demoModel({ docs = [], files = null, pace = 1, pass = (...args) => globalThis.fetch(...args) } = {}) {
  // What the writer got wrong, for the reviewer to catch: the two share a script, not a conversation.
  const flaws = new Map();
  return async (input, init = {}) => {
    const url = String(input?.url ?? input);
    if (files && url.startsWith(EXAMPLE_FILES)) {
      const bytes = await files(url.slice(EXAMPLE_FILES.length));
      return new Response(bytes, { status: bytes ? 200 : 404 });
    }
    if (!url.endsWith('/chat/completions')) return pass(input, init);
    const { messages = [] } = JSON.parse(init.body);
    const system = textOf(messages.find((message) => message.role === 'system')?.content);
    const users = messages.filter((message) => message.role === 'user').map((message) => textOf(message.content));
    if (system.startsWith(PICKING)) {
      await wait(MS.listen * pace, init.signal);
      const asked = users.at(-1) ?? '';
      const said = /^Learner: (.*)$/gm;
      const last = [...asked.matchAll(said)].at(-1)?.[1] ?? '';
      const moment = ASKS_ANSWER.test(last) ? 'asks_answer' : /\d\s*\/\s*\d/.test(last) ? 'attempt' : 'other';
      const list = asked.split('\n\nMisconceptions:\n')[1]?.split('\n\n')[0] ?? '';
      const fits = ADDS_BOTTOMS.test(last) ? [...list.matchAll(/^(\d+)\. (.+)$/gm)].filter(([, , text]) => /summing numerators and denominators/i.test(text)).map(([, number]) => Number(number)) : [];
      return reply(JSON.stringify({ moment, misconceptions: fits.slice(0, 1), components: [], prior: [] }));
    }
    if (system.startsWith(LISTENING)) {
      await wait(MS.listen * pace, init.signal);
      const found = ADDS_BOTTOMS.test(users.at(-1) ?? '') ? [...system.matchAll(/^(\d+)\. (.+)$/gm)].filter(([, , text]) => /\bdenominators?\b/i.test(text)).slice(0, 1).map(([, number]) => Number(number)) : [];
      return reply(JSON.stringify(found));
    }
    if (system.startsWith('You are an evaluation assistant')) {
      await wait(MS.review * pace, init.signal);
      const reviewed = /"([\s\S]*)"\s*$/.exec(users.at(-1) ?? '')?.[1] ?? '';
      return reply(flaws.has(reviewed) ? `FAILED: ${flaws.get(reviewed)}` : 'PASS');
    }
    const vetted = system.includes('IMPORTANT SAFETY RULE');
    await wait((vetted ? MS.draft : MS.direct) * pace, init.signal);
    const learner = users.filter((text) => !text.startsWith(FEEDBACK)).at(-1) ?? '';
    const drafts = draftsFor({ system, learner, docs });
    const round = users.filter((text) => text.startsWith(FEEDBACK)).length;
    const draft = drafts[Math.min(round, drafts.length - 1)];
    if (draft.flaw) {
      if (flaws.size > 500) flaws.clear();
      flaws.set(draft.text, draft.flaw);
    }
    return reply(draft.text);
  };
}
