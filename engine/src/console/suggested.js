/**
 * What an activity's How the AI helps shows was chosen for the teacher where they chose none (the Harness's defaults.js),
 * the same set its AI works from. No Node built-ins.
 */
import { defaultGuidance, defaultMisconceptions } from '../../../harness/src/defaults.js';

export { defaultGuidance as guidanceFor, defaultMisconceptions as misconceptionsFor };

/** What is chosen for an activity now, of each kind it has none of, unless its teacher turned that off. on: the host's own default. */
export function suggestedFor(teaching, { on = true } = {}) {
  const t = teaching || {};
  if (t.defaults === false || (!on && t.defaults !== true)) return { misconceptions: [], guidance: [] };
  const math = !t.standard?.subject || /math/i.test(String(t.standard.subject));
  return {
    misconceptions: t.misconceptions?.length || !math ? [] : defaultMisconceptions(t.goal),
    guidance: t.guidance?.length ? [] : defaultGuidance(t.help)
  };
}
