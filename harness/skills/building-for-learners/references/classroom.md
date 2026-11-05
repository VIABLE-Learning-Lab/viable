# What a classroom does to a tool

General advice for web apps assumes one person on one address, spread out over the day. A class is thirty people on one address in the same minute, and if it fails, the lesson fails. Few people publish these failures, so what follows comes from documented defaults and our own classrooms. Check the defaults of whatever you use.

## One address, thirty learners

A school usually reaches the internet from one address, so anything counted by IP treats a class as one person.

| Where it bites | What to do |
| --- | --- |
| A rate limit keyed on IP. Samples for a limiter can show 10 requests a minute per IP, which a class passes in seconds | Count per learner or class. Keep an address limit only as a high ceiling on signing in, and allow for a whole school behind it |
| [Supabase's default limits](https://supabase.com/docs/guides/auth/rate-limits): 30 anonymous sign-ins an hour per address, 30 sign-ups or sign-ins per 5 minutes per address, and 2 emails an hour from its built-in sender for the whole project | Raise them in the project's settings, use your own email sender, or let learners in with a class code and no account |
| A provider's or host's bot protection, which can challenge many sessions from one address | Rehearse from one address before the lesson, and have a way to reach a person |
| Email sign-in | Under-13s often have no email, and school mail can delay or filter yours. Use a class code, or a code on a card |

## Where it lives

A server on a teacher's laptop stops when the lid closes, and a Chromebook can't run one at all.

- From step 2 it needs a host with HTTPS, a place for secrets, and a database that survives a restart. A file on a free host's disk often doesn't.
- If the person can't set that up and nobody will do it for them, say so now. That's a reason to use something hosted rather than a smaller tool that breaks in class.
- Try it from a school computer before the lesson. School filters block addresses they don't know, and asking IT to allow one can take days.
- When a host counts one address for every visitor, because it sits behind a proxy, your limit by address counts everyone as one. Read the host's header for the real address.

## Everyone at once

- Thirty people load the page in the same minute, then all press the same button. Keep the first page small, and don't do slow work while it loads.
- A model takes seconds. Show that something is happening, stop a second click from sending twice, and let them keep working while they wait.
- School networks block things: some video sites, WebSockets, unknown CDNs. Host what the page needs on your own address. Have a plain fallback for anything live.
- Save as they go. A closed lid, a dead battery or a reload must not lose their work.

## A budget per class

A general limit on a key doesn't know what a class is. A class is the unit a teacher understands, so make it the unit you count.

1. Give each class its own key, if the provider has per-key limits, or its own row in a table on your server if not.
2. Before each model call, add up what the class has spent today against its limit. Count it on the server, never in the page.
3. Set the most tokens on each call, and a limit per learner per day, so one learner's loop can't use up a class's day.
4. Choose the limit by arithmetic, and tell the teacher: messages × learners × cost of a reply. On a small model a reply costs a small fraction of a cent, so a class of 30 sending 10 messages each is a few cents, and a check on each reply about doubles it. Start at a dollar a class a day. Too low stops the AI for everyone mid-lesson. Say what it costs, and let the teacher change it.
5. When it runs out, say so to the learner in plain words, tell them what still works, and show the teacher. Provider error messages are not for children.

On the VIABLE API a key has its own requests per minute, daily tokens and monthly cost, and usage shows what each spent, so a key per class gets you most of this with no table.

With a class code and no names, the server can't tell one learner from another, and joining again starts anyone over. So a limit "per learner" is only a limit per browser: a rough fence, with the class's budget as the real one. If a teacher needs to know who is who, use a personal code on a card for each learner, with the names kept by the teacher, not the tool.

## Shared computers

- The next child becomes the last one if who they are stays in the browser. Ask "Are you Sam?" on each visit, and time out after a pause.
- That question catches mistakes, not curiosity: anyone can press Yes. So what a learner said doesn't come back on the page by itself. Start each visit clean, and bring back past work only with a personal code.
- A clear way to leave, with their work saved.
- Don't open anything another learner typed, and don't let the browser's autofill suggest a classmate's name.

## Getting in

- One link and a QR code, and a code they can type. Short codes without letters that look alike.
- A way back on another computer, such as a personal code on a card.
- Sections opening at different times: a teacher opens it for period 2, and period 5 doesn't see it.
- Younger learners can't spell a password. Don't ask for one.

## A teacher stays in charge

- Nothing reaches learners until the teacher opens it. Try it as a learner first, with those tries left out of what the class did.
- They can stop it in class, and see who has started, who is stuck and what the AI said.
- They can get it all out, and delete it.
- It says plainly who to ask when it breaks, and it still works next term when the person who built it has left.

## Learning, not just use

- Start from what they should be able to do afterwards, not from the features.
- Have them retrieve and explain, and give feedback on the thinking. Wrong answers should come from real misconceptions.
- Points and streaks can take over from the work. If you add them, reward effort on the task.
- A timer that can't be turned off is hard on learners who read slowly. Let the teacher decide.
