# Putting this in front of learners

This guide is for anyone who puts the Engine or the Harness in front of learners: a school or district, a
researcher, or a developer building a learning app on them. It says what the code itself
guarantees, and what it leaves to you. To run agents and courses built on VIABLE on your own server,
behind the same calls your apps make to VIABLE, see [self-hosting.md](self-hosting.md).

**This is not legal advice.** It names questions a deployment has to answer, not the answers for
your learners, your school or your country. Using this code does not make a deployment compliant
with any law, contract or policy; how you run it, what you send to which model, and what you keep
decide that. Ask your school's or institution's counsel and privacy officer before learners use it.

## What the code guarantees

Each guarantee is about this repository's own code (the engine, VETTING, the teaching layer, the
measures, the formats and the CLI), with its limits.

- **No learner's name or identifier is added to what is sent to a model.** A name on a class list stays in your store, and is shown only behind the token and to that learner. A local run's learner
  ID (`--learner`, for memory) and a section's ID choose what is kept and which teaching settings
  apply; neither goes to a model. Learning records carry a pseudonymous ID (on the Engine's pages, the learner's personal code, which also signs in, so keep exports private), and the measures, the
  teacher view, suggestions and xAPI statements call no model. What the core does send is what the
  agent is built to send: the learner's message and earlier messages, the agent's instructions, the
  activity's teaching settings, and the context you pass. If a learner types their name, or your
  context or history holds one, it goes to the model as written. Once their models are set, a learner page also sends a
  recording to the model that hears, the photos and PDFs a learner attaches to the model that replies, and the reply to the
  model that reads aloud; a search sends the knowledge base's passages and its words to the model that searches by meaning.
  Each may be another provider: have an agreement with each one.
