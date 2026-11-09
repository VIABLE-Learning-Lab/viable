// Edu-ConvoKit as a measure, with its detector beside it: the harness's adapter (integrations/stanford-edu-convokit/) is
// written into the folder, and runs out of process, since Edu-ConvoKit is Python. Nothing is downloaded here: Edu-ConvoKit
// comes from PyPI and each classifier from its makers when the person installs them, as the folder's README says.
import { readFileSync } from 'node:fs';

const FILES = ['README.md', 'server.py', 'measure.json', 'manifest.json', 'fixtures/input.json', 'fixtures/expected.json', 'fixtures/expected-measures.json'];

export default {
  id: 'edu-convokit',
  version: 1,
  as: ['measure'],
  async fetch(get) {
    for (const file of FILES) get.save(file, readFileSync(new URL(`../../integrations/stanford-edu-convokit/${file}`, import.meta.url)));
  },
  use({ folder }) { return { manifest: `${folder}/measure.json` }; }
};
