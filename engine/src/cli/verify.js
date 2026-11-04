/**
 * viable-engine verify: a deployed server, checked end to end from outside. Health, its token, its
 * agents, what it's running, its chat page and, only when asked (--turn, since it costs a model call),
 * a real turn; then the line to put on a site and the origins that site's Content-Security-Policy
 * must allow.
 */
import { RULE, blue, bold, command, dim, green, red, stopped, usageError, wrap, yellow } from './common.js';

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
const TIMEOUT_MS = 15000;
const TURN_TIMEOUT_MS = 300000;
// A question any agent can take; history_mode none keeps no conversation on the server.
const PROBE = 'Hello. In one sentence, what can you help me with?';

/** The report: { object, url, ok, checks: [{ id, status: pass|warn|fail|skip, detail, fix }], server, features: what is on and off and why, behind the token, agents, embed }. */
export async function verifyServer(address, { token = null, turn = false, agent = null, input = PROBE, fetch = (...args) => globalThis.fetch(...args) } = {}) {
  const base = address.replace(/\/+$/, '');
  const origin = new URL(base).origin;
  const local = LOCAL.has(new URL(base).hostname);
  const checks = [];
  let agents = null;
  let server = null;
  let embed = null;
  const finish = () => ({ object: 'harness.verification', url: base, ok: !checks.some((item) => item.status === 'fail'), checks, server, features: server?.features ?? null, agents: (agents || []).map((item) => item.slug), embed });
  const note = (id, status, detail, fix = null) => { checks.push({ id, status, detail, fix }); return status !== 'fail'; };
  const call = async (path, { auth = true, method = 'GET', body, timeout = TIMEOUT_MS } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method, signal: AbortSignal.timeout(timeout),
      headers: { ...(auth && token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* A page, not an answer. */ }
    return { status: response.status, json, text, headers: response.headers };
  };

  if (!local && !base.startsWith('https://')) note('https', 'warn', 'It is reached over plain HTTP, so tokens and learners\' messages cross the network unencrypted.', 'Put it behind HTTPS before learners use it.');
  let health;
  try { health = await call('/health', { auth: false }); } catch (error) {
    note('health', 'fail', `Nothing answered at ${base}/health (${error.cause?.code || error.name}).`, 'Check the address, and that the deploy finished. The deploy\'s output prints the address.');
    return finish();
  }
  if (health.status !== 200 || health.json?.status !== 'ok') {
    note('health', 'fail', `${base}/health answered ${health.status}, not the harness's {"status": "ok"}.`, 'Is this address the harness? A Worker that failed to start answers 500; read its logs (wrangler tail, or your cloud\'s log view).');
    return finish();
  }
  note('health', 'pass', `It answers, and serves ${health.json.agents} agent${health.json.agents === 1 ? '' : 's'}.`);

  // Without the token, a caller must be refused.
  const open = await call('/v1/agents', { auth: false });
  if (open.status === 503 && open.json?.error?.code === 'token_not_set') {
    note('token', 'fail', 'The server has no token set, so it refuses to run agents.', 'Set VIABLE_ENGINE_TOKEN where it runs (the scaffold\'s README has the exact command), and deploy again if your cloud needs it.');
    return finish();
  }
  if (open.status === 200) note('token', local ? 'warn' : 'fail', 'Anyone who can reach this address can run agents on your model keys: it answered without a token.', 'Set a token (--token-env on serve; VIABLE_ENGINE_TOKEN on a deployed server).');
  else if (open.status === 401) note('token', 'pass', 'A caller without the token is refused.');
  else note('token', 'warn', `A call without the token answered ${open.status}, not 401.`);

  // With it, the agents.
  if (open.status === 200) agents = open.json?.data ?? [];
  if (!token && open.status === 401) note('agents', 'skip', 'Not checked: no token was given.', 'Give the token with --token-env <NAME>.');
  else if (token) {
    const listed = await call('/v1/agents');
    if (listed.status === 401) { note('agents', 'fail', 'The token you gave was refused.', 'Is it the token the server has? A secret on a cloud can\'t be read back: set it again if you are unsure.'); return finish(); }
    if (listed.status !== 200 || !Array.isArray(listed.json?.data)) { note('agents', 'fail', `GET /v1/agents answered ${listed.status}.`, 'Read the server\'s logs.'); return finish(); }
    agents = listed.json.data;
    note('agents', 'pass', agents.map((item) => item.slug).join(', ') || 'none');
  }
  const running = token || open.status === 200 ? await call('/v1/server').catch(() => null) : null;
  if (running?.status === 200) server = running.json;
  if (server) note('package', 'pass', `Harness ${server.harness_version}; ${(server.packages || []).map((item) => `${item.title || item.file}${item.exported_at ? `, downloaded ${item.exported_at.slice(0, 10)}` : ''}`).join('; ')}; ${server.conversations ? 'keeps conversations' : 'keeps nothing between requests'}.`);

  const slug = agent || agents?.[0]?.slug || null;
  if (agent && agents && !agents.some((item) => item.slug === agent)) note('agent', 'fail', `It serves no agent "${agent}".`, `It serves: ${agents.map((item) => item.slug).join(', ')}.`);

  // The chat page, which has no token: a learner opens it.
  if (!slug) note('chat_page', 'skip', 'Not checked: which agent? Its address needs the agent\'s slug.', 'Give the token with --token-env <NAME>, or the agent with --agent <slug>.');
  else {
    const page = await call(`/chat/${encodeURIComponent(slug)}`, { auth: false }).catch((error) => ({ status: 0, error }));
    const script = await call('/embed.js', { auth: false }).catch((error) => ({ status: 0, error }));
    if (page.status === 200 && script.status === 200) {
      note('chat_page', 'pass', `${base}/chat/${slug} opens, and the widget's script is at ${base}/embed.js.`);
      embed = {
        script: `<script src="${origin}/embed.js" data-agent="${slug}" async></script>`,
        page: `${base}/chat/${slug}`,
        // The widget's script loads, fetches its settings, opens the chat in a frame and shows its avatar.
        content_security_policy: { 'script-src': [origin], 'connect-src': [origin], 'frame-src': [origin], 'img-src': [origin] }
      };
    } else if (page.status === 404 || page.status === 401) note('chat_page', 'skip', `${base}/chat/${slug} answers 404: this server has no chat page for it.`, `Apps can still call its API, and a course's activities open from ${base}/.`);
    else note('chat_page', 'fail', `${base}/chat/${slug} answered ${page.status || page.error?.name}, and ${base}/embed.js ${script.status || script.error?.name}.`, 'Read the server\'s logs.');
  }

  if (turn) {
    if (!slug) note('turn', 'fail', 'No agent to run: give a token with --token-env, or name one with --agent.');
    else {
      const started = Date.now();
      try {
        const answered = await call(`/v1/agents/${encodeURIComponent(slug)}/runs`, { method: 'POST', timeout: TURN_TIMEOUT_MS, body: { input, history_mode: 'none', include: ['trace'] } });
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        if (answered.status !== 200) note('turn', 'fail', `${slug} answered ${answered.status}: ${answered.json?.error?.message ?? answered.text.slice(0, 200)}`, /model|provider/i.test(answered.json?.error?.code ?? '') ? 'That is your model endpoint\'s answer: check OPENAI_BASE_URL, OPENAI_API_KEY, and that each model exists there (viable-engine inspect).' : null);
        else {
          const models = [...new Set((answered.json.trace?.steps || []).map((step) => step.model).filter(Boolean))];
          const vetting = (answered.json.trace?.vetting || []).map((item) => item.outcome);
          note('turn', answered.json.output?.text && models.length ? 'pass' : 'warn', `${slug} replied in ${seconds} s${models.length ? `, with ${models.join(', ')}` : ''}${vetting.length ? `; the check: ${vetting.join(', ')}` : ''}; ${answered.json.usage?.total ?? 0} tokens.`, models.length ? undefined : 'No step called a model, so this doesn\'t show your endpoint works: give --input something the agent\'s knowledge covers.');
        }
      } catch (error) {
        note('turn', 'fail', `The turn got no answer (${error.name}).`, 'A serverless platform may cut it off: compare its timeout with your model\'s speed.');
      }
    }
  } else note('turn', 'skip', 'Not run, since it costs a model call.', 'Add --turn to run one.');

  return finish();
}

const MARKS = { pass: green('✓'), fail: red('✕'), warn: yellow('!'), skip: dim('–') };

function printReport(report) {
  console.log(`${bold(report.url)}\n${dim(RULE)}`);
  for (const item of report.checks) {
    console.log(`${MARKS[item.status]} ${bold(item.id.replaceAll('_', ' '))}  ${item.status === 'skip' ? dim(item.detail) : item.detail}`);
    if (item.fix) console.log(wrap(item.status === 'fail' ? item.fix : dim(item.fix)));
  }
  if (report.features) {
    console.log(`\n${bold('What is on')}  ${dim('set at /console, or where it starts')}`);
    for (const item of report.features) console.log(`${item.on ? green('✓') : dim('–')} ${item.on ? `${item.label}: on` : dim(`${item.label}: off`)}  ${dim(item.why)}`);
  }
  if (report.embed) {
    console.log(`\n${bold('On your site')}  ${dim('swap the old line for this one')}`);
    console.log(`  ${blue(report.embed.script)}`);
    console.log(`\n${bold('If your site sets a Content-Security-Policy')}  ${dim('allow this origin')}`);
    for (const [directive, origins] of Object.entries(report.embed.content_security_policy)) console.log(`  ${directive} ${origins.join(' ')}`);
  }
  console.log(`\n${report.ok ? green('Nothing failed.') : red('Something failed: see above.')}`);
}

export const verifyCommand = (argv) => command(argv, { 'token-env': { type: 'string' }, turn: { type: 'boolean' }, agent: { type: 'string' }, input: { type: 'string', short: 'i' } }, async (values, positionals) => {
  const address = positionals[0];
  if (!address) throw usageError('Name the server: viable-engine verify <url> [--token-env <NAME>] [--turn] [--json].');
  try { new URL(address); } catch { throw usageError(`"${address}" isn't an address: give it whole, such as https://harness.example.edu.`); }
  const name = values['token-env'];
  if (name && !process.env[name]) throw usageError(`--token-env ${name}: ${name} isn't set in this shell.`, `export ${name}=<the server's token>, then run this again.`);
  const report = await verifyServer(address, { token: name ? process.env[name] : null, turn: values.turn === true, agent: values.agent ?? null, input: values.input ?? PROBE }).catch((error) => { throw stopped(`Couldn't check ${address}: ${error.message}`); });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  if (!report.ok) process.exitCode = 1;
});
