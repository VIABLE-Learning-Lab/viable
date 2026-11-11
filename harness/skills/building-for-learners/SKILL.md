---
name: building-for-learners
description: Build a page, app, game, quiz or AI tutor that students will use, or a tool that touches student data, so that it holds up in a real classroom. Use when a teacher, researcher or developer asks you to build or change anything learners will use, however small, and before it is shared with a class.
---

# Building for learners

You know how to write the code. What you can't see from here is the room: thirty children opening this at 9:05 from one school
address, a shared Chromebook, a quiz whose answers are one View Source away, a tutor that does the homework, a key the class can
spend. Hold to this, in order, and say it in plain words: the person you are helping may never have read code.

> Commands here say `viable-harness`, from `npm i -g @viable-lab/harness`; or put `npx @viable-lab/harness` in its place.

## 1. Ask before you build

Ask what you can't tell from the request, in one message, then write the answers to `LEARNERS.md` at the project's root.

- **Who are the learners?** Under 13, 13 to 17, or adults: this changes what's allowed.
- **What should they be able to do afterwards?** One sentence. It decides what the tool is for.
- **Where and how many?** Class time on school computers, or at home? How many at once? Do they share computers?
- **What do you have to work with?** A Chromebook can't run a server or the commands below. Who would host it?
- **Does it need AI while learners use it?** Often not: you can build a quiz with no AI in it.
- **What's kept, and who sees it?** Does anyone need a name, or would a code do?
- **Who looks after it next term?** Will other people depend on it?

If they want AI replying to learners, ask these in the same message, because each can change the answer:

- **Whose account pays, and does its provider allow these learners?** Say now, for anyone under 18, that a teacher's own key often can't be used for this. [references/learner-data.md](references/learner-data.md) says what three providers ask. Read it before you send the message.
- **Who is told when a learner says something alarming**, and how quickly?
- **How much may it spend in a day**, and what should learners see then?
- **How long is a conversation kept?**

Add this to the project's `AGENTS.md` or `CLAUDE.md`, so that later sessions keep to it:

```md
Learners use this. Read LEARNERS.md first. Never put a model key, an answer key that counts, or a learner's name in the page or a
prompt. Run `viable-harness review` before sharing it.
```

## 2. Build the least that does the job

Each step adds something a person has to run, pay for and answer for. Stop at the lowest step that does the job, and tell them why.

| Step | What it is | What it takes on |
| --- | --- | --- |
| 0. A page | No accounts, nothing saved on a server, no AI while learners use it | Almost nothing. Most quizzes, games and simulations belong here |
| 1. A page that remembers | Work saved under a class code, with no names | A database with rules, and deleting what's kept |
| 2. AI beside the learner | A model replying to learners | A server holding the key, a budget per class, rules for the AI, tests, what happens when a learner says something alarming, and, since an adult must be able to read it, a database and a page for the teacher. **This is where a small page becomes an application:** about a thousand lines with its tests, when we tried it |
| 3. Names and records | A class list, work by person, grades | Rules for the data, how long it's kept, and usually the school's agreement |
| 4. A study | Consent, conditions, an export | A review board, and a record of which version did what |

**Stop and say so, whoever asks,** and offer the nearest thing worth building:

