//! Losgemaakte documentvensters en sluitbeveiliging per venster.
//!
//! Een tabblad gaat naar een ander venster via een eenmalige sleutel: het
//! bronvenster biedt het pakket aan (`bied_overdracht`), het doelvenster neemt
//! het op (`neem_overdracht`), opent het en bevestigt (`bevestig_overdracht`).
//! Pas dan krijgt de bron `office-overdracht-bevestigd` en sluit die het
//! tabblad. Zo staan bytes nooit in een URL en gaat er niets verloren als het
//! nieuwe venster niet opent.
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, Manager};

/// Grootste pakket: document (100 MB) plus een kleine JSON-kop.
const MAX_PAKKET: usize = 100 * 1024 * 1024 + 64 * 1024;
/// Vensterlabels van losgemaakte vensters; zie `capabilities/default.json`.
const VOORVOEGSEL: &str = "document-";

struct Pakket {
    bron: String,
    /// Het nieuw geopende venster, om het te sluiten als de overdracht vervalt.
    venster: Option<String>,
    bytes: Vec<u8>,
    geclaimd: bool,
    /// Pad-token van het document (`werkbestanden.rs`); verhuist mee bij bevestigen.
    token: Option<String>,
}

/// Het pad-token (`werkbestand.token`) uit de JSON-kop van een pakket (4 bytes lengte LE + JSON + bytes).
fn token_uit_pakket(bytes: &[u8]) -> Option<String> {
    let lengte = u32::from_le_bytes(bytes.get(..4)?.try_into().ok()?) as usize;
    let kop: serde_json::Value = serde_json::from_slice(bytes.get(4..4 + lengte)?).ok()?;
    kop.get("werkbestand")?.get("token")?.as_str().map(str::to_owned)
}

/// Een tabblad zoals het venstermenu het toont.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct TabInfo {
    id: u32,
    titel: String,
    gewijzigd: bool,
}

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct VensterInfo {
    label: String,
    hoofd: bool,
    tabbladen: Vec<TabInfo>,
}

/// Gebeurtenis: het venster wil sluiten; de webview vraagt per document.
const SLUITVERZOEK: &str = "office-sluitverzoek";
/// Gebeurtenis: activeer dit tabblad (venstermenu in een ander venster).
const ACTIVEER_TABBLAD: &str = "office-activeer-tabblad";

#[derive(Default)]
pub struct Vensters {
    /// Aantal tabbladen met niet-opgeslagen wijzigingen per vensterlabel.
    gewijzigd: Mutex<HashMap<String, u32>>,
    pakketten: Mutex<HashMap<String, Pakket>>,
    teller: AtomicU64,
    /// Open tabbladen per venster, voor het venstermenu.
    tabbladen: Mutex<HashMap<String, Vec<TabInfo>>>,
    /// Vensters met een sluitverzoek dat de webview nog niet heeft bevestigd.
    sluitend: Mutex<HashSet<String>>,
}

