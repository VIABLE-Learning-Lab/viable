/**
 * A course's goals, the way an instructional designer plans a unit: what learners will be able to do, the activities
 * that work toward each, and the checks that show whether they can. A goal is the course's own or a unit's; an activity
 * names the goals it works toward (activity.goals), and its role says whether it is a check. They are for the teacher's
 * design: what the AI aims at in an activity is still that activity's own Goal. No Node built-ins.
 */
import { cutWords, slugOf } from '../server/library.js';
import { choose, esc, plural, say } from './forms.js';
import { icon } from './icons.js';

export const GOAL_LIMITS = { goals: 60, text: 400, each: 12 };
const refused = (message, status = 400, code = 'invalid_goal') => Object.assign(new Error(message), { status, code });
const CHECKS = new Set(['check', 'pretest', 'posttest']);

/** Whether an activity shows what learners can do: the teacher's own check, or a study's pre- or post-test. */
export const isCheck = (activity) => CHECKS.has(activity?.role);

/**
 * The course's goals as a teacher reads them: the course's own first, then each unit's in the units' order, numbered
 * from 1 across the course so a number means one goal wherever it is shown. A goal whose unit is gone is the course's.
 */
export function goalsIn(doc) {
  const units = doc.course?.units || [];
  const known = new Set(units.map((unit) => unit.ref));
  const held = (doc.course?.goals || []).filter((goal) => goal?.ref && String(goal.text || '').trim()).map((goal) => ({ ref: goal.ref, text: String(goal.text).trim(), unit_ref: goal.unit_ref && known.has(goal.unit_ref) ? goal.unit_ref : null }));
  return [...held.filter((goal) => !goal.unit_ref), ...units.flatMap((unit) => held.filter((goal) => goal.unit_ref === unit.ref))].map((goal, i) => ({ ...goal, n: i + 1 }));
}

/** The goals an activity names that the course still has, in the course's order. */
export const goalsOf = (activity, goals) => goals.filter((goal) => (activity?.goals || []).includes(goal.ref));

/** How a goal is met in the course: how many activities work toward it, and how many check it. */
export function fitOf(goal, activities) {
  const naming = activities.filter((activity) => (activity.goals || []).includes(goal.ref) && activity.role !== 'survey');
  const checks = naming.filter(isCheck).length;
  return { learn: naming.length - checks, checks };
}

/** "Goals 1, 3" for an activity's row, or nothing. */
export const goalWords = (activity, goals) => {
  const named = goalsOf(activity, goals);
  return named.length ? `${named.length === 1 ? 'Goal' : 'Goals'} ${named.map((goal) => goal.n).join(', ')}` : '';
};

/** New goals from lines of text (pasted from anywhere, one a line), added to the course or a unit. Returns how many. */
export function addGoals(doc, lines, unitRef) {
  const units = doc.course.units || [];
  if (unitRef && !units.some((unit) => unit.ref === unitRef)) throw refused('That unit isn’t in this course anymore.', 404, 'unit_not_found');
  const goals = doc.course.goals ||= [];
  const texts = [...new Set(lines.map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|[a-z][.)])\s+/i, '').trim().slice(0, GOAL_LIMITS.text)).filter(Boolean))];
  if (!texts.length) throw refused('Write what learners will be able to do, one goal a line.');
  if (goals.length + texts.length > GOAL_LIMITS.goals) throw refused(`A course has at most ${GOAL_LIMITS.goals} goals.`);
  const taken = new Set(goals.map((goal) => goal.ref));
  for (const text of texts) {
    const start = cutWords(slugOf(text, 'goal'), 40);
    let ref = start;
    for (let n = 2; taken.has(ref); n += 1) ref = `${start}-${n}`;
    taken.add(ref);
    goals.push({ ref, text, unit_ref: unitRef || null });
  }
  return texts.length;
}

/** A goal taken out of the course, and out of every activity that named it. */
export function removeGoal(doc, ref) {
  const goals = doc.course.goals || [];
  if (!goals.some((goal) => goal.ref === ref)) throw refused('That goal isn’t in this course anymore.', 404, 'goal_not_found');
  doc.course.goals = goals.filter((goal) => goal.ref !== ref);
  for (const activity of doc.course.activities || []) if (activity.goals?.includes(ref)) activity.goals = activity.goals.filter((item) => item !== ref);
}

