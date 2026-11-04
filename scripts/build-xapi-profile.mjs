// Writes schemas/xapi-profile.jsonld, the xAPI Profile (xAPI Profiles 1.0, JSON-LD) of src/xapi.js's
// VOCABULARY. Run with `npm run xapi:build`; never edit the file by hand. VIABLE's API publishes it on
// the Developer Platform, which answers the profile's IRI and every IRI under it with this file.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ACTIVITY_TYPES, EXTENSIONS, PROFILE, VERBS, VOCABULARY } from '../src/xapi.js';

export const profilePath = fileURLToPath(new URL('../schemas/xapi-profile.jsonld', import.meta.url));
// Once published, a changed concept means a new version here, listed first, with wasRevisionOf the one before.
const VERSIONS = [{ id: `${PROFILE}/v1`, generatedAtTime: '2026-11-03T00:00:00Z' }];

const concepts = (type, base, terms) => Object.entries(terms).map(([name, definition]) => ({ id: `${base}${name}`, type, inScheme: VERSIONS[0].id, prefLabel: { en: name }, definition: { en: definition } }));

export const profile = () => ({
  '@context': 'https://w3id.org/xapi/profiles/context',
  id: PROFILE,
  type: 'Profile',
  conformsTo: 'https://w3id.org/xapi/profiles#1.0',
  prefLabel: { en: 'VIABLE learning events' },
  definition: { en: 'How the VIABLE harness writes one learner’s learning events and messages to the AI as xAPI 1.0.3 statements: VIABLE’s own verbs, activity types and extensions. Statements use ADL’s verbs and its question and objective activity types where they fit. An embedded page’s own verb that ADL lacks, and an app’s own event fields, are named under this profile’s verbs/ and extensions/ too, and are not defined here.' },
  versions: VERSIONS,
  author: { type: 'Organization', name: 'VIABLE Lab', url: 'https://viablelab.org' },
  concepts: [
    ...concepts('Verb', VERBS, VOCABULARY.verbs),
    ...concepts('ActivityType', ACTIVITY_TYPES, VOCABULARY.activityTypes),
    ...concepts('ContextExtension', EXTENSIONS, VOCABULARY.contextExtensions),
    ...concepts('ResultExtension', EXTENSIONS, VOCABULARY.resultExtensions)
  ]
});
export const profileText = () => `${JSON.stringify(profile(), null, 2)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(profilePath, profileText());
  console.log(`Wrote ${profilePath}`);
}