impl Vensters {
    fn volgende(&self) -> u64 {
        self.teller.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn aantal_gewijzigd(&self, label: &str) -> u32 {
        self.gewijzigd
            .lock()
            .map(|g| g.get(label).copied().unwrap_or(0))
            .unwrap_or(0)
    }

    fn vergeet(&self, label: &str) {
        if let Ok(mut g) = self.gewijzigd.lock() {
            g.remove(label);
        }
    }

    fn overzicht(&self) -> Vec<VensterInfo> {
        let Ok(t) = self.tabbladen.lock() else {
            return Vec::new();
        };
        let mut lijst: Vec<VensterInfo> = t
            .iter()
            .map(|(label, tabbladen)| VensterInfo {
                label: label.clone(),
                hoofd: label == "main",
                tabbladen: tabbladen.clone(),
            })
            .collect();
        // Hoofdvenster eerst, daarna in volgorde van openen.
        lijst.sort_by_key(|v| {
            (
                !v.hoofd,
                v.label
                    .strip_prefix(VOORVOEGSEL)
                    .and_then(|n| n.parse::<u64>().ok())
                    .unwrap_or(0),
            )
        });
        lijst
    }
}

/// Sluitmelding met het aantal documenten in dit venster.
pub fn sluitvraag(aantal: u32) -> String {
    crate::taal::t_aantal("dialogs.unsavedChanges.message", u64::from(aantal.max(1)), &[])
}

#[tauri::command]
pub fn wijzigingsstatus(
    venster: tauri::Window,
    gewijzigd: bool,
    aantal: Option<u32>,
    vensters: tauri::State<Vensters>,
) {
    let aantal = if gewijzigd { aantal.unwrap_or(1).max(1) } else { 0 };
    if let Ok(mut g) = vensters.gewijzigd.lock() {
        g.insert(venster.label().to_owned(), aantal);
    }
}

#[tauri::command]
pub async fn bevestig_verlaten(aantal: Option<u32>) -> bool {
    rfd::AsyncMessageDialog::new()
        .set_title(crate::taal::t("dialogs.unsavedChanges.title"))
        .set_description(sluitvraag(aantal.unwrap_or(1)))
        .set_buttons(rfd::MessageButtons::YesNo)
        .show()
        .await
        == rfd::MessageDialogResult::Yes
}

/// Sluitbeveiliging per venster; de app stopt als het laatste venster sluit.
///
/// Met wijzigingen vraagt de webview per document (Opslaan, Niet opslaan,
/// Annuleren) en sluit daarna zelf (`sluit_venster`). Reageert de webview
/// niet binnen twee seconden, dan volgt de eenvoudige ja/nee-vraag van Rust.
pub fn bij_venstergebeurtenis(venster: &tauri::Window, gebeurtenis: &tauri::WindowEvent) {
    match gebeurtenis {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            let staat = venster.state::<Vensters>();
            let aantal = staat.aantal_gewijzigd(venster.label());
            if aantal > 0 {
                api.prevent_close();
                if let Ok(mut s) = staat.sluitend.lock() {
                    s.insert(venster.label().to_owned());
                };
                let _ = venster.emit_to(venster.label(), SLUITVERZOEK, ());
                let venster = venster.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    let onbeantwoord = venster
                        .state::<Vensters>()
                        .sluitend
                        .lock()
                        .map(|mut s| s.remove(venster.label()))
                        .unwrap_or(false);
                    if onbeantwoord && bevestig_verlaten(Some(aantal)).await {
                        venster.state::<Vensters>().vergeet(venster.label());
                        let _ = venster.destroy();
                    }
                });
            }
        }
        tauri::WindowEvent::Destroyed => {
            let staat = venster.state::<Vensters>();
            staat.vergeet(venster.label());
            if let Ok(mut t) = staat.tabbladen.lock() {
                t.remove(venster.label());
            }
            if let Ok(mut s) = staat.sluitend.lock() {
                s.remove(venster.label());
            };
        }
        _ => {}
    }
}

/// De webview heeft het sluitverzoek ontvangen en vraagt zelf per document.
#[tauri::command]
pub fn sluitverzoek_ontvangen(venster: tauri::Window, vensters: tauri::State<Vensters>) {
    if let Ok(mut s) = vensters.sluitend.lock() {
        s.remove(venster.label());
    }
}

/// Alle documenten zijn afgehandeld: dit venster sluit zonder verdere vraag.
#[tauri::command]
pub fn sluit_venster(venster: tauri::Window, vensters: tauri::State<Vensters>) -> Result<(), String> {
    vensters.vergeet(venster.label());
    venster.destroy().map_err(|e| e.to_string())
}

