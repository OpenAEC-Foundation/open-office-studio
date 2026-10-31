//! Nep-IMAP- en nep-SMTP-server voor de integratietests. Draait in het
//! testproces op 127.0.0.1 met platte tekst (daarvoor is de
//! localhost-uitzondering bedoeld) en kent precies genoeg van beide
//! protocollen om de echte clientcode (async-imap en lettre) te oefenen.
//! Er wordt nooit een verbinding met een externe server gemaakt.

use base64::Engine;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

#[derive(Clone, Debug)]
pub struct NepBericht {
    pub uid: u32,
    pub vlaggen: Vec<String>,
    pub bron: Vec<u8>,
}

#[derive(Debug)]
pub struct Postbus {
    pub mappen: Vec<(String, String)>,
    pub inhoud: HashMap<String, Vec<NepBericht>>,
    pub volgende_uid: u32,
    pub gebruiker: String,
    pub wachtwoord: String,
    pub mogelijkheden: String,
    pub aanmeldingen: u32,
    pub opdrachten: Vec<String>,
    /// Geldige OAuth2-toegangstokens voor XOAUTH2.
    pub tokens: Vec<String>,
}

impl Postbus {
    pub fn nieuw(gebruiker: &str, wachtwoord: &str) -> Self {
        let mut p = Self {
            mappen: Vec::new(),
            inhoud: HashMap::new(),
            volgende_uid: 1,
            gebruiker: gebruiker.into(),
            wachtwoord: wachtwoord.into(),
            mogelijkheden: "IMAP4rev1 MOVE UIDPLUS SPECIAL-USE LITERAL+ UNSELECT".into(),
            aanmeldingen: 0,
            opdrachten: Vec::new(),
            tokens: Vec::new(),
        };
        for (naam, attr) in [
            ("INBOX", ""),
            ("Sent", "\\Sent"),
            ("Drafts", "\\Drafts"),
            ("Trash", "\\Trash"),
            ("Entw&APw-rfe", ""),
        ] {
            p.maak(naam, attr);
        }
        p
    }

    pub fn maak(&mut self, naam: &str, attr: &str) {
        self.mappen.push((naam.into(), attr.into()));
        self.inhoud.insert(naam.into(), Vec::new());
    }

    pub fn voeg_toe(&mut self, map: &str, bron: &[u8], vlaggen: &[&str]) -> u32 {
        let uid = self.volgende_uid;
        self.volgende_uid += 1;
        self.inhoud
            .get_mut(map)
            .expect("map bestaat")
            .push(NepBericht {
                uid,
                vlaggen: vlaggen.iter().map(|v| v.to_string()).collect(),
                bron: bron.to_vec(),
            });
        uid
    }
}

pub type Gedeeld = Arc<Mutex<Postbus>>;

pub async fn start_imap(postbus: Gedeeld) -> SocketAddr {
    let luisteraar = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let adres = luisteraar.local_addr().unwrap();
    tokio::spawn(async move {
        while let Ok((s, _)) = luisteraar.accept().await {
            let p = postbus.clone();
            tokio::spawn(async move {
                let _ = imap_verbinding(s, p).await;
            });
        }
    });
    adres
}

/// Splitst argumenten: "quoted" (met escapes), atomen en (groepen).
fn woorden(t: &str) -> Vec<String> {
    let mut uit = Vec::new();
    let tekens: Vec<char> = t.chars().collect();
    let mut i = 0;
    while i < tekens.len() {
        match tekens[i] {
            ' ' => i += 1,
            '"' => {
                let mut w = String::new();
                i += 1;
                while i < tekens.len() && tekens[i] != '"' {
                    if tekens[i] == '\\' && i + 1 < tekens.len() {
                        i += 1;
                    }
                    w.push(tekens[i]);
                    i += 1;
                }
                i += 1;
                uit.push(w);
            }
            '(' => {
                let mut diepte = 0;
                let mut w = String::new();
                while i < tekens.len() {
                    if tekens[i] == '(' {
                        diepte += 1;
                    }
                    if tekens[i] == ')' {
                        diepte -= 1;
                    }
                    w.push(tekens[i]);
                    i += 1;
                    if diepte == 0 {
                        break;
                    }
                }
                uit.push(w);
            }
            _ => {
                let mut w = String::new();
                while i < tekens.len() && tekens[i] != ' ' {
                    w.push(tekens[i]);
                    i += 1;
                }
                uit.push(w);
            }
        }
    }
    uit
}

fn in_set(set: &str, n: u32, max: u32) -> bool {
    set.split(',').any(|deel| match deel.split_once(':') {
        Some((a, b)) => {
            let a = if a == "*" {
                max
            } else {
                a.parse().unwrap_or(0)
            };
            let b = if b == "*" {
                max
            } else {
                b.parse().unwrap_or(0)
            };
            (a.min(b)..=a.max(b)).contains(&n)
        }
        None => {
            (if deel == "*" {
                max
            } else {
                deel.parse().unwrap_or(0)
            }) == n
        }
    })
}

fn kop_van(bron: &[u8]) -> Vec<u8> {
    match bron.windows(4).position(|w| w == b"\r\n\r\n") {
        Some(i) => bron[..i + 4].to_vec(),
        None => bron.to_vec(),
    }
}

/// Leest een opdracht inclusief eventuele literals.
async fn lees_opdracht<R: AsyncBufReadExt + Unpin, W: AsyncWriteExt + Unpin>(
    lezer: &mut R,
    schrijver: &mut W,
) -> Option<(String, Vec<Vec<u8>>)> {
    let mut regel = String::new();
    if lezer.read_line(&mut regel).await.ok()? == 0 {
        return None;
    }
    let mut literals = Vec::new();
    let mut tekst = String::new();
    loop {
        let r = regel.trim_end_matches(['\r', '\n']).to_string();
        let literal = r.rfind('{').filter(|_| r.ends_with('}')).and_then(|b| {
            let binnen = &r[b + 1..r.len() - 1];
            let plus = binnen.ends_with('+');
            binnen
                .trim_end_matches('+')
                .parse::<usize>()
                .ok()
                .map(|n| (b, n, plus))
        });
        match literal {
            Some((b, n, plus)) => {
                tekst.push_str(&r[..b]);
                tekst.push_str(&format!("{{L{}}}", literals.len()));
                if !plus {
                    schrijver.write_all(b"+ ga door\r\n").await.ok()?;
                }
                let mut buf = vec![0u8; n];
                lezer.read_exact(&mut buf).await.ok()?;
                literals.push(buf);
                regel.clear();
                lezer.read_line(&mut regel).await.ok()?;
            }
            None => {
                tekst.push_str(&r);
                return Some((tekst, literals));
            }
        }
    }
}

