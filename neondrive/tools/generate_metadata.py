#!/usr/bin/env python3
"""
generate_metadata.py — Generate ERC-721/1155 JSON metadata for PINKS NeonDrive.
Outputs to /metadata/cars/ and /metadata/parts/.

Usage:  python3 tools/generate_metadata.py
"""

import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META = os.path.join(ROOT, "metadata")

CARS = [
    {"id":1, "slug":"phantom", "name":"Phantom #001", "rarity":"Legendary",
     "speed":95, "handling":88, "acceleration":90, "durability":75, "boost":92,
     "desc":"A ghostly legend of the neon streets. The fastest car in the PINKS collection."},
    {"id":2, "slug":"specter", "name":"Specter #042", "rarity":"Epic",
     "speed":82, "handling":85, "acceleration":88, "durability":80, "boost":78,
     "desc":"An epic phantom of the drag strip. Balanced speed and handling."},
    {"id":3, "slug":"ghost", "name":"Ghost #108", "rarity":"Rare",
     "speed":75, "handling":72, "acceleration":70, "durability":85, "boost":68,
     "desc":"Built tough and hard to kill. A rare tank of a race car."},
    {"id":4, "slug":"wraith", "name":"Wraith #217", "rarity":"Rare",
     "speed":70, "handling":78, "acceleration":72, "durability":75, "boost":73,
     "desc":"Nimble and precise. A rare choice for circuit specialists."},
    {"id":5, "slug":"banshee", "name":"Banshee #333", "rarity":"Uncommon",
     "speed":60, "handling":65, "acceleration":62, "durability":68, "boost":58,
     "desc":"Screams down the track. An uncommon find in the garage."},
    {"id":6, "slug":"revenant", "name":"Revenant #512", "rarity":"Common",
     "speed":50, "handling":52, "acceleration":48, "durability":55, "boost":45,
     "desc":"Every legend starts somewhere. The common entry-level racer."},
]

RARITY_SCORE = {"Common":0,"Uncommon":1,"Rare":2,"Epic":3,"Legendary":4}
GLB_SLUGS = {
    "phantom":"phantom-001","specter":"specter-042","ghost":"ghost-108",
    "wraith":"wraith-217","banshee":"banshee-333","revenant":"revenant-512",
}

UPGRADE_CATEGORIES = [
    ("Engine", "Speed",        "engine",  range(1, 6)),
    ("Tires",  "Handling",     "tires",   range(6, 11)),
    ("NOS",    "Acceleration", "nos",     range(11, 16)),
    ("Armor",  "Durability",   "armor",   range(16, 21)),
    ("Turbo",  "Boost",        "turbo",   range(21, 26)),
]
SPECIALS = [
    {"id":26, "name":"Race ECU", "stat":"Speed", "slug":"race-ecu", "boost":15,
     "desc":"Full engine management system. Major speed boost."},
    {"id":27, "name":"Aero Kit", "stat":"Handling", "slug":"aero-kit", "boost":15,
     "desc":"Full aerodynamic body package. Major handling improvement."},
]
MK_BOOSTS = [5, 8, 12, 16, 20]
BASE_URI = "https://metadata.neondrive.io"

def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  ✓ {path}")

def generate():
    print("── Generating car metadata ──────────────────────────────────────")
    cars_dir = os.path.join(META, "cars")
    for car in CARS:
        meta = {
            "name": car["name"],
            "description": car["desc"],
            "image": f"{BASE_URI}/images/cars/{car['slug']}.png",
            "animation_url": f"{BASE_URI}/models/cars/{GLB_SLUGS[car['slug']]}.glb",
            "external_url": f"https://neondrive.io/garage/{car['id']}",
            "attributes": [
                {"trait_type":"Speed",        "value":car["speed"],        "max_value":100},
                {"trait_type":"Handling",     "value":car["handling"],     "max_value":100},
                {"trait_type":"Acceleration", "value":car["acceleration"], "max_value":100},
                {"trait_type":"Durability",   "value":car["durability"],   "max_value":100},
                {"trait_type":"Boost",        "value":car["boost"],        "max_value":100},
                {"trait_type":"Rarity",       "value":car["rarity"]},
                {"trait_type":"Rarity Score", "value":RARITY_SCORE[car["rarity"]], "display_type":"number"},
                {"trait_type":"Model",        "value":car["slug"].capitalize()},
            ]
        }
        write(os.path.join(cars_dir, f"{car['id']}.json"), meta)

    print("\n── Generating part metadata ─────────────────────────────────────")
    parts_dir = os.path.join(META, "parts")
    part_id = 1
    for cat_name, stat, slug_prefix, id_range in UPGRADE_CATEGORIES:
        for mk, boost in enumerate(MK_BOOSTS, 1):
            pid = part_id
            meta = {
                "name": f"{cat_name} Mk{mk}",
                "description": f"Tier {mk} {cat_name.lower()} upgrade. Adds +{boost} {stat}.",
                "image": f"{BASE_URI}/images/parts/{slug_prefix}-{mk}.png",
                "attributes": [
                    {"trait_type":"Upgrade Type", "value":cat_name},
                    {"trait_type":"Stat",         "value":stat},
                    {"trait_type":"Boost",        "value":boost, "display_type":"boost_number"},
                    {"trait_type":"Tier",         "value":f"Mk{mk}"},
                ]
            }
            write(os.path.join(parts_dir, f"{pid}.json"), meta)
            part_id += 1

    for s in SPECIALS:
        meta = {
            "name": s["name"],
            "description": s["desc"],
            "image": f"{BASE_URI}/images/parts/{s['slug']}.png",
            "attributes": [
                {"trait_type":"Upgrade Type", "value":s["name"]},
                {"trait_type":"Stat",         "value":s["stat"]},
                {"trait_type":"Boost",        "value":s["boost"], "display_type":"boost_number"},
                {"trait_type":"Tier",         "value":"Special"},
            ]
        }
        write(os.path.join(parts_dir, f"{s['id']}.json"), meta)

    print(f"\n✓ Generated {len(CARS)} car JSONs and 27 part JSONs in {META}/")

if __name__ == "__main__":
    generate()
