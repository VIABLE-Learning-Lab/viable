# Building for learners

> Commands here say `viable-harness`. Until it is on npm, use `npx github:VIABLE-Learning-Lab/viable` in its place: it takes every command.

Teachers and researchers now build classroom tools by describing them to a coding agent, which writes the code without seeing
the room. The room is thirty children opening this at 9:05 from one school address, a shared Chromebook, a quiz whose
answers are one View Source away, a tutor that does the homework, a key the class can spend.

The rest of the Harness goes around **the AI that teaches**, at each reply. This part goes around **the AI that builds**, while a
tool is being made. They share a shelf of standards, misconceptions, research and tests, and nothing else: a coding agent is never
told "don't give the answer", and a tutor never hears about rate limits.

| | The AI that teaches | The AI that builds |
| --- | --- | --- |
| **When** | Each reply to a learner | While someone makes a tool |
| **At the keyboard** | A learner | A teacher, researcher or developer |
| **The question** | What does this moment call for? | Should this exist, and what does it need to hold up in class? |
| **Checked by** | [VETTING](../skills/checking-replies-with-vetting/SKILL.md) and agent tests on a reply | `viable-harness review` on the code, and agent tests on its tutor |
| **Reaches it by** | Your own calls, the gateway, the Engine, a Skill | A Skill, a block to paste, a command |

## Use it

**With a coding agent** such as Claude Code, Codex or Cursor:

```sh
npx skills add VIABLE-Learning-Lab/viable --skill building-for-learners
```

Then ask for what you want as you normally would. It asks who the learners are first, and builds the least that does the job. It
adds a few lines to the project's `AGENTS.md` too, since agents can skip a Skill they aren't reminded of.

**With a chatbot** such as ChatGPT or Gemini, where you can't install anything, paste this at the start:

```text
I'm building something learners will use. Before writing code, ask me: how old they are; what they should be able to do
afterwards; where they'll use it, how many at once, and whether they share computers; whether it needs AI while they use it; what
it keeps and who sees it; and who looks after it next term. If it needs AI replying to them, ask too: whose account pays, and whether
that provider allows learners this age; who is told if a learner says something alarming; what it may spend in a day; and how long a
conversation is kept. Build the least that does the job: a page with no accounts, nothing saved and no AI while they use it, if that
will do. Tell me plainly if what I want needs a server, a database and a page for the teacher.

Hold to these. Keep any model key, and whatever the AI is told, on a server: never in the page. A whole school can share one
internet address, so never limit by address. Give each class a spending limit, with a plain message when it runs out. No learner's
name goes in a prompt. No analytics or advertising scripts on pages learners open. Answers that count stay on a server. On a shared
computer, one learner's words don't come back on the page for the next. A teacher opens it, can stop it, can read what the AI said
and can see who is stuck. Don't make up a crisis phone number.

Don't build AI that writes IEPs, 504 plans, behavior plans or progress reports, a chat with children that no adult can read, or
anything that decides a grade or a punishment by itself. Tell me if a school should review this before real learners use it, and
never tell me it is safe or that it complies with a law.
```

**On a project you already have**, a coding agent's or your own:

```sh
npx github:VIABLE-Learning-Lab/viable review ./my-app
```

## What `review` looks for

It reads text with patterns, with no model and nothing leaving the computer, and says where to look and what to do. It exits 1 when
something should be fixed before learners use it.

| Fix before learners use it | Why |
| --- | --- |
| A secret key written into the code | A key goes wherever the code goes |
| A model called from the page itself | Anyone in the class can read how, and spend without end |
| A database anyone can read or write | Anyone with the page's address can read every learner's work |
| A `.env` file git isn't told to ignore | The keys in it go into the repository with the next commit |
| A server handing out its whole folder | Anyone can ask it for its code, its keys and its answers |
| A rate limit counted by address | A school is usually one address, so it stops the class a few minutes in |

