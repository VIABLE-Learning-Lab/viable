/**
 * An activity as what learners do, step by step: read here by the activity's page, by Ask and by a course's lists, and built here from what
 * a person or Ask says. A step shows panels (a page, questions, writing, a reading, a web page), has the AI or not, and says what the AI does
 * there. One panel and no steps is a step of one; no panels at all is a conversation alone. No Node built-ins.
 */
import { reviewActivity } from '../../../harness/src/designs.js';
import { normalizeItems } from '../learner/questions.js';

const refused = (message, status = 400, code = 'invalid_activity') => Object.assign(new Error(message), { status, code });
const clean = (value, limit) => String(value ?? '').trim().slice(0, limit);
export const LAYOUT = { ai_width: 36, resizable: true, collapsible: true };
export const PANEL_WORDS = { page: 'A page to read', questions: 'Questions', writing: 'Writing', reading: 'A reading', embed: 'A web page' };
export const STEP_LIMIT = 6;
const LIMITS = { page: 12000, says: 800, brief: 1500, title: 60, prompt: 8000 };

export const newRef = (base, taken) => { const start = String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'set'; let ref = start; for (let n = 2; taken.has(ref); n += 1) ref = `${start}-${n}`; return ref; };

/** An activity's steps as a page shows them: each with its panels, how many questions a set holds and whether a reading has its PDF. A conversation alone has none. */
export function flowOf(doc, activity) {
  const workspace = activity.workspace;
  const panels = workspace?.panels || [];
  const view = (panel) => ({ ...panel, ...(panel.type === 'questions' ? { questions: (doc.question_sets || []).find((set) => set.ref === panel.set_ref)?.items?.length ?? 0 } : {}), ...(panel.type === 'reading' ? { file: Boolean(panel.file_ref || panel.document) } : {}) });
  const withAi = (ai) => Boolean(activity.agent_ref) && ai !== 'off';
  if (workspace?.steps?.length) {
    return workspace.steps.map((step) => ({ ...step, has_ai: withAi(step.ai === 'off' || workspace.ai === 'off' ? 'off' : 'on'), panels: step.panels.map((id) => panels.find((panel) => panel.id === id)).filter(Boolean).map(view) }));
  }
  return panels.length ? [{ id: 'only', title: panels[0].title || activity.title, ai: workspace.ai === 'off' ? 'off' : 'on', has_ai: withAi(workspace.ai), says: activity.opening?.says ?? null, panels: panels.map(view), only: true }] : [];
}

/** What a list says of an activity in a few words. */
export function flowWords(doc, activity) {
  const steps = flowOf(doc, activity);
  if (!steps.length) return activity.workspace ? 'A reading, waiting for its PDF' : 'A conversation with the AI';
  if (steps.length === 1) return `${PANEL_WORDS[steps[0].panels[0]?.type] || 'Panels'}${steps[0].has_ai ? ', with the AI beside it' : ''}`;
  const withAi = steps.filter((step) => step.has_ai).length;
  return `${steps.length} steps${withAi ? `, the AI in ${withAi === steps.length ? 'all of them' : withAi}` : ', no AI'}`;
}

/** What a learner would trip on here (the Harness's rules): for the activity's page, Ask, and the button that opens it. */
export function reviewOf(doc, activity) {
  const taught = activity.teaching || {};
  return reviewActivity({
    goal: taught.goal || taught.standard?.description || null,
    help: taught.help || null,
    ai: Boolean(activity.agent_ref),
    says: activity.opening?.says || null,
    audience: doc.course?.audience || null,
    steps: flowOf(doc, activity).map((step) => ({ title: step.title, ai: step.has_ai ? 'on' : 'off', says: step.says || null, panels: step.panels }))
  });
}

