//! Taal van de native teksten: dialoogtitels, knoppen, bestandsfilters en
//! foutmeldingen die de Rust-kant teruggeeft (zie docs/i18n.md, "Desktop").
//!
//! De teksten staan in dezelfde bestanden als die van de frontend,
//! `src/i18n/locales/<taal>/desktop.json`, en worden hier ingebakken; zo
//! bewaakt `pnpm i18n:check` ook de Rust-teksten. De frontend geeft de
//! gekozen taal door met `zet_taal` (bij de start en bij elke wissel); tot
//! dan geldt de taal uit de voorkeuren of de systeemtaal, met terugval Engels.
//!
//! Ook gebruikt door Open Database Studio (`#[path]` in die crate).
use serde_json::Value;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    OnceLock,
};

macro_rules! bronnen {
    ($($taal:literal),* $(,)?) => {
        [$(($taal, include_str!(concat!("../../src/i18n/locales/", $taal, "/desktop.json")))),*]
    };
}

/// De talen van de interface (zelfde volgorde als `src/i18n/talen.ts`).
const BRONNEN: [(&str, &str); 8] = bronnen!("nl", "en", "de", "fr", "es", "it", "pt-BR", "zh-CN");
const ENGELS: usize = 1;
const ONBEKEND: usize = usize::MAX;

static HUIDIG: AtomicUsize = AtomicUsize::new(ONBEKEND);

fn bomen() -> &'static [Value] {
    static BOMEN: OnceLock<Vec<Value>> = OnceLock::new();
    BOMEN.get_or_init(|| {
        BRONNEN
            .iter()
            .map(|(_, json)| serde_json::from_str(json).unwrap_or(Value::Null))
            .collect()
    })
}

fn index(taal: &str) -> Option<usize> {
    BRONNEN.iter().position(|(code, _)| *code == taal)
}

/// De ondersteunde taal bij één taaltag (BCP-47 of POSIX zoals `pt_BR.UTF-8`),
/// met dezelfde regels als `zoekTaal` in `src/i18n/talen.ts`.
pub fn zoek_taal(tag: &str) -> Option<&'static str> {
    let tag = tag.split(['.', '@']).next().unwrap_or("");
    let delen: Vec<String> = tag
        .split(['-', '_'])
        .filter(|d| !d.is_empty())
        .map(str::to_lowercase)
        .collect();
    let hoofd = delen.first()?.as_str();
    let volledig = delen.join("-");
    if let Some((code, _)) = BRONNEN.iter().find(|(code, _)| code.to_lowercase() == volledig) {
        return Some(code);
    }
    match hoofd {
        // Eén Portugese en één Chinese variant: elke regio valt daarop terug.
        "pt" => Some("pt-BR"),
        "zh" => Some("zh-CN"),
        _ => BRONNEN
            .iter()
            .find(|(code, _)| *code == hoofd)
            .map(|(code, _)| *code),
    }
}

/// Systeemtaal uit de omgeving (Linux/BSD: LANGUAGE, LC_ALL, LC_MESSAGES, LANG).
/// Op Windows en macOS staat die meestal niet; daar geeft de frontend de taal door.
pub fn systeemtaal() -> Option<&'static str> {
    ["LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .filter_map(|naam| std::env::var(naam).ok())
        .flat_map(|waarde| {
            waarde
                .split(':')
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .filter(|tag| !tag.is_empty() && tag != "C" && tag != "POSIX" && !tag.starts_with("C."))
        .find_map(|tag| zoek_taal(&tag))
}

/// Zet de taal van de native teksten; `false` bij een onbekende code.
pub fn zet(taal: &str) -> bool {
    match index(taal) {
        Some(i) => {
            HUIDIG.store(i, Ordering::Relaxed);
            true
        }
        None => false,
    }
}

/// Begintaal uit een keuze zoals in de voorkeuren ("auto" of een taalcode).
pub fn zet_keuze(keuze: Option<&str>) {
    let taal = keuze
        .filter(|k| *k != "auto")
        .and_then(index)
        .map(|i| BRONNEN[i].0)
        .or_else(systeemtaal)
        .unwrap_or("en");
    zet(taal);
}

/// De taal die nu geldt.
pub fn huidige() -> &'static str {
    BRONNEN[huidige_index()].0
}

fn huidige_index() -> usize {
    match HUIDIG.load(Ordering::Relaxed) {
        ONBEKEND => {
            // Tests draaien in het Nederlands, net als die van de frontend.
            let taal = if cfg!(test) {
                "nl"
            } else {
                systeemtaal().unwrap_or("en")
            };
            let i = index(taal).unwrap_or(ENGELS);
            let _ = HUIDIG.compare_exchange(ONBEKEND, i, Ordering::Relaxed, Ordering::Relaxed);
            HUIDIG.load(Ordering::Relaxed)
        }
        i => i,
    }
}

fn zoek<'a>(boom: &'a Value, sleutel: &str) -> Option<&'a str> {
    sleutel
        .split('.')
        .try_fold(boom, |knoop, deel| knoop.get(deel))?
        .as_str()
}

