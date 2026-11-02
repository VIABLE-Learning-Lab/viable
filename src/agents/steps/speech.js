export default {
  type: 'speech',
  version: 1,
  label: 'Speech',
  category: 'ai',
  summary: 'Read text aloud and pass the recording’s address to later steps.',
  use: 'One speech-model call; returns an audio URL for the Reply’s attachments. For young readers, language practice and accessibility. Reads plain text: Markdown, citation numbers and links are dropped, and text longer than 4,096 characters is cut at a sentence end. Placed between the answering step and the Reply, it reads the answer while it streams.',
  guide: [
    'Insert the answer to read, such as {{answer.content}}, into Text. Choose a voice for the main language: other languages in the answer (a Chinese explanation, an English word) are read by a matching voice.',
    'Insert {{stepId.url}} into a Reply step’s picture or audio: chat pages and Try it play it under the reply. Put Speech between the answering step and the Reply and the text still streams. Speech is metered per audio minute.'
  ],
  keywords: 'text to speech tts read aloud voice audio pronunciation listen accessibility',
  calls_model: 'always',
  docs: '/docs/build/steps#speech',
  flow: { kind: 'next' },
  sentence: [
    { text: 'Reads {text} aloud', when: { set: 'text' } },
    { text: 'Reads the message aloud', when: { unset: 'text' } },
    { text: ' in the voice {voice}', when: { set: 'voice' } },
    { text: ', at {speed}× speed', when: { set: 'speed' } }
  ],
  settings: [
    { key: 'model', label: 'Model', widget: 'model', level: 'setup', placeholder: 'kokoro', tip: 'The speech model. Its voices fill the Voice list.' },
    { key: 'text', label: 'Text', widget: 'textarea', level: 'setup', refs: true, value: true, placeholder: 'Insert the reply to read aloud, such as your answer step’s reply text', empty: 'the current message', empty_choice: ['The current message', 'Custom text'], tip: 'Read as plain text. Past 4,096 characters it is cut at a sentence end. Default: the current message.' },
    { key: 'voice', label: 'Voice', widget: 'voice', level: 'setup', loader: 'voices', tip: 'The voice for the text’s main language. Other languages get a matching voice; text in a language without one is skipped. Default: the model’s voice.' },
    { key: 'speed', label: 'Speed', widget: 'number', level: 'option', min: 0.25, max: 4, default: 1, placeholder: 'Default: 1', tip: 'From 0.25 to 4; around 0.8 helps language learners. Default: 1.' },
    { key: 'format', label: 'Audio format', widget: 'select', level: 'advanced', options: ['mp3', 'wav', 'opus', 'flac'], option_labels: { mp3: 'MP3', wav: 'WAV', opus: 'Opus', flac: 'FLAC' }, default: 'mp3', tip: 'Only MP3 is read while the answer streams, and text in several languages always gives MP3. Default: MP3.' }
  ],
  parts: [],
  outputs: [
    { path: 'url', label: 'Audio address', type: 'string', tip: 'For a Reply’s picture or audio.' },
    { path: 'duration_seconds', label: 'Length in seconds', type: 'number' },
    { path: 'text', label: 'Text it read', type: 'string', tip: 'After Markdown, links and citation numbers are dropped.' }
  ],
  presets: [],
  defaults: {}
};
