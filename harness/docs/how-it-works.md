# How the Harness works

The Harness is about 10,000 lines of JavaScript with no dependencies, and two compact data files. It has no server, no
index and no model of its own, and it keeps nothing unless you ask. It can be that small because it doesn't search
everything on every turn: a person narrows things down first, and each turn only chooses from what is left.

## One turn

A learner writes *"i got 2/5"*.

1. **What the teacher decided is already a short list:** a goal, how far the AI may go, perhaps a standard, a few
   misconceptions and some guidance from research.
2. **The moment is read:** giving an answer, asking for the answer, stuck, or trying again.
3. **The list is cut down to this moment:** one teaching move, and at most two of each other kind.
4. **Instructions are written** from the teacher's words and the resources' own text, never the learner's, so what a
   learner types can change what is chosen but can't write instructions.
5. **Your model replies,** with those instructions after your own system prompt.
6. **`check` and `record`,** if you want them: a second model reviews the reply, and a record says what went in.

```js
const turn = await prepare({ teaching, message, history });
turn.instructions;   // what goes after your system prompt
turn.moment;         // "attempt"
turn.chosen;         // which misconceptions, skill components and guidance it took
```

## Two stages, which is why there is no vector store

| Stage | Who | From | To | When |
| --- | --- | --- | --- | --- |
| Choosing for an activity | A teacher, or an assistant working with one | Every state's standards, 8,117 misconceptions, 77 pieces of guidance and whatever others publish | One standard, up to 8 misconceptions, up to 20 pieces of guidance, kept in the activity | Once, before class |
| Choosing for a turn | Rules, or a small model | That short list | One move, and at most 2 of each kind | Every message |

What is chosen for an activity is kept as it was, with where it came from. A run never waits on a far-off service, and a
record can say exactly what the AI was given.

## The pool

| What | How much | Where it lives | Who narrows it | What reaches the model |
| --- | --- | --- | --- | --- |
| What the teacher decided | One activity's settings | Your file, or the activity on the Engine or the Developer Platform | The teacher | The goal and the limit, every turn |
| Teaching moves | 4, with their sources | In the code, [`src/brief.js`](../src/brief.js) | The moment | One |
| Misconceptions ([Eedi](https://www.eedi.com)) | 8,117, under 2,258 skills, 1.2 MB | In the package | The teacher ticks up to 8, or words search the skills | At most 2 |
| Durable skills (Carnegie) | 60 KB | In the package | The teacher picks one | Its level |
| Standards ([Learning Commons](https://learningcommons.org)) | About 1 GB for every state | Not in the package. Hosted: `find_standards`. Yours: `viable-harness resources` downloads the release and keeps one state's | The teacher picks one, kept with its learning components | At most 2 components, 1 earlier standard |
| [Guidance from research](components.md) | 77 pieces on 8 topics, each naming its studies, in the package; anyone's own, up to 500 in a component's file | In the package or that file, and up to 20 copied into an activity | A person, then the moment | At most 2 |
| Your own documents | Whatever you have | Not in the Harness: your agent's retrieval, or the Engine's knowledge | Search | What search finds |
| [The catalog](catalog.md) | 54 public goods, described | Descriptions in the package. Data comes from its makers when you fetch it | You | Nothing directly. It becomes test suites, judges and knowledge |

## How a turn chooses

**By rules, with no model call and no cost.** Patterns read the moment, in English. A list item is taken when it shares at
least two words with what was just said, the closest first. Guidance can name its moments, and then those for the moment take
turns as the conversation goes on, so a learner doesn't hear the same two every time.

**By a small model, for one more call a turn** (`pickerModel`). It reads the conversation and the numbered list, and answers
which to take. It reads any language, and more of the moments. If it fails or takes too long, rules decide.

How well this works so far: of 30 moments a small model read 29 and rules read 23, but finding the right misconception for a
message worked on only 4 of 19 turns ([what was measured](evidence.md)). That is the weakest part, and the evaluation looks at it first.

## Keywords, embeddings and RAG

The Harness does no retrieval. A list of a dozen items needs no index, and everything above it was narrowed by a person.

Retrieval is for your own documents, such as a library's guides, and belongs to whatever holds them:

| Where | Keywords | By meaning | Reranked | Where the vectors are |
| --- | --- | --- | --- | --- |
| The Engine's knowledge | BM25 | Once a model for it is set in the console | No | In its own store, made the first time a file is searched, and kept |
| The Developer Platform's knowledge | BM25 | Yes | Yes | In a vector index on the platform |
| The Harness | No | No | No | None |

Using both generally finds more than keywords alone: meaning catches a paraphrase, and keywords catch an exact name or a
code. The space is rarely the issue: a vector of 1,024 numbers is 4 KB, so 10,000 passages are 40 MB, and a class's guides
are hundreds of passages.

Giving the misconceptions vectors too is possible, at about 32 MB and an embedding model on every turn. It isn't built, and
whether it would beat a small picker model is for the evaluation to say.

## Skills, MCP and the gateway

All of them reach the same code. What differs is what runs where, and whether it's guaranteed to run.

| Way in | What it is | What runs, and where | Where the data is | Guarantees it runs |
| --- | --- | --- | --- | --- |
| [Skills](../skills/) | Text files an assistant reads | Nothing runs: the assistant follows them, or doesn't | None | No |
| [MCP, local](mcp.md) | `viable-harness mcp`, started by your assistant | This code, on your computer | In the package, and what you fetched | No: the assistant chooses to call it |
| [MCP, hosted](mcp.md) | `https://api.viablelab.org/mcp` | This code, on VIABLE's servers, which also reach Learning Commons | On VIABLE's servers. No log keeps a tool's arguments | No: the assistant chooses to call it |
| Your code | `prepare`, `check`, `record` | This code, in your process | In the package | When you call it |
| [The gateway](with-your-stack.md) | One URL in front of your model | This code, on your server | In the package, and the settings you give it | Yes |
| [The Engine](../../engine/README.md) | The whole thing on your server | This code, inside it | In the package, and its own store | Yes |

## Where the Engine and the Developer Platform use it

Neither has a copy: they import these same files, so a change here reaches all three.

| Part of the Harness | The Engine | The Developer Platform |
| --- | --- | --- |
| Teaching settings, in `How the AI helps` | Yes | Yes |
| The turn's brief | On by default | A choice in How the AI helps, off by default, read by rules |
| VETTING's prompts and rounds | Its VETTING step | Its VETTING step and `/v1/vetting/*` |
| Misconceptions and durable skills | Choosing them for an activity | Choosing them for an activity |
| Measures | Records | The research export |
| Suggested changes | Progress | Progress |
| Formats, agent tests' verdicts | Yes | Yes |
| MCP tools | `viable-engine mcp` | The hosted server |

## Why it is this small

- **It lends nothing out and keeps nothing:** a host passes in `fetch`, a model and a store.
- **It has no dependencies,** so what you install is what you see: 0.8 MB packed.
- **It holds decisions, not knowledge:** the data it carries is small and compact, and what is large stays with its makers
  until someone asks for it.
