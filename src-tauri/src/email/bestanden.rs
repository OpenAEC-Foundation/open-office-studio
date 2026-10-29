//! Bestanden en externe inhoud voor Email Studio: bijlagen opslaan via de
//! native dialoog, bijlagen veilig openen met het standaardprogramma,
//! externe afbeeldingen ophalen zonder de CSP te verruimen (met
//! SSRF-bescherming) en links openen in de systeembrowser.

use super::fout::{servertekst, MailFout, Uitkomst};
use serde::Serialize;
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub const MAX_BESTAND: usize = 100 * 1024 * 1024;
pub const MAX_AFBEELDING: usize = 10 * 1024 * 1024;
const AFBEELDING_LIMIET: Duration = Duration::from_secs(10);

/* ─── Namen en inhoud controleren ─── */

/// Kale, veilige bestandsnaam (geen pad, geen stuurtekens, geen
/// Windows-gereserveerde namen of afsluitende punten).
pub fn veilige_naam(naam: &str) -> String {
    let kaal = naam.rsplit(['/', '\\']).next().unwrap_or(naam);
    let schoon: String = kaal
        .chars()
        .map(|c| {
            if c.is_control() || r#"<>:"|?*"#.contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let mut schoon = schoon
        .trim()
        .trim_start_matches('.')
        .trim_end_matches(['.', ' '])
        .to_string();
    if schoon.chars().count() > 150 {
        let ext = Path::new(&schoon)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e.chars().take(10).collect::<String>()))
            .unwrap_or_default();
        schoon = format!("{}{ext}", schoon.chars().take(120).collect::<String>());
    }
    let stam = schoon.split('.').next().unwrap_or("").to_ascii_uppercase();
    let gereserveerd = matches!(stam.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stam.starts_with("COM") || stam.starts_with("LPT")) && stam.len() == 4);
    if gereserveerd {
        schoon = format!("_{schoon}");
    }
    if schoon.is_empty() {
        "bijlage".into()
    } else {
        schoon
    }
}

/// Extensies die nooit automatisch geopend worden.
const GEWEIGERD: &[&str] = &[
    "exe",
    "msi",
    "msix",
    "msixbundle",
    "appx",
    "bat",
    "cmd",
    "com",
    "scr",
    "pif",
    "ps1",
    "psm1",
    "psd1",
    "vbs",
    "vbe",
    "js",
    "jse",
    "mjs",
    "wsf",
    "wsh",
    "hta",
    "cpl",
    "jar",
    "lnk",
    "url",
    "reg",
    "inf",
    "sh",
    "bash",
    "zsh",
    "csh",
    "command",
    "app",
    "dmg",
    "pkg",
    "deb",
    "rpm",
    "appimage",
    "run",
    "iso",
    "img",
    "vhd",
    "vhdx",
    "docm",
    "dotm",
    "xlsm",
    "xltm",
    "xlam",
    "pptm",
    "potm",
    "ppam",
    "ppsm",
    "sldm",
    "accde",
    "mde",
    "accdb",
    "mdb",
    "html",
    "htm",
    "xhtml",
    "svg",
    "xml",
    "settingcontent-ms",
    "library-ms",
    "scf",
    "dll",
    "sys",
    "drv",
    "ocx",
    "gadget",
    "application",
    "msc",
    "msp",
    "mst",
    "py",
    "pyw",
    "pl",
    "rb",
    "desktop",
    "workflow",
    "action",
    "terminal",
    "jnlp",
    "chm",
];

/// Herkent uitvoerbare inhoud aan de eerste bytes, ongeacht de extensie.
/// Geeft de Nederlandse omschrijving en de vertaalsleutel daarvan.
pub fn uitvoerbare_inhoud(b: &[u8]) -> Option<(&'static str, &'static str)> {
    let begint = |p: &[u8]| b.starts_with(p);
    if begint(b"MZ") {
        Some(("Windows-programma (PE)", "attachments.kind.windowsProgram"))
    } else if begint(b"\x7fELF") {
        Some(("Linux-programma (ELF)", "attachments.kind.linuxProgram"))
    } else if begint(&[0xfe, 0xed, 0xfa, 0xce])
        || begint(&[0xfe, 0xed, 0xfa, 0xcf])
        || begint(&[0xce, 0xfa, 0xed, 0xfe])
        || begint(&[0xcf, 0xfa, 0xed, 0xfe])
        || begint(&[0xca, 0xfe, 0xba, 0xbe])
    {
        Some((
            "macOS-programma (Mach-O) of Java-klasse",
            "attachments.kind.macProgram",
        ))
    } else if begint(b"#!") {
        Some(("script", "attachments.kind.script"))
    } else if begint(&[0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00]) {
        Some(("Windows-snelkoppeling", "attachments.kind.windowsShortcut"))
    } else {
        None
    }
}

