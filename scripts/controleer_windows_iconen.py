"""Vergelijk echte PE-icoonresources met de goedgekeurde ICO, ook na ondertekenen."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[1]


def frames(data):
    if data.startswith(b"\x00\x00\x01\x00"):
        aantal = struct.unpack_from("<H", data, 4)[0]
        resultaat = []
        for i in range(aantal):
            lengte, begin = struct.unpack_from("<II", data, 6 + 16 * i + 8)
            if begin + lengte > len(data):
                raise ValueError("Onvolledig ICO-frame.")
            resultaat.append(data[begin:begin + lengte])
        return resultaat
    return [data]


def controleer_iconen(programma, bestand, archief=None):
    studios = json.loads((REPO / "assets/studios.json").read_text(encoding="utf-8"))
    studio = next(s for s in studios if s["programma"] == programma)
    if not studio.get("beeldmerk"):
        return None  # De afzonderlijke Database-identiteit heeft geen bron uit deze ronde.
    ico = REPO / f"src-tauri/icons/{studio['sleutel']}/icon.ico"
    hashes = lambda delen: sorted(hashlib.sha256(d).hexdigest() for d in delen)
    verwacht = hashes(frames(ico.read_bytes()))
    archief = archief or shutil.which("7z") or shutil.which("7z.exe")
    if not archief:
        kandidaat = Path("C:/Program Files/7-Zip/7z.exe")
        archief = str(kandidaat) if kandidaat.is_file() else None
    if not archief:
        raise ValueError("7-Zip is nodig om de echte Windows-icoonresources te controleren.")
    with tempfile.TemporaryDirectory(prefix="windows-icoon-") as tijdelijk:
        r = subprocess.run(
            [str(archief), "x", "-tPE", "-y", f"-o{tijdelijk}", str(Path(bestand).resolve()), ".rsrc/ICON/*"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
        )
        # Een PE-overlay kan een waarschuwing geven; alle verwachte frames moeten alsnog exact kloppen.
        if r.returncode not in (0, 1):
            raise ValueError(f"PE-icoonresources niet leesbaar: {Path(bestand).name}\n{r.stderr}")
        gevonden = []
        for pad in (Path(tijdelijk) / ".rsrc/ICON").glob("*"):
            if pad.is_file():
                gevonden.extend(frames(pad.read_bytes()))
        if hashes(gevonden) != verwacht:
            raise ValueError(f"Windows-icoon wijkt af van de goedgekeurde {studio['naam']}-ICO: {Path(bestand).name}")
    return {"programma": programma, "bestand": Path(bestand).name, "framesBytegelijk": len(verwacht), "sha256": verwacht}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bestand", type=Path)
    parser.add_argument("--programma", default="open-office-studio")
    args = parser.parse_args()
    resultaat = controleer_iconen(args.programma, args.bestand)
    print(json.dumps(resultaat, ensure_ascii=False))
