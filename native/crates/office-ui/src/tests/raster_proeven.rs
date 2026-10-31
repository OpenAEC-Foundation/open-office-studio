//! Voer de echte widgetboom, focusoperaties en werkdraad uit met een eigen klembord.
use super::*;
use iced::{advanced::widget::operation::Outcome, futures::StreamExt};
#[derive(Default)]
struct Testklembord {
    tekst: Option<String>,
    primair: Option<String>,
}
impl iced::advanced::Clipboard for Testklembord {
    fn read(&self, kind: iced::advanced::clipboard::Kind) -> Option<String> {
        match kind {
            iced::advanced::clipboard::Kind::Standard => self.tekst.clone(),
            iced::advanced::clipboard::Kind::Primary => self.primair.clone(),
        }
    }
    fn write(&mut self, kind: iced::advanced::clipboard::Kind, tekst: String) {
        match kind {
            iced::advanced::clipboard::Kind::Standard => self.tekst = Some(tekst),
            iced::advanced::clipboard::Kind::Primary => self.primair = Some(tekst),
        }
    }
}
struct Proef {
    app: App,
    boom: Tree,
    renderer: iced_tiny_skia::Renderer,
    klembord: Testklembord,
    muis: iced::Point,
    focusoperaties: usize,
    klok: std::time::Instant,
}