/// Open tabbladen van dit venster, voor het venstermenu in alle vensters.
#[tauri::command]
pub fn meld_tabbladen(
    venster: tauri::Window,
    vensters: tauri::State<Vensters>,
    tabbladen: Vec<TabInfo>,
) {
    let tabbladen = tabbladen
        .into_iter()
        .take(200)
        .map(|t| TabInfo {
            titel: t.titel.chars().take(200).collect(),
            ..t
        })
        .collect();
    if let Ok(mut t) = vensters.tabbladen.lock() {
        t.insert(venster.label().to_owned(), tabbladen);
    }
}

#[tauri::command]
pub fn open_documenten(vensters: tauri::State<Vensters>) -> Vec<VensterInfo> {
    vensters.overzicht()
}

/// Brengt een venster naar voren en activeert daar het tabblad.
#[tauri::command]
pub fn activeer_tabblad(app: tauri::AppHandle, venster: String, id: u32) -> Result<(), String> {
    let doel = app
        .get_webview_window(&venster)
        .ok_or_else(|| crate::taal::t("errors.window.closed"))?;
    let _ = doel.unminimize();
    let _ = doel.show();
    let _ = doel.set_focus();
    app.emit_to(venster.as_str(), ACTIVEER_TABBLAD, id)
        .map_err(|e| e.to_string())
}

fn kop(request: &tauri::ipc::Request<'_>, naam: &str) -> Option<String> {
    let waarde = request.headers().get(naam)?.to_str().ok()?;
    percent_encoding::percent_decode_str(waarde)
        .decode_utf8()
        .ok()
        .map(|s| s.into_owned())
}

/// Biedt een tabblad aan; `x-office-doel` is "nieuw" of het label van een bestaand venster.
#[tauri::command]
pub async fn bied_overdracht(
    app: tauri::AppHandle,
    venster: tauri::Window,
    request: tauri::ipc::Request<'_>,
) -> Result<String, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) if b.len() >= 4 && b.len() <= MAX_PAKKET => b.clone(),
        _ => return Err(crate::taal::t("errors.window.transferEmptyOrTooLarge")),
    };
    let doel = kop(&request, "x-office-doel").unwrap_or_else(|| "nieuw".into());
    let vensters = app.state::<Vensters>();
    // Alleen een token dat echt bij het bronvenster hoort, gaat mee.
    let token = token_uit_pakket(&bytes).filter(|t| {
        app.state::<crate::werkbestanden::Werkbestanden>()
            .pad(t, venster.label())
            .is_some()
    });
    let sleutel = format!("o{}", vensters.volgende());
    let label = (doel == "nieuw").then(|| format!("{VOORVOEGSEL}{}", vensters.volgende()));
    vensters
        .pakketten
        .lock()
        .map_err(|e| e.to_string())?
        .insert(
            sleutel.clone(),
            Pakket {
                bron: venster.label().to_owned(),
                venster: label.clone(),
                bytes,
                geclaimd: false,
                token,
            },
        );
    // Losgelaten boven een ander Office Studio-venster: daarheen, niet naar een nieuw venster.
    let positie = kop(&request, "x-office-x")
        .zip(kop(&request, "x-office-y"))
        .and_then(|(x, y)| Some((x.parse::<f64>().ok()?, y.parse::<f64>().ok()?)));
    let doel = match (&label, positie) {
        (Some(_), Some(punt)) => venster_onder_punt(&vensterrechthoeken(&app), punt, venster.label())
            .unwrap_or(doel),
        _ => doel,
    };
    let label = label.filter(|_| doel == "nieuw");
    if let Some(p) = vensters
        .pakketten
        .lock()
        .map_err(|e| e.to_string())?
        .get_mut(&sleutel)
    {
        p.venster = label.clone();
    }
    let resultaat = match &label {
        Some(label) => {
            let titel = kop(&request, "x-office-titel")
                .map(|t| t.chars().take(200).collect::<String>())
                .unwrap_or_else(|| APPNAAM.into());
            maak_venster(&app, label, &titel, Some(&sleutel), positie)
        }
        None => match app.get_webview_window(&doel) {
            None => Err(crate::taal::t("errors.window.mainWindowUnavailable")),
            Some(doelvenster) => {
                let _ = doelvenster.unminimize();
                let _ = doelvenster.set_focus();
                app.emit_to(doel.as_str(), "office-overdracht", sleutel.clone())
                    .map_err(|e| e.to_string())
            }
        },
    };
    if let Err(fout) = resultaat {
        vensters.pakketten.lock().map_err(|e| e.to_string())?.remove(&sleutel);
        return Err(crate::taal::t_met("errors.window.openFailed", &[("error", &fout)]));
    }
    Ok(sleutel)
}

