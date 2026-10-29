use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};

/// Pad naar het conversieprogramma; heeft altijd voorrang op een keuze in de app en op automatisch zoeken.
const PROGRAMMA_VARIABELE: &str = "OPENAEC_CONVERSIE_PROGRAMMA";
/// Optioneel eigen profielbestand; zonder deze variabele wordt het ingebouwde veilige profiel gebruikt.
const PROFIEL_VARIABELE: &str = "OPENAEC_CONVERSIE_PROFIEL";
/// Veilig standaardprofiel: macro's uit, geen externe koppelingen bijwerken, geen updatecontrole (zie het bestand).
const VEILIG_PROFIEL: &str = include_str!("conversieprofiel.xcu");
/// Bestand in de app-gegevensmap waarin een zelf gekozen conversieprogramma wordt bewaard.
const INSTELLINGEN: &str = "conversie.json";
const MAX_BYTES: u64 = 100 * 1024 * 1024;

fn catalogus() -> Value {
    serde_json::from_str(include_str!("../../src/formaten.json"))
        .expect("Ongeldige ingebouwde formaatcatalogus")
}
pub fn mag_bewaren(ext: &str) -> bool {
    catalogus().as_object().is_some_and(|modules| {
        modules
            .values()
            .any(|module| module["uitvoer"].get(ext).is_some())
    })
}
/// Formaten die de app kan openen (kantoormodules uit de catalogus plus Access-databases).
pub fn mag_openen(ext: &str) -> bool {
    matches!(ext, "mdb" | "accdb")
        || catalogus().as_object().is_some_and(|modules| {
            modules.values().any(|module| {
                module["invoer"]
                    .as_array()
                    .is_some_and(|l| l.iter().any(|e| e.as_str() == Some(ext)))
            })
        })
}
/// Exportfilter en standaardfilteropties uit de catalogus; alleen formaten met een runtimefilter.
fn filter(bron: &str, doel: &str, module: &str) -> Result<(String, String), String> {
    let catalogus = catalogus();
    let gegevens = catalogus.get(module).ok_or_else(|| crate::taal::t("errors.conversion.unknownModule"))?;
    if !gegevens["invoer"]
        .as_array()
        .is_some_and(|invoer| invoer.iter().any(|ext| ext.as_str() == Some(bron)))
    {
        return Err(crate::taal::t("errors.conversion.sourceFormatMismatch"));
    }
    let formaat = gegevens["uitvoer"]
        .get(doel)
        .ok_or_else(|| crate::taal::t("errors.conversion.outputFormatUnsupported"))?;
    let naam = formaat["filter"]
        .as_str()
        .ok_or_else(|| crate::taal::t("errors.conversion.outputFormatDirect"))?;
    Ok((
        naam.to_owned(),
        formaat["opties"].as_str().unwrap_or("").to_owned(),
    ))
}

/// Door de gebruiker gekozen filteropties; elke waarde wordt hier gecontroleerd en zelf opgebouwd.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Opties {
    /// Scheidingsteken voor CSV/TSV.
    pub scheidingsteken: Option<char>,
    /// `utf8`, `utf8-bom` of `windows-1252`.
    pub codering: Option<String>,
    /// 1-gebaseerd bladnummer voor CSV/TSV.
    pub blad: Option<u32>,
    /// PDF/A-versie: 1, 2 of 3 (deel b).
    pub pdfa: Option<u8>,
    pub bladwijzers: Option<bool>,
    /// Paginabereik zoals `1-3,5`.
    pub bereik: Option<String>,
}