fn writer_paginaproef() -> Proef {
    Proef::met_app(app_met_werkdraad(
        Module::Writer,
        include_bytes!("../../../office-core/tests/fixtures/writer-structuur.docx"),
    ))
}
fn writer_punt(p: &mut Proef, tekst: &str, positie: usize) -> iced::Point {
    let bounds = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| n.node.name == "Writer-documentpagina")
        .expect("Benoemde documentpagina")
        .bounds;
    let a = p.app.tab().unwrap().antwoord.as_ref().unwrap();
    let id = &a.beeld.velden.iter().find(|v| v.tekst == tekst).unwrap().id;
    let m = a
        .beeld
        .writer_frame
        .as_ref()
        .unwrap()
        .markering(id, positie, positie)
        .unwrap();
    let r = m.cursor.unwrap();
    iced::Point::new(
        bounds.x + r.x * bounds.width / a.beeld.pagina.breedte,
        bounds.y + (r.y + r.hoogte * 0.5) * bounds.height / a.beeld.pagina.hoogte,
    )
}
fn writer_snel(p: &mut Proef, berichten: impl IntoIterator<Item = writer_direct::Bericht>) {
    // Laat alle berichten bij dezelfde oude zichtbare bron aankomen, vóór de
    // eerste werkdraadreactie. De proef maakt de wachtrij daardoor echt nodig.
    let id = p.app.tab().unwrap().id;
    let taken: Vec<_> = berichten
        .into_iter()
        .map(|b| p.app.update(Msg::WriterDirect(id, b)))
        .collect();
    for taak in taken {
        p.taak(taak);
    }
    assert!(!p.app.tab().unwrap().bezig);
    assert!(!p.app.tab().unwrap().writer_direct.heeft_werk());
}
#[test]
fn writer_paginacursor_klikken_schalen_typen_en_een_exacte_undo() {
    use iced::keyboard::key::Named;
    for zoom in [0.75, 1., 1.5] {
        let mut p = writer_paginaproef();
        let origineel = p.bron();
        p.bericht(Msg::Zoom(zoom));
        let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
        p.klik(punt);
        let t = p.app.tab().unwrap();
        assert!(t.writer_focus.load(std::sync::atomic::Ordering::Relaxed));
        assert_eq!(lint::tekenoffset(&t.editor, t.editor.cursor().position), 8);
        let voor = p.verbeeld();
        p.toets(
            iced::keyboard::Key::Character("é".into()),
            iced::keyboard::Modifiers::empty(),
            Some("é"),
        );
        let t = p.app.tab().unwrap();
        assert_eq!(t.editor.text(), "Links 🏠 écafé rechts");
        assert!(!t.concept);
        assert!(!t.bezig);
        let b = Sessie::open(Module::Writer, p.bron().as_ref().clone())
            .unwrap()
            .weergave(0)
            .unwrap();
        assert!(b.velden.iter().any(|v| v.tekst == "Links 🏠 écafé rechts"));
        assert_ne!(voor.data(), p.verbeeld().data());
        if zoom == 1.
            && let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN")
        {
            std::fs::create_dir_all(&map).unwrap();
            p.verbeeld()
                .save_png(PathBuf::from(map).join("writer-pagina-invoer.png"))
                .unwrap();
        }
        p.toets(
            iced::keyboard::Key::Character("z".into()),
            iced::keyboard::Modifiers::COMMAND,
            None,
        );
        assert_eq!(p.bron().as_slice(), origineel.as_slice());
        let t = p.app.tab().unwrap();
        assert_eq!(lint::tekenoffset(&t.editor, t.editor.cursor().position), 8);
        p.named(Named::ArrowRight);
        let t = p.app.tab().unwrap();
        assert_eq!(lint::tekenoffset(&t.editor, t.editor.cursor().position), 9);
    }
}
#[test]
fn writer_paginawachtrij_bewaart_snellen_unicode_selectie_knip_plak_en_undo() {
    use text_editor::{Action as A, Edit as E};
    use writer_direct::Bericht as B;
    let mut p = writer_paginaproef();
    let origineel = p.bron();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    writer_snel(
        &mut p,
        ["é", "🏠", "abc"]
            .into_iter()
            .map(|s| B::Invoer(A::Edit(E::Paste(std::sync::Arc::new(s.into()))))),
    );
    assert_eq!(
        p.app.tab().unwrap().editor.text(),
        "Links 🏠 é🏠abccafé rechts"
    );
    let na = p.bron();
    p.bericht(Msg::Terug);
    assert_eq!(p.bron().as_slice(), origineel.as_slice());
    p.bericht(Msg::Vooruit);
    assert_eq!(p.bron().as_slice(), na.as_slice());
    p.klembord.tekst = Some("vooraf gewijzigde klembordtekst".into());
    writer_snel(
        &mut p,
        [
            B::Invoer(A::SelectAll),
            B::Klembord(klembord::Actie::Knip),
            B::Klembord(klembord::Actie::Plak),
        ],
    );
    assert_eq!(
        p.klembord.tekst.as_deref(),
        Some("Links 🏠 é🏠abccafé rechts")
    );
    assert_eq!(
        p.app.tab().unwrap().editor.text(),
        "Links 🏠 é🏠abccafé rechts"
    );
    p.bericht(Msg::Terug);
    assert_eq!(p.app.tab().unwrap().editor.text(), "");
    p.bericht(Msg::Terug);
    assert_eq!(p.bron().as_slice(), na.as_slice());
}
#[test]
fn writer_paginaselectie_via_slepen_kopieert_bron_en_ime_commit_bewaart_opmaak() {
    let mut p = writer_paginaproef();
    let origineel = p.bron();
    let a = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    let b = writer_punt(&mut p, "Links 🏠 café rechts", 12);
    p.muis = a;
    p.gebeurtenis(iced::Event::Mouse(iced::mouse::Event::ButtonPressed(
        iced::mouse::Button::Left,
    )));
    p.muis = b;
    p.gebeurtenis(iced::Event::Mouse(iced::mouse::Event::CursorMoved {
        position: b,
    }));
    p.gebeurtenis(iced::Event::Mouse(iced::mouse::Event::ButtonReleased(
        iced::mouse::Button::Left,
    )));
    assert_eq!(
        p.app.tab().unwrap().editor.selection().as_deref(),
        Some("café")
    );
    p.toets(
        iced::keyboard::Key::Character("c".into()),
        iced::keyboard::Modifiers::COMMAND,
        None,
    );
    assert_eq!(p.klembord.tekst.as_deref(), Some("café"));
    p.gebeurtenis(iced::Event::InputMethod(
        iced::advanced::input_method::Event::Opened,
    ));
    p.gebeurtenis(iced::Event::InputMethod(
        iced::advanced::input_method::Event::Preedit("仮".into(), Some(0..3)),
    ));
    assert_eq!(p.bron().as_slice(), origineel.as_slice());
    p.gebeurtenis(iced::Event::InputMethod(
        iced::advanced::input_method::Event::Commit("日本🏠".into()),
    ));
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 日本🏠 rechts");
    p.gebeurtenis(iced::Event::InputMethod(
        iced::advanced::input_method::Event::Closed,
    ));
    let bron = p.bron();
    let d = Sessie::open(Module::Writer, bron.as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    let v = d
        .velden
        .iter()
        .find(|v| v.tekst == "Links 🏠 日本🏠 rechts")
        .unwrap();
    let stijl = &d.writer_opmaak[&v.id];
    assert!(
        office_core::writer_opmaak::selectie(stijl, 0, 8)
            .unwrap()
            .vet
    );
    assert!(
        office_core::writer_opmaak::selectie(stijl, 8, 11)
            .unwrap()
            .cursief
    );
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::write(
            PathBuf::from(map).join("writer-pagina-ime.docx"),
            bron.as_slice(),
        )
        .unwrap();
    }
    p.bericht(Msg::Terug);
    assert_eq!(p.bron().as_slice(), origineel.as_slice());
}
#[test]
fn writer_late_paginaklik_wordt_alleen_door_eigen_invoerstappen_verplaatst() {
    use text_editor::{Action as A, Edit as E};
    use writer_direct::Bericht as B;
    let mut p = writer_paginaproef();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    let t = p.app.tab().unwrap();
    let hash = t.antwoord.as_ref().unwrap().hash.clone();
    let id = t.veld().unwrap().id.clone();
    writer_snel(
        &mut p,
        [
            B::Invoer(A::Edit(E::Paste(std::sync::Arc::new("AB".into())))),
            B::Punt {
                hash,
                punt: office_core::writer_cursor::TekstPunt { id, positie: 12 },
                cursor: None,
                selecteren: false,
            },
            B::Invoer(A::Edit(E::Insert('!'))),
        ],
    );
    assert_eq!(
        p.app.tab().unwrap().editor.text(),
        "Links 🏠 ABcafé! rechts"
    );
}
#[test]
fn writer_pagina_verliest_focus_naar_zijeditor_en_weigert_alleen_lezen_invoer() {
    let mut p = writer_paginaproef();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    p.klik(iced::Point::new(1220., 300.));
    assert!(
        !p.app
            .tab()
            .unwrap()
            .writer_focus
            .load(std::sync::atomic::Ordering::Relaxed)
    );
    p.toets(
        iced::keyboard::Key::Character("!".into()),
        iced::keyboard::Modifiers::empty(),
        Some("!"),
    );
    assert!(p.app.tab().unwrap().concept);
    let bron = p.bron();
    p.klik(punt);
    assert_eq!(p.bron().as_slice(), bron.as_slice());
    assert!(p.app.melding.contains("eerst toe"));
    let mut p = writer_paginaproef();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    let bron = p.bron();
    let t = p.app.tab_mut().unwrap();
    let n = t.gekozen;
    t.antwoord.as_mut().unwrap().beeld.velden[n].bewerkbaar = false;
    p.toets(
        iced::keyboard::Key::Character("!".into()),
        iced::keyboard::Modifiers::empty(),
        Some("!"),
    );
    assert_eq!(p.bron().as_slice(), bron.as_slice());
    assert!(p.app.melding.contains("alleen-lezen"));
}
#[test]
fn writer_pagina_opslaan_wacht_op_invoer_en_laat_latere_tekst_gewijzigd() {
    use text_editor::{Action as A, Edit as E};
    use writer_direct::Bericht as B;
    let mut p = writer_paginaproef();
    let oud = p.bron();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    let uniek = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let pad = std::env::temp_dir().join(format!("office-pagina-{uniek}.docx"));
    std::fs::write(&pad, oud.as_slice()).unwrap();
    let t = p.app.tab_mut().unwrap();
    t.pad = Some(pad.clone());
    t.verwacht = Some(opslag::hash(oud.as_slice()));
    writer_snel(
        &mut p,
        [
            B::Invoer(A::Edit(E::Insert('!'))),
            B::Opslaan(false),
            B::Invoer(A::Edit(E::Insert('?'))),
        ],
    );
    let bewaard = std::fs::read(&pad).unwrap();
    let b = Sessie::open(Module::Writer, bewaard)
        .unwrap()
        .weergave(0)
        .unwrap();
    assert!(b.velden.iter().any(|v| v.tekst == "Links 🏠 !café rechts"));
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 !?café rechts");
    assert!(p.app.tab().unwrap().gewijzigd());
    p.bericht(Msg::Opslaan(1, false));
    assert_eq!(std::fs::read(&pad).unwrap(), *p.bron());
    assert!(!p.app.tab().unwrap().gewijzigd());
    std::fs::remove_file(pad).unwrap();
}
#[test]
fn writer_pagina_achtergrondzoeken_en_dubbele_reactie_nemen_cursor_niet_over() {
    use text_editor::{Action as A, Edit as E};
    use writer_direct::Bericht as B;
    let mut p = writer_paginaproef();
    p.bericht(Msg::Zoeken(zoeken_ui::Bericht::Open(false)));
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    p.bericht(Msg::Zoeken(zoeken_ui::Bericht::Tekst("café".into())));
    let t = p.app.tab().unwrap();
    assert_eq!(lint::tekenoffset(&t.editor, t.editor.cursor().position), 8);
    assert!(t.editor.selection().is_none());
    let taak = p
        .app
        .update(Msg::WriterDirect(1, B::Invoer(A::Edit(E::Insert('!')))));
    let mut stroom = iced_runtime::task::into_stream(taak).unwrap();
    let actie = iced::futures::executor::block_on(stroom.next()).unwrap();
    let iced_runtime::Action::Output(reactie @ Msg::WriterGereed(..)) = actie else {
        panic!("Geen eigen werkdraadreactie")
    };
    p.bericht(reactie.clone());
    let na = p.bron();
    let cursor = p.app.tab().unwrap().editor.cursor();
    let operaties = p.focusoperaties;
    p.bericht(reactie);
    p.bericht(Msg::WriterPlak(
        1,
        u64::MAX,
        Some("oude klembordtekst".into()),
    ));
    assert_eq!(*p.bron(), *na);
    assert_eq!(p.app.tab().unwrap().editor.cursor(), cursor);
    assert_eq!(p.focusoperaties, operaties);
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 !café rechts");
    assert!(
        p.app
            .tab()
            .unwrap()
            .writer_focus
            .load(std::sync::atomic::Ordering::Relaxed)
    );
}
#[test]
fn writer_zoekpaneel_sluiten_behoudt_de_werkelijke_editorfocus() {
    use iced::keyboard::{Key, Modifiers, key::Named};
    use zoeken_ui::Bericht as Z;
    let mut p = writer_paginaproef();
    p.bericht(Msg::Zoeken(Z::Open(false)));
    p.bericht(Msg::Zoeken(Z::Tekst("café".into())));
    p.bericht(Msg::Zoeken(Z::Kies(0)));
    p.named(Named::Escape);
    assert!(p.app.zoeken.is_none());
    p.toets(Key::Character("!".into()), Modifiers::empty(), Some("!"));
    assert!(p.app.tab().unwrap().concept);
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 ! rechts");
    let mut p = writer_paginaproef();
    p.bericht(Msg::Zoeken(Z::Open(false)));
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    p.bericht(Msg::Zoeken(Z::Sluit));
    p.toets(Key::Character("!".into()), Modifiers::empty(), Some("!"));
    assert!(!p.app.tab().unwrap().concept);
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 !café rechts");
}
#[test]
fn writer_pagina_opmaak_sneltoets_bewaart_cursor_en_onderbreekt_invoerundo() {
    use text_editor::{Action as A, Edit as E};
    use writer_direct::Bericht as B;
    let mut p = writer_paginaproef();
    let bron = p.bron();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    writer_snel(
        &mut p,
        [
            B::Invoer(A::Edit(E::Insert('!'))),
            B::OpmaakToets('u'),
            B::Invoer(A::Edit(E::Insert('?'))),
        ],
    );
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 !?café rechts");
    let t = p.app.tab().unwrap();
    assert_eq!(lint::tekenoffset(&t.editor, t.editor.cursor().position), 10);
    assert!(t.opmaak_van_selectie().unwrap().onderstrepen);
    p.bericht(Msg::Terug);
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 !café rechts");
    assert!(
        p.app
            .tab()
            .unwrap()
            .opmaak_van_selectie()
            .unwrap()
            .onderstrepen
    );
    p.bericht(Msg::Terug);
    assert!(
        !p.app
            .tab()
            .unwrap()
            .opmaak_van_selectie()
            .unwrap()
            .onderstrepen
    );
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 !café rechts");
    p.bericht(Msg::Terug);
    assert!(
        p.bron().as_slice() == bron.as_slice(),
        "Derde undo moet de exacte oorspronkelijke bron herstellen"
    );
    p.toets(
        iced::keyboard::Key::Character("u".into()),
        iced::keyboard::Modifiers::COMMAND,
        None,
    );
    assert!(
        p.app
            .tab()
            .unwrap()
            .opmaak_van_selectie()
            .unwrap()
            .onderstrepen
    );
    assert_eq!(
        lint::tekenoffset(
            &p.app.tab().unwrap().editor,
            p.app.tab().unwrap().editor.cursor().position
        ),
        8
    );
}
#[test]
fn writer_pagina_kernweigering_bewaart_concept_en_wachtrij_tot_expliciet_verwerpen() {
    use text_editor::{Action as A, Edit as E};
    use writer_direct::Bericht as B;
    let mut p = Proef::met_app(app_met_werkdraad(
        Module::Writer,
        include_bytes!("../../../office-core/tests/fixtures/writer-beveiligd.docx"),
    ));
    let origineel = p.bron();
    let tekst = p.app.tab().unwrap().veld().unwrap().tekst.clone();
    let punt = writer_punt(&mut p, &tekst, 0);
    p.klik(punt);
    let t = p.app.tab_mut().unwrap();
    t.opgeslagen = Some(t.antwoord.as_ref().unwrap().hash.clone());
    let n = t.gekozen;
    // Simuleer een onjuiste frontendstatus: de onafhankelijke kern moet de
    // bronbeveiliging alsnog handhaven en het plaatselijke concept behouden.
    t.antwoord.as_mut().unwrap().beeld.velden[n].bewerkbaar = true;
    let eerste = p
        .app
        .update(Msg::WriterDirect(1, B::Invoer(A::Edit(E::Insert('!')))));
    let tweede = p
        .app
        .update(Msg::WriterDirect(1, B::Invoer(A::Edit(E::Insert('?')))));
    p.taak(eerste);
    p.taak(tweede);
    assert!(
        p.bron().as_slice() == origineel.as_slice(),
        "Geweigerde invoer wijzigde de bron"
    );
    let t = p.app.tab().unwrap();
    assert!(t.concept && t.gewijzigd());
    assert_eq!(t.editor.text(), format!("!{tekst}"));
    assert!(t.writer_direct.heeft_werk());
    assert!(!t.bezig);
    assert!(p.app.melding.contains("Niet toegepast"));
    p.bericht(Msg::Opslaan(1, false));
    assert!(!p.app.tab().unwrap().schrijft);
    assert!(p.app.tab().unwrap().concept);
    let kern =
        iced::futures::executor::block_on(p.app.werker.clone().voer_uit(1, Opdracht::Deel(0)))
            .unwrap();
    assert!(
        kern.bron.as_slice() == origineel.as_slice(),
        "De kern heeft de bron toch gewijzigd"
    );
    p.bericht(Msg::Terug);
    let t = p.app.tab().unwrap();
    assert!(!t.concept && !t.gewijzigd() && !t.writer_direct.heeft_werk());
    assert_eq!(t.editor.text(), tekst);
    assert!(p.app.melding.contains("op jouw verzoek verworpen"));
}
fn lange_paginaproef() -> Proef {
    let mut s = Sessie::open(
        Module::Writer,
        include_bytes!("../../../office-core/tests/fixtures/writer-structuur.docx").to_vec(),
    )
    .unwrap();
    let b = s.weergave(0).unwrap();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: b.velden[0].id.clone(),
            tekst: "Lange 🏠 regel met café ".repeat(12),
        },
    )
    .unwrap();
    Proef::met_app(app_met_werkdraad(Module::Writer, &s.bron()))
}
fn tweede_regel(p: &Proef) -> office_core::writer_navigatie::CursorDoel {
    let t = p.app.tab().unwrap();
    let a = t.antwoord.as_ref().unwrap();
    let v = &a.beeld.velden[0];
    let f = a.beeld.writer_frame.as_ref().unwrap();
    let eerste = f.cursordoel(&v.id, 0).unwrap();
    (1..v.tekst.chars().count())
        .map(|n| f.cursordoel(&v.id, n).unwrap())
        .find(|c| c.regel != eerste.regel)
        .unwrap()
}
#[test]
fn cursor_paginapijlen_verwerken_snellen_toetsen_zonder_bronwijziging_of_undo() {
    use iced::keyboard::key::Named;
    use office_core::writer_navigatie::Richting as R;
    use writer_direct::Bericht as B;
    let mut p = Proef::met_app(app_met_werkdraad(
        Module::Writer,
        include_bytes!("../../../office-core/tests/fixtures/writer-cachepaginas.docx"),
    ));
    let bron = p.bron();
    let tekst = p.app.tab().unwrap().antwoord.as_ref().unwrap().beeld.velden[0]
        .tekst
        .clone();
    let punt = writer_punt(&mut p, &tekst, 0);
    p.klik(punt);
    let t = p.app.tab_mut().unwrap();
    t.opgeslagen = Some(t.antwoord.as_ref().unwrap().hash.clone());
    let taak = p
        .app
        .update(Msg::WriterDirect(1, B::Beweeg(R::Omlaag, false)));
    assert!(
        !p.app.tab().unwrap().gewijzigd(),
        "Een lopende navigatie is geen bronwijziging"
    );
    p.taak(taak);
    writer_snel(&mut p, (0..3).map(|_| B::Beweeg(R::Omlaag, false)));
    assert_eq!(p.app.tab().unwrap().deel, 4);
    assert!(
        p.app
            .tab()
            .unwrap()
            .veld()
            .unwrap()
            .tekst
            .contains("cachepagina 4")
    );
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("writer-pagina-navigatie.png"))
            .unwrap();
    }
    p.named(Named::ArrowDown);
    assert_eq!(p.app.tab().unwrap().deel, 5);
    p.named(Named::ArrowDown);
    assert_eq!(p.app.tab().unwrap().deel, 5);
    p.named(Named::ArrowUp);
    assert_eq!(p.app.tab().unwrap().deel, 4);
    assert!(p.bron().as_slice() == bron.as_slice());
    assert!(!p.app.tab().unwrap().antwoord.as_ref().unwrap().terug);
    assert!(!p.app.tab().unwrap().gewijzigd());
}
#[test]
fn cursor_home_end_shiftselectie_en_klembord_volgen_de_werkelijke_documentregel() {
    use iced::keyboard::{Key, Modifiers, key::Named};
    let mut p = lange_paginaproef();
    let bron = p.bron();
    let tweede = tweede_regel(&p);
    let tekst = p.app.tab().unwrap().antwoord.as_ref().unwrap().beeld.velden[0]
        .tekst
        .clone();
    let punt = writer_punt(&mut p, &tekst, 2);
    p.klik(punt);
    let eerste = p
        .app
        .tab()
        .unwrap()
        .writer_direct
        .geometrie(p.app.tab().unwrap())
        .unwrap()
        .cursor
        .unwrap();
    p.named(Named::End);
    let t = p.app.tab().unwrap();
    assert_eq!(
        lint::tekenoffset(&t.editor, t.editor.cursor().position),
        tweede.punt.positie
    );
    assert_eq!(
        t.writer_direct.geometrie(t).unwrap().cursor.unwrap().y,
        eerste.y
    );
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("writer-regelgrens.png"))
            .unwrap();
    }
    p.named(Named::ArrowDown);
    p.named(Named::Home);
    let t = p.app.tab().unwrap();
    assert_eq!(
        lint::tekenoffset(&t.editor, t.editor.cursor().position),
        tweede.punt.positie
    );
    assert_eq!(
        t.writer_direct.geometrie(t).unwrap().cursor.unwrap().y,
        tweede.cursor.y
    );
    p.toets(Key::Named(Named::End), Modifiers::SHIFT, None);
    let t = p.app.tab().unwrap();
    let eind = lint::tekenoffset(&t.editor, t.editor.cursor().position);
    let verwacht: String = tekst
        .chars()
        .skip(tweede.punt.positie)
        .take(eind - tweede.punt.positie)
        .collect();
    assert!(!verwacht.is_empty());
    assert_eq!(t.editor.selection().as_deref(), Some(verwacht.as_str()));
    p.toets(Key::Character("c".into()), Modifiers::COMMAND, None);
    assert_eq!(p.klembord.tekst.as_deref(), Some(verwacht.as_str()));
    assert!(p.bron().as_slice() == bron.as_slice());
}
#[test]
fn cursor_snelle_regelnavigatie_en_typen_behouden_de_juist_geadresseerde_tekst() {
    use office_core::writer_navigatie::Richting as R;
    use text_editor::{Action as A, Edit as E};
    use writer_direct::Bericht as B;
    let mut p = lange_paginaproef();
    let bron = p.bron();
    let tweede = tweede_regel(&p);
    let tekst = p.app.tab().unwrap().antwoord.as_ref().unwrap().beeld.velden[0]
        .tekst
        .clone();
    let punt = writer_punt(&mut p, &tekst, 2);
    p.klik(punt);
    writer_snel(
        &mut p,
        [
            B::Beweeg(R::RegelEinde, false),
            B::Beweeg(R::Omlaag, false),
            B::Beweeg(R::RegelBegin, false),
            B::Invoer(A::Edit(E::Insert('!'))),
        ],
    );
    let mut verwacht: Vec<_> = tekst.chars().collect();
    verwacht.insert(tweede.punt.positie, '!');
    let verwacht: String = verwacht.into_iter().collect();
    assert_eq!(p.app.tab().unwrap().editor.text(), verwacht);
    let b = Sessie::open(Module::Writer, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden[0].tekst, verwacht);
    p.bericht(Msg::Terug);
    assert!(p.bron().as_slice() == bron.as_slice());
}
#[test]
fn cursor_undo_na_invoer_aan_de_regelgrens_herstelt_ook_de_zichtbare_affiniteit() {
    use iced::keyboard::key::Named;
    let mut p = lange_paginaproef();
    let bron = p.bron();
    let tekst = p.app.tab().unwrap().antwoord.as_ref().unwrap().beeld.velden[0]
        .tekst
        .clone();
    let punt = writer_punt(&mut p, &tekst, 2);
    p.klik(punt);
    p.named(Named::End);
    let t = p.app.tab().unwrap();
    let cursor = t.editor.cursor();
    let vlak = t.writer_direct.geometrie(t).unwrap().cursor.unwrap();
    p.toets(
        iced::keyboard::Key::Character("!".into()),
        iced::keyboard::Modifiers::empty(),
        Some("!"),
    );
    p.bericht(Msg::Terug);
    let t = p.app.tab().unwrap();
    assert_eq!(t.editor.cursor(), cursor);
    assert_eq!(t.writer_direct.geometrie(t).unwrap().cursor, Some(vlak));
    assert!(p.bron().as_slice() == bron.as_slice());
}
#[test]
fn celbereik_shiftpijlen_behouden_anker_bron_en_bestaande_bereikopmaak() {
    use iced::keyboard::{Key, Modifiers, key::Named};
    let mut p = Proef::nieuw();
    let bron = p.bron();
    p.cel("D4", false);
    p.toets(Key::Named(Named::ArrowLeft), Modifiers::SHIFT, None);
    p.toets(Key::Named(Named::ArrowUp), Modifiers::SHIFT, None);
    assert_eq!(p.app.tab().unwrap().adres, "C3:D4");
    assert_eq!(
        p.app.tab().unwrap().raster.selectie.as_ref().unwrap().anker,
        "D4"
    );
    p.toets(Key::Named(Named::ArrowLeft), Modifiers::SHIFT, None);
    assert_eq!(p.app.tab().unwrap().adres, "B3:D4");
    assert_eq!(*p.bron(), *bron);
    assert!(!p.app.tab().unwrap().antwoord.as_ref().unwrap().terug);
    p.bericht(Msg::Opmaak(office_core::opmaak::Opmaak::Vet(true)));
    assert_eq!(p.app.tab().unwrap().adres, "B3:D4");
    let office_core::document::Document::Spreadsheet(d) =
        office_core::document::Document::open(Module::Spreadsheet, &p.bron()).unwrap()
    else {
        panic!()
    };
    // De GUI voert de echte bereikopdracht uit, ook voor de niet-actieve cellen.
    for v in p
        .app
        .tab()
        .unwrap()
        .antwoord
        .as_ref()
        .unwrap()
        .beeld
        .velden
        .iter()
        .filter(|v| ["B3", "C3", "D3", "B4", "C4", "D4"].contains(&v.id.as_str()))
    {
        assert!(v.opmaak.vet, "{}", v.id);
    }
    drop(d);
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("spreadsheet-bereikselectie.png"))
            .unwrap();
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("spreadsheet-bereikselectie.xlsx"),
            p.bron().as_slice(),
        )
        .unwrap();
    }
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
    p.named(Named::ArrowRight);
    assert_eq!(p.app.tab().unwrap().adres, "C3");
    assert!(p.app.tab().unwrap().raster.selectie.is_none());
}
#[test]
fn celbereik_snellen_toetsen_blijven_in_volgorde_tijdens_werkvensterwissel() {
    use office_core::rekenblad::Richting;
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    p.bericht(Msg::Adres("X59".into()));
    p.bericht(Msg::GaNaar);
    let taak = p
        .app
        .update(Msg::Raster(raster_ui::Bericht::Vergroot(Richting::Rechts)));
    assert!(p.app.tab().unwrap().bezig);
    for r in [
        Richting::Onder,
        Richting::Onder,
        Richting::Rechts,
        Richting::Boven,
    ] {
        let t = p.app.update(Msg::Raster(raster_ui::Bericht::Vergroot(r)));
        p.taak(t);
    }
    assert_eq!(p.app.tab().unwrap().raster.wachtend.len(), 4);
    p.taak(taak);
    let t = p.app.tab().unwrap();
    assert_eq!(t.adres, "X59:Z60");
    assert_eq!(t.raster.selectie.as_ref().unwrap().anker, "X59");
    assert!(t.raster.wachtend.is_empty());
    assert_eq!(*p.bron(), *bron);
    assert!(!t.antwoord.as_ref().unwrap().terug);
}
#[test]
fn celbereik_muis_slepen_shiftklik_en_zoom_volgen_de_echte_rastergeometrie() {
    use iced::{
        Event,
        keyboard::{Event as K, Modifiers},
        mouse::{Button, Event as M},
    };
    for zoom in [0.75, 1., 1.5] {
        let mut p = Proef::nieuw();
        p.bericht(Msg::Zoom(zoom));
        let bron = p.bron();
        p.cel("B2", false);
        p.gebeurtenis(Event::Keyboard(K::ModifiersChanged(Modifiers::empty())));
        p.gebeurtenis(Event::Mouse(M::ButtonPressed(Button::Left)));
        let groep = p
            .toegankelijkheid()
            .nodes
            .into_iter()
            .find(|n| n.node.name == "Werkbladraster")
            .unwrap()
            .bounds;
        let b = &p.app.tab().unwrap().antwoord.as_ref().unwrap().beeld;
        let r = b
            .pagina
            .vlakken
            .iter()
            .find(|r| r.id == "D5")
            .unwrap()
            .grens;
        p.muis = iced::Point::new(
            groep.x + (r.x + r.breedte / 2.) * zoom,
            groep.y + (r.y + r.hoogte / 2.) * zoom,
        );
        p.gebeurtenis(Event::Mouse(M::CursorMoved { position: p.muis }));
        p.gebeurtenis(Event::Mouse(M::ButtonReleased(Button::Left)));
        assert_eq!(p.app.tab().unwrap().adres, "B2:D5", "zoom {zoom}");
        p.gebeurtenis(Event::Keyboard(K::ModifiersChanged(Modifiers::SHIFT)));
        p.cel("C3", false);
        assert_eq!(p.app.tab().unwrap().adres, "B2:C3");
        p.gebeurtenis(Event::Keyboard(K::ModifiersChanged(Modifiers::empty())));
        p.cel("A1", false);
        assert_eq!(p.app.tab().unwrap().adres, "A1");
        assert_eq!(*p.bron(), *bron);
    }
}
#[test]
fn celbereik_samenvoeging_fout_en_bestandsvenster_laten_bron_en_focus_intact() {
    use office_core::rekenblad::{Richting, Structuur};
    let mut p = Proef::nieuw();
    p.bericht(Msg::Adres("B2:D3".into()));
    p.bericht(Msg::GaNaar);
    p.bericht(Msg::Structuur(Structuur::Samenvoegen));
    let bron = p.bron();
    p.cel("B2", false);
    p.bericht(Msg::Raster(raster_ui::Bericht::Vergroot(Richting::Rechts)));
    assert_eq!(p.app.tab().unwrap().adres, "B2:E3");
    let taak = p
        .app
        .update(Msg::Raster(raster_ui::Bericht::BreidUit("A10001".into())));
    p.taak(taak);
    assert!(p.app.melding.contains("10.000"));
    assert_eq!(p.app.tab().unwrap().adres, "B2:E3");
    let taak = p
        .app
        .update(Msg::Raster(raster_ui::Bericht::Vergroot(Richting::Onder)));
    p.app.bestand = true;
    let n = p.focusoperaties;
    p.taak(taak);
    assert_eq!(p.focusoperaties, n);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn bladbeveiliging_gui_toont_de_beperking_en_laat_alleen_selectie_en_navigatie_toe() {
    use iced::keyboard::{Key, Modifiers, key::Named};
    let bytes = include_bytes!("../../../office-core/tests/fixtures/spreadsheet-beveiligd.xlsx");
    let mut p = Proef::met_app(app_met_werkdraad(Module::Spreadsheet, bytes));
    let bron = p.bron();
    assert!(
        p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .beeld
            .bewerkingsbeperking
            .is_some()
    );
    p.cel("B2", false);
    p.named(Named::F2);
    assert!(!p.app.tab().unwrap().raster.bewerken);
    p.toets(Key::Character("7".into()), Modifiers::empty(), Some("7"));
    assert!(!p.app.tab().unwrap().concept);
    p.toets(Key::Named(Named::ArrowRight), Modifiers::SHIFT, None);
    p.toets(Key::Named(Named::ArrowDown), Modifiers::SHIFT, None);
    assert_eq!(p.app.tab().unwrap().adres, "B2:C3");
    p.bericht(Msg::Opmaak(office_core::opmaak::Opmaak::Vet(true)));
    p.bericht(Msg::Structuur(
        office_core::rekenblad::Structuur::RijInvoegen,
    ));
    assert!(p.app.melding.contains("Alleen lezen"));
    assert_eq!(*p.bron(), *bron);
    assert!(!p.app.tab().unwrap().antwoord.as_ref().unwrap().terug);
    assert!(
        p.toegankelijkheid()
            .nodes
            .iter()
            .any(|n| n.node.name.contains("Alleen lezen"))
    );
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("spreadsheet-beveiligd.png"))
            .unwrap();
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("spreadsheet-beveiligd-rondgang.xlsx"),
            p.bron().as_slice(),
        )
        .unwrap();
    }
}
#[test]
fn bladbeveiliging_kern_weigert_ook_bij_een_onjuist_bewerkbaar_frontendveld() {
    use iced::keyboard::key::Named;
    let bytes = include_bytes!("../../../office-core/tests/fixtures/spreadsheet-beveiligd.xlsx");
    let mut p = Proef::met_app(app_met_werkdraad(Module::Spreadsheet, bytes));
    let bron = p.bron();
    let beeld = &mut p.app.tab_mut().unwrap().antwoord.as_mut().unwrap().beeld;
    beeld.bewerkingsbeperking = None;
    for v in &mut beeld.velden {
        v.bewerkbaar = true;
    }
    p.cel("B2", false);
    p.named(Named::F2);
    p.selecteer_alles();
    p.plak("7");
    p.named(Named::Enter);
    assert!(p.app.melding.contains("Alleen lezen"));
    assert_eq!(*p.bron(), *bron);
    assert!(
        p.app.tab().unwrap().concept,
        "Een geweigerd concept mag niet verdwijnen"
    );
    assert_eq!(p.app.tab().unwrap().editor.text(), "7");
    p.named(Named::Escape);
    assert_eq!(p.app.tab().unwrap().editor.text(), "3");
    assert!(!p.app.tab().unwrap().concept);
    assert_eq!(*p.bron(), *bron);
    assert!(!p.app.tab().unwrap().antwoord.as_ref().unwrap().terug);
}