async fn imap_verbinding(s: TcpStream, p: Gedeeld) -> std::io::Result<()> {
    let (lees, mut schrijf) = s.into_split();
    let mut lezer = BufReader::new(lees);
    schrijf
        .write_all(b"* OK [CAPABILITY IMAP4rev1] Nep-IMAP klaar\r\n")
        .await?;
    let mut gekozen: Option<String> = None;
    while let Some((opdracht, literals)) = lees_opdracht(&mut lezer, &mut schrijf).await {
        let (tag, rest) = opdracht.split_once(' ').unwrap_or((&opdracht, ""));
        let (cmd, args) = rest.split_once(' ').unwrap_or((rest, ""));
        let mut cmd = cmd.to_ascii_uppercase();
        let mut args = args.to_string();
        let uid_modus = cmd == "UID";
        if uid_modus {
            let (c, a) = args.split_once(' ').unwrap_or((&args, ""));
            cmd = c.to_ascii_uppercase();
            args = a.to_string();
        }
        p.lock().unwrap().opdrachten.push(format!(
            "{}{cmd} {args}",
            if uid_modus { "UID " } else { "" }
        ));
        let mut uit = String::new();
        let mut bytes_uit: Vec<u8> = Vec::new();
        let w = woorden(&args);
        let ok = format!("{tag} OK klaar\r\n");
        if cmd == "AUTHENTICATE" && args.eq_ignore_ascii_case("XOAUTH2") {
            schrijf.write_all(b"+ \r\n").await?;
            let mut regel = String::new();
            lezer.read_line(&mut regel).await?;
            let ruw = base64::engine::general_purpose::STANDARD
                .decode(regel.trim())
                .unwrap_or_default();
            let geldig = {
                let mut pb = p.lock().unwrap();
                pb.aanmeldingen += 1;
                pb.tokens
                    .iter()
                    .any(|t| ruw == crate::email::oauth::xoauth2(&pb.gebruiker, t).as_bytes())
            };
            if geldig {
                schrijf
                    .write_all(format!("{tag} OK aangemeld\r\n").as_bytes())
                    .await?;
            } else {
                // Zoals Gmail/Outlook: foutuitdaging, leeg antwoord, dan NO.
                schrijf.write_all(b"+ eyJzdGF0dXMiOiI0MDAifQ==\r\n").await?;
                regel.clear();
                lezer.read_line(&mut regel).await?;
                schrijf
                    .write_all(
                        format!("{tag} NO [AUTHENTICATIONFAILED] Ongeldig token\r\n").as_bytes(),
                    )
                    .await?;
            }
            continue;
        }
        let mut afsluiten = false;
        {
            let mut pb = p.lock().unwrap();
            let caps = pb.mogelijkheden.clone();
            match cmd.as_str() {
                "CAPABILITY" => uit = format!("* CAPABILITY {caps}\r\n{ok}"),
                "NOOP" | "SUBSCRIBE" | "CHECK" => uit = ok.clone(),
                "LOGOUT" => {
                    uit = format!("* BYE tot ziens\r\n{ok}");
                    afsluiten = true;
                }
                "LOGIN" => {
                    pb.aanmeldingen += 1;
                    uit = if w.first() == Some(&pb.gebruiker) && w.get(1) == Some(&pb.wachtwoord) {
                        format!("{tag} OK [CAPABILITY {caps}] aangemeld\r\n")
                    } else {
                        format!("{tag} NO [AUTHENTICATIONFAILED] Ongeldige gegevens\r\n")
                    };
                }
                "LIST" => {
                    for (naam, attr) in &pb.mappen {
                        uit.push_str(&format!(
                            "* LIST (\\HasNoChildren{}{attr}) \"/\" \"{naam}\"\r\n",
                            if attr.is_empty() { "" } else { " " }
                        ));
                    }
                    uit.push_str(&ok);
                }
                "STATUS" => {
                    let naam = w.first().cloned().unwrap_or_default();
                    match pb.inhoud.get(&naam) {
                        Some(l) => {
                            let ongelezen = l
                                .iter()
                                .filter(|b| !b.vlaggen.iter().any(|v| v == "\\Seen"))
                                .count();
                            uit = format!(
                                "* STATUS \"{naam}\" (MESSAGES {} UNSEEN {ongelezen})\r\n{ok}",
                                l.len()
                            );
                        }
                        None => uit = format!("{tag} NO bestaat niet\r\n"),
                    }
                }
                "SELECT" | "EXAMINE" => {
                    let naam = w.first().cloned().unwrap_or_default();
                    match pb.inhoud.get(&naam) {
                        Some(l) => {
                            gekozen = Some(naam);
                            uit = format!(
                                "* {} EXISTS\r\n* 0 RECENT\r\n* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)\r\n* OK [UIDVALIDITY 7] geldig\r\n* OK [UIDNEXT {}] volgende\r\n{tag} OK [{}] gekozen\r\n",
                                l.len(),
                                pb.volgende_uid,
                                if cmd == "SELECT" {
                                    "READ-WRITE"
                                } else {
                                    "READ-ONLY"
                                }
                            );
                        }
                        None => uit = format!("{tag} NO [NONEXISTENT] Map bestaat niet\r\n"),
                    }
                }
                "UNSELECT" => {
                    gekozen = None;
                    uit = ok.clone();
                }
                "CREATE" => {
                    let naam = w.first().cloned().unwrap_or_default();
                    pb.maak(&naam, "");
                    uit = ok.clone();
                }
                "DELETE" => {
                    let naam = w.first().cloned().unwrap_or_default();
                    pb.mappen.retain(|(n, _)| n != &naam);
                    pb.inhoud.remove(&naam);
                    uit = ok.clone();
                }
                "RENAME" => {
                    let (oud, nieuw) = (w[0].clone(), w[1].clone());
                    for m in pb.mappen.iter_mut().filter(|m| m.0 == oud) {
                        m.0 = nieuw.clone();
                    }
                    if let Some(l) = pb.inhoud.remove(&oud) {
                        pb.inhoud.insert(nieuw, l);
                    }
                    uit = ok.clone();
                }
                "APPEND" => {
                    let naam = w.first().cloned().unwrap_or_default();
                    let vlaggen: Vec<String> = w
                        .get(1)
                        .filter(|v| v.starts_with('('))
                        .map(|v| {
                            v.trim_matches(['(', ')'])
                                .split(' ')
                                .filter(|x| !x.is_empty())
                                .map(String::from)
                                .collect()
                        })
                        .unwrap_or_default();
                    if pb.inhoud.contains_key(&naam) {
                        let uid = pb.volgende_uid;
                        pb.volgende_uid += 1;
                        let bron = literals.first().cloned().unwrap_or_default();
                        pb.inhoud
                            .get_mut(&naam)
                            .unwrap()
                            .push(NepBericht { uid, vlaggen, bron });
                        uit = format!("{tag} OK [APPENDUID 7 {uid}] toegevoegd\r\n");
                    } else {
                        uit = format!("{tag} NO [TRYCREATE] Map bestaat niet\r\n");
                    }
                }
                "SEARCH" => {
                    let map = gekozen.clone().unwrap_or_default();
                    let mut teksten: Vec<String> = w
                        .iter()
                        .filter(|x| {
                            !x.starts_with('(')
                                && !x.starts_with("{L")
                                && !x
                                    .chars()
                                    .all(|c| c.is_ascii_uppercase() || c == '-' || c == '8')
                        })
                        .cloned()
                        .collect();
                    for (i, l) in literals.iter().enumerate() {
                        if args.contains(&format!("{{L{i}}}")) {
                            teksten.push(String::from_utf8_lossy(l).to_string());
                        }
                    }
                    // Ook zoekwoorden binnen OR-groepen.
                    for groep in w.iter().filter(|x| x.starts_with('(')) {
                        teksten.extend(
                            woorden(groep.trim_matches(['(', ')']))
                                .into_iter()
                                .filter(|x| x.chars().any(|c| c.is_lowercase())),
                        );
                    }
                    let ongelezen = args.contains("UNSEEN");
                    let treffers: Vec<String> = pb.inhoud[&map]
                        .iter()
                        .filter(|b| !b.vlaggen.iter().any(|v| v == "\\Deleted"))
                        .filter(|b| !ongelezen || !b.vlaggen.iter().any(|v| v == "\\Seen"))
                        .filter(|b| {
                            let bron = String::from_utf8_lossy(&b.bron).to_lowercase();
                            teksten.iter().all(|t| bron.contains(&t.to_lowercase()))
                        })
                        .map(|b| b.uid.to_string())
                        .collect();
                    uit = format!("* SEARCH {}\r\n{ok}", treffers.join(" "));
                }
                "FETCH" => {
                    let map = gekozen.clone().unwrap_or_default();
                    let set = w.first().cloned().unwrap_or_default();
                    let items = args.to_ascii_uppercase();
                    let lijst = pb.inhoud.get_mut(&map).unwrap();
                    let max = if uid_modus {
                        lijst.iter().map(|b| b.uid).max().unwrap_or(0)
                    } else {
                        lijst.len() as u32
                    };
                    for (i, b) in lijst.iter_mut().enumerate() {
                        let seq = i as u32 + 1;
                        if !in_set(&set, if uid_modus { b.uid } else { seq }, max) {
                            continue;
                        }
                        if items.contains("BODY[]") && !b.vlaggen.iter().any(|v| v == "\\Seen") {
                            b.vlaggen.push("\\Seen".into());
                        }
                        let mut delen = vec![format!("UID {}", b.uid)];
                        if items.contains("FLAGS") {
                            delen.push(format!("FLAGS ({})", b.vlaggen.join(" ")));
                        }
                        if items.contains("RFC822.SIZE") {
                            delen.push(format!("RFC822.SIZE {}", b.bron.len()));
                        }
                        if items.contains("INTERNALDATE") {
                            delen.push("INTERNALDATE \"27-Oct-2026 09:00:00 +0100\"".into());
                        }
                        bytes_uit.extend_from_slice(
                            format!("* {seq} FETCH ({}", delen.join(" ")).as_bytes(),
                        );
                        let deel = if items.contains("HEADER.FIELDS") {
                            Some(("BODY[HEADER]", kop_van(&b.bron)))
                        } else if items.contains("BODY[]") || items.contains("BODY.PEEK[]") {
                            Some(("BODY[]", b.bron.clone()))
                        } else {
                            None
                        };
                        if let Some((naam, inhoud)) = deel {
                            bytes_uit.extend_from_slice(
                                format!(" {naam} {{{}}}\r\n", inhoud.len()).as_bytes(),
                            );
                            bytes_uit.extend_from_slice(&inhoud);
                        }
                        bytes_uit.extend_from_slice(b")\r\n");
                    }
                    bytes_uit.extend_from_slice(ok.as_bytes());
                }
                "STORE" => {
                    let map = gekozen.clone().unwrap_or_default();
                    let set = w.first().cloned().unwrap_or_default();
                    let actie = w.get(1).cloned().unwrap_or_default();
                    let vlaggen: Vec<String> = w
                        .get(2)
                        .map(|v| {
                            v.trim_matches(['(', ')'])
                                .split(' ')
                                .map(String::from)
                                .collect()
                        })
                        .unwrap_or_default();
                    let lijst = pb.inhoud.get_mut(&map).unwrap();
                    let max = lijst.iter().map(|b| b.uid).max().unwrap_or(0);
                    for b in lijst.iter_mut().filter(|b| in_set(&set, b.uid, max)) {
                        for v in &vlaggen {
                            b.vlaggen.retain(|x| x != v);
                            if actie.starts_with('+') {
                                b.vlaggen.push(v.clone());
                            }
                        }
                    }
                    uit = ok.clone();
                }
                "COPY" | "MOVE" => {
                    let map = gekozen.clone().unwrap_or_default();
                    let set = w.first().cloned().unwrap_or_default();
                    let doel = w.get(1).cloned().unwrap_or_default();
                    if !pb.inhoud.contains_key(&doel) {
                        uit = format!("{tag} NO [TRYCREATE] Doel bestaat niet\r\n");
                    } else {
                        let max = pb.inhoud[&map].iter().map(|b| b.uid).max().unwrap_or(0);
                        let gekozenen: Vec<NepBericht> = pb.inhoud[&map]
                            .iter()
                            .filter(|b| in_set(&set, b.uid, max))
                            .cloned()
                            .collect();
                        for mut b in gekozenen {
                            b.uid = pb.volgende_uid;
                            pb.volgende_uid += 1;
                            b.vlaggen.retain(|v| v != "\\Deleted");
                            pb.inhoud.get_mut(&doel).unwrap().push(b);
                        }
                        if cmd == "MOVE" {
                            pb.inhoud
                                .get_mut(&map)
                                .unwrap()
                                .retain(|b| !in_set(&set, b.uid, max));
                        }
                        uit = ok.clone();
                    }
                }
                "EXPUNGE" => {
                    let map = gekozen.clone().unwrap_or_default();
                    let set = w.first().cloned();
                    let lijst = pb.inhoud.get_mut(&map).unwrap();
                    let max = lijst.iter().map(|b| b.uid).max().unwrap_or(0);
                    lijst.retain(|b| {
                        !(b.vlaggen.iter().any(|v| v == "\\Deleted")
                            && set.as_ref().is_none_or(|s| in_set(s, b.uid, max)))
                    });
                    uit = ok.clone();
                }
                _ => uit = format!("{tag} BAD onbekende opdracht\r\n"),
            }
        }
        if !bytes_uit.is_empty() {
            schrijf.write_all(&bytes_uit).await?;
        } else {
            schrijf.write_all(uit.as_bytes()).await?;
        }
        if afsluiten {
            return Ok(());
        }
    }
    Ok(())
}

