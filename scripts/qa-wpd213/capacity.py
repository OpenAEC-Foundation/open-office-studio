"""Read-only P5 Linux queue guard before dispatch and before runtime use."""
import json
import re
import subprocess

from oracle import OUT, write_json


def gh(path):
    return json.loads(subprocess.check_output(["gh", "api", "repos/OpenAEC-Foundation/open-office-studio/" + path], text=True, encoding="utf-8"))


def main():
    runs = []
    for status in ("queued", "in_progress", "waiting"):
        runs.extend(gh("actions/runs?status=" + status + "&per_page=100")["workflow_runs"])
    checked, blockers = [], []
    for run in runs:
        name, branch = run["name"], run["head_branch"] or ""
        if not re.search(r"P5|linux|suite|desktop|final|release|native", name + " " + branch, re.I):
            continue
        if "wpd213-qa-2026-11-24-e0d7" in branch:
            continue
        jobs = gh("actions/runs/" + str(run["id"]) + "/jobs?per_page=100")["jobs"]
        for job in jobs:
            labels = job.get("labels", [])
            linux = any(re.search(r"ubuntu|linux", label, re.I) for label in labels)
            item = {"run": run["id"], "workflow": name, "branch": branch, "job": job["id"],
                    "name": job["name"], "status": job["status"], "labels": labels, "linux": linux}
            checked.append(item)
            if job["status"] in ("queued", "waiting", "pending") and (linux or not labels):
                blockers.append(item)
    report = {"method": "Read-only queued/in_progress/waiting critical release workflow jobs and actual runner labels; unknown queued runner labels conservatively block",
              "checked": checked, "blockers": blockers, "noCriticalP5LinuxJobQueued": not blockers,
              "mutationsOrCancellations": False}
    write_json(OUT / "capacity-report.json", report)
    print(json.dumps(report))
    if blockers:
        raise SystemExit("P5 Linux queue takes priority; WPD213 runtime not started")


if __name__ == "__main__":
    main()