#[test]
fn spreadsheet_opgeslagen_symbool_staat_in_het_raster_en_undo_herstelt_de_bron() {
    use iced::keyboard::key::Named;
    let mut p = Proef::nieuw();
    let bron = p.bron();
    p.cel("G10", false);
    p.named(Named::F2);
    p.selecteer_alles();
    p.plak("café 🏠");
    p.named(Named::Enter);
    let echt = p
        .app
        .tab()
        .unwrap()
        .antwoord
        .as_ref()
        .unwrap()
        .beeld
        .afbeelding
        .clone()
        .unwrap();
    let heropend = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone()).unwrap();
    assert_eq!(
        heropend
            .weergave(0)
            .unwrap()
            .velden
            .iter()
            .find(|v| v.id == "G10")
            .unwrap()
            .tekst,
        "café 🏠"
    );
    assert_eq!(
        heropend.weergave(0).unwrap().afbeelding.as_ref().unwrap(),
        &echt
    );
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("spreadsheet-symbool-raster.png"))
            .unwrap();
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("spreadsheet-symbool.xlsx"),
            p.bron().as_slice(),
        )
        .unwrap();
    }
    p.named(Named::F2);
    p.selecteer_alles();
    p.plak("café \u{f0000}");
    p.named(Named::Enter);
    assert_ne!(
        p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .beeld
            .afbeelding
            .as_ref()
            .unwrap(),
        &echt
    );
    p.bericht(Msg::Terug);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

