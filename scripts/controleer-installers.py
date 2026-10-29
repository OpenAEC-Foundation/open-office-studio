"""Controleer de werkelijk gebouwde Windows- en Linux-pakketten, zonder installatie."""
import argparse
import configparser
import hashlib
import json
from pathlib import Path
import shutil
import stat
import struct
import subprocess
import tempfile


def eis(voorwaarde, melding):
    if not voorwaarde:
        raise ValueError(melding)


def opdracht(*argumenten):
    resultaat = subprocess.run(
        [str(a) for a in argumenten], capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=120,
    )
    eis(resultaat.returncode == 0,
        f"Pakketcontrole mislukt: {argumenten[0]}\n{resultaat.stdout[-3000:]}\n{resultaat.stderr[-3000:]}")
    return resultaat.stdout


def een(bestanden, omschrijving):
    bestanden = list(bestanden)
    eis(len(bestanden) == 1, f"Verwacht precies één {omschrijving}; gevonden: {len(bestanden)}.")
    return bestanden[0]


def pe_x64(pad):
    with pad.open("rb") as bestand:
        kop = bestand.read(64)
        eis(kop[:2] == b"MZ" and len(kop) == 64, f"Geen uitvoerbaar bestand: {pad.name}.")
        positie = struct.unpack_from("<I", kop, 0x3c)[0]
        bestand.seek(positie)
        kop = bestand.read(26)
    eis(len(kop) == 26 and kop[:4] == b"PE\0\0", f"Geen PE-bestand: {pad.name}.")
    eis(struct.unpack_from("<H", kop, 4)[0] == 0x8664,
        f"{pad.name} heeft niet de vereiste x64-architectuur.")
    eis(struct.unpack_from("<H", kop, 24)[0] == 0x20b,
        f"{pad.name} is geen 64-bits PE-bestand.")


def elf_x64(pad):
    with pad.open("rb") as bestand:
        kop = bestand.read(64)
    eis(len(kop) == 64 and kop[:6] == b"\x7fELF\x02\x01",
        f"Geen 64-bits ELF-bestand: {pad.name}.")
    eis(struct.unpack_from("<H", kop, 18)[0] == 62,
        f"{pad.name} heeft niet de vereiste x64-architectuur.")
    eis(pad.stat().st_mode & stat.S_IXUSR, f"{pad.name} is niet uitvoerbaar.")
    afhankelijkheden = opdracht("ldd", pad)
    eis("not found" not in afhankelijkheden, f"Ontbrekende bibliotheken:\n{afhankelijkheden}")


def verwachte_mime_typen(programma):
    """MimeType-regel volgens tauri.linux.conf.json (alleen Office Studio koppelt bestanden)."""
    if programma != "open-office-studio":
        return None
    conf = json.loads(Path("src-tauri/tauri.linux.conf.json").read_text(encoding="utf-8"))
    return [k["mimeType"] for k in conf["bundle"]["fileAssociations"]]


def snelkoppeling(pad, wortel, programma="open-office-studio"):
    configuratie = configparser.ConfigParser(interpolation=None)
    configuratie.optionxform = str
    configuratie.read(pad, encoding="utf-8")
    gegevens = configuratie["Desktop Entry"]
    eis(gegevens.get("Type") == "Application", "De Linux-snelkoppeling is geen toepassing.")
    mime = verwachte_mime_typen(programma)
    # Gekoppelde bestanden komen als losse argumenten binnen (%F), ook met spaties in het pad.
    exec_verwacht = f"{programma} %F" if mime else programma
    eis(gegevens.get("Exec") == exec_verwacht,
        f"De Linux-snelkoppeling start het verkeerde programma: {gegevens.get('Exec')!r}, verwacht {exec_verwacht!r}.")
    if mime:
        gevonden = [m for m in gegevens.get("MimeType", "").split(";") if m]
        eis(sorted(gevonden) == sorted(mime),
            f"MimeType in de Linux-snelkoppeling wijkt af van tauri.linux.conf.json: {gevonden}.")
    eis(gegevens.get("Icon") == programma, "De Linux-snelkoppeling verwijst naar het verkeerde pictogram.")
    eis(any((wortel / "usr/share/icons").rglob(f"{programma}.png")),
        "Het pictogram bij de Linux-snelkoppeling ontbreekt.")


def windows(pakket, map, programmanaam="open-office-studio"):
    archief = shutil.which("7z") or shutil.which("7z.exe")
    if not archief:
        kandidaat = Path("C:/Program Files/7-Zip/7z.exe")
        archief = str(kandidaat) if kandidaat.is_file() else None
    eis(archief, "7-Zip is nodig voor de Windows-pakketcontrole.")
    opdracht(archief, "t", pakket)
    opdracht(archief, "x", "-y", f"-o{map}", pakket)
    programma = een(map.rglob(f"{programmanaam}.exe"), "Windows-programma")
    loader = een(map.rglob("WebView2Loader.dll"), "WebView2-loader")
    pe_x64(programma)
    pe_x64(loader)
    bootstrapper = een(map.rglob("*Webview2Setup.exe"), "WebView2-bootstrapper")
    eis(bootstrapper.stat().st_size > 1_000_000, "De WebView2-bootstrapper is onvolledig.")
    with bootstrapper.open("rb") as bestand:
        eis(bestand.read(2) == b"MZ", "De WebView2-bootstrapper is geen uitvoerbaar bestand.")
    return ["NSIS-archief leesbaar", "programma en WebView2-loader x64", "WebView2-bootstrapper aanwezig"]


