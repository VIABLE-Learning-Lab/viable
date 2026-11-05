// The components the harness carries, one manifest each (docs/components.md). Out-of-process
// components (MCP, HTTP) join with manifests of their own, checked by the same schema.
import carnegieSkills from './carnegieSkills.js';
import { GUIDANCE } from './guidance.js';
import eediMisconceptions from './eediMisconceptions.js';
import learnerMeasures from './learnerMeasures.js';
import learningCommonsStandards from './learningCommonsStandards.js';
import replyJudge from './replyJudge.js';
import vetting from './vetting.js';

export const SLOTS = ['context', 'step', 'detector', 'judge', 'simulated-learner', 'measure'];
export const COMPONENTS = [vetting, eediMisconceptions, learningCommonsStandards, carnegieSkills, learnerMeasures, replyJudge, ...GUIDANCE];
export { GUIDANCE };
export const component = (id) => COMPONENTS.find((item) => item.id === id) || null;
