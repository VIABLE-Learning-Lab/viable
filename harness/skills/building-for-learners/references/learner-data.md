# Learners' data, and what providers and schools ask

This is not legal advice, and laws differ by place. Don't tell anyone a tool complies. Point them to the people who can say, and to the sources below. Checked on 2026-11-05; rules change, so read the source before relying on one.

## Keep less

- **Default to no names.** A class code, or a personal code on a card, does the job for most tools. Keep what joins a code to a name with the teacher.
- **A prompt is a disclosure.** Whatever goes in it goes to the model's provider. Send a learner's words and what they're working on, never who they are. If a reply must address them, fill the name in afterwards.
- **What a child types can hold personal details,** whatever you told them. So a provider's rule on children's personal data covers the chat itself, not only names. Removing obvious emails and phone numbers before sending helps, and doesn't settle it.
- **Say how long.** Pick a date to delete what's kept, and build the delete. For children's data in the US, the FTC's 2025 rule says to keep it "only" as long as reasonably necessary for a specific purpose, and not indefinitely ([FTC](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data)).
- **Nobody reads what they shouldn't.** Each learner reaches only their own rows, and a teacher their class's. On Firebase and Supabase that is rules or row-level security, written before any real learner comes. The page's public key doesn't protect anything.
- **No health, discipline, special-education or family details** in a tool like this, and none in a prompt.
- **No analytics or advertising scripts on pages learners open.** Check what the host adds by itself: some inject a script of their own.

## Who may use which model

A provider's terms decide what a tool for minors may run on. Three, as they read now:

| Provider | For tools minors use | Source |
| --- | --- | --- |
| OpenAI | Follow child-protection law including COPPA, with age-appropriate disclosures, filters on sensitive content, monitoring and reporting with escalation paths. For under-13s, no personal data through its services without zero data retention turned on first. It may audit | [Under-18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance) |
| Anthropic | Safeguards suited to the use, such as age checks and content filtering, its child-safety prompt where provided, telling users they're talking to an AI, and stating compliance publicly. It audits | [Guidelines for organizations serving minors](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors) |
| Google AI Studio | You must be 18 or older, and clients "directed towards or" that are "likely to be accessed by" under-18s aren't allowed. On unpaid services, people may read what's sent | [Terms](https://aistudio.google.com/docs/terms) |

An education plan for teachers usually doesn't cover an app the teacher then runs on an API key. Check before assuming.

**For under-13s with free text, decide this first.** OpenAI's zero data retention is "subject to prior approval", through its sales team ([your data](https://developers.openai.com/api/docs/guides/your-data)), so a teacher's own key usually won't have it. Without it, and without another provider whose terms fit, the honest choices are: no AI replying to children; AI that only chooses among hints you wrote, with no free text going to a model; AI on the teacher's side only; or something hosted that has already settled this, after asking them in writing.

## In US schools

- **COPPA** covers online services collecting personal information from under-13s. A school may consent on a parent's behalf only where the information is "for the use and benefit of the school, and for no other commercial purpose" ([FTC FAQ, section N](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)). A teacher saying yes usually isn't the school saying yes.
- **FERPA** covers students' education records. A district usually has someone who decides what may hold them, and a privacy agreement to sign. Ask who, before real records go in.
- **Accessibility:** public schools' web content and apps must meet WCAG 2.1 AA by April 26, 2027 or April 26, 2028, depending on population ([ADA rule](https://www.ada.gov/resources/2024-03-08-web-rule/)). Automated checks find only part of this.
- Other places have their own rules, such as the GDPR's and the UK's children's code. Ask locally.

## What a school will ask

From [CoSN's guidance](https://www.cosn.org/vibe-coding-in-k-12-innovation-guardrails-and-the-school-bus/), which draws the line at real learners and real records: "Once a tool reaches that point, it needs review." Have answers ready:

- What problem does it solve, and who will use it?
- Does it collect, store or send student or staff data?
- Does it need logins, or access to the school's systems?
- Where is the code hosted, and what other services and libraries does it rely on?
- Has its code had a security review, and does it meet accessibility expectations?
- Who maintains it, who approves changes, and how will it be retired?

A prototype, by the same line, uses invented or de-identified data, isn't required for teaching, isn't connected to school systems, and isn't widely shared.
