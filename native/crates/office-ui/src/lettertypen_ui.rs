//! Dezelfde gepinde symboolvormen in de schil als op de documentpagina.
use cosmic_text::Fallback as _;
use office_core::lettertypen::SYMBOLEN;
use openaec_ui::{
    fonts,
    iced::advanced::graphics::text::{cosmic_text, font_system},
};
use std::sync::Once;

pub fn installeer() {
    static EEN: Once = Once::new();
    EEN.call_once(|| {
        fonts::install_fallback();
        // De openbare laadfunctie maakt gewicht-aliases. Het statische
        // symboolfont houdt zijn oorspronkelijke outlines en bytes.
        fonts::load_variable(
            SYMBOLEN.bytes,
            &[100, 200, 300, 400, 500, 600, 700, 800, 900],
        );
        let mut systeem = font_system().write().expect("lettertypesysteem");
        let raw = systeem.raw();
        let locale = raw.locale().to_owned();
        let db = raw.db().clone();
        let platform = cosmic_text::PlatformFallback;
        let algemeen = fonts::FALLBACK_FAMILIES
            .iter()
            .copied()
            .chain(std::iter::once(SYMBOLEN.familie))
            .chain(platform.common_fallback().iter().copied())
            .collect();
        *raw = cosmic_text::FontSystem::new_with_locale_and_db_and_fallback(
            locale,
            db,
            Terugval { algemeen, platform },
        );
    });
}
struct Terugval {
    algemeen: Vec<&'static str>,
    platform: cosmic_text::PlatformFallback,
}
impl cosmic_text::Fallback for Terugval {
    fn common_fallback(&self) -> &[&'static str] {
        &self.algemeen
    }
    fn forbidden_fallback(&self) -> &[&'static str] {
        self.platform.forbidden_fallback()
    }
    fn script_fallback(&self, script: unicode_script::Script, locale: &str) -> &[&'static str] {
        self.platform.script_fallback(script, locale)
    }
}

/// Laad uitsluitend de gebruikte letterbestanden in het UI-lettersysteem.
/// Aanroepen vanuit de berichtafhandeling, voordat layout of tekenen een slot neemt.
pub fn registreer_tekst(familie: &str, vet: bool, cursief: bool, tekst: &str) {
    use unicode_script::{Script, UnicodeScript};
    static GELADEN: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<usize>>> =
        std::sync::OnceLock::new();
    let scripts: std::collections::BTreeSet<_> = tekst
        .chars()
        .filter_map(|c| match c.script() {
            Script::Han => Some("han"),
            Script::Hiragana | Script::Katakana => Some("japanese"),
            Script::Hangul => Some("korean"),
            Script::Arabic => Some("arabic"),
            Script::Hebrew => Some("hebrew"),
            _ => None,
        })
        .collect();
    let scripts: Vec<_> = scripts.into_iter().map(serde_json::Value::from).collect();
    let mut geladen = GELADEN
        .get_or_init(Default::default)
        .lock()
        .expect("letterregistratie");
    for f in office_core::lettertypen::keten(familie, vet, cursief, &scripts) {
        if geladen.insert(f.bytes.as_ptr() as usize) {
            font_system()
                .write()
                .expect("lettertypesysteem")
                .load_font(std::borrow::Cow::Borrowed(f.bytes));
        }
    }
}
