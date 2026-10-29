//! Automatische updates (#26), zie docs/updates.md.
//!
//! - Kanaal: GitHub Releases van deze repository. De lijst met uitgaven komt
//!   met één GET van de GitHub-API; concepten vallen af, pre-releases tellen
//!   alleen mee in het ontwikkelkanaal. De nieuwste uitgave met een
//!   `latest.json` (gemaakt door de release-workflow) is het updatemanifest.
//! - De updater-plugin haalt dat manifest en het pakket op en controleert de
//!   minisign-handtekening tegen de publieke sleutel in `tauri.conf.json`
//!   (`plugins.updater.pubkey`). Zonder sleutel staat de updatefunctie uit.
//! - Geen telemetrie: er gaat niets mee behalve de gebruikelijke User-Agent.
//! - Uit te zetten in Instellingen (frontend) en voor beheerde omgevingen met
//!   de omgevingsvariabele `OPENAEC_OFFICE_UPDATES=uit`.
//! - Installeren gebeurt pas na bevestiging en alleen als geen enkel venster
//!   nog niet-opgeslagen wijzigingen heeft.
use semver::Version;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

const REPO: &str = "OpenAEC-Foundation/open-office-studio";
/// Adressen van uitgaven en hun bestanden; alles daarbuiten wordt geweigerd.
const UITGAVEN: &str = "https://github.com/OpenAEC-Foundation/open-office-studio/releases/";
pub const BEHEER_VARIABELE: &str = "OPENAEC_OFFICE_UPDATES";
const MANIFEST: &str = "latest.json";

/// Waarom de updatefunctie uit staat.
#[derive(Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum Reden {
    /// Geen publieke updatersleutel in de configuratie (zie docs/updates.md).
    GeenSleutel,
    /// Uitgezet door de beheerder (`OPENAEC_OFFICE_UPDATES=uit`).
    Beheerd,
    /// Ontwikkelbouw (`tauri dev`): nooit over een ontwikkelversie heen installeren.
    Ontwikkelbouw,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub aan: bool,
    pub reden: Option<Reden>,
    pub huidig: String,
}

/// Uitkomst van een controle; fouten zijn codes die de frontend vertaalt.
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum Uitkomst {
    Uit { reden: Reden },
    Actueel,
    Beschikbaar {
        versie: String,
        notities: Option<String>,
        datum: Option<String>,
        pagina: String,
        prerelease: bool,
    },
    /// Er is een nieuwere versie, maar niet voor dit installatietype (bijv. een
    /// DEB zonder ondertekend pakket in het manifest): handmatig bijwerken.
    Handmatig { versie: String, pagina: String },
    Fout { code: String, detail: String },
}

