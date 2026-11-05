/**
 * What Ask can do: each tool is a thing a teacher could do on a page, by the same routes and with the same checks. A tool
 * says its tier. look and draft run when the model asks; reach touches what learners see, so the model only proposes it and
 * a person's click on its card runs it (ask.js). What goes back to the model never holds a learner's name or work: a class
 * list goes in a box on a card, straight to the list. No Node built-ins.
 */
import { activityKeys } from '../server/library.js';
import { guidanceFrom } from '../../../harness/src/components/contract.js';
import { teachingSettings } from '../../../harness/src/utils/teaching.js';
import { normalizeItems } from '../learner/questions.js';
import { activityIn, withTeaching } from './activity.js';
import { changeCourse, courseAt, kindOfActivity } from './course.js';
import { activitiesOf } from './askCards.js';

const refused = (message) => Object.assign(new Error(message), { status: 400, code: 'invalid_request' });
const clean = (value, limit) => String(value ?? '').trim().slice(0, limit);
const HELP = ['ask_first', 'hint', 'explain', 'check_only'];
const KINDS = ['chat', 'questions', 'writing', 'reading', 'embed'];
const string = (description) => ({ type: 'string', description });
const COURSE = string('The course’s address, as list_courses or create_course gave it.');
const ACTIVITY = string('The activity’s key, as read_course or add_activity gave it.');
const QUESTIONS = {
  type: 'array',
  description: 'Questions to answer. Write them for these learners, and check each answer yourself.',
  items: {
    type: 'object',
    required: ['type', 'prompt'],
    properties: {
      type: { enum: ['single', 'multiple', 'fill', 'short', 'open'], description: 'single: one right choice. multiple: several right choices. fill: a word or number, checked. short: a short answer, checked if you give accepted answers. open: a longer answer for the teacher to read.' },
      prompt: string('The question.'),
      choices: { type: 'array', items: { type: 'string' }, description: 'For single and multiple: every choice, in order.' },
      right: { type: 'array', items: { type: 'string' }, description: 'For single and multiple: the right choice or choices, word for word.' },
      accept: { type: 'array', items: { type: 'string' }, description: 'For fill and short: the answers to accept.' },
      hints: { type: 'array', items: { type: 'string' }, description: 'Up to 5, from a nudge to a bigger hint. Never the answer.' },
      explanation: string('Why the answer is right, shown after they answer.')
    }
  }
};
const TEACHING = {
  goal: string('What learners should be able to do by the end, in the teacher’s words where you have them.'),
  help: { enum: HELP, description: 'How far the AI may go. ask_first: asks what they think, then builds on it. hint: hints and guiding questions, never the answer. explain: explains and shows a worked example when stuck. check_only: says what is right and what to look at again.' },
  watch_for: string('What the teacher wants to hear about. For the teacher, never given to the AI.')
};

// Whether learners can reach an activity now: for everyone, or for a section of its own.
const reaches = (activity, own) => activity.release !== 'hidden' || Object.values(own || {}).some((item) => item?.release !== 'hidden');

function questionItem(question, id) {
  const type = question?.type;
  const item = { id, type, prompt: clean(question?.prompt, 4000), hints: (question?.hints || []).slice(0, 5).map((hint) => clean(hint, 500)).filter(Boolean) };
  const explanation = clean(question?.explanation, 2000);
  if (explanation) item.explanation = explanation;
  if (type === 'single' || type === 'multiple') {
    const choices = (question.choices || []).map((text) => clean(text, 500)).filter(Boolean);
    const right = (question.right || []).map((text) => clean(text, 500));
    if (choices.length < 2) throw refused(`“${item.prompt}” needs at least two choices.`);
    // A model tends to write the right choice first, and learners notice: the order is mixed, the same way each time for the same question.
    let seed = [...item.prompt].reduce((sum, letter) => (sum * 31 + letter.codePointAt(0)) % 2147483647, 7);
    for (let at = choices.length - 1; at > 0; at -= 1) {
      seed = (seed * 48271) % 2147483647;
      const other = seed % (at + 1);
      [choices[at], choices[other]] = [choices[other], choices[at]];
    }
    const ids = choices.map((_, index) => String.fromCharCode(97 + index));
    const chosen = ids.filter((_, index) => right.includes(choices[index]));
    if (!chosen.length) throw refused(`“${item.prompt}” needs its right answer, word for word as one of its choices.`);
    if (type === 'single' && chosen.length > 1) throw refused(`“${item.prompt}” is one right answer, and you gave ${chosen.length}.`);
    item.choices = choices.map((text, index) => ({ id: ids[index], text }));
    item.answer = type === 'single' ? { choice: chosen[0] } : { choices: chosen };
  } else if (type === 'fill' || type === 'short') {
    const accept = (question.accept || []).map((text) => clean(text, 500)).filter(Boolean);
    if (type === 'fill' && !accept.length) throw refused(`“${item.prompt}” needs at least one accepted answer.`);
    item.answer = accept.length ? { accept } : {};
  } else if (type === 'open') item.answer = {};
  else throw refused(`“${item.prompt}” has no kind this can make.`);
  try { normalizeItems([item]); } catch (error) { throw refused(error.message); }
  return item;
}