/// Opent een leeg, volwaardig Office Studio-venster (venstermenu › Nieuw venster).
#[tauri::command]
pub fn nieuw_venster(app: tauri::AppHandle, vensters: tauri::State<Vensters>) -> Result<(), String> {
    let label = format!("{VOORVOEGSEL}{}", vensters.volgende());
    maak_venster(&app, &label, APPNAAM, None, None)
}

/// Een venster op het scherm, in logische pixels (zoals `screenX`/`screenY` in de webview).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rechthoek {
    x: f64,
    y: f64,
    breedte: f64,
    hoogte: f64,
}

impl Rechthoek {
    fn bevat(&self, (x, y): (f64, f64)) -> bool {
        x >= self.x && y >= self.y && x < self.x + self.breedte && y < self.y + self.hoogte
    }
}

/// Het Office Studio-venster onder het loslaatpunt, behalve het bronvenster zelf.
/// Bij overlap wint het eerst genoemde venster (het laatst actieve vooraan).
pub fn venster_onder_punt(
    vensters: &[(String, Rechthoek)],
    punt: (f64, f64),
    bron: &str,
) -> Option<String> {
    vensters
        .iter()
        .find(|(label, r)| label != bron && r.bevat(punt))
        .map(|(label, _)| label.clone())
}

/// Rechthoeken van alle zichtbare, niet-geminimaliseerde vensters; het laatst actieve eerst.
fn vensterrechthoeken(app: &tauri::AppHandle) -> Vec<(String, Rechthoek)> {
    let laatst = crate::systeembestanden::laatst_actief(app);
    let mut lijst: Vec<(String, Rechthoek)> = app
        .webview_windows()
        .into_iter()
        .filter(|(_, v)| v.is_visible().unwrap_or(false) && !v.is_minimized().unwrap_or(false))
        .filter_map(|(label, v)| {
            let schaal = v.scale_factor().ok()?;
            let plek = v.outer_position().ok()?.to_logical::<f64>(schaal);
            let maat = v.outer_size().ok()?.to_logical::<f64>(schaal);
            Some((
                label,
                Rechthoek { x: plek.x, y: plek.y, breedte: maat.width, hoogte: maat.height },
            ))
        })
        .collect();
    lijst.sort_by_key(|(label, _)| Some(label.as_str()) != laatst.as_deref());
    lijst
}

/// Naam van de app; de webview zet daarna zelf de volledige titel.
const APPNAAM: &str = "Open Office Studio";

/// Een Office Studio-venster zonder systeemtitelbalk: de webview tekent zelf
/// de titelbalk met vensterknoppen (OpenAEC Blueprint). `sleutel`: het
/// tabblad dat het venster bij de start overneemt.
fn maak_venster(
    app: &tauri::AppHandle,
    label: &str,
    titel: &str,
    sleutel: Option<&str>,
    positie: Option<(f64, f64)>,
) -> Result<(), String> {
    let url = match sleutel {
        Some(sleutel) => format!("index.html?venster=document&overdracht={sleutel}"),
        None => "index.html?venster=document".to_owned(),
    };
    let mut bouwer =
        tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::App(url.into()))
            .title(titel)
            .decorations(false)
            .inner_size(1200.0, 800.0)
            .min_inner_size(800.0, 600.0);
    bouwer = match positie {
        // Het venster verschijnt onder de muis, met de tabbalk ongeveer onder de cursor.
        Some((x, y)) => bouwer.position((x - 160.0).max(0.0), (y - 50.0).max(0.0)),
        None => bouwer.center(),
    };
    bouwer.build().map(|_| ()).map_err(|e| e.to_string())
}

