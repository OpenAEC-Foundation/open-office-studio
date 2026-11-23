# P4 Linux DEB resolver recheck

The original Desktop Linux job 137683860055 failed before app startup because `dpkg --install` did not resolve the declared Zenity dependency. Two separate CI-only commits replace the two real DEB installer calls with `apt-get install -y --no-install-recommends` and preserve existing checks. No product runtime or package bytes changed.

Independent run [45177760596](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45177760596) uses the exact checked P4 DEB, original report and external QA commit. Official ZIP digests, source, job/attempt and build/check/upload-before-failure timing were verified before execution. Zenity was absent before installation and installed by the DEB dependency resolver. The four preserved Writer smoke checks passed. The saved DOCX independently contains exactly one marker and the original text.

Both original PNGs were reviewed serially. `saved.png` retains a dirty dot at capture time; `reopened-find.png` shows a clean reopened document with one marker match. Filesystem persistence and full process exit/reopen passed. This bounded recheck does not certify clean-indicator timing, the bundled-runtime route, AppImage, the complete native acceptance matrix, or a later candidate. The original failed report remains unchanged.

See `receipt.json` for exact provenance, hashes, cleanup and limits.
