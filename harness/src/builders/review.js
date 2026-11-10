// viable-harness review: reads a project someone is building for learners, and says what a classroom would trip on.
// Patterns in text, with no model and no network, so it runs anywhere and nothing leaves the computer. It says what to look at, never that a tool is safe.
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.output', 'vendor', 'coverage', '.venv', 'venv', '__pycache__', '.wrangler', '.vercel', '.netlify', 'out', '.svelte-kit', 'target', 'test', 'tests', '__tests__', 'fixtures']);
const TEXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.html', '.htm', '.py', '.rb', '.php', '.go', '.rules', '.json', '.sql', '.toml', '.yaml', '.yml', '.txt']);
const MOST = { bytes: 512 * 1024, files: 5000 };

const SERVER = /(^|\/)(api|server|servers|backend|functions|edge-functions|workers?|lambda|scripts?)(\/|$)|(^|\/)(route|middleware|server|worker)\.[a-z]+$|\.(server|config)\.[a-z]+$/;
const PAGE_FILE = /\.(html?|vue|svelte|astro|jsx|tsx)$/;
const MODEL_CALL = /chat\.completions\.create|\/chat\/completions|messages\.create\(|generateContent\(|generateContentStream\(|responses\.create\(|streamText\(|generateText\(|:(?:stream)?generateContent\b|api\.anthropic\.com\/v1\/messages/i;
const FUNCTION_ONLY = /^\s*["']use server["']/m;
const PUBLIC_FOLDER = /(^|\/)(public|static|assets|wwwroot)\//;

// Whether a browser gets this file. A guess from where it lives and what it uses: wrong guesses cost a line to read.
function inBrowser(path, text, project) {
  if (!/\.(html?|vue|svelte|astro|jsx|tsx|js|ts|mjs)$/.test(path)) return false;
  // Whatever a site serves as it is reaches the browser, wherever else it looks like it belongs.
  if (PUBLIC_FOLDER.test(path)) return true;
  if (SERVER.test(path) || FUNCTION_ONLY.test(text)) return false;
  // In Next's app folder a component runs on the server unless it says otherwise.
  if (project.next && /(^|\/)app\//.test(path) && !/^\s*["']use client["']/m.test(text)) return false;
  // A front end's source folder is bundled for the browser, whatever a file in it looks like alone.
  return PAGE_FILE.test(path) || /\b(document\.|window\.|localStorage|useState\()/.test(text) || (project.frontSource && /^src\//.test(path));
}
const isPublicData = (path) => PUBLIC_FOLDER.test(path) && path.endsWith('.json');

const isComment = (line) => /^\s*(\/\/|#(?!!)|\*|<!--)/.test(line);
// A line someone has looked at can say so, with why: `viable-review: ok`, on it or the line above.
const settled = (file, index) => /viable-review:\s*ok/.test(file.lines[index]) || /viable-review:\s*ok/.test(file.lines[index - 1] ?? '');
const linesMatching = (file, pattern) => file.lines.flatMap((line, index) => (!isComment(line) && pattern.test(line) && !settled(file, index) ? [index + 1] : []));
const each = (test) => (project) => project.files.flatMap((file) => (test(file, project) || []).map((line) => ({ file: file.path, line })));

const SECRET = /\b(sk-(?:ant-|proj-|or-v1-)?[A-Za-z0-9_-]{20,}|viable_sk_[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|hf_[A-Za-z0-9]{30,}|sb_secret_[A-Za-z0-9_-]{20,})\b/;
const PUBLIC_ENV = /\b(?:NEXT_PUBLIC_|VITE_|REACT_APP_|NUXT_PUBLIC_|PUBLIC_|EXPO_PUBLIC_)[A-Z0-9_]*(?:KEY|SECRET|TOKEN)\b/g;
const MEANT_TO_BE_PUBLIC = /FIREBASE|SUPABASE_(?:ANON|PUBLISHABLE)|PUBLISHABLE|RECAPTCHA|TURNSTILE|SITE_KEY|MAPBOX|POSTHOG|SENTRY/;
const PROVIDER = /https:\/\/(?:api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|openrouter\.ai\/api|api\.groq\.com|api\.x\.ai|api\.viablelab\.org\/v1\/(?:chat\/completions|responses|agents\/[^/"'`]+\/run))/;
const BY_ADDRESS = /\b(req\.ip|request\.ip|remoteAddress|get_remote_address|getClientIp|clientIp|client_ip|ip_address)\b|x-forwarded-for|cf-connecting-ip|x-real-ip|\.limit\(\s*ip\b/i;
const LIMITER = /rate.?limit|slowapi|throttl|flask_limiter|\blimiter\b|\b429\b|too many/i;
const ANSWER = /(?<![@:.\w-])["']?\b(correct_?answer|correct_?option|answer_?key|correct|is_?correct|answer)\b["']?\s*[:=]\s*(["'`]?[\d[/]|true\b|false\b|["'`][^"'`\s]{1,24}["'`])|\b(q|question|prompt)\s*:\s*["'`].*\b(a|ans)\s*:\s*["'`\d]/i;
const ANSWER_SET = /\b(solutions?|answers|answer_?keys?)\b\s*[:=]\s*[[{]/i;
// A name put into what the model is told: "The student's name is {name}", or content: `Hi ${firstName}`.
const NAME_IN_PROMPT = /(student|learner|pupil|child)(?:'s|’s)?\s+name\s+is|(content|prompt|system|instruction)\b.*(\$\{\s*(first_?|student_?|learner_?)?name\s*\}|\{(first_?|student_?|learner_?)?name\}|["'`]\s*\+\s*(first_?|student_?|learner_?)?name\b)/i;
const LEARNER_NAME = /\b(student|learner|pupil|child|kid)s?(\.|_|\[["'])(name|first_?name|last_?name|full_?name|email)\b|\b(student|learner|pupil|child)_?name\b|\bdisplayName\b/i;
const OUTPUT_LIMIT = /max_tokens|max_completion_tokens|maxOutputTokens|maxTokens|max_output_tokens|maxCompletionTokens/;
const BUDGET_WORDS = /budget|quota|spend|credit|daily.?limit|per.?day|cost.?limit|max.?cost/i;
const TEACHER_WORDS = /teacher|instructor|admin|dashboard/i;
const SHOWS_ITS_FOLDER = /static\(\s*(__dirname|process\.cwd\(\)|["'`]\.\.?\/?["'`]|path\.(join|resolve)\(\s*__dirname\s*(,\s*["'`]\.\.\/?["'`]\s*)?\))\s*\)|(join|resolve)\(\s*(process\.cwd\(\)|__dirname)\s*,[^)]*\b(req|request)\.url/;
const TRACKER = /googletagmanager\.com|google-analytics\.com|\bgtag\(|\bfbq\(|connect\.facebook\.net|static\.hotjar\.com|clarity\.ms|cdn\.segment\.com|\bmixpanel\.|\bposthog\./i;

export const RULES = [
  {
    id: 'secret-in-code', level: 'must', title: 'A secret key written into the code',
    why: 'A key goes wherever the code goes: into the page, a shared folder or a public repository, where anyone can spend on it.',
    fix: 'Put it in the host’s secret settings, read it on a server, and make a new key: this one has been seen.',
    find: each((file) => (/\.json$/.test(file.path) && /(^|\/)package(-lock)?\.json$/.test(file.path) ? [] : linesMatching(file, SECRET).filter((line) => !(/AIza/.test(file.lines[line - 1]) && /authDomain/.test(file.text)))))
  },
  {
    id: 'model-called-from-the-page', level: 'must', title: 'A model called from the page itself',
    why: 'Whatever the page uses to call a model, a learner can read from its source and use: a class can spend without end, on anything.',
    fix: 'Have the page call your own server, which holds the key, knows the class’s budget and calls the model.',
    find(project) {
      return each((file) => {
        const exposed = file.lines.flatMap((line, index) => (isComment(line) ? [] : (line.match(PUBLIC_ENV) || []).some((name) => !MEANT_TO_BE_PUBLIC.test(name)) ? [index + 1] : []));
        return [...exposed, ...linesMatching(file, /dangerouslyAllowBrowser\s*:\s*true/), ...(inBrowser(file.path, file.text, project) ? linesMatching(file, PROVIDER) : [])];
      })(project);
    }
  },
  {
    id: 'open-database', level: 'must', title: 'A database anyone can read or write',
    why: 'Rules like these let anyone with the page’s address read every learner’s work, or change it. Most reports of leaked school data begin here.',
    fix: 'Let each learner reach only their own rows, and the teacher their class’s. Add it before any real learner uses it.',
    find: each((file) => {
      if (/\.rules$/.test(file.path)) return linesMatching(file, /allow\s+[\w, ]*(read|write)[\w, ]*(;|:\s*if\s+(true\b|request\.time\s*<))/);
      if (/(database|firebase).*rules.*\.json$/.test(basename(file.path))) return linesMatching(file, /"\.(read|write)"\s*:\s*("true"|true)/);
      return [];
    })
  },
  {
    id: 'env-can-be-committed', level: 'must', title: 'A .env file git isn’t told to ignore',
    why: 'The keys in it go into the repository with the next commit, and from there anywhere.',
    fix: 'Add .env to .gitignore. If it has been committed, make new keys: the old ones have been seen.',
    find: (project) => project.envFiles.filter((name) => !/(^|\n)[ \t]*\/?(\*?\.env\*?|\.env\.\*)[ \t]*(\r?\n|$)/.test(project.gitignore) && !new RegExp(`(^|\\n)[ \\t]*/?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*(\\r?\\n|$)`).test(project.gitignore)).map((file) => ({ file, line: 1 }))
  },
  {
    id: 'server-shows-its-folder', level: 'must', title: 'A server handing out its whole folder',
    why: 'Anyone can ask it for its code, its .env, its database and its answers, by name.',
    fix: 'Serve only a folder that holds nothing else, such as public/.',
    find: each((file) => (/\.(js|ts|mjs|cjs)$/.test(file.path) ? linesMatching(file, SHOWS_ITS_FOLDER) : []))
  },
  {
    id: 'limit-by-address', level: 'must', title: 'A rate limit counted by address',
    why: 'A whole school usually reaches the internet from one address, so the limit treats thirty learners as one, and it stops the class a few minutes into the lesson.',
    fix: 'Count per learner or per class. Where you must count by address, as for signing in, allow for a whole school behind it.',
    find: each((file) => {
      if (!LIMITER.test(file.text)) return [];
      const unkeyed = /keyGenerator/.test(file.text) ? [] : linesMatching(file, /\brateLimit\(\s*\{/);
      return [...new Set([...linesMatching(file, BY_ADDRESS), ...unkeyed])];
    })
  },
  {
    id: 'sign-in-limits', level: 'look', title: 'A sign-in with a limit a class can hit',
    why: 'By default Supabase allows 30 anonymous sign-ins an hour from one address, 30 sign-ups or sign-ins in 5 minutes from one address, and 2 emails an hour from its built-in sender. Thirty learners signing in at 9:05 meet all three.',
    fix: 'Raise them in the project’s settings, add your own email sender, or let learners in by a class code and no account.',
    find: each((file) => (/supabase/i.test(file.text) ? linesMatching(file, /\.auth\.(signInAnonymously|signInWithOtp|signUp|resetPasswordForEmail)\(/) : []))
  },
  {
    id: 'prompt-in-the-page', level: 'look', title: 'What the AI is told, in the page',
    why: 'Learners can read it and change it, and an answer key in it is one they can read.',
    fix: 'Keep what the AI is told on the server, and don’t let a request from the page replace it.',
    find(project) { return each((file) => (inBrowser(file.path, file.text, project) ? linesMatching(file, /\brole\s*:\s*["'`]system["'`]|\bsystem_?instruction\b|\bsystem_?prompt\b\s*[:=]|\bsystem\s*:\s*["'`]/i).slice(0, 3) : []))(project); }
  },
  {
    id: 'answers-in-the-page', level: 'look', title: 'Answers the page can read',
    why: 'The class can read them with View Source. A browser’s word that an answer was right can’t be trusted either.',
    fix: 'Fine for practice nobody is graded on. For anything that counts, keep answers on a server, and check there.',
    find(project) {
      return each((file) => (((inBrowser(file.path, file.text, project) || isPublicData(file.path)) && /question|quiz|prompt|exercise|\bq\s*:/i.test(file.path + file.text)) ? [...linesMatching(file, ANSWER), ...linesMatching(file, ANSWER_SET)].slice(0, 1) : []))(project);
    }
  },
  {
    id: 'no-output-limit', level: 'look', title: 'A model call with no end to its answer',
    why: 'Nothing here stops one long answer, or one learner’s loop, from spending the class’s budget.',
    fix: 'Set the most tokens on each call, and count a day’s spending per class on your server, with a plain message when it runs out.',
    find: each((file) => (MODEL_CALL.test(file.text) && !OUTPUT_LIMIT.test(file.text) ? linesMatching(file, MODEL_CALL).slice(0, 1) : []))
  },
  {
    id: 'no-budget', level: 'look', title: 'A model called, and nothing that looks like a budget',
    why: 'A class can spend without end. Finding the word doesn’t mean it works, and not finding it usually means it isn’t there.',
    fix: 'Count a day’s spending per class on your server, and stop with a plain message at a limit the teacher can change.',
    find(project) {
      const calling = project.files.filter((file) => MODEL_CALL.test(file.text));
      return !calling.length || project.files.some((file) => BUDGET_WORDS.test(file.text)) ? [] : [{ file: calling[0].path, line: linesMatching(calling[0], MODEL_CALL)[0] ?? 1 }];
    }
  },
  {
    id: 'no-teacher-view', level: 'look', title: 'A model called, and nothing for a teacher',
    why: 'An AI talking with learners needs an adult who can read what it says, see who is stuck and stop it.',
    fix: 'Add a page for the teacher, or use something that has one.',
    find(project) {
      const calling = project.files.filter((file) => MODEL_CALL.test(file.text));
      return !calling.length || project.files.some((file) => TEACHER_WORDS.test(file.path) || TEACHER_WORDS.test(file.text)) ? [] : [{ file: calling[0].path, line: linesMatching(calling[0], MODEL_CALL)[0] ?? 1 }];
    }
  },
  {
    id: 'names-to-the-model', level: 'look', title: 'A learner’s name near a model call',
    why: 'Anything in a prompt goes to the model’s provider, and for a child that can break its terms and the law. The AI doesn’t need a name to help.',
    fix: 'Send their words and what they’re working on, never who they are. If it must address them, fill the name in after the reply comes back.',
    find: each((file) => (MODEL_CALL.test(file.text) ? [...new Set([...linesMatching(file, LEARNER_NAME), ...linesMatching(file, NAME_IN_PROMPT)])].slice(0, 3) : []))
  },
  {
    id: 'name-kept-in-the-browser', level: 'look', title: 'A learner’s name kept in the browser',
    why: 'On a shared computer the next child becomes the last one, and sees their work.',
    fix: 'Ask who is here on each visit where computers are shared, and offer a clear way to leave.',
    find(project) { return each((file) => (inBrowser(file.path, file.text, project) ? linesMatching(file, /localStorage\.setItem\(\s*["'`][^"'`]*(name|student|learner|email)[^"'`]*["'`]/i) : []))(project); }
  },
  {
    id: 'trackers', level: 'look', title: 'An analytics or advertising script on a page',
    why: 'On a learner’s page it gives another company an identifier for a child, which schools and children’s privacy law are strict about.',
    fix: 'Leave it off pages learners open. Count what you need on your own server, without identifiers.',
    find(project) { return each((file) => (inBrowser(file.path, file.text, project) ? linesMatching(file, TRACKER).slice(0, 1) : []))(project); }
  },
  {
    id: 'tables-with-no-row-rules', level: 'look', title: 'Tables with no row-level rules',
    why: 'On Supabase, a table without row-level security can be read with the key the page already has.',
    fix: 'Turn on row-level security on every table, and write who can reach what.',
    find(project) {
      if (project.files.some((file) => /\.sql$/.test(file.path) && /row level security/i.test(file.text)) || !project.files.some((file) => /supabase/i.test(file.path) || /supabase/i.test(file.text))) return [];
      return each((file) => (/\.sql$/.test(file.path) ? linesMatching(file, /create table/i).slice(0, 1) : []))(project);
    }
  }
];

function read(folder) {
  const files = [];
  const envFiles = [];
  const walk = (at) => {
    for (const name of readdirSync(at).sort()) {
      if (files.length >= MOST.files) return;
      const path = join(at, name);
      // A link can lead out of the project, or round in a circle.
      const stat = lstatSync(path, { throwIfNoEntry: false });
      if (!stat || stat.isSymbolicLink() || /\.min\.js$|\.(test|spec)\.[a-z]+$/.test(name)) continue;
      if (stat.isDirectory()) { if (!SKIP.has(name) && !(name.startsWith('.') && name !== '.github')) walk(path); continue; }
      if (/^\.env(\.(?!example|sample|template)[\w-]+)?$/.test(name)) envFiles.push(relative(folder, path).split(sep).join('/'));
      if (!TEXT.has(extname(name)) || stat.size > MOST.bytes || /(^|\.)lock(\.|$)|-lock\.json$/.test(name)) continue;
      const text = readFileSync(path, 'utf8');
      files.push({ path: relative(folder, path).split(sep).join('/'), text, lines: text.split(/\r?\n/) });
    }
  };
  walk(folder);
  let gitignore = '';
  try { gitignore = readFileSync(join(folder, '.gitignore'), 'utf8'); } catch { /* none */ }
  return { files, envFiles, gitignore, next: files.some((file) => /(^|\/)next\.config\.[a-z]+$/.test(file.path)), frontSource: files.some((file) => /^src\/.*\.(jsx|tsx|vue|svelte)$/.test(file.path)) };
}

/** What a project's text suggests, most serious first. Lines say where to look; a secret itself is never repeated. */
export function reviewProject(folder) {
  const project = read(folder);
  const findings = RULES.flatMap(({ find, ...rule }) => {
    const at = find(project);
    return at.length ? [{ ...rule, at }] : [];
  });
  return { checked: project.files.length, findings, must: findings.filter((finding) => finding.level === 'must').length };
}

export const REVIEW_LIMIT = 'This reads patterns in text, so a clean result isn’t a pass. It can’t see whether a budget works, what happens when a learner says something alarming, whether a teacher would notice, or accessibility. Rehearse those, test how its AI replies, and have the school look at anything real learners use.';

export function printReview({ checked, findings }, write = console.log) {
  const shown = (finding) => [`  ${finding.title}`, `    ${finding.at.slice(0, 5).map(({ file, line }) => `${file}:${line}`).join(', ')}${finding.at.length > 5 ? `, and ${finding.at.length - 5} more` : ''}`, `    Why: ${finding.why}`, `    Do: ${finding.fix}`];
  write(`Read ${checked} file${checked === 1 ? '' : 's'}. No model was called, and nothing left this computer.`);
  for (const [level, heading] of [['must', 'Fix before learners use it'], ['look', 'Look at these']]) {
    const these = findings.filter((finding) => finding.level === level);
    if (these.length) write(`\n${heading}\n${these.map((finding) => shown(finding).join('\n')).join('\n\n')}`);
  }
  if (!findings.length) write('\nNothing it looks for turned up.');
  write(`\n${REVIEW_LIMIT}`);
}