impl Proef {
    fn nieuw() -> Self {
        lettertypen();
        Self::met_app(app_met_werkdraad(
            Module::Spreadsheet,
            include_bytes!("../../../office-core/tests/fixtures/spreadsheet.xlsx"),
        ))
    }
    fn met_app(app: App) -> Self {
        lettertypen();
        Self {
            app,
            boom: Tree::empty(),
            renderer: iced_tiny_skia::Renderer::new(
                ui_instellingen().default_font,
                ui_instellingen().default_text_size,
            ),
            klembord: Testklembord::default(),
            muis: iced::Point::new(-1., -1.),
            focusoperaties: 0,
            klok: std::time::Instant::now(),
        }
    }
    fn bericht(&mut self, msg: Msg) {
        let taak = self.app.update(msg);
        self.taak(taak);
    }
    fn taak(&mut self, taak: Task<Msg>) {
        let mut taken = std::collections::VecDeque::from([taak]);
        let mut aantal = 0;
        while let Some(taak) = taken.pop_front() {
            aantal += 1;
            assert!(aantal < 128, "Onbegrensde GUI-vervolgtaken");
            let Some(mut stroom) = iced_runtime::task::into_stream(taak) else {
                continue;
            };
            while let Some(actie) = iced::futures::executor::block_on(stroom.next()) {
                match actie {
                    iced_runtime::Action::Output(msg) => taken.push_back(self.app.update(msg)),
                    iced_runtime::Action::Widget(mut operatie) => loop {
                        self.focusoperaties += 1;
                        let mut element = self.app.view();
                        self.boom.diff(element.as_widget());
                        let node = element.as_widget_mut().layout(
                            &mut self.boom,
                            &self.renderer,
                            &layout::Limits::new(Size::ZERO, Size::new(1440., 900.)),
                        );
                        element.as_widget_mut().operate(
                            &mut self.boom,
                            Layout::new(&node),
                            &self.renderer,
                            operatie.as_mut(),
                        );
                        match operatie.finish() {
                            Outcome::Chain(volgende) => operatie = volgende,
                            _ => break,
                        }
                    },
                    iced_runtime::Action::Clipboard(iced_runtime::clipboard::Action::Read {
                        target,
                        channel,
                    }) => {
                        channel
                            .send(iced::advanced::Clipboard::read(&self.klembord, target))
                            .unwrap();
                    }
                    iced_runtime::Action::Clipboard(iced_runtime::clipboard::Action::Write {
                        target,
                        contents,
                    }) => iced::advanced::Clipboard::write(&mut self.klembord, target, contents),
                    ander => panic!("Onverwachte systeemopdracht in rasterproef: {ander:?}"),
                }
            }
        }
    }
    fn gebeurtenis(&mut self, event: iced::Event) {
        self.gebeurtenissen([event]);
    }
    fn gebeurtenissen(&mut self, events: impl IntoIterator<Item = iced::Event>) {
        let zoek_escape = self.app.zoeken.is_some()
            && !self.app.postvak_zichtbaar
            && !self.app.bestand
            && !self.app.instellingen
            && self.app.exportblad.is_none()
            && self.app.sluiten.is_none();
        let berichten = {
            let mut element = self.app.view();
            self.boom.diff(element.as_widget());
            let node = element.as_widget_mut().layout(
                &mut self.boom,
                &self.renderer,
                &layout::Limits::new(Size::ZERO, Size::new(1440., 900.)),
            );
            let mut berichten = vec![];
            for event in events {
                let mut shell = iced::advanced::Shell::new(&mut berichten);
                element.as_widget_mut().update(
                    &mut self.boom,
                    &event,
                    Layout::new(&node),
                    iced::mouse::Cursor::Available(self.muis),
                    &self.renderer,
                    &mut self.klembord,
                    &mut shell,
                    &iced::Rectangle::with_size(Size::new(1440., 900.)),
                );
                // Ook de toepassingsabonnementen verwerken de echte
                // afhandelstatus van de widgetboom, zoals in het venster.
                let gevangen = shell.is_event_captured();
                if zoek_escape
                    && let Some(m) = zoeken_ui::afgevangen_escape(
                        event.clone(),
                        if gevangen {
                            iced::event::Status::Captured
                        } else {
                            iced::event::Status::Ignored
                        },
                        iced::window::Id::unique(),
                    )
                {
                    berichten.push(m);
                }
                if !gevangen
                    && let iced::Event::Keyboard(iced::keyboard::Event::KeyPressed {
                        key,
                        modifiers,
                        ..
                    }) = event
                {
                    if key == iced::keyboard::Key::Named(iced::keyboard::key::Named::Tab)
                        && !modifiers.command()
                        && !modifiers.alt()
                    {
                        berichten.push(Msg::Navigeer(if modifiers.shift() {
                            openaec_ui::keyboard::Navigation::Previous
                        } else {
                            openaec_ui::keyboard::Navigation::Next
                        }));
                    }
                    berichten.push(Msg::Toets(openaec_ui::keyboard::KeyPress {
                        key,
                        modifiers,
                    }));
                }
            }
            berichten
        };
        for bericht in berichten {
            self.bericht(bericht);
        }
    }
    fn cel(&mut self, adres: &str, dubbel: bool) {
        let groep = self
            .toegankelijkheid()
            .nodes
            .into_iter()
            .find(|n| n.node.name == "Werkbladraster")
            .unwrap()
            .bounds;
        let b = &self.app.tab().unwrap().antwoord.as_ref().unwrap().beeld;
        let r = &b
            .pagina
            .vlakken
            .iter()
            .find(|r| r.id == adres)
            .unwrap()
            .grens;
        self.muis = iced::Point::new(
            groep.x + (r.x + r.breedte / 2.) * groep.width / b.pagina.breedte,
            groep.y + (r.y + r.hoogte / 2.) * groep.height / b.pagina.hoogte,
        );
        self.gebeurtenis(iced::Event::Mouse(iced::mouse::Event::CursorMoved {
            position: self.muis,
        }));
        let mut events = vec![];
        // Een dubbelklik is één korte invoerreeks. Werkdraad-/focuslayout
        // tussen beide klikken zou onder bouwbelasting de echte 300 ms-grens
        // kunstmatig overschrijden; die productgrens wordt niet versoepeld.
        for _ in 0..if dubbel { 2 } else { 1 } {
            events.push(iced::Event::Mouse(iced::mouse::Event::ButtonPressed(
                iced::mouse::Button::Left,
            )));
            events.push(iced::Event::Mouse(iced::mouse::Event::ButtonReleased(
                iced::mouse::Button::Left,
            )));
        }
        self.gebeurtenissen(events);
        assert_eq!(self.app.tab().unwrap().veld().unwrap().id, adres);
    }
    fn toets(
        &mut self,
        key: iced::keyboard::Key,
        modifiers: iced::keyboard::Modifiers,
        tekst: Option<&str>,
    ) {
        use iced::keyboard as k;
        self.gebeurtenis(iced::Event::Keyboard(k::Event::ModifiersChanged(modifiers)));
        self.gebeurtenis(iced::Event::Keyboard(k::Event::KeyPressed {
            modified_key: key.clone(),
            key,
            physical_key: k::key::Physical::Unidentified(k::key::NativeCode::Unidentified),
            location: k::Location::Standard,
            modifiers,
            text: tekst.map(Into::into),
            repeat: false,
        }));
    }
    fn named(&mut self, key: iced::keyboard::key::Named) {
        self.toets(
            iced::keyboard::Key::Named(key),
            iced::keyboard::Modifiers::empty(),
            None,
        );
    }
    fn selecteer_alles(&mut self) {
        self.toets(
            iced::keyboard::Key::Character("a".into()),
            iced::keyboard::Modifiers::COMMAND,
            None,
        );
    }
    fn plak(&mut self, tekst: &str) {
        self.klembord.tekst = Some(tekst.into());
        self.toets(
            iced::keyboard::Key::Character("v".into()),
            iced::keyboard::Modifiers::COMMAND,
            None,
        );
    }
    fn bron(&self) -> std::sync::Arc<Vec<u8>> {
        self.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .clone()
    }
    fn toegankelijkheid(&mut self) -> Collect {
        let mut element = self.app.view();
        self.boom.diff(element.as_widget());
        let node = element.as_widget_mut().layout(
            &mut self.boom,
            &self.renderer,
            &layout::Limits::new(Size::ZERO, Size::new(1440., 900.)),
        );
        let mut gevonden = Collect::default();
        element.as_widget_mut().operate(
            &mut self.boom,
            Layout::new(&node),
            &self.renderer,
            &mut gevonden,
        );
        gevonden
    }
    fn verbeeld(&mut self) -> tiny_skia::Pixmap {
        use iced::advanced::renderer::Renderer as _;
        let maat = Size::new(1440., 900.);
        let viewport = iced::Rectangle::with_size(maat);
        self.renderer.reset(viewport);
        let mut element = self.app.view();
        self.boom.diff(element.as_widget());
        let node = element.as_widget_mut().layout(
            &mut self.boom,
            &self.renderer,
            &layout::Limits::new(Size::ZERO, maat),
        );
        let mut berichten = vec![];
        let mut shell = iced::advanced::Shell::new(&mut berichten);
        element.as_widget_mut().update(
            &mut self.boom,
            // De testklok begint vóór het verkrijgen van focus. Daardoor is
            // de cursor steeds in haar eerste knipperfase, ook als layout op
            // een ander platform langer duurt. De echte widget tekent zelf;
            // het beeld wordt niet nabewerkt of met tolerantie vergeleken.
            &iced::Event::Window(iced::window::Event::RedrawRequested(self.klok)),
            Layout::new(&node),
            iced::mouse::Cursor::Unavailable,
            &self.renderer,
            &mut self.klembord,
            &mut shell,
            &viewport,
        );
        let thema = self.app.thema.iced();
        element.as_widget().draw(
            &self.boom,
            &mut self.renderer,
            &thema,
            &iced::advanced::renderer::Style {
                text_color: thema.palette().text,
            },
            Layout::new(&node),
            iced::mouse::Cursor::Unavailable,
            &viewport,
        );
        let mut bytes = vec![0; 1440 * 900 * 4];
        let mut pixels = tiny_skia::PixmapMut::from_bytes(&mut bytes, 1440, 900).unwrap();
        let mut masker = tiny_skia::Mask::new(1440, 900).unwrap();
        self.renderer.draw(
            &mut pixels,
            &mut masker,
            &iced_tiny_skia::graphics::Viewport::with_physical_size(Size::new(1440, 900), 1.),
            &[viewport],
            iced::Color::WHITE,
        );
        drop(element);
        for bericht in berichten {
            self.bericht(bericht);
        }
        for pixel in bytes.as_chunks_mut::<4>().0 {
            pixel.swap(0, 2);
        }
        tiny_skia::Pixmap::from_vec(bytes, tiny_skia::IntSize::from_wh(1440, 900).unwrap()).unwrap()
    }
    fn klik(&mut self, punt: iced::Point) {
        self.muis = punt;
        self.gebeurtenis(iced::Event::Mouse(iced::mouse::Event::ButtonPressed(
            iced::mouse::Button::Left,
        )));
        self.gebeurtenis(iced::Event::Mouse(iced::mouse::Event::ButtonReleased(
            iced::mouse::Button::Left,
        )));
    }
}
#[test]
fn raster_f2_bewerkt_de_echte_cel_bevestigt_herberekening_en_undo() {
    use iced::keyboard::key::Named;
    let mut p = Proef::nieuw();
    let origineel = p.bron();
    p.cel("B2", false);
    p.named(Named::F2);
    assert!(p.app.tab().unwrap().raster.bewerken);
    p.selecteer_alles();
    p.plak("7");
    assert_eq!(p.app.tab().unwrap().editor.text(), "7");
    assert!(p.app.tab().unwrap().concept);
    assert!(
        p.bron().as_slice() == origineel.as_slice(),
        "De bron wijkt af van het oorspronkelijke bestand"
    );
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        render(&p.app)
            .save_png(PathBuf::from(map).join("spreadsheet-celbewerking.png"))
            .unwrap();
    }
    p.named(Named::Enter);
    assert!(!p.app.tab().unwrap().raster.bewerken);
    assert!(!p.app.tab().unwrap().concept);
    assert_eq!(p.app.tab().unwrap().adres, "B3");
    assert_eq!(
        p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .beeld
            .velden
            .iter()
            .find(|v| v.id == "B2")
            .unwrap()
            .tekst,
        "7"
    );
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("spreadsheet-inline.xlsx"),
            p.bron().as_slice(),
        )
        .unwrap();
    }
    p.bericht(Msg::Terug);
    assert!(
        p.bron().as_slice() == origineel.as_slice(),
        "De bron wijkt af van het oorspronkelijke bestand"
    );
    p.cel("B2", false);
    assert_eq!(p.app.tab().unwrap().veld().unwrap().tekst, "3");
    assert!(
        !p.app.tab().unwrap().raster.bewerken,
        "Een enkele klik na toetsenbordbewerking mag geen dubbelklik worden"
    );
}
#[test]
fn raster_toetsen_navigeren_voorbij_het_venster_en_tab_bevestigt() {
    use iced::keyboard::{Key, Modifiers, key::Named};
    let mut p = Proef::nieuw();
    let origineel = p.bron();
    p.cel("B2", false);
    for (toets, adres) in [
        (Named::ArrowRight, "C2"),
        (Named::ArrowDown, "C3"),
        (Named::ArrowLeft, "B3"),
        (Named::ArrowUp, "B2"),
    ] {
        p.named(toets);
        assert_eq!(p.app.tab().unwrap().adres, adres);
    }
    p.bericht(Msg::Adres("X60".into()));
    p.bericht(Msg::GaNaar);
    p.named(Named::ArrowRight);
    assert_eq!(p.app.tab().unwrap().adres, "Y60");
    p.named(Named::ArrowDown);
    assert_eq!(p.app.tab().unwrap().adres, "Y61");
    assert!(
        p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .beeld
            .pagina
            .vlakken
            .iter()
            .any(|v| v.id == "Y61")
    );
    assert!(p.bron().as_slice() == origineel.as_slice());
    assert!(!p.app.tab().unwrap().antwoord.as_ref().unwrap().terug);
    p.named(Named::F2);
    p.plak("Eigen celtekst");
    p.named(Named::Tab);
    assert_eq!(p.app.tab().unwrap().adres, "Z61");
    p.toets(Key::Named(Named::Tab), Modifiers::SHIFT, None);
    assert_eq!(p.app.tab().unwrap().adres, "Y61");
    assert_eq!(p.app.tab().unwrap().veld().unwrap().tekst, "Eigen celtekst");
    p.named(Named::F2);
    p.toets(Key::Named(Named::Enter), Modifiers::SHIFT, None);
    assert_eq!(p.app.tab().unwrap().adres, "Y60");
    p.bericht(Msg::Terug);
    assert!(p.bron().as_slice() == origineel.as_slice());
}
#[test]
fn raster_koppen_blijven_staan_en_cellen_klikken_correct_na_scroll_en_zoom() {
    use iced::keyboard::key::Named;
    let mut p = Proef::nieuw();
    let bron = p.bron();
    p.cel("B2", false);
    let handle = p.app.tab().unwrap().afbeelding.as_ref().unwrap().id();
    p.named(Named::ArrowRight);
    assert_eq!(
        p.app.tab().unwrap().afbeelding.as_ref().unwrap().id(),
        handle,
        "Navigatie mag hetzelfde beeld niet opnieuw laten decoderen"
    );
    p.bericht(Msg::Zoom(1.5));
    let collect = p.toegankelijkheid();
    assert!(collect.unnamed.is_empty());
    let kop = collect
        .nodes
        .iter()
        .find(|n| n.node.name == "Kolom A")
        .unwrap()
        .bounds;
    assert_eq!(kop.height, raster_koppen::BOVEN);
    let rij = collect
        .nodes
        .iter()
        .find(|n| n.node.name == "Rij 1")
        .unwrap()
        .bounds;
    assert_eq!(rij.width, raster_koppen::LINKS);
    let voor = p.verbeeld();
    let hoek = iced::Point::new(10., kop.y + 10.);
    let pixel = voor.pixel(hoek.x as u32, hoek.y as u32).unwrap();
    assert_eq!((pixel.red(), pixel.green(), pixel.blue()), (237, 240, 243));
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        voor.save_png(PathBuf::from(map).join("spreadsheet-koppen-zoom.png"))
            .unwrap();
    }
    p.taak(iced::widget::operation::scroll_to(
        "document-scroll",
        iced::widget::operation::AbsoluteOffset {
            x: Some(150.),
            y: Some(240.),
        },
    ));
    let na = p.verbeeld();
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        na.save_png(PathBuf::from(map).join("spreadsheet-koppen-scroll.png"))
            .unwrap();
    }
    assert_eq!(
        voor.pixel(hoek.x as u32, hoek.y as u32),
        na.pixel(hoek.x as u32, hoek.y as u32)
    );
    let adres = p.app.tab().unwrap().adres.clone();
    p.klik(iced::Point::new(200., kop.center_y()));
    assert_eq!(
        p.app.tab().unwrap().adres,
        adres,
        "Een vaste kop mag geen onderliggende cel aanklikken"
    );
    let b = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| n.node.name == "Werkbladraster")
        .unwrap()
        .bounds;
    let punt = iced::Point::new(180., kop.y + 150.);
    let scroll = p.app.tab().unwrap().scroll;
    assert_eq!(scroll, iced::Point::new(150., 240.));
    // Iced levert operatiegrenzen in inhoudscoördinaten. De werkelijke
    // viewportoffset komt uit het gewone on_scroll-antwoord van de widget.
    let verwacht = p
        .app
        .tab()
        .unwrap()
        .antwoord
        .as_ref()
        .unwrap()
        .beeld
        .pagina
        .raak(
            (punt.x - b.x + scroll.x) / 1.5,
            (punt.y - b.y + scroll.y) / 1.5,
        )
        .unwrap()
        .to_string();
    assert_eq!(verwacht, "D13");
    p.klik(punt);
    assert_eq!(p.app.tab().unwrap().adres, verwacht);
    assert!(p.bron().as_slice() == bron.as_slice());
    let beeld = p.verbeeld();
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        beeld
            .save_png(PathBuf::from(map).join("spreadsheet-koppen-scroll.png"))
            .unwrap();
    }
}
#[test]
fn raster_werkdraad_steelt_geen_focus_van_een_later_geopend_venster() {
    for soort in 0..3 {
        let mut p = Proef::nieuw();
        p.cel("B2", false);
        let origineel = p.bron();
        let taak = p.app.update(Msg::Raster(raster_ui::Bericht::Verplaats(
            office_core::rekenblad::Richting::Rechts,
        )));
        // Het antwoord is nog niet door de interface verwerkt.
        match soort {
            0 => p.app.instellingen = true,
            1 => p.app.bestand = true,
            _ => p.app.sluiten = p.app.tab().map(|t| t.id),
        }
        let aantal = p.focusoperaties;
        p.taak(taak);
        assert_eq!(
            p.focusoperaties, aantal,
            "Een laat rasterantwoord verlegde de modale focus"
        );
        assert!(p.bron().as_slice() == origineel.as_slice());
    }
}
#[test]
fn raster_dubbelklik_schaalt_ime_annuleren_en_late_lege_plakreactie() {
    use iced::keyboard::key::Named;
    let mut p = Proef::nieuw();
    let origineel = p.bron();
    p.bericht(Msg::Zoom(1.5));
    p.cel("B2", true);
    assert!(p.app.tab().unwrap().raster.bewerken);
    p.selecteer_alles();
    p.gebeurtenis(iced::Event::InputMethod(
        iced::advanced::input_method::Event::Commit("café 🏠".into()),
    ));
    assert_eq!(p.app.tab().unwrap().editor.text(), "café 🏠");
    p.named(Named::Escape);
    assert!(!p.app.tab().unwrap().raster.bewerken);
    assert!(!p.app.tab().unwrap().concept);
    assert!(
        p.bron().as_slice() == origineel.as_slice(),
        "De bron wijkt af van het oorspronkelijke bestand"
    );
    p.cel("D5", true);
    assert!(p.app.tab().unwrap().raster.bewerken);
    assert!(p.app.tab().unwrap().editor.text().is_empty());
    let (_, mut berichten) = klembordtaak(
        p.app.update(Msg::Klembord(klembord::Actie::Plak)),
        Some("Te late eigen tekst"),
    );
    assert_eq!(berichten.len(), 1);
    p.named(Named::Escape);
    p.bericht(berichten.pop().unwrap());
    assert!(!p.app.tab().unwrap().concept);
    assert!(!p.app.tab().unwrap().raster.bewerken);
    assert!(p.app.tab().unwrap().editor.text().is_empty());
    assert!(
        p.bron().as_slice() == origineel.as_slice(),
        "De bron wijkt af van het oorspronkelijke bestand"
    );
}
#[test]
fn raster_foute_formule_blijft_concept_en_muiswissel_past_een_geldige_cel_toe() {
    use iced::keyboard::key::Named;
    let mut p = Proef::nieuw();
    let origineel = p.bron();
    p.cel("B2", false);
    p.toets(
        iced::keyboard::Key::Character("=".into()),
        iced::keyboard::Modifiers::empty(),
        Some("="),
    );
    assert!(p.app.tab().unwrap().raster.bewerken);
    p.toets(
        iced::keyboard::Key::Character("1".into()),
        iced::keyboard::Modifiers::empty(),
        Some("1"),
    );
    p.toets(
        iced::keyboard::Key::Character("+".into()),
        iced::keyboard::Modifiers::empty(),
        Some("+"),
    );
    p.named(Named::Enter);
    assert!(
        p.bron().as_slice() == origineel.as_slice(),
        "De bron wijkt af van het oorspronkelijke bestand"
    );
    assert!(p.app.tab().unwrap().raster.bewerken);
    assert!(p.app.tab().unwrap().concept);
    assert_eq!(p.app.tab().unwrap().editor.text(), "=1+");
    p.named(Named::Escape);
    p.named(Named::F2);
    p.selecteer_alles();
    p.plak("5");
    p.cel("C2", false);
    assert!(!p.app.tab().unwrap().raster.bewerken);
    assert!(!p.app.tab().unwrap().concept);
    assert_eq!(p.app.tab().unwrap().adres, "C2");
    assert_eq!(
        p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .beeld
            .velden
            .iter()
            .find(|v| v.id == "B2")
            .unwrap()
            .tekst,
        "5"
    );
    p.bericht(Msg::Terug);
    assert!(
        p.bron().as_slice() == origineel.as_slice(),
        "De bron wijkt af van het oorspronkelijke bestand"
    );
    let b = &mut p.app.tab_mut().unwrap().antwoord.as_mut().unwrap().beeld;
    b.velden
        .iter_mut()
        .find(|v| v.id == "B2")
        .unwrap()
        .bewerkbaar = false;
    p.cel("B2", true);
    p.named(Named::F2);
    assert!(!p.app.tab().unwrap().raster.bewerken);
    assert!(
        p.bron().as_slice() == origineel.as_slice(),
        "De bron wijkt af van het oorspronkelijke bestand"
    );
    assert!(!p.app.tab().unwrap().concept);
}

