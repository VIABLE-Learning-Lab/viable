/**
 * What VIABLE measures about learners, in one place: the signals the chat page records about how
 * each message was written and what the learner did with the answer, and the metrics computed
 * from turns. Every field and metric carries its definition, how it is computed, why it is used
 * and its caveats, with sources; the dashboard's "How it's computed" notes and the research
 * export's data dictionary are built from this file, so what a number means is stated once.
 * Signals are counts and timings only: never keystrokes, drafts or anything typed but not sent.
 */

export const METRICS_VERSION = '2026-10-26';

export const CITATIONS = {
  kovanovic2015: { text: 'Kovanović, V., Gašević, D., Dawson, S., Joksimović, S., Baker, R. S., & Hatala, M. (2015). Does time-on-task estimation matter? Implications on validity of learning analytics findings. Journal of Learning Analytics, 2(3), 81–110.', url: 'https://doi.org/10.18608/jla.2015.23.6' },
  bastani2025: { text: 'Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö., & Mariman, R. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. PNAS, 122(26).', url: 'https://doi.org/10.1073/pnas.2422633122' },
  oreopoulos2026: { text: 'Oreopoulos, P., & Low, N. (2026). One Click Away: AI Tutoring with Khanmigo in a Two-Year School Experiment. NBER Working Paper 35620.', url: 'https://doi.org/10.3386/w35620' },
  hao2025: { text: 'Hao, Z., Jiang, J., Yu, J., Liu, Z., & Zhang, Y. (2025). Student-AI Interaction in an LLM-Empowered Learning Environment: A Cluster Analysis of Engagement Profiles. arXiv:2503.01694.', url: 'https://arxiv.org/abs/2503.01694' },
  amoozadeh2024: { text: 'Amoozadeh, M., et al. (2024). Student-AI Interaction: A Case Study of CS1 Students. Koli Calling ’24.', url: 'https://doi.org/10.1145/3699538.3699567' },
  jin2026: { text: 'Jin, H., Yoo, M., Han, J., Chen, Z., Ahn, S.-Y., & Wang, X. (2026). RelianceScope: An Analytical Framework for Examining Students’ Reliance on GenAI Chatbots in Problem Solving. arXiv:2602.16251.', url: 'https://arxiv.org/abs/2602.16251' },
  leijten2013: { text: 'Leijten, M., & Van Waes, L. (2013). Keystroke logging in writing research: Using Inputlog to analyze and visualize writing processes. Written Communication, 30(3), 358–392.', url: 'https://doi.org/10.1177/0741088313491692' },
  chenoweth2001: { text: 'Chenoweth, N. A., & Hayes, J. R. (2001). Fluency in writing: Generating text in L1 and L2. Written Communication, 18(1), 80–98.', url: 'https://doi.org/10.1177/0741088301018001004' },
  beck2005: { text: 'Beck, J. E. (2005). Engagement tracing: Using response times to model student disengagement. In Artificial Intelligence in Education (AIED 2005), 88–95.', url: 'https://www.cs.cmu.edu/~listen/pdfs/aied2005_engagement_tracing.pdf' },
  baker2007: { text: 'Baker, R. S. J. d. (2007). Modeling and understanding students’ off-task behavior in intelligent tutoring systems. In Proceedings of CHI 2007, 1059–1068.', url: 'https://doi.org/10.1145/1240624.1240785' },
  galbraith2019: { text: 'Galbraith, D., & Vedder, I. (2019). Methodological advances in investigating L2 writing processes: Challenges and perspectives. Studies in Second Language Acquisition, 41(3), 633–645.', url: 'https://doi.org/10.1017/S0272263119000366' },
  wengelin2006: { text: 'Wengelin, Å. (2006). Examining pauses in writing: Theory, methods and empirical data. In K. Sullivan & E. Lindgren (Eds.), Computer Key-Stroke Logging and Writing (pp. 107–130). Elsevier.', url: 'https://www.lu.se/lup/publication/4f38448c-1fcd-41d2-9950-1de0bb919483' },
  zhang2015: { text: 'Zhang, M., & Deane, P. (2015). Process features in writing: Internal structure and incremental value over product features (ETS RR-15-27). ETS Research Report Series, 2015(2), 1–12.', url: 'https://doi.org/10.1002/ets2.12075' },
  halfaker2015: { text: 'Halfaker, A., Keyes, O., Kluver, D., Thebault-Spieker, J., Nguyen, T., Shores, K., Uduwage, A., & Warncke-Wang, M. (2015). User session identification based on strong regularities in inter-activity time. Proceedings of WWW 2015, 410–418.', url: 'https://doi.org/10.1145/2736277.2741117' },
  corbett1995: { text: 'Corbett, A. T., & Anderson, J. R. (1995). Knowledge tracing: Modeling the acquisition of procedural knowledge. User Modeling and User-Adapted Interaction, 4(4), 253–278.', url: 'https://doi.org/10.1007/BF01099821' },
  baker2008: { text: 'Baker, R. S. J. d., Corbett, A. T., & Aleven, V. (2008). More accurate student modeling through contextual estimation of slip and guess probabilities in Bayesian Knowledge Tracing. In Intelligent Tutoring Systems (ITS 2008), LNCS 5091, 406–415.', url: 'https://doi.org/10.1007/978-3-540-69132-7_44' },
  badrinath2021: { text: 'Badrinath, A., Wang, F., & Pardos, Z. A. (2021). pyBKT: An accessible Python library of Bayesian Knowledge Tracing models. Proceedings of the 14th International Conference on Educational Data Mining, 468–474.', url: 'https://educationaldatamining.org/EDM2021/virtual/static/pdf/EDM21_paper_237.pdf' },
  kelly2015: { text: 'Kelly, K., Wang, Y., Thompson, T., & Heffernan, N. (2015). Defining mastery: Knowledge tracing versus N-consecutive correct responses. Proceedings of the 8th International Conference on Educational Data Mining, 630–631.', url: 'https://www.educationaldatamining.org/EDM2015/proceedings/poster630-631.pdf' },
  beck2013: { text: 'Beck, J. E., & Gong, Y. (2013). Wheel-spinning: Students who fail to master a skill. In Artificial Intelligence in Education (AIED 2013), LNCS 7926, 431–440.', url: 'https://doi.org/10.1007/978-3-642-39112-5_44' },
  kai2018: { text: 'Kai, S., Almeda, M. V., Baker, R. S., Heffernan, C., & Heffernan, N. (2018). Decision tree modeling of wheel-spinning and productive persistence in Skill Builders. Journal of Educational Data Mining, 10(1), 36–71.', url: 'https://jedm.educationaldatamining.org/index.php/JEDM/article/view/210' },
  kestin2025: { text: 'Kestin, G., Miller, K., Klales, A., Milbourne, T., & Ponti, G. (2025). AI tutoring outperforms in-class active learning: an RCT introducing a novel research-based design in an authentic educational setting. Scientific Reports, 15.', url: 'https://doi.org/10.1038/s41598-025-97652-6' }
};

