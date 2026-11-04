/**
 * The loop's fourth step: from the evidence, suggested changes to How the AI helps, each with the
 * evidence beside it, for the teacher to accept, edit or decline. Rules over what runs and learner
 * records carry, no model, so every suggestion says exactly why it was made. Accepting one
 * (applySuggestion) gives new teaching settings; on VIABLE they become the activity's next version.
 * A suggestion is never a finding about learning: it says what the records show and what to try.
 */
import { measureLearner } from './measures.js';
import { HELP_LEVELS, TEACHING_LIMITS, teachingSettings } from './utils/teaching.js';
import { misconceptionById } from './utils/misconceptions.js';

// Help levels from the least help to the most.
export const HELP_ORDER = ['check_only', 'ask_first', 'hint', 'explain'];
// First values, to revisit with teachers: below these counts a share says too little to act on.
export const SUGGESTION_THRESHOLDS = { runs: 5, give_away: 0.3, unverified: 0.2, learners: 3, stuck: 0.4 };
// A reviewer's reason that says the draft gave the answer or the work away.
const GIVE_AWAY = /\b(answer|solution|solves?|solved|gives? (?:it )?away|reveal|states? the|does the work|for (?:the|them|the learner))\b/i;

const clip = (value, max = 200) => { const text = String(value || '').replace(/\s+/g, ' ').trim(); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };
const share = (part, whole) => `${part} of ${whole} (${Math.round((100 * part) / whole)}%)`;
const levelName = (level) => (level ? `“${level.replace('_', ' ')}”` : 'none set');

// The VETTING steps of each run that had one: its first round, its last outcome.
function reviews(runs) {
  return runs.map((run, index) => {
    const steps = (run?.steps || []).filter((step) => step?.nodeType === 'vetting' && step.output);
    if (!steps.length) return null;
    const rounds = steps.flatMap((step) => step.output.attempt_details || []);
    const message = steps[0].input?.message ?? run.steps.find((step) => step?.nodeType === 'input')?.output?.message;
    return { index, first: rounds[0] || null, outcome: steps.at(-1).output.outcome, message: typeof message === 'string' ? message : null };
  }).filter(Boolean);
}

// Learners by the pseudonymous id their records carry; records with one id are one learner.
function learnersOf(records) {
  const byUser = new Map();
  records.forEach((record, index) => {
    const id = record?.user || `record ${index + 1}`;
    const learner = byUser.get(id) || { id, group: record?.learner_group || null, events: [], turns: [] };
    learner.events.push(...(record?.events || []));
    learner.turns.push(...(record?.turns || []));
    byUser.set(id, learner);
  });
  return [...byUser.values()];
}

// Misconceptions a record names: a turn's misconceptions (ids, or { id, description }) and an event's
// data.misconception, as the teacher view reads them.
function heard(learners) {
  const found = new Map();
  for (const learner of learners) {
    const named = [...learner.turns.flatMap((turn) => [].concat(turn?.misconceptions ?? [])), ...learner.events.map((event) => event?.data?.misconception)];
    for (const item of named) {
      const id = String((typeof item === 'object' ? item?.id : item) ?? '').trim().toLowerCase();
      if (!id) continue;
      const entry = found.get(id) || { id, description: typeof item?.description === 'string' ? item.description : null, learners: new Set() };
      entry.learners.add(learner.id);
      found.set(id, entry);
    }
  }
  return [...found.values()];
}

function answersGivenAway(settings, checked, limits) {
  if (checked.length < limits.runs) return [];
  const away = checked.filter((item) => item.first?.verdict === 'fail' && GIVE_AWAY.test(item.first.feedback || ''));
  if (away.length / checked.length < limits.give_away) return [];
  const current = settings?.help ?? null;
  const lower = current ? HELP_ORDER[HELP_ORDER.indexOf(current) - 1] : 'hint';
  const evidence = [
    `${share(away.length, checked.length)} replies VETTING reviewed failed their first review for giving too much away.`,
    ...away.slice(0, 3).map((item) => `Run ${item.index + 1}, the reviewer: “${clip(item.first.feedback)}”`)
  ];
  if (!lower) {
    return [{ id: 'answers_given_away', rule: 'answers_given_away', patch: null, evidence,
      change: 'Look at why drafts give too much away: the help level is already the least (“check only”).',
      why: 'Drafts keep going further than the reviewer allows even at the least help; the guideline, the reply step’s instructions or the questions learners ask may be why.' }];
  }
  return [{ id: 'answers_given_away', rule: 'answers_given_away', patch: { help: lower }, evidence,
    change: `Lower how far the AI helps, from ${levelName(current)} to ${levelName(lower)}.`,
    why: `Drafts keep going further than the reviewer allows, so they are rewritten or replaced. At ${levelName(lower)} the AI is told: ${HELP_LEVELS[lower]}` }];
}

function repliesUnverified(checked, limits) {
  if (checked.length < limits.runs) return [];
  const failed = checked.filter((item) => item.outcome === 'unverified');
  if (failed.length / checked.length < limits.unverified) return [];
  return [{ id: 'replies_unverified', rule: 'replies_unverified', patch: null,
    change: 'Read the replies that never passed review, and decide what to change.',
    why: 'When no draft passes, the learner gets the agent’s fallback instead of help. The rounds show whether the guideline, the help level or the questions asked are the cause.',
    evidence: [`${share(failed.length, checked.length)} replies ended unverified.`, ...failed.slice(0, 3).map((item) => `Run ${item.index + 1}${item.message ? `, “${clip(item.message, 120)}”` : ''}`)] }];
}

