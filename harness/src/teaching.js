/**
 * How the AI helps: an activity's teaching settings (goal, standard or durable skill, help level) and
 * what the agent is told (utils/teaching.js), plus the durable skills
 * (Carnegie Skills Progressions via Learning Commons, CC BY 4.0; SKILLS.framework.attribution).
 */
import { teachingContext } from './utils/teaching.js';

export { HELP_LEVELS, SPEAK_UP_LIMITS, TEACHING_LIMITS, teacherNote, teachingContext, teachingSettings } from './utils/teaching.js';
export { SKILLS } from './utils/skillsData.js';

/**
 * A run's context with the teacher's instructions in it, as a course activity's run gets them
 * (learner/workspace.js workspaceContext): context.workspace.teaching for templates, and teaching_view,
 * which the engine adds to the reply steps' instructions (and VETTING's review). section: the
 * learner's section ID, whose own help level and note (teaching.sections) apply. brief: a turn's brief
 * (brief.js), whose text replaces the whole settings' on this turn.
 */
export function teachingRunContext(teaching, context = null, section = null, brief = null) {
  const taught = teachingContext(teaching, section);
  if (!taught) return context;
  return { ...context, workspace: { ...context?.workspace, teaching: taught.context }, teaching_view: brief?.text || taught.text, workspace_reach: context?.workspace_reach || 'reply' };
}