impl Opties {
    /// Leest de optiekop (JSON) van de frontend; onbekende of ongeldige waarden worden geweigerd.
    pub fn uit_json(tekst: &str) -> Result<Self, String> {
        let fout = || crate::taal::t("errors.conversion.invalidOptions");
        let waarde: Value = serde_json::from_str(tekst).map_err(|_| fout())?;
        let object = waarde.as_object().ok_or_else(fout)?;
        let mut opties = Opties::default();
        for (sleutel, waarde) in object {
            match sleutel.as_str() {
                "scheidingsteken" => {
                    let teken = match waarde.as_str().ok_or_else(fout)? {
                        ";" => ';',
                        "," => ',',
                        "\t" | "tab" => '\t',
                        "|" => '|',
                        _ => return Err(fout()),
                    };
                    opties.scheidingsteken = Some(teken);
                }
                "codering" => {
                    let codering = waarde.as_str().ok_or_else(fout)?;
                    if !["utf8", "utf8-bom", "windows-1252"].contains(&codering) {
                        return Err(fout());
                    }
                    opties.codering = Some(codering.into());
                }
                "blad" => {
                    let blad = waarde.as_u64().filter(|b| (1..=10_000).contains(b));
                    opties.blad = Some(blad.ok_or_else(fout)? as u32);
                }
                "pdfa" => {
                    let versie = waarde.as_u64().filter(|v| (1..=3).contains(v));
                    opties.pdfa = Some(versie.ok_or_else(fout)? as u8);
                }
                "bladwijzers" => opties.bladwijzers = Some(waarde.as_bool().ok_or_else(fout)?),
                "bereik" => {
                    let bereik = waarde.as_str().ok_or_else(fout)?.trim();
                    let geldig = !bereik.is_empty()
                        && bereik.len() <= 64
                        && bereik
                            .chars()
                            .all(|c| c.is_ascii_digit() || c == '-' || c == ',' || c == ' ')
                        && bereik.chars().any(|c| c.is_ascii_digit());
                    if !geldig {
                        return Err(fout());
                    }
                    opties.bereik = Some(bereik.into());
                }
                _ => return Err(fout()),
            }
        }
        Ok(opties)
    }
}

/// Het `--convert-to`-argument: `ext`, `ext:filter` of `ext:filter:opties`.
fn filterspecificatie(doel: &str, naam: &str, standaard: &str, opties: &Opties) -> String {
    if naam.is_empty() {
        return doel.to_owned();
    }
    let mut extra = standaard.to_owned();
    if naam == "Text - txt - csv (StarCalc)" {
        // Tokens: scheidingsteken, tekstteken, tekenset, eerste regel, celopmaak, taal,
        // aanhalingstekens, speciale getallen, zoals weergegeven, formules, spaties, blad, -, BOM.
        let mut tokens: Vec<String> = standaard.split(',').map(str::to_owned).collect();
        tokens.resize(14, String::new());
        if let Some(teken) = opties.scheidingsteken {
            tokens[0] = (teken as u32).to_string();
        }
        match opties.codering.as_deref() {
            Some("utf8") => {
                tokens[2] = "76".into();
                tokens[13] = "false".into();
            }
            Some("utf8-bom") => {
                tokens[2] = "76".into();
                tokens[13] = "true".into();
            }
            Some("windows-1252") => {
                tokens[2] = "1".into();
                tokens[13] = "false".into();
            }
            _ => {}
        }
        if let Some(blad) = opties.blad {
            tokens[11] = blad.to_string();
        }
        extra = tokens.join(",");
    } else if naam.ends_with("_pdf_Export") {
        let mut velden = serde_json::Map::new();
        if let Some(versie) = opties.pdfa {
            velden.insert(
                "SelectPdfVersion".into(),
                json!({"type": "long", "value": versie.to_string()}),
            );
        }
        if let Some(bladwijzers) = opties.bladwijzers {
            velden.insert(
                "ExportBookmarks".into(),
                json!({"type": "boolean", "value": bladwijzers.to_string()}),
            );
        }
        if let Some(bereik) = &opties.bereik {
            velden.insert(
                "PageRange".into(),
                json!({"type": "string", "value": bereik.replace(' ', "")}),
            );
        }
        if !velden.is_empty() {
            extra = Value::Object(velden).to_string();
        }
    }
    if extra.is_empty() {
        format!("{doel}:{naam}")
    } else {
        format!("{doel}:{naam}:{extra}")
    }
}

/// Waar het gebruikte conversieprogramma vandaan komt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Bron {
    Omgeving,
    Instelling,
    Automatisch,
}
impl Bron {
    fn naam(self) -> &'static str {
        match self {
            Bron::Omgeving => "omgeving",
            Bron::Instelling => "instelling",
            Bron::Automatisch => "automatisch",
        }
    }
}

fn uit_omgeving(variabele: &str) -> Option<PathBuf> {
    std::env::var_os(variabele)
        .map(PathBuf::from)
        .filter(|pad| pad.is_file())
}

