"""Read-only signed/notarized bundle checks, matching the release workflow."""
import hashlib
import json
from pathlib import Path
import subprocess


def verify_signed_bundle(app, out, evidence, runner=subprocess.run):
    out = Path(out); out.mkdir(parents=True, exist_ok=False)
    evidence.update(status="running", app=str(app), checks=[], appModified=False,
                    policy="codesign strict verification, Developer ID identity, Gatekeeper notarization and stapled ticket before launch")
    try:
        commands = [
            ("codesign-verify", ["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app)]),
            ("codesign-display", ["codesign", "--display", "--verbose=4", str(app)]),
            ("gatekeeper", ["spctl", "--assess", "--type", "execute", "--verbose=4", str(app)]),
            ("stapled-ticket", ["xcrun", "stapler", "validate", str(app)])]
        outputs = {}
        for name, command in commands:
            result = runner(command, capture_output=True, text=True, timeout=120)
            content = result.stdout + result.stderr
            path = out/(name+".log"); path.write_text(content, encoding="utf-8")
            evidence["checks"].append({"name": name, "command": command, "returncode": result.returncode,
                                       "log": str(path), "logSha256": hashlib.sha256(path.read_bytes()).hexdigest()})
            if result.returncode != 0:
                raise RuntimeError("Signed bundle preflight failed: "+name)
            outputs[name] = content
        detail = outputs["codesign-display"].splitlines()
        identifier = [line.removeprefix("Identifier=") for line in detail if line.startswith("Identifier=")]
        team = [line.removeprefix("TeamIdentifier=") for line in detail if line.startswith("TeamIdentifier=")]
        authorities = [line.removeprefix("Authority=") for line in detail if line.startswith("Authority=")]
        if (identifier != ["org.openaec.office-studio"] or len(team) != 1 or team[0] in ["", "not set", "Not Set"]
                or not any(value.startswith("Developer ID Application: ") for value in authorities)):
            raise RuntimeError("Expected Suite Developer ID identity, not an ad-hoc or unrelated signature")
        if "source=Notarized Developer ID" not in outputs["gatekeeper"].splitlines():
            raise RuntimeError("Gatekeeper did not independently identify a notarized Developer ID app")
        evidence.update(status="passed", identifier=identifier[0], teamIdentifier=team[0], authorities=authorities)
        return evidence
    except Exception as error:
        evidence.update(status="failed", error=str(error))
        raise
    finally:
        (out/"report.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
