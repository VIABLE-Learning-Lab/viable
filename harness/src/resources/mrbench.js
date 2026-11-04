import { caseLimit, spread } from './cases.js';

const DEV = 'https://raw.githubusercontent.com/kaushal0494/UnifyingAITutorEvaluation/bbef521ddb875f2cc8a5ee798f4066965a7cfd8a/BEA_Shared_Task_2025_Datasets/mrbench_v3_devset.json';
// The dimensions MRBench v3 annotates, as a rubric the harness's own judge reads.
export const DIMENSIONS = {
  'providing-guidance': { field: 'Providing_Guidance', rubric: 'Gives the learner relevant, helpful guidance: a hint, an explanation or a supporting question.' },
  'mistake-identification': { field: 'Mistake_Identification', rubric: 'Shows that the tutor has noticed the learner made a mistake.' },
  'mistake-location': { field: 'Mistake_Location', rubric: 'Points to where the mistake is and what it is, so the learner can fix it.' },
  actionability: { field: 'Actionability', rubric: 'Makes clear what the learner should do next. It isn\'t vague, unclear or a conversation stopper.' }
};

// "Tutor: ...\n Student: ..." as chat messages, ending with the student's last turn; null if it doesn't.
function conversation(history) {
  const parts = String(history).split(/(?:^|\n)\s*(Tutor|Student):\s*/).slice(1);
  const messages = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const content = parts[i + 1].trim().slice(0, 4000);
    if (content) messages.push({ role: parts[i] === 'Student' ? 'user' : 'assistant', content });
  }
  return messages.at(-1)?.role === 'user' ? messages.slice(-12) : null;
}

export default {
  id: 'mrbench',
  version: 1,
  as: ['calibration-set'],
  async fetch(get) { get.save('devset.json', await get.text(DEV)); },
  // Replies its annotators said Yes or No to, half of each; "To some extent" leaves no pass or fail to compare.
  use({ read }, { limit, dimension = 'providing-guidance' }) {
    const chosen = DIMENSIONS[dimension];
    if (!chosen) throw Object.assign(new Error(`MRBench v3 has no dimension "${dimension}". It has ${Object.keys(DIMENSIONS).join(', ')}.`), { code: 'invalid_resource_option', status: 400 });
    const replies = JSON.parse(read('devset.json')).flatMap((dialogue) => {
      const messages = conversation(dialogue.conversation_history);
      if (!messages) return [];
      return Object.entries(dialogue.tutor_responses || {}).map(([tutor, { response, annotation }]) => ({
        name: `MRBench ${dialogue.conversation_id} ${tutor}`.slice(0, 120), messages, rubric: chosen.rubric, reply: String(response).trim(), label: annotation?.[chosen.field]
      }));
    }).filter((item) => item.reply);
    const count = caseLimit(limit, 30, 200);
    const half = (label, size) => spread(replies.filter((item) => item.label === label), size);
    const picked = [...half('Yes', Math.ceil(count / 2)), ...half('No', Math.floor(count / 2))];
    return {
      people: 'MRBench\'s annotators',
      cases: picked.map(({ label: _label, ...item }) => item),
      labels: Object.fromEntries(picked.map((item) => [item.name, item.label === 'Yes' ? 'pass' : 'fail']))
    };
  }
};
