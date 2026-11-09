#!/usr/bin/env python3
"""Edu-ConvoKit's annotators as a component of the VIABLE Harness, over HTTP on 127.0.0.1 (README.md).

  python server.py [--port 8790] [--with reasoning,focusing,uptake]
  python server.py --download reasoning,focusing,uptake --accept-license

POST /measure reads a learner record's turns and answers talk time and math density, which need no model.
POST /detect marks turns with the classifiers turned on with --with, each a model downloaded first.
While it serves, it reads models only from this computer's cache and contacts no other host.
"""
import argparse
import json
import logging
import math
import os
import sys
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, HTTPServer

# Read before transformers is imported: serving never reaches the network; only --download does.
if not any(arg == "--download" or arg.startswith("--download=") for arg in sys.argv[1:]):
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
logging.basicConfig(level=logging.ERROR)

from edu_convokit import uptake_utils
from edu_convokit.annotation import Annotator
from edu_convokit.constants import HIGH_UPTAKE_THRESHOLD
import pandas as pd

LEARNER, AI = "learner", "ai"
MOST_BYTES = 5 * 1024 * 1024
# Each classifier by the name Edu-ConvoKit 0.4.0 calls it, where that model lives now, the revision checked, and its terms.
CLASSIFIERS = {
    "reasoning": {
        "name": "ddemszky/student-reasoning", "repo": "stanford-nlpxed/student-reasoning", "revision": "bf2533dfcd5e73bfd6609092912bc22c220cb052",
        "license": "Its model card says GPL and names no version. About 440 MB.",
    },
    "focusing": {
        "name": "ddemszky/focusing-questions", "repo": "stanford-nlpxed/focusing-questions", "revision": "a7949cdc265819b06f4ae676f71c40b5bb33e7a3",
        "license": "CC BY-NC 3.0: non-commercial use only. About 440 MB.",
    },
    "uptake": {
        "name": "ddemszky/uptake-model", "repo": "stanford-nlpxed/uptake-model", "revision": "b5f51f5b9cf40f84f5201fcbdbb4dce42f7b8a97",
        "license": "CC BY-NC-ND 4.0, and its card asks each user to agree not to use it commercially, not to try to recover its "
                   "training data, and not to share it beyond their research team and project. About 440 MB.",
    },
}

annotator = Annotator()


@lru_cache(maxsize=None)
def snapshot(name):
    """The pinned copy of the model Edu-ConvoKit calls `name`: downloaded with --download, read from the cache otherwise."""
    from huggingface_hub import snapshot_download
    model = next(item for item in CLASSIFIERS.values() if item["name"] == name)
    return snapshot_download(model["repo"], revision=model["revision"], allow_patterns=["config.json", "pytorch_model.bin", "*token*.json", "vocab.txt"])


# Edu-ConvoKit loads a model on every call; here each loads once, from its pinned copy, through Edu-ConvoKit's own loaders.
annotator._initialize = lru_cache(maxsize=None)(lambda name: Annotator._initialize(annotator, snapshot(name)))
load_uptake = uptake_utils._initialize
uptake_utils._initialize = lru_cache(maxsize=None)(lambda name: load_uptake(snapshot(name)))


def frame_of(payload):
    """The record's turns as Edu-ConvoKit reads a transcript: a row for each message and each reply with text, in order."""
    events = payload.get("learning_events") if isinstance(payload, dict) else None
    turns = events.get("turns") if isinstance(events, dict) else None
    rows = []
    for index, turn in enumerate(turns if isinstance(turns, list) else []):
        for speaker, field in ((LEARNER, "message"), (AI, "reply")):
            text = turn.get(field) if isinstance(turn, dict) else None
            if isinstance(text, str) and text.strip():
                rows.append({"turn": index, "speaker": speaker, "text": text.strip()})
    return pd.DataFrame(rows, columns=["turn", "speaker", "text"])


def number(value):
    value = float(value)
    return None if math.isnan(value) else int(value) if value.is_integer() else round(value, 4)


def measures(frame):
    """Talk time (words) and math density (terms from Edu-ConvoKit's glossary) per speaker: the sum, the mean and the share
    of the total that its QuantitativeAnalyzer reports. Its analyzers aren't imported: they fetch NLTK data when loaded."""
    if frame.empty:
        return {"measures": []}
    frame = annotator.get_talktime(df=frame, text_column="text", analysis_unit="words", output_column="talktime")
    frame = annotator.get_math_density(df=frame, text_column="text", output_column="math_density")
    words = frame.groupby("speaker")["talktime"].sum()
    terms = frame.groupby("speaker")["math_density"].mean()

    def value(series, speaker, divide_by=1):
        return number(series[speaker] / divide_by) if speaker in series.index else None

    return {"measures": [
        {"id": "convokit.talk_time.learner_share", "value": value(words, LEARNER, words.sum())},
        {"id": "convokit.talk_time.learner_words", "value": value(words, LEARNER)},
        {"id": "convokit.talk_time.ai_words", "value": value(words, AI)},
        {"id": "convokit.math_density.learner", "value": value(terms, LEARNER)},
        {"id": "convokit.math_density.ai", "value": value(terms, AI)},
    ]}


