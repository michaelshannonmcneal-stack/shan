#!/usr/bin/env python3
"""
convert_fbx_to_glb.py — Convert FBX car/part models to GLB for Three.js.

Requires Blender 3.x+ to be installed.

Usage:
  blender --background --python tools/convert_fbx_to_glb.py -- \
    --input  /path/to/pink-content-assets \
    --output web/public/models

Or run the helper that generates the exact command:
  python3 tools/convert_fbx_to_glb.py --print-command \
    --input /path/to/pink-content-assets \
    --output web/public/models
"""

import sys
import os
import argparse

def run_in_blender():
    try:
        import bpy
    except ImportError:
        return False

    argv = sys.argv
    try:
        idx = argv.index("--") + 1
        args = argv[idx:]
    except ValueError:
        print("Usage: blender --background --python convert_fbx_to_glb.py -- --input <dir> --output <dir>")
        return True

    parser = argparse.ArgumentParser()
    parser.add_argument("--input",  required=True)
    parser.add_argument("--output", required=True)
    opts = parser.parse_args(args)

    os.makedirs(opts.output, exist_ok=True)
    cars_out = os.path.join(opts.output, "cars")
    parts_out = os.path.join(opts.output, "parts")
    os.makedirs(cars_out,  exist_ok=True)
    os.makedirs(parts_out, exist_ok=True)

    CAR_SLUGS = {
        "Phantom":  "phantom-001",
        "Specter":  "specter-042",
        "Ghost":    "ghost-108",
        "Wraith":   "wraith-217",
        "Banshee":  "banshee-333",
        "Revenant": "revenant-512",
    }

    converted = 0
    for root, dirs, files in os.walk(opts.input):
        for fname in files:
            if not fname.lower().endswith(".fbx"):
                continue
            stem = os.path.splitext(fname)[0]
            src  = os.path.join(root, fname)

            if stem in CAR_SLUGS:
                out_path = os.path.join(cars_out, CAR_SLUGS[stem] + ".glb")
            else:
                out_path = os.path.join(parts_out, stem.lower().replace(" ", "-") + ".glb")

            bpy.ops.object.select_all(action='SELECT')
            bpy.ops.object.delete()
            bpy.ops.import_scene.fbx(filepath=src)

            bpy.ops.export_scene.gltf(
                filepath=out_path,
                export_format='GLB',
                export_apply=True,
                export_yup=True,
                export_cameras=False,
                export_lights=False,
            )
            print(f"  ✓ {fname}  →  {out_path}")
            converted += 1

    print(f"\nConverted {converted} FBX files.")
    return True

def print_command():
    parser = argparse.ArgumentParser(description="Print the Blender command to convert FBX → GLB")
    parser.add_argument("--input",         required=True, help="Path to FBX asset directory")
    parser.add_argument("--output",        default="web/public/models", help="Output directory")
    parser.add_argument("--print-command", action="store_true")
    opts = parser.parse_args()

    script = os.path.abspath(__file__)
    cmd = (
        f"blender --background --python {script} -- "
        f"--input {opts.input} --output {opts.output}"
    )
    print("\n── Run this to convert FBX → GLB ──────────────────────────────")
    print(cmd)
    print("───────────────────────────────────────────────────────────────\n")
    print("Blender is NOT installed in this environment.")
    print("Install from: https://www.blender.org/download/")
    print("Required version: 3.x or later")
    print(f"\nAfter running, GLB files will be in:")
    print(f"  {opts.output}/cars/   — car models")
    print(f"  {opts.output}/parts/  — upgrade parts")

if __name__ == "__main__":
    if not run_in_blender():
        print_command()