/// Mag deze bijlage met het standaardprogramma worden geopend?
pub fn controleer_openen(naam: &str, bytes: &[u8]) -> Uitkomst<String> {
    if bytes.is_empty() || bytes.len() > MAX_BESTAND {
        return Err(
            MailFout::te_groot("De bijlage is leeg of groter dan 100 MB.")
                .sleutel("attachments.emptyOrTooLarge"),
        );
    }
    let naam = veilige_naam(naam);
    let ext = Path::new(&naam)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if GEWEIGERD.contains(&ext.as_str()) {
        let (uitleg, sleutel) = match ext.as_str() {
            "accdb" | "mdb" | "accde" | "mde" => (
                " Open Access-databases in Database Studio.",
                "attachments.blockedDatabase",
            ),
            "html" | "htm" | "xhtml" | "svg" | "xml" => (
                " Dit bestandstype kan scripts bevatten.",
                "attachments.blockedScripts",
            ),
            "docm" | "dotm" | "xlsm" | "xltm" | "xlam" | "pptm" | "potm" | "ppam" | "ppsm"
            | "sldm" => (" Dit document bevat macro's.", "attachments.blockedMacros"),
            _ => (
                " Dit bestandstype kan programma's uitvoeren.",
                "attachments.blockedExecutable",
            ),
        };
        return Err(MailFout::geweigerd(format!(
            "'{naam}' wordt om veiligheidsredenen niet automatisch geopend.{uitleg} Sla de bijlage op als je hem toch wilt bekijken."
        ))
        .sleutel(sleutel)
        .waarde("name", naam));
    }
    if let Some((soort, soort_sleutel)) = uitvoerbare_inhoud(bytes) {
        return Err(MailFout::geweigerd(format!(
            "'{naam}' is een {soort} en wordt om veiligheidsredenen niet geopend."
        ))
        .sleutel("attachments.executableContent")
        .waarde("name", naam)
        .waarde("kindKey", soort_sleutel));
    }
    Ok(naam)
}

/* ─── Tijdelijke map ─── */

const TIJDELIJK_VOORVOEGSEL: &str = "openaec-email-";

static TIJDELIJK: OnceLock<Option<PathBuf>> = OnceLock::new();

fn tijdelijke_map() -> Uitkomst<&'static Path> {
    TIJDELIJK
        .get_or_init(|| {
            ruim_oude_op();
            let map = tempfile::Builder::new()
                .prefix(TIJDELIJK_VOORVOEGSEL)
                .tempdir()
                .ok()?
                .keep();
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&map, std::fs::Permissions::from_mode(0o700));
            }
            Some(map)
        })
        .as_deref()
        .ok_or_else(|| {
            MailFout::intern("Er kon geen tijdelijke map worden gemaakt.")
                .sleutel("attachments.tempDirFailed")
        })
}

/// Restanten van eerdere sessies (ouder dan 12 uur) opruimen.
fn ruim_oude_op() {
    let Ok(lijst) = std::fs::read_dir(std::env::temp_dir()) else {
        return;
    };
    for e in lijst.flatten() {
        let naam = e.file_name();
        if !naam.to_string_lossy().starts_with(TIJDELIJK_VOORVOEGSEL) {
            continue;
        }
        let oud = e
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|d| d > Duration::from_secs(12 * 3600));
        if oud {
            verwijder_map(&e.path());
        }
    }
}

/// Bij het afsluiten van de app: de eigen tijdelijke map verwijderen.
pub fn ruim_tijdelijk_op() {
    if let Some(Some(map)) = TIJDELIJK.get() {
        verwijder_map(map);
    }
}

