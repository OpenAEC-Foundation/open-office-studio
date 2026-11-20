"""Extract only a verified root artifact, with bounded archive paths/sizes."""
from pathlib import Path
import stat
import sys
import zipfile


def extract(archive, destination):
    destination = Path(destination).resolve()
    destination.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        assert len(entries) <= 10000
        assert sum(e.file_size for e in entries) <= 4 * 1024 ** 3
        names = set()
        for entry in entries:
            name = entry.filename
            assert name and name not in names
            names.add(name)
            assert not name.startswith("/") and "\\" not in name and ":" not in name
            assert not any(p in (".", "..") for p in name.split("/"))
            assert not stat.S_ISLNK(entry.external_attr >> 16)
            assert (destination / name).resolve().is_relative_to(destination)
        z.extractall(destination)


if __name__ == "__main__":
    extract(sys.argv[1], sys.argv[2])