const MAX_MS = 6 * 3600 * 1000;
const MAX_COUNT = 100000;

/** What the chat page records about how a message was written (signals_json). */
export const SIGNALS = [
  { id: 'source', type: 'text', label: 'How it was sent', values: ['typed', 'voice', 'talk', 'starter', 'retry'],
    definition: 'typed: written in the message box; voice: a recorded voice message; talk: a turn in a hands-free conversation; starter: a tap on one of the page’s suggested questions; retry: “Try again” after a failed answer.',
    why: 'Taps on suggested questions and pasted text change what intent measures mean, so studies record how each message arrived.', cite: ['oreopoulos2026', 'bastani2025'] },
  { id: 'think_ms', type: 'ms', label: 'Think time',
    definition: 'From the moment the previous answer finished appearing (or the page was ready, for a first message) to the learner’s first keystroke or the start of a recording.',
    why: 'Response time is a long-standing proxy for engagement, hesitation and uncertainty in tutoring systems.', cite: ['beck2005'],
    caveat: 'Includes reading the answer and any time away from the page; compare within a learner, and read it with active time.' },
  { id: 'compose_ms', type: 'ms', label: 'Writing time', definition: 'From the first keystroke to sending, for typed messages.', cite: ['leijten2013'] },
  { id: 'keys', type: 'count', label: 'Characters typed', definition: 'Characters added by typing, including text later deleted (an input method counts the characters it adds). Pasted or dropped text is counted separately.', cite: ['leijten2013'] },
  { id: 'deleted', type: 'count', label: 'Characters deleted', definition: 'Characters removed while writing (Backspace, Delete, cutting or replacing a selection).', cite: ['leijten2013', 'zhang2015'] },
  { id: 'pasted', type: 'count', label: 'Characters pasted', definition: 'Characters pasted into the message box.', cite: ['amoozadeh2024', 'jin2026'],
    caveat: 'Pasting a task description is common; pasted text alone doesn’t show over-reliance.' },
  { id: 'pauses', type: 'count', label: 'Pauses while writing', definition: 'Gaps of 2 seconds or more between keystrokes, from the first keystroke to sending.', why: 'Two seconds is the most common pause threshold in writing research (text between such pauses is a P-burst).', cite: ['chenoweth2001', 'galbraith2019', 'wengelin2006'],
    caveat: 'A fixed threshold doesn’t adjust for each writer’s typing speed; compare within a learner.' },
  { id: 'pause_ms', type: 'ms', label: 'Time in pauses', definition: 'The total length of those pauses.', cite: ['leijten2013'] },
  { id: 'longest_pause_ms', type: 'ms', label: 'Longest pause', definition: 'The longest of those pauses.', cite: ['leijten2013'] },
  { id: 'restarts', type: 'count', label: 'Restarts', definition: 'Times the learner emptied the message box after starting to write, before sending.',
    caveat: 'A platform measure, not a published construct; read it as one sign of hesitation among others.' },
  { id: 'recordings_cancelled', type: 'count', label: 'Recordings cancelled', definition: 'Voice recordings started and cancelled before this message was sent.' },
  { id: 'recording_ms', type: 'ms', label: 'Recording length', definition: 'Length of the recording sent, for voice messages.' },
  { id: 'active_30s_ms', type: 'ms', label: 'Active time (30 s cap)', definition: 'Time on the page since the previous message: the gaps between activity (keystrokes, taps, pointer movement, scrolling, and every few seconds while recording, waiting for an answer or playing one) while the page was visible, each gap capped at 30 seconds.', cite: ['kovanovic2015'] },
  { id: 'active_2m_ms', type: 'ms', label: 'Active time (2 min cap)', definition: 'The same, each gap capped at 2 minutes. This is the default in the dashboard.', cite: ['kovanovic2015'] },
  { id: 'active_5m_ms', type: 'ms', label: 'Active time (5 min cap)', definition: 'The same, each gap capped at 5 minutes.', cite: ['kovanovic2015'],
    caveat: 'How time-on-task is estimated can change a study’s conclusions (Kovanović et al.), so all three caps are kept for sensitivity analysis.' },
  { id: 'visible_ms', type: 'ms', label: 'Time visible', definition: 'Time the page was visible since the previous message, active or not.' },
  { id: 'left_page', type: 'count', label: 'Times away', definition: 'Times the page was hidden since the previous message (another tab, a minimised window, a locked screen).', cite: ['baker2007'],
    caveat: 'Leaving may be off-task or looking something up; it doesn’t tell which. Another window in front of a visible page isn’t counted.' },
  { id: 'interrupted', type: 'bool', label: 'Stopped the previous answer', definition: 'The learner stopped the previous answer before it finished (the stop button, or speaking over it in a voice conversation) and then sent this message.',
    caveat: 'An answer stopped with no message after it isn’t recorded.' }
];

