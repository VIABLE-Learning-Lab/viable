## What and why

<!-- What changes, who it's for, and the issue it closes (Closes #123). The title is the squash commit's subject: type(scope): description. -->

## How it was checked

<!-- The tests you added or ran, and anything you tried by hand (a run on a model endpoint, the teacher view in a browser). -->

## Checklist

- [ ] `npm test` passes (tests, the boundary test and the conformance fixtures).
- [ ] Docs and the README say what the code now does, and no more.
- [ ] A changed step manifest: `npm run steps:build`. A changed format: a minor version and a note on moving files.
- [ ] No real learner's data in fixtures, tests or examples, and no learner name or identifier sent to a model.
- [ ] Every commit is signed off (`git commit -s`).