function misconceptionsHeard(settings, learners, limits) {
  const chosen = new Set((settings?.misconceptions || []).map((item) => item.id));
  const room = TEACHING_LIMITS.misconceptions - chosen.size;
  return heard(learners).filter((item) => !chosen.has(item.id) && item.learners.size >= limits.learners)
    .sort((a, b) => b.learners.size - a.learners.size)
    .map((item, index) => {
      const known = misconceptionById(item.id);
      const description = known?.description || item.description || item.id;
      const evidence = [`Named in the records of ${item.learners.size} of ${learners.length} learners.`];
      const add = known && index < room;
      return {
        id: `misconception_heard:${item.id}`, rule: 'misconception_heard',
        patch: add ? { misconceptions: [...(settings?.misconceptions || []), known] } : null,
        change: add ? `Listen for “${clip(description, 160)}”.` : `Look at “${clip(description, 160)}”, heard from several learners.`,
        why: add ? 'Learners keep showing it, and the AI isn’t told to listen for it; with it on the list, the reply steps are told to notice it and respond to it.'
          : known ? `The activity already lists ${TEACHING_LIMITS.misconceptions} misconceptions, the most it keeps; replace one if this matters more.` : 'It isn’t in the Eedi copy the harness carries, so it can’t be added as it is.',
        evidence
      };
    });
}

function stuckOnASkill(settings, learners, limits) {
  const bySkill = new Map();
  for (const learner of learners) {
    for (const skill of measureLearner({ events: learner.events, turns: learner.turns }).skills || []) {
      if (!skill.attempts) continue;
      const entry = bySkill.get(skill.skill) || { skill: skill.skill, tried: [], stuck: [] };
      entry.tried.push(learner);
      if (skill.wheel_spinning) entry.stuck.push(learner);
      bySkill.set(skill.skill, entry);
    }
  }
  return [...bySkill.values()].filter((entry) => entry.stuck.length >= limits.learners && entry.stuck.length / entry.tried.length >= limits.stuck).map((entry) => {
    const groups = new Set(entry.stuck.map((learner) => learner.group));
    const section = groups.size === 1 && /^sec_[A-Za-z0-9_-]{1,64}$/.test([...groups][0] || '') ? [...groups][0] : null;
    const current = (section && settings?.sections?.[section]?.help) || settings?.help || null;
    const higher = current ? HELP_ORDER[HELP_ORDER.indexOf(current) + 1] : 'hint';
    const evidence = [`${share(entry.stuck.length, entry.tried.length)} learners who answered “${entry.skill}” are wheel-spinning on it: many attempts without mastery.`];
    if (section) evidence.push(`All of them are in section ${section}.`);
    const id = `stuck_on_a_skill:${entry.skill}${section ? `:${section}` : ''}`;
    if (!higher) {
      return { id, rule: 'stuck_on_a_skill', patch: null, evidence,
        change: `Look at how learners are helped with “${entry.skill}”: the help level is already the most (“explain”).`,
        why: 'More attempts aren’t leading to mastery even with explanations and worked examples; a different task, or a teacher’s own help, may be what they need.' };
    }
    const patch = section
      ? { sections: { ...(settings?.sections || {}), [section]: { ...(settings?.sections?.[section] || {}), help: higher } } }
      : { help: higher };
    return { id, rule: 'stuck_on_a_skill', patch, evidence,
      change: `${section ? `For section ${section}, raise` : 'Raise'} how far the AI helps, from ${levelName(current)} to ${levelName(higher)}.`,
      why: `Learners keep trying without getting there. At ${levelName(higher)} the AI is told: ${HELP_LEVELS[higher]}` };
  });
}

/**
 * Suggested changes to an activity's teaching settings from runs (run --json traces: their VETTING
 * rounds) and learner records (misconceptions they name, skill measures). Returns
 * [{ id, rule, change, why, evidence: [...], patch }]; patch is null when the suggestion asks the
 * teacher to look rather than proposing a setting.
 */
export function suggestChanges({ teaching = null, runs = [], records = [] } = {}, thresholds = {}) {
  const limits = { ...SUGGESTION_THRESHOLDS, ...thresholds };
  const settings = teachingSettings(teaching);
  const checked = reviews(runs);
  const learners = learnersOf(records);
  return [
    ...answersGivenAway(settings, checked, limits),
    ...repliesUnverified(checked, limits),
    ...misconceptionsHeard(settings, learners, limits),
    ...stuckOnASkill(settings, learners, limits)
  ];
}

/** The teaching settings with a suggestion accepted; throws for one that only asks the teacher to look. */
export function applySuggestion(teaching, suggestion) {
  if (!suggestion?.patch) throw Object.assign(new Error('This suggestion proposes no setting: it asks the teacher to look at the evidence.'), { status: 400, code: 'nothing_to_apply' });
  return teachingSettings({ ...(teachingSettings(teaching) || {}), ...suggestion.patch });
}