- AI that writes IEPs, 504 plans, behavior plans or progress reports. They need information from many sources over a long time ([Common Sense](https://www.commonsensemedia.org/ai-ratings/ai-teacher-assistants)).
- An open chat with children that no adult can read.
- Anything that decides a grade, a placement or a punishment by itself.

**If real learners will use it, it's no longer a prototype.** "I made it myself" doesn't exempt a tool from the school's review
([CoSN](https://www.cosn.org/vibe-coding-in-k-12-innovation-guardrails-and-the-school-bus/)). Tell them early.

## 3. From step 2, decide who runs what

A Skill shapes what you write. In class, someone still has to hold the key, watch the budget and answer for it. Offer these, with
what each costs them, and let them choose.

| They want | Use | They still do |
| --- | --- | --- |
| A class with an AI tutor, and no page of their own | [VIABLE Learning Platform](https://teach.viablelearning.org): say what you're teaching | Nothing to build, so say so before you build anything |
| Their own page, with someone else minding keys, limits and traffic | The [VIABLE API](https://developers.viablelab.org/docs/connect/first-run) as the model endpoint: one key per class, each with its own requests per minute, daily tokens and monthly cost, and usage to look at | A small server that holds the key |
| Their own page and their own model account | Their server, with the patterns in [references/classroom.md](references/classroom.md) | All of it |
| Everything on their own server | The [VIABLE Engine](https://github.com/VIABLE-Learning-Lab/viable/blob/main/engine/README.md) | Running a server |
| A study with consent and conditions | The [VIABLE Developer Platform](https://developers.viablelab.org/docs/research/first-study) | Nothing to host |

If the learners are under 18, have them [ask VIABLE Lab](https://www.viablelab.org/contact) what applies before relying on a VIABLE option, as with any provider. This Skill can't answer that for them, and neither can you.

## 4. Find what it needs, rather than guessing

- **Standards and skills:** `viable-harness catalog "<a few words>"` finds open standards, datasets and tools with their licenses. Check a license before relying on one.
- **What learners get wrong:** `viable-harness misconceptions "<a few words>"`, for mathematics. Build wrong answers and hints from these.
- **What research says to do:** `viable-harness guidance "<a few words>"` gives what to do at a moment in teaching, each piece naming its studies. Keep the source with it, and don't cite a study you haven't got from a source: invented citations are common.

With the Harness's MCP server connected, the `find_public_goods` tool, the `find_misconceptions` tool and the `find_guidance` tool do the same.

## 5. Hold to these while you build

Before writing anything for steps 2 to 4, read [references/classroom.md](references/classroom.md) and [references/learner-data.md](references/learner-data.md). For an AI that replies to learners, also read [references/ai-beside-learners.md](references/ai-beside-learners.md).

- **Keys and what the AI is told stay on a server.** The page calls your server.
- **Count per learner or per class, never per address.** A school is usually one address. With a class code and no names you can't tell one learner from another: count per class, with a rough limit per browser.
- **Give each class a budget** counted on the server, with a plain message when it runs out, and a page that still works without AI.
- **No learner's name in a prompt**, and no analytics or advertising scripts on pages learners open. What a child types can hold personal details too, so the provider's rules cover the chat itself.
- **Answers stay on a server when they count.** Don't believe a browser that says an answer was right.
- **Shared computers:** what one learner wrote doesn't come back on the page for the next. "Are you Sam?" catches mistakes, but anyone can press Yes.
- **A teacher stays in charge:** they open it, can stop it, and can see who is stuck. Without names, "who" is a number.
- **It reads and works for everyone:** the learners' reading level, keyboard use and screen readers, WCAG 2.1 AA, a small screen and a slow network.

## 6. Check it before anyone uses it

```sh
viable-harness review
```

It reads the project's text for what classrooms trip on, with no model and nothing leaving the computer. Fix what it says must be fixed, and read the rest with the person you're helping. A line you've looked at and are content with can say why, in a comment with `viable-review: ok`, such as a high ceiling on wrong codes. It can't see whether a budget works, what happens in class, or accessibility: a clean result isn't a pass.

If the tool has an AI that replies to learners, copy [tutor-tests.json](tutor-tests.json) into the project, and change the question and answer to the tool's own subject. It asks for answers, pushes back, says something alarming, gives a right answer and a wrong one, and tries to get at the prompt. The people and places in it are invented. Run it on what the AI is told:

```sh
OPENAI_API_KEY=<a key for that endpoint> viable-harness test tutor-tests.json --endpoint https://api.openai.com/v1 --endpoint-model <its model> --system "$(cat prompt.txt)" --judge-model <another model>
```

`--endpoint` is any OpenAI-compatible address, ending in `/v1`. It makes 28 model calls, a few cents at most on a small model. If the teacher can change how far the AI helps, run it at each setting: `viable-harness draft-tests` writes cases for a setting.

Then rehearse the room, with a stand-in for the model if you have no key:

- Two browsers at once on one address, with the second person seeing nothing of the first's.
- Close the page mid-sentence and come back. Reach the budget. Turn the model off.
- Say something alarming as a learner, then look at what the teacher sees, while they're doing something else.
- The smallest screen they'll use, and the school's own network if you can: filters block new addresses.

## 7. Hand over honestly

Tell the person, in plain words: what it does; what it keeps, where and for how long; who can see it; what it costs and what happens at the limit; what you checked; and what nobody has checked. **Never say it is safe or that it complies with FERPA, COPPA or any law.** You can't know that, and only a person can answer for it. Give them the list of questions their school will ask, from [references/learner-data.md](references/learner-data.md).
