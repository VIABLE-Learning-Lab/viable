// Writes docs/designs.md from src/designs.js, so the page and what Ask and the MCP tool read are one. Run with `npm run designs:build`; never edit the page by hand.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ACTIVITY_DESIGNS, DESIGN_RULES } from '../src/designs.js';

export const designsPath = fileURLToPath(new URL('../docs/designs.md', import.meta.url));
const SHOWS = { page: 'a page to read', questions: 'questions', writing: 'writing', embed: 'a web page', reading: 'a PDF to read' };

export function designsPage() {
  return [
    '# Ways to arrange an activity',
    '',
    '<!-- Generated from src/designs.js by npm run designs:build. Do not edit. -->',
    '',
    'What a whole activity can be, from research. [Guidance](components.md) says what an AI should do at a moment in a conversation; a design says what learners do from start to end, so a conversation has a reason to happen. Most of these studies are on classrooms and human tutors, and each design says what isn\'t known.',
    '',
    'Ask on the VIABLE Learning Platform chooses from these. So can your agent, with the MCP tool `find_designs`, `viable-harness designs` or `findDesigns`. `reviewActivity` reads an activity against the rules below, with no model.',
    '',
    '## What holds for any of them',
    '',
    ...DESIGN_RULES.map((rule) => `- ${rule}`),
    '',
    ...ACTIVITY_DESIGNS.flatMap((design) => [
      `## ${design.label}`,
      '',
      `**For:** ${design.for} **About:** ${design.minutes} minutes.`,
      '',
      `**What the studies show:** ${design.shows}`,
      '',
      `**What isn't known:** ${design.unknown}`,
      '',
      `**Sources:** ${design.sources.join('; ')}.`,
      '',
      ...design.steps.map((step, index) => `${index + 1}. **${step.title}** (${SHOWS[step.panel] || step.panel}, ${step.ai === 'on' ? 'with the AI' : 'on their own'}). ${step.write}${step.ai_does ? ` The AI: ${step.ai_does}` : ''}`),
      ''
    ])
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(designsPath, designsPage());
  console.log(`Wrote ${ACTIVITY_DESIGNS.length} designs to ${designsPath}`);
}
