"""Export selected official catalog entries for editorial review."""

import argparse
import csv
import json
import re
from pathlib import Path
from xml.etree import ElementTree

ATOM = "{http://www.w3.org/2005/Atom}"
DC = "{http://purl.org/dc/terms/}"
STANDARD_URL = re.compile(r"https://standardebooks\.org/ebooks/[a-z0-9_-]+/[a-z0-9_/-]+")
MAX_BYTES = 25 * 1024 * 1024


def gutenberg(path, ids):
    with path.open(newline="", encoding="utf-8-sig") as catalog:
        for row in csv.DictReader(catalog):
            identifier = row["Text#"]
            if identifier in ids and re.fullmatch(r"[0-9]{1,8}", identifier) and row["Type"] == "Text":
                yield {
                    "id": "gutenberg-" + identifier,
                    "title": row["Title"],
                    "authors": row["Authors"].split("; "),
                    "languages": row["Language"].split("; "),
                    "source": f"https://www.gutenberg.org/ebooks/{identifier}",
                    "provider": "Project Gutenberg",
                    "formats": [],
                    "providerRights": "https://www.gutenberg.org/policy/license",
                }


def standard(path, ids):
    contents = path.read_bytes()
    if re.search(rb"<!DOCTYPE|<!ENTITY", contents, re.IGNORECASE):
        raise ValueError("O feed OPDS contém uma declaração XML não aceita.")
    feed = ElementTree.fromstring(contents.decode("utf-8-sig"))
    for entry in feed.findall(f"{ATOM}entry"):
        source = entry.findtext(f"{ATOM}id", "").strip()
        if source not in ids or not STANDARD_URL.fullmatch(source):
            continue
        formats = sorted({
            link.get("type") for link in entry.findall(f"{ATOM}link")
            if link.get("rel", "").startswith("http://opds-spec.org/acquisition")
            and link.get("type") in {"application/epub+zip", "application/x-mobipocket-ebook"}
        })
        yield {
            "id": "standard-" + source.split("/ebooks/", 1)[1].replace("/", "-"),
            "title": entry.findtext(f"{ATOM}title", "").strip(),
            "authors": [name.text for name in entry.findall(f"{ATOM}author/{ATOM}name") if name.text],
            "languages": [lang.text for lang in entry.findall(f"{DC}language") if lang.text],
            "source": source,
            "provider": "Standard Ebooks",
            "formats": formats,
            "providerRights": (
                entry.findtext(f"{ATOM}rights")
                or "https://standardebooks.org/about/standard-ebooks-and-the-public-domain"
            ),
        }


def main():
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("provider", choices=("gutenberg", "standard"))
    arguments.add_argument("file", type=Path)
    arguments.add_argument("ids", nargs="+", help="Numeric Gutenberg IDs or full Standard Ebooks book URLs")
    args = arguments.parse_args()
    ids = set(args.ids)
    if len(ids) > 50 or args.file.stat().st_size > MAX_BYTES:
        arguments.error("Informe até 50 edições e um arquivo de até 25 MiB.")
    importer = gutenberg if args.provider == "gutenberg" else standard
    entries = {
        entry["id"]: {**entry, "rights": None, "availability": "external"}
        for entry in importer(args.file, ids)
        if entry["title"]
    }
    print(json.dumps(list(entries.values()), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