/** What the learner did with an answer, until their next message or leaving the page (after_json). */
export const AFTER = [
  { id: 'read_ms', type: 'ms', label: 'Time with the answer', definition: 'Active time (2-minute cap, as above) from the answer finishing to the learner starting their next message (a keystroke, a recording, a tap on a question), or to leaving the page.', cite: ['kovanovic2015'] },
  { id: 'played', type: 'count', label: 'Answer played', definition: 'Times the answer’s audio played from the start, by a tap or by itself.' },
  { id: 'copied', type: 'count', label: 'Answer copied', definition: 'Times the learner copied the answer with its copy button.', cite: ['jin2026'] },
  { id: 'links_opened', type: 'count', label: 'Links opened', definition: 'Times the learner opened one of the answer’s sources or a link in it.' }
];

const SOURCES = new Set(SIGNALS[0].values);
const clean = (specs, raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const spec of specs) {
    const value = raw[spec.id];
    if (value == null) continue;
    if (spec.type === 'text') { if (SOURCES.has(value)) out[spec.id] = value; continue; }
    if (spec.type === 'bool') { if (typeof value === 'boolean') out[spec.id] = value; continue; }
    const number = Math.round(Number(value));
    if (Number.isFinite(number) && number >= 0) out[spec.id] = Math.min(number, spec.type === 'ms' ? MAX_MS : MAX_COUNT);
  }
  return Object.keys(out).length ? out : null;
};
/** The chat page's signals for a message, with unknown keys dropped and values bounded. */
export const sanitizeSignals = (raw) => clean(SIGNALS, raw);
export const sanitizeAfter = (raw) => clean(AFTER, raw);