fn tekst(taal: usize, sleutel: &str) -> String {
    let bomen = bomen();
    zoek(&bomen[taal], sleutel)
        .or_else(|| zoek(&bomen[ENGELS], sleutel))
        .unwrap_or(sleutel)
        .to_owned()
}

fn vul_in(mut tekst: String, waarden: &[(&str, &str)]) -> String {
    for (naam, waarde) in waarden {
        tekst = tekst.replace(&format!("{{{{{naam}}}}}"), waarde);
    }
    tekst
}

/// Tekst bij een sleutel uit `desktop.json`, bijvoorbeeld `t("dialogs.saveAs")`.
pub fn t(sleutel: &str) -> String {
    tekst(huidige_index(), sleutel)
}

/// Tekst met `{{variabelen}}`: `t_met("errors.font.notInstalled", &[("family", "Arial")])`.
pub fn t_met(sleutel: &str, waarden: &[(&str, &str)]) -> String {
    vul_in(t(sleutel), waarden)
}

/// Meervoud zoals i18next: `<sleutel>_<vorm>` volgens CLDR, met `{{count}}`.
pub fn t_aantal(sleutel: &str, aantal: u64, waarden: &[(&str, &str)]) -> String {
    let taal = huidige_index();
    let vorm = meervoudsvorm(BRONNEN[taal].0, aantal);
    let bomen = bomen();
    let gevonden = zoek(&bomen[taal], &format!("{sleutel}_{vorm}"))
        .or_else(|| zoek(&bomen[taal], &format!("{sleutel}_other")))
        .map(str::to_owned)
        .unwrap_or_else(|| {
            let vorm = meervoudsvorm("en", aantal);
            tekst(ENGELS, &format!("{sleutel}_{vorm}"))
        });
    let getal = aantal.to_string();
    let mut alle = vec![("count", getal.as_str())];
    alle.extend_from_slice(waarden);
    vul_in(gevonden, &alle)
}

/// CLDR-meervoudscategorie voor een geheel getal (zelfde uitkomst als
/// `Intl.PluralRules`; alleen gehele getallen komen hier voor).
pub fn meervoudsvorm(taal: &str, n: u64) -> &'static str {
    let (n10, n100) = (n % 10, n % 100);
    match taal {
        "id" | "vi" | "th" | "zh-CN" | "zh-TW" | "ja" | "ko" => "other",
        "fr" | "pt-BR" if n <= 1 => "one",
        "fr" | "pt-BR" | "es" | "it" | "pt-PT" if n != 0 && n % 1_000_000 == 0 => "many",
        "hi" if n <= 1 => "one",
        "cs" | "sk" => match n {
            1 => "one",
            2..=4 => "few",
            _ => "other",
        },
        "pl" => match n {
            1 => "one",
            _ if (2..=4).contains(&n10) && !(12..=14).contains(&n100) => "few",
            _ => "many",
        },
        "ru" | "uk" => match n {
            _ if n10 == 1 && n100 != 11 => "one",
            _ if (2..=4).contains(&n10) && !(12..=14).contains(&n100) => "few",
            _ => "many",
        },
        "ro" => match n {
            1 => "one",
            _ if n == 0 || (1..=19).contains(&n100) => "few",
            _ => "other",
        },
        "ar" => match n {
            0 => "zero",
            1 => "one",
            2 => "two",
            _ if (3..=10).contains(&n100) => "few",
            _ if (11..=99).contains(&n100) => "many",
            _ => "other",
        },
        "he" => match n {
            1 => "one",
            2 => "two",
            _ => "other",
        },
        _ if n == 1 => "one",
        _ => "other",
    }
}

