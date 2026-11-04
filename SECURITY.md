# Security

The harness runs with learners, many of them minors, so a security report comes first.

- **Report privately**, never in a public issue: through GitHub's private vulnerability reporting
  ([Security, then Report a vulnerability](https://github.com/VIABLE-Learning-Lab/viable-harness/security/advisories/new)),
  or to a maintainer in MAINTAINERS.md.
- **We answer within 7 days**, agree on a fix, release it, update VIABLE's hosted platform, and only
  then disclose, crediting you unless you'd rather not be named.
- **In scope**: a learner's data reaching a model, a host or a log it shouldn't; a way around
  VETTING's rules or a step's limits; instructions taken from what a tool or a fetched page returns;
  a component reaching data or hosts its manifest doesn't list; a package or a website doing what's below.
- Supported: the latest minor release.

## Packages from someone else

A course package or an agent file is a file someone sent you. Opening one, with `run`, `serve`, `try`, `inspect`,
`deploy` or the MCP tools, is meant to be safe, and a way around any of this is a security problem:

- **It can't start a program**, unless you name its component: `--allow-component <id>`, or
  `VIABLE_HARNESS_ALLOW_COMPONENTS` on a scaffold. The MCP tools never allow one. Once named, it runs with your rights,
  and the harness can't limit it. The name is the ID the file claims, so read what `inspect` shows it starts.
- **It can't reach your own network.** Fetch URL steps, `fetch_url`, files named by URL and http components go to public
  addresses. On Node the name is looked up first, so a name whose answer changes between that lookup and the
  fetch, on purpose, can get through: drop a server's outgoing traffic to private addresses at a firewall if that matters.
- **It can't get into generated code** through its title or file name, or hold a server's memory with a zip that
  inflates far past its size.

What it can still do, by design, so `viable-harness inspect` lists it and you read it first:

- Send what its steps say to any public address: a Fetch URL step's address may come from a learner's words, and an
  http component receives what its `inputs` give it.
- Tell the AI whatever it likes. Its instructions and its knowledge files are its author's, and a model's reply
  isn't guaranteed safe: keep VETTING on and test it.
- Say untrue things about itself: a manifest's `sends_to` and `risk` are what its author wrote.

## A server on your own machine

With no token, it answers that computer only, and a website you are visiting can't post to it or read it. Behind a
reverse proxy that sets `Host` to `127.0.0.1` and says nothing else, every visitor looks like that computer: they still
can't open the teacher's page or the panel, which take a token, but they can use the agents on your key. A server
anyone else can reach needs a token. On a computer learners share, sign out of the teacher's page before they sit down.
