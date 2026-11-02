export default {
  type: 'transcribe',
  version: 1,
  label: 'Transcribe',
  category: 'ai',
  summary: 'Turn a recording into text for later steps.',
  use: 'One transcription-model call. Reads the audio file sent with the message (apps send it as a file part) or an HTTPS address, up to 25 MB; returns the transcript. For oral answers, voice questions and lecture recordings. Chat models can’t listen to audio, so put Transcribe before the steps that use what was said. Without a recording (someone typed) it is skipped with an empty transcript and no model call.',
  guide: [
    'The transcript is {{stepId.text}}; insert it into an LLM’s message or instructions. {{stepId.language}} and {{stepId.duration_seconds}} are there too.',
    'When it transcribes the learner’s own recording, later model steps read what they said in its place.',
    'Check it with a recording in Try it. Transcription is metered per audio minute.'
  ],
  keywords: 'speech to text stt transcription audio recording voice note oral answer lecture listen whisper',
  calls_model: 'always',
  docs: '/docs/build/steps#transcribe',
  flow: { kind: 'next' },
  sentence: [
    { text: 'Turns the recording sent with the message into text', when: { unset: 'audio' } },
    { text: 'Turns {audio} into text', when: { set: 'audio' } },
    { text: ', expecting {language}', when: { set: 'language' } },
    { text: '. Listens for words such as {prompt}', when: { set: 'prompt' } }
  ],
  settings: [
    { key: 'model', label: 'Model', widget: 'model', level: 'setup', placeholder: 'whisper-large-v3', tip: 'The transcription model.' },
    { key: 'audio', label: 'Recording', widget: 'text', level: 'setup', refs: true, value: true, placeholder: 'https://…', empty: 'the recording sent with the message', empty_choice: ['The recording sent with the message', 'A recording’s address'], tip: 'An HTTPS address or data URI of a recording up to 25 MB, such as one from reference data. Default: the recording sent with the message.' },
    { key: 'language', label: 'Language', widget: 'text', level: 'option', placeholder: 'en', tip: 'The two-letter code of the spoken language, such as en, zh or es. Helps with short recordings. Default: detected.' },
    { key: 'prompt', label: 'Words to expect', widget: 'textarea', level: 'option', refs: true, placeholder: 'Photosynthesis, chlorophyll, ATP', tip: 'Subject terms, names and spellings, so they are heard right. The first 1,000 characters are used.' }
  ],
  parts: [],
  outputs: [
    { path: 'text', label: 'Transcript', type: 'string', tip: 'Empty when no recording was sent.' },
    { path: 'language', label: 'Spoken language', type: 'string' },
    { path: 'duration_seconds', label: 'Length in seconds', type: 'number' }
  ],
  presets: [],
  defaults: {}
};
