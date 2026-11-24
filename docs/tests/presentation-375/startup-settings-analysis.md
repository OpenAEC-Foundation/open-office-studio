# #375: startup/settings diagnosis on the original importer

This is read-only source/log analysis, not a validated initializer or product
fix. Integration permits this exclusive investigation during release
`45376499489`, without a new build, VM, installation, cache assignment or shared
source edit. Earlier failures, UI-resource bytes and color assertions remain
unchanged. Exact primary-source hashes and line excerpts are in
`startup-settings-analysis.json`.

## What the retained evidence establishes

The fifth witness compiled and started the original-importer UOP test, then
terminated before its color assertion. The verified installed tab-bar resource
was present. Its observed stack runs through `ToolBarManager::Init`,
`SvtMiscOptions_Impl` construction/Load/SetIconTheme, application settings updates,
`sd::Window::DataChanged` and `SfxBindings::Invalidate`. The official ZIP remains
unchanged; no core file or runnable build was retained.

The same pinned source commit `9dea406ab7695df6325b11b0e19fdca8db4b7276`
establishes the following sequence:

1. [ToolBarManager::Init:616](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/framework/source/uielement/toolbarmanager.cxx#L616)
   constructs SvtMiscOptions to register its listener.
2. [miscopt.cxx:139](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/svtools/source/config/miscopt.cxx#L139)
   initializes a new implementation using Load; SetIconTheme at 245–262
   synchronously calls Application::SetSettings using configured defaults.
3. [sdwindow.cxx:756](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/sd/source/ui/view/sdwindow.cxx#L756)
   handles a STYLE event by calling Resize. Resize at 195–201 calls the frame's
   bindings invalidation when its view shell/frame references are non-null.
4. [bindings.cxx:640](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/sfx2/source/control/bindings.cxx#L640)
   reads its implementation state at entry. The retained optimized stack does
   not establish the validity or initialization state of those runtime objects.

This connects source to observed functions. It does not prove which runtime
object is invalid or why. The constructor stack proves a new implementation was
being initialized there; it does not exclude earlier instances or indirect setup.

## Comparison with existing setup

The directly inspected BootstrapFixtureBase, BootstrapFixture and UnoApiTest
setup do not explicitly construct SvtMiscOptions. SdModelTestBase inherits that
setup and its standard blank-Impress helper calls `private:factory/simpress`.
Thus no known canonical test-setup correction has been demonstrated.

There is a relevant but distinct precedent:
[LOK preloadData:8015](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/desktop/source/lib/init.cxx#L8015)
constructs static misc options before preloading documents. This supports a
neutral ordering experiment, not enabling LOK or copying its complete bootstrap.
ItemHolder2 retains the normal options object; its lifetime should be observed
under the actual test context rather than assumed.

## Single bounded diagnostic proposal, not executed

Hypothesis: late settings initialization during construction of an Impress frame
synchronously updates an incompletely initialized view. No chosen theme, new
settings value, document-route bypass or product guard is proposed.

On one separately allocated, exactly bound source-build host/cache, use the same
original-importer test binary/configuration and fresh process/profile per arm:

- A: existing initialization and the unchanged authentic UOP/color assertions.
- B: only construct standard SvtMiscOptions before any document/frame load;
  use no setters, forced icon style, Hidden, skipped view or LOK activation.

Use canonical blank Impress creation as a startup control in separate processes.
Record input/binary/config/resource hashes, zero document frames before neutral
initialization, configured-default observations, phase markers, actual outcomes
and cleanup. Proposed code would stay in the own UOP test; a direct `svt` test
link may be required. That existing library is not a new external dependency.
No shared BootstrapFixture/UnoApiTest or product source change is requested.

If B reaches the unchanged stale-theme assertion while A fails at startup, the
ordering hypothesis gains runtime evidence. It is not a general product fix or
native/visual pass. If either arm has a different crash/error, retain it; do not
weaken assertions or start another build automatically. Blank-document failures
also keep the classification at startup rather than attributing it to UOP fills.

Only after an accepted initializer and genuine original-color failure may the
unchanged importer patch be compiled, followed by full xmloff_draw and independent
converter/engine/edit/Undo/Redo/PPTX-save/fresh-reopen checks with new runtime
bindings. Windows/Linux/macOS/native and actual browser acceptance remain open.

## Current limit

No host/cache is assigned and no runtime experiment or code correction has been
executed. A fresh bounded diagnostic allocation is required after integration
review; its resources/time limits must be explicit. Existing unused budget or
old artifacts are not a new runtime assignment. P5, runtime pins, main, versions
and publication are outside this investigation.