/// Vaste, bekende installatiepaden; er wordt niet door willekeurige mappen gezocht.
fn bekende_paden() -> Vec<PathBuf> {
    let mut paden: Vec<PathBuf> = vec![];
    #[cfg(target_os = "linux")]
    {
        paden.push("/usr/bin/soffice".into());
        paden.push("/usr/lib/libreoffice/program/soffice".into());
        paden.push("/usr/lib64/libreoffice/program/soffice".into());
        if let Ok(mappen) = fs::read_dir("/opt") {
            let mut opt: Vec<PathBuf> = mappen
                .flatten()
                .filter(|map| {
                    map.file_name()
                        .to_str()
                        .is_some_and(|naam| naam.starts_with("libreoffice"))
                })
                .map(|map| map.path().join("program/soffice"))
                .collect();
            // Nieuwste versie eerst (libreoffice24.8 vóór libreoffice7.6 bij gelijke lengte).
            opt.sort_by(|a, b| b.cmp(a));
            paden.extend(opt);
        }
        paden.push("/var/lib/flatpak/exports/bin/org.libreoffice.LibreOffice".into());
        if let Some(thuis) = std::env::var_os("HOME") {
            paden.push(
                PathBuf::from(thuis)
                    .join(".local/share/flatpak/exports/bin/org.libreoffice.LibreOffice"),
            );
        }
    }
    #[cfg(target_os = "macos")]
    paden.push("/Applications/LibreOffice.app/Contents/MacOS/soffice".into());
    #[cfg(windows)]
    for variabele in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
        if let Some(map) = std::env::var_os(variabele) {
            paden.push(PathBuf::from(map).join(r"LibreOffice\program\soffice.exe"));
        }
    }
    // Gelijk aan `which soffice`: alleen dit ene programmanaam in het zoekpad.
    #[cfg(unix)]
    if let Some(zoekpad) = std::env::var_os("PATH") {
        paden.extend(std::env::split_paths(&zoekpad).map(|map| map.join("soffice")));
    }
    paden
}

fn is_flatpak(pad: &Path) -> bool {
    pad.file_name()
        .and_then(|naam| naam.to_str())
        .is_some_and(|naam| naam == "org.libreoffice.LibreOffice")
}

/// Alleen een bestaand, uitvoerbaar bestand met de naam soffice, soffice.exe of soffice.bin.
pub fn controleer_keuze(pad: &Path) -> Result<PathBuf, String> {
    let naam = pad
        .file_name()
        .and_then(|naam| naam.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !["soffice", "soffice.exe", "soffice.bin"].contains(&naam.as_str()) {
        return Err(crate::taal::t("errors.conversion.chooseSoffice"));
    }
    let pad = fs::canonicalize(pad).map_err(|_| crate::taal::t("errors.conversion.chosenFileMissing"))?;
    let gegevens = fs::metadata(&pad).map_err(|e| e.to_string())?;
    if !gegevens.is_file() {
        return Err(crate::taal::t("errors.conversion.chosenPathNotFile"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if gegevens.permissions().mode() & 0o111 == 0 {
            return Err(crate::taal::t("errors.conversion.chosenFileNotExecutable"));
        }
    }
    Ok(pad)
}

/// Omgeving gaat voor; daarna de keuze in de app; daarna automatisch zoeken.
pub fn vind_programma(instelling: Option<&Path>) -> Option<(PathBuf, Bron)> {
    if let Some(pad) = uit_omgeving(PROGRAMMA_VARIABELE) {
        return Some((pad, Bron::Omgeving));
    }
    if let Some(pad) = instelling.and_then(|pad| controleer_keuze(pad).ok()) {
        return Some((pad, Bron::Instelling));
    }
    bekende_paden()
        .into_iter()
        .find(|pad| pad.is_file())
        .map(|pad| (pad, Bron::Automatisch))
}

fn instellingenbestand(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .ok()
        .map(|map| map.join(INSTELLINGEN))
}
pub fn lees_instelling(app: &tauri::AppHandle) -> Option<PathBuf> {
    let tekst = fs::read_to_string(instellingenbestand(app)?).ok()?;
    let waarde: Value = serde_json::from_str(&tekst).ok()?;
    waarde["programma"].as_str().map(PathBuf::from)
}
fn bewaar_instelling(app: &tauri::AppHandle, pad: Option<&Path>) -> Result<(), String> {
    let bestand = instellingenbestand(app).ok_or_else(|| crate::taal::t("errors.conversion.appDataDirUnavailable"))?;
    match pad {
        Some(pad) => {
            fs::create_dir_all(bestand.parent().unwrap()).map_err(|e| e.to_string())?;
            fs::write(
                &bestand,
                serde_json::to_vec_pretty(&json!({"programma": pad.to_string_lossy()})).unwrap(),
            )
            .map_err(|e| e.to_string())
        }
        None => match fs::remove_file(&bestand) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        },
    }
}

fn stop(kind: &mut std::process::Child) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(kind.id() as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &kind.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = kind.kill();
    let _ = kind.wait();
}

fn voer_uit(opdracht: &mut Command, tijdslimiet: Duration) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        opdracht.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        opdracht.creation_flags(0x08000000);
    }
    let mut kind = opdracht
        .spawn()
        .map_err(|e| crate::taal::t_met("errors.conversion.startFailed", &[("error", &e.to_string())]))?;
    let start = Instant::now();
    loop {
        match kind.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(status)) => {
                let reden = status
                    .code()
                    .map(|code| {
                        crate::taal::t_met("errors.conversion.exitCode", &[("code", &code.to_string())])
                    })
                    .unwrap_or_else(|| crate::taal::t("errors.conversion.processAborted"));
                return Err(crate::taal::t_met("errors.conversion.failed", &[("reason", &reden)]));
            }
            Ok(None) if start.elapsed() < tijdslimiet => {
                std::thread::sleep(Duration::from_millis(30))
            }
            Ok(None) => {
                stop(&mut kind);
                return Err(crate::taal::t("errors.conversion.timeout"));
            }
            Err(e) => {
                stop(&mut kind);
                return Err(e.to_string());
            }
        }
    }
}