def deb(pakket, map, versie, programma="open-office-studio"):
    for veld, verwacht in [("Package", programma), ("Version", versie), ("Architecture", "amd64")]:
        eis(opdracht("dpkg-deb", "--field", pakket, veld).strip() == verwacht,
            f"Verkeerde DEB-{veld}; verwacht {verwacht}.")
    afhankelijkheden = opdracht("dpkg-deb", "--field", pakket, "Depends")
    for bibliotheek in ("libwebkit2gtk-4.1-0", "libgtk-3-0"):
        eis(bibliotheek in afhankelijkheden, f"DEB-afhankelijkheid ontbreekt: {bibliotheek}.")
    opdracht("dpkg-deb", "--extract", pakket, map)
    elf_x64(map / f"usr/bin/{programma}")
    snelkoppeling(een((map / "usr/share/applications").glob("*.desktop"), "Linux-snelkoppeling"), map, programma)
    controles = ["DEB-versie en architectuur", "runtime-afhankelijkheden opgegeven", "ELF x64 en bibliotheken gevonden", "snelkoppeling en pictogram aanwezig"]
    if verwachte_mime_typen(programma):
        # De AppImage registreert zelf geen MIME-typen; het DEB-pakket installeert de ACCDB-aanvulling.
        eis((map / "usr/share/mime/packages/open-office-studio.xml").is_file(),
            "Het MIME-pakket (ACCDB) ontbreekt in het DEB-pakket.")
        controles.append("bestandskoppelingen (MimeType, Exec %F, MIME-pakket)")
    return controles


def appimage(pakket, map, programma="open-office-studio"):
    with pakket.open("rb") as bestand:
        kop = bestand.read(4 * 1024 * 1024)
    eis(kop[:4] == b"\x7fELF" and kop[8:11] == b"AI\x02", "Geen AppImage van type 2.")
    positie = 0
    while True:
        positie = kop.find(b"hsqs", positie)
        eis(positie >= 0, "Het SquashFS-bestandssysteem ontbreekt in de AppImage.")
        if positie + 32 <= len(kop) and struct.unpack_from("<HH", kop, positie + 28) == (4, 0):
            break
        positie += 4
    opdracht("unsquashfs", "-no-progress", "-no-xattrs", "-d", map, "-o", positie, pakket)
    eis((map / "AppRun").is_file(), "De AppImage-startfunctie ontbreekt.")
    eis((map / "AppRun").stat().st_mode & stat.S_IXUSR, "AppRun is niet uitvoerbaar.")
    elf_x64(map / f"usr/bin/{programma}")
    snelkoppeling(een(map.glob("*.desktop"), "AppImage-snelkoppeling"), map, programma)
    return ["AppImage type 2", "SquashFS volledig uitgepakt", "AppRun uitvoerbaar", "ELF x64 en bibliotheken gevonden", "snelkoppeling en pictogram aanwezig"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=["windows", "linux"], required=True)
    parser.add_argument("--programma", choices=["open-office-studio", "open-database-studio"], default="open-office-studio")
    parser.add_argument("--bundels", type=Path, default=Path("src-tauri/target/release/bundle"))
    parser.add_argument("--versie", default=json.loads(Path("package.json").read_text())["version"])
    parser.add_argument("--rapport", type=Path, required=True)
    opties = parser.parse_args()
    product = "Open*Database*Studio" if opties.programma == "open-database-studio" else "Open*Office*Studio"
    patronen = ([f"{product}_{opties.versie}_x64-setup.exe"] if opties.platform == "windows" else
                [f"{product}_{opties.versie}_amd64.deb", f"{product}_{opties.versie}_amd64.AppImage"])
    uitkomsten = []
    with tempfile.TemporaryDirectory(prefix="office-pakketcontrole-") as tijdelijk:
        for index, patroon in enumerate(patronen):
            pakket = een(opties.bundels.rglob(patroon), patroon).resolve()
            map = Path(tijdelijk) / str(index)
            if opties.platform == "windows":
                controles = windows(pakket, map, opties.programma)
            elif pakket.suffix == ".deb":
                controles = deb(pakket, map, opties.versie, opties.programma)
            else:
                controles = appimage(pakket, map, opties.programma)
            with pakket.open("rb") as bestand:
                checksum = hashlib.file_digest(bestand, "sha256").hexdigest()
            uitkomsten.append({"naam": pakket.name, "bytes": pakket.stat().st_size,
                               "sha256": checksum, "controles": controles})
            print(f"Gecontroleerd: {pakket.name}", flush=True)
    opties.rapport.parent.mkdir(parents=True, exist_ok=True)
    opties.rapport.write_text(json.dumps({"platform": opties.platform, "programma": opties.programma, "versie": opties.versie,
        "pakketten": uitkomsten, "installatie_en_native_bediening": "niet_gecontroleerd"},
        ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Pakketrapport: {opties.rapport}")


if __name__ == "__main__":
    main()
