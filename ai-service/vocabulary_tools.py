"""Prepare a reviewed core vocabulary release from explicitly selected WordNet senses."""

import argparse
import copy
import json
from pathlib import Path
import re


def normalise(value):
    return " ".join(value.replace("_", " ").strip().lower().split())


def valid_name(value):
    return len(value) <= 80 and re.fullmatch(r"[a-z][a-z0-9]*(?:[ -][a-z0-9]+)*", value) is not None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path(__file__).resolve().parent.parent / "backend/data/clip-vocabulary.json")
    parser.add_argument("--output", type=Path, required=True, help="A separate candidate release file to inspect before publishing.")
    parser.add_argument("--version", required=True, help="New semantic version, for example 1.1.0.")
    parser.add_argument("--synset", action="append", required=True, help="An explicitly selected noun sense, for example car.n.01. May be repeated.")
    parser.add_argument("--asset-types", nargs="+", choices=["image", "3d"], default=["image", "3d"])
    parser.add_argument("--category", default="wordnet-objects")
    parser.add_argument("--facet", choices=["content", "form", "style", "appearance"], default="content")
    parser.add_argument("--download-wordnet", action="store_true", help="Download the corpus for this offline preparation command only.")
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error("Write a separate candidate release rather than overwriting the active vocabulary.")
    if not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
        parser.error("Use a semantic version such as 1.1.0.")
    if "3d" in args.asset_types and args.facet != "content":
        parser.error("3D vocabulary currently supports content concepts; appearance requires textured previews.")

    import nltk
    from nltk.corpus import wordnet as wn

    if args.download_wordnet:
        if not nltk.download("wordnet", quiet=True):
            parser.error("The WordNet corpus could not be downloaded.")
    try:
        wordnet_version = wn.get_version()
    except LookupError:
        parser.error("WordNet is not installed. Run this command with --download-wordnet once, or provide NLTK_DATA.")

    original = json.loads(args.input.read_text(encoding="utf-8"))
    if original.get("model") != "openai/clip-vit-base-patch32":
        parser.error("Keep the existing openai/clip-vit-base-patch32 checkpoint in the vocabulary.")
    if args.version == original["version"]:
        parser.error("Choose a new vocabulary version for this release.")
    vocabulary = copy.deepcopy(original)
    entries = vocabulary["entries"]
    owners = {}
    ids = set()
    for entry in entries:
        if entry["id"] in ids:
            parser.error(f"Duplicate input concept ID: {entry['id']}")
        ids.add(entry["id"])
        for alias in [entry["name"], *entry["aliases"]]:
            key = normalise(alias)
            if key in owners and owners[key] is not entry:
                parser.error(f"Ambiguous input alias: {alias}")
            owners[key] = entry

    report = []
    for selected in args.synset:
        try:
            synset = wn.synset(selected)
        except Exception as error:
            parser.error(f"Invalid WordNet synset {selected}: {error}")
        if synset.pos() != "n":
            parser.error(f"Select a noun concept: {selected}")
        name = normalise(synset.lemmas()[0].name())
        if not valid_name(name):
            parser.error(f"This concept needs a manually curated English label: {selected}")
        entry = owners.get(name)
        if entry and entry["name"] != name:
            parser.error(f"{name} is already an alias of {entry['name']}; select or curate the intended concept explicitly.")
        if entry and entry.get("lexicalSource", {}).get("synset") not in (None, selected):
            parser.error(f"{name} is already assigned a different WordNet sense.")
        if not entry:
            entry = {
                "id": f"wordnet:{selected}", "name": name, "aliases": [],
                "category": args.category, "facet": args.facet,
                "assetTypes": sorted(set(args.asset_types)),
                "description": synset.definition()[:240], "source": "wordnet"
            }
            if entry["id"] in ids:
                parser.error(f"This WordNet concept already exists under another label: {selected}")
            entries.append(entry)
            ids.add(entry["id"])
            owners[name] = entry

        skipped = []
        for lemma in synset.lemma_names():
            alias = normalise(lemma)
            if alias == entry["name"] or alias in entry["aliases"] or not valid_name(alias):
                continue
            # A surface word with several noun senses cannot be safely auto-normalised.
            if len(wn.synsets(lemma, pos=wn.NOUN)) != 1 or (alias in owners and owners[alias] is not entry):
                skipped.append(alias)
                continue
            entry["aliases"].append(alias)
            owners[alias] = entry
        entry["lexicalSource"] = {
            "type": "wordnet", "version": wordnet_version, "synset": selected,
            "hypernyms": [parent.name() for parent in synset.hypernyms()],
            "citation": "https://wordnet.princeton.edu/citing-wordnet"
        }
        report.append({"name": entry["name"], "synset": selected, "skippedAmbiguousAliases": skipped})

    vocabulary["version"] = args.version
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(vocabulary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "version": args.version, "concepts": report}, indent=2))


if __name__ == "__main__":
    main()