#[test]
fn snelle_selectie_gevolgd_door_kopieren_en_knippen_bewaart_de_juiste_tekst() {
    use iced::keyboard as k;
    let mut uitkomsten = Vec::new();
    for raster in [false, true] {
        for toets in ["c", "x"] {
            let mut p = if raster {
                let mut p = Proef::nieuw();
                p.cel("B2", true);
                p
            } else {
                Proef::met_app(app_met_werkdraad(
                    Module::Writer,
                    include_bytes!("../../../office-core/tests/fixtures/writer-structuur.docx"),
                ))
            };
            let oorspronkelijk = p.app.tab().unwrap().editor.text();
            let bron = p.app.tab().unwrap().antwoord.as_ref().unwrap().bron.clone();
            if !raster {
                let b = p
                    .toegankelijkheid()
                    .nodes
                    .into_iter()
                    .find(|n| n.node.name == "Tekst van geselecteerd veld")
                    .unwrap()
                    .bounds;
                p.muis = iced::Point::new(b.x + 20., b.y + 20.);
                p.gebeurtenis(iced::Event::Mouse(iced::mouse::Event::ButtonPressed(
                    iced::mouse::Button::Left,
                )));
                p.gebeurtenis(iced::Event::Mouse(iced::mouse::Event::ButtonReleased(
                    iced::mouse::Button::Left,
                )));
            }
            let key = |s: &str| {
                iced::Event::Keyboard(k::Event::KeyPressed {
                    key: k::Key::Character(s.into()),
                    modified_key: k::Key::Character(s.into()),
                    physical_key: k::key::Physical::Unidentified(k::key::NativeCode::Unidentified),
                    location: k::Location::Standard,
                    modifiers: k::Modifiers::COMMAND,
                    text: None,
                    repeat: false,
                })
            };
            // Beide toetsen kunnen vóór de volgende GUI-update worden ontvangen.
            // Selecteren publiceert een actie; kopiëren mag de oude selectie niet lezen.
            p.gebeurtenissen([key("a"), key(toets)]);
            assert_eq!(
                p.app
                    .tab()
                    .unwrap()
                    .antwoord
                    .as_ref()
                    .unwrap()
                    .bron
                    .as_slice(),
                bron.as_slice()
            );
            uitkomsten.push((
                toets.to_owned(),
                p.klembord.tekst,
                p.app.tab().unwrap().editor.text(),
                oorspronkelijk,
            ));
        }
    }
    for (toets, klembord, editor, bron) in uitkomsten {
        assert_eq!(
            klembord.as_deref(),
            Some(bron.as_str()),
            "Ctrl+A gevolgd door Ctrl+{toets} verliest de geselecteerde tekst"
        );
        assert_eq!(editor, if toets == "x" { "" } else { bron.as_str() });
    }
}