/// Tijdelijke werkmap; een Flatpak-runtime ziet de /tmp van het systeem niet.
fn werkmap(programma: &Path) -> Result<tempfile::TempDir, String> {
    if is_flatpak(programma) {
        if let Some(thuis) = std::env::var_os("HOME") {
            let basis = PathBuf::from(thuis).join(".cache/openaec-conversie");
            fs::create_dir_all(&basis).map_err(|e| e.to_string())?;
            return tempfile::tempdir_in(basis).map_err(|e| e.to_string());
        }
    }
    tempfile::tempdir().map_err(|e| e.to_string())
}

/// Nieuw gebruikersprofiel per aanroep, met het eigen of het veilige standaardprofiel.
fn maak_profiel(map: &Path) -> Result<tauri::Url, String> {
    let profiel = map.join("profiel");
    fs::create_dir_all(profiel.join("user")).map_err(|e| e.to_string())?;
    let doel = profiel.join("user/registrymodifications.xcu");
    match uit_omgeving(PROFIEL_VARIABELE) {
        Some(bron) => fs::copy(bron, doel).map(|_| ()),
        None => fs::write(doel, VEILIG_PROFIEL),
    }
    .map_err(|e| e.to_string())?;
    tauri::Url::from_directory_path(&profiel)
        .map_err(|_| crate::taal::t("errors.conversion.profilePathInvalid"))
}

static VERSIES: Mutex<Option<HashMap<PathBuf, String>>> = Mutex::new(None);

/// Versieregel van het programma (`--version`), met tijdslimiet en tijdelijk profiel.
pub fn versie(programma: &Path) -> Option<String> {
    if let Some(versie) = VERSIES
        .lock()
        .ok()?
        .as_ref()
        .and_then(|cache| cache.get(programma).cloned())
    {
        return Some(versie);
    }
    let map = werkmap(programma).ok()?;
    let profiel = maak_profiel(map.path()).ok()?;
    let uitvoer = map.path().join("versie.txt");
    let bestand = fs::File::create(&uitvoer).ok()?;
    let mut opdracht = Command::new(programma);
    opdracht
        .args([
            format!("-env:UserInstallation={profiel}"),
            "--headless".into(),
            "--version".into(),
        ])
        .stdin(Stdio::null())
        .stdout(bestand)
        .stderr(Stdio::null());
    voer_uit(&mut opdracht, Duration::from_secs(20)).ok()?;
    let tekst = fs::read_to_string(uitvoer).ok()?;
    let regel = tekst
        .lines()
        .find(|regel| regel.chars().any(|c| c.is_ascii_digit()))?
        .trim()
        .chars()
        .take(120)
        .collect::<String>();
    VERSIES
        .lock()
        .ok()?
        .get_or_insert_with(HashMap::new)
        .insert(programma.to_owned(), regel.clone());
    Some(regel)
}

pub fn status(instelling: Option<&Path>) -> Value {
    let profiel = if uit_omgeving(PROFIEL_VARIABELE).is_some() {
        "eigen"
    } else {
        "veilig"
    };
    match vind_programma(instelling) {
        Some((pad, bron)) => json!({
            "gevonden": true,
            "pad": pad.to_string_lossy(),
            "versie": versie(&pad),
            "bron": bron.naam(),
            "profiel": profiel,
            "gekozen": instelling.map(|p| p.to_string_lossy().into_owned()),
        }),
        None => json!({
            "gevonden": false,
            "profiel": profiel,
            "gekozen": instelling.map(|p| p.to_string_lossy().into_owned()),
        }),
    }
}

