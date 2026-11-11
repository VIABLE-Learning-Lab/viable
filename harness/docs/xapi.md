# The xAPI profile for learning events

> Commands here say `viable-harness`, from `npm i -g @viable-lab/harness`; or put `npx @viable-lab/harness` in its place.

Schools' learning record stores (LRSs) read xAPI. `toStatements(record, { homePage, activityBase,
includeText })` in `src/xapi.js`, and `viable-harness xapi`, turn one learner's record
(`schemas/learning-events.schema.json`: its `events` and `turns`) into xAPI 1.0.3 statements. The
harness builds the statements and sends nothing: a deployer posts them to their LRS.

```sh
viable-harness xapi record.json --home-page https://school.example.org [--activity-base <url>] [--include-text]
```

```js
import { toStatements } from '@viable-lab/harness/xapi.js'; // npm i @viable-lab/harness
const statements = toStatements(record, { homePage: 'https://school.example.org' });
```

`conformance/xapi.json` holds the cases another implementation of this profile checks itself against.
`schemas/xapi-profile.jsonld` is the same profile as an xAPI Profile (xAPI Profiles 1.0, JSON-LD):
VIABLE's own verbs, activity types and extensions, each with its definition, written from `VOCABULARY`
in `src/xapi.js` by `npm run xapi:build`. The VIABLE Developer Platform publishes it at
`https://developers.viablelab.org/xapi`, the profile's IRI, and answers every IRI under it (each verb,
activity type and extension, such as `…/verbs/requested-hint`) with the profile as JSON-LD. The
record's schema is published there too, at its `$id`,
`https://developers.viablelab.org/schemas/learning-events.schema.json`.

## A statement

