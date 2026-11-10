# Changelog

Changes that matter to people who build on this. Versions follow semantic versioning; a change
to a format or to what a step's setting means is at least a minor version and says how to move
existing files.

## Unreleased

- **A teaching policy in code.** `teaching.ladder` (`true`, or `{ hint_after, example_after }`) on the level that steps up has code decide each turn's act from the tries so far: a question, a hint, a worked example, or a confirmation once the learner has the answer (`turnAct`, `ladderOf`). `prepare` takes `question` and `answer` and returns `act`, `reached` and `diagnosis`; `check({ turn })` holds a reply to them. The key still never reaches the model that writes. Without a ladder nothing changes ([policy.md](harness/docs/policy.md)).
- **Code checks a reply before a reviewer does.** A draft that states the key's number or words fails with no model call (`replyChecks`, `statesAnswer`; `code_checks` in the result and the record). On a turn that gets one question, a second one asks for a rewrite and never causes the fallback line. `checkReply({ codeChecks: false })` leaves everything to the reviewer, as before.
- **The procedure behind a wrong answer, computed.** `diagnose({ question, said })` applies 66 faulty procedures to a problem that is two numbers and an operation and names the one that gives the learner's answer, or two when both do, or none. A turn's instructions say what the answer shows.
- **A small model reads, code counts.** With `pickerModel`, the model says what each learner message was and is shown the problem (never its key); tries are counted from its labels, so a model can't call a first try "repeated".
- **A worked example's problem, chosen by code.** On a turn that gets an example, `similarProblem(question)` gives a problem of the same shape with none of the learner's numbers and never their answer, and the turn's instructions say to work that one (`turn.act.example`). For a problem that isn't arithmetic the model chooses, as before.
- **A procedure applied to another problem.** `applyProcedure(id, question)` returns what a learner who follows that procedure would answer there.
- **Three more rows on the scorecard, and two more guarantees**, on two new sets (`scorecard/wrong-answers.json`, `scorecard/tutoring-conversations.json`): the procedure named, the act code decides, a right answer seen, a reply that states the key stopped by code, and a worked example that never holds the answer. The tables call the two halves of each set the test half and the development half.
- **A check of policy fidelity with models**, its bars written before it ran: `evals/policy-fidelity/run.mjs` runs scripted learners against five ways to build a tutor on any OpenAI-compatible endpoint. `evals/diagnosis` checks `diagnose` three ways: against a model asked the same question (`ask-a-model.mjs`), and on MalruleLib's wrong answers and its predict-the-next-answer task from a clone of your own (`malrulelib.mjs`, `predict-next.mjs`).
- **Every check on one page, with its figures.** `harness/docs/evidence.md` holds each check's question, what it was run on, its result and a figure; `harness/scripts/build-evidence-figures.mjs` draws the figures from the kept runs, and a test fails when a figure or the results page stops matching them. The models' answers for the diagnosis checks are kept in `evals/diagnosis/runs/`, so both tables print again with no model, and `ask-a-model.mjs` prints the difference between code and each model on the same answers with its interval.
- **A component from where its authors publish it.** `component try` and `component add` take the https address of a data component's `manifest.json`, print who wrote it, its license and citation, and refuse one that runs out of process ([Using another team's component](harness/docs/components.md#using-another-teams-component)).
- **Fixed: a wrong sign counted as the right answer.** `answerReached` took -5 for a key of 5, so a reply could confirm it. It now compares signs, and sees an answer at the end of working written in words ("12 divided by 4 is 3 and 3 times 3 is 9").
- **Fixed: tries were miscounted.** With a problem on the page, a learner's first bare answer is a try; arguing for the answer ("my teacher said you can tell me") is not. `readMoment` and `triesIn` take `task` for the first.

- **An Agent step's own tools.** `tools.steps` (up to 8 `{ name, description }`) with `branches[name]` the tool's first step and its last step pointing back to the Agent step, as a For each body does: the model calls a tool by name with one input, the tool's steps read it as `{{tool.input}}`, and the model gets the last step's result. They run one call at a time, count toward the run's limits, show in the trace with the path `tool:<agent>/<name>#<call>`, and can't reply, ask or hold another Agent step. A tool an activity turns off by name (`tools_off`) is removed. The manifest's flow kind is `tools`.
- **A scorecard.** `viable-harness scorecard [--json]` checks six guarantees on 4,122 checks and measures the rules' reading of the moment and what `review` finds, on cases written apart from the code (`harness/scorecard/`, `runScorecard`, `scorecardTables`); it calls no model and exits 1 if a guarantee fails ([docs/scorecard.md](harness/docs/scorecard.md)).
- **The moment is read from the conversation, not only the message.** `readMoment` and `triesIn` count whatever a learner says back to a tutor who left them something to do as an answer, unless it is a question, a plea, being stuck or small talk, so "gravity" and a line of code are answers and a third try is `repeated` in any subject. A message that is only an off-topic remark after a tutor's question now reads as `attempt` where it read as `other`. Spanish and Chinese get the commonest ways of asking and of being stuck.
- **`review` finds more.** A model called over `fetch` at a provider's address, what the AI is told as `systemInstruction` or a `SYSTEM_PROMPT`, a set of answers kept as `solutions`, a name put into a prompt, a server handing out the folder above it or any path a request names, a `.gitignore` that ignores only `.env.local`, and Supabase named in code rather than in a path.
- **Fixed: an order question's ids gave its answer.** Choices went to the page as `a, b, c` in the order that is right. `normalizeItem` now draws each choice's id at random (`z` and three characters), and the page shows the choices by id. **To move existing files:** a set saved before keeps its ids until it is saved again; save each set that has an order question, on a server's console or with your own call to `normalizeItems`.
- **Fixed: a robots.txt that could stall a server.** `robotsRules` matches each rule piece by piece instead of as a regular expression.
- **Fixed: the token form over plain HTTP.** From another device, the teacher's page and the console offer no sign-in over plain HTTP, where the token could be read on the network: use the computer that runs the server, or HTTPS. A proxy that passes on `X-Forwarded-Proto` is unaffected.
- **Fixed: the Cloudflare template** turns on `global_fetch_strictly_public`, so a fetch can't reach other hosts of the operator's own zone at their origin.

- **TutorMoments as a test suite.** `--suite tutormoments`: Ai2's moments from real K–12 math tutoring (CC BY 4.0, under Ai2's Responsible Use Guidelines), pinned at a revision: the 485 of its 520 that end on the learner, a speaker's turns in a row as one message, with what teachers marked as the rubric (scaffolding, or a push for rigor), half of each in a run. A catalog entry's `license.terms` are accepted before anything is fetched, like a license's limits. The moments are split by conversation, so no conversation is on both sides: `--split held-out` is 191 moments from 45 conversations, kept for the with/without comparison, and `--split development` the other 294 (`heldOutConversations` says which). A case's reference data (`context`) holds only the moment's id: an agent with Reference data on reads it, so the teachers' label is only in the rubric, for the judge.
- **A test case says where it came from.** `source` ({ name, resource, license, cite, url }) is set on every case a suite makes and kept through `validAgentTest`, so a result or a copy of it credits its source; `test --html` says it under each case.
- **How the AI helps on your own model.** `test --endpoint` takes `--teaching teaching.json` (and `--section`): each case gets what the Harness prepares for its turn, after your `--system` prompt, as the gateway does, so the same cases can run with and without it.
- **What went into a reply, by kind.** Each piece in a turn's record (`turnRecord`) says its `kind`: misconception, skill, prior or guidance.
- **Edu-ConvoKit as a component.** `resources use edu-convokit` writes an adapter (`integrations/stanford-edu-convokit`) that runs Stanford's Edu-ConvoKit over a learner's turns on your own computer: a measure (talk time and math density, no model) and a detector that marks where the learner explains their reasoning, where the AI asks a focusing question and where it builds on what the learner said. Each classifier is one you download under its own license (non-commercial, or GPL with no version) and turn on; `--download` shows the license first. The adapter is the lab's; Edu-ConvoKit's authors haven't reviewed it.
- **Two calibration sets from classroom talk.** `calibrate --set conversational-uptake` and `--set funneling-focusing-questions` check a judge model against experts' ratings of 4th and 5th grade math lessons (Demszky et al. 2021; Alic et al. 2022), fetched from their pinned commits, half pass and half fail, keeping only the student's turn, the teacher's reply and the rating.
- **Nine more catalog entries, 64 in all.** Edu-ConvoKit; its uptake, focusing-question and student-reasoning models; the two annotation sets; Amber's tutoring transcripts; CoMTA; and Eedi's tutoring dialogues, each with its license as its source states it (unclear where it is) and what it can't show.

