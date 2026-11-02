const BY_COUNT = { set: 'count' };
const WHILE = { unset: 'count' };

export default {
  type: 'loop',
  version: 1,
  label: 'Loop',
  category: 'logic',
  summary: 'Repeat steps a number of times, or while a condition holds.',
  use: 'Repeats a sub-path by count or while a condition holds. A run visits a Loop at most 25 times, so a count of 24 is the most that finishes; every pass spends its steps’ model calls and counts toward the run’s 50 steps. For one pass per item of a list, use For each.',
  guide: [
    'Connect continue to the first repeated step and the last repeated step back to this Loop. Connect done to the step after the loop.',
    'The counter starts at 1. A count of 3 runs the steps three times; the fourth visit takes done. While is checked before each pass, and a count wins over it.',
    'Outputs from repeated steps are replaced each pass, not collected. The run’s step, model call and time limits still apply.'
  ],
  keywords: 'repeat retry iterate while until count',
  docs: '/docs/build/steps#loop',
  cannot_run_alone: 'a Loop step only counts and chooses a path. Run the agent to see it work',
  flow: { kind: 'branches', keys: ['continue', 'done'] },
  sentence: [
    { text: 'Repeats the steps {count} times', when: BY_COUNT },
    { text: 'Repeats the steps while {while}', when: { all: [WHILE, { set: 'while' }] } },
    { text: 'Goes straight to done: set a count or a condition', when: { all: [WHILE, { unset: 'while' }] } },
    { text: '. Counts passes in {var}', when: { set: 'var' } }
  ],
  settings: [
    { key: 'count', label: 'Times to repeat', widget: 'number', level: 'setup', min: 1, max: 24, integer: true, tip: 'How many times the steps run, 1 to 24. Wins over Continue while when both are set. New Loops start at 3.' },
    { key: 'while', label: 'Continue while', widget: 'expr', level: 'setup', when: WHILE, unused_note: 'Not used while a repeat count is set.', placeholder: 'vars.attempt <= 3 && !review.json.passed', tip: 'Checked before each pass, such as !review.json.passed. Comparisons, &&, || and ! plus helpers such as len(). Make sure it turns false.' },
    { key: 'var', label: 'Counter name', widget: 'text', level: 'option', placeholder: 'Default: stepId_iteration', tip: 'Read the pass number as vars.name, such as vars.attempt. Default: this step’s ID followed by _iteration.' }
  ],
  parts: [{ id: '@loop', level: 'setup' }],
  outputs: [
    { path: 'iteration', label: 'Pass number', type: 'number', tip: 'Counts visits to this Loop, from 1.' }
  ],
  presets: [
    { id: 'count', label: 'Repeat a number of times', tip: 'Such as three drafts, each improving the last.', config: { count: 3 } },
    { id: 'until', label: 'Repeat until something holds', tip: 'Such as until a review passes. Keep a limit in the condition.', config: { count: null, while: '' } }
  ],
  defaults: { count: 3 }
};
