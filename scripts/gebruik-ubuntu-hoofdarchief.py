"""Vervang de trage Ubuntu-spiegel in de pakketbronnen van een CI-runner."""
from pathlib import Path
import re
import sys


SPIEGEL = re.compile(
    r"(?<![A-Za-z0-9_/.:@-])https?://azure\.archive\.ubuntu\.com/ubuntu(?=[/\s]|$)",
    re.IGNORECASE,
)


def herschrijf_bronnen(tekst):
    regels = []
    for regel in tekst.splitlines(keepends=True):
        actief, scheiding, commentaar = regel.partition("#")
        regels.append(SPIEGEL.sub("https://archive.ubuntu.com/ubuntu", actief)
                      + scheiding + commentaar)
    return "".join(regels)


def gebruik_hoofdarchief(map):
    bestanden = [map / "sources.list"]
    for patroon in ["*.list", "*.sources"]:
        bestanden.extend(sorted((map / "sources.list.d").glob(patroon)))
    gewijzigd = []
    for pad in bestanden:
        if not pad.is_file():
            continue
        bron = pad.read_bytes()
        nieuw = herschrijf_bronnen(bron.decode("utf-8")).encode("utf-8")
        if nieuw != bron:
            pad.write_bytes(nieuw)
            gewijzigd.append(str(pad.relative_to(map)))
    return gewijzigd


if __name__ == "__main__":
    if len(sys.argv) != 2 or not Path(sys.argv[1]).is_dir():
        raise SystemExit("Gebruik: python gebruik-ubuntu-hoofdarchief.py <APT-bronnenmap>")
    gewijzigd = gebruik_hoofdarchief(Path(sys.argv[1]))
    print(f"Ubuntu-pakketbronnen aangepast: {len(gewijzigd)}.")
    for pad in gewijzigd:
        print(pad)