/** Words in a message, in any language (CJK text has no spaces), by the runtime's word segmenter. */
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
export function wordCount(text) {
  const value = String(text || '');
  if (!value.trim()) return 0;
  if (!segmenter) return value.trim().split(/\s+/).length;
  let count = 0;
  for (const part of segmenter.segment(value)) if (part.isWordLike) count += 1;
  return count;
}

export const SESSION_GAP_MINUTES = 30;
// Mastery as N correct in a row (N = 3, as in ASSISTments Skill Builders); wheel-spinning as this
// many attempts at a skill without mastery.
export const MASTERY_STREAK = 3;
export const WHEEL_SPIN_ATTEMPTS = 10;
const HESITANT_MIN_MS = 10000;

const median = (values) => {
  const list = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
};
const share = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 1000 : null);

/** Learner-level metrics, each defined in METRICS. */
export const METRICS = [
  { id: 'turns', label: 'Messages', unit: 'count', definition: 'Messages the learner sent (each with the agent’s answer is one turn).', computation: 'Count of turns in the period.' },
  { id: 'conversations', label: 'Conversations', unit: 'count', definition: 'Distinct conversations (chats) the learner had.', computation: 'Distinct conversation ids among the turns.' },
  { id: 'sessions', label: 'Sessions', unit: 'count', definition: `Stretches of use: a gap of ${SESSION_GAP_MINUTES} minutes or more between messages starts a new session, across conversations and agents.`, computation: `Turns in time order; a new session starts at the first turn and after any gap of ${SESSION_GAP_MINUTES} minutes or more.`, why: '30 minutes of inactivity is the most widely used session boundary in web analytics.', cite: ['halfaker2015'], caveat: 'Halfaker et al. suggest about an hour fits many sites better; the export keeps every turn’s time, so sessions can be recomputed.' },
  { id: 'days_active', label: 'Days active', unit: 'count', definition: 'Days (UTC) with at least one message.', computation: 'Distinct UTC dates of the turns.', why: 'Engagement was the binding constraint in a two-year AI tutoring trial, measured as the share of practice days with a message.', cite: ['oreopoulos2026'] },
  { id: 'turns_per_session', label: 'Messages per session', unit: 'ratio', definition: 'Messages divided by sessions.', computation: 'turns / sessions.', caveat: 'More messages can mean depth or floundering, and few can mean copying; read with how messages were written and with coded measures.', cite: ['hao2025', 'bastani2025'] },
  { id: 'active_minutes', label: 'Active time', unit: 'minutes', definition: 'Time active on the chat page, idle gaps capped at 2 minutes (30-second and 5-minute versions are in the export).', computation: 'Sum of active_2m_ms over the learner’s chat page turns, in minutes.', cite: ['kovanovic2015'], caveat: 'Chat page only; turns from an app on the API carry no activity signals.' },
  { id: 'words_per_message', label: 'Words per message', unit: 'words', definition: 'Median words in the learner’s messages (word segmentation that works across languages).', computation: 'Median of word counts of messages (voice messages use what was heard).' },
  { id: 'median_think_s', label: 'Think time', unit: 'seconds', definition: 'Median time from an answer appearing to the learner starting the next message.', computation: 'Median of think_ms over turns after the first in a conversation, in seconds.', cite: ['beck2005'] },
  { id: 'hesitant_share', label: 'Hesitant turns', unit: 'share', definition: `Share of turns where the learner took more than twice their own median think time, and at least ${HESITANT_MIN_MS / 1000} seconds, to start.`, computation: `Over turns with a think time: count(think_ms ≥ max(${HESITANT_MIN_MS / 1000} s, 2 × the learner’s median think_ms)) / count(turns with think_ms).`, why: 'Relative to each learner’s own pace, so fast and slow readers are compared fairly.', cite: ['beck2005'], caveat: 'A platform heuristic built on response-time research, not a validated detector.' },
  { id: 'revision_ratio', label: 'Revision', unit: 'ratio', definition: 'Characters deleted per character typed while writing.', computation: 'sum(deleted) / sum(keys) over typed messages.', cite: ['leijten2013', 'zhang2015'], caveat: 'Deletion is a standard keystroke-logging feature, but there is no standard ratio; this one is defined here.' },
  { id: 'pasted_share', label: 'Mostly pasted', unit: 'share', definition: 'Share of typed messages where pasted text is 80% or more of the message.', computation: 'count(pasted ≥ 0.8 × message length) / count(typed messages).', cite: ['amoozadeh2024', 'jin2026'] },
  { id: 'spoken_share', label: 'Spoken', unit: 'share', definition: 'Share of messages spoken (voice messages and hands-free turns).', computation: 'count(source in voice, talk) / count(turns with a source).' },
  { id: 'starter_share', label: 'Suggested questions', unit: 'share', definition: 'Share of messages that were taps on a suggested question.', computation: 'count(source = starter) / count(turns with a source).', cite: ['oreopoulos2026'] },
  { id: 'median_wait_s', label: 'Wait for answers', unit: 'seconds', definition: 'Median time from sending to the answer starting to appear.', computation: 'Median of first_output_ms, in seconds.' },
  { id: 'attempts', label: 'Graded attempts', unit: 'count', definition: 'Answers an agent graded: each item of its Reply step’s data.assessment ({skill, correct}).', computation: 'Count of attempts in the period.' },
  { id: 'accuracy', label: 'Correct', unit: 'share', definition: 'Share of graded attempts that were correct.', computation: 'count(correct) / count(attempts).' },
  { id: 'skills_mastered', label: 'Skills mastered', unit: 'count', definition: `Skills the learner answered correctly ${MASTERY_STREAK} times in a row.`, computation: `Per skill, attempts in time order; mastered at the first run of ${MASTERY_STREAK} consecutive correct attempts.`, why: 'Three in a row is an adequate mastery rule for predicting the next answer, and is what ASSISTments Skill Builders use.', cite: ['kelly2015', 'kai2018'], caveat: 'Five in a row predicted transfer better in the same study; attempts.csv lets you apply another rule or knowledge tracing.' },
  { id: 'wheel_spinning', label: 'Wheel-spinning skills', unit: 'count', definition: `Skills with ${WHEEL_SPIN_ATTEMPTS} or more attempts and no mastery yet.`, computation: `Per skill: attempts ≥ ${WHEEL_SPIN_ATTEMPTS} and no run of ${MASTERY_STREAK} consecutive correct attempts.`, why: 'Students who don’t master a skill after many attempts are unlikely to without a change of approach.', cite: ['beck2013', 'kai2018'], caveat: 'Fewer than 10 attempts without mastery is indeterminate, not wheel-spinning.' },
  { id: 'errors_after_mastery', label: 'Errors after mastery', unit: 'share', definition: 'Share of attempts after mastering a skill that were wrong: a descriptive sign of slips.', computation: 'Over attempts after each skill’s mastery point: count(incorrect) / count(attempts).', cite: ['corbett1995', 'baker2008', 'badrinath2021'], caveat: 'Not BKT’s slip probability, P(wrong | known), which comes from fitting a model to all learners’ attempts: export attempts.csv to pyBKT for slip, guess and learning rates.' },
  { id: 'interrupted_share', label: 'Answers stopped', unit: 'share', definition: 'Share of messages sent after stopping the previous answer before it finished.', computation: 'count(signals.interrupted) / count(turns after the first in a conversation, with signals).' }
];

