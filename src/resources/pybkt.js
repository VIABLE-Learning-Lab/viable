// pyBKT as a measure from a template: Bayesian Knowledge Tracing fitted on a class's records, then read
// per learner out of process. pyBKT is Python, so the harness writes the folder and runs nothing of it
// in its own process; `server.py` needs only Python's standard library, `fit.py` needs pyBKT.
const SERVER = String.raw`#!/usr/bin/env python3
"""A stdio MCP server for the harness's measure slot: mastery per skill from one learner's graded
attempts, by Bayesian Knowledge Tracing with the parameters fit.py wrote to params.json."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CORRECT = {True: 1, False: 0, 1: 1, 0: 0}


def attempts(record):
    """Graded attempts in time order, as the harness's measures read them: (skill, 0 or 1)."""
    found = []
    for event in record.get("events") or []:
        data = event.get("data") or {}
        if event.get("type") == "questions.answer" and data.get("correct") in CORRECT:
            found.append((event.get("at") or "", event.get("seq") or 0, str(data.get("skill") or data.get("set") or "questions"), CORRECT[data["correct"]]))
    for turn in record.get("turns") or []:
        graded = turn.get("assessment") or []
        for item in graded if isinstance(graded, list) else [graded]:
            if item.get("skill") and item.get("correct") in CORRECT:
                found.append((turn.get("started_at") or "", 0, str(item["skill"]), CORRECT[item["correct"]]))
    return [(skill, correct) for _, _, skill, correct in sorted(found, key=lambda row: row[:2])]


def mastery(observed, params):
    """P(knows the skill) after these observations: the standard BKT update."""
    known = params["prior"]
    for correct in observed:
        if correct:
            seen = known * (1 - params["slips"]) / (known * (1 - params["slips"]) + (1 - known) * params["guesses"])
        else:
            seen = known * params["slips"] / (known * params["slips"] + (1 - known) * (1 - params["guesses"]))
        known = seen * (1 - params.get("forgets", 0)) + (1 - seen) * params["learns"]
    return known


def measures(record, fitted):
    by_skill = {}
    for skill, correct in attempts(record):
        by_skill.setdefault(skill, []).append(correct)
    out = []
    for skill, observed in sorted(by_skill.items()):
        out.append({"id": ("bkt_mastery." + skill)[:80], "value": round(mastery(observed, fitted[skill]), 4) if skill in fitted else None})
        out.append({"id": ("bkt_attempts." + skill)[:80], "value": len(observed)})
    return {"measures": out}


def answer(message):
    if message.get("method") == "initialize":
        return {"protocolVersion": message["params"]["protocolVersion"], "capabilities": {"tools": {}}, "serverInfo": {"name": "viable-bkt", "version": "1.0.0"}}
    if message.get("method") != "tools/call":
        return {}
    try:
        with open(os.path.join(HERE, "params.json"), encoding="utf-8") as file:
            fitted = json.load(file)
    except OSError:
        return {"content": [{"type": "text", "text": "No params.json yet: run python3 fit.py <record.json...> on a class's records first."}], "isError": True}
    result = measures(message["params"]["arguments"].get("learning_events") or {}, fitted)
    return {"content": [{"type": "text", "text": json.dumps(result)}], "structuredContent": result}


if __name__ == "__main__":
    for line in sys.stdin:
        message = json.loads(line)
        if "id" in message and "method" in message:
            print(json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": answer(message)}), flush=True)
`;