- **Extra time for one learner.** On a learner's page, Extra time stops every step timer moving them on: a step set to open on its own waits until they say they're ready, its minutes still the earliest (`stepReply(..., { extended })`). Kept on the class list (a person's `extra_time`, set through `classes.change`); a host can also count extra time it keeps for one activity.
- **More time on one activity.** A learner's page gives them more time on an activity that closes: it stays open to them alone until the time set, after it closes for everyone (`PUT courses/{code}/people/{id}/more-time`, `releaseState`'s `extension`), and no step timer moves them on in it. Taken back from the same place. On the Engine it is kept on their record (`extendFor`).
- **Opening asks first.** Open on a course page or on Ask's card lists what would stop the activity working for learners, from the checklist's own checks (`courseChecks`, `GET courses/{code}/checks?activity=`), with where to fix each, and Open anyway; with nothing to say, it opens. Buttons and forms take `data-checks`.
- **Three more cards.** Questions Ask wrote come back to look over, each with its answer, to change on its page or remove (`questions`); `offer_versions` shows two ways to write something side by side, and one press chooses; `show_schedule` lists when each activity opens and closes, set on the card (`POST courses/{code}/activities/{key}/schedule`).
- **A date and time picker of VIABLE's own.** Every date field in the console opens a calendar in place of the browser's control: the value in words on the field, a month to choose a day in, and for a time a column of quarter hours with the end of the day, headed Time. Arrow keys, Page Up and Down, Home and End move through days; on a phone it opens at the foot of the screen. The input stays, hidden, and holds the value (`dressDate` in `console/datePicker.js`); `data-empty` and `data-default-time` say what a field shows empty and the time a day takes. The VIABLE Developer Platform runs the same picker, written into it by `npm run ui:build`.
- **A unit's dates.** A unit's menu sets its From and To days, which learners see beside its name (`PUT courses/{code}/units/{ref}` takes `starts_on` and `ends_on`); To can't come before From (`data-min-from`).
- **Dragging into order.** Activities and units have handles to drag them by, an activity into another unit too; letting go sends the whole order (`PUT courses/{code}/arrangement`), and each activity keeps its address. While dragging nothing on the page moves: a line shows where it would land. One module does it from marks on the page (`arrangeable` in `console/dragOrder.js`: `data-drag-block`, `data-drop-group`, `data-drag-item`, and `data-drag` on the handle), and the VIABLE Developer Platform's course page drags with it too, written into it by `npm run ui:build`.
- **A class list from an Excel file.** Open a file takes an .xlsx and reads its first sheet in the browser (`sheetRows` in `console/sheets.js`), the file going nowhere; a file with more sheets shows each by name, to read another.
- **Units where the activities are.** On a course's Activities, each unit is a heading over what is in it: add an activity there, rename, move or remove it from its ⋯ menu, and move an activity into another unit from its row (`POST courses/{code}/units`, `PUT`/`DELETE courses/{code}/units/{ref}`, `POST …/units/{ref}/move`, `POST …/activities/{key}/unit`). A rename keeps what is in it. Up and down move an activity within its unit. Ask still sets units as a list of titles (`PUT courses/{code}/units`).
- **A class list however it comes.** People takes names typed one a line, or a list pasted or opened from a file (.csv, .txt): spreadsheet columns, a school system's export with its headings, “Last, First”, first and last names in two columns, names on one line, numbered lists. `readClassLines` finds what each column holds (name, first, last, section, or left out, such as email addresses and student numbers), from headings or from what is in it, and a teacher can change each one; a column's choice holds while the list is edited (`shape`). Before anything is added, `POST courses/{code}/people/preview` shows who each line becomes: new, already here, moving to another section, or left out. A name twice in one list is one person, on both hosts; someone new with a name already here is added from their line. A line's own tab before its comma, as before.