/// De frontend geeft de interfacetaal door (bij de start en bij elke wissel).
#[tauri::command]
pub fn zet_taal(taal: String) -> bool {
    zet(&taal)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alle_talen_zijn_geldige_json_met_dezelfde_sleutels() {
        fn sleutels(v: &Value, pad: &str, uit: &mut Vec<String>) {
            if let Value::Object(map) = v {
                for (k, w) in map {
                    let p = if pad.is_empty() { k.clone() } else { format!("{pad}.{k}") };
                    sleutels(w, &p, uit);
                }
            } else {
                // Meervoudsvormen verschillen per taal; vergelijk de basis.
                let basis = pad.rsplit_once('_').map_or(pad, |(b, _)| b);
                uit.push(basis.to_owned());
            }
        }
        let mut bron = Vec::new();
        sleutels(&bomen()[0], "", &mut bron);
        bron.sort();
        bron.dedup();
        assert!(bron.len() > 50);
        for (i, (taal, _)) in BRONNEN.iter().enumerate() {
            assert!(bomen()[i].is_object(), "{taal}/desktop.json is geen geldig JSON-object");
            let mut eigen = Vec::new();
            sleutels(&bomen()[i], "", &mut eigen);
            eigen.sort();
            eigen.dedup();
            assert_eq!(eigen, bron, "sleutels van {taal}/desktop.json");
        }
    }

    #[test]
    fn kiest_tekst_variabelen_en_terugval() {
        let nl = index("nl").unwrap();
        assert_eq!(tekst(nl, "dialogs.saveAs"), "Opslaan als");
        assert_eq!(tekst(ENGELS, "dialogs.saveAs"), "Save as");
        assert_eq!(tekst(nl, "bestaat.niet"), "bestaat.niet");
        assert_eq!(
            vul_in(tekst(nl, "errors.font.notInstalled"), &[("family", "Arial")]),
            "Lettertype Arial staat niet op deze computer."
        );
    }

    #[test]
    fn meervoud_volgt_cldr() {
        let geval = |taal, n| meervoudsvorm(taal, n);
        assert_eq!(geval("nl", 1), "one");
        assert_eq!(geval("nl", 0), "other");
        assert_eq!(geval("fr", 0), "one");
        assert_eq!(geval("fr", 1_000_000), "many");
        assert_eq!(geval("es", 0), "other");
        assert_eq!(geval("pl", 22), "few");
        assert_eq!(geval("pl", 12), "many");
        assert_eq!(geval("pl", 21), "many");
        assert_eq!(geval("ru", 21), "one");
        assert_eq!(geval("ru", 11), "many");
        assert_eq!(geval("uk", 3), "few");
        assert_eq!(geval("cs", 5), "other");
        assert_eq!(geval("ro", 0), "few");
        assert_eq!(geval("ro", 101), "few");
        assert_eq!(geval("ro", 20), "other");
        assert_eq!(geval("ar", 0), "zero");
        assert_eq!(geval("ar", 103), "few");
        assert_eq!(geval("ar", 111), "many");
        assert_eq!(geval("ar", 100), "other");
        assert_eq!(geval("he", 2), "two");
        assert_eq!(geval("hi", 0), "one");
        assert_eq!(geval("ja", 1), "other");
    }

    #[test]
    fn elke_taal_heeft_de_meervoudsvormen_die_rust_kiest() {
        for (i, (taal, _)) in BRONNEN.iter().enumerate() {
            for n in [0, 1, 2, 3, 5, 11, 12, 21, 22, 25, 100, 101, 111, 1_000_000] {
                let vorm = meervoudsvorm(taal, n);
                let sleutel = format!("dialogs.unsavedChanges.message_{vorm}");
                assert!(
                    zoek(&bomen()[i], &sleutel).is_some(),
                    "{taal}/desktop.json mist {sleutel} (n = {n})"
                );
            }
        }
    }

    #[test]
    fn herkent_systeemtags() {
        assert_eq!(zoek_taal("nl_NL.UTF-8"), Some("nl"));
        assert_eq!(zoek_taal("pt_BR.UTF-8"), Some("pt-BR"));
        assert_eq!(zoek_taal("pt_PT"), Some("pt-BR"));
        assert_eq!(zoek_taal("pt"), Some("pt-BR"));
        assert_eq!(zoek_taal("zh_HK"), Some("zh-CN"));
        assert_eq!(zoek_taal("zh-Hans-CN"), Some("zh-CN"));
        assert_eq!(zoek_taal("nn_NO"), None);
        assert_eq!(zoek_taal("de_AT@euro"), Some("de"));
        assert_eq!(zoek_taal("xx_YY"), None);
        assert_eq!(zoek_taal(""), None);
    }
}