/// Het doelvenster neemt het pakket op; het blijft bewaard tot bevestigen of weigeren.
#[tauri::command]
pub fn neem_overdracht(
    sleutel: String,
    vensters: tauri::State<Vensters>,
) -> Result<tauri::ipc::Response, String> {
    let mut pakketten = vensters.pakketten.lock().map_err(|e| e.to_string())?;
    let pakket = pakketten
        .get_mut(&sleutel)
        .ok_or_else(|| crate::taal::t("errors.window.transferExpired"))?;
    if pakket.geclaimd {
        return Err(crate::taal::t("errors.window.transferAlreadyTaken"));
    }
    pakket.geclaimd = true;
    Ok(tauri::ipc::Response::new(pakket.bytes.clone()))
}

#[tauri::command]
pub fn bevestig_overdracht(
    app: tauri::AppHandle,
    venster: tauri::Window,
    sleutel: String,
    vensters: tauri::State<Vensters>,
    werkbestanden: tauri::State<crate::werkbestanden::Werkbestanden>,
) -> Result<(), String> {
    let pakket = vensters
        .pakketten
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&sleutel)
        .ok_or_else(|| crate::taal::t("errors.window.transferUnknown"))?;
    if let Some(token) = &pakket.token {
        werkbestanden.herbind(token, venster.label());
    }
    app.emit_to(pakket.bron.as_str(), "office-overdracht-bevestigd", sleutel)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn weiger_overdracht(
    app: tauri::AppHandle,
    sleutel: String,
    vensters: tauri::State<Vensters>,
) -> Result<(), String> {
    let Some(pakket) = vensters
        .pakketten
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&sleutel)
    else {
        return Ok(());
    };
    app.emit_to(pakket.bron.as_str(), "office-overdracht-geweigerd", sleutel)
        .map_err(|e| e.to_string())
}

/// Na een time-out: intrekken als nog niet opgenomen ("ingetrokken"), anders "geclaimd".
#[tauri::command]
pub fn trek_overdracht_in(
    app: tauri::AppHandle,
    sleutel: String,
    vensters: tauri::State<Vensters>,
) -> Result<String, String> {
    let mut pakketten = vensters.pakketten.lock().map_err(|e| e.to_string())?;
    let stand = trek_in(&mut pakketten, &sleutel);
    drop(pakketten);
    if let Some(Some(label)) = stand.as_ref().ok() {
        // Het lege venster dat het pakket nooit opnam, verdwijnt weer.
        if let Some(venster) = app.get_webview_window(label) {
            let _ = venster.destroy();
        }
    }
    Ok(match stand {
        Ok(_) => "ingetrokken",
        Err(true) => "geclaimd",
        Err(false) => "onbekend",
    }
    .into())
}

