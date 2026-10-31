//! Expliciete documentletters; een scoped leverancier behoudt de facadecontroles.
use std::cell::RefCell;
use std::sync::Arc;

pub use rustybuzz::Face as FontFace;

pub struct ResolvedFont {
    pub face: Arc<FontFace<'static>>,
    pub synthetic_bold: bool,
    pub synthetic_italic: bool,
}

pub trait FontProvider: Send + Sync {
    fn resolve(
        &self,
        family: Option<&str>,
        bold: bool,
        italic: bool,
    ) -> Result<ResolvedFont, String>;
}

thread_local! {
    static PROVIDER: RefCell<Option<Arc<dyn FontProvider>>> = RefCell::new(None);
}

/// Gebruik eigen letters binnen één synchrone facadeaanroep. Ook bij een
/// fout of paniek keert de vorige leverancier terug; andere draden blijven vrij.
pub fn with_fonts<T>(provider: Arc<dyn FontProvider>, werk: impl FnOnce() -> T) -> T {
    struct Herstel(Option<Arc<dyn FontProvider>>);
    impl Drop for Herstel {
        fn drop(&mut self) {
            PROVIDER.with(|slot| { slot.replace(self.0.take()); });
        }
    }
    let _herstel = Herstel(PROVIDER.with(|slot| slot.replace(Some(provider))));
    werk()
}

pub(crate) fn current() -> Option<Arc<dyn FontProvider>> {
    PROVIDER.with(|slot| slot.borrow().clone())
}

pub(crate) struct EmbeddedFonts;
impl FontProvider for EmbeddedFonts {
    fn resolve(&self, _family: Option<&str>, bold: bool, italic: bool) -> Result<ResolvedFont, String> {
        Ok(ResolvedFont {
            face: super::font::embedded_face(),
            synthetic_bold: bold,
            synthetic_italic: italic,
        })
    }
}
