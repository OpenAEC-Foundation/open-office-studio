# Standalone Email: Linux P5 native acceptance

Both canonical P5 standalone installers passed on a fresh Ubuntu 22.04 CI host,
without the Office suite or a suite profile. Source is
`b696ab86bd1c128729a079b68c0082e6df3d36a5`, tree
`e30879fd772871e690847c061ef66e6b81808a05`, version `2026.48.1`.
Native run [45193219423](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45193219423)
used QA `005239a1aec9d031880613bc0495b95977b6deb3` and the unchanged own-app
input artifact `14824383776` from preparation `45188332685`.

| Package | SHA256 | Cold process restart | Result |
| --- | --- | --- | --- |
| AppImage | `3819c9a347521d814c95729de6c72f3874552b79e6597fa81c2d8ca5c468d2d4` | 4659 → 4830 | PASS |
| DEB | `b3109098a9a78766bb3090badaf4fc1f51454f8e69f6d3730709b667319a9df5` | 5150 → 5285 | PASS |

Actual native Ctrl+S in the composer produced exactly one 805-byte IMAP APPEND.
An independent MIME parser verified the subject `STANDALONE_EMAIL_SAVED`,
multipart alternatives, and `Synthetic local draft body, never sent.` with no
parser defects. Full application exit and a new PID retrieved the same bytes
through IMAP UID FETCH without another APPEND. Both reopened native GDK PNGs
were visually reviewed: the message subject and body are visible. The real OS
Secret Service credential roundtrip, own identity `org.openaec.email-studio`,
running ELF equality and separate persistent profile are recorded in the raw
reports. Owned app, driver, keyring and temporary profiles were cleaned up.

The preceding run `45190082427` remains a failed QA receipt. A textual QA copy
had accidentally changed the synthetic protocol greeting and CAPABILITY from
`IMAP4rev1` to `IMAP5rev1`; folders did not load and Ctrl+S reported no Drafts
folder. QA correction `0d2ca447` restores IMAP4, guards both protocol strings,
and waits for the actual public Drafts folder before composing. Product source
and package bytes did not change. The original failed raw reports remain here.
The same QA commit corrects only the calculated comma-delimited DEB dependency
observation; it does not install a hidden helper or change package policy.

This proves the synthetic local draft flow, not SMTP sending, real providers,
all MIME variants, or all account configurations. AppImage ran with its supported
FUSE-free extraction route. GTK/WebKitGTK and Secret Service are external OS
requirements. DEB zenity is declared and resolved by normal APT; the Email core
scenario does not exercise a native format-confirmation dialog. No signature
certification, main merge, release tag or publication is claimed.

[receipt.json](linux-email-p5-proof/receipt.json) binds the official proof artifact
`14827246109` (955980 bytes, whole ZIP SHA256
`6b02f8e9d7dcbc9a6ba6d235479e70130948baa6cde2a0ecff9c3621d6eaa0c1`),
the package hashes, exact reports, synthetic MIME bytes, original failures and
native screenshots. Raw reports are deterministic gzip copies, without edits.