// A step of the kind a teacher or Ask asks for, as a panel: its own questions in a set of its own.
function panelFrom(doc, activity, spec, id, makeItems, reading = null) {
  const title = clean(spec.title, LIMITS.title) || PANEL_WORDS[spec.shows];
  if (spec.shows === 'page') {
    const words = clean(spec.text, LIMITS.page);
    if (!words) throw refused(`“${title}” is a page with nothing on it. Write what learners read.`);
    return { id, type: 'page', title, text: words };
  }
  if (spec.shows === 'questions') {
    const sets = doc.question_sets ||= [];
    const ref = newRef(`${activity.title} ${title}`, new Set(sets.map((set) => set.ref)));
    const items = (spec.questions || []).map((question, index) => makeItems(question, `q${index + 1}`));
    if (!items.length) throw refused(`“${title}” has no questions. Write them.`);
    try { normalizeItems(items); } catch (error) { throw refused(error.message); }
    sets.push({ ref, title: clean(`${activity.title}: ${title}`, 160), items });
    return { id, type: 'questions', title, set_ref: ref, feedback: ['each', 'end', 'none'].includes(spec.feedback) ? spec.feedback : 'each', tries: Number.isInteger(spec.tries) ? Math.min(10, Math.max(0, spec.tries)) : 3, hints: spec.hints !== false, ai_sees: 'question' };
  }
  if (spec.shows === 'writing') {
    const prompt = clean(spec.prompt, LIMITS.prompt);
    if (!prompt) throw refused(`“${title}” is a writing step that doesn’t say what to write.`);
    return { id, type: 'writing', title, prompt, rubric: (spec.rubric || []).slice(0, 12).map((point) => { const line = clean(point, 400); const at = line.indexOf(':'); return at > 0 ? { criterion: line.slice(0, at).trim(), description: line.slice(at + 1).trim() } : { criterion: line, description: '' }; }), min_words: Number.isInteger(spec.min_words) && spec.min_words > 0 ? spec.min_words : null, max_words: Number.isInteger(spec.max_words) && spec.max_words > 0 ? spec.max_words : null, lock_on_submit: spec.lock_on_submit === true };
  }
  if (spec.shows === 'embed') {
    if (!/^https:\/\//i.test(String(spec.url ?? ''))) throw refused(`“${title}” needs a whole https address.`);
    return { id, type: 'embed', title, url: clean(spec.url, 2000) };
  }
  if (spec.shows === 'reading') {
    if (!reading) throw refused(`“${title}” needs its PDF. Ask the teacher to add it, then use its id as material.`);
    return { highlights: true, notes: true, start_page: 1, ai_sees: 'page', id, type: 'reading', title, document: reading, file_ref: reading.document_id };
  }
  throw refused(`“${title}” has no kind this can make.`);
}

/**
 * The whole of what learners do, from steps as Ask writes them: this replaces what the activity held. readings: the PDFs steps name, by material.
 * makeItems: a question as a question set keeps it. One step is an activity with no step bar, whose first message is the activity's.
 */
export function withSteps(doc, activity, specs, { makeItems, readings = new Map() }) {
  if (!Array.isArray(specs) || !specs.length) throw refused('Say what the steps are.');
  if (specs.length > STEP_LIMIT) throw refused(`An activity holds at most ${STEP_LIMIT} steps. Make this one shorter, or two activities.`);
  const hasAi = Boolean(activity.agent_ref);
  const panels = [];
  const steps = [];
  let writing = null;
  specs.forEach((spec, index) => {
    const number = index + 1;
    // The same writing, carried on into a step with the AI beside it, is one panel: the draft goes with it.
    const again = spec.shows === 'writing' && spec.same_writing === true && writing;
    const panel = again ? writing : panelFrom(doc, activity, spec, `${spec.shows}-${number}`, makeItems, spec.material ? readings.get(String(spec.material)) : null);
    if (!again) panels.push(panel);
    if (panel.type === 'writing') writing = panel;
    // The AI is beside them where it was given something to do there, not by default.
    const ai = hasAi && (spec.ai === true || (spec.ai == null && Boolean(spec.ai_says || spec.ai_does))) ? 'on' : 'off';
    const says = ai === 'on' ? clean(spec.ai_says, LIMITS.says) : '';
    const brief = ai === 'on' ? clean(spec.ai_does, LIMITS.brief) : '';
    steps.push({ id: `step-${number}`, title: clean(spec.title, LIMITS.title) || `Step ${number}`, panels: [panel.id], ai, chat: spec.new_chat === true ? 'new' : 'continue', ...(says ? { says } : {}), ...(brief ? { brief } : {}), ...(index ? { move: 'ready', minutes: 0, back: spec.keep_earlier !== false } : {}) });
  });
  const anyAi = steps.some((step) => step.ai === 'on');
  activity.workspace = { ai: anyAi ? (activity.workspace?.ai && activity.workspace.ai !== 'off' ? activity.workspace.ai : 'right') : 'off', title: activity.workspace?.title ?? null, layout: activity.workspace?.layout || LAYOUT, panels, ...(steps.length > 1 ? { steps } : {}) };
  // One step has no step bar: what it says first is the activity's.
  if (steps.length === 1 && steps[0].says) activity.opening = { says: steps[0].says, starters: (specs[0].starters || []).map((item) => clean(item, 160)).filter(Boolean).slice(0, 4) };
  else if (steps.length > 1) activity.opening = null;
  // What the AI offers to ask is its panel's.
  specs.forEach((spec, index) => {
    const starters = (spec.starters || []).map((item) => clean(item, 160)).filter(Boolean).slice(0, 4);
    const panel = panels.find((item) => item.id === steps[index].panels[0]);
    if (starters.length && panel) panel.starters = starters;
  });
}

/** A blank step of a kind, on a page: what it holds gets filled in on its form. */
export function addStep(doc, activity, kind, { reading = null } = {}) {
  const held = flowOf(doc, activity);
  if (held.length >= STEP_LIMIT) throw refused(`An activity holds at most ${STEP_LIMIT} steps.`);
  const taken = new Set((activity.workspace?.panels || []).map((panel) => panel.id));
  let number = held.length + 1;
  while (taken.has(`${kind}-${number}`)) number += 1;
  const id = `${kind}-${number}`;
  const title = PANEL_WORDS[kind];
  let panel;
  if (kind === 'page') panel = { id, type: 'page', title: 'Read this', text: '' };
  else if (kind === 'questions') {
    const sets = doc.question_sets ||= [];
    const ref = newRef(`${activity.title} questions`, new Set(sets.map((set) => set.ref)));
    sets.push({ ref, title: clean(`${activity.title}: questions`, 160), items: [{ id: 'q1', type: 'open', prompt: 'A new question', answer: {} }] });
    panel = { id, type: 'questions', title, set_ref: ref, feedback: 'each', tries: 3, hints: true, ai_sees: 'question' };
  } else if (kind === 'writing') panel = { id, type: 'writing', title: 'Your writing', prompt: 'Say what to write, and who it is for.', rubric: [] };
  else if (kind === 'embed') panel = { id, type: 'embed', title, url: 'https://example.org' };
  else if (kind === 'reading' && reading) panel = { highlights: true, notes: true, start_page: 1, ai_sees: 'page', id, type: 'reading', title, ...reading };
  else throw refused('Choose what the step shows.');
  const workspace = activity.workspace && activity.workspace.panels?.length ? activity.workspace : { ai: activity.agent_ref ? (activity.workspace?.ai || 'right') : 'off', title: null, layout: LAYOUT, panels: [] };
  const hadPanels = workspace.panels.length;
  workspace.panels = [...workspace.panels, panel];
  const ai = kind === 'page' && activity.agent_ref ? 'on' : (activity.agent_ref && hadPanels ? 'on' : 'off');
  if (hadPanels) {
    // A second step makes the first one a step too, as it was.
    const first = workspace.steps?.length ? workspace.steps : [{ id: 'step-1', title: clean(workspace.panels[0].title, LIMITS.title) || 'Step 1', panels: workspace.panels.slice(0, hadPanels).map((item) => item.id), ai: workspace.ai === 'off' ? 'off' : 'on', chat: 'continue', ...(activity.opening?.says ? { says: clean(activity.opening.says, LIMITS.says) } : {}) }];
    workspace.steps = [...first, { id: `step-${first.length + 1}${first.some((step) => step.id === `step-${first.length + 1}`) ? '-b' : ''}`, title: clean(panel.title, LIMITS.title), panels: [id], ai, chat: 'continue', move: 'ready', minutes: 0, back: false }];
    if (workspace.ai === 'off' && activity.agent_ref) workspace.ai = 'right';
    activity.opening = null;
  } else if (activity.agent_ref) workspace.ai = workspace.ai === 'off' ? 'right' : workspace.ai;
  activity.workspace = workspace;
}

/** One step's form, into the document. A panel can be in more than one step, so what it holds is the panel's. */
export function changeStep(doc, activity, index, body) {
  const workspace = activity.workspace;
  if (!workspace?.panels?.length) throw refused('This activity has no steps.');
  const steps = workspace.steps;
  const step = steps ? steps[index] : null;
  if (steps && !step) throw refused('That step isn’t here anymore.', 404, 'step_not_found');
  const shown = step ? step.panels : workspace.panels.map((panel) => panel.id);
  for (const id of shown) {
    const panel = workspace.panels.find((item) => item.id === id);
    const got = body.panels?.[id];
    if (!panel || !got) continue;
    if (got.title !== undefined) panel.title = clean(got.title, LIMITS.title) || panel.title;
    if (panel.type === 'page' && got.text !== undefined) panel.text = clean(got.text, LIMITS.page);
    if (panel.type === 'writing') {
      if (got.prompt !== undefined) panel.prompt = clean(got.prompt, LIMITS.prompt);
      if (got.rubric_lines !== undefined) panel.rubric = String(got.rubric_lines).split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 12).map((line) => { const at = line.indexOf(':'); return at > 0 ? { criterion: line.slice(0, at).trim(), description: line.slice(at + 1).trim() } : { criterion: line, description: '' }; });
      if (got.min_words !== undefined) panel.min_words = Number.isInteger(got.min_words) && got.min_words > 0 ? got.min_words : null;
      if (got.max_words !== undefined) panel.max_words = Number.isInteger(got.max_words) && got.max_words > 0 ? got.max_words : null;
      if (got.lock_on_submit !== undefined) panel.lock_on_submit = got.lock_on_submit === true;
    }
    if (panel.type === 'questions') {
      if (['each', 'end', 'none'].includes(got.feedback)) panel.feedback = got.feedback;
      if (got.tries !== undefined && Number.isInteger(got.tries)) panel.tries = Math.min(10, Math.max(0, got.tries));
      if (got.hints !== undefined) panel.hints = got.hints === true;
    }
    if (panel.type === 'embed' && got.url !== undefined) {
      if (!/^https:\/\//i.test(String(got.url))) throw refused('A web page needs its whole https address.');
      panel.url = clean(got.url, 2000);
    }
    if (got.starters !== undefined) panel.starters = String(got.starters).split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 4);
  }
  if (step) {
    if (body.title !== undefined) step.title = clean(body.title, LIMITS.title) || step.title;
    if (body.ai_on !== undefined) step.ai = body.ai_on && activity.agent_ref ? 'on' : 'off';
    const on = step.ai === 'on';
    for (const [field, limit] of [['says', LIMITS.says], ['brief', LIMITS.brief]]) {
      if (body[field] === undefined) continue;
      const words = clean(body[field], limit);
      if (words && on) step[field] = words; else delete step[field];
    }
    if (!on) { delete step.says; delete step.brief; }
    if (index && body.back !== undefined) step.back = body.back === true;
    if (body.new_chat !== undefined) step.chat = body.new_chat ? 'new' : 'continue';
    workspace.ai = steps.some((item) => item.ai === 'on') ? (workspace.ai === 'off' ? 'right' : workspace.ai) : 'off';
  } else {
    if (body.ai_on !== undefined) workspace.ai = body.ai_on && activity.agent_ref ? (workspace.ai === 'off' ? 'right' : workspace.ai) : 'off';
    if (body.says !== undefined || body.starters_lines !== undefined) openingFrom(activity, body);
  }
}

