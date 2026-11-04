// The Learning Commons Knowledge Graph's open release as a local standards search, so a local run can
// choose a standard without an API key. Its files are about a gigabyte: they're read as they stream,
// keeping one jurisdiction's standards with their learning components and the standards before them.
import { caseLimit } from './cases.js';
import { searchTerms } from '../utils/terms.js';

const RELEASE = 'v1.16.0';
const BASE = `https://cdn.learningcommons.org/knowledge-graph/${RELEASE}/exports`;
const LICENSE = 'https://creativecommons.org/licenses/by/4.0/';
export const JURISDICTIONS = ['Multi-State', 'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'Washington, D.C.', 'West Virginia', 'Wisconsin', 'Wyoming'];
export const SUBJECTS = ['Mathematics', 'English Language Arts', 'Science', 'Social Studies'];
const LIMITS = { components: 40, prior: 12, results: 10 };
const invalid = (message) => Object.assign(new Error(message), { code: 'invalid_resource_option', status: 400 });
const gradesOf = (value) => { try { return JSON.parse(value || '[]').map(String); } catch { return []; } };

function check({ jurisdiction, subject }) {
  if (!JURISDICTIONS.includes(jurisdiction)) throw invalid(`There is no jurisdiction "${jurisdiction}". The jurisdictions are ${JURISDICTIONS.join(', ')}.`);
  if (subject && !SUBJECTS.includes(subject)) throw invalid(`There is no subject "${subject}". The subjects are ${SUBJECTS.join(', ')}.`);
}

/** One jurisdiction's standards from the two files' lines, as standards.jsonl keeps them. */
export async function keepStandards(nodeLines, relationshipLines, { jurisdiction, subject = null }) {
  const standards = new Map();
  const components = new Map();
  for await (const line of nodeLines) {
    // The files are mostly other things: the string test spares parsing them.
    const standard = line.includes('"StandardsFrameworkItem"');
    if (!standard && !line.includes('"LearningComponent"')) continue;
    const { identifier, properties: p } = JSON.parse(line);
    if (!standard) { components.set(identifier, { id: identifier, description: p.description, attribution: p.attributionStatement }); continue; }
    if (p.jurisdiction !== jurisdiction || (subject && p.academicSubject !== subject) || p.normalizedStatementType !== 'Standard' || !p.caseIdentifierUUID) continue;
    standards.set(identifier, { uuid: p.caseIdentifierUUID.toLowerCase(), code: p.statementCode || '', description: p.description, jurisdiction: p.jurisdiction, subject: p.academicSubject, grades: gradesOf(p.gradeLevel), modified: p.dateModified || null, attribution: [p.attributionStatement], learning_components: [], prior: [] });
    standards.set(p.caseIdentifierUUID, standards.get(identifier));
  }
  for await (const line of relationshipLines) {
    if (!line.includes('"supports"') && !line.includes('"buildsTowards"')) continue;
    const { label, source_identifier: from, target_identifier: to, properties } = JSON.parse(line);
    const standard = standards.get(to);
    if (!standard) continue;
    if (label === 'supports' && components.has(from) && standard.learning_components.length < LIMITS.components) {
      const { attribution, ...component } = components.get(from);
      standard.learning_components.push(component);
      standard.attribution.push(attribution);
    } else if (label === 'buildsTowards' && standards.has(from) && standard.prior.length < LIMITS.prior) {
      const before = standards.get(from);
      standard.prior.push({ uuid: before.uuid, code: before.code, description: before.description });
      standard.attribution.push(properties?.attributionStatement);
    }
  }
  return [...new Set(standards.values())].map((standard) => ({ ...standard, attribution: [...new Set(standard.attribution.filter(Boolean))] }));
}

// As an activity's teaching settings keep a standard (teaching.js), so --teaching reads it as it reads one chosen on VIABLE.
function asChosen({ modified, attribution, ...standard }, retrieved) {
  return { ...standard, kind: 'standard', source: { name: 'Learning Commons Knowledge Graph', license: LICENSE, attribution, modified, retrieved_at: retrieved } };
}

/** Standards by words (every word first, else the most shared), by a code, or both narrowed by grade. */
export function searchStandards(all, { query = '', code = null, grade = null, limit = LIMITS.results } = {}) {
  const fitting = grade ? all.filter((item) => item.grades.includes(String(grade))) : all;
  if (code) return { match: 'code', data: fitting.filter((item) => item.code.toLowerCase() === String(code).trim().toLowerCase()) };
  const asked = searchTerms(query);
  if (!asked.length) throw invalid('Say what to look for in words of three letters or more, such as "adding fractions", or give a standard\'s --code.');
  const scored = fitting.map((item) => {
    const terms = new Set(searchTerms(`${item.code} ${item.description} ${item.learning_components.map((one) => one.description).join(' ')}`));
    return { item, shared: asked.filter((word) => terms.has(word)).length, own: searchTerms(item.description).filter((word) => asked.includes(word)).length };
  }).filter((entry) => entry.shared);
  const every = scored.filter((entry) => entry.shared === asked.length);
  // Words in the standard's own text count over words only in its learning components.
  const found = (every.length ? every : scored).sort((a, b) => b.shared - a.shared || b.own - a.own).slice(0, limit);
  return { match: every.length ? 'every_word' : 'most_words', data: found.map((entry) => entry.item) };
}

export default {
  id: 'learning-commons-knowledge-graph',
  version: 1,
  as: ['context-lookup'],
  // Every standard and learning component in the release carries CC BY 4.0 on its own row; the gated datasets aren't read.
  license: {
    spdx: ['CC-BY-4.0'],
    note: 'Only standards and learning components are kept, each marked CC BY 4.0 in its row, with its attribution. The Knowledge Graph\'s terms of use rule out high-stakes decisions such as grading or placement.',
    source: 'https://docs.learningcommons.org/knowledge-graph/resources/license'
  },
  fetchOptions: { jurisdiction: 'Multi-State', subject: null },
  async fetch(get, options) {
    check(options);
    const kept = await keepStandards(get.lines(`${BASE}/nodes.jsonl`), get.lines(`${BASE}/relationships.jsonl`), options);
    get.save('standards.jsonl', kept.map((item) => JSON.stringify(item)).join('\n'));
  },
  // Words find standards; --code gives one as teaching settings' `standard`, which --teaching reads.
  use({ read, fetched }, { query = '', code = null, grade = null, limit = null }) {
    const all = read('standards.jsonl').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    if (!query && !code) return { standards: all.length };
    const found = searchStandards(all, { query, code, grade, limit: limit == null ? undefined : caseLimit(limit, 10, 25) });
    return { match: found.match, found: found.data.map((item) => asChosen(item, fetched.fetched_at)) };
  }
};
