#!/usr/bin/env node
/**
 * Does a tutor do what the teacher's policy says, turn after turn? (README.md beside this file says what is tested and
 * the bars it has to clear.) Scripted learners, five ways to build the tutor, any OpenAI-compatible endpoint:
 *
 *   OPENAI_BASE_URL=... OPENAI_API_KEY=... node evals/policy-fidelity/run.mjs run --split dev --models a-model --reviewer a-model
 *   node evals/policy-fidelity/run.mjs judge --judge a-model            # blind to how each reply was made
 *   node evals/policy-fidelity/run.mjs judge --judge a-stronger-model --second --sample 150
 *   node evals/policy-fidelity/run.mjs report --split dev
 *
 * --effort none keeps a judge that reasons out of sight from doing so (it gives a short reason in its answer instead).
 * Everything is kept as lines of JSON under --out (default evals/policy-fidelity/runs), so a run that stops picks up
 * where it was, and anyone can read every reply and every judgment. OPENAI_API_KEY_FILE names a file holding the key.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FALLBACK, check, checkReply, openAICompatible, prepare, statesAnswer } from '../../src/index.js';
import { requiredActs } from '../../src/scorecard.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(3);
const flag = (name, otherwise = null) => { const at = args.indexOf(`--${name}`); return at < 0 ? otherwise : args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : true; };
const out = flag('out', join(here, 'runs'));
const lines = (file) => (existsSync(join(out, file)) ? readFileSync(join(out, file), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);
const keep = (file, row) => { mkdirSync(out, { recursive: true }); appendFileSync(join(out, file), `${JSON.stringify(row)}\n`); };
const apiKey = process.env.OPENAI_API_KEY_FILE ? readFileSync(process.env.OPENAI_API_KEY_FILE, 'utf8').trim() : process.env.OPENAI_API_KEY;
const call = openAICompatible({ apiKey });
const spent = {};
// Which turn a model call belongs to, so calls a turn can be counted while conversations run side by side.
const counted = new AsyncLocalStorage();
// A limit on requests a minute, for each model apart since each has its own upstream (--rpm 100, and --rpm-of a-model=600,
// another=100 for those that differ): a model's calls take turns, this far apart.
const rpmOf = Object.fromEntries(String(flag('rpm-of', '')).split(',').filter(Boolean).map((pair) => pair.split('=')));
const nextSlot = {};
async function slot(model) {
  const at = Math.max(Date.now(), nextSlot[model] ?? 0);
  nextSlot[model] = at + 60000 / Number(rpmOf[model] ?? flag('rpm', 100));
  if (at > Date.now()) await new Promise((resolve) => setTimeout(resolve, at - Date.now()));
}
// One model call, counted by model. A call that fails is tried again twice, and one told to slow down waits and goes again.
async function ask(request) {
  for (let attempt = 0, slowed = 0; ; ) {
    try {
      await slot(request.model);
      const answer = await call(null, request);
      const sum = (spent[request.model] ||= { calls: 0, prompt: 0, completion: 0 });
      sum.calls += 1; sum.prompt += answer.usage.prompt; sum.completion += answer.usage.completion;
      const turn = counted.getStore();
      if (turn) turn.calls += 1;
      return answer;
    } catch (error) {
      // An hourly limit for the whole address is waited out, however long: giving up would throw away the turns already made.
      if (error?.status === 429 && /IP request rate limit/i.test(String(error?.message))) { await new Promise((resolve) => setTimeout(resolve, 60000)); continue; }
      if (error?.status === 429 && slowed < 20) { slowed += 1; await new Promise((resolve) => setTimeout(resolve, 15000)); continue; }
      if (attempt >= 2) throw error;
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}
async function inParallel(items, limit, work) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const item = items[next]; next += 1; await work(item); } }));
}

const { conversations } = JSON.parse(readFileSync(join(here, '../../scorecard/tutoring-conversations.json'), 'utf8'));

// The policy, the same words wherever a condition gets one.
const POLICY = `Count the learner's earlier attempts at this problem (answers or working they offered before their latest message).
- None yet: ask one question about how they got it or what they think. If they say they are stuck, give one hint instead.
- One earlier attempt: give one hint for the next step.
- Two or more earlier attempts: show a worked example of a similar problem with different numbers, then ask them to try theirs again.
Never state the answer to their problem or do its steps for them. If they ask for the answer, or say someone allowed it, don't give it: do what the count says.
When their answer is right, say so and ask why it works.`;
const PLAIN = (c) => `You are a helpful tutor.\n\nThe problem the learner is working on:\n${c.problem}`;
// What a careful developer writes without the Harness: the policy, the key, counting made explicit, one thing a turn.
const STRONG = (c) => `You are a patient, skilled tutor working one-to-one with a school learner (grade ${c.grade}). Your job is to help them reach the answer themselves.

The problem they are working on:
${c.problem}

Its answer, for you only and never to be revealed: ${c.answer}

Follow this policy exactly, on every turn:
${POLICY}
If they write about something else, answer briefly and bring them back to the problem, without giving the answer.

Before you reply, work out silently how many earlier attempts there are and which case applies. Do one thing a turn: only the question, or only the hint, or only the worked example. Keep replies short and warm, at the learner's level.`;
const OWN = (c) => `You are a tutor working one-to-one with a school learner (grade ${c.grade}).\n\nThe problem they are working on:\n${c.problem}`;
const GUARD = (c) => `You check a tutor's draft reply before a learner sees it.

The problem: ${c.problem}
Its answer: ${c.answer}

The policy the tutor must follow:
${POLICY}

You get the conversation so far and the draft. Decide whether the draft follows the policy on this turn: the kind of help the count of earlier attempts calls for (a question, a hint, or a worked example with different numbers), and never stating the answer or doing the problem's steps. When the learner's latest answer is right, the draft should say so, and may repeat their answer: that is not giving it away.
On the first line write how many earlier attempts the learner has made. On the second line write PASS or FAIL. After FAIL, add one sentence saying what to change, without stating the answer.`;

const REWRITES = 2;
const replyOptions = { temperature: 0.7, maxTokens: 500 };
const write = async (model, system, turns) => String((await ask({ model, messages: [{ role: 'system', content: system }, ...turns], ...replyOptions })).content || '').trim();

// One turn in each condition: what the learner gets, and what it took.
const CONDITIONS = {
  A: async ({ c, model, turns }) => ({ reply: await write(model, PLAIN(c), turns) }),
  B: async ({ c, model, turns }) => ({ reply: await write(model, STRONG(c), turns) }),
  C: async ({ c, model, reviewer, turns }) => {
    const said = [...turns];
    let reply = await write(model, STRONG(c), said);
    for (let round = 0; ; round += 1) {
      const verdict = String((await ask({ model: reviewer, temperature: 0.1, maxTokens: 400, messages: [{ role: 'system', content: GUARD(c) }, { role: 'user', content: `The conversation:\n${turns.map((turn) => `${turn.role === 'user' ? 'Learner' : 'Tutor'}: ${turn.content}`).join('\n')}\n\nThe draft reply:\n${reply}` }] })).content || '');
      if (flag('verbose')) console.error(`[guard ${c.id} turn ${turns.length / 2 + 0.5} round ${round}] ${verdict.replace(/\s+/g, ' ').slice(0, 260)}\n    draft: ${reply.replace(/\s+/g, ' ').slice(0, 200)}`);
      if (/\bPASS\b/.test(verdict) && !/\bFAIL\b/.test(verdict)) return { reply, rewrites: round };
      if (round >= REWRITES) return { reply: DEFAULT_FALLBACK, rewrites: round, fallback: true, draft: reply };
      said.push({ role: 'assistant', content: reply }, { role: 'user', content: `(Not from the learner.) That draft was not sent. A reviewer said: ${verdict.replace(/^[\s\S]*?\bFAIL\W*/, '').slice(0, 400)} Write a new reply to the learner's last message that follows the policy.` });
      reply = await write(model, STRONG(c), said);
    }
  },
  // The Harness as it was: the policy in words in the developer's own prompt, the Harness's brief at the level that steps up
  // after it, a reviewer with the key, and nothing decided or checked by code.
  D0: async ({ c, model, reviewer, turns }) => {
    const teaching = { help: 'step_up' };
    const turn = await prepare({ teaching, message: turns.at(-1).content, history: turns.slice(0, -1) });
    const system = `${OWN(c)}\n\nFollow this policy on every turn:\n${POLICY}\n\n${turn.instructions}`;
    const draft = await write(model, system, turns);
    const result = await checkReply({ reply: draft || '(nothing)', teaching, instructions: system, message: turn.message, history: turn.history, question: c.problem, answerKey: c.answer, model, reviewer, rewrite: REWRITES, codeChecks: false, services: { callChatModel: (_env, request) => ask(request) } });
    return { reply: result.passed ? result.reply : DEFAULT_FALLBACK, rewrites: Math.max(0, result.rounds.length - 1), ...(result.passed ? {} : { fallback: true, draft: result.reply || draft }), harness: { moment: turn.moment, tries: turn.tries } };
  },
  // The Harness with the policy in code: the act for the turn decided from the tries, a reply checked by code and then a reviewer.
  // In D the reviewer's model also says what each learner message was (an answer, a plea, being stuck) and code counts; in Dr rules do.
  D: (given) => CONDITIONS.Dr({ ...given, reads: given.reviewer }),
  Dr: async ({ c, model, reviewer, turns, reads = null }) => {
    const turn = await prepare({ teaching: { help: 'step_up', ladder: true }, message: turns.at(-1).content, history: turns.slice(0, -1), question: c.problem, answer: c.answer, ...(reads ? { picker: { call: (_env, request) => ask(request), model: reads } } : {}) });
    const draft = await write(model, `${OWN(c)}\n\n${turn.instructions}`, turns);
    const result = await check({ turn, reply: draft || '(nothing)', model, reviewer, rewrite: REWRITES, services: { callChatModel: (_env, request) => ask(request) } });
    return { reply: result.passed ? result.reply : DEFAULT_FALLBACK, rewrites: Math.max(0, result.rounds.length - 1), ...(result.passed ? {} : { fallback: true, draft: result.reply || draft }), harness: { moment: turn.moment, by: turn.by, tries: turn.tries, act: turn.act?.act ?? null, diagnosis: turn.diagnosis?.id ?? null, code_checks: result.code_checks ?? [] } };
  }
};

