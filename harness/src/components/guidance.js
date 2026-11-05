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
