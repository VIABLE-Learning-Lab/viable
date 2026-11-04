export default {
  type: 'parallel',
  version: 1,
  label: 'Parallel',
  category: 'logic',
  summary: 'Run several paths at the same time, then carry on at the join step once all finish.',
  use: 'Runs 2–6 independent paths at the same time, then continues at the join. Saves time, not model calls. If any path fails, the run fails.',
  guide: [
    'Connect each path to its first step, and the end of every path to the same join step. Paths must not reply on their own.',
    'Every output from every path is there after the join, such as {{critic_a.json.feedback}} and {{critic_b.json.feedback}}.'
  ],
  keywords: 'fan out concurrent simultaneous join ensemble panel',
  docs: '/docs/build/steps#parallel',
  cannot_run_alone: 'a Parallel step starts paths that run at the same time. Run a step on one of them',
  flow: { kind: 'paths' },
  sentence: [{ text: 'Runs {@paths} at the same time, then joins' }],
  settings: [
    { key: 'paths', label: 'Paths', widget: 'list', level: 'setup', tip: '2 to 6 names, each starting with a lowercase letter, such as critic_a. Each becomes an exit to connect; join is taken.' }
  ],
  parts: [],
  outputs: [],
  presets: [],
  defaults: { paths: ['a', 'b'] }
};
