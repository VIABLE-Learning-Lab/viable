/** viable-engine inspect: the report in server/inspect.js, printed for people, or exact with --json. */
import { basename } from 'node:path';
import { readAgentFile } from '../run.js';
import { inspectPackage } from '../server/inspect.js';
import { TARGET_NAMES, TARGETS } from '../server/targets.js';
import { MODEL_OPTIONS, RULE, blue, bold, columns, command, dim, plainStrings, planOf, plural, red, stopped, usageError, wrap, yellow } from './common.js';

const heading = (title, note = '') => `\n${bold(title)}${note ? `  ${dim(note)}` : ''}`;

function printReport(report) {
  const out = [];
  out.push(`${bold(report.title)}`);
  out.push(dim(`${report.format === 'viable.course-package' ? (report.activities.length ? 'course package' : 'package') : report.format === 'viable.agent' ? 'agent file' : 'graph'}, ${basename(report.file)}${report.exported_at ? `, downloaded ${report.exported_at.slice(0, 10)}` : ''}`));
  out.push(dim(RULE));

  out.push(heading(`Agents`, plural(report.agents.length, 'agent')));
  out.push(columns(report.agents.map((agent) => [bold(agent.slug), agent.name, dim(agent.address)])));

  out.push(heading('Models', 'each must exist on your endpoint, or be replaced'));
  const roles = report.models.map((row) => [row.role, row.replaced_by ? `${dim(row.model)} ${blue('→')} ${bold(row.replaced_by)}` : bold(row.model), dim(`${row.steps.slice(0, 3).join(', ')}${row.steps.length > 3 ? `, ${row.steps.length - 3} more` : ''}${row.default ? ' (the default reviewer)' : ''}`)]);
  out.push(roles.length ? columns(roles) : `  ${dim('This package calls no model.')}`);

  out.push(heading('What these models turn on', 'with what you gave here; a running server may have more, set at /console'));
  out.push(columns(report.features.map((item) => [item.label, item.on ? bold('on') : dim('off'), dim(item.on ? item.why : `${item.why} Set "${item.models_file}" in a models file, or at /console.`)])));

  out.push(heading('Knowledge', report.knowledge_bases.length ? 'searched here by keywords, and by meaning when a model for it is set' : ''));
  if (!report.knowledge_bases.length) out.push(`  ${dim('None.')}`);
  for (const kb of report.knowledge_bases) {
    const held = [plural(kb.files, 'file'), kb.text_copies ? plural(kb.text_copies, 'text copy').replace('copys', 'copies') : null, kb.websites.length ? plural(kb.websites.length, 'website') : null, kb.searched ? null : 'no agent searches it'].filter(Boolean).join(', ');
    const onViable = kb.search_on_viable ? `${kb.search_on_viable === 'hybrid' ? 'keywords and meaning' : 'keywords only'} on VIABLE` : 'how VIABLE searched it isn\'t in this package';
    out.push(`  ${bold(kb.name)} ${dim(`(${kb.ref})`)}  ${held}`);
    out.push(`    ${dim(onViable)}`);
    for (const site of kb.websites) out.push(`    ${dim(`${site.kind}: ${site.url}${site.pages ? `, ${plural(site.pages, 'page')}` : ''}, ${site.snapshot_pages ? `${plural(site.snapshot_pages, 'page')} in its snapshot` : 'no snapshot'}`)}`);
  }

  out.push(heading('Chat pages'));
  out.push(report.chat_pages.length ? columns(report.chat_pages.map((page) => [page.title || page.agent_ref || 'chat page', page.sites.length ? `allowed on ${page.sites.join(', ')}` : 'allowed on any site', page.daily_limit ? dim(`${page.daily_limit} messages a day`) : ''])) : `  ${dim('No chat page\'s settings are in this package.')}`);

  out.push(heading('Activities', report.activities.length ? plural(report.activities.length, 'activity').replace('activitys', 'activities') : ''));
  out.push(report.activities.length ? columns(report.activities.map((item) => [item.title, dim(item.agent_ref ? `agent ${item.agent_ref}` : 'no agent'), dim(item.has_teaching ? 'How the AI helps is set' : '')])) : `  ${dim('None: this is an agent, not a course.')}`);

  const limited = report.steps.filter((step) => Object.keys(step.limits).length);
  out.push(heading('Steps', `${report.steps.length - limited.length} of ${report.steps.length} kinds of step run the same everywhere`));
  for (const step of limited) {
    const places = Object.keys(step.limits);
    const reasons = [...new Set(Object.values(step.limits))];
    out.push(wrap(`${bold(step.type)}  ${places.length === TARGET_NAMES.length ? 'everywhere' : places.join(', ')}: ${reasons.join('; ')}`));
  }
  if (!limited.length) out.push(`  ${dim('Nothing it uses is out of reach on any target.')}`);
  if (report.calls_out.length) {
    out.push(heading('It calls out to'));
    out.push(columns(report.calls_out.map((call) => [`${call.agent}/${call.step}`, dim(call.kind.replaceAll('_', ' ')), call.starts ? `starts ${call.starts.join(' ')}` : call.address ?? ''])));
  }

  out.push(heading('Settings it needs'));
  out.push(columns(report.settings.map((item) => [bold(item.name), item.secret ? yellow('secret') : dim('setting'), dim(item.why)])));

  if (report.warnings.length) {
    out.push(heading('Warnings', plural(report.warnings.length, 'warning')));
    for (const warning of report.warnings) out.push(wrap(warning, '    ', `  ${red('!')} `));
  }

  if (report.notes.length) {
    out.push(heading('Left out when it was downloaded'));
    for (const note of report.notes) out.push(wrap(note));
  }

  out.push(heading('Next'));
  if (report.next.replace_models.length) out.push(wrap(`Choose what replaces each model your endpoint doesn't have: --map ${report.next.replace_models[0]}=<model>, once per model, or --models models.json.`));
  out.push(`  ${blue(report.next.command)}`);
  out.push(wrap(dim(`Targets: ${TARGET_NAMES.map((name) => `${name} (${TARGETS[name].label})`).join(', ')}.`)));
  console.log(out.join('\n'));
}

export const inspectCommand = (argv) => command(argv, { ...MODEL_OPTIONS, target: { type: 'string' } }, async (values, positionals) => {
  const file = positionals[0];
  if (!file) throw usageError('Name the package: viable-engine inspect <course.viable.zip | package.json | agent.json>.');
  if (values.target && !TARGET_NAMES.includes(values.target)) throw usageError(`--target takes one of ${TARGET_NAMES.join(', ')}, not "${values.target}".`);
  const plan = planOf(values);
  let read;
  try { read = await readAgentFile(file); } catch (error) { throw stopped(error.code === 'ENOENT' ? `There is no file ${file}.` : error.message); }
  let report;
  try { report = await inspectPackage({ doc: read.doc, zip: read.zip, file, plan, target: values.target ?? null }); } catch (error) { throw stopped(error.message, 'Download the package from VIABLE again, or fix what this names.'); }
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else printReport(plainStrings(report));
});