// The questions of a questions activity, added after what it holds.
function addQuestions(doc, activity, questions) {
  const panel = activity.workspace?.panels?.find((item) => item.type === 'questions');
  const set = panel && doc.question_sets?.find((item) => item.ref === panel.set_ref);
  if (!set) throw refused(`“${activity.title}” has no questions to add to. Add one whose kind is questions.`);
  const items = set.items ||= [];
  const ids = new Set(items.map((item) => item.id));
  for (const question of questions) {
    let id = `q${items.length + 1}`;
    for (let n = items.length + 2; ids.has(id); n += 1) id = `q${n}`;
    ids.add(id);
    items.push(questionItem(question, id));
  }
}

const teachingFrom = (args) => Object.fromEntries(['goal', 'help', 'watch_for'].filter((name) => args[name] !== undefined).map((name) => [name, name === 'help' ? (HELP.includes(args.help) ? args.help : null) : clean(args[name], 1000) || null]));
const brief = (doc) => activitiesOf(doc).map((activity) => ({ activity: activity.key, title: activity.title, kind: kindOfActivity(activity), open: activity.release !== 'hidden', goal: activity.teaching?.goal ?? null, help: activity.teaching?.help ?? null, ai: Boolean(activity.agent_ref) }));
const pageOf = (code, key) => `/console/courses/${code}${key ? `/activities/${key}` : ''}`;