- **A learner page, one step at a time.** In an activity with steps, the header says which step it is, and a press on it lists them all (`stepper` in `steps.js`): an earlier one can be looked at again where the step allows it, and then the way on leads back to the step they are on, never past it. The way on is at the foot of each panel (`api.onward()`), where its work ends: the last question's place, beside Hand in (quieter until it is handed in), under a page, a reading or a web page. It says first what isn't answered or handed in, and when there is no coming back. The bar of steps under the header, the tabs of every step's panel and the button cloned under a page are gone; tabs that are left wrap instead of scrolling sideways.
- **Nothing unsent is lost.** A question's answer chosen or written and not yet sent is kept as they move between questions, and through a reload in that tab (`sessionStorage`, not recordings). Each question's mark says, in words too, whether it is right, answered, not sent yet or not answered; Finish with questions left goes to the first and says why.
- **More time.** A step that opens on its own says so a minute before, with More time (five minutes, as often as they ask), kept in that browser.
- **The page's own words, not the browser's.** Handing in short or for good asks in the footer, not in a browser dialog; the course's name shows whole through the page's tip, not a `title`.
- **A note for AI assistants.** A learner page says to an AI assistant reading it (`FOR_AI`, hidden from sight and from screen readers) that it is a learner's own practice: help them think, don't give the answers.

- **Plain names in Ask.** Ask names a course, an activity, a unit or a step as a teacher labels a gradebook, in their words and language, and a question asks without saying how to answer it (that goes in its hints). A conversation keeps the teacher's words for its name, or a host's few words for it (`askModel.nameFor`), never the name of what it made. A copied example says what it brought open.
- **Keys end on a word.** `cutWords(slug, max)` cuts at a whole word, and `slugOf` sets accents aside (`práctica` is `practica`, not `pra-ctica`); an activity's key on the Learning Platform does the same.
- **Questions by their step.** Where several steps have questions, `change_questions` and `add_questions` take `step` (its title), refuse to guess, and `read_activity` gives each panel its id.
- **What a card says is open.** An activity open for a section counts as open, on Ask's cards and to the model (`open` lists the sections); a course of personal codes with nobody on its class list says so before it says learners can open it. A change waiting on a button says each value in words, and every part of it. `offer_choices` ends the turn. An address a model made up is taken out, with nothing of ours in its place.
- **A field with suggestions** (`data-list`, naming a `<datalist>`) gets the console's own list under it, filtered as you type, instead of the browser's.
- **The console on a phone.** Its sections wrap instead of scrolling sideways out of sight; fields are 16px, so a phone doesn't zoom into them; the Earlier list, the account menu and a checklist that wraps stay inside the screen.