| Look at these | Why |
| --- | --- |
| A sign-in with a limit a class can hit | Some services' defaults allow 30 anonymous sign-ins an hour from one address |
| What the AI is told, in the page | Learners can read it and change it |
| Answers the page can read | Fine for practice, not for anything that counts |
| A model call with no end to its answer | One long answer, or one loop, can spend a class's budget |
| A model called, and nothing that looks like a budget | A class can spend without end |
| A model called, and nothing for a teacher | An AI talking with learners needs an adult who can read what it says |
| A learner's name near a model call | A prompt goes to the provider, and for a child that can break its terms and the law |
| A learner's name kept in the browser | On a shared computer, the next child becomes the last one |
| An analytics or advertising script on a page | It gives another company an identifier for a child |
| Tables with no row-level rules | On Supabase, the key the page already has can read them |

A clean result means none of these turned up, and it says so. It can't see whether a budget works, what happens when a learner says something alarming, whether a teacher would notice, or accessibility. A line you've looked at and are content with can say why, in a comment with `viable-review: ok`, such as a high ceiling on wrong codes.

## Test its tutor

If the tool has an AI that replies to learners, copy [`tutor-tests.json`](../skills/building-for-learners/tutor-tests.json) into
your project, change the question and answer to the tool's own subject, then run it on what the AI is told, against any
OpenAI-compatible model. It makes 28 model calls, a reply and a judgment for each case:

```sh
viable-harness test tutor-tests.json --endpoint <its model endpoint> --endpoint-model <its model> --system "$(cat prompt.txt)" --judge-model <another model>
```

Its 14 cases cover what you'd worry about in a new colleague: asking for the answer outright, again after a hint and with "my
teacher said you can"; a wrong answer given with confidence, and a right one; being stuck; a learner who may not be safe; a request
that isn't; personal details; "are you a real person?"; wanting a secret friend; and an attempt to get at its instructions.

A model judges each reply, so read the failures yourself. [Agent tests](agent-tests.md) says how to write more, and how to check the judge against people.

In one run on one model, rated by a model, a one-line tutor prompt passed 5 of the 14 and the [prompt to start from](../skills/building-for-learners/references/ai-beside-learners.md) passed all 14. That prompt was written with these tests in hand, so the run shows the tests can be passed and tell the two apart. It doesn't show the prompt makes a good tutor.

## With VIABLE's services, or without

None of this needs an account with us. The Skill points to what fits, with what each leaves to you:

| You want | Use | You still do |
| --- | --- | --- |
| A class with an AI tutor, and no page of your own | The [VIABLE Learning Platform](https://www.viablelearning.org) | Nothing to build |
| Your own page, with someone else minding keys, limits and traffic | The [VIABLE API](https://developers.viablelab.org/docs/connect/first-run) as your model endpoint: a key per class, each with its own requests per minute, daily tokens and monthly cost, and usage to look at | A small server that holds the key |
| Your own page and your own model account | Your own server, and the patterns in the [Skill's classroom notes](../skills/building-for-learners/references/classroom.md) | All of it |
| Everything on your own server | The [VIABLE Engine](../../engine/README.md) | Running a server |
| A study with consent and conditions | The [VIABLE Developer Platform](https://developers.viablelab.org) | Nothing to host |

## What it can't do

- It shapes what gets written and nothing after. In class, someone still holds the key, watches the budget, reads what happened
  and answers for it: a hosted platform can do that, and a Skill can't.
- It isn't legal advice, and it can't say a tool complies with anything. [The notes on learners' data](../skills/building-for-learners/references/learner-data.md) link to the sources and list what a school will ask.
- Whether it improves the tools people build has not been measured. The patterns in `review` come from classroom experience and
  services' documented defaults.
- An agent may skip a Skill even with the reminder in `AGENTS.md`, so `review` is a command you can run yourself.
- It doesn't make a tool small. An AI that children chat with needs a budget, a page for the teacher and an alarm that reaches
  someone, and with them a server and a database. The Skill says so before it starts, and points to what's already built.
- The rules on models and schools are mostly American, and rules change. Each says when it was checked.

## How it differs from other Skills for teachers

Most Skills for education help with a teacher's own work: lesson plans, rubrics, differentiation. This one does none of that.
Standards and misconception data are well served already, by [Learning Commons](https://learningcommons.org) among others, and this
points to them. This one treats a class as the unit of load and budget, says what not to build, and gives tests you can run on a
small tool's tutor.