/** What the AI says first where there are no steps. */
export function openingFrom(activity, body) {
  const says = clean(body.says ?? activity.opening?.says, LIMITS.says);
  const starters = body.starters_lines !== undefined ? String(body.starters_lines).split('\n').map((line) => clean(line, 160)).filter(Boolean).slice(0, 4) : activity.opening?.starters || [];
  activity.opening = says || starters.length ? { says: says || null, starters } : null;
}

// The first step has no way in, and every later one has.
const tidySteps = (steps) => steps.forEach((step, at) => { if (!at) { delete step.move; delete step.minutes; delete step.back; } else { step.move ??= 'ready'; step.minutes ??= 0; step.back ??= false; } });

export function moveStep(activity, index, by) {
  const steps = activity.workspace?.steps;
  const to = index + (by < 0 ? -1 : 1);
  if (!steps?.[index] || to < 0 || to >= steps.length) return;
  steps.splice(to, 0, steps.splice(index, 1)[0]);
  tidySteps(steps);
}

export function removeStep(doc, activity, index) {
  const workspace = activity.workspace;
  if (!workspace?.panels?.length) return;
  const steps = workspace.steps;
  if (!steps) {
    // The only step goes: what is left is a conversation, or an activity with nothing in it yet.
    if (!activity.agent_ref) throw refused('This is all this activity holds, and it has no AI to talk to. Add another step first.');
    activity.workspace = null;
    return;
  }
  if (!steps[index]) throw refused('That step isn’t here anymore.', 404, 'step_not_found');
  const [gone] = steps.splice(index, 1);
  const used = new Set(steps.flatMap((step) => step.panels));
  workspace.panels = workspace.panels.filter((panel) => !gone.panels.includes(panel.id) || used.has(panel.id));
  if (steps.length === 1) {
    if (steps[0].says) activity.opening = { says: steps[0].says, starters: [] };
    workspace.ai = steps[0].ai === 'on' ? (workspace.ai === 'off' ? 'right' : workspace.ai) : 'off';
    delete workspace.steps;
  } else tidySteps(steps);
}
