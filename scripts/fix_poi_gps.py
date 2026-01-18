#!/usr/bin/env python3
"""
fix_poi_gps.py

Korrigiert die durch Excel veränderten GPS-Werte in `data/poi.csv`.
Verwendet die korrekten Koordinaten aus `data/poi.geojson`.

Usage:
  python scripts/fix_poi_gps.py
  python scripts/fix_poi_gps.py --in data/poi.csv --geo data/poi.geojson --out data/poi_fixed.csv

Das Skript versucht zuerst, Einträge über das Feld `title` zuzuordnen.
Fällt das aus, wird als Fallback die Feature-Reihenfolge (ID → Feature-Index) genutzt.
"""
from __future__ import annotations
import argparse
import csv
import json
from pathlib import Path
from typing import Dict, Tuple


def normalize(s: str) -> str:
    return " ".join(s.strip().split()).lower()


def build_mapping(geojson_path: Path) -> Dict[str, Tuple[str, str]]:
    data = json.loads(geojson_path.read_text(encoding="utf-8"))
    mapping: Dict[str, Tuple[str, str]] = {}
    features = data.get("features", [])
    for idx, feat in enumerate(features, start=1):
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if not coords or len(coords) < 2:
            continue
        lon, lat = coords[0], coords[1]
        props = feat.get("properties") or {}
        # try several keys for title
        for key in ("title", "title_en"):
            if key in props and props[key]:
                mapping[normalize(str(props[key]))] = (f"{lat}", f"{lon}")
        # also map by numeric index -> tuple, used as fallback by ID
        mapping[f"__index__{idx}"] = (f"{lat}", f"{lon}")
    return mapping


def fix_csv(in_path: Path, geojson_path: Path, out_path: Path, excel_safe: bool = True) -> None:
    mapping = build_mapping(geojson_path)

    with in_path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        fieldnames = reader.fieldnames or []
        rows = list(reader)

    lat_key = None
    lon_key = None
    for k in fieldnames:
        lk = k.strip().lower()
        if lk == "latitude":
            lat_key = k
        if lk == "longitude":
            lon_key = k
    if lat_key is None or lon_key is None:
        raise SystemExit("Konnte 'latitude'/'longitude' Spalten nicht finden in CSV-Header")

    replaced = 0
    not_found = 0
    for i, row in enumerate(rows, start=1):
        # try title match first
        title = row.get("title") or row.get("Title") or ""
        coord = None
        if title:
            coord = mapping.get(normalize(title))
        # try english title
        if coord is None:
            title_en = row.get("title_en") or row.get("title_en") or ""
            if title_en:
                coord = mapping.get(normalize(title_en))
        # fallback to ID -> index mapping
        if coord is None:
            idval = row.get("ID") or row.get("Id") or row.get("id") or ""
            try:
                idx = int(idval)
                coord = mapping.get(f"__index__{idx}")
            except Exception:
                coord = None

        if coord:
            lat, lon = coord
            row[lat_key] = lat
            row[lon_key] = lon
            replaced += 1
        # if we didn't find a mapping we still may leave original values
        else:
            not_found += 1

    # Optionally prefix coordinates with an apostrophe so Excel imports them as text
    if excel_safe:
        for row in rows:
            if row.get(lat_key) and not str(row.get(lat_key)).startswith("'"):
                row[lat_key] = f"'{row[lat_key]}"
            if row.get(lon_key) and not str(row.get(lon_key)).startswith("'"):
                row[lon_key] = f"'{row[lon_key]}"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Erledigt: {replaced} Koordinaten ersetzt, {not_found} nicht gefunden. Ausgabe: {out_path}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="infile", default="data/poi.csv", help="Eingabe-CSV (Standard: data/poi.csv)")
    p.add_argument("--geo", dest="geo", default="data/poi.geojson", help="GeoJSON mit korrekten Koordinaten (Standard: data/poi.geojson)")
    p.add_argument("--out", dest="out", default="data/poi_fixed.csv", help="Ausgabe-CSV (Standard: data/poi_fixed.csv)")
    # Excel-safe: prefix coordinates with apostrophe to keep them as text in Excel
    p.add_argument("--excel-safe", dest="excel_safe", action="store_true", default=True, help="Prefix coordinates with apostrophe to avoid Excel auto-formatting (default: enabled)")
    p.add_argument("--no-excel-safe", dest="excel_safe", action="store_false", help="Do not prefix coordinates; write raw numeric values")
    args = p.parse_args()

    in_path = Path(args.infile)
    geo_path = Path(args.geo)
    out_path = Path(args.out)

    if not in_path.exists():
        raise SystemExit(f"Eingabedatei nicht gefunden: {in_path}")
    if not geo_path.exists():
        raise SystemExit(f"GeoJSON nicht gefunden: {geo_path}")

    fix_csv(in_path, geo_path, out_path, excel_safe=args.excel_safe)


if __name__ == "__main__":
    main()