| Property | What it holds |
| --- | --- |
| `id` | A UUID v5 under the namespace `85904702-c63a-51b6-80a6-6d17f20e12a7` (itself the UUID v5 of `https://developers.viablelab.org/xapi` in the URL namespace). The name is the JSON, keys sorted and no spaces, of `[homePage, user, activity, session, { event }]`; for a turn `{ turn }`, and for an answer its agent graded `{ turn, assessment: <its index> }`. Missing parts are `null`. |
| `actor` | `{ objectType: "Agent", account: { homePage, name } }`: an account at `homePage` named by the record's `user`, its pseudonymous id. Nothing else names the learner. |
| `verb` | An ADL verb (`http://adlnet.gov/expapi/verbs/…`) where one fits, otherwise VIABLE's own under `https://developers.viablelab.org/xapi/verbs/`, with its word as `display["en-US"]`. |
| `object` | An activity under `activityBase` (default `homePage`), with its type. |
| `result` | `success`, `completion`, `score`, `duration` and `response` where the event has them, and the event's data as extensions. |
| `context` | The record's activity as `contextActivities.parent`, and as extensions the session, an event's `seq`, and a turn's versions, VETTING outcome and place in its conversation. |
| `timestamp` | When the event happened (`at`, on the learner's clock) or the message was sent (`started_at`), in ISO 8601 UTC. Without one the statement has none, and the LRS stamps it when it stores it. |

## Activities

Activity IRIs are built from the ids the record carries, each part percent-encoded. With
`act` = `<activityBase>/<activity>` (or `activityBase` alone when the record names no activity):

| Object | IRI | Type |
| --- | --- | --- |
| The activity | `act` | `https://developers.viablelab.org/xapi/activity-types/activity` |
| A panel | `act/panels/<panel>` (`app` when the event names none) | `…/activity-types/panel` |
| A plan or draft | `act/panels/<panel>/<field>` | `…/activity-types/writing` |
| A rubric | `act/panels/<panel>/rubric` | `…/activity-types/rubric` |
| A rubric criterion | `act/panels/<panel>/rubric/criteria/<criterion>` | `…/activity-types/rubric-criterion` |
| A page of a reading | `act/panels/<panel>/pages/<page>` | `…/activity-types/page` |
| An embedded page's object | `act/panels/<panel>/objects/<object>` | `…/activity-types/embedded-object` |
| A question | `act/panels/<panel>/items/<item>` | `http://adlnet.gov/expapi/activities/question` |
| The AI in the activity | `act/ai` | `…/activity-types/ai` |
| An item the agent graded | `act/items/<item>` | `http://adlnet.gov/expapi/activities/question` |
| A skill the agent graded, without an item | `act/skills/<skill>` | `http://adlnet.gov/expapi/activities/objective` |

`…` is `https://developers.viablelab.org/xapi`. An object whose id is missing (a draft event without
a field, a page event without a page) is the one it belongs to: the panel, or for a criterion the
rubric.

## Verbs

| Event | Verb | Object | Result |
| --- | --- | --- | --- |
| `panel.view` | experienced (ADL) | the panel | |
| `writing.start` | attempted (ADL) | the plan or draft | |
| `writing.progress` | progressed (ADL) | the plan or draft | |
| `writing.snapshot` | saved | the plan or draft | |
| `writing.rubric` | experienced (ADL) | the rubric | |
| `writing.rubric_check` | checked, or unchecked when `checked` is false | the criterion | |
| `writing.submit` | completed (ADL) | the panel | `completion: true` |
| `embed.event` | the page's own `verb`: ADL's when ADL has it (attempted, answered, completed, passed, failed, progressed, interacted, ...), otherwise VIABLE's; interacted (ADL) without one | the page's `object`, or the panel | `success`, `completion`, `score` (scaled with `max_score`), `duration` from `duration_ms`, `response` |
| `reading.page` | experienced (ADL) | the page | |
| `reading.highlight` | highlighted, or unhighlighted when `removed` | the page | |
| `reading.note` | annotated | the page | |
| `reading.search` | searched | the panel | |
| `questions.view` | experienced (ADL) | the question (`item`), or the panel | |
| `questions.hint` | requested-hint | the question, or the panel | |
| `questions.answer` | answered (ADL) | the question, or the panel | `success` from `correct`, `score`, `response` |
| `app.event` | interacted (ADL) | the panel | |
| a turn | asked (ADL) | the AI | |
| each answer in a turn's `assessment` | answered (ADL) | the item, or the skill | `success` from `correct` |

Verbs without "(ADL)" are VIABLE's, under `https://developers.viablelab.org/xapi/verbs/` (`…/verbs/requested-hint`).

Skipped, with no statement:

- `page.layout`: how the page is arranged (the AI panel's width, collapsed or open), not something the
  learner did in the activity.
- `embed.state`: an embedded page's saved state, for picking up where the learner left off. xAPI keeps
  that in its State resource, not in statements.

An event of a type the schema doesn't list makes no statement either. Two identical events make one
statement, since an LRS refuses a batch that repeats an id.

A score is sent as `{ raw, min: 0, max, scaled }` when `max_score` is above 0 and the score is
between 0 and it, and as `{ raw }` alone otherwise: xAPI requires `raw` between `min` and `max`.

## Extensions

Every extension is named after the field it comes from, under
`https://developers.viablelab.org/xapi/extensions/` (`…/extensions/visible_ms`).

- **Result**: an event's `data`, except what the statement carries elsewhere (`verb`, `object`,
  `field`, `correct`, `success`, `completion`, `score`, `max_score`, `duration_ms`, `response`): its
  numbers and true/false, strings that name something (`set`, `skill`, `item_type`, `color`,
  `content_type`, `asset_id`, `source`), and nested objects the same way. For a turn,
  `first_output_ms`, `signals` and `after`; for an answer its agent graded, `skill`.
- **Context**: the record's `session`, and from the event or turn, when it has them: `seq`,
  `conversation_id`, `turn_index`, `agent_version`, `activity_version`, `vetting` and
  `vetting_attempts`. `vetting` is
  the review's outcome: `passed`, `unverified` (it ran out of tries) or `attention` (a safety concern);
  VIABLE flags `unverified` and `attention` turns for the teacher. These turn fields are read by the
  names the research export's `turns.csv` gives them; the learning-events schema allows them on a turn
  without listing them yet.

## What is never sent

- A name, an email address or any identifier of the learner but the record's `user`. A `user` that
  looks like an email address is refused, and so is a record without one.
- Without `includeText` (the default): what the learner wrote (a snapshot's `text`, an answer's
  `response`, an embedded page's `response`), a question's `prompt`, a turn's `message` and the AI's
  `reply`, and any other string in data, such as an app's own fields: the harness can't tell a label
  from something a learner typed.
- Lists inside data.
- The skipped event types above.

## What `includeText` adds

A deployer opts in, for an LRS that may hold learners' writing. With `includeText: true`
(`--include-text`), an answer's or embedded page's `response` becomes the result's `response`, and
every other string, a snapshot's `text`, a question's `prompt`, a turn's `message` and `reply` and
an app's own strings, becomes a result extension named after its field. Ids don't change.

## Sending statements to an LRS

The deployer posts the statements; the harness makes no network call.

```sh
viable-harness xapi record.json --home-page https://school.example.org > statements.json
curl -X POST "$LRS_ENDPOINT/statements" \
  -H 'X-Experience-API-Version: 1.0.3' -H 'Content-Type: application/json' \
  -u "$LRS_KEY:$LRS_SECRET" --data @statements.json
```

- `homePage` names the system whose ids the learners' `user` values are: keep it the same across
  exports (`https://school.example.org` and `https://school.example.org/` are different accounts).
- Exporting a record again gives the same ids, and an LRS doesn't store a statement it already has, so
  re-sending doesn't duplicate. A statement whose content changed under the same id (after switching
  `includeText`, or changing `activityBase`) is refused, often with 409 Conflict: xAPI statements
  can't be changed, only voided.
- LRSs limit how many statements one request may carry; split a large export into batches.
- What the LRS keeps, for how long and who can read it is the deployer's to agree with the school.
