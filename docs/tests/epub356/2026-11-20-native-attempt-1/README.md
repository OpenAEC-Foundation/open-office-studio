# First I2 native attempt: blocked before saving

Native CI run `44710786878`, harness
`7704aae78b70013218934d57285fa0e3737735e6`, used application I2
`5acab18c516e1fb07118cb41f807a3c0e05182bf` and the verified canonical
desktop run `44704167183`. All three native jobs were **blocked before a real
filesystem save, saved-file oracle or new-process reopening**. Linux DEB was
not attempted after AppImage blocked. These are diagnostics, not acceptance.

`hashes.json` maps all 27 original PNG/JSON files and their original hash
manifest to byte-identical tracked copies. Text conversion is disabled. The
original local/CI paths inside copied JSON remain unchanged. All twelve
original PNGs were individually viewed in sequence by the parent reviewer.

- Windows: the untouched ready image shows both chapter headings, body, list,
  image and Hout/42 table. The custom Save As image shows the runtime/source
  panel and DOCX selected. The actual native Save dialog has a selected
  `leesvolgorde` filename. The helper could not uniquely resolve its old
  Edit/name/id selector. No native save was invoked.
- macOS: the untouched ready image shows the same book content. The
  before-folder image shows the actual native Save sheet. The blocked and
  `native-interface.png` images show the real Go-to-Folder sheet, with a
  focused path field and Close, but no Go button. The latter image is therefore
  not an image of the custom runtime/source panel. The helper's required Go
  button prevented path entry and saving. Native Accessibility was trusted;
  no permission changes were attempted.
- Linux AppImage: the untouched WebKit and X11 ready images show the book
  content; the early style gallery is still loading. The custom Save As image
  shows the runtime/source panel and DOCX selected. The later OS-save image
  contains no native chooser. The CI log separately reports that portal GTK
  could not open a display: D-Bus was started outside Xvfb and lacked DISPLAY.
  Strict chooser ownership was retained.

The reports preserve original EPUB hashes and cleanup results. Owned app
process closure was reported on each failed platform, and Linux driver cleanup
completed; failed temporary test data was retained for diagnosis on disposable
CI hosts. This is not proof that native save/reopen works or that every possible
helper resource was independently inspected after host teardown. No local app,
preview, Computer Use or recording session was started by these CI tests.

The bounded retry changes are test-only: exact focused native filename value
and owned-dialog ancestry on Windows; Xvfb before D-Bus on Linux; owned PID,
native nested-sheet ancestry and exact path readback before a normal Return
confirmation on buttonless macOS Go-to-Folder. The ordinary native Save action
remains required. Apple's [Go to Folder instructions](https://support.apple.com/en-gb/guide/mac-help/mchlp1236/mac)
describe confirming a pathname with Return. Actual Swift compilation and this
OS shape still require the retry; no pass is inferred from this reference.

Retry preparation `fda2b57c82a211262c44adf171ecdea365019942` passed eight
Node artifact/source contracts, Python AST, PowerShell AST and diff checks.
Parent reviewed the changes before attempt 2 was activated as
`5f4cc24a67a539cb68104f2ec8ce6d5803c27106`, native CI `44712664526`.
Application I2 and canonical installer manifest values are unchanged.