#[test]
fn beschermde_widget_knipt_niet_en_mag_de_selectie_wel_kopieren() {
    use iced::keyboard as k;
    let mut p = Proef::met_app(app_met_werkdraad(
        Module::Writer,
        include_bytes!("../../../office-core/tests/fixtures/writer-beveiligd.docx"),
    ));
    let voor = p.app.tab().unwrap().editor.text();
    assert!(!voor.is_empty());
    let bron = p.app.tab().unwrap().antwoord.as_ref().unwrap().bron.clone();
    let b = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| n.node.name == "Tekst van geselecteerd veld")
        .unwrap()
        .bounds;
    p.muis = iced::Point::new(b.x + 20., b.y + 20.);
    p.gebeurtenis(iced::Event::Mouse(iced::mouse::Event::ButtonPressed(
        iced::mouse::Button::Left,
    )));
    p.gebeurtenis(iced::Event::Mouse(iced::mouse::Event::ButtonReleased(
        iced::mouse::Button::Left,
    )));
    p.klembord.tekst = Some("Eigen vorig klembord".into());
    p.toets(k::Key::Character("a".into()), k::Modifiers::COMMAND, None);
    p.toets(k::Key::Character("x".into()), k::Modifiers::COMMAND, None);
    assert_eq!(p.klembord.tekst.as_deref(), Some("Eigen vorig klembord"));
    assert_eq!(p.app.tab().unwrap().editor.text(), voor);
    assert!(!p.app.tab().unwrap().concept);
    p.toets(k::Key::Character("c".into()), k::Modifiers::COMMAND, None);
    assert_eq!(p.klembord.tekst.as_deref(), Some(voor.as_str()));
    assert_eq!(
        p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .as_slice(),
        bron.as_slice()
    );
}

