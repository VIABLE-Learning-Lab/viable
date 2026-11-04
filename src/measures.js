/**
 * The research export's measures (src/utils/researchMetrics.js: each metric's definition, how it is
 * computed, why, caveats and sources), computed from one learner's learning events and turns
 * (schemas/learning-events.schema.json) instead of VIABLE's database.
 */
import { METRICS_VERSION, learnerMetrics, skillProgress } from './utils/researchMetrics.js';

export { AFTER, CITATIONS, MASTERY_STREAK, METRICS, METRICS_VERSION, PANELS, SESSION_GAP_MINUTES, SIGNALS, WHEEL_SPIN_ATTEMPTS, WRITING, deriveTurns, learnerMetrics, researchDefinitions, skillProgress } from './utils/researchMetrics.js';

const CORRECT = new Map([[true, true], [false, false], [1, true], [0, false]]);
const time = (value) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? Date.parse(value) : null);
const ordered = (events) => [...events].sort((a, b) => (time(a.at) ?? 0) - (time(b.at) ?? 0) || (a.seq ?? 0) - (b.seq ?? 0));

/**
 * Graded attempts, as the export's attempts: each graded Questions answer, and each answer an agent
 * graded (a turn's assessment). shortcut: a pre- or post-test's answers count too (VIABLE leaves them
 * out by the activity's role, which events don't carry); drop them before calling if you have both.
 */
export function attemptsOf(events = [], turns = []) {
  const answers = events.filter((event) => event?.type === 'questions.answer' && CORRECT.has(event.data?.correct))
    .map((event) => ({ skill: event.data.skill || event.data.set || 'questions', correct: CORRECT.get(event.data.correct), item: event.item ?? null, created_at: event.at ?? null }));
  const graded = turns.flatMap((turn) => [].concat(turn?.assessment ?? []).filter((item) => item?.skill && CORRECT.has(item.correct))
    .map((item) => ({ skill: String(item.skill), correct: CORRECT.get(item.correct), item: item.item ?? null, created_at: turn.started_at ?? null })));
  return [...answers, ...graded];
}

const SUMS = ['keys', 'deleted', 'pasted', 'pastes', 'pasted_from_ai', 'pauses', 'pause_ms', 'p_bursts', 'r_bursts', 'burst_chars', 'inside_edits', 'leading_edits', 'active_ms'];
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * How the learner wrote (WRITING), one row per panel and field (plan or draft), from writing events
 * as the export's writing.csv sums them. Words and length come from the latest event that reports
 * them (the export reads the saved draft instead).
 */
export function writingMeasures(events = []) {
  const rows = new Map();
  const firstView = new Map();
  const rubric = new Map();
  const row = (panel, field) => {
    const key = `${panel}|${field}`;
    if (!rows.has(key)) rows.set(key, { panel, field, ...Object.fromEntries(SUMS.map((name) => [name, 0])), longest_pause_ms: 0, snapshots: 0, words: null, chars: null, started_at: null });
    return rows.get(key);
  };
  for (const event of ordered(events)) {
    const panel = event.panel ?? 'app';
    const data = event.data || {};
    const at = time(event.at);
    if (event.type === 'panel.view' && at != null && !firstView.has(panel)) firstView.set(panel, at - (Number(data.visible_ms) || 0));
    if (event.type === 'writing.rubric') rubric.set(panel, { views: (rubric.get(panel)?.views || 0) + 1, ms: (rubric.get(panel)?.ms || 0) + (Number(data.visible_ms) || 0) });
    if (!['writing.progress', 'writing.snapshot', 'writing.start'].includes(event.type) || !data.field) continue;
    const r = row(panel, data.field);
    if (event.type === 'writing.start' && at != null && r.started_at == null) r.started_at = at;
    if (event.type === 'writing.snapshot') {
      r.snapshots += 1;
      if (typeof data.text === 'string') r.chars = data.text.length;
    }
    if (event.type === 'writing.progress') {
      for (const name of SUMS) r[name] += Number(data[name]) || 0;
      r.longest_pause_ms = Math.max(r.longest_pause_ms, Number(data.longest_pause_ms) || 0);
      if (Number.isFinite(data.chars)) r.chars = data.chars;
    }
    if (Number.isFinite(data.words)) r.words = data.words;
  }
  return [...rows.values()].map(({ started_at: startedAt, chars, ...r }) => {
    const produced = r.keys + r.pasted;
    const view = firstView.get(r.panel);
    return {
      ...r,
      started_after_ms: startedAt != null && view != null ? Math.max(0, startedAt - view) : null,
      mean_burst_chars: r.p_bursts ? round(r.burst_chars / r.p_bursts, 1) : null,
      product_process: produced && chars != null ? round(chars / produced, 3) : null,
      rubric_views: rubric.get(r.panel)?.views ?? 0,
      rubric_ms: rubric.get(r.panel)?.ms ?? 0
    };
  });
}

/** One learner's measures: the export's learner metrics, mastery per skill, and how they wrote. */
export function measureLearner({ events = [], turns = [] } = {}) {
  const attempts = attemptsOf(events, turns);
  return { version: METRICS_VERSION, metrics: learnerMetrics(turns, attempts), skills: skillProgress(attempts), writing: writingMeasures(events) };
}
