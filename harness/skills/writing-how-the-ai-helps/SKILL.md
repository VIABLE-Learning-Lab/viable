---
name: writing-how-the-ai-helps
description: Turn a teacher's intent for one activity into VIABLE teaching settings (How the AI helps) that fit schemas/teaching.schema.json, with a goal, a help level, a standard or durable skill and misconceptions to listen for, then check them. Use when a teacher or builder describes what the AI should do in an activity, or asks to write, review or fix teaching settings.
---

# Writing How the AI helps

> Commands here say `viable-harness`. Until it is on npm, use `npx github:VIABLE-Learning-Lab/viable` in its place: it takes every command.

Teaching settings are one activity's instructions from its teacher. The harness adds them to every
step that writes a reply, and to VETTING's reviewer; `watch_for` stays with the teacher and never
reaches a model. They are instructions, not a guarantee: VETTING checks replies, and agent tests
show what the agent does.

## The fields

```json
{
  "goal": "Add fractions with unlike denominators by finding a common denominator.",
  "help": "hint",
  "watch_for": "Adding the denominators; asking the AI for the answer.",
  "standard": null,
  "misconceptions": [],
  "sections": { "sec_period3": { "help": "explain", "note": "Many in this group are new to fractions." } }
}
```

- `goal` (at most 1,000 characters): what learners should be able to do, in the teacher's words.
  Write it about the learner, not the AI.
- `help`: how much the AI does for a learner, one scale from the least to the most, each level the
  one before and one thing more. Each value becomes this sentence in the instructions:
  - `check_only` (Only checks), for their own writing, a quiz or showing what they know: Only check
    the learner's own work: say what is right and which part to look at again. Don't teach: no
    hints, no explanations, no answers.
  - `ask_first` (Asks questions), for discussion and reasoning: Help only by asking: say what is
    right, and ask questions that let them find the way themselves, one at a time, built on what
    they say. When they have it, say so. Don't give hints, examples or the answer.
  - `hint` (Gives hints), for practice on what they've been taught: Give hints and guiding
    questions, one step at a time. When they have it, say so. Don't give the answer or do the work
    for them.
  - `step_up` (Shows an example), for most activities: Start by asking what they think or have
    tried, and build on it. If they are stuck, give a hint, one step at a time. If they have really
    tried and are still stuck, show a worked example with different numbers or a similar case, then
    send them back to their own. When they have it, say so. Don't give the answer to their own
    question.
  - `explain` (Explains), for something new to them: When they are stuck, explain the idea and show
    a worked example, then let them try a similar one themselves. When they have it, say so.
- `speaks_up`: when the AI writes first, unasked. Leave it out unless the teacher asks for it or the
  activity needs a nudge, and never in a first try or a test: help that comes unasked can also
  interrupt. Each moment optional: `quiet: { minutes }` (nothing done on a step, 1 to 60),
  `alone: { minutes }` (working without writing to the AI, 1 to 60), `wrong: { after }` (an answer
  wrong this many times, 1 to 5, where learners see right and wrong), `right: { every }` (every so
  many right answers, 1 to 5), `writing: { words, how, focus }` (about so many new words, 50 to 1,000,
  at a pause), `handed_in: { how, focus }`. `how`: `ask`, `point` or `fix`; `focus`: `language`,
  `ideas` or `rubric`. Each may have `say` (at most 300): what the AI does then, in place of the move
  from research. `most` (1 to 10, default 2) times in a step each day, `gap` (1 to 30, default 3)
  minutes apart. The learner's page sees the moment; the server holds to how often.
- `reviewer_reads`: `"message"` lets a VETTING reviewer read the learner's last message too, as
  data: it holds back fewer good replies, and a learner could write to it. Leave it out for only
  the reply. A step's own `reviewer_reads` wins.
- `watch_for` (at most 500): what the teacher wants to hear about. Never sent to the AI, so never
  put an instruction for the AI here.