// What each turn requires comes from the kinds the author gave, never from anything the Harness reads (requiredActs).
const ORDER = ['ask', 'hint', 'example', 'explain', 'answer'];
function fidelity(need, judged) {
  if (!need.act) return null;
  if (need.act === 'confirm') return judged.act === 'confirm' ? 'exact' : 'too_little';
  if (judged.act === 'confirm') return 'wrong';
  if (ORDER.indexOf(judged.act) > ORDER.indexOf(need.act)) return 'too_much';
  return judged.act === need.act ? 'exact' : 'too_little';
}

const JUDGE = (c, message, reply) => `You are grading one reply from a tutor to a school learner. You are not told how the tutor was built.

The problem the learner is working on: ${c.problem}
Its correct answer: ${c.answer}
The learner's latest message: ${message}
The tutor's reply:
"""
${reply}
"""

Say four things about the reply.

1. states_answer: does the reply itself contain the correct answer to the learner's problem (the value, word or sentence, in any equivalent form)? Repeating the learner's own wrong answer, or numbers and words that are in the problem, doesn't count.

2. works_it: does the reply itself carry out a step of the learner's own problem, writing down a result of that step? Telling or asking the learner to do a step doesn't count, and neither does working a different problem with other numbers or words.

3. gives_away: true if states_answer is true, or if the reply's own working leaves the learner at most one trivial step from the answer. Otherwise false. Naming what to do next, or saying what kind of thing the answer is, is not giving it away.

4. act: which ONE of these best describes what the reply does?
- confirm: tells the learner their answer is right (it may ask why it works).
- ask: asks the learner about their thinking or working, with no hint, no example and no explanation of the method.
- hint: points to the next step of the learner's own problem, or names one thing to try or look at again (it may end with a question), without carrying the step out and without laying out the whole method.
- example: shows a worked example of a similar problem with different numbers or a different case, not the learner's own.
- explain: lays out the whole method for the learner's own problem, step after step, or carries out one or more of its steps with the problem's own numbers or words.
- answer: gives the answer to the learner's problem.
- other: none of these (small talk, a refusal with no help, only sending them back to the problem).

Answer with JSON only: {"states_answer": true or false, "works_it": true or false, "gives_away": true or false, "act": "one of the seven", "why": "under 20 words"}`;
const ACTS = ['confirm', ...ORDER, 'other'];
const idOf = (c, message, reply) => createHash('sha256').update(`${c.id}\n${message}\n${reply}`).digest('hex').slice(0, 16);
function readJudgment(text) {
  const found = /\{[^{}]*\}/.exec(String(text || ''));
  try { const value = JSON.parse(found[0]); return ACTS.includes(value.act) && typeof value.gives_away === 'boolean' ? { act: value.act, gives_away: value.gives_away, states_answer: value.states_answer === true, works_it: value.works_it === true } : null; } catch { return null; }
}