- **Every model call goes through one of four services:** `callChatModel`, `generateImage`,
  `generateSpeech` and `transcribeAudio` (README, "Services"). Replace them and every call the
  engine, VETTING, `checkReply` and the agent test judge make goes through your code, to a gateway,
  a log or a filter of your own. In an agent run each call counts against the run's limit on model
  calls (the agent's `run_limits`, else 20 in a local run) and is offered to
  `hooks.logProviderCall`. A search by meaning calls `/embeddings` apart from these, and only when its model is set.
- **VETTING outcomes are explicit.** A VETTING step ends `passed` (the reviewer approved the reply),
  `unverified` (attempts ran out, or a review couldn't run) or `attention` (the reply model flagged a
  safety concern and wrote a caring reply, which isn't reviewed). The outcome, each round's verdict,
  and the reviewer's reason are in the step's output and in the trace, and each outcome can lead to
  a step of its own. An outcome without one goes on to the step's next step, so check that your
  agent routes `unverified` and `attention` where you want them. A review is a
  model's judgment, not a guarantee that a reply is right or safe.
- **Components declare what they receive.** Each component's manifest lists the learner data it
  receives (`receives`), every other host it contacts (`sends_to`), and whether it calls models,
  always through the host's model service ([components.md](../../harness/docs/components.md)). The six components the
  Harness carries today run in its own process and contact no other host
  (`viable-harness components`). A component reaching data or hosts its manifest doesn't list is a
  security issue ([SECURITY.md](../../SECURITY.md)). One in a package you were sent starts no program
  unless you name it ([components.md](../../harness/docs/components.md#a-component-in-a-document)).
- **A local run keeps its trace on the machine.** `viable-engine run` and `runAgent` return the
  trace (each step's input and output, VETTING's rounds) to you and send it nowhere; nothing of the
  run goes to VIABLE. What leaves the machine is what each step sends, listed below.

### What a local run sends, and what it keeps

| What | Goes to | Kept on the machine |
| --- | --- | --- |
| The learner's message and earlier messages, the agent's instructions, the teaching settings, `--context` where a step reads it, and what earlier steps found (passages, pages, recalled facts) | your endpoint's `/chat/completions` | in the trace |
| Text a Speech step reads aloud | your endpoint's `/audio/speech` | the audio file, in the media folder |
| A picture's prompt: text written from the learner's message and models' replies, as the Image step's prompt says; for an edit, the pictures it changes (their addresses or data) | your endpoint's `/images/generations` or `/images/edits` | the picture file, in the media folder; the prompt, in the trace |
| A picture the endpoint returns by address | downloaded from that address, without your API key | the picture file |
| Facts a Memory step or an Agent step's memory tools recall, and a learner's facts a Memory step's Learn mode updates | the model steps that read them | with `--memory-dir`: `<dir>/<learner>.json` |
| An address a Fetch URL step reads | that address, fetched from this machine | in the trace |
| A course package's files named by `url` | downloaded from there; the download carries nothing of the run | in memory, for the run |

"Your endpoint" is `OPENAI_BASE_URL`, and `https://api.openai.com/v1` when it isn't set: set it
before a learner's message is sent anywhere. The media folder is `--media-dir`, else a new folder in
the system's temp folder; the steps list prints each file's path. The code deletes none of these
files.

`viable-engine serve` sends the same for each run. It also keeps the newest 500 runs' replies and
traces in memory until it stops, for apps that read a run back, and writes one log line per run with
its timing and outcome, never the learner's words or ID ([self-hosting.md](self-hosting.md)).

Memory is off unless you turn it on with `--memory-dir <dir> --learner <id>` (or `memoryDir` and
`learner` in `runAgent`). A learner's file holds each fact, its id and when it was saved, and
nothing else: no name, no message, no run. A fact is what a Memory step's Learn mode asked a model to
pick from the exchange, what a Save step wrote, or what an Agent step chose to save; the code
can't tell whether a fact names someone, so say in the agent's memory instructions what not to keep.
The ID must be a pseudonymous one (letters, digits, dots, dashes, underscores, colons; no spaces or `@`), and
every agent run with the same folder shares its memory: use a folder per course or per agent.
Delete `<dir>/<id>.json` to forget one learner, or the folder to forget everyone. A learner keeps
their newest 200 facts.

## What you still have to do

### Terms and consent

- Tell learners, and for minors their parents or guardians, what the AI does, which model provider
  receives what they write, what is kept, for how long, and who sees it, in your terms and privacy
  notice, before they use it.
- For children, get the consent the law requires before collecting their data. In the United States,
  COPPA applies to online services' collection of data from children under 13, and the FTC lets a
  school consent in parents' place only when the data is used for the school's own educational
  purpose. Elsewhere the age and the form of consent differ (for online services that rely on
  consent, the age a child can consent alone is between 13 and 16 in the EU, and 13 in the UK).
- Research with learners needs an ethics review (an IRB in the United States), consent from adults
  and parents and assent from minors, as the review sets them. The code has no consent step:
  VIABLE's hosted platform records consent for its studies, and a deployment of your own needs
  its own.

### Privacy laws

Which laws apply depends on who the learners are, where they are, and who runs the deployment. Among
them:

- **FERPA**, for education records at schools that receive US federal funds: a provider working for
  a school is usually allowed in as a "school official" under the school's direct control, by
  contract.
- **COPPA**, above, and the FTC's rule under it.
- **State student-privacy laws**, such as California's SOPIPA, New York's Education Law 2-d and
  Illinois's SOPPA, many of which require a data privacy agreement with the school or district (the
  Student Data Privacy Consortium's National Data Privacy Agreement is a common starting point), and
  state laws on children's privacy and online design.
- **Outside the United States**, data protection laws such as the GDPR and the UK GDPR, with their
  rules on lawful basis, children's data, transfers abroad and learners' rights.

### Data agreements with model providers

Every endpoint you configure receives learners' words, and the image endpoint receives prompts
written from them. Before learners use it:

- have an agreement with each provider (chat, speech and images) that covers data processing, what
  the provider keeps and for how long, whether it trains on your data, where the data is processed,
  and its subprocessors;
- check that the provider's terms allow use by or for the ages of your learners;
- with an open-weight model on your own servers, the text stays with you, and that server's logs and
  backups are learner data too.

### Retention and deletion

- Set how long you keep traces, media files, memory files and anything your hooks record, and delete
  them on that schedule: they are kept until you do.
- Answer a request to delete a learner's data everywhere it is: their memory file, the traces and
  learning records that carry their ID, their audio and pictures, and what your providers keep.
- Keep the table that links pseudonymous IDs to students apart from the rest of the data, under the
  school's control, so that the data alone doesn't say who a learner is. A class list in the Engine's console is that table,
  in the same store: it joins each name to a personal code. `--keep-days` doesn't delete it. Taking someone off the list or
  deleting the course does. If names mustn't be on this server, keep your list elsewhere and hand out codes from it, or use a
  class code or your school's sign-in.

### Logging and where traces live

- A trace holds what learners wrote and what the AI replied, the instructions each step sent, picture
  prompts and file paths; a step's inputs leave out values under names like `api_key`, and media
  appear as references, not bytes. Treat traces, `run --json` output, the teacher view's HTML and
  `hooks.logProviderCall` records as learner data: store them where your agreements allow, with
  access limited to the people who need them.
- Keep learners' text out of error trackers, analytics and shared logs unless they are covered too.
- Keep API keys in the environment (`OPENAI_API_KEY`) or in the console, which encrypts them, never in agent files or packages, and review
  an agent file from someone else before running it: it decides what goes to the model and which
  addresses its Fetch URL steps read.

### Unverified and needs-attention replies

- Decide what a learner sees when a reply is `unverified`: the fractions example sends a short message
  that asks the learner to rephrase or ask their teacher, instead of the reply the reviewer didn't
  approve. Don't send an unverified reply as if it had passed.
- An `attention` outcome means the reply model saw something that may need a person, such as a
  learner in distress. Nothing here notifies anyone. Decide who is told, how fast, and how that fits
  your school's safeguarding and reporting procedures, and give learners resources that fit where they
  are.
- Read the replies that didn't pass: the teacher view (`viable-harness view`) lists each one with its
  rounds and the reviewer's reasons (a gateway keeps those only with `--keep-text`).

### Accessibility

The Harness returns text, and the Engine audio and pictures too. A page you build, or the Engine's pages under your own settings, are yours to check. Build it to
WCAG 2.1 AA at least (in the United States, the ADA's rule for state and local governments, which
covers public schools and colleges, adopts it): give each picture a text alternative (an Image step
gives each picture a `description`), offer the text of anything read aloud, and make sure the
interface works with a keyboard and a screen reader.

### What a link can spend

Whoever holds a course's link can send messages, and your model key pays for them. An activity answers at most 5,000 messages a day, and each learner at most what you set in a course's Settings. To keep strangers out, use personal codes: then only codes on your class list open the course.

### A security contact

- Publish how people can report a security or privacy problem in your deployment (a `security.txt`
  file, RFC 9116, is one way), and answer them.
- Report a problem in this code privately, as [SECURITY.md](../../SECURITY.md) says, never in a
  public issue, and keep to its latest minor release, which receives fixes.
