/**
 * The kinds of teaching work the Harness knows how to prepare and check. A task's build says what goes in,
 * as instructions (added to a reply model's own) or messages (a whole request); its check, what must hold of
 * the answer. New work joins by adding a file here.
 */
import adaptPlan from './adaptPlan.js';
import differentiate from './differentiate.js';
import goals from './goals.js';
import hardMoments from './hardMoments.js';
import tutoring from './tutoring.js';

export const TASKS = Object.fromEntries([tutoring, adaptPlan, differentiate, hardMoments, goals].map((task) => [task.id, task]));
