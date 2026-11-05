// What VIABLE carries from research: one context component per topic, each piece a sentence or two a model can act on, in our words, with
// the studies it draws on (docs/how-it-works.md). A person chooses pieces for an activity, and a turn takes at most two that fit the moment.
import feedback from './guidance/feedback.json' with { type: 'json' };
import metacognition from './guidance/metacognition-and-motivation.json' with { type: 'json' };
import productiveStruggle from './guidance/productive-struggle.json' with { type: 'json' };
import retrieval from './guidance/retrieval-and-spacing.json' with { type: 'json' };
import scaffolding from './guidance/scaffolding.json' with { type: 'json' };
import selfExplanation from './guidance/self-explanation.json' with { type: 'json' };
import tutoringTalk from './guidance/tutoring-talk.json' with { type: 'json' };
import workedExamples from './guidance/worked-examples.json' with { type: 'json' };

export const GUIDANCE = [scaffolding, feedback, tutoringTalk, selfExplanation, workedExamples, productiveStruggle, retrieval, metacognition];

/** What research says to do at a moment in tutoring, each piece naming its studies. By a few words, a moment, or both. */
export function findGuidance({ topic = '', moment = null } = {}) {
  const words = String(topic).toLowerCase().split(/\W+/).filter(Boolean);
  return GUIDANCE.filter((framework) => !words.length || words.some((word) => `${framework.id} ${framework.label} ${framework.summary}`.toLowerCase().includes(word))).map((framework) => ({
    component: framework.id, label: framework.label, shown: framework.evidence.original, unknown: framework.evidence.unknown,
    pieces: framework.runs.items.map((item, index) => ({ item: index + 1, text: item.text, when: item.when ?? null, about: item.about ?? null, source: item.source })).filter((item) => !moment || !item.when || item.when.includes(moment))
  }));
}