#[derive(Default)]
pub struct Updates {
    klaar: Mutex<Option<(tauri_plugin_updater::Update, String)>>,
    bezig: std::sync::atomic::AtomicBool,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Uitgave {
    pub tag_name: String,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub prerelease: bool,
    pub html_url: String,
    #[serde(default)]
    pub assets: Vec<Bestand>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Bestand {
    pub name: String,
    pub browser_download_url: String,
}

/// Een gekozen uitgave: versie, manifestadres en releasepagina.
#[derive(Debug, PartialEq)]
pub struct Keuze {
    pub versie: Version,
    pub manifest: String,
    pub pagina: String,
    pub prerelease: bool,
}

/// Hoort het adres bij de uitgaven van deze repository (https, github.com)?
pub fn eigen_adres(adres: &str) -> bool {
    adres.starts_with(UITGAVEN) && !adres[UITGAVEN.len()..].contains("..")
}

/// Versie uit een tag als `v2026.44.6`.
pub fn tagversie(tag: &str) -> Option<Version> {
    Version::parse(tag.strip_prefix('v').unwrap_or(tag)).ok()
}

/// De nieuwste gepubliceerde uitgave na `huidig` met een updatemanifest.
pub fn kies_uitgave(uitgaven: &[Uitgave], ontwikkel: bool, huidig: &Version) -> Option<Keuze> {
    uitgaven
        .iter()
        .filter(|u| !u.draft && (ontwikkel || !u.prerelease))
        .filter_map(|u| {
            let versie = tagversie(&u.tag_name)?;
            // Een stabiel kanaal neemt ook geen versie met pre-releaselabel (2026.45.0-rc.1).
            if !ontwikkel && !versie.pre.is_empty() {
                return None;
            }
            let manifest = u
                .assets
                .iter()
                .find(|b| b.name == MANIFEST && eigen_adres(&b.browser_download_url))?;
            (versie > *huidig && eigen_adres(&u.html_url)).then(|| Keuze {
                versie,
                manifest: manifest.browser_download_url.clone(),
                pagina: u.html_url.clone(),
                prerelease: u.prerelease,
            })
        })
        .max_by(|a, b| a.versie.cmp(&b.versie))
}

/// Uit door de beheerder: `OPENAEC_OFFICE_UPDATES` = uit/0/false/nee/off/no.
pub fn beheerd_uit(waarde: Option<&str>) -> bool {
    matches!(
        waarde.map(|w| w.trim().to_ascii_lowercase()).as_deref(),
        Some("uit" | "0" | "false" | "nee" | "off" | "no" | "disabled")
    )
}

fn publieke_sleutel<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<String> {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|c| c.get("pubkey"))
        .and_then(|s| s.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

fn reden<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<Reden> {
    if beheerd_uit(std::env::var(BEHEER_VARIABELE).ok().as_deref()) {
        Some(Reden::Beheerd)
    } else if publieke_sleutel(app).is_none() {
        Some(Reden::GeenSleutel)
    } else if cfg!(debug_assertions) {
        Some(Reden::Ontwikkelbouw)
    } else {
        None
    }
}

fn huidige_versie<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Version {
    app.package_info().version.clone()
}

#[tauri::command]
pub fn update_status(app: tauri::AppHandle) -> Status {
    let reden = reden(&app);
    Status {
        aan: reden.is_none(),
        reden,
        huidig: huidige_versie(&app).to_string(),
    }
}

fn fout(code: &str, detail: impl ToString) -> Uitkomst {
    Uitkomst::Fout {
        code: code.to_owned(),
        detail: detail.to_string(),
    }
}

fn client() -> Result<reqwest::Client, reqwest::Error> {
    // Zelfde cryptografie als e-mail en de updater (ring).
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .user_agent(concat!("open-office-studio/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(20))
        .build()
}

async fn haal_uitgaven() -> Result<Vec<Uitgave>, Uitkomst> {
    let antwoord = client()
        .map_err(|e| fout("netwerk", e))?
        .get(format!("https://api.github.com/repos/{REPO}/releases?per_page=30"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| fout("netwerk", e))?;
    let status = antwoord.status();
    if !status.is_success() {
        return Err(fout("github", status));
    }
    let bytes = antwoord.bytes().await.map_err(|e| fout("netwerk", e))?;
    serde_json::from_slice(&bytes).map_err(|e| fout("github", e))
}

/// Controleert op een nieuwe versie; `kanaal` is "stabiel" of "ontwikkel".
#[tauri::command]
pub async fn controleer_update(
    app: tauri::AppHandle,
    staat: tauri::State<'_, Updates>,
    kanaal: String,
) -> Result<Uitkomst, String> {
    if let Some(reden) = reden(&app) {
        return Ok(Uitkomst::Uit { reden });
    }
    let uitgaven = match haal_uitgaven().await {
        Ok(lijst) => lijst,
        Err(uitkomst) => return Ok(uitkomst),
    };
    let Some(keuze) = kies_uitgave(&uitgaven, kanaal == "ontwikkel", &huidige_versie(&app)) else {
        return Ok(Uitkomst::Actueel);
    };
    let Ok(manifest) = tauri::Url::parse(&keuze.manifest) else {
        return Ok(fout("github", &keuze.manifest));
    };
    let updater = app
        .updater_builder()
        .endpoints(vec![manifest])
        .and_then(|b| b.build());
    let updater = match updater {
        Ok(u) => u,
        Err(e) => return Ok(fout("updater", e)),
    };
    match updater.check().await {
        Ok(Some(update)) if eigen_adres(update.download_url.as_str()) => {
            let uitkomst = Uitkomst::Beschikbaar {
                versie: update.version.clone(),
                notities: update.body.clone().filter(|n| !n.trim().is_empty()),
                datum: update.date.map(|d| d.date().to_string()),
                pagina: keuze.pagina.clone(),
                prerelease: keuze.prerelease,
            };
            if let Ok(mut klaar) = staat.klaar.lock() {
                *klaar = Some((update, keuze.pagina));
            }
            Ok(uitkomst)
        }
        Ok(Some(update)) => Ok(fout("updater", update.download_url)),
        Ok(None) => Ok(Uitkomst::Actueel),
        Err(tauri_plugin_updater::Error::TargetsNotFound(_))
        | Err(tauri_plugin_updater::Error::TargetNotFound(_)) => Ok(Uitkomst::Handmatig {
            versie: keuze.versie.to_string(),
            pagina: keuze.pagina,
        }),
        Err(e) => Ok(fout("updater", e)),
    }
}

/// Aantal tabbladen met niet-opgeslagen wijzigingen in alle vensters.
fn niet_opgeslagen<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> u32 {
    let vensters = app.state::<crate::vensters::Vensters>();
    app.webview_windows()
        .keys()
        .map(|label| vensters.aantal_gewijzigd(label))
        .sum()
}

/// Downloadt, controleert en installeert de gevonden update en start opnieuw.
/// Weigert zolang er nog niet-opgeslagen wijzigingen zijn.
#[tauri::command]
pub async fn installeer_update(
    app: tauri::AppHandle,
    staat: tauri::State<'_, Updates>,
) -> Result<Uitkomst, String> {
    use std::sync::atomic::Ordering;
    if let Some(reden) = reden(&app) {
        return Ok(Uitkomst::Uit { reden });
    }
    let open = niet_opgeslagen(&app);
    if open > 0 {
        return Ok(fout("nietOpgeslagen", open));
    }
    let Some((update, _)) = staat.klaar.lock().ok().and_then(|mut k| k.take()) else {
        return Ok(fout("geenUpdate", ""));
    };
    if staat.bezig.swap(true, Ordering::SeqCst) {
        return Ok(fout("bezig", ""));
    }
    let resultaat = update.download_and_install(|_, _| {}, || {}).await;
    staat.bezig.store(false, Ordering::SeqCst);
    match resultaat {
        // Windows sluit de app zelf af voor het installatieprogramma; elders opnieuw starten.
        Ok(()) => app.restart(),
        Err(e) => Ok(fout("installeren", e)),
    }
}

/// Opent de releasepagina (releasenotes) van de gevonden update in de systeembrowser.
#[tauri::command]
pub fn open_releasepagina(pagina: String) -> Result<(), String> {
    if !eigen_adres(&pagina) {
        return Err(crate::taal::t("errors.file.unsupportedFormat"));
    }
    open::that_detached(&pagina).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn uitgave(tag: &str, prerelease: bool, draft: bool, manifest: bool) -> Uitgave {
        let basis = format!("{UITGAVEN}download/{tag}/");
        Uitgave {
            tag_name: tag.into(),
            draft,
            prerelease,
            html_url: format!("{UITGAVEN}tag/{tag}"),
            assets: manifest
                .then(|| Bestand {
                    name: MANIFEST.into(),
                    browser_download_url: format!("{basis}{MANIFEST}"),
                })
                .into_iter()
                .collect(),
        }
    }

    #[test]
    fn kiest_de_nieuwste_gepubliceerde_uitgave_met_manifest() {
        let huidig = Version::parse("2026.44.6").unwrap();
        let lijst = vec![
            uitgave("v2026.46.1", true, true, true),   // concept: nooit
            uitgave("v2026.45.9", true, false, false), // zonder latest.json
            uitgave("v2026.45.2", true, false, true),  // pre-release
            uitgave("v2026.45.1", false, false, true), // stabiel
            uitgave("v2026.44.6", false, false, true), // huidige versie
        ];
        let ontwikkel = kies_uitgave(&lijst, true, &huidig).unwrap();
        assert_eq!(ontwikkel.versie.to_string(), "2026.45.2");
        assert!(ontwikkel.prerelease);
        assert_eq!(ontwikkel.manifest, format!("{UITGAVEN}download/v2026.45.2/latest.json"));
        assert_eq!(ontwikkel.pagina, format!("{UITGAVEN}tag/v2026.45.2"));
        let stabiel = kies_uitgave(&lijst, false, &huidig).unwrap();
        assert_eq!(stabiel.versie.to_string(), "2026.45.1");
        // Niets nieuwer: actueel.
        assert_eq!(kies_uitgave(&lijst[4..], true, &huidig), None);
        assert_eq!(kies_uitgave(&lijst, false, &Version::parse("2026.45.1").unwrap()), None);
    }

    #[test]
    fn weigert_vreemde_adressen_en_tags() {
        let huidig = Version::parse("2026.44.6").unwrap();
        let mut vreemd = uitgave("v2026.45.0", false, false, true);
        vreemd.assets[0].browser_download_url = "https://example.org/latest.json".into();
        assert_eq!(kies_uitgave(&[vreemd], true, &huidig), None);
        let mut omweg = uitgave("v2026.45.0", false, false, true);
        omweg.assets[0].browser_download_url = format!("{UITGAVEN}download/../../x/latest.json");
        assert_eq!(kies_uitgave(&[omweg], true, &huidig), None);
        assert_eq!(kies_uitgave(&[uitgave("nachtelijk", false, false, true)], true, &huidig), None);
        assert!(!eigen_adres("http://github.com/OpenAEC-Foundation/open-office-studio/releases/x"));
        assert!(!eigen_adres("https://github.com/OpenAEC-Foundation/open-office-studio-nep/releases/x"));
        assert!(eigen_adres(&format!("{UITGAVEN}tag/v2026.45.0")));
    }

    #[test]
    fn stabiel_kanaal_neemt_geen_versie_met_prelabel() {
        let huidig = Version::parse("2026.44.6").unwrap();
        let lijst = vec![uitgave("v2026.45.0-rc.1", false, false, true)];
        assert_eq!(kies_uitgave(&lijst, false, &huidig), None);
        assert!(kies_uitgave(&lijst, true, &huidig).is_some());
    }

    #[test]
    fn beheerder_kan_updates_uitzetten() {
        for waarde in ["uit", "0", "false", " OFF ", "nee", "no", "disabled"] {
            assert!(beheerd_uit(Some(waarde)), "{waarde}");
        }
        for waarde in [None, Some(""), Some("aan"), Some("1")] {
            assert!(!beheerd_uit(waarde), "{waarde:?}");
        }
    }

    #[test]
    fn leest_de_lijst_van_de_github_api() {
        let json = r#"[{"tag_name":"v2026.45.0","draft":false,"prerelease":true,
            "html_url":"https://github.com/OpenAEC-Foundation/open-office-studio/releases/tag/v2026.45.0",
            "assets":[{"name":"latest.json","browser_download_url":"https://github.com/OpenAEC-Foundation/open-office-studio/releases/download/v2026.45.0/latest.json","size":1}],
            "body":"Notities"}]"#;
        let lijst: Vec<Uitgave> = serde_json::from_str(json).unwrap();
        let keuze = kies_uitgave(&lijst, true, &Version::parse("2026.44.6").unwrap()).unwrap();
        assert_eq!(keuze.versie.to_string(), "2026.45.0");
    }

    #[test]
    fn config_heeft_een_lege_sleutel_als_standaard() {
        // Zonder sleutel moet de plugin wel starten (lege pubkey) en de functie uit staan.
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let updater = &conf["plugins"]["updater"];
        assert!(updater["pubkey"].is_string());
        assert_eq!(updater["windows"]["installMode"], "passive");
        assert_eq!(conf["bundle"]["createUpdaterArtifacts"], false);
    }
}