- `standard`: one K-12 standard or durable skill, kept as it was chosen, or `null`.
- `misconceptions`: up to 8 to listen for (math).
- `sections`: by section ID (`sec_` and up to 64 letters, digits, `_` or `-`), a section's own
  `help` and `note` (at most 500), for that section's learners only. A note is about the group, never
  about one learner: no names.

## Steps

1. **Settle the intent with the teacher.** What learners do in the activity, what a good outcome
   looks like, how much help the AI may give, and what the teacher wants to hear about. Choose one
   help level; if one group needs another, use `sections`.
2. **Choose a standard or skill, only from a real record.**
   - A durable skill (collaboration, communication, critical thinking): the Carnegie Skills
     Progressions ship with the harness as `SKILLS`. From code, pick an indicator and the level
     learners work toward, and build the standard as VIABLE does:

     ```js
     import { SKILLS } from '@viable-lab/engine/harness'; // npm i github:VIABLE-Learning-Lab/viable

     // code: an indicator's code, such as CT.2.2; level: 1 to 4 (SKILLS.levels).
     function skillStandard(code, level) {
       for (const skill of SKILLS.skills) for (const subskill of skill.subskills) for (const indicator of subskill.indicators) {
         if (indicator.code !== code) continue;
         const at = (n) => indicator.items.map((item) => item.levels[n - 1]);
         return {
           kind: 'skill', uuid: indicator.id, code, description: `${skill.name}: ${indicator.description}`,
           level: { number: level, name: SKILLS.levels[level - 1] },
           learning_components: at(level).map(([id, description]) => ({ id, description })),
           prior: level > 1 ? at(level - 1).map(([uuid, description], i) => ({ uuid, code: `${indicator.items[i].code}.${level - 1}`, description })) : [],
           source: { name: SKILLS.framework.name, license: SKILLS.framework.license, attribution: [SKILLS.framework.attribution], modified: SKILLS.framework.modified }
         };
       }
       throw new Error(`No skill indicator ${code}.`);
     }
     ```

     `schemas/examples/teaching.example.json` holds CT.2.2 at level 3 built this way.
   - A K-12 standard: the harness has no standards search. Use a standard the teacher already has
     from Learning Commons' Knowledge Graph, as it is, with its `uuid`, `code`, `description` and
     `source.attribution`. Never make up a `uuid` or a code; without a real record, leave `standard`
     null and say the aim in `goal`.
3. **Choose misconceptions to listen for (math).** Search with the `find_misconceptions` tool
   (`{"text": "adding fractions with unlike denominators"}`) or
   `viable-harness misconceptions "adding fractions with unlike denominators" --json`; a standard's
   description works as the text too. Pick at most 8 that fit the activity, and copy each exactly:

   ```json
   { "id": "<the misconception's id>", "description": "<its description>", "construct": { "id": "<the construct's id>", "description": "<the construct's description>" } }
   ```

   Leave out `source` and Eedi's attribution (CC BY 4.0) is filled in. Outside math, leave
   `misconceptions` empty.
4. **Check the settings.** Validate with the `validate_document` tool
   (`{"document": {...}, "kind": "teaching"}`) or `viable-harness validate teaching.json --kind teaching`,
   and fix every error. Then
   read what the AI will be told with the `teaching_instructions` tool (`{"teaching": {...}}`, and
   `"section"` for each section): check that `instructions` says what the teacher meant, and that
   `watch_for` appears only beside it.
5. **Try it on the agent** with the `run_agent` tool and `teaching`, or

   ```sh
   viable-engine run <agent.json | package.json> --teaching teaching.json --input "..."
   ```

   For more than a look, write agent tests (the writing-agent-tests skill).

## Don't

- Don't put a learner's name or anything about one learner in any field: the settings go to a model.
- Don't promise an outcome in `goal`, or write rules for the AI in `watch_for`.
- Don't paste a standard or misconception you didn't get from a real record.