/// Verwijdert een map met alleen-lezen bestanden (Windows weigert die anders).
fn verwijder_map(map: &Path) {
    fn schrijfbaar(p: &Path) {
        if let Ok(lijst) = std::fs::read_dir(p) {
            for e in lijst.flatten() {
                let pad = e.path();
                if pad.is_dir() {
                    schrijfbaar(&pad);
                } else if let Ok(m) = std::fs::metadata(&pad) {
                    let mut r = m.permissions();
                    #[allow(clippy::permissions_set_readonly_false)]
                    r.set_readonly(false);
                    let _ = std::fs::set_permissions(&pad, r);
                }
            }
        }
    }
    schrijfbaar(map);
    let _ = std::fs::remove_dir_all(map);
}

/// Schrijft de bijlage alleen-lezen in de eigen tijdelijke map en geeft het pad.
pub fn schrijf_tijdelijk(naam: &str, bytes: &[u8]) -> Uitkomst<PathBuf> {
    let naam = controleer_openen(naam, bytes)?;
    let map = tijdelijke_map()?;
    let fout = |_| {
        MailFout::intern("De bijlage kon niet tijdelijk worden opgeslagen.")
            .sleutel("attachments.tempSaveFailed")
    };
    // Eigen submap per bijlage, zodat gelijke namen niet botsen.
    let sub = tempfile::Builder::new()
        .prefix("b")
        .tempdir_in(map)
        .map_err(fout)?
        .keep();
    let pad = sub.join(&naam);
    std::fs::write(&pad, bytes).map_err(fout)?;
    let mut rechten = std::fs::metadata(&pad).map_err(fout)?.permissions();
    rechten.set_readonly(true);
    let _ = std::fs::set_permissions(&pad, rechten);
    Ok(pad)
}

/* ─── Links ─── */

pub fn controleer_link(url: &str) -> Uitkomst<()> {
    let u = url.trim();
    let schema_ok = ["http://", "https://", "mailto:"]
        .iter()
        .any(|s| u.len() > s.len() && u[..s.len()].eq_ignore_ascii_case(s));
    if !schema_ok || u.len() > 8192 || u.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(
            MailFout::geweigerd("Alleen http-, https- en mailto-links kunnen worden geopend.")
                .sleutel("links.unsupportedScheme"),
        );
    }
    Ok(())
}

/* ─── Externe afbeeldingen (SSRF-bescherming) ─── */

/// Alleen publieke adressen: geen loopback, privé, link-local, CGNAT,
/// multicast, documentatie- of gereserveerde reeksen.
pub fn is_publiek(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            let o = v.octets();
            !(v.is_loopback()
                || v.is_private()
                || v.is_link_local()
                || v.is_unspecified()
                || v.is_broadcast()
                || v.is_multicast()
                || v.is_documentation()
                || o[0] == 0
                || (o[0] == 100 && (64..128).contains(&o[1]))
                || (o[0] == 192 && o[1] == 0 && o[2] == 0)
                || (o[0] == 198 && (o[1] == 18 || o[1] == 19))
                || o[0] >= 240)
        }
        IpAddr::V6(v) => {
            if let Some(v4) = v.to_ipv4_mapped() {
                return is_publiek(IpAddr::V4(v4));
            }
            let s = v.segments();
            !(v.is_loopback()
                || v.is_unspecified()
                || v.is_multicast()
                || (s[0] & 0xfe00) == 0xfc00
                || (s[0] & 0xffc0) == 0xfe80
                || (s[0] == 0x2001 && s[1] == 0x0db8)
                || (s[0] == 0x64 && s[1] == 0xff9b)
                || s[0] == 0x0100)
        }
    }
}