/* ─── SMTP ─── */

#[derive(Debug, Default)]
pub struct Ontvangen {
    pub van: String,
    pub aan: Vec<String>,
    pub data: Vec<u8>,
}

#[derive(Debug, Default)]
pub struct NepSmtp {
    pub tokens: Vec<String>,
    pub gebruiker: String,
    pub wachtwoord: String,
    pub ontvangen: Vec<Ontvangen>,
    pub aanmeldingen: u32,
}

pub async fn start_smtp(staat: Arc<Mutex<NepSmtp>>) -> SocketAddr {
    let luisteraar = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let adres = luisteraar.local_addr().unwrap();
    tokio::spawn(async move {
        while let Ok((s, _)) = luisteraar.accept().await {
            let st = staat.clone();
            tokio::spawn(async move {
                let _ = smtp_verbinding(s, st).await;
            });
        }
    });
    adres
}

async fn smtp_verbinding(s: TcpStream, staat: Arc<Mutex<NepSmtp>>) -> std::io::Result<()> {
    let (lees, mut schrijf) = s.into_split();
    let mut lezer = BufReader::new(lees);
    schrijf
        .write_all(b"220 nep.localhost ESMTP klaar\r\n")
        .await?;
    let mut huidig = Ontvangen::default();
    let mut regel = String::new();
    loop {
        regel.clear();
        if lezer.read_line(&mut regel).await? == 0 {
            return Ok(());
        }
        let r = regel.trim_end().to_string();
        let hoofd = r.to_ascii_uppercase();
        let antwoord: String = if hoofd.starts_with("EHLO") || hoofd.starts_with("HELO") {
            "250-nep.localhost\r\n250-AUTH PLAIN LOGIN XOAUTH2\r\n250 8BITMIME\r\n".into()
        } else if hoofd.starts_with("AUTH PLAIN") {
            let mut b64 = r[10..].trim().to_string();
            if b64.is_empty() {
                schrijf.write_all(b"334 \r\n").await?;
                regel.clear();
                lezer.read_line(&mut regel).await?;
                b64 = regel.trim().to_string();
            }
            let ruw = base64::engine::general_purpose::STANDARD
                .decode(b64)
                .unwrap_or_default();
            let delen: Vec<&[u8]> = ruw.split(|b| *b == 0).collect();
            let mut st = staat.lock().unwrap();
            st.aanmeldingen += 1;
            if delen.len() == 3
                && delen[1] == st.gebruiker.as_bytes()
                && delen[2] == st.wachtwoord.as_bytes()
            {
                "235 2.7.0 aangemeld\r\n".into()
            } else {
                "535 5.7.8 Ongeldige gegevens\r\n".into()
            }
        } else if hoofd.starts_with("AUTH XOAUTH2 ") {
            let ruw = base64::engine::general_purpose::STANDARD
                .decode(r[13..].trim())
                .unwrap_or_default();
            let mut st = staat.lock().unwrap();
            st.aanmeldingen += 1;
            if st
                .tokens
                .iter()
                .any(|t| ruw == crate::email::oauth::xoauth2(&st.gebruiker, t).as_bytes())
            {
                "235 2.7.0 aangemeld\r\n".into()
            } else {
                "535 5.7.8 Ongeldig token\r\n".into()
            }
        } else if hoofd.starts_with("MAIL FROM:") {
            huidig = Ontvangen {
                van: r[10..].trim().to_string(),
                ..Default::default()
            };
            "250 2.1.0 ok\r\n".into()
        } else if hoofd.starts_with("RCPT TO:") {
            huidig.aan.push(r[8..].trim().to_string());
            "250 2.1.5 ok\r\n".into()
        } else if hoofd == "DATA" {
            schrijf.write_all(b"354 ga door\r\n").await?;
            let mut data = Vec::new();
            loop {
                regel.clear();
                if lezer.read_line(&mut regel).await? == 0 {
                    return Ok(());
                }
                if regel == ".\r\n" {
                    break;
                }
                let r = regel.strip_prefix('.').unwrap_or(&regel);
                data.extend_from_slice(r.as_bytes());
            }
            huidig.data = data;
            staat
                .lock()
                .unwrap()
                .ontvangen
                .push(std::mem::take(&mut huidig));
            "250 2.0.0 aangenomen\r\n".into()
        } else if hoofd == "QUIT" {
            schrijf.write_all(b"221 2.0.0 tot ziens\r\n").await?;
            return Ok(());
        } else if hoofd == "RSET" || hoofd == "NOOP" {
            "250 2.0.0 ok\r\n".into()
        } else {
            "502 5.5.2 onbekend\r\n".into()
        };
        schrijf.write_all(antwoord.as_bytes()).await?;
    }
}

