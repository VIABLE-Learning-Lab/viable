/**
 * The scripted tour: the signature scene playing by itself, at a person's pace, the same each time, so
 * it can be recorded. Where it is on (--demo --tour, or a static copy), the launcher's ?tour=1 clears this browser's try-out, marks where the tour runs and
 * opens that page, whose script (this one) finds the mark. A string, not a function: nothing here is
 * shared with the code around it, and only the try-out's pages carry it.
 */
export const TOUR_KEY = 'viable-try-tour';

export const TOUR_SCRIPT = String.raw`(async function () {
  let target = null;
  try { target = sessionStorage.getItem(${JSON.stringify(TOUR_KEY)}); } catch { return; }
  if (!target || !location.pathname.replace(/\/$/, '').endsWith(target)) return;
  const watch = document.getElementById('ai-watch').watch;
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reached = () => new Promise((resolve) => {
    const on = ({ detail }) => {
      if (detail?.kind === 'reached' || detail?.kind === 'failed') { removeEventListener('viable:trace', on); resolve(); }
    };
    addEventListener('viable:trace', on);
  });
  async function ask(text) {
    input.focus();
    for (const letter of still ? [text] : text) {
      input.value += letter;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(still ? 0 : 55);
    }
    await sleep(600);
    const done = reached();
    send.click();
    await done;
  }
  for (let tries = 0; tries < 100 && (document.body.classList.contains('checking') || input.disabled || (document.body.classList.contains('has-workspace') && !document.body.classList.contains('ws-ready'))); tries += 1) await sleep(100);
  // Only now: a learner not known yet was sent to the course's home first, and came back.
  sessionStorage.removeItem(${JSON.stringify(TOUR_KEY)});
  if (document.body.classList.contains('ai-corner')) document.getElementById('ws-ai')?.click();
  await sleep(900);
  watch.say('A learner gives a wrong answer.');
  await sleep(1600);
  await ask('is 1/2 + 1/3 = 2/5?');
  await sleep(1200);
  watch.say('Before the model wrote a word, it knew what this moment called for, and the one misconception that fits.');
  await sleep(5200);
  watch.say('Now they want the answer. A different move goes in.');
  await sleep(1600);
  await ask('Just tell me the answer.');
  await sleep(4200);
  watch.say('The teacher lets the AI go further.');
  await sleep(1600);
  await watch.change({ help: 'explain' });
  await sleep(2000);
  watch.say('The same message gets a different reply.');
  await sleep(1400);
  await ask('Just tell me the answer.');
  await sleep(3800);
  watch.say('A real course page and the real Harness. Only the model’s words are scripted here.');
})();`;