/** An activity's goals as sent (refs the course has, in its order, at most GOAL_LIMITS.each), and whether it is a check. */
export function setGoals(activity, doc, refs, check) {
  if (Array.isArray(refs)) {
    const known = new Set((doc.course.goals || []).map((goal) => goal.ref));
    const named = [...new Set(refs.map(String))].filter((ref) => known.has(ref));
    if (named.length > GOAL_LIMITS.each) throw refused(`An activity works toward at most ${GOAL_LIMITS.each} goals.`);
    activity.goals = named;
  }
  // A study's pre- and post-test stay what they are; a survey stays a survey.
  if (check === true && !isCheck(activity) && activity.role !== 'survey') activity.role = 'check';
  if (check === false && activity.role === 'check') activity.role = 'instruction';
}

// What to ask for a goal nothing checks yet: Ask writes the check, and nothing reaches learners until the teacher opens it.
const askForCheck = (code, goal) => `/console/ask?course=${esc(code)}#say=${esc(encodeURIComponent(`Write a check for goal ${goal.n}, “${goal.text.replace(/[.!]+$/, '')}”: a few questions that show whether learners can do it, as a check for that goal.`))}`;

function goalRow(goal, { code, activities, units, locked }) {
  const fit = fitOf(goal, activities);
  // "In 2 activities · not checked yet", "In 2 activities · checked in 1", "Checked in 1", "In no activity yet".
  const words = [fit.learn ? `In ${plural(fit.learn, 'activity', 'activities')}` : '', fit.checks ? `checked in ${fit.checks}` : fit.learn ? 'not checked yet' : ''].filter(Boolean).join(' · ') || 'In no activity yet';
  const api = `courses/${esc(code)}/goals/${esc(goal.ref)}`;
  return `<li class="goal" id="goal-${esc(goal.ref)}" data-say-box>
<span class="goal-n" aria-hidden="true">${goal.n}</span>
<p class="goal-text"><span class="sr">Goal ${goal.n}: </span>${esc(goal.text)}</p>
<p class="goal-fit${fit.checks ? '' : ' is-open'}">${esc(words.charAt(0).toUpperCase() + words.slice(1))}${!fit.checks && !locked ? ` · <a href="${askForCheck(code, goal)}">Ask for a check</a>` : ''}</p>
${locked ? '' : `<details class="goal-more" data-close-outside><summary class="v-btn is-small icon" aria-label="${esc(`Change or remove goal ${goal.n}`)}" data-tip="Change or remove">${icon('more', 16)}</summary>
<div class="goal-menu">
<form class="one-field" id="goal-edit-${esc(goal.ref)}" data-api="PUT ${api}">
<div class="v-form"><label class="v-label" for="goal-text-${esc(goal.ref)}">Goal ${goal.n}</label><textarea class="v-input" id="goal-text-${esc(goal.ref)}" name="text" rows="3" maxlength="${GOAL_LIMITS.text}" required>${esc(goal.text)}</textarea></div>
${units.length ? choose('unit_ref', 'For', goal.unit_ref || '', [{ value: '', label: 'The whole course' }, ...units.map((unit) => ({ value: unit.ref, label: unit.title }))]) : ''}
<div class="actions"><button class="v-btn is-small is-primary" type="submit">Save</button></div>${say()}</form>
<button class="v-btn is-small danger" type="button" data-api="DELETE ${api}" data-confirm="${esc(`Remove goal ${goal.n}? Activities that work toward it keep everything else.`)}" data-yes="Remove the goal" data-danger data-said="Removed.">${icon('trash', 14)}<span>Remove the goal</span></button>
</div>
</details>`}
${say()}
</li>`;
}

/** A unit's goals (unitRef), or the course's own (null), as a list, with how each is met. Nothing when it has none. */
export function goalsPart(goals, { code, doc, activities, unitRef, heading = '', locked }) {
  const mine = goals.filter((goal) => (goal.unit_ref || null) === (unitRef || null));
  if (!mine.length) return '';
  const units = doc.course.units || [];
  return `<div class="goals"${unitRef ? '' : ' id="goals"'}>
<p class="goals-head">${esc(heading || 'Learners will be able to')}</p>
<ol class="goal-list">${mine.map((goal) => goalRow(goal, { code, activities, units, locked })).join('')}</ol>
</div>`;
}

/** The form that adds goals, one a line, to the course or a unit: beside Add an activity and Add a unit. help: a host's tool for writing them. */
export function addGoalsPart({ code, units, help = null }) {
  return `<details class="add-goals"><summary class="v-btn">${icon('plus', 15)}<span>Add goals</span></summary>
<form class="v-card one-field" id="add-goals" data-api="POST courses/${esc(code)}/goals">
<div class="v-form"><label class="v-label" for="add-goals-text">What learners will be able to do</label><textarea class="v-input" id="add-goals-text" name="text" rows="4" maxlength="${GOAL_LIMITS.text * 12}" required placeholder="e.g. Compare two fractions with different denominators."></textarea><small class="v-note">One goal a line, as many as you like. Pasted lists keep their order, without their numbers or bullets.</small></div>
${units.length ? choose('unit_ref', 'For', '', [{ value: '', label: 'The whole course' }, ...units.map((unit) => ({ value: unit.ref, label: unit.title }))]) : ''}
<div class="actions"><button class="v-btn is-primary" type="submit">Add the goals</button>${help ? `<a class="v-note goal-help" href="${esc(help.href)}" target="_blank" rel="noopener">${esc(help.label)}${icon('out', 13)}</a>` : ''}</div>${say()}
</form>
</details>`;
}

