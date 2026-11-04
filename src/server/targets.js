/**
 * What each place a package can run does and can't do: what inspect reports, deploy scaffolds and
 * docs/self-hosting.md's table says. No Node built-ins.
 */
const NO_PROCESS = 'it can\'t start an MCP server: put the component behind an HTTP address';

export const TARGET_NAMES = ['node', 'docker', 'cloudflare', 'aws-lambda', 'cloud-run', 'firebase'];

export const TARGETS = {
  node: {
    label: 'Node on your own machine', layers: ['node'], root: '.', entries: ['server/app.js', 'server/fileStore.js', 'server/node.js', 'server/learnerAssets.js', 'server/onNode.js'],
    store: { kind: 'files', says: 'a folder on this machine (./data), one process at a time' },
    streams: true, mcp: true, ran: 'run for real by the tests',
    limits: ['One process: two on one folder can overwrite each other.', 'Plain HTTP: put a web server with a certificate in front of it.']
  },
  docker: {
    label: 'A container', layers: ['node', 'docker'], root: '.', entries: ['server/app.js', 'server/fileStore.js', 'server/node.js', 'server/learnerAssets.js', 'server/onNode.js', 'cli/records.js'],
    store: { kind: 'files', says: 'a folder on a volume (/data), one container at a time' },
    streams: true, mcp: true, ran: 'run for real under Docker with Colima, on arm64 and as linux/amd64 under QEMU; not on Docker Desktop or a Linux server',
    limits: ['One container on a volume: two can overwrite each other.', 'An MCP component needs its command installed in the image, and its ID in VIABLE_HARNESS_ALLOW_COMPONENTS.']
  },
  'cloudflare': {
    label: 'Cloudflare Workers', layers: ['cloudflare'], root: '.', entries: ['server/app.js'],
    store: { kind: 'd1', says: 'a D1 database, created with one command; reads see the last write' },
    streams: true, mcp: false, maxZipBytes: 25 * 1024 * 1024, ran: 'run for real with wrangler dev --local, where a caller\'s hang-up stopped a streamed run within 30 s and wasn\'t seen to stop a plain one; never deployed to Cloudflare',
    limits: ['Use the paid plan: reading a package and searching it can take more than the free plan\'s 10 ms of CPU per request (the paid plan gives 30 s, and time waiting on your model doesn\'t count).', 'A package is at most 25 MiB, the limit on one static asset.', 'Two messages at once in one conversation, on two isolates, can lose one.', 'No disk: audio and pictures come back inside the answer as data: URLs.']
  },
  'aws-lambda': {
    label: 'AWS Lambda', layers: ['aws-lambda'], root: '.', entries: ['server/app.js', 'server/lambda.js', 'server/learnerAssets.js', 'server/onNode.js'],
    store: { kind: 's3', says: 'an S3 bucket, not DynamoDB, whose 400 KB item limit a long conversation can pass' },
    streams: true, mcp: false, ran: 'handler invoked in tests with function URL events; never deployed to AWS',
    limits: ['A run is cut off at the function\'s Timeout (300 s here; 900 s at most).', 'If the caller leaves, the run goes on to its end and its model calls are still spent: Lambda doesn\'t tell the function.', 'A cold start reads the package again: the first answer can take a few seconds longer.', 'Two messages at once in one conversation can lose one.', 'Streaming needs the function URL; API Gateway holds the answer until it is whole (use lambdaHandler).', 'No lasting disk: audio and pictures come back inside the answer as data: URLs.']
  },
  'cloud-run': {
    label: 'Google Cloud Run', layers: ['node', 'docker', 'cloud-run'], root: '.', entries: ['server/app.js', 'server/fileStore.js', 'server/node.js', 'server/learnerAssets.js', 'server/onNode.js', 'cli/records.js'],
    store: { kind: 'gcs', says: 'a Cloud Storage bucket mounted as a folder (/data); the last writer wins' },
    streams: true, mcp: true, ran: 'its image built and run for real under Docker; never deployed to Cloud Run',
    limits: ['A run is cut off at the service\'s request timeout (300 s here; 3600 s at most).', 'Two messages at once in one conversation, on two instances, can lose one: set --max-instances 1 if that matters more than scale.', 'An MCP component needs its command installed in the image, and its ID in VIABLE_HARNESS_ALLOW_COMPONENTS.', 'No lasting disk but the bucket: audio and pictures come back inside the answer as data: URLs.']
  },
  firebase: {
    label: 'Firebase Functions (2nd gen)', layers: ['firebase'], root: 'functions', entries: ['server/app.js', 'server/node.js', 'server/learnerAssets.js', 'server/onNode.js'],
    store: { kind: 'firestore', says: 'Firestore, one document per conversation or run' },
    streams: true, mcp: false, ran: 'run for real in the Functions emulator, without Firestore, which was tried with a stub; never deployed to Firebase',
    limits: ['A run is cut off at timeoutSeconds (540 s here; 3600 s at most for an HTTP function).', 'Two messages at once in one conversation can lose one.', 'App Hosting builds web frameworks, not a server like this: use Functions, or Cloud Run in the same project. See the README.', 'No lasting disk: audio and pictures come back inside the answer as data: URLs.']
  }
};

/** Why a step of this graph can't run, or runs differently, on a target: a sentence, or null. */
export function stepLimit(node, target) {
  const place = TARGETS[target];
  if (node.type === 'component' && node.config?.manifest?.runs?.kind === 'mcp' && !place.mcp) return NO_PROCESS;
  if (node.type === 'transcribe') return 'skipped: a server of this kind takes text, not recordings';
  if (node.type === 'memory' && place.store.kind === 'none') return 'skipped: nothing is kept without a store';
  return null;
}
