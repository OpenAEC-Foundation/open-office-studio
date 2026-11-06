"""Bestaande ingang voor de gezamenlijke, gecontroleerde iconenpipeline."""
import os
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
node = os.environ.get("OOS_NODE") or shutil.which("node")
if not node:
    raise SystemExit("Node ontbreekt; activeer de Node-omgeving van deze repository.")
subprocess.run([node, str(root / "scripts/maak-studio-iconen.mjs")], cwd=root, check=True)