/** An activity's What it is for: the goals it works toward, and whether it is a check. The fields belong to the activity's form. */
export function whatForPart(activity, doc, { code, form }) {
  const goals = goalsIn(doc);
  const chosen = new Set(activity.goals || []);
  const box = (goal) => `<label class="toggle"><input type="checkbox" name="goals" value="${esc(goal.ref)}" data-many form="${esc(form)}"${chosen.has(goal.ref) ? ' checked' : ''}><span><strong>${goal.n}. ${esc(goal.text)}</strong></span></label>`;
  const near = goals.filter((goal) => !goal.unit_ref || goal.unit_ref === (activity.unit_ref || null));
  const far = goals.filter((goal) => !near.includes(goal));
  const study = activity.role === 'pretest' || activity.role === 'posttest';
  return `<section class="block what-for" aria-labelledby="for-title" id="what-for">
<h2 id="for-title">What it is for</h2>
<div class="fields">
${goals.length ? `<fieldset class="one-of"><legend class="v-label">Goals it works toward</legend><div class="tools">${near.map(box).join('')}</div>${far.length ? `<details class="goals-far"${far.some((goal) => chosen.has(goal.ref)) ? ' open' : ''}><summary>Goals of other units</summary><div class="tools">${far.map(box).join('')}</div></details>` : ''}</fieldset>` : `<p class="v-note">This course has no goals yet. <a href="/console/courses/${esc(code)}">Add them on the course’s page</a>, beside Add an activity.</p>`}
<label class="toggle"><input type="checkbox" name="check" form="${esc(form)}"${isCheck(activity) ? ' checked' : ''}${study || activity.role === 'survey' ? ' disabled' : ''}><span><strong>It’s a check</strong><small>${study ? 'A study’s test, set on the VIABLE Developer Platform.' : activity.role === 'survey' ? 'A survey can’t be a check.' : 'Learners show what they can do, for the goals above. It says Check on the course, for you and for learners. Nothing else about it changes.'}</small></span></label>
</div>
</section>`;
}

export const GOALS_CSS = `.goals{display:grid;gap:4px;margin:4px 0 12px}
.goals-head{margin:0;color:var(--muted);font-size:.8125rem;font-weight:600}
.goal-list{display:grid;gap:2px;margin:0;padding:0;list-style:none}
.goal{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:2px 10px;align-items:start;padding:6px 0}
.goal-n{display:grid;place-items:center;width:22px;height:22px;margin-top:1px;border-radius:50%;background:var(--field-mist);color:var(--public-ink);font-size:.75rem;font-weight:600;font-variant-numeric:tabular-nums}
.goal-text{grid-column:2;margin:0;color:var(--public-ink);line-height:1.45;overflow-wrap:anywhere}
.goal-fit{grid-column:2;margin:0;color:var(--muted);font-size:.8125rem}
.goal-fit.is-open{color:var(--public-text)}
.goal-fit a{white-space:nowrap}
.goal-more{position:relative;grid-column:3;grid-row:1/span 2}
.goal-more>summary{list-style:none}.goal-more>summary::-webkit-details-marker{display:none}.page .goal-more>summary::before{display:none}
.goal-menu{position:absolute;right:0;z-index:5;display:grid;gap:10px;width:min(340px,calc(100vw - 48px));margin-top:6px;padding:14px;border:1px solid var(--public-rule);border-radius:var(--radius);background:var(--surface);box-shadow:var(--public-shadow)}
.goal .say{grid-column:2/-1}
.add-goals>form{margin-top:10px}
.goal-help{display:inline-flex;align-items:center;gap:4px}
.row-title{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;min-width:0}
.row-tag{display:inline-block;padding:0 7px;border:1px solid var(--ink-blue-line,var(--public-rule-strong));border-radius:var(--radius-pill);color:var(--ink-blue);font-size:.75rem;font-weight:600;line-height:1.6;vertical-align:.1em}
.goals-far{margin-top:6px}
.goals-far>summary{color:var(--muted);font-size:.875rem}
.goals-far .tools{margin-top:8px}`;