/* ─── Nep-OAuth2-tokenserver ─── */

#[derive(Debug, Default)]
pub struct NepToken {
    pub uitdaging: Option<String>,
    pub redirect: Option<String>,
    pub vernieuw_geldig: bool,
    pub uitgegeven: u32,
    pub verzoeken: Vec<String>,
}

pub async fn start_token(staat: Arc<Mutex<NepToken>>) -> SocketAddr {
    let luisteraar = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let adres = luisteraar.local_addr().unwrap();
    tokio::spawn(async move {
        while let Ok((s, _)) = luisteraar.accept().await {
            let st = staat.clone();
            tokio::spawn(async move {
                let _ = token_verbinding(s, st).await;
            });
        }
    });
    adres
}

async fn token_verbinding(s: TcpStream, staat: Arc<Mutex<NepToken>>) -> std::io::Result<()> {
    use crate::email::oauth::{pkce_uitdaging, query_velden};
    let (lees, mut schrijf) = s.into_split();
    let mut lezer = BufReader::new(lees);
    let mut lengte = 0usize;
    let mut regel = String::new();
    loop {
        regel.clear();
        if lezer.read_line(&mut regel).await? == 0 {
            return Ok(());
        }
        if regel == "\r\n" {
            break;
        }
        if let Some(v) = regel.to_ascii_lowercase().strip_prefix("content-length:") {
            lengte = v.trim().parse().unwrap_or(0);
        }
    }
    let mut lichaam = vec![0u8; lengte];
    lezer.read_exact(&mut lichaam).await?;
    let v = query_velden(&String::from_utf8_lossy(&lichaam));
    let id_token = format!(
        "eyJhbGciOiJub25lIn0.{}.x",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(br#"{"email":"jan@example.org"}"#)
    );
    let (status, json) = {
        let mut st = staat.lock().unwrap();
        st.verzoeken
            .push(v.get("grant_type").cloned().unwrap_or_default());
        match v.get("grant_type").map(String::as_str) {
            Some("authorization_code")
                if v.get("code").map(String::as_str) == Some("code-1")
                    && v.get("code_verifier").map(|c| pkce_uitdaging(c)) == st.uitdaging
                    && v.get("redirect_uri") == st.redirect.as_ref()
                    && v.get("client_id").map(String::as_str) == Some("test-client") =>
            {
                st.uitgegeven += 1;
                (
                    "200 OK",
                    format!(
                        r#"{{"access_token":"toegang-{}","refresh_token":"vernieuw-1","expires_in":3600,"token_type":"Bearer","id_token":"{id_token}"}}"#,
                        st.uitgegeven
                    ),
                )
            }
            Some("refresh_token")
                if st.vernieuw_geldig
                    && v.get("refresh_token").map(String::as_str) == Some("vernieuw-1") =>
            {
                st.uitgegeven += 1;
                (
                    "200 OK",
                    format!(
                        r#"{{"access_token":"toegang-{}","expires_in":3600}}"#,
                        st.uitgegeven
                    ),
                )
            }
            _ => (
                "400 Bad Request",
                r#"{"error":"invalid_grant"}"#.to_string(),
            ),
        }
    };
    let antwoord = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{json}",
        json.len()
    );
    schrijf.write_all(antwoord.as_bytes()).await?;
    Ok(())
}

