// Questions, one at a time, graded by the server (the page has the questions, never the keys): an
// answer is sent to …/questions, which says right or wrong, with the explanation, as the panel's
// feedback allows; hints come one at a time from the server. Each question records its time on
// screen, how often the answer changed, hints used, and whether the AI was asked first. A spoken
// question is answered aloud: recorded here (listened back, recorded again), sent as its recording
// and scored later; a written one may show a model answer to check against once it is answered.
import { CONFIG, IDLE, button, el, emit, icon, post, ready, rich } from './core.js';

export function questions(panel, api) {
  const items = panel.items || [];
  const wrap = el('div', 'ws-page questions');
  const head = el('header', 'ws-ph');
  // The kind above the title, unless the title already says it.
  head.append(...(panel.title.trim().toLowerCase() === 'questions' ? [] : [el('p', 'ws-eyebrow', 'Questions')]), el('h2', 'ws-h', panel.title));
  wrap.append(head);
  if (!items.length) { wrap.append(el('p', 'ws-muted', 'There are no questions here yet.')); return { el: wrap, state: () => ({ panel: panel.id }) }; }

  const done = {};
  let stopTake = null;
  window.addEventListener('pagehide', () => { if (stopTake) stopTake(); });
  const track = new Map(items.map((item) => [item.id, { firstSeen: 0, viewStart: 0, since: 0, active: 0, last: 0, changes: 0, hints: 0, ai: false }]));
  let index = 0;
  let response = null;
  const where = el('div', 'ws-q-where');
  const progress = el('div', 'ws-progress');
  progress.setAttribute('role', 'group');
  progress.setAttribute('aria-label', 'Questions');
  head.append(where, progress);
  const card = el('section', 'ws-card ws-qcard');
  const bar = el('footer', 'ws-foot ws-qbar');
  const prev = button('ws-btn ghost', [icon('left', 15), el('span', null, 'Previous')], () => show(index - 1));
  const hint = button('ws-btn ghost', [icon('bulb', 15), el('span', null, 'Hint')]);
  const ask = button('ws-btn ghost', [icon('chat', 15), el('span', null, 'Ask ' + (CONFIG.title || 'the assistant'))]);
  const check = button('ws-btn primary', 'Check');
  const next = button('ws-btn', [el('span', null, 'Next'), icon('right', 15)]);
  bar.append(prev, hint, ask, el('span', 'ws-grow'), check, next);
  const results = el('section', 'ws-card ws-results');
  results.hidden = true;
  wrap.append(card, bar, results);
  if (api.aiAvailable) {
    const note = el('p', 'ws-note-line');
    note.append(icon((panel.sees || []).length ? 'eye' : 'eyeOff', 13), el('span', null, api.seesSentence(panel)));
    wrap.append(note);
  }
  const letter = (i) => String.fromCharCode(65 + i);
  const t = () => track.get(items[index].id);
  const leave = () => {
    const k = t(); if (!k || !k.since) return;
    k.since = 0;
    emit(panel.id, 'view', { visible_ms: Date.now() - (k.viewStart || Date.now()), active_ms: k.active, changes: k.changes }, items[index].id);
  };
  function changed() { const k = t(); k.changes += 1; const now = Date.now(); if (k.last) k.active += Math.min(now - k.last, IDLE); k.last = now; api.touch(); }
  const status = (item) => { const entry = done[item.id]; if (!entry) return ''; if (panel.feedback === 'each' && entry.correct === true) return 'ok'; if (panel.feedback === 'each' && entry.correct === false) return 'no'; return 'did'; };
  function renderProgress() {
    progress.replaceChildren(...items.map((item, i) => {
      const seg = button('ws-step ' + status(item) + (i === index ? ' on' : ''), el('span', 'sr', 'Question ' + (i + 1)), () => show(i));
      seg.setAttribute('aria-current', i === index ? 'step' : 'false');
      return seg;
    }));
    const answered = items.filter((item) => done[item.id]).length;
    api.setBadge(panel.id, answered + '/' + items.length, answered === items.length);
  }
  // The question as the chat shows text (code, math, tables, diagrams). A cloze's blanks [[n]] go
  // through the renderer as marks and become inputs where they land, inside code too (which then
  // stays unhighlighted, as highlighting would replace the inputs).
  function renderPrompt(item, box) {
    if (item.type !== 'cloze') { box.append(rich(item.prompt)); return; }
    const text = rich(item.prompt.replace(/\[\[(\d{1,2})\]\]/g, '\u2063$1\u2063') + (item.prompt.includes('\n') ? '' : '\n'));
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const marked = [];
    while (walker.nextNode()) if (/\u2063\d{1,2}\u2063/.test(walker.currentNode.nodeValue)) marked.push(walker.currentNode);
    for (const node of marked) {
      const code = node.parentElement && node.parentElement.closest('code');
      if (code) code.dataset.highlighted = 'yes';
      node.replaceWith(...node.nodeValue.split(/(\u2063\d{1,2}\u2063)/).filter(Boolean).map((part) => {
        const m = /^\u2063(\d{1,2})\u2063$/.exec(part);
        if (!m) return document.createTextNode(part);
        const slot = Number(m[1]) - 1;
        const input = el('input', 'ws-blank');
        input.type = 'text'; input.setAttribute('aria-label', 'Blank ' + (slot + 1)); input.autocomplete = 'off'; input.spellcheck = false;
        input.value = (response && response[slot]) || '';
        input.addEventListener('input', () => { response = response || []; response[slot] = input.value; changed(); });
        return input;
      }));
    }
    box.append(text);
  }
  function show(i) {
    if (stopTake) { stopTake(); stopTake = null; }
    if (api.current()?.id === panel.id) leave();
    index = Math.max(0, Math.min(items.length - 1, i));
    const item = items[index];
    const k = t();
    if (!k.firstSeen) k.firstSeen = Date.now();
    k.since = Date.now(); k.viewStart = Date.now(); k.last = Date.now(); k.active = 0; k.changes = 0;
    where.replaceChildren(el('span', null, 'Question ' + (index + 1) + ' of ' + items.length));
    if (item.skill) where.append(el('span', 'ws-chip', item.skill));
    prev.disabled = index === 0;
    next.lastChild.previousSibling.textContent = index === items.length - 1 ? (panel.feedback === 'end' ? 'See results' : 'Finish') : 'Next';
    renderProgress();
    results.hidden = true;
    card.hidden = false;
    card.replaceChildren();
    const earlier = done[item.id];
    response = earlier && earlier.response != null ? parse(earlier.response) : (item.type === 'code' ? item.starter || '' : item.type === 'order' ? item.choices.map((c) => c.id) : item.type === 'multiple' || item.type === 'cloze' ? [] : null);
    const prompt = el('div', 'ws-q-prompt' + (item.type === 'cloze' ? ' cloze' : ''));
    renderPrompt(item, prompt);
    card.append(prompt);
    const answer = el('div', 'ws-q-answer');
    if (item.type === 'single' || item.type === 'multiple') {
      if (item.type === 'multiple') answer.append(el('p', 'ws-muted', 'Choose all that apply.'));
      item.choices.forEach((choice, ci) => {
        const label = el('label', 'ws-option');
        const input = el('input');
        input.type = item.type === 'single' ? 'radio' : 'checkbox'; input.name = 'q-' + panel.id + '-' + item.id; input.value = choice.id;
        input.checked = item.type === 'single' ? response === choice.id : (response || []).includes(choice.id);
        input.addEventListener('change', () => { if (item.type === 'single') response = choice.id; else { const set = new Set(response || []); if (input.checked) set.add(choice.id); else set.delete(choice.id); response = [...set]; } answer.querySelectorAll('.ws-option').forEach((node) => node.classList.remove('is-right', 'is-wrong')); changed(); });
        label.append(input, el('span', 'ws-key', letter(ci)), rich(choice.text, 'ws-option-text'));
        answer.append(label);
      });
    } else if (item.type === 'order') {
      answer.append(el('p', 'ws-muted', 'Drag them into order, or use the arrows.'));
      const list = el('ol', 'ws-order');
      let dragging = -1;
      const draw = () => {
        list.replaceChildren(...response.map((id, pos) => {
          const choice = item.choices.find((c) => c.id === id);
          const li = el('li', 'ws-order-item');
          li.draggable = true;
          const move = (by) => { const order = [...response]; [order[pos], order[pos + by]] = [order[pos + by], order[pos]]; response = order; changed(); draw(); list.children[pos + by]?.querySelector(by < 0 ? '.up' : '.down')?.focus(); };
          const up = button('ws-move up', icon('left', 14), () => move(-1)); up.disabled = pos === 0; up.setAttribute('aria-label', 'Move up');
          const down = button('ws-move down', icon('right', 14), () => move(1)); down.disabled = pos === response.length - 1; down.setAttribute('aria-label', 'Move down');
          li.append(icon('grip', 15), el('span', 'ws-order-n', String(pos + 1)), rich(choice ? choice.text : id, 'ws-order-text'), up, down);
          li.addEventListener('dragstart', (e) => { dragging = pos; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
          li.addEventListener('dragend', () => li.classList.remove('dragging'));
          li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('over'); });
          li.addEventListener('dragleave', () => li.classList.remove('over'));
          li.addEventListener('drop', (e) => {
            e.preventDefault();
            if (dragging < 0 || dragging === pos) return;
            const order = [...response];
            const [moved] = order.splice(dragging, 1);
            order.splice(pos, 0, moved);
            response = order; dragging = -1; changed(); draw();
          });
          return li;
        }));
      };
      draw();
      answer.append(list);
    } else if (item.type === 'spoken') {
      answer.append(recorder(item, (take) => { response = take; changed(); }, earlier));
    } else if (item.type !== 'cloze') {
      const box = el(item.type === 'fill' ? 'input' : 'textarea', 'ws-q-text' + (item.type === 'code' ? ' code' : item.type === 'open' ? ' long' : ''));
      if (item.type === 'fill') { box.type = 'text'; box.autocomplete = 'off'; }
      box.setAttribute('aria-label', 'Your answer'); box.spellcheck = item.type !== 'code';
      box.placeholder = item.type === 'fill' ? 'Your answer' : item.type === 'code' ? '' : 'Write your answer…';
      box.value = response || '';
      box.addEventListener('input', () => { response = box.value; changed(); });
      if (item.type === 'code') box.addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const s = box.selectionStart; box.setRangeText('    ', s, box.selectionEnd, 'end'); response = box.value; changed(); } });
      answer.append(box);
      if (item.type === 'code') answer.append(el('p', 'ws-muted', 'Your program is kept for your teacher to read (' + (item.language || 'code') + ').'));
    }
    card.append(answer);
    const hints = el('div', 'ws-hints');
    const feedback = el('div', 'ws-feedback');
    feedback.setAttribute('role', 'status');
    card.append(hints, feedback);

    check.textContent = panel.feedback === 'each' && item.gradable ? 'Check' : item.type === 'spoken' ? 'Send my answer' : 'Submit';
    const hintCount = panel.hints ? item.hints || 0 : 0;
    let hintIndex = 0;
    hint.hidden = !hintCount;
    const setHintLabel = () => { hint.lastChild.textContent = hintIndex >= hintCount ? 'No more hints' : 'Hint' + (hintCount > 1 ? ' · ' + (hintCount - hintIndex) + ' left' : ''); hint.disabled = hintIndex >= hintCount; };
    setHintLabel();
    ask.hidden = !api.aiAvailable || !(panel.sees || []).length;
    const lock = (entry) => {
      const out = panel.tries && entry.tries >= panel.tries;
      const right = entry.correct === true && panel.feedback === 'each';
      const locked = Boolean(out || right);
      check.disabled = locked;
      card.querySelectorAll('input, textarea, .ws-move').forEach((node) => { node.disabled = locked; });
      card.querySelectorAll('.ws-order-item').forEach((node) => { node.draggable = !locked; });
    };
    check.disabled = false;
    const say = (entry) => {
      feedback.className = 'ws-feedback';
      feedback.replaceChildren();
      if (!entry) return;
      if (panel.feedback === 'each' && entry.correct != null) {
        // The answer they chose, marked right or wrong where it is (one choice; never the right one).
        if (item.type === 'single') card.querySelectorAll('.ws-option').forEach((node) => { const chosen = node.querySelector('input').checked; node.classList.toggle('is-right', chosen && entry.correct === true); node.classList.toggle('is-wrong', chosen && entry.correct === false); });
        feedback.classList.add(entry.correct ? 'ok' : entry.score > 0 ? 'part' : 'no');
        feedback.append(icon(entry.correct ? 'check' : 'info', 16));
        const text = el('div');
        text.append(el('strong', null, entry.correct ? 'Right.' : entry.score > 0 ? 'Partly right.' : 'Not quite.'));
        if (entry.explanation && (entry.correct || (panel.tries && entry.tries >= panel.tries))) text.append(rich(entry.explanation, 'ws-explain'));
        if (panel.tries && entry.tries < panel.tries && entry.correct !== true) text.append(el('p', 'ws-muted', (panel.tries - entry.tries) + ' tr' + (panel.tries - entry.tries === 1 ? 'y' : 'ies') + ' left.'));
        feedback.append(text);
      } else {
        feedback.classList.add('saved');
        feedback.append(icon('check', 16), el('strong', null, item.type === 'spoken' ? (entry.kept === false ? 'Answer sent. Recordings aren’t kept here.' : 'Answer saved.') : 'Answer saved.'));
      }
      // A model answer to compare with, once the learner has written their own.
      if (entry.model_answer) {
        const model = el('div', 'ws-model');
        model.append(el('span', 'ws-label', 'A model answer to compare with'), rich(entry.model_answer));
        feedback.after(model);
      }
    };
    if (earlier) { say(earlier); lock(earlier); }
    hint.onclick = async () => {
      hint.disabled = true;
      try {
        const data = await post('/questions', { panel: panel.id, action: 'hint', item: item.id, index: hintIndex });
        t().hints += 1; hintIndex = data.index + 1;
        const box = el('div', 'ws-hint');
        box.append(icon('bulb', 15), el('b', null, 'Hint ' + (data.index + 1)), rich(data.hint, 'ws-hint-text'));
        hints.append(box);
      } catch (error) { feedback.className = 'ws-feedback no'; feedback.textContent = error.message; }
      setHintLabel();
    };
    ask.onclick = () => { t().ai = true; api.askAi('I’m on question ' + (index + 1) + '. Can you help me think about it?'); };
    check.onclick = async () => {
      const k = t();
      if (item.type === 'spoken' && !(response && response.audio)) { feedback.className = 'ws-feedback no'; feedback.textContent = 'Record your answer first.'; return; }
      check.disabled = true;
      card.querySelectorAll('.ws-model').forEach((node) => node.remove());
      try {
        const sent = item.type === 'spoken' ? { audio: response.audio, seconds: response.seconds } : { response };
        const data = await post('/questions', { panel: panel.id, item: item.id, ...sent, rt_ms: Date.now() - k.firstSeen, changes: k.changes, hints: k.hints, ai_before: k.ai });
        const entry = { tries: data.attempt, response: item.type === 'spoken' ? null : JSON.stringify(response), correct: data.correct ?? null, score: data.score ?? null, explanation: data.explanation, model_answer: data.model_answer || null, kept: data.kept };
        done[item.id] = entry;
        say(entry); renderProgress();
        // Where they see right and wrong: the AI may write first about it, if the teacher chose that (the chat counts tries and right answers).
        if (entry.correct != null && (panel.feedback || 'each') === 'each' && window.VIABLE_CHAT && window.VIABLE_CHAT.speakFirst) window.VIABLE_CHAT.speakFirst(entry.correct ? 'right' : 'wrong', { item: item.id, tries: entry.tries });
        check.disabled = false; lock(entry);
      } catch (error) { check.disabled = false; feedback.className = 'ws-feedback no'; feedback.textContent = error.message; }
    };
  }
  // In a course, the way on from the end of the questions.
  function backToCourse() {
    if (!CONFIG.course || !CONFIG.course.url) return [];
    const a = el('a', 'ws-next', 'Back to ' + (CONFIG.course.title || 'the course'));
    a.href = CONFIG.course.url;
    return [a];
  }
  function parse(saved) { try { return typeof saved === 'string' && /^[[{"]/.test(saved) ? JSON.parse(saved) : saved; } catch { return saved; } }
  // Answering aloud: record (up to the question's length), listen back, record again, then send. The
  // microphone is let go as soon as a take ends; nothing is sent until the learner sends it.
  function recorder(item, onTake, earlier) {
    const box = el('div', 'ws-rec');
    const limit = Math.max(15, Math.min(180, item.max_seconds || 60));
    const say = el('p', 'ws-muted', earlier ? 'You’ve answered this one. You can record a new answer if you have tries left.' : 'Answer aloud. You can listen to it before you send it (up to ' + (limit >= 60 ? Math.round(limit / 60 * 10) / 10 + ' min' : limit + ' s') + ').');
    const time = el('span', 'ws-rec-time', '0:00');
    const start = button('ws-btn primary', [icon('mic', 15), el('span', null, 'Record')]);
    const stop = button('ws-btn', [icon('stop', 15), el('span', null, 'Stop')]);
    const again = button('ws-btn ghost', [icon('redo', 15), el('span', null, 'Record again')]);
    const audio = el('audio', 'ws-rec-audio'); audio.controls = true;
    stop.hidden = true; again.hidden = true; audio.hidden = true; time.hidden = true;
    const row = el('div', 'ws-rec-row'); row.append(start, stop, again, time);
    box.append(say, row, audio);
    let rec = null, chunks = [], stream = null, began = 0, tick = 0, url = '';
    const clock = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    const type = () => (window.MediaRecorder && ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t))) || '';
    const release = () => { if (stream) stream.getTracks().forEach((track) => track.stop()); stream = null; clearInterval(tick); };
    start.onclick = async () => {
      if (!window.MediaRecorder || !navigator.mediaDevices) { say.textContent = 'This browser can’t record audio. Try another browser.'; return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
      catch (error) { say.textContent = error && error.name === 'NotFoundError' ? 'No microphone was found.' : 'The microphone is blocked. Allow it for this page in your browser, then try again.'; return; }
      chunks = []; rec = new MediaRecorder(stream, type() ? { mimeType: type(), audioBitsPerSecond: 24000 } : undefined);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        release();
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const seconds = Math.round((Date.now() - began) / 100) / 10;
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob); audio.src = url; audio.hidden = false;
        const reader = new FileReader();
        reader.onload = () => onTake({ audio: String(reader.result), seconds });
        reader.readAsDataURL(blob);
        stop.hidden = true; start.hidden = true; again.hidden = false; time.hidden = false;
        say.textContent = 'Listen back, then send it, or record again.';
      };
      rec.start(1000); began = Date.now();
      start.hidden = true; again.hidden = true; stop.hidden = false; time.hidden = false; audio.hidden = true;
      say.textContent = 'Recording…';
      tick = setInterval(() => { const s = (Date.now() - began) / 1000; time.textContent = clock(s) + ' / ' + clock(limit); if (s >= limit && rec && rec.state === 'recording') rec.stop(); }, 250);
      stop.focus();
    };
    stop.onclick = () => { if (rec && rec.state === 'recording') rec.stop(); };
    again.onclick = () => { onTake(null); start.click(); };
    // Leaving the question (or the page) ends a take and lets the microphone go.
    stopTake = () => { if (rec && rec.state === 'recording') { rec.onstop = null; rec.stop(); } release(); if (url) URL.revokeObjectURL(url); };
    return box;
  }
  async function finish() {
    // Anything left unanswered comes first, whatever the feedback (results come once all are answered).
    const open = items.findIndex((item) => !done[item.id]);
    if (open >= 0) { show(open); return; }
    if (panel.feedback !== 'end') {
      results.hidden = false;
      results.replaceChildren(el('h3', null, 'All done!'), el('p', 'ws-muted', 'Your answers are saved.' + (panel.tries > 1 ? ' You can look back at any of them.' : '')), ...backToCourse());
      return;
    }
    leave();
    card.hidden = true;
    results.hidden = false;
    results.replaceChildren(el('h3', null, 'Your results'), el('p', 'ws-muted', 'Loading…'));
    try {
      const data = await post('/questions', { panel: panel.id, action: 'results' });
      const right = data.items.filter((entry) => entry.correct === true).length;
      const graded = data.items.filter((entry) => entry.correct != null).length;
      const score = el('div', 'ws-score');
      score.append(el('strong', null, graded ? right + '/' + graded : '✓'), el('span', null, graded ? 'right' : 'Your answers are saved.'));
      results.replaceChildren(el('h3', null, 'Your results'), score);
      data.items.forEach((entry) => {
        const i = items.findIndex((item) => item.id === entry.item);
        const row = el('div', 'ws-result ' + (entry.correct ? 'ok' : entry.correct === false ? 'no' : ''));
        row.append(el('strong', null, 'Question ' + (i + 1) + ': ' + (entry.correct ? 'right' : entry.correct === false ? 'not quite' : 'saved')));
        if (entry.explanation) row.append(rich(entry.explanation, 'ws-explain'));
        if (entry.model_answer) { const model = el('div', 'ws-model'); model.append(el('span', 'ws-label', 'A model answer to compare with'), rich(entry.model_answer)); row.append(model); }
        results.append(row);
      });
      results.append(...backToCourse());
    } catch (error) { results.replaceChildren(el('p', 'ws-muted', error.message)); }
  }
  next.addEventListener('click', () => (index === items.length - 1 ? finish() : show(index + 1)));
  // Choices from the keyboard: A–L or 1–9 pick, Enter checks (not while typing an answer).
  wrap.addEventListener('keydown', (e) => {
    if (e.target.closest('input[type=text], textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    const item = items[index];
    if (e.key === 'Enter' && !check.disabled && e.target.tagName !== 'BUTTON') { e.preventDefault(); check.click(); return; }
    if (!['single', 'multiple'].includes(item.type)) return;
    const n = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : /^[a-l]$/i.test(e.key) ? e.key.toLowerCase().charCodeAt(0) - 97 : -1;
    const inputs = card.querySelectorAll('.ws-option input');
    if (n >= 0 && inputs[n] && !inputs[n].disabled) { e.preventDefault(); inputs[n].click(); inputs[n].focus(); }
  });
  // Earlier answers, from this or another device.
  ready.then(() => post('/questions', { panel: panel.id, action: 'state' }).then((data) => { Object.assign(done, data.items || {}); show(index); }).catch(() => {}));
  show(0);
  return {
    el: wrap,
    state: () => { const item = items[index]; t().ai = true; const entry = done[item.id]; return { panel: panel.id, item: item.id, response, tries: entry ? entry.tries : 0, last_correct: entry && panel.feedback === 'each' ? entry.correct : null }; },
    hide: () => leave(),
    resume: () => { const k = t(); k.since = Date.now(); k.viewStart = Date.now(); k.last = Date.now(); k.active = 0; k.changes = 0; }
  };
}