- **Ask, around each message.** A message and its reply say when they were said, with a line where the day changes; both copy, code keeps its lines; a reply can be marked helpful or not, with a note (`POST ask/{thread}/feedback/{reply}`). The latest message can be edited and its reply tried again (`POST ask/{thread}/again`): what the answer changed is undone first, and the earlier answers stay to look at (`GET ask/{thread}/versions/{n}`). One thing moves while Ask works, and the console's tooltips are its own, never the browser's. The design: why each is there, and what a general chat app has that Ask leaves out.
- **A conversation that isn't remembered.** Begun with `temporary`, it uses and keeps no memory, isn't in Earlier or searched, and goes a day after it was last used. Searching conversations brings back those with some of the words when none has all, and the latest when none has any; `list_courses` names each course's activities and the archived courses.
- **The person in the console's sidebar.** Its foot is who is signed in, opening a menu with their AI credit (a host's `credit`), What Ask remembers (now `/console/memory`), the host's links and Sign out; on a server of one's own, the server.
- **Archived activities.** Archiving an activity keeps it under Archived at the foot of its course, to restore as it was or delete (`keepActivity`, `archivedActivities`, `restoreActivity`, `deleteActivity` on a library); deleting is what forgets its learners' work here.
- **Memory in any language.** `memoryTerms` sets accents aside (fracción meets fracciones) and reads words in other alphabets (Cyrillic, Greek, Arabic, Hebrew, Devanagari), whole and by a rough stem, over `foldText`, which a conversation's searched text is kept in too. `pickMemories` says how many memories it left (`rest`), and `memoryNote` tells the model to look those up in the language they were kept in. A deleted conversation leaves what Ask kept in it, without its link (`unlink` on both stores), and the console says so before deleting.
- **What Ask remembers.** `memory.js`: a person's memory for an assistant, as short sentences, never a learner's (`memoryRefusal` refuses a name from their class lists, an address, more than a sentence). `pickMemories` gives a message what is kept always in mind (up to 8) and the few others its words meet (up to 4), in any language; `memoryNote` words them as context that what the person says now overrides; `searchConversations` finds earlier conversations by their words. On the Engine, Ask keeps and changes what the person tells it (`remember`, `forget`) in front of them, looks up the rest (`recall`) and their earlier conversations (`search_conversations`), and says in a step when something it remembered came up; What Ask remembers (`/console/ask/memory`) shows all of it, to change, move, delete or switch off (`storeMemory`).
- **Archived courses.** A course's Settings archive it: learners can't open it, and it waits under Archived at the foot of Courses, kept as it is, until Restore brings it back as it was or Delete deletes it. The library's `archive`, `archived` and `unarchive`; on a host that keeps what learners did (`archives`), Delete takes the course out of the teacher's courses, and on the Engine it deletes the course and their work from the server. Ask's Undo of a course it made archives it on the Engine, so Redo can bring it back.
- **No page from before a change.** The console's answer to a change says `Clear-Site-Data: "prefetchCache"`, so a page the browser fetched ahead as a pointer rested on its link isn't shown as it was before the change (Chrome 138 and later; other browsers don't fetch ahead).
- **Open to learners.** An activity's card in Ask says who its button opens it to, and once it is open shows the course's link, the poster to show the class and a QR code, unless the conversation already has them.
- **A hint isn't giving the answer away.** VETTING's answer-key review fails a reply that states the answer, points out the correct choice or does the remaining work, and no longer one that names the idea, rule or method or points at the next step: before, with no `key_concepts` listed, it was told to fail "any of the key concepts" and took hints for them. Only listed key concepts are held back. `explanation`, and the `Explanation:` line a question panel's key ends with, are told to the reviewer as how the answer is reached, no longer as part of the answer.
- **Where misconceptions came from.** What the AI did names the source of the misconceptions it listens for (`settingsShown(...).listens_from`) and of one heard in a message, and a Creative Commons license by its short name (CC BY 4.0). A turn brief's misconceptions, parts of a standard and skills to go back to keep their `source`, so the panel names it on each turn; the brief's text for the model doesn't change. Its `control` may also be `{ param, own, tried }` for a host that keeps no try's settings: choosing a level opens the page again with it in its address.
- **Whose work it is, where a teacher sees it.** The Engine's activity page names the source and license of a chosen standard or skill, of misconceptions (the one searched too) and of each piece of guidance, opening to its attribution; a skill search names where its results come from, and its levels are the Carnegie Skills Progressions' own (Exploring to Extending) instead of names they didn't match. Ask's look-ups and `set_how_ai_helps` say where what they found or set came from, a host's `standards` service can name its `source`, and What the AI did shows a chosen standard or skill with its source (`settingsShown(...).standard.from`). `sourceName` and `skillsSource` are exported.
- **A section's own moments, and ways the AI helps.** A section's own settings (`teaching.sections`) can say when the AI writes first for its learners: its own moments, or `'off'` for never. `teachingWith(teaching, way)` lays a way (`wayOf`: `help`, `speaks_up` or `'off'`) over an activity's settings, and `teachingForSection` does it for a learner's section; the Engine's learner server and a console's activity page go by them, and a learning page takes its learner's moments from the `learner` endpoint (`speaks_up`). `schemas/teaching.schema.json` now holds `speaks_up`, `reviewer_reads` and a section's `speaks_up`: before, a package that carried them was refused.
- **One scale for how much the AI does.** The levels run from the least to the most, each the one before and one thing more: `check_only` (Only checks), `ask_first` (Asks questions), `hint` (Gives hints), `step_up` (Shows an example), `explain` (Explains), in `HELP_LADDER` (`ui/parts.js`) with what each adds, when to use it and what it sounds like. `ask_first` now means only asking: its instruction no longer allows hints, so an activity that had it is stricter; `check_only` says it doesn't teach. A console's activity page shows them as one scale and lights up, in what the AI reads, the paragraph a choice changes.
- **The AI can write first, unasked.** `teaching.speaks_up` (`speakUp.js`): after some quiet minutes on a step (`quiet`), after working a while without asking (`alone`), after a wrong answer (`wrong`) or every so many right ones (`right`), while writing every so many new words at a pause (`writing`), and when writing is handed in (`handed_in`); on writing, `how` (ask, point, fix) and `focus` (language, ideas, rubric); for any moment, `say`, what the AI does then in the teacher's words. At most `most` times in a step each day and `gap` minutes apart (429 `speaks_first_soon`), off unless chosen. The page carries only when each moment comes (`speaksUpOnPage`), never what the AI is told. A learning page sees the moment and posts `messages` with `event: { kind }` and no words; the server checks the teacher chose it and holds to how often (409 `speaks_first_off`, 429 `speaks_first_limit`), the AI is told what to do at that moment with the studies it rests on, and the turn is kept with `signals.source` `ai_first`, `signals.moment`, and no message. A learner sees why it began.
- **What a reviewer reads.** VETTING's `reviewer_reads`: only the reply, as before, unless the step or the activity's teacher (`teaching.reviewer_reads`) lets it read the learner's last message too, as data, when it also fails a reply that doesn't answer them. Never on a turn the AI writes first. The step's choice wins.
- **What the AI did is kept with each run.** A run keeps `context.turn_record` (the step and what the Harness read of the moment); `turnEvents` reads a kept turn back as the panel's events, `turnTree` draws one on a server, and `keptTurnEvents` reads the Engine's. The panel reads every turn again from its host when it opens (`…/watch`, only where it was granted) instead of twelve in a browser. The Engine marks a teacher's try-out turns (`tried`) and `records.tried(code, key)` lists them, as the hosted service lists its previews, for **What the AI did in your tries** on an activity's page.
- **Ways to arrange a whole activity.** Ten activity designs from research (`designs.js`: predict-observe-explain, claim-evidence-reasoning, worked-example fading, try first, retrieval practice, teach the AI, vote-argue-revote, role play and debrief, explain as you read, draft-feedback-revise), each with what it suits, what isn't known, its sources and its steps, and eight rules for any of them. `findDesigns`, `reviewActivity`, the MCP tool `find_designs`, `viable-harness designs`.
- **A page to read, and an AI that speaks first.** A new panel, `page`: Markdown, up to 12,000 characters. A step can say what the AI does there (`brief`, for the AI only) and what it says first (`says`), and an activity with no steps its `opening`. `teaching.role` says who the AI is here. `teaching.design` names what it is built on, and doesn't reach the AI. Up to six steps and eight panels. All optional: nothing saved before needs changing.
- **A level that steps up.** `step_up` asks first, then hints, and once they have really tried shows a worked example with other numbers, then sends them back to their own. `ask_first` and `hint` now say so when a learner has it: hints only limits giving the answer, not telling them they're right. One name for each level on every screen: Steps up, Hints only, Explains, Only checks, Asks first.
- **A learner who has it is told so.** `context.answer_holds` says yes or no, worked out on the server, for what they have chosen or written and not sent, where pressing Check would tell them anyway. VETTING's reviewer doesn't fail praise of a method, and a rewrite changes only what the reason objects to, staying on what the learner said.
- **What the AI did says where each part came from**, and "Passed" says what it passed.
- **Ask writes whole activities.** `add_activity` and `change_activity` take `steps`, `says`, `starters` and `design`; `read_activity` shows them with what a teacher would want to fix first; `find_designs`; `file_materials`. A second activity of one name is refused, and one that can't be found says what the course has. A step has the AI only where it was given something to do.
- **For hosts.** `threads` gains `keepCheckpoint` and `checkpoint`, for Undo and Redo; `library` gains `unarchive`; `materials` gains `folders`, `makeFolder`, `renameFolder`, `removeFolder`, `move` and `courseFolder`, and `list`, `add`, `addLink` and `search` take a folder, none of them required. The console's shared code and styles are files that can be kept for good (`consoleAsset`), so a click brings only the page.
- **Ask opens links.** Put an address in a message, and it reads the page. Only an address the teacher wrote or a search found opens, whole, and an address a page names doesn't. An activity's web page takes the same. A site that won't let a program read it is said plainly.
- **Class lists in tables.** A table's names are found in any column, under a heading that says so or not, in what's pasted, in a material and at a link.
- **For hosts.** `web` gives Ask a way to the web: `read(url)` for a page, and `search(words, run)` with `searches()` for a search of the host's own. A server reads pages over its outward fetch and has no search. `chat` is told `trace` (the run, the conversation, the call and how many messages are new), for a host's logs, and `askModel.kept` is said beside the box.
- **Ask works like an agent.** Its box stays at the foot of the page, and its work shows as a timeline of steps with the time and a Stop button, then folds to a line. Words arrive as they are written where a host's model streams. A course or activity can be brought in from its page or from +; `read_activity`, `change_activity`, `change_questions`, `change_course` and `copy_activity` change what is there, and show a button instead where learners would meet the change. Conversations can be deleted, one or all.
- **For hosts.** `materials` gives Ask and a Materials page files to read; `askModel.hear` and `askModel.hears` let a teacher say it instead of typing; `chat` may take `onText` for words as they come; `consoleApp` takes `home`, where its name leads, and `who`, who is signed in; `library.titles` lists courses without reading them.
- **The console's own controls.** Every select is dressed as the console's menu, with a hint under an option where it has one, and the select stays underneath for forms and for a browser that can't. Every file input is a place to drop a file. A form with `data-confirm` and no `data-api` asks, then goes the browser's way. A page that isn't there says so in the console's shell. New course shows what each example holds.
- **For the AI that builds.** A Skill, `building-for-learners`, for coding agents making something learners will use: what to ask first, the least to build, what a class does to a tool (one address, a budget per class, shared computers), learners' data, and when to stop and say so. `viable-harness review` reads a project for what classrooms trip on, with no model and nothing leaving the computer. `tutor-tests.json` is a ready set of tests for a tutor it builds. [docs/for-builders.md](harness/docs/for-builders.md).
- **Ask.** With a model set, the console opens on a conversation: say what you're teaching, and it makes the course, activities and questions through the console's own routes, showing each step, and hands back cards for the link, QR code, class list and progress. What reaches learners waits for a person's click, enforced on the server, and names never reach its model. The role `assistant` is optional.
- **What reaches learners stays a person's.** Ask won't change teaching or questions on what's open, for everyone or for a section, or add a first section to a course in use. It says why, and where the teacher can do it.
- **Class lists.** Pasted lists read as lists in any script or case, numbered, with IDs or emails, with a button to send a note that only looks like one. Two columns of first and last names are refused rather than read as sections.
- **A preview shows everything.** Trying a course opens activities learners can't yet, and says so on each.
- **For hosts.** `consoleApp` gives a host the console's routes and pages for whoever it has signed in, with `library`, `classes`, `records` and `threads` of its own. `simple` leaves out what such a host decides for teachers.
- **A colour picker of the console's own.** An agent's colour opens twelve named swatches, each 4.5:1 on white and 3:1 on a chat page's dark background, and a hex code for any other, in place of the browser's control. The input stays, hidden, and holds the value (`dressColor` in `console/colorPicker.js`).
- **Try it at another help level.** On the Engine, Try it has what the AI did beside the page, since only the token holder reaches a try, and its How much the AI does opens the try again at another level (`?help=`) for that try's own turns; the activity and its sections keep their own. `teachingAtLevel` (`harness/src/utils/teaching.js`) gives the settings at a level, for a preview or a try.

## 0.3.0 (2026-11-05)

Two parts, one repository.

- **The Harness and the Engine are separate.** The repository is `viable`. `@viable-lab/harness` has no dependencies and nothing
  of the Engine; `@viable-lab/engine` stands on it. `viable-engine` takes every `viable-harness` command, and the commands that
  run agents (`run`, `serve`, `try`, `inspect`, `deploy`, `verify`, `knowledge`, `records`, `forget`, `test` on an agent file) moved
  to it. `VIABLE_HARNESS_*` variables are now `VIABLE_ENGINE_*`. A scaffold's code is in `vendor/engine` and `vendor/harness`.
- **Agents, chat pages and knowledge, in the console.** From an empty server, in the browser: a knowledge base from files and
  websites, an agent from a form, a chat page with its link, QR code and chat button. A package can now hold knowledge bases
  with no agent yet (`anyOf` in its schema), and keeps and downloads its files' text copies and its websites' pages, which it
  used to lose when added in the console. `uqr` (MIT) is a new dependency of the Engine. A scaffold's `package.json` lists it.
- **Before the reply.** `prepare` reads the moment and gives a model what it needs (`turnBrief`), `check` and `record` take the turn, and
  five tasks prepare other teaching work. The gateway and the Engine read the moment by default: `--whole-settings` on the gateway sends
  everything the teacher set, as before.
- **Rules.** `tools_off` in How the AI helps says which tools are off, and they are removed, not only told.
- **A learner who is right is told so.** The rule read "Yes, 3 5/6" as giving the answer away, and a rewrite dropped it. A reply that treats
  the answer as the learner's own now passes, one that supplies it still fails, and one that calls a wrong answer right fails. Code compares
  what the learner wrote with the key (`answerReached`, or a question panel's own marking) and tells both models only whether they have it,
  so the reply says they are right and may discuss the answer. Where code can check and they haven't written it, the reviewer hears that too, so a learner who only claims the answer doesn't get it confirmed; an answer in words code can't read counts as not written. The reviewer still reads nothing the learner wrote. A rewrite keeps the reaction. A review's default limit is now 1,024 tokens in both modes, so a reasoning model
  doesn't run out before it answers: an empty review counts as a failure.
- **Guidance from research, ready to choose.** 77 pieces on 8 topics (scaffolding, feedback, tutoring talk, self-explanation, worked examples, productive struggle, recall and spacing, metacognition), each naming the studies it draws on and saying what isn't known. Chosen in How the AI helps in the console, with `viable-harness component add viable/feedback`, or found with the MCP tool `find_guidance`. Those for a moment take turns, so a learner doesn't hear the same two every time.
- **Others' research reaches a reply.** A `context` component can be one JSON file (`runs.kind: data`), with nothing to host. Its pieces go in an
  activity's settings (`teaching.guidance`, `guidanceFrom`), and a turn's brief takes at most two that fit the moment, with their source.
  `viable-harness component new`, `try` (what a model is told with and without it) and `add`. [docs/how-it-works.md](harness/docs/how-it-works.md) says how a turn chooses.
- **What the AI did** closes at any width, so you can see the page as a learner does, and `watchSlot({ fontBase: null })` carries its type in the page for a host that serves none.
- **`checkReply` no longer runs a graph.** The review is in `checks/vetting.js`, and the graph's VETTING step runs the same one.
- **`viable-harness test --endpoint`** tests whatever is behind an OpenAI-compatible endpoint.
- **A course's setting for who its learners are now applies on your own server.** A package with `identify: code` opens only for
  personal codes on its class list, which a package doesn't carry, so add one in the console, on People; one with `identify: ask` asks
  for a name or ID. Each browser stays the default, and a class code or a proxy's header still wins. To keep the old behaviour for a
  package, set `identify` to `browser`.
- **Hardened after an adversarial review.** A page that isn't for everyone holds only its panels' names until the server knows who is asking (`/panels`). A package added in the browser can't start a program, take another course's address or turn on its own chat page, and an image at another address is dropped from it. Going back to a version keeps who can get in. New limits: wrong tokens per address, new learners per address and per course, large messages with no stated size. `--trust-proxy` counts a proxy's visitors apart. A `start` server on this computer answers only to its names. A store's files are its owner's alone. A survey's host gets an ID that signs in to nothing.
- **People, Share and Progress in the console.** A class list with personal codes, cards and a CSV; sections, with their own links, help
  level, note and opening; a QR code and a poster; who has done what, one learner's work, and what to look at, with a suggested change
  accepted in one button. A name never reaches a model. Scaffolds and images now also install `uqr`, which draws the QR codes.

## 0.2.0

The first version as its own repository.

- **Models, set up in the browser.** `/console` is the Engine's own pages, behind the teacher's token and session; its first
  is Models. Add any OpenAI-compatible provider, test it, and say what each model is for, as seven roles, each on its own
  provider and key. Keys are encrypted at rest, with `VIABLE_ENGINE_SECRET` or a key in the store's folder, and never reach a
  browser. The environment and the model flags keep working and win. `serve` with no agents starts, and sends you there.
- **What a model makes possible turns on, on any target.** Voice on the learner pages (dictation, voice messages and
  conversations) through `/audio/transcriptions`, reading aloud through `/audio/speech`, a learner's photos and PDFs for a
  reply model switched on as reading them, pictures from an Image step on the page, and knowledge search by meaning through
  `/embeddings`, kept per file and falling back to keywords. `inspect` and `GET /v1/server` (so `verify`) report what is on and
  off and why. A models file also takes `transcribe`, `picker`, `meaning` and `reads`. Replies reach a page and `stream: true`
  word by word where the endpoint streams.

- **Docker has been run.** The root `Dockerfile` didn't build before; it now does, for `linux/amd64` from an arm64 Mac
  too. A docker scaffold has a health check, `compose.yaml`, and `records.js` for `records export` and `forget` inside the
  container. Its README says how to reach a model endpoint on the same machine.
- **A stopped scaffold finishes the run under way.** On `SIGTERM` it answers and keeps that run, then exits, as `serve` did.
- **A wrong setup says what to do.** A server that can't write its folder won't start. An endpoint it can't reach is 502
  `provider_error`, not 500 `agent_run_failed`, naming the address and what to check. At start, it prints where model calls go.

- **With no token, a server answers this computer and its own pages.** `serve`, `gateway` and `try` refuse any
  other name in `Host`, a proxy that says it passed a request on, and a post with another site's `Origin` (or
  `--cors`'s). Routes that take JSON answer 415 to anything else: `curl` needs a `Content-Type`.
- **The teacher's page always takes a token.** With none set, `serve` and `gateway` make one at start and print
  it once. `--panel` likewise, and it shows only on a page asked for with `?panel=1`, for a session that ends
  with the browser or after 8 hours, with a Sign out. `--learner-header` needs `--token-env`.
- **`try --export` refuses anything but the bundled examples** without `--publish-answers`. `/?tour=1` does
  nothing unless started with `--demo --tour`.
- **`--keep-days` takes all a learner wrote**: drafts, answers, highlights and events as well as turns, each from
  its last change, and Lambda and Firebase scaffolds now sweep daily. A course longer than the setting loses an untouched draft.
- **`readZip` bounds what it inflates** by default, 64 MiB an entry and 256 MiB in all; pass `maxBytes` or
  `maxTotalBytes` for more.
- **A document can't start a program.** A component step in an agent file or a package calls only `http`
  components at a public address, unless the person running it names the ID (`--allow-component`,
  `VIABLE_ENGINE_ALLOW_COMPONENTS`). If you run an MCP component from a file, add the flag. `inspect` says
  what each step would contact or start.
- **A Node host refuses private addresses** in Fetch URL steps, `fetch_url`, files named by URL and http
  components, when a name is looked up and again as the connection is made
  (`server/publicFetch.js`; `createRuntime` takes it as `services.httpFetch`, `server/onNode.js`).
- **A caller who leaves a conversation they named still gets the turn:** it finishes and is kept, as on the
  platform and on chat pages. Any other run stops when its caller leaves, since nobody could find its reply.
- **Gateway records keep a reviewer's reasons only with `--keep-text`,** since a reason can quote what was said.
- **The core, standing alone**: the engine, its 23 step types, VETTING, How the AI helps, the
  research measures and the data they use (Eedi's misconceptions, the Carnegie Skills Progressions),
  importing nothing but Node's built-ins and one dependency, checked by `test/boundary.test.js`.
- **VETTING as a function**: `checkReply` and `viable-harness check` run the engine's own VETTING
  step on a reply your app wrote.
- **Agent tests**: the case format, the judge and `viable-harness test`.
- **Suggested changes**: `suggestChanges` and `viable-harness suggest`, rules over runs and learner
  records, each suggestion with its evidence.
- **The teacher view**: `viable-harness view`, one self-contained page.
- **Local runs** search a course package's own files, call its other agents, speak through
  `/audio/speech` and read HTML pages; all six examples run locally.
- **Components**: the manifest format (`schemas/component.schema.json`) and six built-in components.
- **MCP server and Agent Skills**: `viable-harness mcp` and `skills/`.
- **MCP Apps views**: in assistants that render MCP Apps (`io.modelcontextprotocol/ui`),
  `check_reply`, `run_agent_tests` and `suggest_changes` show their result as a self-contained page
  that loads nothing; the server offers them only to a client that says it renders them.
- **Your own server**: `viable-engine serve` answers apps' agent runs as VIABLE does
  (`POST /v1/agents/{slug}/runs`, reading a run back), with a token, limits, memory per pseudonymous
  learner and one log line per run; a `Dockerfile` serves `/agents` ([self-hosting.md](engine/docs/self-hosting.md)).
- **Courses as they are downloaded**: `run` and `serve` take a `.viable.zip` and read its files from
  the archive; `--knowledge <id>=<folder>` searches a folder as the knowledge base an exported agent
  file names.
- **Course packages**: a file may carry `text_path` and `text_sha256`, a Markdown copy of its text,
  which VIABLE writes for PDFs and Office files and a local run searches; an agent may carry the
  `slug` it had where it was downloaded. Existing packages need no change.
- **Public goods catalog**: 41 entries in `catalog/` (`schemas/catalog-entry.schema.json`), each
  checked against its primary source, listed in `docs/catalog.md` by `npm run catalog:build`;
  searched by `searchCatalog`, `viable-harness catalog` and the MCP tool `find_public_goods`.
- **Component steps**: a graph's `component` step runs a step component from its manifest held in
  `config.manifest`, sending the fields `config.inputs` maps; its answer is `{ output, flags }`, and
  `on_error: continue` goes on without it. `runAgent` and `viable-engine run` call HTTP components
  and MCP servers; `validateGraph(graph, { componentRuns })` lets a host allow fewer.
  `agent.schema.json` adds `component` to the step types: files without one need no change. A step
  component's answer from `callComponent` is read like the other slots': only `output` (text cut to
  20,000 characters) and `flags` (at most 20 `{ label, reason }`).
- **`viable-engine try`, and no command at all**: the real pages on this computer, with a panel showing what the
  AI did with each message. Scripted replies without a key, your own model with one. A scripted tour, and a static
  copy for a website. `serve --panel` gives the same panel to the token holder; `test --html` shows a run as a page.
  The engine tells `hooks.onVettingDraft` and `hooks.onVettingRound` as a review happens.
- **The learner pages are in the core** (`src/learner/`) and served by `serve` and every scaffold, at VIABLE's paths
  (`server/learner.js`). Course packages and agent files may carry `profile` and `chat_page`; a package's websites
  may carry a `snapshot`, `path_prefix` and `include_subpages`; knowledge bases `file_links` and `search_mode`; a
  course `shared_devices`. `viable-engine knowledge refresh`, `records export` and `forget`; `serve --class-code-env`
  and `--learner-header`.
- **A package runs on your own cloud**: `inspect` reports everything it needs, `deploy` writes a folder for node,
  docker, cloudflare, aws-lambda, cloud-run or firebase with a README of exact commands, and `verify` checks the
  result from outside and prints the line for your site. `skills/deploying-a-viable-course` walks a coding AI through
  all of it, and `AGENTS.md` says where an AI starts. The server is one web-standard handler (`server/handler.js`)
  with thin adapters and a store interface. With a store, the runs route keeps conversations as VIABLE does. Models
  are replaced by role and by name (`--map`, `--models`, `--reviewer-model`), with a warning when a reviewer ends up
  the model it checks. A caller who hangs up stops the run, except on AWS Lambda.
- **The gateway**: `viable-harness gateway` and `gatewayHandler`, an OpenAI-compatible endpoint that adds How the AI
  helps, a check on each reply and a record to any app, with plain-HTTP routes for the check, instructions and
  misconceptions. `checkReply` has no Node imports, and takes `instructions` so a rewrite keeps to the app's own.
  `view` and `suggest` take a folder. A learning-events turn may carry `words`.
- **Connectors**: `viable-harness resources` turns public goods into what the harness runs: test suites (GSM8K,
  MathCAMPS, MathDial, FairytaleQA), a judge and its check (Learning Commons Evaluators), calibration sets against
  people (MRBench, ASAP 2.0, ELLIPSE), knowledge folders (WWC guides, Illustrative Mathematics), a local standards
  search (Learning Commons Knowledge Graph) and a measure (pyBKT). Each catalog entry says its level in `connect`, a
  license that limits use is accepted before anything is fetched, and `runAgentTests` takes `judgePrompt`, with
  `judgeReplies` for replies already written.
- **MCP without a transport**: `mcpTools()` and `handleMcpMessage()` serve the tools from any transport with no
  `node:` imports, and `checkPlan()` and `checkOutcome()` make `checkReply`'s review on a host's own services.
- **One look**: `src/ui/theme.js` holds VIABLE's tokens in light and dark, Atkinson Hyperlegible Next and Mono (SIL OFL
  1.1), the mark and base components. `src/ui/parts.js` writes a VETTING round, a test case and a suggestion once.
  The teacher's page and the MCP views are redrawn on them: drafts marked as a teacher would, measures as small marks
  with definitions on demand, and in an assistant a check that plays out with the verdict last.
- **A package needs no course**: `course` is optional in `viable.course-package`, which holds a course or at least one agent, so an agent with a chat page downloads whole. Existing files need no change; a reader of your own that requires `course` must accept its absence. A package's sub-agents are found by the slug they were published under, as well as by ref or name. `inspect` reports what a download left out, calls to agents the file doesn't hold, and a chat page's daily spending cap, which isn't enforced on your own server. `validate` reads a `.viable.zip`.
- **A sample class**: `examples/class/`, four made-up learners' records and eight runs for trying
  `suggest` and `view` without a model key.
- **Conformance fixtures** for the formats, graphs, expressions, teaching settings, VETTING, the
  measures and xAPI, and **an xAPI profile** for learning events.

## 0.1.0

The harness kit inside VIABLE's platform repository: `run`, `validate` and `measure` over agent files
and course packages, and the open formats as JSON Schema.