/// Ok(venster) als ingetrokken; Err(true) als al opgenomen; Err(false) als onbekend.
fn trek_in(
    pakketten: &mut HashMap<String, Pakket>,
    sleutel: &str,
) -> Result<Option<String>, bool> {
    match pakketten.get(sleutel) {
        None => Err(false),
        Some(p) if p.geclaimd => Err(true),
        Some(_) => Ok(pakketten.remove(sleutel).and_then(|p| p.venster)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pakket(geclaimd: bool) -> Pakket {
        Pakket {
            bron: "main".into(),
            venster: Some("document-2".into()),
            bytes: vec![0, 0, 0, 0],
            geclaimd,
            token: None,
        }
    }

    #[test]
    fn intrekken_alleen_als_nog_niet_opgenomen() {
        let mut p = HashMap::new();
        p.insert("a".to_owned(), pakket(false));
        p.insert("b".to_owned(), pakket(true));
        assert_eq!(trek_in(&mut p, "a"), Ok(Some("document-2".into())));
        assert!(!p.contains_key("a"));
        assert_eq!(trek_in(&mut p, "b"), Err(true));
        assert!(p.contains_key("b"));
        assert_eq!(trek_in(&mut p, "c"), Err(false));
    }

    #[test]
    fn token_uit_de_kop_van_het_pakket() {
        let kop = br#"{"type":"document","werkbestand":{"token":"abc123","naam":"a.docx"}}"#;
        let mut pakket = (kop.len() as u32).to_le_bytes().to_vec();
        pakket.extend_from_slice(kop);
        pakket.extend_from_slice(b"PK...");
        assert_eq!(token_uit_pakket(&pakket), Some("abc123".into()));
        assert_eq!(token_uit_pakket(&[9, 0, 0, 0, b'{']), None);
        let kop = br#"{"type":"module"}"#;
        let mut pakket = (kop.len() as u32).to_le_bytes().to_vec();
        pakket.extend_from_slice(kop);
        assert_eq!(token_uit_pakket(&pakket), None);
    }

    #[test]
    fn venstermenu_toont_het_hoofdvenster_eerst() {
        let v = Vensters::default();
        let tab = |id, titel: &str| TabInfo {
            id,
            titel: titel.into(),
            gewijzigd: false,
        };
        {
            let mut t = v.tabbladen.lock().unwrap();
            t.insert("document-12".into(), vec![tab(1, "c.pptx")]);
            t.insert("main".into(), vec![tab(3, "a.docx"), tab(4, "Notities")]);
            t.insert("document-3".into(), vec![tab(1, "b.xlsx")]);
        }
        let o = v.overzicht();
        assert_eq!(
            o.iter().map(|w| w.label.as_str()).collect::<Vec<_>>(),
            ["main", "document-3", "document-12"]
        );
        assert!(o[0].hoofd);
        assert_eq!(o[0].tabbladen.len(), 2);
    }

    #[test]
    fn sluitvraag_noemt_het_aantal() {
        assert!(sluitvraag(1).starts_with("Eén document"));
        assert!(sluitvraag(3).starts_with("3 documenten"));
    }

    #[test]
    fn wijzigingen_per_venster() {
        let v = Vensters::default();
        v.gewijzigd.lock().unwrap().insert("main".into(), 2);
        assert_eq!(v.aantal_gewijzigd("main"), 2);
        assert_eq!(v.aantal_gewijzigd("document-1"), 0);
        v.vergeet("main");
        assert_eq!(v.aantal_gewijzigd("main"), 0);
    }

    #[test]
    fn loslaten_boven_een_ander_venster_kiest_dat_venster() {
        let r = |x, y, breedte, hoogte| Rechthoek { x, y, breedte, hoogte };
        let vensters = vec![
            ("document-4".to_owned(), r(900.0, 100.0, 800.0, 600.0)),
            ("main".to_owned(), r(0.0, 0.0, 1440.0, 950.0)),
        ];
        // Overlap: het eerst genoemde (laatst actieve) venster wint.
        assert_eq!(
            venster_onder_punt(&vensters, (1000.0, 200.0), "document-7").as_deref(),
            Some("document-4")
        );
        // Het bronvenster zelf telt niet mee.
        assert_eq!(
            venster_onder_punt(&vensters, (1000.0, 200.0), "document-4").as_deref(),
            Some("main")
        );
        assert_eq!(venster_onder_punt(&vensters, (100.0, 100.0), "main"), None);
        // Buiten alle vensters (of rand rechts/onder): een nieuw venster.
        assert_eq!(venster_onder_punt(&vensters, (1440.0, 960.0), "document-4"), None);
        assert_eq!(venster_onder_punt(&vensters, (-5.0, 10.0), "document-4"), None);
    }
}
