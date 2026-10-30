//! De documentletters komen uit dezelfde gepinde bundel als de bestaande suite.
//! Resolutie gebeurt per familie en stijl; onbekende families krijgen een expliciete terugval.
#[derive(Debug)]
pub struct Lettertype {
    pub familie: &'static str,
    pub alias: &'static str,
    pub vet: bool,
    pub cursief: bool,
    pub bytes: &'static [u8],
}
#[path = "lettertype_data.rs"]
mod data;
pub use data::LETTERTYPEN;
pub fn kies(familie: &str, vet: bool, cursief: bool) -> &'static Lettertype {
    let naam = familie.trim().trim_matches(['\'', '"']);
    let alias = match naam.to_ascii_lowercase().as_str() {
        "calibri light" | "aptos" | "aptos display" => "Carlito",
        _ => naam,
    };
    LETTERTYPEN
        .iter()
        .filter(|f| f.familie.eq_ignore_ascii_case(alias) || f.alias.eq_ignore_ascii_case(alias))
        .min_by_key(|f| u8::from(f.vet != vet) * 2 + u8::from(f.cursief != cursief))
        .unwrap_or_else(|| {
            LETTERTYPEN
                .iter()
                .find(|f| f.familie == "Liberation Sans" && f.vet == vet && f.cursief == cursief)
                .expect("vaste lettercatalogus")
        })
}
pub fn keten(
    familie: &str,
    vet: bool,
    cursief: bool,
    scripts: &[serde_json::Value],
) -> Vec<&'static Lettertype> {
    let mut keten = vec![kies(familie, vet, cursief)];
    for script in scripts.iter().filter_map(serde_json::Value::as_str) {
        let familie = match script {
            "arabic" => "Noto Sans Arabic",
            "hebrew" => "Noto Sans Hebrew",
            "han" | "cjk" | "hans" => "Noto Sans SC",
            "hant" => "Noto Sans TC",
            "japanese" | "kana" => "Noto Sans JP",
            "korean" | "hangul" => "Noto Sans KR",
            _ => continue,
        };
        let f = kies(familie, vet, cursief);
        if !keten.iter().any(|k| std::ptr::eq(*k, f)) {
            keten.push(f);
        }
    }
    keten
}