const FIT = String.raw`#!/usr/bin/env python3
"""Fits BKT on a class's learner records with pyBKT and writes params.json, one set per skill.
  python3 fit.py record.json [record.json...]     (each a learner record, or a list of them)"""
import json
import os
import sys

import pandas as pd
from pyBKT.models import Model

from server import HERE, attempts


def main(names):
    rows = []
    for name in names:
        with open(name, encoding="utf-8") as file:
            loaded = json.load(file)
        for learner, record in enumerate(loaded if isinstance(loaded, list) else [loaded]):
            for skill, correct in attempts(record):
                rows.append({"order_id": len(rows), "user_id": str(record.get("user") or f"{name}-{learner}"), "skill_name": skill, "correct": correct})
    if not rows:
        sys.exit("No graded attempts in those records.")
    # In one process: its pure Python fit starts a pool per round otherwise, which takes minutes for a class.
    model = Model(seed=42, num_fits=5, parallel=False)
    model.fit(data=pd.DataFrame(rows))
    fitted = {skill: {name: float(value[0]) if hasattr(value, "__len__") else float(value) for name, value in coef.items()} for skill, coef in model.coef_.items()}
    with open(os.path.join(HERE, "params.json"), "w", encoding="utf-8") as file:
        json.dump(fitted, file, indent=2)
    print(f"Fitted {len(fitted)} skill(s) on {len(rows)} attempts: params.json")


if __name__ == "__main__":
    main(sys.argv[1:])
`;

const MANIFEST = {
  id: 'cahlr/pybkt-mastery',
  version: '0.1.0',
  slot: 'measure',
  label: 'Mastery by BKT (pyBKT)',
  summary: 'Mastery per skill from a learner\'s graded attempts, by Bayesian Knowledge Tracing fitted on your class with pyBKT, beside the harness\'s own mastery streak.',
  runs: { kind: 'mcp', entry: 'bkt_mastery', server: { command: 'python3', args: ['server.py'] } },
  receives: ['learning_events'],
  sends_to: [],
  uses_models: false,
  license: { code: 'MIT' },
  authors: ['Zachary A. Pardos', 'Anirudhan Badrinath', 'Frederic Wang', 'Cristian Garay'],
  cite: 'Badrinath, A., Wang, F., Pardos, Z. A. (2021). pyBKT: An Accessible Python Library of Bayesian Knowledge Tracing Models. EDM 2021. https://github.com/CAHLR/pyBKT',
  evidence: {
    original: 'pyBKT\'s authors replicate published BKT variants; see their paper.',
    integration: 'Written from a template and run through the harness\'s measure call with fixed parameters. Not compared with the mastery streak on real learners.',
    unknown: 'How well its parameters fit your class, and what it says about what learners learned. BKT needs many attempts per skill; a few give a number that means little.'
  },
  risk: 'medium',
  risk_notes: 'A wrong number can mislead a teacher. It runs on this machine, calls no model and sends nothing elsewhere.',
  maintainer: { name: 'VIABLE Lab' },
  harness: '>=0.2.0 <1.0.0'
};

const README = `# Mastery by BKT, with pyBKT

Written by \`viable-harness resources get pybkt\`. pyBKT is MIT; this folder is yours to change.

1. Fit on a class's records. pyBKT 1.4.3 needs Python 3.12 or earlier and these older packages, so give it
   a virtual environment of its own:

       python3.12 -m venv .venv
       .venv/bin/pip install pyBKT "numpy<2" "scikit-learn<1.6" "pandas<2.3"
       .venv/bin/python fit.py records/*.json

2. Read one learner:

       viable-harness measure record.json --component manifest.json

\`server.py\` needs only Python's standard library. It reads \`params.json\`; a skill the fit didn't see
gets \`null\`. BKT needs many attempts per skill: a few give a number that means little.

Cite: ${MANIFEST.cite}
`;

export default {
  id: 'pybkt',
  version: 1,
  as: ['measure'],
  // The folder is the harness's template, written here: nothing is downloaded until you install pyBKT yourself.
  async fetch(get) {
    get.save('server.py', SERVER);
    get.save('fit.py', FIT);
    get.save('manifest.json', `${JSON.stringify(MANIFEST, null, 2)}\n`);
    get.save('README.md', README);
  },
  use({ folder }) { return { manifest: `${folder}/manifest.json` }; }
};