#[cfg(test)]
pub fn converteer(bytes: &[u8], bron: &str, doel: &str, module: &str) -> Result<Vec<u8>, String> {
    converteer_met(bytes, bron, doel, module, &Opties::default(), None)
}

pub fn converteer_met(
    bytes: &[u8],
    bron: &str,
    doel: &str,
    module: &str,
    opties: &Opties,
    instelling: Option<&Path>,
) -> Result<Vec<u8>, String> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_BYTES {
        return Err(crate::taal::t("errors.conversion.inputSize"));
    }
    let (naam, standaard) = filter(bron, doel, module)?;
    let (programma, _) = vind_programma(instelling).ok_or_else(|| crate::taal::t("errors.conversion.runtimeMissing"))?;
    let map = werkmap(&programma)?;
    let invoer = map.path().join(format!("invoer.{bron}"));
    let uit = map.path().join("uit");
    fs::create_dir(&uit).map_err(|e| e.to_string())?;
    fs::write(&invoer, bytes).map_err(|e| e.to_string())?;
    let profiel_url = maak_profiel(map.path())?;
    let log = fs::File::create(map.path().join("conversie.log")).map_err(|e| e.to_string())?;
    let mut opdracht = Command::new(programma);
    opdracht.args([
        format!("-env:UserInstallation={profiel_url}"),
        "--headless".into(),
        "--nologo".into(),
        "--nodefault".into(),
        "--norestore".into(),
        "--nolockcheck".into(),
        "--convert-to".into(),
        filterspecificatie(doel, &naam, &standaard, opties),
        "--outdir".into(),
    ]);
    opdracht
        .arg(&uit)
        .arg(&invoer)
        .stdin(Stdio::null())
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log);
    voer_uit(&mut opdracht, Duration::from_secs(45))?;
    // CSV met bladkeuze krijgt de bladnaam in de bestandsnaam; er hoort precies één resultaat te zijn.
    let resultaten: Vec<PathBuf> = fs::read_dir(&uit)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|item| item.path())
        .filter(|pad| {
            pad.is_file()
                && pad
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case(doel))
        })
        .collect();
    let [resultaat] = resultaten.as_slice() else {
        return Err(crate::taal::t(if resultaten.is_empty() {
            "errors.conversion.notConverted"
        } else {
            "errors.conversion.multipleOutputs"
        }));
    };
    let grootte = fs::metadata(resultaat).map_err(|e| e.to_string())?.len();
    if grootte == 0 || grootte > MAX_BYTES {
        return Err(crate::taal::t("errors.conversion.noUsableOutput"));
    }
    fs::read(resultaat).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn conversie_status(app: tauri::AppHandle) -> Result<Value, String> {
    let instelling = lees_instelling(&app);
    tauri::async_runtime::spawn_blocking(move || status(instelling.as_deref()))
        .await
        .map_err(|e| e.to_string())
}

/// Laat de gebruiker het programma kiezen; alleen een geldig soffice-bestand wordt bewaard.
#[tauri::command]
pub async fn kies_conversieprogramma(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    let Some(bestand) = rfd::AsyncFileDialog::new()
        .set_title(crate::taal::t("dialogs.chooseConverter"))
        .pick_file()
        .await
    else {
        return Ok(None);
    };
    let pad = controleer_keuze(bestand.path())?;
    bewaar_instelling(&app, Some(&pad))?;
    tauri::async_runtime::spawn_blocking(move || Some(status(Some(&pad))))
        .await
        .map_err(|e| e.to_string())
}