/** Per-turn derived values: words, session number, gap since the learner's previous message. */
export function deriveTurns(turns) {
  const ordered = [...turns].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
  let session = 0;
  let previous = null;
  return ordered.map((turn) => {
    const at = Date.parse(turn.started_at);
    const gapMinutes = previous == null ? null : Math.max(0, (at - previous) / 60000);
    if (previous == null || gapMinutes >= SESSION_GAP_MINUTES) session += 1;
    previous = at;
    return { ...turn, words: wordCount(turn.message), chars: String(turn.message || '').length, session_index: session, gap_minutes: gapMinutes == null ? null : Math.round(gapMinutes * 10) / 10 };
  });
}

/** Per skill, in time order: attempts, correct, where mastery came (N in a row), and errors after it. */
export function skillProgress(attempts) {
  const bySkill = new Map();
  for (const attempt of [...attempts].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || (a.position || 0) - (b.position || 0))) {
    const skill = bySkill.get(attempt.skill) || { skill: attempt.skill, attempts: 0, correct: 0, streak: 0, mastered_at_attempt: null, mastered_at: null, after: 0, errors_after: 0, last_at: null };
    skill.attempts += 1;
    if (attempt.correct) skill.correct += 1;
    if (skill.mastered_at_attempt != null) { skill.after += 1; if (!attempt.correct) skill.errors_after += 1; }
    skill.streak = attempt.correct ? skill.streak + 1 : 0;
    if (skill.mastered_at_attempt == null && skill.streak >= MASTERY_STREAK) { skill.mastered_at_attempt = skill.attempts; skill.mastered_at = attempt.created_at; }
    skill.last_at = attempt.created_at;
    bySkill.set(attempt.skill, skill);
  }
  return [...bySkill.values()].map(({ streak, ...skill }) => ({
    ...skill,
    accuracy: share(skill.correct, skill.attempts),
    mastered: skill.mastered_at_attempt != null,
    wheel_spinning: skill.mastered_at_attempt == null && skill.attempts >= WHEEL_SPIN_ATTEMPTS
  }));
}