/* ─── Integratietests ─── */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email::accounts::{AccountOpslag, GeheugenKluis};
    use crate::email::fout::Foutcode;
    use crate::email::*;

    const BERICHT_1: &[u8] = b"From: Piet Pieters <piet@example.org>\r\nTo: jan@example.org\r\nSubject: Offerte dakkapel\r\nDate: Mon, 26 Oct 2026 09:00:00 +0100\r\nMessage-ID: <een@example.org>\r\n\r\nGraag een offerte.\r\n";
    const BERICHT_2: &[u8] = b"From: Klaas <klaas@example.org>\r\nTo: jan@example.org\r\nCc: Marie <marie@example.org>\r\nSubject: Tekening\r\nDate: Mon, 26 Oct 2026 10:00:00 +0100\r\nMessage-ID: <twee@example.org>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"G\"\r\n\r\n--G\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nZie bijlage.\r\n--G\r\nContent-Type: application/pdf; name=\"t.pdf\"\r\nContent-Disposition: attachment; filename=\"t.pdf\"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0xLjQK\r\n--G--\r\n";
    const BERICHT_3: &[u8] = b"From: Piet Pieters <piet@example.org>\r\nTo: jan@example.org\r\nSubject: =?UTF-8?Q?Caf=C3=A9_overleg?=\r\nDate: Tue, 27 Oct 2026 08:00:00 +0100\r\nMessage-ID: <drie@example.org>\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\nTot in het caf\xc3\xa9.\r\n";

    struct Omgeving {
        kern: EmailKern,
        imap: Gedeeld,
        smtp: Arc<Mutex<NepSmtp>>,
        id: String,
        _map: tempfile::TempDir,
    }

    async fn omgeving(wachtwoord: &str) -> Omgeving {
        let mut pb = Postbus::nieuw("jan@example.org", "juist-wachtwoord");
        pb.voeg_toe("INBOX", BERICHT_1, &["\\Seen"]);
        pb.voeg_toe("INBOX", BERICHT_2, &[]);
        pb.voeg_toe("INBOX", BERICHT_3, &[]);
        let imap: Gedeeld = Arc::new(Mutex::new(pb));
        let smtp = Arc::new(Mutex::new(NepSmtp {
            gebruiker: "jan@example.org".into(),
            wachtwoord: "juist-wachtwoord".into(),
            ..Default::default()
        }));
        let imap_adres = start_imap(imap.clone()).await;
        let smtp_adres = start_smtp(smtp.clone()).await;
        let map = tempfile::tempdir().unwrap();
        let kern = EmailKern::nieuw(
            AccountOpslag::nieuw(map.path()),
            Arc::new(GeheugenKluis::default()),
        );
        let mut invoer = crate::email::accounts::tests::invoer(
            "127.0.0.1",
            imap_adres.port(),
            smtp_adres.port(),
            Beveiliging::Geen,
        );
        invoer.wachtwoord = Some(wachtwoord.into());
        let account = kern.bewaar_account(invoer).await.unwrap();
        Omgeving {
            kern,
            imap,
            smtp,
            id: account.id,
            _map: map,
        }
    }

    fn verzoek(map: &str, start: u32, aantal: u32) -> Lijstverzoek {
        Lijstverzoek {
            map: map.into(),
            start,
            aantal,
            zoek: None,
            alleen_ongelezen: None,
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn volledige_stroom_tegen_nepserver() {
        let o = omgeving("juist-wachtwoord").await;
        let k = &o.kern;

        // Verbindingstest (met waarschuwing over onversleuteld localhost).
        let accounts = k.accounts().await.unwrap();
        assert!(accounts[0].wachtwoord_opgeslagen);
        let mut invoer =
            crate::email::accounts::tests::invoer("127.0.0.1", 1, 1, Beveiliging::Geen);
        invoer.imap = accounts[0].imap.clone();
        invoer.smtp = accounts[0].smtp.clone();
        invoer.id = Some(o.id.clone());
        invoer.wachtwoord = None;
        let t = k.test(invoer).await.unwrap();
        assert!(t.imap.ok, "{}", t.imap.melding);
        assert!(t.smtp.ok, "{}", t.smtp.melding);
        assert!(t.imap.melding.contains("niet versleuteld"));

        // Mappen met SPECIAL-USE, telling en gedecodeerde naam.
        let mappen = k.mappen(&o.id).await.unwrap();
        assert_eq!(mappen[0].pad, "INBOX");
        assert_eq!(mappen[0].speciaal, Some(Speciaal::Inbox));
        assert_eq!((mappen[0].totaal, mappen[0].ongelezen), (Some(3), Some(2)));
        let zoek = |pad: &str| mappen.iter().find(|m| m.pad == pad).unwrap().clone();
        assert_eq!(zoek("Sent").speciaal, Some(Speciaal::Verzonden));
        assert_eq!(zoek("Trash").speciaal, Some(Speciaal::Prullenbak));
        assert_eq!(zoek("Entw&APw-rfe").naam, "Entwürfe");

        // Paginering: nieuwste eerst.
        let l = k.berichten(&o.id, verzoek("INBOX", 0, 2)).await.unwrap();
        assert_eq!(l.totaal, 3);
        assert_eq!(
            l.berichten.iter().map(|b| b.uid).collect::<Vec<_>>(),
            vec![3, 2]
        );
        assert_eq!(l.berichten[0].onderwerp, "Café overleg");
        assert!(l.berichten[1].heeft_bijlagen);
        assert_eq!(l.berichten[1].cc[0].adres, "marie@example.org");
        let l = k.berichten(&o.id, verzoek("INBOX", 2, 2)).await.unwrap();
        assert_eq!(
            l.berichten.iter().map(|b| b.uid).collect::<Vec<_>>(),
            vec![1]
        );
        assert!(l.berichten[0].gelezen);
        assert!(
            k.berichten(&o.id, verzoek("INBOX", 5, 2))
                .await
                .unwrap()
                .berichten
                .is_empty()
        );

        // Zoeken via IMAP SEARCH, ook met niet-ASCII (LITERAL+).
        let mut v = verzoek("INBOX", 0, 50);
        v.zoek = Some(Zoekopdracht {
            tekst: "offerte".into(),
            velden: vec![Zoekveld::Onderwerp],
        });
        let l = k.berichten(&o.id, v.clone()).await.unwrap();
        assert_eq!((l.totaal, l.berichten[0].uid), (1, 1));
        v.zoek = None;
        v.alleen_ongelezen = Some(true);
        let l = k.berichten(&o.id, v.clone()).await.unwrap();
        assert_eq!(
            l.berichten.iter().map(|b| b.uid).collect::<Vec<_>>(),
            vec![3, 2]
        );
        v.alleen_ongelezen = None;
        v.zoek = Some(Zoekopdracht {
            tekst: "café".into(),
            velden: vec![Zoekveld::Inhoud],
        });
        let l = k.berichten(&o.id, v).await.unwrap();
        assert_eq!(
            l.berichten.iter().map(|b| b.uid).collect::<Vec<_>>(),
            vec![3]
        );
        assert!(
            o.imap
                .lock()
                .unwrap()
                .opdrachten
                .iter()
                .any(|c| c.contains("CHARSET UTF-8"))
        );

        // Bericht openen markeert als gelezen; bijlage en bron.
        let b = k.bericht(&o.id, "INBOX", 2).await.unwrap();
        assert!(b.kop.gelezen);
        assert_eq!(b.bijlagen.len(), 1);
        assert_eq!(b.bijlagen[0].bestandsnaam, "t.pdf");
        assert!(
            o.imap.lock().unwrap().inhoud["INBOX"][1]
                .vlaggen
                .contains(&"\\Seen".to_string())
        );
        assert_eq!(
            k.bijlage(&o.id, "INBOX", 2, 0).await.unwrap(),
            b"%PDF-1.4\n"
        );
        assert_eq!(
            k.bijlage(&o.id, "INBOX", 2, 9).await.unwrap_err().code,
            Foutcode::NietGevonden
        );
        assert_eq!(k.bron(&o.id, "INBOX", 1).await.unwrap(), BERICHT_1);
        assert_eq!(
            k.bericht(&o.id, "INBOX", 99).await.unwrap_err().code,
            Foutcode::NietGevonden
        );
        assert_eq!(
            k.bericht(&o.id, "Bestaat niet", 1).await.unwrap_err().code,
            Foutcode::NietGevonden
        );

        // Markeren.
        k.markeer(&o.id, "INBOX", &[1, 3], Vlag::Gemarkeerd, true)
            .await
            .unwrap();
        k.markeer(&o.id, "INBOX", &[1], Vlag::Gelezen, false)
            .await
            .unwrap();
        {
            let pb = o.imap.lock().unwrap();
            assert!(
                pb.inhoud["INBOX"][0]
                    .vlaggen
                    .contains(&"\\Flagged".to_string())
            );
            assert!(
                !pb.inhoud["INBOX"][0]
                    .vlaggen
                    .contains(&"\\Seen".to_string())
            );
            assert!(
                pb.inhoud["INBOX"][2]
                    .vlaggen
                    .contains(&"\\Flagged".to_string())
            );
        }

        // Verwijderen = naar de prullenbak; daar definitief.
        k.verwijder(&o.id, "INBOX", &[1], false).await.unwrap();
        let trash_uid = {
            let pb = o.imap.lock().unwrap();
            assert_eq!(pb.inhoud["INBOX"].len(), 2);
            assert_eq!(pb.inhoud["Trash"].len(), 1);
            pb.inhoud["Trash"][0].uid
        };
        assert_eq!(
            k.verwijder(&o.id, "Trash", &[trash_uid], false)
                .await
                .unwrap_err()
                .code,
            Foutcode::Geweigerd
        );
        k.verwijder(&o.id, "Trash", &[trash_uid], true)
            .await
            .unwrap();
        assert!(o.imap.lock().unwrap().inhoud["Trash"].is_empty());

        // Verplaatsen.
        k.verplaats(&o.id, "INBOX", &[2], "Entw&APw-rfe")
            .await
            .unwrap();
        assert_eq!(o.imap.lock().unwrap().inhoud["Entw&APw-rfe"].len(), 1);

        // Mappen beheren (niet-ASCII wordt gewijzigd UTF-7).
        k.maak_map(&o.id, "Projecten/Café").await.unwrap();
        assert!(
            o.imap
                .lock()
                .unwrap()
                .inhoud
                .contains_key("Projecten/Caf&AOk-")
        );
        k.hernoem_map(&o.id, "Projecten/Caf&AOk-", "Projecten/Bar")
            .await
            .unwrap();
        assert!(o.imap.lock().unwrap().inhoud.contains_key("Projecten/Bar"));
        k.verwijder_map(&o.id, "Projecten/Bar").await.unwrap();
        assert!(!o.imap.lock().unwrap().inhoud.contains_key("Projecten/Bar"));
        assert_eq!(
            k.verwijder_map(&o.id, "INBOX").await.unwrap_err().code,
            Foutcode::Geweigerd
        );

        // Versturen: SMTP met Bcc in de envelop, kopie in Verzonden.
        let opstelling = Opstelling {
            van: "Jan Jansen <jan@example.org>".into(),
            aan: vec!["Piet <piet@example.org>".into()],
            cc: vec![],
            bcc: vec!["archief@example.org".into()],
            onderwerp: "Re: Offerte dakkapel".into(),
            tekst: "Hierbij de offerte.".into(),
            html: None,
            in_reply_to: Some("<een@example.org>".into()),
            referenties: Some("<een@example.org>".into()),
            bijlagen: vec![OpstellingBijlage {
                bestandsnaam: "offerte.pdf".into(),
                inhoudstype: "application/pdf".into(),
                bytes: "JVBERi0xLjQK".into(),
            }],
        };
        let r = k.verstuur(&o.id, opstelling.clone()).await.unwrap();
        {
            let smtp = o.smtp.lock().unwrap();
            assert_eq!(smtp.ontvangen.len(), 1);
            let m = &smtp.ontvangen[0];
            assert!(m.van.contains("jan@example.org"));
            assert!(m.aan.iter().any(|a| a.contains("archief@example.org")));
            let data = String::from_utf8_lossy(&m.data);
            assert!(data.contains(&r.bericht_id));
            assert!(data.contains("In-Reply-To: <een@example.org>"));
            assert!(!data.contains("archief@example.org"));
        }
        {
            let pb = o.imap.lock().unwrap();
            let verzonden = &pb.inhoud["Sent"];
            assert_eq!(verzonden.len(), 1);
            assert!(verzonden[0].vlaggen.contains(&"\\Seen".to_string()));
            assert!(String::from_utf8_lossy(&verzonden[0].bron).contains("archief@example.org"));
        }

        // Concept bewaren met \Draft.
        let mut concept = opstelling;
        concept.aan.clear();
        concept.bcc.clear();
        k.bewaar_concept(&o.id, concept).await.unwrap();
        {
            let pb = o.imap.lock().unwrap();
            assert!(
                pb.inhoud["Drafts"][0]
                    .vlaggen
                    .contains(&"\\Draft".to_string())
            );
        }

        // Contacten uit recente berichten (eigen adres uitgesloten).
        let c = k.contacten(&o.id, "pie").await.unwrap();
        assert_eq!(c[0].adres, "piet@example.org");
        assert!(
            k.contacten(&o.id, "")
                .await
                .unwrap()
                .iter()
                .all(|a| a.adres != "jan@example.org")
        );

        // Eén aanmelding voor alle opdrachten (sessiepool) plus die van de test.
        assert_eq!(o.imap.lock().unwrap().aanmeldingen, 2);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn verkeerd_wachtwoord_en_wachttijd() {
        let o = omgeving("fout-wachtwoord").await;
        let f = o.kern.mappen(&o.id).await.unwrap_err();
        assert_eq!(f.code, Foutcode::Aanmelding);
        assert!(!f.melding.contains("fout-wachtwoord"));
        let f2 = o.kern.mappen(&o.id).await.unwrap_err();
        assert!(f2.melding.contains("opnieuw"), "{}", f2.melding);
        assert_eq!(
            o.imap.lock().unwrap().aanmeldingen,
            1,
            "geen nieuwe poging binnen de wachttijd"
        );

        // SMTP: aanmelding mislukt netjes.
        let mut opstelling_fout = None;
        let r = o
            .kern
            .verstuur(
                &o.id,
                Opstelling {
                    van: "jan@example.org".into(),
                    aan: vec!["piet@example.org".into()],
                    cc: vec![],
                    bcc: vec![],
                    onderwerp: "x".into(),
                    tekst: "x".into(),
                    html: None,
                    in_reply_to: None,
                    referenties: None,
                    bijlagen: vec![],
                },
            )
            .await;
        if let Err(f) = r {
            opstelling_fout = Some(f);
        }
        let f = opstelling_fout.expect("versturen moet mislukken");
        assert_eq!(f.code, Foutcode::Aanmelding);
        assert!(!f.melding.contains("fout-wachtwoord"));

        // Nieuw wachtwoord opslaan wist de wachttijd.
        let mut a = crate::email::accounts::tests::invoer("127.0.0.1", 1, 1, Beveiliging::Geen);
        let huidig = o.kern.account(&o.id).await.unwrap();
        a.imap = huidig.imap;
        a.smtp = huidig.smtp;
        a.id = Some(o.id.clone());
        a.wachtwoord = Some("juist-wachtwoord".into());
        o.kern.bewaar_account(a).await.unwrap();
        assert!(o.kern.mappen(&o.id).await.is_ok());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn grootte_en_beveiliging() {
        let mut o = omgeving("juist-wachtwoord").await;
        o.kern.limieten.max_bericht = 100;
        assert_eq!(
            o.kern.bericht(&o.id, "INBOX", 2).await.unwrap_err().code,
            Foutcode::TeGroot
        );

        // Onversleuteld naar een andere host wordt geweigerd vóór er verkeer is.
        let mut a =
            crate::email::accounts::tests::invoer("mail.example.org", 143, 25, Beveiliging::Geen);
        a.wachtwoord = Some("x".into());
        assert_eq!(
            o.kern.bewaar_account(a).await.unwrap_err().code,
            Foutcode::Geweigerd
        );
        let mut a =
            crate::email::accounts::tests::invoer("imap.example.org", 993, 465, Beveiliging::Ssl);
        a.imap.authenticatie = Authenticatie::Oauth2;
        // OAuth2 zonder aanmelding: opslaan mag, verbinden vraagt om aanmelden.
        let zonder = o.kern.bewaar_account(a).await.unwrap();
        let f = o.kern.mappen(&zonder.id).await.unwrap_err();
        assert_eq!(f.code, Foutcode::Aanmelding);
        assert!(f.melding.contains("meld je eerst aan"));

        // STARTTLS tegen een server zonder STARTTLS: duidelijke fout, geen terugval.
        let voor = o.imap.lock().unwrap().aanmeldingen;
        let huidig = o.kern.account(&o.id).await.unwrap();
        let mut server = huidig.imap.clone();
        server.host = "localhost".into();
        server.beveiliging = Beveiliging::Starttls;
        let f = crate::email::imap::test(&server, "juist-wachtwoord")
            .await
            .unwrap_err();
        assert_eq!(f.code, Foutcode::Verbinding, "{}", f.melding);
        assert!(f.melding.contains("STARTTLS"));
        assert_eq!(
            o.imap.lock().unwrap().aanmeldingen,
            voor,
            "geen aanmelding zonder versleuteling"
        );
    }

    /// Kern met OAuth-client "test-client" en eindpunten op de nep-tokenserver.
    async fn oauth_kern(
        map: &std::path::Path,
        token: Arc<Mutex<NepToken>>,
        browser: bool,
    ) -> EmailKern {
        let adres = start_token(token.clone()).await;
        let mut kern = EmailKern::nieuw(
            AccountOpslag::nieuw(map),
            Arc::new(GeheugenKluis::default()),
        );
        kern.oauth.alleen_app_instelling = true;
        kern.oauth.eindpunten.lock().unwrap().insert(
            oauth::Provider::Microsoft,
            oauth::Eindpunten {
                autoriseer: format!("http://127.0.0.1:{}/authorize", adres.port()),
                token: format!("http://127.0.0.1:{}/token", adres.port()),
            },
        );
        // Nep-browser: leest de autorisatie-URL en roept de terugkoppeling aan.
        kern.oauth.opener = Arc::new(move |url: &str| {
            let v = oauth::query_velden(url.split_once('?').unwrap().1);
            assert_eq!(v["code_challenge_method"], "S256");
            assert_eq!(v["client_id"], "test-client");
            {
                let mut st = token.lock().unwrap();
                st.uitdaging = Some(v["code_challenge"].clone());
                st.redirect = Some(v["redirect_uri"].clone());
            }
            if browser {
                let redirect = v["redirect_uri"].clone();
                let state = v["state"].clone();
                tokio::spawn(async move {
                    let rest = redirect.strip_prefix("http://").unwrap();
                    let (host, poort) = rest.trim_end_matches('/').rsplit_once(':').unwrap();
                    let (_, _, pagina) = crate::email::autoconfig::http_verzoek(
                        host,
                        poort.parse().unwrap(),
                        false,
                        "GET",
                        &format!("/?code=code-1&state={state}"),
                        "text/html",
                        None,
                    )
                    .await
                    .unwrap();
                    assert!(
                        String::from_utf8_lossy(&pagina).contains("Je kunt dit venster sluiten")
                    );
                });
            }
            Ok(())
        });
        kern
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn oauth2_aanmelden_vernieuwen_en_intrekken() {
        let map = tempfile::tempdir().unwrap();
        let token = Arc::new(Mutex::new(NepToken {
            vernieuw_geldig: true,
            ..Default::default()
        }));
        let k = oauth_kern(map.path(), token.clone(), true).await;

        // Zonder client-ID: niet beschikbaar met uitleg.
        let status = k.oauth_status().await;
        assert!(!status.microsoft.beschikbaar);
        assert!(
            status
                .microsoft
                .melding
                .as_deref()
                .unwrap()
                .contains("Entra")
        );
        k.bewaar_oauth_client(oauth::Provider::Microsoft, "test-client", None)
            .await
            .unwrap();
        assert!(k.oauth_status().await.microsoft.beschikbaar);

        let mut pb = Postbus::nieuw("jan@example.org", "ongebruikt");
        pb.voeg_toe("INBOX", BERICHT_1, &[]);
        pb.tokens = vec!["toegang-1".into()];
        let imap: Gedeeld = Arc::new(Mutex::new(pb));
        let smtp = Arc::new(Mutex::new(NepSmtp {
            gebruiker: "jan@example.org".into(),
            ..Default::default()
        }));
        let imap_adres = start_imap(imap.clone()).await;
        let smtp_adres = start_smtp(smtp.clone()).await;

        let mut invoer = crate::email::accounts::tests::invoer(
            "127.0.0.1",
            imap_adres.port(),
            smtp_adres.port(),
            Beveiliging::Geen,
        );
        invoer.email = String::new();
        invoer.imap.gebruikersnaam = String::new();
        invoer.smtp.gebruikersnaam = String::new();
        invoer.wachtwoord = None;
        let a = k
            .meld_aan_met_oauth(oauth::Provider::Microsoft, invoer)
            .await
            .unwrap();
        assert_eq!(a.email, "jan@example.org");
        assert_eq!(a.imap.authenticatie, Authenticatie::Oauth2);
        assert_eq!(a.smtp.gebruikersnaam, "jan@example.org");
        let koppeling = a.oauth.clone().unwrap();
        assert_eq!(koppeling.provider, oauth::Provider::Microsoft);
        assert_eq!(koppeling.aangemeld_als, "jan@example.org");
        assert_eq!(
            k.kluis
                .haal(&oauth::vernieuw_sleutel(&a.id))
                .unwrap()
                .as_deref(),
            Some("vernieuw-1")
        );
        assert!(k.accounts().await.unwrap()[0].wachtwoord_opgeslagen);
        let schijf = std::fs::read_to_string(map.path().join("email-accounts.json")).unwrap();
        assert!(!schijf.contains("toegang-") && !schijf.contains("vernieuw-1"));

        // XOAUTH2 met het eerste toegangstoken.
        assert_eq!(k.mappen(&a.id).await.unwrap()[0].pad, "INBOX");

        // Verlopen toegangstoken: automatisch vernieuwen vóór verbinden.
        k.oauth.laat_verlopen(&a.id);
        k.pool.vergeet(&a.id).await;
        imap.lock().unwrap().tokens = vec!["toegang-2".into()];
        assert!(k.mappen(&a.id).await.is_ok());

        // Server weigert een nog 'geldig' token: één keer vernieuwen en opnieuw.
        k.pool.vergeet(&a.id).await;
        imap.lock().unwrap().tokens = vec!["toegang-3".into()];
        assert!(k.mappen(&a.id).await.is_ok());

        // SMTP via XOAUTH2, ook met één vernieuwing na een weigering.
        smtp.lock().unwrap().tokens = vec!["toegang-4".into()];
        let opstelling = Opstelling {
            van: "jan@example.org".into(),
            aan: vec!["piet@example.org".into()],
            cc: vec![],
            bcc: vec![],
            onderwerp: "OAuth".into(),
            tekst: "x".into(),
            html: None,
            in_reply_to: None,
            referenties: None,
            bijlagen: vec![],
        };
        imap.lock().unwrap().tokens.push("toegang-4".into());
        k.verstuur(&a.id, opstelling).await.unwrap();
        assert_eq!(smtp.lock().unwrap().ontvangen.len(), 1);

        // Ingetrokken toestemming: duidelijke melding, geen tokens erin.
        token.lock().unwrap().vernieuw_geldig = false;
        k.oauth.laat_verlopen(&a.id);
        k.pool.vergeet(&a.id).await;
        let f = k.mappen(&a.id).await.unwrap_err();
        assert_eq!(f.code, Foutcode::Aanmelding);
        assert!(
            f.melding.starts_with("Opnieuw aanmelden bij Microsoft"),
            "{}",
            f.melding
        );
        assert!(!f.melding.contains("toegang-") && !f.melding.contains("vernieuw-1"));

        // Verwijderen wist ook het vernieuwingstoken.
        k.verwijder_account(&a.id).await.unwrap();
        assert!(
            k.kluis
                .haal(&oauth::vernieuw_sleutel(&a.id))
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn oauth2_annuleren() {
        let map = tempfile::tempdir().unwrap();
        let token = Arc::new(Mutex::new(NepToken::default()));
        let k = oauth_kern(map.path(), token, false).await;
        k.bewaar_oauth_client(oauth::Provider::Microsoft, "test-client", None)
            .await
            .unwrap();
        let invoer = crate::email::accounts::tests::invoer("", 0, 0, Beveiliging::Ssl);
        let (uitkomst, _) = tokio::join!(
            k.meld_aan_met_oauth(oauth::Provider::Microsoft, invoer),
            async {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                k.annuleer_oauth();
            }
        );
        let f = uitkomst.unwrap_err();
        assert_eq!(f.code, Foutcode::Geweigerd);
        assert!(k.accounts().await.unwrap().is_empty());
    }
}