/// Afbeeldingstype aan de magische bytes; SVG wordt bewust niet herkend
/// (kan scripts bevatten).
pub fn afbeeldingstype(b: &[u8]) -> Option<&'static str> {
    let begint = |p: &[u8]| b.starts_with(p);
    if begint(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if begint(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if begint(b"GIF87a") || begint(b"GIF89a") {
        Some("image/gif")
    } else if b.len() >= 12 && &b[..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        Some("image/webp")
    } else if begint(b"BM") && b.len() > 26 {
        Some("image/bmp")
    } else if begint(&[0, 0, 1, 0]) {
        Some("image/x-icon")
    } else if b.len() >= 12 && &b[4..8] == b"ftyp" && (&b[8..12] == b"avif" || &b[8..12] == b"avis")
    {
        Some("image/avif")
    } else {
        None
    }
}

#[derive(Debug)]
struct Doel {
    tls: bool,
    host: String,
    poort: u16,
    pad: String,
}

fn ontleed(url: &str) -> Uitkomst<Doel> {
    let fout = || {
        MailFout::geweigerd("Alleen http- en https-adressen zijn toegestaan.")
            .sleutel("images.httpOnly")
    };
    let (tls, rest) = if let Some(r) = url.strip_prefix("https://") {
        (true, r)
    } else if let Some(r) = url.strip_prefix("http://") {
        (false, r)
    } else {
        return Err(fout());
    };
    if url.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(fout());
    }
    let (gezag, pad) = match rest.find(['/', '?', '#']) {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    if gezag.contains('@') {
        return Err(
            MailFout::geweigerd("Adressen met inloggegevens worden niet opgehaald.")
                .sleutel("images.credentialsInUrl"),
        );
    }
    let pad = pad.split('#').next().unwrap_or("/");
    let pad = if pad.starts_with('/') {
        pad.to_string()
    } else {
        format!("/{pad}")
    };
    let (host, poort) = if let Some(rest) = gezag.strip_prefix('[') {
        let (h, na) = rest.split_once(']').ok_or_else(fout)?;
        let poort = match na.strip_prefix(':') {
            Some(p) => p.parse().map_err(|_| fout())?,
            None => {
                if tls {
                    443
                } else {
                    80
                }
            }
        };
        (h.to_string(), poort)
    } else {
        match gezag.rsplit_once(':') {
            Some((h, p)) => (h.to_string(), p.parse().map_err(|_| fout())?),
            None => (gezag.to_string(), if tls { 443 } else { 80 }),
        }
    };
    if host.is_empty() || !super::autoconfig::is_host(&host) {
        return Err(fout());
    }
    Ok(Doel {
        tls,
        host: host.to_ascii_lowercase(),
        poort,
        pad,
    })
}

/// Lost op en geeft alleen een publiek adres terug (ook na doorverwijzing
/// opnieuw gecontroleerd); verbonden wordt met precies dit adres.
async fn publiek_adres(host: &str, poort: u16) -> Uitkomst<SocketAddr> {
    let adressen: Vec<SocketAddr> = tokio::net::lookup_host((host, poort))
        .await
        .map_err(|_| {
            MailFout::niet_gevonden(format!("{host} is niet gevonden."))
                .sleutel("images.hostNotFound")
                .waarde("host", host)
        })?
        .collect();
    if adressen.is_empty() || adressen.iter().any(|a| !is_publiek(a.ip())) {
        return Err(MailFout::geweigerd(
            "Externe inhoud van interne of lokale adressen wordt niet opgehaald.",
        )
        .sleutel("images.privateAddress"));
    }
    Ok(adressen[0])
}

async fn een_get(d: &Doel) -> Uitkomst<(u16, Vec<(String, String)>, Vec<u8>)> {
    let adres = publiek_adres(&d.host, d.poort).await?;
    let tcp = tokio::net::TcpStream::connect(adres)
        .await
        .map_err(|e| super::fout::uit_io(&e, &d.host))?;
    let verzoek = format!(
        "GET {} HTTP/1.0\r\nHost: {}\r\nUser-Agent: Mozilla/5.0\r\nAccept: image/*\r\nConnection: close\r\n\r\n",
        d.pad, d.host
    );
    if d.tls {
        let naam = rustls::pki_types::ServerName::try_from(d.host.clone())
            .map_err(|_| {
                MailFout::geweigerd("Ongeldige servernaam.").sleutel("images.invalidServerName")
            })?;
        let s = tokio_rustls::TlsConnector::from(super::imap::tls_instellingen())
            .connect(naam, tcp)
            .await
            .map_err(|e| super::fout::uit_io(&e, &d.host))?;
        lees(s, &verzoek, &d.host).await
    } else {
        lees(tcp, &verzoek, &d.host).await
    }
}

async fn lees<S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin>(
    mut s: S,
    verzoek: &str,
    host: &str,
) -> Uitkomst<(u16, Vec<(String, String)>, Vec<u8>)> {
    s.write_all(verzoek.as_bytes())
        .await
        .map_err(|e| super::fout::uit_io(&e, host))?;
    let mut alles = Vec::new();
    let mut buf = [0u8; 16384];
    loop {
        match s.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                alles.extend_from_slice(&buf[..n]);
                if alles.len() > MAX_AFBEELDING + 64 * 1024 {
                    return Err(te_grote_afbeelding());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(e) => return Err(super::fout::uit_io(&e, host)),
        }
    }
    let ongeldig = || MailFout::verbinding("Ongeldig antwoord.").sleutel("http.invalidResponse");
    let eind = alles
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or_else(ongeldig)?;
    let kop = String::from_utf8_lossy(&alles[..eind]).to_string();
    let mut regels = kop.split("\r\n");
    let status: u16 = regels
        .next()
        .and_then(|r| r.split_whitespace().nth(1))
        .and_then(|s| s.parse().ok())
        .ok_or_else(ongeldig)?;
    let koppen = regels
        .filter_map(|r| r.split_once(':'))
        .map(|(k, v)| (k.trim().to_ascii_lowercase(), servertekst(v)))
        .collect();
    Ok((status, koppen, alles[eind + 4..].to_vec()))
}

fn te_grote_afbeelding() -> MailFout {
    MailFout::te_groot("De afbeelding is groter dan 10 MB.").sleutel("images.tooLarge")
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExterneInhoud {
    /// Base64-gecodeerde afbeelding.
    pub bytes: String,
    pub content_type: String,
}

pub async fn haal_afbeelding(url: &str) -> Uitkomst<ExterneInhoud> {
    use base64::Engine;
    let werk = async {
        let mut doel = ontleed(url.trim())?;
        for _ in 0..4 {
            let (status, koppen, lichaam) = een_get(&doel).await?;
            let kop = |n: &str| koppen.iter().find(|(k, _)| k == n).map(|(_, v)| v.clone());
            match status {
                200 => {
                    if lichaam.len() > MAX_AFBEELDING {
                        return Err(te_grote_afbeelding());
                    }
                    let opgegeven = kop("content-type").unwrap_or_default().to_ascii_lowercase();
                    if !opgegeven.starts_with("image/") {
                        return Err(MailFout::geweigerd("Dit adres levert geen afbeelding.")
                            .sleutel("images.notAnImage"));
                    }
                    let soort = afbeeldingstype(&lichaam).ok_or_else(|| {
                        MailFout::geweigerd("De inhoud is geen ondersteunde afbeelding.")
                            .sleutel("images.unsupportedImage")
                    })?;
                    return Ok(ExterneInhoud {
                        bytes: base64::engine::general_purpose::STANDARD.encode(&lichaam),
                        content_type: soort.to_string(),
                    });
                }
                301 | 302 | 303 | 307 | 308 => {
                    let locatie = kop("location")
                        .ok_or_else(|| {
                            MailFout::niet_gevonden("Doorverwijzing zonder adres.")
                                .sleutel("http.redirectWithoutLocation")
                        })?;
                    doel = if locatie.starts_with("http://") || locatie.starts_with("https://") {
                        ontleed(&locatie)?
                    } else if locatie.starts_with('/') && !locatie.starts_with("//") {
                        Doel {
                            pad: locatie,
                            ..doel
                        }
                    } else {
                        return Err(MailFout::geweigerd("Onbekende doorverwijzing.")
                            .sleutel("images.unknownRedirect"));
                    };
                }
                _ => {
                    return Err(MailFout::niet_gevonden(format!(
                        "De afbeelding is niet beschikbaar (HTTP {status})."
                    ))
                    .sleutel("images.unavailable")
                    .waarde("status", status))
                }
            }
        }
        Err(MailFout::geweigerd("Te veel doorverwijzingen (maximaal 3).")
            .sleutel("images.tooManyRedirects"))
    };
    tokio::time::timeout(AFBEELDING_LIMIET, werk)
        .await
        .map_err(|_| {
            MailFout::tijdslimiet("De afbeelding laadde niet binnen 10 seconden.")
                .sleutel("images.timeout")
        })?
}

/* ─── Tauri-opdrachten ─── */

fn lees_verzoek(request: &tauri::ipc::Request<'_>) -> Uitkomst<(String, Vec<u8>)> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) if !b.is_empty() && b.len() <= MAX_BESTAND => b.clone(),
        _ => {
            return Err(MailFout::te_groot(
                "Stuur de bijlage als binaire gegevens van maximaal 100 MB.",
            )
            .sleutel("attachments.sendAsBinary"))
        }
    };
    let kop = request
        .headers()
        .get("x-email-naam")
        .and_then(|n| n.to_str().ok())
        .ok_or_else(|| {
            MailFout::geweigerd("De bestandsnaam ontbreekt.").sleutel("attachments.nameMissing")
        })?;
    let naam = percent_encoding::percent_decode_str(kop)
        .decode_utf8()
        .map_err(|_| {
            MailFout::geweigerd("Ongeldige bestandsnaam.").sleutel("attachments.invalidName")
        })?;
    Ok((veilige_naam(&naam), bytes))
}

/// Bijlage opslaan via de native dialoog; geeft het gekozen pad of null.
#[tauri::command]
pub async fn email_bewaar_bestand(request: tauri::ipc::Request<'_>) -> Uitkomst<Option<String>> {
    let (naam, bytes) = lees_verzoek(&request)?;
    let Some(bestand) = rfd::AsyncFileDialog::new()
        .set_title("Bijlage opslaan")
        .set_file_name(&naam)
        .save_file()
        .await
    else {
        return Ok(None);
    };
    let pad = bestand.path().to_path_buf();
    if pad.exists()
        && rfd::AsyncMessageDialog::new()
            .set_title("Bestand vervangen")
            .set_description(format!(
                "Het bestand {} bestaat al. Vervangen?",
                pad.display()
            ))
            .set_buttons(rfd::MessageButtons::YesNo)
            .show()
            .await
            != rfd::MessageDialogResult::Yes
    {
        return Ok(None);
    }
    // Het doel komt uitsluitend uit de native dialoog; atomair vervangen.
    tauri::async_runtime::spawn_blocking(move || {
        crate::schrijf_atomair(&pad, &bytes)
            .map_err(|_| {
                MailFout::intern("Het bestand kon niet worden opgeslagen.")
                    .sleutel("files.saveFailed")
            })?;
        Ok(Some(pad.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| MailFout::intern("Opslaan mislukt.").sleutel("common.saveFailed"))?
}

/// Bijlage openen met het standaardprogramma (na de veiligheidscontrole).
#[tauri::command]
pub async fn email_open_extern(request: tauri::ipc::Request<'_>) -> Uitkomst<()> {
    let (naam, bytes) = lees_verzoek(&request)?;
    let pad = tauri::async_runtime::spawn_blocking(move || schrijf_tijdelijk(&naam, &bytes))
        .await
        .map_err(|_| MailFout::intern("Openen mislukt.").sleutel("attachments.openFailed"))??;
    open::that_detached(&pad).map_err(|_| {
        MailFout::niet_beschikbaar("Er is geen programma gevonden om deze bijlage te openen.")
            .sleutel("attachments.noProgram")
    })
}

#[tauri::command]
pub async fn email_externe_inhoud(url: String) -> Uitkomst<ExterneInhoud> {
    haal_afbeelding(&url).await
}

/// Opent een http-, https- of mailto-link in het standaardprogramma.
#[tauri::command]
pub async fn email_open_link(url: String) -> Uitkomst<()> {
    controleer_link(&url)?;
    open::that_detached(url.trim())
        .map_err(|_| {
            MailFout::niet_beschikbaar("De link kon niet worden geopend.").sleutel("links.openFailed")
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email::fout::Foutcode;

    #[test]
    fn weigerlijst_en_namen() {
        for naam in [
            "factuur.pdf.exe",
            "x.MSI",
            "a.bat",
            "b.ps1",
            "c.vbs",
            "d.js",
            "e.hta",
            "f.jar",
            "g.lnk",
            "h.reg",
            "i.sh",
            "j.dmg",
            "k.appimage",
            "l.iso",
            "m.docm",
            "n.xlsm",
            "o.pptm",
            "p.accdb",
            "q.mdb",
            "r.html",
            "s.svg",
            "t.xml",
            "u.scr",
            "v.cpl",
            "w.exe.",
            "x.exe ",
            "y.url",
        ] {
            assert_eq!(
                controleer_openen(naam, b"inhoud").unwrap_err().code,
                Foutcode::Geweigerd,
                "{naam}"
            );
        }
        assert!(controleer_openen("p.accdb", b"x")
            .unwrap_err()
            .melding
            .contains("Database Studio"));
        for naam in [
            "tekening.pdf",
            "foto.JPG",
            "offerte.docx",
            "lijst.xlsx",
            "notitie.txt",
            "archief.zip",
        ] {
            assert!(
                controleer_openen(naam, b"%PDF-1.4 gewone inhoud").is_ok(),
                "{naam}"
            );
        }
        assert_eq!(veilige_naam("../../etc/passwd"), "passwd");
        assert_eq!(veilige_naam("C:\\Windows\\evil.pdf"), "evil.pdf");
        assert_eq!(veilige_naam(".verborgen"), "verborgen");
        assert_eq!(veilige_naam("CON.txt"), "_CON.txt");
        assert_eq!(veilige_naam("a\u{0}b?.pdf"), "a_b_.pdf");
        assert_eq!(veilige_naam(""), "bijlage");
        assert!(veilige_naam(&format!("{}.pdf", "x".repeat(400))).ends_with(".pdf"));
        assert_eq!(
            controleer_openen("leeg.pdf", b"").unwrap_err().code,
            Foutcode::TeGroot
        );
    }

    #[test]
    fn magische_bytes() {
        for (b, naam) in [
            (&b"MZ\x90\x00"[..], "rapport.pdf"),
            (b"\x7fELF\x02\x01", "foto.jpg"),
            (&[0xcf, 0xfa, 0xed, 0xfe, 7][..], "plaatje.png"),
            (&[0xca, 0xfe, 0xba, 0xbe, 0][..], "data.bin"),
            (b"#!/bin/sh\nrm -rf ~", "leesmij.txt"),
            (&[0x4c, 0, 0, 0, 1, 0x14, 2, 0][..], "map.pdf"),
        ] {
            assert_eq!(
                controleer_openen(naam, b).unwrap_err().code,
                Foutcode::Geweigerd,
                "{naam}"
            );
        }
        assert!(uitvoerbare_inhoud(b"%PDF").is_none());
    }

    #[test]
    fn tijdelijk_bestand_is_alleen_lezen() {
        let pad = schrijf_tijdelijk("../tekening.pdf", b"%PDF-1.4").unwrap();
        assert_eq!(pad.file_name().unwrap(), "tekening.pdf");
        assert!(pad.starts_with(std::env::temp_dir()));
        assert!(std::fs::metadata(&pad).unwrap().permissions().readonly());
        assert!(schrijf_tijdelijk("x.exe", b"MZ").is_err());
    }

    #[test]
    fn links() {
        assert!(controleer_link("https://openaec.org/pad?x=1").is_ok());
        assert!(controleer_link("mailto:jan@example.org").is_ok());
        assert!(controleer_link("HTTP://example.org").is_ok());
        for slecht in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "C:\\x.exe",
            "https://a b",
            "smb://srv/x",
            "https://",
        ] {
            assert!(controleer_link(slecht).is_err(), "{slecht}");
        }
    }

    #[test]
    fn ssrf_adressen() {
        for ip in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.169.254",
            "100.64.0.1",
            "0.0.0.0",
            "224.0.0.1",
            "255.255.255.255",
            "::1",
            "fd00::1",
            "fe80::1",
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
            "2001:db8::1",
        ] {
            assert!(!is_publiek(ip.parse().unwrap()), "{ip}");
        }
        for ip in ["93.184.216.34", "1.1.1.1", "2606:4700::1111"] {
            assert!(is_publiek(ip.parse().unwrap()), "{ip}");
        }
    }

    #[tokio::test]
    async fn externe_inhoud_weigert_lokale_en_vreemde_adressen() {
        for url in [
            "http://127.0.0.1/a.png",
            "http://localhost:8080/a.png",
            "http://[::1]/a.png",
            "http://10.0.0.1/a.png",
            "http://169.254.169.254/latest/meta-data",
            "file:///etc/passwd",
            "ftp://example.org/a.png",
            "http://gebruiker:ww@example.org/a.png",
        ] {
            let f = haal_afbeelding(url).await.unwrap_err();
            assert_eq!(f.code, Foutcode::Geweigerd, "{url}: {}", f.melding);
        }
    }

    #[test]
    fn afbeeldingstypen() {
        assert_eq!(afbeeldingstype(b"\x89PNG\r\n\x1a\n...."), Some("image/png"));
        assert_eq!(
            afbeeldingstype(&[0xff, 0xd8, 0xff, 0xe0]),
            Some("image/jpeg")
        );
        assert_eq!(afbeeldingstype(b"GIF89a.."), Some("image/gif"));
        assert_eq!(afbeeldingstype(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(afbeeldingstype(b"\0\0\0\x1cftypavif"), Some("image/avif"));
        assert_eq!(afbeeldingstype(b"<svg onload=alert(1)>"), None);
        assert_eq!(afbeeldingstype(b"<html>"), None);
        assert_eq!(afbeeldingstype(b"MZ"), None);
    }
}