#[test]
fn echte_writer_en_bestand_deelhertekeningen_zijn_gelijk_aan_verse_hele_beelden() {
    let mut p = Proef::met_app(app_met_werkdraad(
        Module::Writer,
        include_bytes!("../../../office-core/tests/fixtures/writer-structuur.docx"),
    ));
    let volledig = p.verbeeld();
    let oude_lagen = p.renderer.layers().to_vec();
    let mut deel = volledig.clone();
    for px in deel.data_mut().as_chunks_mut::<4>().0 {
        px.swap(0, 2);
    }
    let mut masker = tiny_skia::Mask::new(1440, 900).unwrap();
    let viewport = iced_tiny_skia::graphics::Viewport::with_physical_size(Size::new(1440, 900), 1.);
    // Ongewijzigde inhoud: ook na meerdere kleine werkvlak-/editorupdates
    // moet ieder bestaand pixel behouden blijven.
    for _ in 0..3 {
        for gebied in [
            iced::Rectangle::new(iced::Point::new(1190., 290.), Size::new(8., 18.)),
            iced::Rectangle::new(iced::Point::new(450., 350.), Size::new(20., 20.)),
        ] {
            p.renderer.draw(
                &mut deel.as_mut(),
                &mut masker,
                &viewport,
                &[gebied],
                iced::Color::WHITE,
            );
        }
    }
    let mut writer_deel = deel.clone();
    for px in writer_deel.data_mut().as_chunks_mut::<4>().0 {
        px.swap(0, 2);
    }
    let tel = |a: &tiny_skia::Pixmap, b: &tiny_skia::Pixmap| {
        a.data()
            .as_chunks::<4>()
            .0
            .iter()
            .zip(b.data().as_chunks::<4>().0.iter())
            .filter(|(a, b)| a != b)
            .count()
    };
    let writer_verschil = tel(&volledig, &writer_deel);
    p.bericht(Msg::Bestand(true));
    let bestand_vol = p.verbeeld();
    let nieuwe_lagen = p.renderer.layers().to_vec();
    // Dezelfde damage-berekening als de echte compositor, zonder normalisatie.
    let schade = iced_tiny_skia::graphics::damage::diff(
        &oude_lagen,
        &nieuwe_lagen,
        |l| vec![l.bounds],
        iced_tiny_skia::Layer::damage,
    );
    let schade = iced_tiny_skia::graphics::damage::group(
        schade,
        iced::Rectangle::with_size(Size::new(1440., 900.)),
    );
    p.renderer.draw(
        &mut deel.as_mut(),
        &mut masker,
        &viewport,
        &schade,
        iced::Color::WHITE,
    );
    for px in deel.data_mut().as_chunks_mut::<4>().0 {
        px.swap(0, 2);
    }
    let bestand_verschil = tel(&bestand_vol, &deel);
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let map = PathBuf::from(map);
        std::fs::create_dir_all(&map).unwrap();
        for (naam, png) in [
            ("writer-vol", &volledig),
            ("writer-deel", &writer_deel),
            ("bestand-vol", &bestand_vol),
            ("bestand-deel", &deel),
        ] {
            png.save_png(map.join(format!("hertekenen-{naam}.png")))
                .unwrap();
        }
    }
    assert_eq!(
        (writer_verschil, bestand_verschil),
        (0, 0),
        "Gedeeltelijke native hertekening laat andere pixels achter"
    );
}