def quote(text, most=200):
    text = " ".join(text.split())
    return text if len(text) <= most else text[: most - 1].rsplit(" ", 1)[0] + "…"


def marks(frame, on):
    """A mark for each turn a classifier that is on finds, with what it read."""
    found = []
    if frame.empty:
        return {"marks": found}
    if "reasoning" in on:
        frame = annotator.get_student_reasoning(df=frame, text_column="text", output_column="reasoning", speaker_column="speaker", speaker_value=LEARNER)
        found += [(row.turn, "Learner explained their reasoning", f"Student reasoning classifier, on the learner's message: “{quote(row.text)}”")
                  for row in frame[frame["reasoning"] == 1].itertuples()]
    if "focusing" in on:
        frame = annotator.get_focusing_questions(df=frame, text_column="text", output_column="focusing", speaker_column="speaker", speaker_value=AI)
        found += [(row.turn, "AI asked a focusing question", f"Focusing question classifier, on the AI's reply: “{quote(row.text)}”")
                  for row in frame[frame["focusing"] == 1].itertuples()]
    if "uptake" in on:
        frame = annotator.get_uptake(df=frame, text_column="text", output_column="uptake", speaker_column="speaker", speaker1=LEARNER, speaker2=AI, result_type="raw")
        for position, row in enumerate(frame.itertuples()):
            if row.uptake is not None and not pd.isna(row.uptake) and row.uptake > HIGH_UPTAKE_THRESHOLD:
                said = frame.iloc[position - 1]["text"]
                found.append((row.turn, "AI built on what the learner said", f"Uptake {row.uptake:.2f} (high above {HIGH_UPTAKE_THRESHOLD}), the AI's reply “{quote(row.text, 120)}” to the learner's “{quote(said, 120)}”"))
    found.sort(key=lambda item: item[0])
    return {"marks": [{"turn_index": int(turn), "label": label, "evidence": evidence} for turn, label, evidence in found]}


def handler(on):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            path = self.path.split("?")[0]
            if path not in ("/measure", "/detect"):
                return self.answer(404, {"error": "POST /measure or /detect."})
            if path == "/detect" and not on:
                return self.answer(409, {"error": "No classifier is on: start it with --with reasoning, focusing or uptake (README.md)."})
            length = self.headers.get("content-length") or "0"
            if not length.isdigit():  # a negative or missing length would leave the read waiting
                return self.answer(400, {"error": "Send a content-length."})
            size = int(length)
            if size > MOST_BYTES:
                return self.answer(413, {"error": f"Send at most {MOST_BYTES} bytes."})
            try:
                payload = json.loads(self.rfile.read(size) or b"null")
            except ValueError:
                return self.answer(400, {"error": "Send JSON."})
            if not isinstance(payload, dict):
                return self.answer(400, {"error": "Send { learning_events: { events, turns } }."})
            frame = frame_of(payload)
            try:
                found = measures(frame) if path == "/measure" else marks(frame, on)
            except Exception as error:  # an answer the harness reads as a failure, rather than a dropped connection
                return self.answer(500, {"error": f"Edu-ConvoKit couldn't read this record: {str(error)[:300]}"})
            return self.answer(200, found)

        def answer(self, status, body):
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    return Handler


SAMPLE = frame_of({"learning_events": {"turns": [{"message": "I think it is three fourths because three of the four equal parts are shaded",
                                                  "reply": "Why does the number of shaded parts tell you the numerator?"}]}})


def chosen(names):
    picked = [name.strip() for name in names.split(",") if name.strip()]
    unknown = [name for name in picked if name not in CLASSIFIERS]
    if unknown:
        sys.exit(f"There is no classifier {', '.join(unknown)}: they are {', '.join(CLASSIFIERS)}.")
    return picked


def main():
    parser = argparse.ArgumentParser(description="Edu-ConvoKit's annotators as a component of the VIABLE Harness.")
    parser.add_argument("--port", type=int, default=8790)
    parser.add_argument("--with", dest="on", default="", help="classifiers /detect runs, already downloaded: reasoning, focusing, uptake")
    parser.add_argument("--download", default="", help="classifiers to download into the Hugging Face cache, then stop")
    parser.add_argument("--accept-license", action="store_true", help="you have read each model's license and terms, and accept them")
    args = parser.parse_args()
    if args.download:
        names = chosen(args.download)
        for name in names:
            print(f"{name} ({CLASSIFIERS[name]['repo']}): {CLASSIFIERS[name]['license']}")
        if not args.accept_license:
            sys.exit("Read each license above, then add --accept-license to download.")
        for name in names:
            marks(SAMPLE.copy(), {name})
        return print(f"Downloaded. Start it with: python server.py --with {','.join(names)}")
    on = set(chosen(args.on))
    for name in sorted(on):
        try:
            marks(SAMPLE.copy(), {name})
        except Exception as error:  # whatever failed, the next step is the same
            sys.exit(f"Couldn't load the {name} classifier from this computer: {error}\nDownload it first: python server.py --download {name} --accept-license")
        print(f"{name} is on ({CLASSIFIERS[name]['repo']}): {CLASSIFIERS[name]['license']}")
    server = HTTPServer(("127.0.0.1", args.port), handler(on))
    print(f"Listening on http://127.0.0.1:{args.port}: POST /measure{', /detect' if on else ''}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