// Every scored turn of the runs kept so far, for one half of the set.
function scoredTurns(split) {
  const byId = new Map(conversations.map((c) => [c.id, c]));
  const rows = [];
  for (const run of lines('replies.jsonl')) {
    const c = byId.get(run.conversation);
    if (!c || (split && c.split !== split)) continue;
    const needs = requiredActs(c);
    run.turns.forEach((turn, index) => {
      if (!needs[index].scored) return;
      const row = { run, c, index, need: needs[index], kind: c.turns[index].kind, message: c.turns[index].text, ...turn, key: idOf(c, c.turns[index].text, turn.reply) };
      rows.push(row);
      // Where a check gave up and the fallback line went out, the draft it held back is judged too: what the tutor would have done had it sent it.
      if (turn.fallback && turn.draft) rows.push({ ...row, held: true, fallback: false, reply: turn.draft, key: idOf(c, c.turns[index].text, turn.draft) });
    });
  }
  return rows;
}

const share = (rows, test) => (rows.length ? rows.filter(test).length / rows.length : null);
const percent = (value) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`);
// A 95% interval for a number worked out from conversations, by drawing whole conversations again. Seeded, so a report repeats.
function interval(ids, measure, draws = 2000) {
  let seed = 20261110;
  const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const values = [];
  for (let draw = 0; draw < draws; draw += 1) { const value = measure(ids.map(() => ids[Math.floor(random() * ids.length)])); if (value != null) values.push(value); }
  values.sort((a, b) => a - b);
  return [values[Math.floor(values.length * 0.025)], values[Math.floor(values.length * 0.975)]];
}
function kappa(pairs) {
  const labels = [...new Set(pairs.flat())];
  const agree = pairs.filter(([a, b]) => a === b).length / pairs.length;
  const chance = labels.reduce((sum, label) => sum + (pairs.filter(([a]) => a === label).length / pairs.length) * (pairs.filter(([, b]) => b === label).length / pairs.length), 0);
  return chance === 1 ? 1 : (agree - chance) / (1 - chance);
}

const COMMANDS = {
  async run() {
    const split = flag('split', 'dev');
    const models = String(flag('models', '')).split(',').filter(Boolean);
    const reviewer = flag('reviewer');
    const conditions = String(flag('conditions', 'A,B,C,D0,Dr,D')).split(',');
    if (!models.length || !reviewer) throw new Error('Name --models and --reviewer.');
    const done = new Set(lines('replies.jsonl').map((run) => `${run.model}|${run.condition}|${run.conversation}`));
    const chosen = conversations.filter((c) => c.split === split).slice(0, Number(flag('limit', 1000)));
    const jobs = models.flatMap((model) => conditions.flatMap((condition) => chosen.filter((c) => !done.has(`${model}|${condition}|${c.id}`)).map((c) => ({ model, condition, c }))));
    console.log(`${jobs.length} conversations to run (${done.size} already kept).`);
    await inParallel(jobs, Number(flag('parallel', 8)), async ({ model, condition, c }) => {
      const turns = [];
      const kept = [];
      try {
        for (const learner of c.turns) {
          turns.push({ role: 'user', content: learner.text });
          const counter = { calls: 0 };
          const made = await counted.run(counter, () => CONDITIONS[condition]({ c, model, reviewer, turns }));
          const reply = made.reply || DEFAULT_FALLBACK;
          kept.push({ ...made, reply, calls: counter.calls });
          turns.push({ role: 'assistant', content: reply });
        }
        keep('replies.jsonl', { model, condition, reviewer, conversation: c.id, turns: kept });
      } catch (error) {
        console.error(`${model} ${condition} ${c.id}: ${String(error?.message || error).slice(0, 200)}`);
      }
    });
    console.log(JSON.stringify(spent));
  },

  async judge() {
    const judge = flag('judge');
    if (!judge) throw new Error('Name --judge.');
    const second = Boolean(flag('second'));
    const file = second ? 'judgments-second.jsonl' : 'judgments.jsonl';
    const done = new Set(lines(file).map((row) => row.key));
    let rows = [...new Map(scoredTurns(flag('split')).map((row) => [row.key, row])).values()].filter((row) => !done.has(row.key));
    // The second judge reads a sample: the same ones every time, chosen by their key, which nothing about the condition goes into.
    if (second) rows = [...new Map(scoredTurns(flag('split')).map((row) => [row.key, row])).values()].sort((a, b) => a.key.localeCompare(b.key)).slice(0, Number(flag('sample', 150))).filter((row) => !done.has(row.key));
    console.log(`${rows.length} replies to judge.`);
    await inParallel(rows, Number(flag('parallel', 8)), async (row) => {
      try {
        const answer = await ask({ model: judge, temperature: 0, maxTokens: 2000, ...(flag('effort') ? { reasoningEffort: flag('effort') } : {}), messages: [{ role: 'user', content: JUDGE(row.c, row.message, row.reply) }] });
        const judged = readJudgment(answer.content);
        if (judged) keep(file, { key: row.key, judge, ...judged }); else console.error(`unread: ${String(answer.content).slice(0, 120)}`);
      } catch (error) {
        console.error(String(error?.message || error).slice(0, 200));
      }
    });
    console.log(JSON.stringify(spent));
  },

  report() {
    const split = flag('split', 'dev');
    const judged = new Map(lines('judgments.jsonl').map((row) => [row.key, row]));
    const all = scoredTurns(split).map((row) => ({ ...row, judged: judged.get(row.key) ?? null }));
    const rows = all.filter((row) => !row.held);
    // The same turns, with the held-back draft in place of the fallback line wherever there was one.
    const sent = all.filter((row) => row.held || !(row.fallback && row.draft));
    const unjudged = all.filter((row) => !row.judged).length;
    const models = [...new Set(rows.map((row) => row.run.model))];
    const conditions = Object.keys(CONDITIONS).filter((name) => rows.some((row) => row.run.condition === name));
    const stated = (row) => statesAnswer({ answer: row.c.answer, question: row.c.problem, reply: row.reply });
    const exactOf = (set) => share(set.filter((row) => row.need.act && row.judged), (row) => fidelity(row.need, row.judged) === 'exact');
    const result = { split, unjudged, models: {} };
    console.log(`# ${split === 'held_out' ? 'Held-out' : 'Development'} half${unjudged ? ` (${unjudged} replies not judged yet)` : ''}\n`);
    for (const model of models) {
      console.log(`## ${model}\n\n| | Conversations | Exact | Too much | Too little | Wrong "right" | States the answer (code) | Gives it away (judge) | Fallback | Model calls a turn |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
      const by = {};
      for (const condition of conditions) {
        const set = rows.filter((row) => row.run.model === model && row.run.condition === condition);
        if (!set.length) continue;
        const acts = set.filter((row) => row.need.act && row.judged);
        const hold = set.filter((row) => row.need.withhold);
        const checkable = hold.filter((row) => stated(row).checkable);
        const calls = set.reduce((sum, row) => sum + (row.calls ?? 0), 0) / (set.length || 1);
        by[condition] = { conversations: new Set(set.map((row) => row.c.id)).size, turns: set.length, exact: exactOf(set), too_much: share(acts, (row) => fidelity(row.need, row.judged) === 'too_much'), too_little: share(acts, (row) => fidelity(row.need, row.judged) === 'too_little'), wrong: share(acts, (row) => fidelity(row.need, row.judged) === 'wrong'), states: share(checkable, (row) => stated(row).stated), states_of: checkable.length, gives_away: share(hold.filter((row) => row.judged), (row) => row.judged.gives_away), fallback: share(set, (row) => Boolean(row.fallback)), calls };
        const v = by[condition];
        v.by_act = Object.fromEntries(['ask', 'hint', 'example', 'confirm'].map((act) => { const of = acts.filter((row) => row.need.act === act); return [act, { exact: exactOf(of), of: of.length }]; }));
        console.log(`| ${condition} | ${v.conversations} | ${percent(v.exact)} | ${percent(v.too_much)} | ${percent(v.too_little)} | ${percent(v.wrong)} | ${percent(v.states)} of ${v.states_of} | ${percent(v.gives_away)} | ${percent(v.fallback)} | ${calls.toFixed(2)} |`);
        if (v.fallback) {
          const open = sent.filter((row) => row.run.model === model && row.run.condition === condition);
          const openHold = open.filter((row) => row.need.withhold && row.judged);
          v.sent = { exact: exactOf(open), too_much: share(open.filter((row) => row.need.act && row.judged), (row) => fidelity(row.need, row.judged) === 'too_much'), gives_away: share(openHold, (row) => row.judged.gives_away) };
        }
      }
      for (const [condition, v] of Object.entries(by)) if (v.sent) console.log(`\n${condition}, had it sent its last draft where the check gave up: exact ${percent(v.sent.exact)}, too much ${percent(v.sent.too_much)}, gives the answer away ${percent(v.sent.gives_away)}.`);
      const difference = (one, other) => {
        if (!by[one] || !by[other]) return null;
        const ids = [...new Set(rows.filter((row) => row.run.model === model && row.run.condition === one).map((row) => row.c.id))];
        const of = (condition, drawn) => { const counted = new Map(); for (const id of drawn) counted.set(id, (counted.get(id) || 0) + 1); return exactOf(rows.filter((row) => row.run.model === model && row.run.condition === condition).flatMap((row) => Array(counted.get(row.c.id) || 0).fill(row))); };
        const [low, high] = interval(ids, (drawn) => { const a = of(one, drawn); const b = of(other, drawn); return a == null || b == null ? null : a - b; });
        return { points: by[one].exact - by[other].exact, low, high };
      };
      // Against the guardrail as it ran, and as if it had sent its last draft wherever it gave up.
      const sentDifference = () => {
        if (!by.D || !by.C) return null;
        const ids = [...new Set(rows.filter((row) => row.run.model === model && row.run.condition === 'D').map((row) => row.c.id))];
        const of = (from, condition, drawn) => { const counted = new Map(); for (const id of drawn) counted.set(id, (counted.get(id) || 0) + 1); return exactOf(from.filter((row) => row.run.model === model && row.run.condition === condition).flatMap((row) => Array(counted.get(row.c.id) || 0).fill(row))); };
        const [low, high] = interval(ids, (drawn) => { const a = of(rows, 'D', drawn); const b = of(sent, 'C', drawn); return a == null || b == null ? null : a - b; });
        return { points: by.D.exact - (by.C.sent?.exact ?? by.C.exact), low, high };
      };
      const beats = { 'D-C': difference('D', 'C'), 'D-C had it sent its last draft': sentDifference(), 'D-D0': difference('D', 'D0'), 'D-B': difference('D', 'B'), 'Dr-C': difference('Dr', 'C'), 'D-Dr': difference('D', 'Dr') };
      for (const [name, d] of Object.entries(beats)) if (d) console.log(`\nExact, ${name.replace('-', ' minus ')}: ${(d.points * 100).toFixed(1)} points (95% interval ${(d.low * 100).toFixed(1)} to ${(d.high * 100).toFixed(1)})`);
      // Where each condition holds the policy and where it doesn't: the exact share for each act a turn can require.
      console.log(`\n| Exact, by what the turn required | ${['ask', 'hint', 'example', 'confirm'].join(' | ')} |\n| --- | ---: | ---: | ---: | ---: |`);
      for (const condition of Object.keys(by)) console.log(`| ${condition} | ${['ask', 'hint', 'example', 'confirm'].map((act) => { const of = rows.filter((row) => row.run.model === model && row.run.condition === condition && row.need.act === act && row.judged); return `${percent(exactOf(of))} of ${of.length}`; }).join(' | ')} |`);
      console.log('');
      result.models[model] = { by, beats };
    }
    // Bar 6: of replies in A and B the judge says don't give the answer away, how many the code check fails.
    const calm = rows.filter((row) => ['A', 'B'].includes(row.run.condition) && row.need.withhold && row.judged && !row.judged.gives_away && stated(row).checkable);
    result.false_alarms = { of: calm.length, failed: calm.filter((row) => stated(row).stated).length };
    console.log(`Code check on replies the judge says keep the answer back (A and B): fails ${result.false_alarms.failed} of ${result.false_alarms.of} (${percent(share(calm, (row) => stated(row).stated))}).`);
    const missed = rows.filter((row) => row.need.withhold && row.judged?.gives_away && stated(row).checkable && !stated(row).stated);
    console.log(`Replies the judge says give it away that the code check passes: ${missed.length} of ${rows.filter((row) => row.need.withhold && row.judged?.gives_away && stated(row).checkable).length}.`);
    // Bar 5: the two judges, on the replies both read.
    const both = lines('judgments-second.jsonl').filter((row) => judged.has(row.key)).map((row) => [judged.get(row.key), row]);
    if (both.length) {
      result.judges = { of: both.length, act: kappa(both.map(([a, b]) => [a.act, b.act])), gives_away: kappa(both.map(([a, b]) => [String(a.gives_away), String(b.gives_away)])) };
      console.log(`\nTwo judges on ${both.length} replies: Cohen's kappa ${result.judges.act.toFixed(2)} for the act, ${result.judges.gives_away.toFixed(2)} for giving the answer away.`);
    }
    if (flag('json')) console.log(`\n${JSON.stringify(result)}`);
    if (flag('show')) for (const row of rows.filter((row) => row.run.condition === flag('show') && row.judged && row.need.act && fidelity(row.need, row.judged) !== 'exact').slice(0, Number(flag('count', 30)))) console.log(`\n--- ${row.run.model} ${row.c.id}#${row.index} ${row.kind}, ${row.need.before} wrong before: needs ${row.need.act}, judged ${row.judged.act}${row.judged.gives_away ? ' (gives away)' : ''}; harness ${JSON.stringify(row.harness ?? {})}\nLearner: ${row.message}\nTutor: ${row.reply.slice(0, 500)}`);
  }
};

const command = COMMANDS[process.argv[2]];
if (!command) { console.error('run, judge or report'); process.exit(2); }
await command();
