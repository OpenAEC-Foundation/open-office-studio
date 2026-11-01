//! Directe pagina-invoer wordt geordend verwerkt; een lopend beeld mag geen toetsen laten verdwijnen.
use super::*;
use office_core::writer_navigatie::{CursorDoel, Richting};
use office_core::{
    document::{TekstReeks, TekstStap},
    writer_cursor::{TekstMarkering, TekstPunt},
};
use std::{
    collections::VecDeque,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};
static VOLGEND: AtomicU64 = AtomicU64::new(1);
fn nummer() -> u64 {
    VOLGEND.fetch_add(1, Ordering::Relaxed)
}
#[derive(Debug, Clone)]
pub enum Bericht {
    Punt {
        hash: String,
        punt: TekstPunt,
        cursor: Option<CursorDoel>,
        selecteren: bool,
    },
    Beweeg(Richting, bool),
    Invoer(text_editor::Action),
    Structuur(office_core::writer::CursorActie),
    Klembord(klembord::Actie),
    Opslaan(bool),
    Opmaak(Opmaak),
    OpmaakToets(char),
    Terug,
    Vooruit,
    Ontsnap,
}
#[derive(Debug, Clone)]
pub struct Doel {
    pub document: u64,
    volgnummer: u64,
}
#[derive(Clone)]
struct Cursor {
    id: String,
    cursor: iced::advanced::text::editor::Cursor,
    voorkeur: Option<(String, CursorDoel)>,
}
impl Cursor {
    fn van(t: &Tab, st: &Staat) -> Option<Self> {
        let id = t.veld()?.id.clone();
        let cursor = t.editor.cursor();
        let pos = lint::tekenoffset(&t.editor, cursor.position);
        let voorkeur = st
            .voorkeur
            .as_ref()
            .filter(|(hash, c)| {
                t.antwoord.as_ref().is_some_and(|a| &a.hash == hash)
                    && c.punt.id == id
                    && c.punt.positie == pos
                    && c.pagina == t.deel
            })
            .cloned();
        Some(Self {
            id,
            cursor,
            voorkeur,
        })
    }
}
struct Geschiedenis {
    groep: u64,
    voor_hash: String,
    na_hash: String,
    voor: Cursor,
    na: Cursor,
}
struct Wijziging {
    voor: String,
    na: String,
    id: String,
    stappen: Vec<TekstStap>,
}
enum Soort {
    Invoer {
        groep: u64,
        reeks: TekstReeks,
        voor: Box<Cursor>,
    },
    Structuur {
        voor: Box<Cursor>,
    },
    Navigatie,
    Cursor {
        selecteren: bool,
    },
    Opmaak,
    Terug,
    Vooruit,
}
struct Vlucht {
    doel: Doel,
    hash: String,
    cursor: Cursor,
    soort: Soort,
}
#[derive(Default)]
pub struct Staat {
    pub actief: bool,
    pub delegeert: bool,
    rij: VecDeque<(Bericht, Instant)>,
    vlucht: Option<Vlucht>,
    klembord: Option<(u64, Instant)>,
    groep: u64,
    oorsprong: Option<Cursor>,
    laatst: Option<Instant>,
    pub versie: u64,
    pub markering: Option<TekstMarkering>,
    marker_hash: String,
    voorkeur: Option<(String, CursorDoel)>,
    doel_x: Option<f64>,
    veranderingen: VecDeque<Wijziging>,
    geschiedenis: VecDeque<Geschiedenis>,
    fout: bool,
}
impl Staat {
    pub fn heeft_invoer(&self) -> bool {
        self.vlucht
            .as_ref()
            .is_some_and(|v| !matches!(v.soort, Soort::Navigatie | Soort::Cursor { .. }))
            || self.klembord.is_some()
            || self.rij.iter().any(|(b, _)| {
                matches!(b,Bericht::Invoer(a) if a.is_edit())
                    || matches!(
                        b,
                        Bericht::Structuur(_)
                            | Bericht::Klembord(klembord::Actie::Knip | klembord::Actie::Plak)
                            | Bericht::Opmaak(_)
                            | Bericht::OpmaakToets(_)
                            | Bericht::Terug
                            | Bericht::Vooruit
                    )
            })
    }
    pub fn heeft_werk(&self) -> bool {
        self.vlucht.is_some() || self.klembord.is_some() || !self.rij.is_empty()
    }
    pub fn geometrie(&self, t: &Tab) -> Option<&TekstMarkering> {
        (self.actief
            && t.antwoord
                .as_ref()
                .is_some_and(|a| a.hash == self.marker_hash))
        .then_some(self.markering.as_ref())
        .flatten()
    }
    pub fn verlaat(&mut self) {
        self.actief = false;
        self.voorkeur = None;
        self.doel_x = None;
        self.nieuwe_groep();
        self.markering = None;
    }
    fn nieuwe_groep(&mut self) {
        self.groep = nummer();
        self.laatst = None;
        self.oorsprong = None;
    }
    fn ververs(&mut self, t: &Tab) {
        self.versie = self.versie.wrapping_add(1);
        if t.concept {
            return;
        }
        let Some(a) = &t.antwoord else { return };
        let Some(f) = &a.beeld.writer_frame else {
            self.markering = None;
            return;
        };
        let Some(v) = t.veld() else {
            self.markering = None;
            return;
        };
        let c = t.editor.cursor();
        let p = lint::tekenoffset(&t.editor, c.position);
        let q = c
            .selection
            .map(|x| lint::tekenoffset(&t.editor, x))
            .unwrap_or(p);
        self.markering = f.markering(&v.id, p.min(q), p.max(q)).ok();
        if let Some(m) = self.markering.as_mut() {
            m.cursor = f.markering(&v.id, p, p).ok().and_then(|m| m.cursor);
            if let Some((hash, c)) = &self.voorkeur
                && hash == &a.hash
                && c.punt.id == v.id
                && c.punt.positie == p
                && f.controleer_cursor(c).is_ok()
            {
                m.cursor = Some(c.cursor);
            }
        }
        self.marker_hash = a.hash.clone();
    }
}
fn plek(tekst: &str, n: usize) -> iced::advanced::text::editor::Position {
    let (mut line, mut column) = (0, 0);
    for c in tekst.chars().take(n) {
        if c == '\n' {
            line += 1;
            column = 0;
        } else {
            column += c.len_utf8();
        }
    }
    iced::advanced::text::editor::Position { line, column }
}
fn herstel(t: &mut Tab, c: &Cursor) {
    if let Some(n) = t
        .antwoord
        .as_ref()
        .and_then(|a| a.beeld.velden.iter().position(|v| v.id == c.id))
    {
        t.toon_veld(n);
        t.editor.move_to(c.cursor);
        t.werk_opmaak_bij();
    }
}
pub fn gewone_opdracht_gereed(t: &mut Tab) {
    if t.writer_direct.delegeert {
        return;
    }
    let mut st = std::mem::take(&mut t.writer_direct);
    st.nieuwe_groep();
    st.ververs(t);
    t.writer_direct = st;
}
fn verspring(p: &mut usize, s: &TekstStap) {
    if *p < s.begin {
        return;
    }
    let nieuw = s.tekst.chars().count();
    if *p > s.einde {
        *p = *p - (s.einde - s.begin) + nieuw;
    } else {
        *p = s.begin + nieuw;
    }
}
fn punt_bijwerken(st: &Staat, hash: &str, nu: &str, p: &mut TekstPunt) -> bool {
    if hash == nu {
        return true;
    }
    let mut h = hash;
    for w in &st.veranderingen {
        if w.voor == h {
            if w.id == p.id {
                for s in &w.stappen {
                    verspring(&mut p.positie, s);
                }
            }
            h = &w.na;
            if h == nu {
                return true;
            }
        }
    }
    false
}
pub fn update(app: &mut App, id: u64, b: Bericht) -> Task<Msg> {
    if app.postvak_zichtbaar
        || (app.bestand && !matches!(b, Bericht::Opslaan(_)))
        || app.instellingen
        || app.exportblad.is_some()
        || (app.sluiten.is_some() && !matches!(b, Bericht::Opslaan(_)))
    {
        return Task::none();
    }
    if matches!(b, Bericht::Opslaan(_)) {
        app.bestand = false;
    }
    let Some(t) = app.tabs.iter_mut().find(|t| t.id == id) else {
        return Task::none();
    };
    if !t
        .antwoord
        .as_ref()
        .is_some_and(|a| a.beeld.module == Module::Writer)
    {
        return Task::none();
    }
    if t.writer_direct.fout && matches!(b, Bericht::Terug) {
        let aantal = t.writer_direct.rij.len();
        let n = t.gekozen;
        t.toon_veld(n);
        let mut st = std::mem::take(&mut t.writer_direct);
        st.fout = false;
        st.rij.clear();
        st.nieuwe_groep();
        st.ververs(t);
        t.writer_direct = st;
        app.melding = format!(
            "Niet toegepaste invoer en {aantal} wachtende opdrachten op jouw verzoek verworpen"
        );
        return Task::none();
    }
    if t.writer_direct.rij.len() >= 4096 {
        return app.waarschuwing("De invoerbuffer is vol; wacht tot de tekst is verwerkt");
    }
    t.writer_direct.rij.push_back((b, Instant::now()));
    verwerk(app, id)
}
enum Uitkomst {
    Geen,
    Werk(Doel, Opdracht),
    Plak(u64),
    Kopie(String),
    Opslaan(bool),
    Focus,
}
pub fn hervat(app: &mut App, id: u64) -> Task<Msg> {
    if app
        .tabs
        .iter()
        .any(|t| t.id == id && t.writer_direct.delegeert)
    {
        return Task::none();
    }
    verwerk(app, id)
}
fn verwerk(app: &mut App, id: u64) -> Task<Msg> {
    if app.bestand || app.instellingen || app.exportblad.is_some() || app.postvak_zichtbaar {
        return Task::none();
    }
    let Some(i) = app.tabs.iter().position(|t| t.id == id) else {
        return Task::none();
    };
    let mut st = std::mem::take(&mut app.tabs[i].writer_direct);
    if app.tabs[i].bezig
        || app.tabs[i].schrijft
        || st.vlucht.is_some()
        || st.klembord.is_some()
        || st.fout
    {
        app.tabs[i].writer_direct = st;
        return Task::none();
    }
    let mut fout = None;
    let effect = {
        let t = &mut app.tabs[i];
        let mut resultaat = Uitkomst::Geen;
        while let Some((b, aangekomen)) = st.rij.front().cloned() {
            if st.actief
                && t.concept
                && !t.writer_stappen.is_empty()
                && !matches!(b,Bericht::Invoer(ref a) if a.is_edit())
            {
                resultaat = start_invoer(t, &mut st);
                break;
            }
            st.rij.pop_front();
            match b {
                Bericht::Punt {
                    hash,
                    mut punt,
                    cursor,
                    selecteren,
                } => {
                    if t.concept {
                        fout = Some(
                            "Pas de tekst rechts eerst toe; de pagina neemt dit concept niet over"
                                .into(),
                        );
                        break;
                    }
                    let Some(a) = &t.antwoord else { break };
                    if !punt_bijwerken(&st, &hash, &a.hash, &mut punt) {
                        fout = Some(
                            "Het paginabeeld is veranderd; klik opnieuw op de gewenste tekst"
                                .into(),
                        );
                        st.fout = true;
                        break;
                    }
                    let Some(n) = a.beeld.velden.iter().position(|v| v.id == punt.id) else {
                        break;
                    };
                    if selecteren && t.veld().is_some_and(|v| v.id != punt.id) {
                        fout = Some(
                            "Selecteren over meerdere alinea’s is nog niet aangesloten".into(),
                        );
                        break;
                    }
                    let oud = t.editor.cursor();
                    let anker = selecteren.then_some(oud.selection.unwrap_or(oud.position));
                    t.toon_veld(n);
                    let tekst = t.editor.text();
                    if punt.positie > tekst.chars().count() {
                        fout = Some("De klikpositie past niet meer bij de alinea".into());
                        break;
                    }
                    t.editor.move_to(iced::advanced::text::editor::Cursor {
                        position: plek(&tekst, punt.positie),
                        selection: anker,
                    });
                    t.werk_opmaak_bij();
                    st.actief = true;
                    st.doel_x = None;
                    st.voorkeur = cursor
                        .filter(|c| hash == t.antwoord.as_ref().unwrap().hash && c.punt == punt)
                        .map(|c| (hash.clone(), c));
                    st.nieuwe_groep();
                    st.ververs(t);
                    if st.markering.is_none() {
                        let d = Doel {
                            document: id,
                            volgnummer: nummer(),
                        };
                        let hash = t.antwoord.as_ref().unwrap().hash.clone();
                        st.vlucht = Some(Vlucht {
                            doel: d.clone(),
                            hash: hash.clone(),
                            cursor: Cursor::van(t, &st).unwrap(),
                            soort: Soort::Navigatie,
                        });
                        t.bezig = true;
                        resultaat = Uitkomst::Werk(
                            d,
                            Opdracht::NaarTekst {
                                id: punt.id,
                                hash,
                                begin: punt.positie,
                                einde: punt.positie,
                            },
                        );
                        break;
                    }
                    resultaat = Uitkomst::Focus;
                }
                Bericht::Invoer(a) => {
                    if !st.actief {
                        break;
                    }
                    if a.is_edit() && !t.veld().is_some_and(|v| v.bewerkbaar) {
                        fout = Some("Deze alinea is alleen-lezen".into());
                        break;
                    }
                    // Pas de structurele bedoeling toe op de dan actuele cursor.
                    // Eerst wordt eventuele eerdere tekstinvoer apart bevestigd.
                    let cursor = t.editor.cursor();
                    if cursor.selection.is_none() {
                        let positie = lint::tekenoffset(&t.editor, cursor.position);
                        let lengte = t.editor.text().chars().count();
                        let structuur = match &a {
                            text_editor::Action::Edit(text_editor::Edit::Backspace)
                                if positie == 0 =>
                            {
                                Some(office_core::writer::CursorActie::VorigeSamen)
                            }
                            text_editor::Action::Edit(text_editor::Edit::Delete)
                                if positie == lengte =>
                            {
                                Some(office_core::writer::CursorActie::VolgendeSamen)
                            }
                            _ => None,
                        };
                        if let Some(actie) = structuur {
                            st.rij.push_front((Bericht::Structuur(actie), aangekomen));
                            continue;
                        }
                    }
                    let bewerkt = a.is_edit();
                    if bewerkt
                        && (st.laatst.is_none_or(|v| {
                            aangekomen.saturating_duration_since(v) > Duration::from_secs(2)
                        }))
                    {
                        st.nieuwe_groep();
                    }
                    if bewerkt && st.oorsprong.is_none() {
                        st.oorsprong = Cursor::van(t, &st);
                    }
                    st.voorkeur = None;
                    st.doel_x = None;
                    if let Err(e) = writer_invoer::voer_uit(t, a) {
                        fout = Some(e);
                        break;
                    }
                    t.concept = !t.writer_stappen.is_empty();
                    if bewerkt {
                        st.laatst = Some(aangekomen);
                    } else {
                        st.nieuwe_groep();
                    }
                    t.werk_opmaak_bij();
                    st.ververs(t);
                }
                Bericht::Structuur(actie) => {
                    if !st.actief {
                        continue;
                    }
                    if !t.veld().is_some_and(|v| v.bewerkbaar) {
                        fout = Some("Deze alinea is alleen-lezen".into());
                        break;
                    }
                    let cursor = Cursor::van(t, &st).unwrap();
                    let positie = lint::tekenoffset(&t.editor, cursor.cursor.position);
                    let anker = cursor
                        .cursor
                        .selection
                        .map(|p| lint::tekenoffset(&t.editor, p))
                        .unwrap_or(positie);
                    let (begin, einde) = (positie.min(anker), positie.max(anker));
                    let hash = t.antwoord.as_ref().unwrap().hash.clone();
                    let d = Doel {
                        document: id,
                        volgnummer: nummer(),
                    };
                    let opdracht = Opdracht::WriterAlinea {
                        deel: t.deel,
                        hash: hash.clone(),
                        id: cursor.id.clone(),
                        begin,
                        einde,
                        actie,
                    };
                    st.vlucht = Some(Vlucht {
                        doel: d.clone(),
                        hash,
                        cursor: cursor.clone(),
                        soort: Soort::Structuur {
                            voor: Box::new(cursor),
                        },
                    });
                    st.nieuwe_groep();
                    t.bezig = true;
                    resultaat = Uitkomst::Werk(d, opdracht);
                    break;
                }
                Bericht::Beweeg(richting, selecteren) => {
                    if !st.actief {
                        continue;
                    }
                    let Some(cursor) = Cursor::van(t, &st) else {
                        continue;
                    };
                    let a = t.antwoord.as_ref().unwrap();
                    let punt = TekstPunt {
                        id: cursor.id.clone(),
                        positie: lint::tekenoffset(&t.editor, cursor.cursor.position),
                    };
                    let voorkeur = st
                        .voorkeur
                        .as_ref()
                        .filter(|(h, c)| h == &a.hash && c.punt == punt && c.pagina == t.deel)
                        .map(|(_, c)| c.clone());
                    let d = Doel {
                        document: id,
                        volgnummer: nummer(),
                    };
                    let hash = a.hash.clone();
                    let opdracht = Opdracht::WriterCursor {
                        deel: t.deel,
                        hash: hash.clone(),
                        punt,
                        richting,
                        voorkeur,
                        doel_x: st.doel_x,
                    };
                    st.vlucht = Some(Vlucht {
                        doel: d.clone(),
                        hash,
                        cursor,
                        soort: Soort::Cursor { selecteren },
                    });
                    st.nieuwe_groep();
                    t.bezig = true;
                    resultaat = Uitkomst::Werk(d, opdracht);
                    break;
                }
                Bericht::Klembord(klembord::Actie::Kopieer | klembord::Actie::Knip) => {
                    st.nieuwe_groep();
                    if let Some(tekst) = t.editor.selection().filter(|s| !s.is_empty()) {
                        if matches!(b, Bericht::Klembord(klembord::Actie::Knip)) {
                            if !t.veld().is_some_and(|v| v.bewerkbaar) {
                                fout = Some("Deze alinea is alleen-lezen".into());
                                break;
                            }
                            st.rij.push_front((
                                Bericht::Invoer(text_editor::Action::Edit(
                                    text_editor::Edit::Delete,
                                )),
                                aangekomen,
                            ));
                        }
                        resultaat = Uitkomst::Kopie(tekst);
                        break;
                    }
                }
                Bericht::Klembord(klembord::Actie::Plak) => {
                    st.nieuwe_groep();
                    if !t.veld().is_some_and(|v| v.bewerkbaar) {
                        fout = Some("Deze alinea is alleen-lezen".into());
                        break;
                    }
                    let n = nummer();
                    st.klembord = Some((n, aangekomen));
                    t.bezig = true;
                    resultaat = Uitkomst::Plak(n);
                    break;
                }
                Bericht::Opslaan(als) => {
                    st.nieuwe_groep();
                    resultaat = Uitkomst::Opslaan(als);
                    break;
                }
                Bericht::OpmaakToets(toets) => {
                    if let Some(s) = t.opmaak_van_selectie() {
                        let opmaak = match toets {
                            'b' => Opmaak::Vet(!s.vet),
                            'i' => Opmaak::Cursief(!s.cursief),
                            'u' => Opmaak::Onderstrepen(!s.onderstrepen),
                            _ => continue,
                        };
                        st.rij.push_front((Bericht::Opmaak(opmaak), aangekomen));
                    }
                }
                Bericht::Opmaak(opmaak) => {
                    if !t.veld().is_some_and(|v| v.bewerkbaar) {
                        fout = Some("Deze alinea is alleen-lezen".into());
                        break;
                    }
                    let Some((begin, einde)) = t.tekstbereik() else {
                        continue;
                    };
                    let cursor = Cursor::van(t, &st).unwrap();
                    let hash = t.antwoord.as_ref().unwrap().hash.clone();
                    let d = Doel {
                        document: id,
                        volgnummer: nummer(),
                    };
                    let opdracht = Opdracht::Bewerk(
                        t.deel,
                        Bewerking::Opmaak {
                            id: cursor.id.clone(),
                            begin,
                            einde,
                            stijl: opmaak,
                        },
                    );
                    st.vlucht = Some(Vlucht {
                        doel: d.clone(),
                        hash,
                        cursor,
                        soort: Soort::Opmaak,
                    });
                    st.nieuwe_groep();
                    t.bezig = true;
                    resultaat = Uitkomst::Werk(d, opdracht);
                    break;
                }
                Bericht::Terug | Bericht::Vooruit => {
                    let Some(a) = &t.antwoord else { break };
                    let terug = matches!(b, Bericht::Terug);
                    if !(if terug { a.terug } else { a.vooruit }) {
                        continue;
                    }
                    let c = st
                        .geschiedenis
                        .iter()
                        .rev()
                        .find(|g| {
                            if terug {
                                g.na_hash == a.hash
                            } else {
                                g.voor_hash == a.hash
                            }
                        })
                        .map(|g| if terug { g.voor.clone() } else { g.na.clone() })
                        .or_else(|| Cursor::van(t, &st))
                        .unwrap();
                    let d = Doel {
                        document: id,
                        volgnummer: nummer(),
                    };
                    st.vlucht = Some(Vlucht {
                        doel: d.clone(),
                        hash: a.hash.clone(),
                        cursor: c,
                        soort: if terug { Soort::Terug } else { Soort::Vooruit },
                    });
                    st.nieuwe_groep();
                    t.bezig = true;
                    resultaat = Uitkomst::Werk(
                        d,
                        if terug {
                            Opdracht::Terug(t.deel)
                        } else {
                            Opdracht::Vooruit(t.deel)
                        },
                    );
                    break;
                }
                Bericht::Ontsnap => {
                    let mut c = t.editor.cursor();
                    c.selection = None;
                    t.editor.move_to(c);
                    st.nieuwe_groep();
                    st.ververs(t);
                }
            }
        }
        if st.actief
            && matches!(resultaat, Uitkomst::Geen | Uitkomst::Focus)
            && !t.writer_stappen.is_empty()
        {
            resultaat = start_invoer(t, &mut st);
        }
        resultaat
    };
    if let Some(e) = fout {
        app.melding = if st.fout {
            format!(
                "Niet toegepast: {e}. De invoer blijft bewaard; Ctrl+Z verwerpt dit concept en de wachtende opdrachten."
            )
        } else {
            e
        };
        app.tabs[i].writer_focus.store(false, Ordering::Relaxed);
    }
    app.tabs[i].writer_direct = st;
    match effect {
        Uitkomst::Geen => Task::none(),
        Uitkomst::Werk(d, o) => Task::perform(app.werker.clone().voer_uit(id, o), move |r| {
            Msg::WriterGereed(d.clone(), r)
        }),
        Uitkomst::Plak(n) => iced::clipboard::read().map(move |s| Msg::WriterPlak(id, n, s)),
        Uitkomst::Kopie(s) => Task::batch([iced::clipboard::write(s), verwerk(app, id)]),
        Uitkomst::Opslaan(als) => {
            app.tabs[i].writer_direct.delegeert = true;
            let taak = app.update(Msg::Opslaan(id, als));
            app.tabs[i].writer_direct.delegeert = false;
            Task::batch([taak, verwerk(app, id)])
        }
        Uitkomst::Focus => {
            if app.tab().is_some_and(|t| t.id == id) {
                iced::widget::operation::focus("writer-pagina-invoer")
            } else {
                Task::none()
            }
        }
    }
}
fn start_invoer(t: &mut Tab, st: &mut Staat) -> Uitkomst {
    let v = t.veld().unwrap();
    let c = Cursor::van(t, st).unwrap();
    let hash = t.antwoord.as_ref().unwrap().hash.clone();
    let reeks = TekstReeks {
        id: v.id.clone(),
        bron: v.tekst.clone(),
        tekst: t.editor.text(),
        stappen: t.writer_stappen.clone(),
    };
    let voor = st
        .geschiedenis
        .iter()
        .rev()
        .find(|g| g.groep == st.groep)
        .map(|g| g.voor.clone())
        .or_else(|| st.oorsprong.take())
        .unwrap_or_else(|| c.clone());
    let positie = lint::tekenoffset(&t.editor, t.editor.cursor().position);
    let doel = Doel {
        document: t.id,
        volgnummer: nummer(),
    };
    let opdracht = Opdracht::WriterInvoer {
        deel: t.deel,
        hash: hash.clone(),
        groep: st.groep,
        reeks: reeks.clone(),
        positie,
    };
    st.vlucht = Some(Vlucht {
        doel: doel.clone(),
        hash,
        cursor: c,
        soort: Soort::Invoer {
            groep: st.groep,
            reeks,
            voor: Box::new(voor),
        },
    });
    t.bezig = true;
    Uitkomst::Werk(doel, opdracht)
}
pub fn plak(app: &mut App, id: u64, n: u64, s: Option<String>) -> Task<Msg> {
    let Some(t) = app.tabs.iter_mut().find(|t| t.id == id) else {
        return Task::none();
    };
    if t.writer_direct.klembord.map(|v| v.0) != Some(n) {
        return Task::none();
    }
    let aangekomen = t.writer_direct.klembord.take().unwrap().1;
    t.bezig = false;
    if let Some(s) = s.filter(|s| !s.is_empty()) {
        t.writer_direct.rij.push_front((
            Bericht::Invoer(text_editor::Action::Edit(text_editor::Edit::Paste(
                std::sync::Arc::new(s),
            ))),
            aangekomen,
        ));
    }
    verwerk(app, id)
}
pub fn gereed(app: &mut App, d: Doel, r: Result<Antwoord, String>) -> Task<Msg> {
    let Some(i) = app.tabs.iter().position(|t| t.id == d.document) else {
        return Task::none();
    };
    let Some(mut v) = app.tabs[i].writer_direct.vlucht.take() else {
        return Task::none();
    };
    if v.doel.volgnummer != d.volgnummer {
        app.tabs[i].writer_direct.vlucht = Some(v);
        return Task::none();
    }
    let a = match r {
        Ok(a) => a,
        Err(e) => {
            let t = &mut app.tabs[i];
            t.bezig = false;
            t.writer_direct.fout = true;
            t.writer_focus.store(false, Ordering::Relaxed);
            app.melding = format!(
                "Niet toegepast: {e}. De invoer blijft bewaard; Ctrl+Z verwerpt dit concept en de wachtende opdrachten."
            );
            return Task::none();
        }
    };
    let cursor_doel = a.writer_cursor.clone();
    let mut cursorfout = None;
    if matches!(v.soort, Soort::Structuur { .. }) {
        if let Some(punt) = &a.writer_positie
            && let Some(veld) = a.beeld.velden.iter().find(|f| f.id == punt.id)
            && punt.positie <= veld.tekst.chars().count()
        {
            v.cursor = Cursor {
                id: punt.id.clone(),
                cursor: iced::advanced::text::editor::Cursor {
                    position: plek(&veld.tekst, punt.positie),
                    selection: None,
                },
                voorkeur: cursor_doel.as_ref().map(|c| (a.hash.clone(), c.clone())),
            };
            if cursor_doel.is_none() {
                cursorfout=Some("De alineabewerking is toegepast; haar cursor kon niet op de pagina worden geplaatst. Vervolginvoer blijft bewaard.".to_string());
            }
        } else {
            cursorfout=Some("De alineabewerking is toegepast; het teruggegeven cursordoel ontbreekt. Vervolginvoer blijft bewaard.".into());
        }
    }

    if let Soort::Cursor { selecteren } = v.soort {
        let Some(c) = &cursor_doel else {
            app.tabs[i].bezig = false;
            app.melding = "De navigatie leverde geen cursor op".into();
            return Task::none();
        };
        if selecteren && c.punt.id != v.cursor.id {
            let t = &mut app.tabs[i];
            t.bezig = false;
            t.writer_direct.fout = true;
            t.writer_focus.store(false, Ordering::Relaxed);
            app.melding="Selecties over meerdere alinea’s zijn nog niet aangesloten. De bron blijft ongewijzigd; Ctrl+Z verwerpt wachtende invoer.".into();
            return Task::none();
        }
        let Some(veld) = a.beeld.velden.iter().find(|f| f.id == c.punt.id) else {
            app.tabs[i].bezig = false;
            app.melding = "De doelalinea ontbreekt in het navigatiebeeld".into();
            return Task::none();
        };
        let selectie = selecteren.then_some(
            v.cursor
                .cursor
                .selection
                .unwrap_or(v.cursor.cursor.position),
        );
        v.cursor = Cursor {
            id: c.punt.id.clone(),
            voorkeur: Some((a.hash.clone(), c.clone())),
            cursor: iced::advanced::text::editor::Cursor {
                position: plek(&veld.tekst, c.punt.positie),
                selection: selectie,
            },
        };
    }
    let nieuw = a.hash.clone();
    let actief = app.tab().is_some_and(|t| t.id == d.document);
    let melding = app.melding.clone();
    app.tabs[i].writer_direct.delegeert = true;
    let taak = app.update(Msg::Gereed(d.document, Ok(a)));
    app.tabs[i].writer_direct.delegeert = false;
    if !actief {
        app.melding = melding;
    }
    let t = &mut app.tabs[i];
    herstel(t, &v.cursor);
    let mut st = std::mem::take(&mut t.writer_direct);
    st.voorkeur = v.cursor.voorkeur.clone();
    if let Some(c) = cursor_doel {
        st.doel_x = c.doel_x;
        st.voorkeur = Some((nieuw.clone(), c));
    }
    match v.soort {
        Soort::Invoer { groep, reeks, voor } => {
            if let Some(g) = st.geschiedenis.iter_mut().rev().find(|g| g.groep == groep) {
                g.na_hash = nieuw.clone();
                g.na = v.cursor.clone();
            } else {
                st.geschiedenis.push_back(Geschiedenis {
                    groep,
                    voor_hash: v.hash.clone(),
                    na_hash: nieuw.clone(),
                    voor: *voor,
                    na: v.cursor.clone(),
                });
            }
            st.veranderingen.push_back(Wijziging {
                voor: v.hash,
                na: nieuw,
                id: reeks.id,
                stappen: reeks.stappen,
            });
            while st.veranderingen.len() > 32 {
                st.veranderingen.pop_front();
            }
            while st.geschiedenis.len() > 32 {
                st.geschiedenis.pop_front();
            }
        }
        Soort::Structuur { voor } => {
            // Nieuwe alinea-ID’s en verwijderde grenzen zijn geen tekstdelta.
            // Oude pagina-aanwijzingen worden daarom veilig opnieuw gevraagd.
            st.veranderingen.clear();
            if v.hash != nieuw {
                st.geschiedenis.push_back(Geschiedenis {
                    groep: nummer(),
                    voor_hash: v.hash,
                    na_hash: nieuw,
                    voor: *voor,
                    na: v.cursor.clone(),
                });
                while st.geschiedenis.len() > 32 {
                    st.geschiedenis.pop_front();
                }
            }
        }
        Soort::Terug | Soort::Vooruit => {
            st.veranderingen.clear();
        }
        Soort::Opmaak => {
            st.veranderingen.push_back(Wijziging {
                voor: v.hash,
                na: nieuw,
                id: v.cursor.id,
                stappen: vec![],
            });
            while st.veranderingen.len() > 32 {
                st.veranderingen.pop_front();
            }
        }
        Soort::Navigatie => {}
        Soort::Cursor { .. } => {}
    }
    st.ververs(t);
    if let Some(e) = cursorfout {
        st.fout = true;
        t.writer_focus.store(false, Ordering::Relaxed);
        if actief {
            app.melding = e;
        }
    }
    t.writer_direct = st;
    Task::batch([taak, verwerk(app, d.document)])
}
