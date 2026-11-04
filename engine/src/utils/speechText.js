/**
 * Text read aloud: how long one speech request may be, and how text in several languages is split
 * into runs, each read by a voice that speaks it. Pure; the speech service and the agent engine share it.
 */

// The longest text a speech request takes.
export const MAX_SPEECH_CHARACTERS = 4096;

// Kokoro voices speak the language their name starts with: af_heart American English, bf_emma
// British, zf_xiaoxiao Mandarin, ef_dora Spanish and so on. Text in another language read by one of
// them comes out as nonsense (each Chinese character as "Chinese letter"), so speechRuns splits text
// into runs by language, each read by a voice for it: the chosen voice for its own language, else one
// of the same gender. Japanese is left out, as are languages no voice speaks (Korean, Russian, ...):
// the kokoro VIABLE runs returns no audio for its Japanese voices.
const KOKORO_LANGUAGES = { a: 'en', b: 'en', z: 'zh', e: 'es', f: 'fr', h: 'hi', i: 'it', p: 'pt', j: 'ja' };
const KOKORO_VOICE_FOR = {
  en: { f: 'af_heart', m: 'am_michael' }, zh: { f: 'zf_xiaoxiao', m: 'zm_yunxi' }, es: { f: 'ef_dora', m: 'em_alex' },
  fr: { f: 'ff_siwis', m: 'ff_siwis' }, hi: { f: 'hf_alpha', m: 'hm_omega' }, it: { f: 'if_sara', m: 'im_nicola' }, pt: { f: 'pf_dora', m: 'pm_alex' }
};
// Words that give away a Latin-script language, to tell an English explanation from Spanish practice.
const LATIN_WORDS = {
  en: 'the and is are you your to of it that this what with for have do does can i my we me not',
  es: 'el los las y es en una por para con muy como está estás hoy vamos yo tú usted pero también qué',
  fr: 'le les et est une je tu vous nous pas pour avec dans ce c’est il elle très aujourd’hui mais aussi',
  it: 'il gli e è uno una per con non sono sei ciao oggi molto ma anche io tu che',
  pt: 'o os e é um uma para com não você eu está muito hoje vamos mas também'
};
const LATIN_SETS = Object.fromEntries(Object.entries(LATIN_WORDS).map(([language, words]) => [language, new Set(words.split(' '))]));
function latinLanguage(text, fallback) {
  const words = text.toLowerCase().replace(/'/g, '’').match(/[\p{L}’]+/gu) || [];
  if (words.length < 4) return fallback;
  const score = Object.fromEntries(Object.entries(LATIN_SETS).map(([language, set]) => [language, words.filter((word) => set.has(word)).length]));
  const best = Object.keys(score).reduce((a, b) => (score[b] > score[a] ? b : a));
  return score[best] >= 2 && score[best] >= (score[fallback] || 0) + 2 ? best : fallback;
}
const scriptOf = (ch) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch) ? 'cjk'
  : /\p{Script=Devanagari}/u.test(ch) ? 'deva' : /\p{Script=Latin}/u.test(ch) ? 'latin' : /\p{L}/u.test(ch) ? 'other' : null;

/**
 * Text split into runs, each with the voice that reads its language ({ text, voice, language }).
 * A voice this doesn't know (not a kokoro voice) reads all of it, as asked. Runs in a language no
 * voice reads here are dropped, so the list can be empty.
 */
export function speechRuns(text, voice) {
  const own = KOKORO_LANGUAGES[/^([a-z])[fm]_/.exec(voice || '')?.[1]];
  if (!own) return text ? [{ text, voice, language: null }] : [];
  const gender = voice[1];
  const latinDefault = KOKORO_VOICE_FOR[own] && own !== 'zh' && own !== 'hi' ? own : 'en';
  // Blocks of one script; spaces, digits and punctuation go with the block before them.
  const blocks = [];
  for (const ch of text) {
    const script = scriptOf(ch);
    const last = blocks.at(-1);
    if (!last || (script && last.script && script !== last.script)) blocks.push({ script, text: ch });
    else { last.text += ch; last.script ||= script; }
  }
  // Latin-script text is told apart sentence by sentence (an English explanation, then Spanish).
  const pieces = blocks.flatMap((block) => block.script !== 'latin' ? [block]
    : (block.text.match(/[^.!?]+(?:[.!?]+["'”’)\]]*\s*|$)/g) || [block.text]).map((text) => ({ script: 'latin', text })));
  const runs = [];
  for (const piece of pieces) {
    const language = piece.script === 'cjk' ? (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(piece.text) ? 'ja' : 'zh')
      : piece.script === 'deva' ? 'hi' : piece.script === 'latin' ? latinLanguage(piece.text, latinDefault) : piece.script === 'other' ? null : own;
    const runVoice = language === own ? voice : KOKORO_VOICE_FOR[language]?.[gender] || null;
    const last = runs.at(-1);
    if (last && last.voice === runVoice) last.text += piece.text;
    else runs.push({ text: piece.text, voice: runVoice, language });
  }
  return runs.map((run) => ({ ...run, text: run.text.trim() })).filter((run) => run.voice && /[\p{L}\p{N}]/u.test(run.text));
}