export const ASK_TOOLS = [
  {
    name: 'list_courses', tier: 'look', says: () => 'Looking at your courses',
    description: 'The courses here, with their addresses.',
    parameters: { type: 'object', properties: {} },
    async run(here) {
      const courses = await here.library.courses();
      return { done: courses.length ? `You have ${courses.length} course${courses.length === 1 ? '' : 's'}` : 'You have no courses yet', forModel: courses.map(({ code, doc, meta }) => ({ course: code, title: doc.course.title, activities: (doc.course.activities || []).length, closed: meta.status === 'closed' })) };
    }
  },
  {
    name: 'read_course', tier: 'look', says: () => 'Reading the course',
    description: 'One course: its units, sections, how many learners, and each activity with its kind, whether it is open, its goal and how far the AI may go. Names are never in it.',
    parameters: { type: 'object', required: ['course'], properties: { course: COURSE } },
    async run(here, args) {
      const { code, doc } = await courseAt(here.library, args.course);
      const [people, sections] = await Promise.all([here.classes.people(code), here.classes.sections(code)]);
      return { done: `Read “${doc.course.title}”`, link: { href: pageOf(code), label: 'The course' }, course: code, forModel: { course: code, title: doc.course.title, audience: doc.course.audience ?? null, sign_in: doc.course.identify ?? 'browser', units: (doc.course.units || []).map((unit) => unit.title), sections: sections.map((section) => section.name), learners: people.length, activities: brief(doc) } };
    }
  },
  {
    name: 'list_examples', tier: 'look', says: () => 'Looking at the examples', available: (here) => here.examples?.length > 0,
    description: 'Whole working courses to start from, when one is close to what the teacher wants.',
    parameters: { type: 'object', properties: {} },
    async run(here) {
      return { done: `${here.examples.length} examples`, forModel: here.examples.map((example) => ({ id: example.id, title: example.title, summary: example.summary ?? null })) };
    }
  },
  {
    name: 'find_misconceptions', tier: 'look', says: (args) => `Looking for what learners get wrong about ${clean(args.words, 60)}`,
    description: 'Math only. Common misconceptions from Eedi’s graph, by a few words such as adding fractions. Their ids go to set_how_ai_helps.',
    parameters: { type: 'object', required: ['words'], properties: { words: string('A few words, such as adding fractions with unlike denominators.') } },
    async run(_here, args) {
      const { findMisconceptions } = await import('../../../harness/src/utils/misconceptions.js');
      const found = findMisconceptions(clean(args.words, 200));
      const list = found.data.flatMap((construct) => construct.misconceptions.slice(0, 5).map((item) => ({ id: item.id, says: item.description, skill: construct.description })));
      return { done: list.length ? `Found ${list.length} common misconceptions` : 'Found no misconceptions for those words', forModel: list.slice(0, 16) };
    }
  },
  {
    name: 'find_skills', tier: 'look', says: (args) => `Looking for a durable skill: ${clean(args.words, 60)}`,
    description: 'Durable skills (collaboration, communication, critical thinking) from the Carnegie progressions, for a goal that no standard fits.',
    parameters: { type: 'object', required: ['words'], properties: { words: string('A few words, such as evidence or feedback.') } },
    async run(_here, args) {
      const { findSkills } = await import('../../../harness/src/utils/skills.js');
      const found = findSkills(clean(args.words, 200));
      return { done: `Found ${found.data.length} skills`, forModel: found.data.slice(0, 8).map((item) => ({ code: item.code, skill: item.skill, says: item.description })) };
    }
  },
  {
    name: 'find_standards', tier: 'look', says: (args) => `Looking for a standard: ${clean(args.words, 60)}`, available: (here) => Boolean(here.standards),
    description: 'K-12 learning standards by a few words or a code, from Learning Commons.',
    parameters: { type: 'object', required: ['words'], properties: { words: string('A few words or a code, such as 5.NF.A.1.'), jurisdiction: string('A state, or Multi-State for Common Core. Leave it out if unsure.'), grade: string('A grade, such as 5 or K.') } },
    async run(here, args) {
      const found = await here.standards.search({ words: clean(args.words, 200), jurisdiction: args.jurisdiction ? clean(args.jurisdiction, 60) : null, grade: args.grade ? clean(args.grade, 8) : null });
      return { done: `Found ${found.length} standards`, forModel: found.slice(0, 8) };
    }
  },
  {
    name: 'find_guidance', tier: 'look', says: () => 'Looking at what research says',
    description: 'What research says to do at a moment in tutoring, each piece naming its studies. Topics: scaffolding, feedback, tutoring talk, self-explanation, worked examples, productive struggle, recall and spacing, metacognition. Choose only pieces that fit this activity, and use set_how_ai_helps to add them.',
    parameters: { type: 'object', properties: { topic: string('A few words, such as worked examples. Leave it out for every topic.'), moment: { enum: ['attempt', 'asks_answer', 'stuck', 'repeated'], description: 'Only what fits this moment.' } } },
    async run(_here, args) {
      const { GUIDANCE } = await import('../../../harness/src/components/guidance.js');
      const words = clean(args.topic, 200).toLowerCase().split(/\W+/).filter(Boolean);
      const topics = GUIDANCE.filter((framework) => !words.length || words.some((word) => `${framework.id} ${framework.label} ${framework.summary}`.toLowerCase().includes(word)));
      const pieces = topics.flatMap((framework) => framework.runs.items.map((item, index) => ({ component: framework.id, item: index + 1, says: item.text, when: item.when ?? null, source: item.source })).filter((item) => !args.moment || !item.when || item.when.includes(args.moment)));
      return { done: `Read ${pieces.length} pieces of guidance`, forModel: pieces.slice(0, 40) };
    }
  },
  {
    name: 'read_progress', tier: 'look', says: () => 'Reading who has done what',
    description: 'How many learners have started and finished each activity. Counts only: names and work stay on the teacher’s page.',
    parameters: { type: 'object', required: ['course'], properties: { course: COURSE } },
    async run(here, args) {
      const { code, doc } = await courseAt(here.library, args.course);
      const [people, cells] = await Promise.all([here.classes.people(code), here.records.cells(code)]);
      const of = (key, field) => Object.values(cells).filter((mine) => mine[key]?.[field]).length;
      return { done: `Read the progress of ${people.length} learner${people.length === 1 ? '' : 's'}`, cards: [{ kind: 'progress', course: code }], course: code, forModel: { learners: people.length, activities: activitiesOf(doc).map((activity) => ({ title: activity.title, started: of(activity.key, 'opened_at'), done: of(activity.key, 'done_at') })) } };
    }
  },

  {
    name: 'create_course', tier: 'draft', says: (args) => `Making the course “${clean(args.title, 80)}”`,
    description: 'A new course, with a tutor that follows How the AI helps in each activity. Its link exists at once, and learners see nothing until an activity is open.',
    parameters: { type: 'object', required: ['title'], properties: { title: string('Its title, such as Fractions, period 2.'), description: string('A line learners see on its home.'), audience: { enum: ['adults', 'teens', 'children'], description: 'children is under 13: simpler words and bigger controls. teens is 13 to 17.' }, units: { type: 'array', items: { type: 'string' }, description: 'Weeks or topics, in order. Leave it out if the teacher didn’t mention any.' } } },
    async run(here, args, call) {
      const { go } = await call('POST', 'courses', { title: clean(args.title, 160) });
      const code = go.split('/').at(-1);
      await changeCourse(here.library, code, null, (doc) => {
        if (args.description) doc.course.description = clean(args.description, 4000);
        if (['adults', 'teens', 'children'].includes(args.audience)) doc.course.audience = args.audience;
        // Children: no names typed, and the next child at a shared computer isn't taken for the last.
        if (args.audience === 'children') Object.assign(doc.course, { identify: 'code', shared_devices: true });
      }, 'Set up by Ask');
      if (args.units?.length) await call('PUT', `courses/${code}/units`, { titles: args.units.map((title) => clean(title, 160)).join('\n') });
      return { done: `Made the course “${clean(args.title, 80)}”`, link: { href: pageOf(code), label: 'The course' }, course: code, forModel: { course: code, ...(args.audience === 'children' ? { note: 'Children sign in with personal codes, so nobody can open this until the teacher adds a class list. Offer show_class_list, and say so.' } : {}) } };
    }
  },
  {
    name: 'start_from_example', tier: 'draft', says: () => 'Starting from an example', available: (here) => here.examples?.length > 0,
    description: 'A whole working course copied from an example, which the teacher can then change.',
    parameters: { type: 'object', required: ['id'], properties: { id: string('The example’s id, from list_examples.') } },
    async run(_here, args, call) {
      const { go } = await call('POST', 'courses/from-example', { id: String(args.id) });
      const code = go.split('/').at(-1);
      return { done: 'Copied the example into a new course', link: { href: pageOf(code), label: 'The course' }, course: code, forModel: { course: code, note: 'Read it with read_course. Its activities may be open: say so.' } };
    }
  },
  {
    name: 'add_activity', tier: 'draft', says: (args) => `Adding “${clean(args.title, 80)}”`,
    description: 'An activity in a course, hidden from learners until the teacher opens it. kind: chat is a conversation; questions is questions to answer with the AI beside them; writing is a piece of writing with the AI beside it; reading is a PDF the teacher must add on its page; embed is a web page at an https address.',
    parameters: {
      type: 'object', required: ['course', 'title', 'kind'],
      properties: {
        course: COURSE, title: string('Its title.'), kind: { enum: KINDS }, summary: string('A line about it, on the course’s home.'), minutes: { type: 'integer', description: 'About how long it takes.' }, unit: string('Which unit it belongs to, by its title.'),
        ...TEACHING, prompt: string('For writing: what to write.'), rubric: { type: 'array', items: { type: 'string' }, description: 'For writing: what makes it good, one point each.' }, url: string('For embed: its https address.'), questions: QUESTIONS
      }
    },
    async run(here, args, call) {
      if (here.simple && args.kind === 'reading') throw refused('A reading needs its PDF, which only the teacher can give, on the course’s page: Add an activity, then Reading. Tell them so, and make anything else they asked for.');
      const { code } = await courseAt(here.library, args.course);
      const title = clean(args.title, 160);
      // Before anything is made, so a bad question leaves no empty activity behind.
      (args.questions || []).forEach((question, index) => questionItem(question, `q${index + 1}`));
      const { go } = await call('POST', `courses/${code}/activities`, { title, kind: KINDS.includes(args.kind) ? args.kind : 'chat', url: args.url });
      const key = go.split('/').at(-1);
      await changeCourse(here.library, code, null, (doc) => {
        const { activity } = activityIn(doc, key);
        if (args.summary) activity.summary = clean(args.summary, 600);
        if (Number.isInteger(args.minutes) && args.minutes > 0) activity.minutes = Math.min(args.minutes, 600);
        if (args.unit) activity.unit_ref = (doc.course.units || []).find((unit) => unit.title.toLowerCase() === clean(args.unit, 160).toLowerCase())?.ref ?? null;
        const writing = activity.workspace?.panels?.find((panel) => panel.type === 'writing');
        if (writing) {
          if (args.prompt) writing.prompt = clean(args.prompt, 8000);
          if (args.rubric?.length) writing.rubric = args.rubric.slice(0, 12).map((point) => ({ criterion: clean(point, 200) }));
        }
        if (args.questions?.length) addQuestions(doc, activity, args.questions);
        const teaching = teachingFrom(args);
        if (Object.keys(teaching).length) withTeaching(activity, teaching);
      }, `Set up ${title} by Ask`);
      return { done: `Added “${title}”, hidden for now`, link: { href: pageOf(code, key), label: 'Its page' }, course: code, forModel: { course: code, activity: key, open: false }, detail: args.questions?.length ? `${args.questions.length} questions:\n${args.questions.map((question, index) => `${index + 1}. ${clean(question.prompt, 200)}`).join('\n')}` : (args.goal ? `Goal: ${clean(args.goal, 300)}` : null) };
    }
  },
  {
    name: 'add_questions', tier: 'draft', says: (args) => `Adding ${(args.questions || []).length} questions`,
    description: 'More questions in a questions activity that is still hidden.',
    parameters: { type: 'object', required: ['course', 'activity', 'questions'], properties: { course: COURSE, activity: ACTIVITY, questions: QUESTIONS } },
    async run(here, args) {
      const { code } = await courseAt(here.library, args.course);
      const releases = await here.classes.releases(code);
      await changeCourse(here.library, code, null, (doc) => {
        const { activity, list } = activityIn(doc, args.activity);
        // Anything using these questions counts: this activity, for a section of its own, or another with the same set.
        const keys = activityKeys(list);
        const sets = (item) => (item.workspace?.panels || []).filter((panel) => panel.type === 'questions').map((panel) => panel.set_ref);
        const reached = list.find((item, index) => sets(item).some((set) => sets(activity).includes(set)) && reaches(item, releases[keys[index]]));
        if (reached) throw refused(`“${reached.title}” is open and uses these questions, so learners would meet new ones at once. Tell the teacher, and let them add questions on its page.`);
        addQuestions(doc, activity, args.questions || []);
      }, 'Added questions by Ask');
      return { done: `Added ${(args.questions || []).length} questions`, link: { href: pageOf(code, args.activity), label: 'Its page' }, course: code, forModel: { added: (args.questions || []).length }, detail: (args.questions || []).map((question, index) => `${index + 1}. ${clean(question.prompt, 200)}`).join('\n') };
    }
  },
  {
    name: 'set_how_ai_helps', tier: 'draft', says: () => 'Setting how the AI helps',
    description: 'An activity’s goal, how far the AI may go, what the teacher wants to hear about, misconceptions to listen for, a durable skill, and guidance from research, for an activity still hidden. Only what you pass changes.',
    parameters: {
      type: 'object', required: ['course', 'activity'],
      properties: {
        course: COURSE, activity: ACTIVITY, ...TEACHING,
        misconceptions: { type: 'array', items: { type: 'string' }, description: 'Up to 8 ids from find_misconceptions that this class is likely to hold.' },
        skill: { type: 'object', properties: { code: string('Its code from find_skills.'), level: { type: 'integer', description: '1 to 4: emerging to advanced.' } } },
        guidance: { type: 'array', items: { type: 'object', properties: { component: string('From find_guidance.'), item: { type: 'integer' } } }, description: 'Pieces from find_guidance that fit this activity. A few well-chosen ones, not all.' }
      }
    },
    async run(here, args, call) {
      const { code, doc } = await courseAt(here.library, args.course);
      const { activity } = activityIn(doc, args.activity);
      if (reaches(activity, (await here.classes.releases(code))[args.activity])) throw refused(`“${activity.title}” is open, so learners would get this on their next message. Tell the teacher: they can change it on its page, or hide it first.`);
      const { GUIDANCE } = args.guidance?.length ? await import('../../../harness/src/components/guidance.js') : { GUIDANCE: [] };
      const taken = (args.guidance || []).flatMap(({ component, item }) => {
        const framework = GUIDANCE.find((entry) => entry.id === component);
        return framework && Number.isInteger(item) && item >= 1 && item <= framework.runs.items.length ? guidanceFrom(framework, { chosen: [item] }) : [];
      });
      await changeCourse(here.library, code, null, (draft) => {
        const held = activityIn(draft, args.activity).activity;
        const teaching = teachingFrom(args);
        const kept = held.teaching?.guidance || [];
        if (taken.length) teaching.guidance = [...kept, ...taken.filter((piece) => !kept.some((item) => item.text === piece.text))].slice(0, 20);
        if (Object.keys(teaching).length) withTeaching(held, teaching);
      }, 'How the AI helps, by Ask');
      for (const id of (args.misconceptions || []).slice(0, 8)) await call('POST', `courses/${code}/activities/${args.activity}/misconceptions`, { id: String(id) });
      if (args.skill?.code) await call('POST', `courses/${code}/activities/${args.activity}/standard`, { skill: String(args.skill.code), level: String(args.skill.level ?? 2) });
      const after = teachingSettings(activityIn((await courseAt(here.library, code)).doc, args.activity).activity.teaching);
      return { done: `Set how the AI helps in “${activity.title}”`, link: { href: pageOf(code, args.activity), label: 'Its page' }, course: code, forModel: { goal: after?.goal ?? null, help: after?.help ?? null, misconceptions: after?.misconceptions?.length ?? 0, guidance: after?.guidance?.length ?? 0, open: activity.release !== 'hidden' }, detail: [after?.goal ? `Goal: ${after.goal}` : '', after?.help ? `How far: ${after.help}` : '', after?.misconceptions?.length ? `Listening for ${after.misconceptions.length} misconceptions` : '', after?.guidance?.length ? `${after.guidance.length} pieces of guidance` : ''].filter(Boolean).join('\n') };
    }
  },
  {
    name: 'add_sections', tier: 'draft', says: () => 'Adding sections',
    description: 'Classes within a course, such as Period 1 and Period 2, each with its own link.',
    parameters: { type: 'object', required: ['course', 'names'], properties: { course: COURSE, names: { type: 'array', items: { type: 'string' } } } },
    async run(here, args, call) {
      const { code, doc } = await courseAt(here.library, args.course);
      const held = await here.classes.sections(code);
      // A course's first section asks whoever comes which class they're in.
      if ((doc.course.sections_from || 'none') === 'none' && ((await here.classes.people(code)).length || (doc.course.activities || []).some((activity) => activity.release !== 'hidden'))) throw refused('Learners can already reach this course, and its first section would stop each of them to ask which class they’re in. Tell the teacher: they can add sections on People.');
      const fresh = (args.names || []).map((name) => clean(name, 80)).filter((name) => name && !held.some((section) => section.name.toLowerCase() === name.toLowerCase()));
      for (const name of fresh.slice(0, 20)) await call('POST', `courses/${code}/sections`, { name });
      return { done: fresh.length ? `Added ${fresh.join(', ')}` : 'Those sections are already there', course: code, link: { href: `/console/courses/${code}/people`, label: 'People' }, forModel: { added: fresh } };
    }
  },

  {
    name: 'open_activity', tier: 'reach', says: () => 'Asking you to open it',
    description: 'Asks the teacher to open an activity, for everyone or for one section. It shows them a button: it isn’t open until they press it, so never say it is.',
    parameters: { type: 'object', required: ['course', 'activity'], properties: { course: COURSE, activity: ACTIVITY, section: string('A section’s name, if only that class.') } },
    async propose(here, args) {
      const { code, doc } = await courseAt(here.library, args.course);
      const { activity } = activityIn(doc, args.activity);
      const section = args.section ? (await here.classes.sections(code)).find((item) => item.name.toLowerCase() === clean(args.section, 80).toLowerCase()) : null;
      if (args.section && !section) throw refused(`This course has no section called “${clean(args.section, 80)}”.`);
      return { card: { kind: 'open', course: code, activity: args.activity, section: section?.id ?? null, open: true }, title: activity.title, course: code };
    },
    async apply(_here, card, call) {
      if (card.section) await call('POST', `courses/${card.course}/activities/${card.activity}/for-section`, { section: card.section, release: 'open' });
      else await call('POST', `courses/${card.course}/activities/${card.activity}/release`, { release: 'open' });
    }
  },
  {
    name: 'hide_activity', tier: 'reach', says: () => 'Asking you to hide it',
    description: 'Asks the teacher to hide an open activity from learners. It shows them a button, and it stays open until they press it.',
    parameters: { type: 'object', required: ['course', 'activity'], properties: { course: COURSE, activity: ACTIVITY } },
    async propose(here, args) {
      const { code, doc } = await courseAt(here.library, args.course);
      const { activity } = activityIn(doc, args.activity);
      return { card: { kind: 'open', course: code, activity: args.activity, section: null, open: false }, title: activity.title, course: code };
    },
    async apply(_here, card, call) { await call('POST', `courses/${card.course}/activities/${card.activity}/release`, { release: 'hidden' }); }
  },

  {
    name: 'show_try', tier: 'look', says: () => 'Getting it ready to try',
    description: 'A card to try the course or an activity as a learner. Offer it once something is set up: nothing a teacher tries counts in Progress.',
    parameters: { type: 'object', required: ['course'], properties: { course: COURSE, activity: ACTIVITY } },
    async run(here, args) {
      const { code } = await courseAt(here.library, args.course);
      return { done: 'Ready to try', cards: [{ kind: 'try', course: code, activity: args.activity ?? null }], course: code, forModel: { shown: true } };
    }
  },
  {
    name: 'show_share', tier: 'look', says: () => 'Getting the links',
    description: 'A card with the course’s link and QR code, each open activity’s link, and each section’s link, to give the class. It says if nothing is open yet.',
    parameters: { type: 'object', required: ['course'], properties: { course: COURSE } },
    async run(here, args) {
      const { code } = await courseAt(here.library, args.course);
      return { done: 'Here are the links', cards: [{ kind: 'share', course: code }], course: code, forModel: { shown: true } };
    }
  },
  {
    name: 'show_class_list', tier: 'look', says: () => 'Opening the class list',
    description: 'A card where the teacher pastes their class list, which goes straight to the list and never through you. Use it whenever names come up: never ask for names, and never repeat them.',
    parameters: { type: 'object', required: ['course'], properties: { course: COURSE } },
    async run(here, args) {
      const { code } = await courseAt(here.library, args.course);
      return { done: 'Here is the class list', cards: [{ kind: 'class-list', course: code }], course: code, forModel: { shown: true, note: 'The teacher adds names on the card. You will not see them.' } };
    }
  },
  {
    name: 'show_tools', tier: 'look', says: () => 'Looking at other tools', available: (here) => here.otherTools?.length > 0,
    description: 'A card with other VIABLE tools for teachers, when one fits what they are doing: writing learning objectives, or finding what a class misunderstands with a short assessment.',
    parameters: { type: 'object', properties: {} },
    async run() { return { done: 'Other tools', cards: [{ kind: 'tools' }], forModel: { shown: true } }; }
  }
];

export const toolsFor = (here) => ASK_TOOLS.filter((tool) => !tool.available || tool.available(here));
export const toolSchemas = (here) => toolsFor(here).map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
