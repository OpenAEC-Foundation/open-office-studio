# Windows native continuation for integration #382

PASS on application `727903cc7add7591444881cbe87620c9f8b78260`, tree `779f342af0146a9a5e7c941ce3665878c20af802`.

[Actual Windows native run 45401762056](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45401762056), attempt 1, job 138471887511, harness `664d86a1af1bdf4e6967e0ee1688c85345a9cf83`.

The already-built unsigned CI NSIS installer from desktop run 45388309036 / attempt 2 was reused, without rebuilding. Official artifact/archive, installer, independently extracted x64 PE, installed PE, version and application identity were checked. The installed payload SHA256 is `e010cde9aaa3cf1a21788a439c21dddddf91c5c14135cf0fca01f891ec6ae67e`.

Twelve native checks passed: a real 3x3 Writer document, keyboard edit, Undo/Redo, input-focus regressions, Ctrl+S, normal full application exit, new-process reopen and exact retained contents. PIDs 9824 and 5848 both exited normally with code 0. Native input used keyboard/pointer events through the actual installed WebView2; no editor/DOM setters. A separate Python OOXML audit and root readback confirmed all nine cell values, three rows, one table and the saved DOCX SHA256 `ef62cf214ef8f359f65ef12f7d432ef26c51fa7ab1fa30700bb0fea9af55d7e4`. Both original saved/reopened screenshots were inspected.

The first test run 45401475190 failed before download/app launch because actions/checkout's shallow history lacked the pinned application Git object. Its raw failure is preserved. Only an explicit fetch of that immutable commit was added; the functional driver and acceptance criteria were unchanged.

The original proof ZIP is retained byte-for-byte: artifact 14923732003, 192914 bytes, SHA256 `2cee373b321b4ace5947a6271f45222d27fbc39666570be3118478d731610e88`. Per-member hashes and original raw evidence accompany it.

Cleanup confirmed both normal app exits, closed CDP clients, restored scoped CI policy and successful uninstall. The one retained in-place uninstaller was removed after exit; no private installation files remained. The disposable host completed. No local user app or recording session was started.

Limits: this is one synthetic Writer core case on the integration CI installer, not all-module/format/rendering or release-signing acceptance. The host displayed Courier-to-Liberation-Mono substitution; font fidelity is not certified. Genuine ETT/DPT content import/save remains outside filename fix #382. The previously passed twelve cross-platform CI checks are retained. #381/#375 stay separate; integration source, main and published release were not modified by this continuation.