/** One learner's metrics from their turns (rows with message, started_at, conversation_id, first_output_ms, signals, after) and graded attempts. */
export function learnerMetrics(turns, attempts = []) {
  const derived = deriveTurns(turns);
  const signals = derived.map((turn) => turn.signals || {});
  const withSource = signals.filter((s) => s.source);
  const typed = derived.filter((turn, i) => signals[i].source === 'typed');
  const think = derived.filter((turn) => Number(turn.turn_index) > 1).map((turn) => turn.signals?.think_ms).filter(Number.isFinite);
  const thinkMedian = median(think);
  const hesitant = thinkMedian == null ? 0 : think.filter((ms) => ms >= Math.max(HESITANT_MIN_MS, 2 * thinkMedian)).length;
  const later = derived.filter((turn) => Number(turn.turn_index) > 1 && turn.signals);
  const keys = typed.reduce((sum, turn) => sum + (turn.signals.keys || 0), 0);
  const sessions = derived.length ? derived[derived.length - 1].session_index : 0;
  const active = signals.reduce((sum, s) => sum + (s.active_2m_ms || 0), 0);
  return {
    turns: derived.length,
    conversations: new Set(derived.map((turn) => turn.conversation_id).filter(Boolean)).size,
    sessions,
    days_active: new Set(derived.map((turn) => String(turn.started_at).slice(0, 10))).size,
    turns_per_session: sessions ? Math.round((derived.length / sessions) * 10) / 10 : null,
    active_minutes: active ? Math.round(active / 6000) / 10 : null,
    words_per_message: median(derived.map((turn) => turn.words)),
    median_think_s: thinkMedian == null ? null : Math.round(thinkMedian / 100) / 10,
    hesitant_share: share(hesitant, think.length),
    revision_ratio: keys ? Math.round((typed.reduce((sum, turn) => sum + (turn.signals.deleted || 0), 0) / keys) * 100) / 100 : null,
    pasted_share: share(typed.filter((turn) => (turn.signals.pasted || 0) >= 0.8 * Math.max(1, turn.chars)).length, typed.length),
    spoken_share: share(withSource.filter((s) => s.source === 'voice' || s.source === 'talk').length, withSource.length),
    starter_share: share(withSource.filter((s) => s.source === 'starter').length, withSource.length),
    median_wait_s: (() => { const value = median(derived.map((turn) => turn.first_output_ms).filter(Number.isFinite)); return value == null ? null : Math.round(value / 100) / 10; })(),
    interrupted_share: share(later.filter((turn) => turn.signals.interrupted).length, later.length),
    ...attemptMetrics(attempts)
  };
}

function attemptMetrics(attempts) {
  const skills = skillProgress(attempts);
  const after = skills.reduce((sum, skill) => sum + skill.after, 0);
  return {
    attempts: attempts.length,
    accuracy: share(attempts.filter((attempt) => attempt.correct).length, attempts.length),
    skills_mastered: attempts.length ? skills.filter((skill) => skill.mastered).length : null,
    wheel_spinning: attempts.length ? skills.filter((skill) => skill.wheel_spinning).length : null,
    errors_after_mastery: share(skills.reduce((sum, skill) => sum + skill.errors_after, 0), after)
  };
}

/** The definitions, for the dashboard and the export's data dictionary. */
export function researchDefinitions() {
  return { object: 'research.definitions', version: METRICS_VERSION, session_gap_minutes: SESSION_GAP_MINUTES, mastery_streak: MASTERY_STREAK, wheel_spin_attempts: WHEEL_SPIN_ATTEMPTS, signals: SIGNALS, after: AFTER, metrics: METRICS, citations: CITATIONS };
}