#[test]
fn writer_zoeken_vervangen_via_lint_werkdraad_unicode_en_undo() {
    use crate::zoeken_ui::Bericht as Z;
    let bron = include_bytes!("../../../office-core/tests/fixtures/writer-structuur.docx");
    let mut p = Proef::met_app(app_met_werkdraad(Module::Writer, bron));
    let c = p.toegankelijkheid();
    let zoek = c
        .nodes
        .iter()
        .find(|n| n.node.name == "Zoeken" && n.node.role == openaec_ui::design::a11y::Role::Button)
        .expect("Zoekopdracht in het echte lint");
    p.klik(iced::Point::new(
        zoek.bounds.center_x(),
        zoek.bounds.center_y(),
    ));
    assert!(p.app.zoeken.is_some());
    assert!(p.focusoperaties > 0);
    p.bericht(Msg::Zoeken(Z::Open(true)));
    p.bericht(Msg::Zoeken(Z::Tekst("café".into())));
    assert_eq!(
        p.app.tab().unwrap().editor.selection().as_deref(),
        Some("café")
    );
    let c = p.toegankelijkheid();
    assert!(
        c.unnamed.is_empty(),
        "Zoekbediening mist namen: {:?}",
        c.unnamed
    );
    if let Some(pad) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        let pad = PathBuf::from(pad);
        std::fs::create_dir_all(&pad).unwrap();
        p.verbeeld()
            .save_png(pad.join("writer-zoeken.png"))
            .unwrap();
    }
    p.bericht(Msg::Zoeken(Z::Vervangtekst("gebouw 🏠".into())));
    p.bericht(Msg::Zoeken(Z::Vervang(false)));
    assert_eq!(
        p.app.tab().unwrap().antwoord.as_ref().unwrap().beeld.velden[1].tekst,
        "Links 🏠 gebouw 🏠 rechts"
    );
    let nieuw = p.bron();
    if let Some(pad) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let pad = PathBuf::from(pad);
        std::fs::create_dir_all(&pad).unwrap();
        std::fs::write(pad.join("writer-zoeken-ui.docx"), nieuw.as_slice()).unwrap();
    }
    p.bericht(Msg::Terug);
    assert_eq!(p.bron().as_slice(), bron.as_slice());
    p.bericht(Msg::Vooruit);
    assert_eq!(p.bron(), nieuw);
    p.bericht(Msg::Terug);
    p.bericht(Msg::Zoeken(Z::Tekst("cel".into())));
    p.bericht(Msg::Zoeken(Z::Vervangtekst("vlak".into())));
    p.bericht(Msg::Zoeken(Z::Vervang(true)));
    let velden = &p.app.tab().unwrap().antwoord.as_ref().unwrap().beeld.velden;
    for tekst in ["vlak één", "Tweede vlakalinea", "vlak twee"] {
        assert!(
            velden.iter().any(|v| v.tekst == tekst),
            "Ontbrekende tabelvervanging {tekst}"
        );
    }
    p.bericht(Msg::Terug);
    assert_eq!(p.bron().as_slice(), bron.as_slice());
    p.bericht(Msg::Zoeken(Z::Sluit));
    assert!(p.app.zoeken.is_none());
}

#[test]
fn vervangen_gaat_voorbij_nieuw_ingevoegde_zoektekst_naar_de_volgende_treffer() {
    use crate::zoeken_ui::Bericht as Z;
    let mut p = Proef::met_app(app_met_werkdraad(
        Module::Writer,
        include_bytes!("../../../office-core/tests/fixtures/writer-structuur.docx"),
    ));
    p.bericht(Msg::Zoeken(Z::Open(true)));
    p.bericht(Msg::Zoeken(Z::Tekst("e".into())));
    p.bericht(Msg::Zoeken(Z::Vervangtekst("ee".into())));
    p.bericht(Msg::Zoeken(Z::Vervang(false)));
    let t = p.app.tab().unwrap();
    assert_eq!(t.editor.text(), "Voor dee rijke alinea");
    assert_eq!(t.editor.selection().as_deref(), Some("e"));
    assert_eq!(
        lint::tekenoffset(&t.editor, t.editor.cursor().selection.unwrap()),
        13
    );
}

#[test]
fn enter_in_het_zoekveld_navigeert_en_een_resultaat_zet_echte_editorfocus() {
    use crate::zoeken_ui::Bericht as Z;
    let mut p = Proef::met_app(app_met_werkdraad(
        Module::Writer,
        include_bytes!("../../../office-core/tests/fixtures/writer-structuur.docx"),
    ));
    let bron = p.bron();
    p.bericht(Msg::Zoeken(Z::Open(false)));
    p.bericht(Msg::Zoeken(Z::Tekst("e".into())));
    let t = p.app.tab().unwrap();
    assert_eq!(
        lint::tekenoffset(&t.editor, t.editor.cursor().selection.unwrap()),
        6
    );
    p.named(iced::keyboard::key::Named::Enter);
    let t = p.app.tab().unwrap();
    assert_eq!(
        lint::tekenoffset(&t.editor, t.editor.cursor().selection.unwrap()),
        12
    );
    let voor = p.focusoperaties;
    p.bericht(Msg::Zoeken(Z::Kies(0)));
    assert!(p.focusoperaties > voor);
    p.plak("E");
    assert!(p.app.tab().unwrap().concept);
    assert_eq!(p.app.tab().unwrap().editor.text(), "Voor dE rijke alinea");
    assert_eq!(p.bron(), bron);
}

#[test]
fn zoeknavigatie_verplaatst_naar_de_echte_pagina_en_undo_blijft_op_dat_deel() {
    use crate::zoeken_ui::Bericht as Z;
    let bron = include_bytes!("../../../office-core/tests/fixtures/writer-cachepaginas.docx");
    let mut p = Proef::met_app(app_met_werkdraad(Module::Writer, bron));
    p.bericht(Msg::Zoeken(Z::Open(false)));
    p.bericht(Msg::Zoeken(Z::Tekst("cachepagina 5".into())));
    assert_eq!(p.app.tab().unwrap().deel, 5);
    assert_eq!(
        p.app.tab().unwrap().editor.selection().as_deref(),
        Some("cachepagina 5")
    );
    assert_eq!(p.bron().as_slice(), bron.as_slice());
    assert!(!p.app.tab().unwrap().antwoord.as_ref().unwrap().terug);
    if let Some(pad) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        let pad = PathBuf::from(pad);
        std::fs::create_dir_all(&pad).unwrap();
        p.verbeeld()
            .save_png(pad.join("writer-zoeken-pagina.png"))
            .unwrap();
    }
    p.bericht(Msg::Zoeken(Z::Kies(0)));
    p.plak("ander eigen deel");
    p.bericht(Msg::PasToe);
    assert_eq!(p.app.tab().unwrap().deel, 5);
    let gewijzigd = p.bron();
    assert_ne!(gewijzigd.as_slice(), bron.as_slice());
    p.bericht(Msg::Terug);
    assert_eq!(p.app.tab().unwrap().deel, 5);
    assert_eq!(p.bron().as_slice(), bron.as_slice());
    p.bericht(Msg::Vooruit);
    assert_eq!(p.app.tab().unwrap().deel, 5);
    assert_eq!(p.bron(), gewijzigd);
}

#[test]
fn zoekmarkering_wordt_echt_getekend_schaalt_mee_en_vervalt_bij_nieuwe_invoer() {
    use crate::zoeken_ui::Bericht as Z;
    let bron = include_bytes!("../../../office-core/tests/fixtures/writer-structuur.docx");
    let mut p = Proef::met_app(app_met_werkdraad(Module::Writer, bron));
    p.bericht(Msg::Zoeken(Z::Open(false)));
    p.bericht(Msg::Zoeken(Z::Tekst("café".into())));
    assert!(p.app.tab().unwrap().tekstmarkering().is_some());
    if let Some(pad) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        let pad = PathBuf::from(pad);
        std::fs::create_dir_all(&pad).unwrap();
        p.verbeeld()
            .save_png(pad.join("writer-zoeken-markering.png"))
            .unwrap();
    }
    // Zonder het gefocuste zoekveld kan een knipperende tekstcursor de
    // vergelijking van alleen het echte documentmarkeervlak niet vervuilen.
    p.bericht(Msg::Zoeken(Z::Sluit));
    let mut aantallen = Vec::new();
    for zoom in [1., 0.75, 1.5] {
        p.bericht(Msg::Zoom(zoom));
        let met = p.verbeeld();
        let m = p.app.tab_mut().unwrap().writer_markering.take();
        let zonder = p.verbeeld();
        let mut aantal = 0;
        for (i, (a, b)) in met
            .data()
            .as_chunks::<4>()
            .0
            .iter()
            .zip(zonder.data().as_chunks::<4>().0)
            .enumerate()
        {
            if a != b {
                let (x, y) = (i % 1440, i / 1440);
                assert!(
                    (200..1140).contains(&x) && (220..880).contains(&y),
                    "Markering buiten het document: {x},{y}"
                );
                aantal += 1;
            }
        }
        assert!(
            aantal > 20,
            "Geen echte zichtbare markering op schaal {zoom}"
        );
        aantallen.push(aantal);
        p.app.tab_mut().unwrap().writer_markering = m;
    }
    let verhouding_klein = aantallen[1] as f64 / aantallen[0] as f64;
    let verhouding_groot = aantallen[2] as f64 / aantallen[0] as f64;
    assert!((0.4..0.75).contains(&verhouding_klein), "{aantallen:?}");
    assert!((1.8..2.7).contains(&verhouding_groot), "{aantallen:?}");
    assert_eq!(p.bron().as_slice(), bron.as_slice());
    p.bericht(Msg::Veld(0));
    assert!(p.app.tab().unwrap().tekstmarkering().is_none());
    p.bericht(Msg::Zoeken(Z::Open(false)));
    p.bericht(Msg::Zoeken(Z::Tekst("café".into())));
    assert!(p.app.tab().unwrap().tekstmarkering().is_some());
    p.bericht(Msg::Zoeken(Z::Kies(0)));
    p.plak("eigen nieuwe tekst");
    assert!(p.app.tab().unwrap().concept);
    assert!(p.app.tab().unwrap().tekstmarkering().is_none());
    assert_eq!(p.bron().as_slice(), bron.as_slice());
    if let Some(pad) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let pad = PathBuf::from(pad);
        std::fs::create_dir_all(&pad).unwrap();
        std::fs::write(pad.join("writer-zoekmarkering-zoom.json"),serde_json::to_vec_pretty(&serde_json::json!({"schalen":[1.,0.75,1.5],"afwijkende_pixels_zonder_markering":aantallen})).unwrap()).unwrap();
    }
}
