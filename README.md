**English** · [Nederlands](README.nl.md)

<div align="center">

# Open Office Studio

**An open-source office suite from the OpenAEC Foundation: documents, spreadsheets, presentations, notes, Access databases and email in one desktop app.**

[![License: Apache-2.0](https://img.shields.io/github/license/OpenAEC-Foundation/open-office-studio)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/OpenAEC-Foundation/open-office-studio?include_prereleases&label=release)](https://github.com/OpenAEC-Foundation/open-office-studio/releases)
[![CI](https://github.com/OpenAEC-Foundation/open-office-studio/actions/workflows/desktop.yml/badge.svg)](https://github.com/OpenAEC-Foundation/open-office-studio/actions/workflows/desktop.yml)

### [Download](https://github.com/OpenAEC-Foundation/open-office-studio/releases) &nbsp;·&nbsp; [Build from source](#build-from-source) &nbsp;·&nbsp; [Documentation](#documentation)

![Open Office Studio: a Word document with the ribbon, rulers and live spell checking](docs/screenshots/readme-writer-2026-W44.5.jpg)

</div>

Open Office Studio is a local office environment for Windows, macOS and Linux. It opens and saves Word, Excel and PowerPoint files directly, opens old Microsoft Access databases as an editable copy, and includes a notes module and an email client. Everything runs on your own computer; there is no account and no cloud service.

> **Status:** Open Office Studio is under active development. Releases are published as *pre-releases* (development builds). Test it with copies of your files before relying on it. The user interface is currently in Dutch; support for more languages, starting with English, is being worked on.

## Screenshots

| | | |
|---|---|---|
| ![Spreadsheet with a bar chart next to the data](docs/screenshots/readme-spreadsheet-chart-2026-W44.5.jpg) **Spreadsheet with an inserted chart** | ![Database Studio showing a table in the SQLite working copy](docs/screenshots/readme-database-2026-W44.5.jpg) **Database Studio: a table in the working copy** | ![Email Studio with a message and an XLSX attachment](docs/screenshots/readme-email-2026-W44.5.jpg) **Email Studio (browser demo mailbox)** |

All screenshots show version 2026-W44.5 in a local production build, with the project's own sample files and fictitious data. More images are in [docs/screenshots](docs/screenshots/README.md).

## What's inside

### Writer (Open Tekst Studio)
- Edits DOCX directly, with a page view, rulers, a ribbon and keyboard shortcuts that follow common office suites.
- Paragraph and character formatting, styles with a style editor, lists, borders and shading, tables and images.
- Headers and footers, page numbers, sections and columns, a table of contents, footnotes and endnotes, watermarks.
- Comments, track changes, and comparing two versions of a document.
- Find and replace, Go to, word count, document properties and a reading mode.

### Spreadsheet (Open Rekenblad Studio)
- Edits XLSX directly: formulas, cell formatting, rows, columns and sheets, sorting, fill, AutoSum, freeze panes, find and replace.
- Dutch-style input such as `1,5`, `12,5%`, `€ 1.234,50` and `26-10-2026` is recognised as a number or date.
- CSV/TSV import and export.

### Presentation (Open Presentatie Studio)
- Edits PPTX directly: slides, shapes, text, alignment, speaker notes, and a slideshow from the first or current slide.

### Notes (Open Notities Studio)
- Notebooks, sections and pages, saved locally and automatically, with backups.
- Each section is either a free canvas with text boxes you place yourself, or a Markdown page with source editor, live preview, tables and task lists. Markdown import and export. See [docs/notities.md](docs/notities.md).

### Database Studio (Open Database Studio)
- Opens Microsoft Access **MDB and ACCDB** files without Access. After a read-only analysis it builds an editable **SQLite working copy**; the original file is never modified.
- Tables (grid and design view), saved queries and an Access-SQL editor, simple forms and reports, and a compatibility report per file.
- **VBA** runs in its own sandboxed interpreter with a DAO subset, only after you give explicit permission. Nothing runs automatically (no AutoExec). Access form designs and macros are inventoried, not executed.
- Save the working copy as `.sqlite`; export tables and query results as CSV, source as SQL or BAS, reports as JSON or text.
- Available inside the suite and as a separate desktop app. See [apps/database-studio](apps/database-studio/README.md) and [packages/vba](packages/vba/README.md).

### Email Studio
- A standalone IMAP/SMTP email client: folders, search, reply, reply all, forward, drafts and attachments.
- When you add an account, it suggests server settings from a built-in provider list, your domain's autoconfig, DNS (SRV/MX) and a connection test. Looking up Mozilla's Thunderbird database is optional and off by default.
- Sign in with **Microsoft or Google via OAuth2** (PKCE, system browser). This needs an OAuth client ID that you configure yourself; see [docs/email-oauth.md](docs/email-oauth.md).
- Attachment previews; Office attachments open as an editable copy in Writer, Spreadsheet or Presentation, MDB/ACCDB in Database Studio. **Send as attachment** from any open document.
- HTML mail is shown sanitised in a sandboxed frame; external images are blocked until you allow them.

### Across the suite
- **Document tabs** in one window; on the desktop you can drag a tab out into its own window.
- **Save As** in about fifteen formats per module. The app itself writes DOCX/XLSX/PPTX, the macro-enabled variants (for files opened as such), Markdown, CSV/TSV, HTML, PNG and **PDF**. OpenDocument (ODT/ODS/ODP), older Office formats (DOC/XLS/PPT), templates, RTF and EPUB use an installed **LibreOffice**, which the desktop app finds by itself and runs with macros disabled. LibreOffice is not bundled. See [docs/formaten.md](docs/formaten.md).
- **Charts** (eleven types) can be inserted and edited in documents, spreadsheets and presentations.
- **Spell checking** for Dutch, English (UK) and English (US) with Hunspell dictionaries, wavy underlines, suggestions, an F7 dialog and autocorrect.
- Print preview, document zoom, a collapsible ribbon, light and dark app themes, recent files and automatic crash recovery.
- On Windows the installer registers Open Office Studio for Office, OpenDocument, RTF and MDB/ACCDB files (it shows up under *Open with* and *Default apps*).

What works per file format, and what does not, is documented in [docs/formaten.md](docs/formaten.md) and the test reports in [docs/tests](docs/tests).

## Download and install

Download the files from the [releases page](https://github.com/OpenAEC-Foundation/open-office-studio/releases). `VERSION` below is the release version, for example `2026.44.0`.

| System | File | Notes |
|---|---|---|
| Windows 10/11, x64 | `Open.Office.Studio_VERSION_x64-setup.exe` | Code-signed (Authenticode, via Azure Artifact Signing) with a timestamp. Includes the WebView2 bootstrapper. |
| macOS, Apple Silicon | `Open.Office.Studio_VERSION_aarch64.dmg` | Signed with a Developer ID and notarised by Apple. Open the DMG and drag the app to *Applications*. |
| Linux x64 (Debian, Ubuntu) | `Open.Office.Studio_VERSION_amd64.deb` | `sudo apt install ./Open.Office.Studio_VERSION_amd64.deb` |
| Linux x64 (any distribution) | `Open.Office.Studio_VERSION_amd64.AppImage` | `chmod +x` the file and start it. |
| All | `SHA256SUMS`, `pakketcontrole-*.json` | Checksums and the package-check reports of the build. |

The release workflow can also build the standalone Open Database Studio; when a release contains it, its installers are listed next to the Office Studio files. No RPM package is published. You can build one yourself, see [Build from source](#build-from-source).

### Check your download

From the folder where you saved the files:

```bash
sha256sum --ignore-missing -c SHA256SUMS                  # Linux
shasum -a 256 Open.Office.Studio_VERSION_aarch64.dmg      # macOS: compare with the line in SHA256SUMS
```

```powershell
Get-FileHash .\Open.Office.Studio_VERSION_x64-setup.exe -Algorithm SHA256   # Windows: compare with SHA256SUMS
```

### Linux: media support

The Linux app uses WebKitGTK, which plays audio and video through GStreamer. If the app reports that media cannot be played, install the base and good plugin sets, for example on Debian/Ubuntu:

```bash
sudo apt install gstreamer1.0-plugins-base gstreamer1.0-plugins-good
```

### Optional: LibreOffice for more formats

DOCX, XLSX and PPTX need nothing else. For OpenDocument and older Office formats, install [LibreOffice](https://www.libreoffice.org/). The desktop app looks in the standard install locations, or you can choose the program under *Save As*. See [docs/formaten.md](docs/formaten.md#kantoorruntime-conversieprogramma).

## Build from source

### Requirements

- **Node.js 22** (the version used in CI) and **pnpm 11.25.0** (pinned in `package.json`; `corepack enable` picks it up).
- **Rust** (stable) with Cargo, plus the WebAssembly target for the spell checker:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- The **Tauri 2 system dependencies** for your platform: see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). On Debian/Ubuntu, CI installs:
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
  ```
- **Python 3.10 or newer** for the Python checks (no extra packages).
- Network access to GitHub on the first build (see below).

### Commands

```bash
pnpm install --frozen-lockfile
pnpm dev               # browser version at http://127.0.0.1:1420 (email uses a demo mailbox)
pnpm desktop:dev       # desktop app with Tauri
pnpm build             # type check and production build
pnpm desktop:build     # native package for the current platform
```

On Linux, `pnpm desktop:build` builds every Tauri bundle type, including DEB, AppImage and RPM. The RPM is not tested in CI.

The standalone database app: `pnpm database:dev`, `pnpm database:build`, `pnpm database:desktop:build`.

### Tests

```bash
pnpm test                                     # unit tests (Vitest)
pnpm test:engines                             # open, edit, save and reopen with the real engines
python3 -m unittest discover -s tests -v      # package, format and association checks
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path apps/database-studio/src-tauri/Cargo.toml
```

### Fonts, dictionaries and the spell checker

Extra open fonts and the Hunspell dictionaries are **not stored in Git**. Before `pnpm dev` and `pnpm build`, `scripts/kopieer-assets.mjs` downloads them from pinned commits listed in [`assets/lettertypen.json`](assets/lettertypen.json) and [`assets/woordenboeken.json`](assets/woordenboeken.json), checks their SHA-256 and caches them in `.local/`. The spell-checker module is built with Cargo to WebAssembly and cached in `.local/spelling-wasm/`. Their licence texts are copied into the app. `pnpm dev` continues with a warning if something is missing; `pnpm build` stops.

### Version scheme

Versions follow the OpenAEC weekly scheme `YYYY.WW.N`: year, ISO week and sequence number in that week (shown in the app as `2026-W44.5`).

```bash
pnpm versie:week 2026-10-28 1   # set the version in all manifests for a date and sequence number
pnpm versie:check               # check that all version files agree
```

A tag `v<version>` starts [`release.yml`](.github/workflows/release.yml): it runs the same checks as CI, signs the Windows and macOS packages, checks the signatures, and creates a draft pre-release with `SHA256SUMS`. See [docs/versies.md](docs/versies.md).

## Project structure

```
src/                   React app: shell, ribbons, editors, Save As, charts, spelling, notes, print
src-tauri/             Rust desktop shell: file access, conversion, email backend, windows, recovery
packages/database/     MDB/ACCDB reader and SQLite working copy
packages/vba/          VBA interpreter with DAO subset
packages/email/        Email Studio interface and HTML sanitiser
apps/database-studio/  Standalone Open Database Studio
scripts/               Build, release and test scripts
tests/                 Python checks
docs/                  Formats, versions, design, research and test reports (mostly in Dutch)
assets/                Manifests for fonts and dictionaries
```

The document, spreadsheet and presentation engines come from the [`@betteroffice`](https://betteroffice.dev/) packages (Apache-2.0). The desktop app is built with [Tauri 2](https://tauri.app/); the interface uses React 19 and TypeScript.

## Privacy and security

- **No telemetry.** The app contains no analytics or tracking code and does not check for updates by itself.
- Your files stay on your computer. Network connections are made only for things you set up: your mail servers, OAuth sign-in, the mail server lookup (and the Thunderbird database only if you turn it on), and external images in an email after you allow them.
- **Passwords and OAuth refresh tokens** are stored in the operating system's keychain (Windows Credential Manager, macOS Keychain, Secret Service on Linux), not in plain files.
- **VBA** from Access databases runs only after explicit permission, in a sandboxed interpreter without COM, Windows APIs or file access; nothing runs automatically.
- LibreOffice conversions use a fresh profile with macros disabled, a time limit and a size limit.
- The original MDB/ACCDB file is never written to.

## Contributing

- Report bugs and request features in [GitHub Issues](https://github.com/OpenAEC-Foundation/open-office-studio/issues). Attach a sample file when you can, with confidential content removed.
- Pull requests go to `main`. Run `pnpm test`, the Python checks and `cargo test` before you open one, and keep the version files consistent (`pnpm versie:check`).
- Code, commit messages and most documentation are currently in Dutch. Only add test files that you created yourself or that have a clear open licence.

## Documentation

- [File formats, Save As and limits](docs/formaten.md)
- [Weekly versions](docs/versies.md)
- [Email OAuth2 setup](docs/email-oauth.md)
- [Notes](docs/notities.md)
- [OpenAEC style guide](docs/ontwerp/openaec-stijl.md)
- [Test reports](docs/tests) and [research](docs/onderzoek/README.md)

## License

Open Office Studio is licensed under the [Apache License 2.0](LICENSE).

Third-party components keep their own licences. Fonts, dictionaries and npm dependencies ship their licence texts inside the app (`public/licenses/`, generated at build time). The sources and licences of the spell-checker parts are listed in [docs/licenties/spelling.md](docs/licenties/spelling.md); further licence records are in [docs/licenties](docs/licenties).

Microsoft Word, Excel, PowerPoint and Access are trademarks of Microsoft Corporation. Open Office Studio is an independent project and is not affiliated with Microsoft; these names are used only to describe file compatibility.

## Part of the OpenAEC Foundation

Open Office Studio is part of the [OpenAEC Foundation](https://open-aec.com), which develops open-source software for the construction industry. See the other projects on [GitHub](https://github.com/OpenAEC-Foundation).