/// Vergeet de gekozen runtime; daarna geldt weer automatisch zoeken.
#[tauri::command]
pub async fn wis_conversieprogramma(app: tauri::AppHandle) -> Result<Value, String> {
    bewaar_instelling(&app, None)?;
    tauri::async_runtime::spawn_blocking(|| status(None))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn formaat_en_module_moeten_overeenkomen() {
        assert!(filter("odt", "docx", "docx").is_ok());
        assert!(filter("xls", "xlsx", "xlsx").is_ok());
        assert!(filter("ppt", "pptx", "pptx").is_ok());
        assert!(filter("odt", "xlsx", "xlsx").is_err());
        assert!(filter("../doc", "docx", "docx").is_err());
        assert!(filter("docx", "exe", "docx").is_err());
        assert!(!mag_bewaren("exe"));
        assert!(mag_bewaren("md"));
        assert!(mag_bewaren("dotx"));
        // Markdown en de dia-PNG maakt de app zelf; daarvoor bestaat geen runtimefilter.
        assert!(filter("docx", "md", "docx").is_err());
        assert!(filter("pptx", "png", "pptx").is_err());
        assert_eq!(
            filter("docx", "doc", "docx").unwrap(),
            ("MS Word 97".into(), String::new())
        );
    }

    #[test]
    fn catalogus_is_volledig() {
        let catalogus = catalogus();
        let groepen = [
            "eigen",
            "opendocument",
            "office-oud",
            "sjablonen",
            "macro",
            "web-tekst",
            "pdf-afbeelding",
        ];
        for (module, gegevens) in catalogus.as_object().unwrap() {
            let uitvoer = gegevens["uitvoer"].as_object().unwrap();
            assert!(uitvoer.contains_key(module), "{module} mist eigen formaat");
            for (ext, formaat) in uitvoer {
                assert!(formaat["naam"].as_str().is_some_and(|n| !n.is_empty()));
                assert!(
                    groepen.contains(&formaat["groep"].as_str().unwrap()),
                    "{ext}"
                );
                let route = formaat["route"].as_str().unwrap();
                assert!(route == "engine" || route == "runtime", "{ext}");
                if route == "runtime" {
                    assert!(formaat["filter"].as_str().is_some(), "{module}/{ext}");
                }
                assert!(ext.chars().all(|c| c.is_ascii_alphanumeric()));
            }
        }
    }

    #[test]
    fn filteropties_worden_veilig_opgebouwd() {
        let opties =
            Opties::uit_json(r#"{"scheidingsteken":",","codering":"windows-1252","blad":2}"#)
                .unwrap();
        let (naam, standaard) = filter("xlsx", "csv", "xlsx").unwrap();
        assert_eq!(
            filterspecificatie("csv", &naam, &standaard, &opties),
            "csv:Text - txt - csv (StarCalc):44,34,1,1,,0,false,true,false,false,false,2,false,false"
        );
        let pdf = Opties::uit_json(r#"{"pdfa":2,"bladwijzers":true,"bereik":"1-2, 4"}"#).unwrap();
        let spec = filterspecificatie("pdf", "writer_pdf_Export", "", &pdf);
        assert!(spec.starts_with("pdf:writer_pdf_Export:{"), "{spec}");
        assert!(spec.contains(r#""PageRange":{"type":"string","value":"1-2,4"}"#));
        assert!(spec.contains(r#""SelectPdfVersion":{"type":"long","value":"2"}"#));
        assert_eq!(
            filterspecificatie("pdf", "writer_pdf_Export", "", &Opties::default()),
            "pdf:writer_pdf_Export"
        );
        assert_eq!(
            filterspecificatie("txt", "Text (encoded)", "UTF8", &Opties::default()),
            "txt:Text (encoded):UTF8"
        );
        for fout in [
            r#"{"bereik":"1;rm"}"#,
            r#"{"scheidingsteken":"x"}"#,
            r#"{"codering":"utf16"}"#,
            r#"{"pdfa":7}"#,
            r#"{"onbekend":1}"#,
            r#"[]"#,
        ] {
            assert!(Opties::uit_json(fout).is_err(), "{fout}");
        }
    }

    #[test]
    fn alleen_soffice_mag_worden_gekozen() {
        let map = tempfile::tempdir().unwrap();
        let ander = map.path().join("bash");
        fs::write(&ander, b"#!/bin/sh\n").unwrap();
        assert!(controleer_keuze(&ander).is_err());
        assert!(controleer_keuze(&map.path().join("soffice")).is_err());
        let soffice = map.path().join("soffice");
        fs::write(&soffice, b"#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&soffice, fs::Permissions::from_mode(0o644)).unwrap();
            assert!(controleer_keuze(&soffice).is_err(), "niet uitvoerbaar");
            fs::set_permissions(&soffice, fs::Permissions::from_mode(0o755)).unwrap();
        }
        assert!(controleer_keuze(&soffice).is_ok());
        assert!(controleer_keuze(map.path()).is_err());
    }

    #[test]
    fn veilig_profiel_schakelt_macros_uit() {
        assert!(VEILIG_PROFIEL.contains(
            r#"<prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value>"#
        ));
        assert!(VEILIG_PROFIEL
            .contains(r#"<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value>"#));
        // Laat de PDF-export van DOCX met grafieken crashen (zie conversieprofiel.xcu).
        assert!(!VEILIG_PROFIEL.contains(r#"<prop oor:name="DisableActiveContent""#));
        let map = tempfile::tempdir().unwrap();
        if std::env::var_os(PROFIEL_VARIABELE).is_none() {
            maak_profiel(map.path()).unwrap();
            assert_eq!(
                fs::read_to_string(map.path().join("profiel/user/registrymodifications.xcu"))
                    .unwrap(),
                VEILIG_PROFIEL
            );
        }
    }

    #[test]
    fn bekende_paden_zijn_vast() {
        let paden = bekende_paden();
        assert!(!paden.is_empty());
        for pad in paden {
            let naam = pad.file_name().unwrap().to_str().unwrap();
            assert!(
                ["soffice", "soffice.exe", "org.libreoffice.LibreOffice"].contains(&naam),
                "{}",
                pad.display()
            );
        }
    }

    fn proefproces() -> Command {
        let mut opdracht = Command::new(std::env::current_exe().unwrap());
        opdracht.stdout(Stdio::null()).stderr(Stdio::null());
        opdracht
    }

    #[test]
    fn geslaagd_proces_wordt_aanvaard() {
        let mut opdracht = proefproces();
        opdracht.arg("--list");
        assert!(voer_uit(&mut opdracht, Duration::from_secs(10)).is_ok());
    }

    #[test]
    fn procesfout_wordt_geweigerd() {
        let mut opdracht = proefproces();
        opdracht.arg("--ongeldige-conversieproefoptie");
        let fout = voer_uit(&mut opdracht, Duration::from_secs(10)).unwrap_err();
        assert!(fout.contains("procescode"), "{fout}");
    }

    #[test]
    fn proces_wordt_gestopt_bij_tijdslimiet() {
        // Het eigen proefprogramma levert een wachtend kindproces op elk platform.
        if std::env::var_os("OFFICE_TEST_PROCESWACHT").is_some() {
            std::thread::sleep(Duration::from_secs(30));
            return;
        }
        let mut opdracht = proefproces();
        opdracht
            .args([
                "--exact",
                "conversie::tests::proces_wordt_gestopt_bij_tijdslimiet",
            ])
            .env("OFFICE_TEST_PROCESWACHT", "1");
        let start = Instant::now();
        let fout = voer_uit(&mut opdracht, Duration::from_millis(150)).unwrap_err();
        assert!(fout.contains("tijdslimiet"), "{fout}");
        assert!(start.elapsed() < Duration::from_secs(10));
    }

    #[test]
    #[ignore = "Vereist een geïnstalleerde kantoorruntime"]
    fn runtime_wordt_gevonden_met_versie() {
        let (pad, bron) = vind_programma(None).expect("geen runtime gevonden");
        let versie = versie(&pad).expect("geen versie");
        assert!(versie.chars().any(|c| c.is_ascii_digit()), "{versie}");
        eprintln!("{} ({}) {versie}", pad.display(), bron.naam());
    }

    #[test]
    #[ignore = "Vereist een geïnstalleerde kantoorruntime"]
    fn drie_odf_formaten_heen_en_terug() {
        for (module, odf) in [("docx", "odt"), ("xlsx", "ods"), ("pptx", "odp")] {
            let pad = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(format!("../public/templates/nieuw.{module}"));
            let origineel = fs::read(pad).unwrap();
            let open_document = converteer(&origineel, module, odf, module).unwrap();
            let opnieuw = converteer(&open_document, odf, module, module).unwrap();
            assert!(opnieuw.starts_with(b"PK"));
            assert!(!open_document.is_empty());
        }
    }

    #[test]
    #[ignore = "Vereist een geïnstalleerde kantoorruntime"]
    fn docx_met_grafiek_naar_pdf() {
        // Met DisableActiveContent in het profiel stopte de runtime hier met SIGABRT.
        let bron =
            fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/grafiek.docx")).unwrap();
        let pdf = converteer(&bron, "docx", "pdf", "docx").unwrap();
        assert!(pdf.starts_with(b"%PDF-"));
        let odt = converteer(&bron, "docx", "odt", "docx").unwrap();
        let terug = converteer(&odt, "odt", "docx", "docx").unwrap();
        assert!(terug.starts_with(b"PK"));
    }

    #[test]
    #[ignore = "Vereist een geïnstalleerde kantoorruntime"]
    fn alle_runtimeformaten_uit_de_catalogus() {
        let catalogus = catalogus();
        for (module, naam) in [
            ("docx", "Ontwerpnotitie"),
            ("xlsx", "Materiaaloverzicht"),
            ("pptx", "Ontwerpvisie"),
        ] {
            let origineel = fs::read(
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join(format!("../docs/voorbeelden/{naam}.{module}")),
            )
            .unwrap();
            for (doel, formaat) in catalogus[module]["uitvoer"].as_object().unwrap() {
                if formaat["filter"].as_str().is_none() {
                    continue;
                }
                let omgezet = converteer(&origineel, module, doel, module)
                    .unwrap_or_else(|e| panic!("{module} -> {doel}: {e}"));
                assert!(omgezet.len() > 100, "{module} -> {doel}");
            }
        }
        let csv = converteer_met(
            &fs::read(
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("../docs/voorbeelden/Materiaaloverzicht.xlsx"),
            )
            .unwrap(),
            "xlsx",
            "csv",
            "xlsx",
            &Opties::uit_json(r#"{"scheidingsteken":",","codering":"utf8","blad":1}"#).unwrap(),
            None,
        )
        .unwrap();
        let tekst = String::from_utf8(csv).unwrap();
        assert!(!tekst.starts_with('\u{feff}'));
        assert!(tekst.contains(",3068,"), "{tekst}");
        let pdf = converteer_met(
            &fs::read(
                Path::new(env!("CARGO_MANIFEST_DIR")).join("../docs/voorbeelden/Ontwerpvisie.pptx"),
            )
            .unwrap(),
            "pptx",
            "pdf",
            "pptx",
            &Opties::uit_json(r#"{"pdfa":2,"bereik":"1-2"}"#).unwrap(),
            None,
        )
        .unwrap();
        assert!(pdf.starts_with(b"%PDF-"));
        assert!(
            String::from_utf8_lossy(&pdf).contains("pdfaid:part"),
            "PDF/A-kenmerk ontbreekt"
        );
    }

    #[test]
    #[ignore = "Vereist een geïnstalleerde kantoorruntime en OFFICE_TEST_UIT"]
    fn voorbeelden_in_odf_oud_en_pdf() {
        let uit = PathBuf::from(
            std::env::var_os("OFFICE_TEST_UIT")
                .expect("Kies een uitvoermap voor de controlebestanden"),
        );
        fs::create_dir_all(&uit).unwrap();
        let mut metingen = vec![];
        for (module, naam, formaten) in [
            ("docx", "Ontwerpnotitie", ["odt", "doc", "pdf"]),
            ("xlsx", "Materiaaloverzicht", ["ods", "xls", "pdf"]),
            ("pptx", "Ontwerpvisie", ["odp", "ppt", "pdf"]),
        ] {
            let origineel = fs::read(
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join(format!("../docs/voorbeelden/{naam}.{module}")),
            )
            .unwrap();
            for formaat in formaten {
                let start = Instant::now();
                let omgezet = converteer(&origineel, module, formaat, module).unwrap();
                metingen.push(serde_json::json!({"van": module, "naar": formaat, "ms": start.elapsed().as_millis(), "bytes": omgezet.len()}));
                fs::write(uit.join(format!("{naam}.{formaat}")), &omgezet).unwrap();
                if formaat == "pdf" {
                    assert!(omgezet.starts_with(b"%PDF-"));
                } else {
                    let start = Instant::now();
                    let heropend = converteer(&omgezet, formaat, module, module).unwrap();
                    assert!(heropend.starts_with(b"PK"));
                    metingen.push(serde_json::json!({"van": formaat, "naar": module, "ms": start.elapsed().as_millis(), "bytes": heropend.len()}));
                    fs::write(uit.join(format!("{naam}-via-{formaat}.{module}")), heropend)
                        .unwrap();
                }
            }
        }
        if let Some(pad) = std::env::var_os("OFFICE_TEST_STRICT") {
            let bron = fs::read(pad).unwrap();
            let omgezet = converteer(&bron, "xlsx", "xlsx", "xlsx").unwrap();
            assert!(omgezet.starts_with(b"PK"));
            fs::write(uit.join("Strict-omgezet.xlsx"), omgezet).unwrap();
        }
        fs::write(
            uit.join("metingen.json"),
            serde_json::to_vec_pretty(&metingen).unwrap(),
        )
        .unwrap();
    }
}
