use super::*;
use iced::advanced::{
    layout::{self, Layout},
    widget::Tree,
};
use office_core::document::Sessie;
use openaec_ui::design::a11y::Collect;

#[test]
fn unicode_selectie_wordt_van_iced_bytes_naar_documenttekens_vertaald() {
    use iced::advanced::text::editor::Position;
    let inhoud = text_editor::Content::with_text("café 🏠\ntweede regel");
    assert_eq!(
        lint::tekenoffset(&inhoud, Position { line: 0, column: 5 }),
        4
    );
    assert_eq!(
        lint::tekenoffset(
            &inhoud,
            Position {
                line: 0,
                column: 10
            }
        ),
        6
    );
    assert_eq!(
        lint::tekenoffset(&inhoud, Position { line: 1, column: 6 }),
        13
    );
}
#[test]
fn blad_klikken_schaalt_correct_en_respecteert_het_scrollvenster() {
    use iced::{Rectangle, mouse};
    use office_core::interactie::{Pagina, Raakvlak, Rechthoek};
    lettertypen();
    let p = Pagina {
        inhoud: None,
        breedte: 200.,
        hoogte: 100.,
        vlakken: vec![Raakvlak {
            id: "rechts".into(),
            grens: Rechthoek {
                x: 100.,
                y: 0.,
                breedte: 100.,
                hoogte: 100.,
            },
        }],
    };
    let mut element = documentblad::blad(
        container(iced::widget::Space::new()).width(100).height(50),
        &p,
        None,
        iced::Color::BLACK,
        Msg::Raak,
    );
    let r = iced_tiny_skia::Renderer::new(
        ui_instellingen().default_font,
        ui_instellingen().default_text_size,
    );
    let mut tree = Tree::new(&element);
    let node = element.as_widget_mut().layout(
        &mut tree,
        &r,
        &layout::Limits::new(Size::ZERO, Size::new(500., 500.)),
    );
    let mut berichten = vec![];
    for breedte in [50., 500.] {
        let mut shell = iced::advanced::Shell::new(&mut berichten);
        element.as_widget_mut().update(
            &mut tree,
            &iced::Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
            Layout::new(&node),
            mouse::Cursor::Available(iced::Point::new(75., 20.)),
            &r,
            &mut iced::advanced::clipboard::Null,
            &mut shell,
            &Rectangle::new(iced::Point::ORIGIN, Size::new(breedte, 500.)),
        );
    }
    assert_eq!(berichten.len(), 1);
    assert!(matches!(&berichten[0],Msg::Raak(id) if id=="rechts"));
}
#[test]
fn canvas_slepen_geeft_een_enkele_definitieve_bewerking() {
    use iced::{Rectangle, mouse};
    use office_core::interactie::Rechthoek;
    let grens = Rechthoek {
        x: 40.,
        y: 32.,
        breedte: 560.,
        hoogte: 160.,
    };
    let mut element = sleepvak::vak(
        container(iced::widget::Space::new())
            .width(560)
            .height(160)
            .into(),
        1,
        0,
        grens,
        1.,
        true,
    );
    let r = iced_tiny_skia::Renderer::new(
        ui_instellingen().default_font,
        ui_instellingen().default_text_size,
    );
    let mut tree = Tree::new(&element);
    let node = element.as_widget_mut().layout(
        &mut tree,
        &r,
        &layout::Limits::new(Size::ZERO, Size::new(1000., 1000.)),
    );
    let mut berichten = vec![];
    for (event, punt) in [
        (
            mouse::Event::ButtonPressed(mouse::Button::Left),
            iced::Point::new(10., 10.),
        ),
        (
            mouse::Event::CursorMoved {
                position: iced::Point::new(250., 310.),
            },
            iced::Point::new(250., 310.),
        ),
        (
            mouse::Event::ButtonReleased(mouse::Button::Left),
            iced::Point::new(250., 310.),
        ),
    ] {
        let mut shell = iced::advanced::Shell::new(&mut berichten);
        element.as_widget_mut().update(
            &mut tree,
            &iced::Event::Mouse(event),
            Layout::new(&node),
            mouse::Cursor::Available(punt),
            &r,
            &mut iced::advanced::clipboard::Null,
            &mut shell,
            &Rectangle::with_size(Size::new(1000., 1000.)),
        );
    }
    assert_eq!(
        berichten
            .iter()
            .filter(|m| matches!(m, Msg::NotitiePlaats(_, _, true)))
            .count(),
        1
    );
    assert!(
        matches!(berichten.last(),Some(Msg::NotitiePlaats(0,g,true)) if g.x==280. && g.y==332.)
    );
    let g = sleepvak::verschuif(grens, -100., 40_000., false);
    assert_eq!((g.x, g.y), (0., 20000.));
    let g = sleepvak::verschuif(grens, -1000., 10000., true);
    assert_eq!((g.breedte, g.hoogte), (200., 5000.));
}
#[test]
fn notitie_canvas_en_markdown_renderen_met_benoemde_bediening() {
    use office_core::notities::NotitieActie as N;
    let mut s = Sessie::nieuw(Module::Notition).unwrap();
    s.bewerk(0, Bewerking::Notitie(N::Sectiesoort { markdown: false }))
        .unwrap();
    for (x, y, tekst) in [
        (40., 32., "Een vrij tekstvak"),
        (660., 240., "Een idee op een andere plek"),
    ] {
        s.bewerk(0, Bewerking::Notitie(N::NieuwVak { x, y }))
            .unwrap();
        let b = s.weergave(0).unwrap();
        let id = b.velden.last().unwrap().id.clone();
        s.bewerk(
            0,
            Bewerking::Tekst {
                id,
                tekst: tekst.into(),
            },
        )
        .unwrap();
    }
    for (naam, markdown) in [("notition-canvas", false), ("notition-markdown", true)] {
        s.bewerk(0, Bewerking::Notitie(N::Sectiesoort { markdown }))
            .unwrap();
        let app = app_met_document(Module::Notition, &s.bron());
        assert!(toegankelijkheid(&app).unnamed.is_empty());
        let png = render(&app);
        if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
            std::fs::create_dir_all(&map).unwrap();
            png.save_png(PathBuf::from(map).join(format!("{naam}.png")))
                .unwrap();
        }
    }
}

fn referentie_renderen(module: Module, bron: &[u8], naam: &str, uitvoernaam: &str) {
    let mut app = app_met_document(module, bron);
    app.thema = ThemeId::Dark;
    app.venster_grootte = Size::new(1058., 892.);
    let t = app.tab_mut().unwrap();
    t.naam = naam.into();
    t.panelen = false;
    // De webreferentie toont de voorbeeldpresentatie op 65%; de andere
    // documenten op 100%. Hetzelfde zoomniveau is ook native bedienbaar.
    if module == Module::Presentation {
        t.zoom = 0.65;
    }
    t.opgeslagen = Some(t.antwoord.as_ref().unwrap().hash.clone());
    assert!(toegankelijkheid(&app).unnamed.is_empty());
    let png = render_grootte(&app, 1058, 892);
    assert_eq!((png.width(), png.height()), (1058, 892));
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        png.save_png(PathBuf::from(map).join(uitvoernaam)).unwrap();
    }
}

#[test]
fn huidige_writer_referentie_renderen_op_browserformaat() {
    referentie_renderen(
        Module::Writer,
        include_bytes!("../../../../docs/voorbeelden/Ontwerpnotitie.docx"),
        "Ontwerpnotitie.docx",
        "writer-native-referentie.png",
    );
}

#[test]
fn overige_documentreferenties_renderen_op_browserformaat() {
    for (module, bron, naam, uitvoernaam) in [
        (
            Module::Spreadsheet,
            include_bytes!("../../../../docs/voorbeelden/Materiaaloverzicht.xlsx").as_slice(),
            "Materiaaloverzicht.xlsx",
            "spreadsheet-native-referentie.png",
        ),
        (
            Module::Presentation,
            include_bytes!("../../../../docs/voorbeelden/Ontwerpvisie.pptx").as_slice(),
            "Ontwerpvisie.pptx",
            "presentation-native-referentie.png",
        ),
        (
            Module::Notition,
            include_bytes!("../../../../docs/voorbeelden/Notitieboek.json").as_slice(),
            "Notitieboek.json",
            "notition-native-referentie.png",
        ),
    ] {
        referentie_renderen(module, bron, naam, uitvoernaam);
    }
}

pub(super) fn app_met_document(module: Module, bytes: &[u8]) -> App {
    let mut app = App {
        thema: ThemeId::Light,
        ..App::default()
    };
    let sessie = Sessie::open(module, bytes.to_vec()).unwrap();
    let mut tab = Tab::nieuw(1, format!("Voorbeeld.{}", module.extensie()));
    tab.bezig = false;
    let mut beeld = sessie.weergave(0).unwrap();
    lint::vul_beeldmaat(&mut beeld);
    tab.panelen = module != Module::Spreadsheet;
    tab.markdown = beeld
        .velden
        .iter()
        .find(|v| v.naam == "Markdown")
        .map(|v| iced::widget::markdown::parse(&v.tekst).collect())
        .unwrap_or_default();
    tab.afbeelding = beeld
        .afbeelding
        .as_ref()
        .map(|b| image::Handle::from_bytes(b.clone()));
    tab.antwoord = Some(Antwoord {
        deel: 0,
        beeld,
        hash: sessie.bron_hash().into(),
        bron: sessie.bron(),
        terug: false,
        vooruit: false,
    });
    tab.toon_veld(0);
    app.tabs.push(tab);
    app.volgend = 2;
    app
}

/// Voer de echte Iced-taken en werkdraad uit zonder systeemvenster of dialoog.
fn voer_interface_uit(app: &mut App, msg: Msg) {
    use iced::futures::StreamExt;
    let mut taken = std::collections::VecDeque::from([app.update(msg)]);
    let mut aantal = 0;
    while let Some(taak) = taken.pop_front() {
        aantal += 1;
        assert!(aantal < 64, "Onbegrensde vervolgopdrachten");
        let Some(mut stroom) = iced_runtime::task::into_stream(taak) else {
            continue;
        };
        let berichten = iced::futures::executor::block_on(async move {
            let mut berichten = Vec::new();
            while let Some(actie) = stroom.next().await {
                match actie {
                    iced_runtime::Action::Output(msg) => berichten.push(msg),
                    ander => panic!("Onverwachte systeemopdracht tijdens documenttest: {ander:?}"),
                }
            }
            berichten
        });
        for msg in berichten {
            taken.push_back(app.update(msg));
        }
    }
}
pub(super) fn app_met_werkdraad(module: Module, bytes: &[u8]) -> App {
    let mut app = App::default();
    let antwoord = iced::futures::executor::block_on(
        app.werker
            .clone()
            .voer_uit(1, Opdracht::Open(module, bytes.to_vec())),
    )
    .unwrap();
    app.tabs
        .push(Tab::nieuw(1, format!("Rondgang.{}", module.extensie())));
    app.volgend = 2;
    voer_interface_uit(&mut app, Msg::Gereed(1, Ok(antwoord)));
    app
}

#[test]
fn writer_interface_splitsen_samenvoegen_en_undo_via_echte_werkdraad() {
    let mut app = app_met_werkdraad(
        Module::Writer,
        include_bytes!("../../office-core/tests/fixtures/writer-structuur.docx"),
    );
    let index = app
        .tab()
        .unwrap()
        .antwoord
        .as_ref()
        .unwrap()
        .beeld
        .velden
        .iter()
        .position(|v| v.tekst == "Links 🏠 café rechts")
        .unwrap();
    voer_interface_uit(&mut app, Msg::Veld(index));
    let oorspronkelijk = app.tab().unwrap().antwoord.as_ref().unwrap().bron.clone();
    voer_interface_uit(
        &mut app,
        Msg::Invoer(text_editor::Action::Move(
            text_editor::Motion::DocumentStart,
        )),
    );
    for _ in 0..8 {
        voer_interface_uit(
            &mut app,
            Msg::Invoer(text_editor::Action::Move(text_editor::Motion::Right)),
        );
    }
    voer_interface_uit(&mut app, Msg::SplitsAlinea);
    let t = app.tab().unwrap();
    assert!(!t.bezig);
    assert_eq!(t.editor.text(), "Links 🏠 ");
    assert_eq!(
        t.antwoord.as_ref().unwrap().beeld.velden[index + 1].tekst,
        "café rechts"
    );
    let gesplitst = t.antwoord.as_ref().unwrap().bron.clone();
    voer_interface_uit(&mut app, Msg::VoegAlineasSamen);
    assert_eq!(app.tab().unwrap().editor.text(), "Links 🏠 café rechts");
    voer_interface_uit(&mut app, Msg::Terug);
    assert_eq!(
        *app.tab().unwrap().antwoord.as_ref().unwrap().bron,
        *gesplitst
    );
    voer_interface_uit(&mut app, Msg::Terug);
    assert_eq!(
        *app.tab().unwrap().antwoord.as_ref().unwrap().bron,
        *oorspronkelijk
    );
    voer_interface_uit(&mut app, Msg::Vooruit);
    assert_eq!(
        *app.tab().unwrap().antwoord.as_ref().unwrap().bron,
        *gesplitst
    );
}

#[test]
fn spreadsheet_interface_selecteert_anker_buiten_werkvenster_via_echte_werkdraad() {
    let mut app = app_met_werkdraad(
        Module::Spreadsheet,
        &Sessie::nieuw(Module::Spreadsheet).unwrap().bron(),
    );
    voer_interface_uit(&mut app, Msg::Formule("Anker via interface".into()));
    voer_interface_uit(&mut app, Msg::PasToe);
    voer_interface_uit(&mut app, Msg::Adres("A1:Z150".into()));
    voer_interface_uit(&mut app, Msg::Structuur(Structuur::Samenvoegen));
    let oorspronkelijk = app.tab().unwrap().antwoord.as_ref().unwrap().bron.clone();
    voer_interface_uit(&mut app, Msg::Adres("H100".into()));
    voer_interface_uit(&mut app, Msg::GaNaar);
    let t = app.tab().unwrap();
    assert_eq!(t.adres, "A1");
    assert_eq!(t.editor.text(), "Anker via interface");
    assert!(!t.bezig);
    assert_eq!(*t.antwoord.as_ref().unwrap().bron, *oorspronkelijk);
    voer_interface_uit(
        &mut app,
        Msg::Formule("Gewijzigd anker via interface".into()),
    );
    voer_interface_uit(&mut app, Msg::PasToe);
    let bron = app.tab().unwrap().antwoord.as_ref().unwrap().bron.clone();
    let d = office_core::document::Document::open(Module::Spreadsheet, &bron).unwrap();
    assert_eq!(
        d.weergave(0)
            .unwrap()
            .velden
            .iter()
            .find(|v| v.id == "A1")
            .unwrap()
            .tekst,
        "Gewijzigd anker via interface"
    );
}
#[test]
fn concept_wordt_niet_stil_weggegooid_bij_selectie_of_sluiten() {
    let mut app = app_met_document(
        Module::Writer,
        include_bytes!("../../office-core/tests/fixtures/writer.docx"),
    );
    let t = app.tab_mut().unwrap();
    t.editor = text_editor::Content::with_text("Nog niet opgeslagen");
    t.concept = true;
    let _ = app.update(Msg::Veld(1));
    assert_eq!(app.tab().unwrap().gekozen, 0);
    assert!(app.tab().unwrap().concept);
    let _ = app.update(Msg::Sluit(0));
    assert_eq!(app.sluiten, Some(1));
    let _ = app.update(Msg::Annuleer);
    assert_eq!(app.tabs.len(), 1);
    let _ = app.update(Msg::Sluit(0));
    let _ = app.update(Msg::SluitKeuze(false));
    assert!(app.tabs.is_empty());
}
#[test]
fn mislukt_opslaan_markeert_geen_document_als_opgeslagen() {
    let mut app = app_met_document(
        Module::Notition,
        &Sessie::nieuw(Module::Notition).unwrap().bron(),
    );
    let _ = app.update(Msg::Geschreven(
        1,
        PathBuf::from("/niet-opgeslagen.json"),
        Err("Schijffout".into()),
    ));
    assert!(app.tab().unwrap().gewijzigd());
    assert!(app.tab().unwrap().pad.is_none());
}
#[test]
fn wijziging_tijdens_opslaan_blijft_onopgeslagen() {
    let mut app = app_met_document(
        Module::Notition,
        &Sessie::nieuw(Module::Notition).unwrap().bron(),
    );
    app.tab_mut().unwrap().concept = true;
    let oude_hash = opslag::hash(&app.tab().unwrap().antwoord.as_ref().unwrap().bron);
    let _ = app.update(Msg::Geschreven(
        1,
        PathBuf::from("voorbeeld.json"),
        Ok((oude_hash.clone(), oude_hash, None)),
    ));
    assert!(app.tab().unwrap().gewijzigd());
}
#[test]
fn modale_sluitvraag_blokkeert_sneltoetsen_en_achterliggende_acties() {
    let mut app = app_met_document(
        Module::Notition,
        &Sessie::nieuw(Module::Notition).unwrap().bron(),
    );
    let _ = app.update(Msg::Sluit(0));
    let _ = app.update(Msg::Nieuw(Module::Writer));
    assert_eq!(app.tabs.len(), 1);
    assert!(app.sluiten.is_some());
}
fn lettertypen() {
    static EEN: std::sync::Once = std::sync::Once::new();
    EEN.call_once(|| {
        lettertypen_ui::installeer();
        let mut s = iced_tiny_skia::graphics::text::font_system()
            .write()
            .unwrap();
        for b in fonts::FILES.into_iter().chain([
            office_core::lettertypen::kies("Inter", true, false).bytes,
            office_core::lettertypen::kies("Inter", false, true).bytes,
            office_core::lettertypen::kies("Inter", true, true).bytes,
        ]) {
            s.load_font(std::borrow::Cow::Borrowed(b));
        }
    });
}
fn toegankelijkheid(app: &App) -> Collect {
    lettertypen();
    let mut element = app.view();
    let r = iced_tiny_skia::Renderer::new(
        ui_instellingen().default_font,
        ui_instellingen().default_text_size,
    );
    let mut tree = Tree::new(&element);
    let node = element.as_widget_mut().layout(
        &mut tree,
        &r,
        &layout::Limits::new(Size::ZERO, Size::new(1440., 900.)),
    );
    let mut found = Collect::default();
    element
        .as_widget_mut()
        .operate(&mut tree, Layout::new(&node), &r, &mut found);
    found
}
#[test]
fn benoemde_bediening_in_document_bestand_en_instellingen() {
    let mut app = app_met_document(
        Module::Writer,
        include_bytes!("../../office-core/tests/fixtures/writer.docx"),
    );
    for toestand in 0..4 {
        app.bestand = toestand == 1;
        app.instellingen = toestand == 2;
        app.sluiten = (toestand == 3).then_some(1);
        let c = toegankelijkheid(&app);
        assert!(c.unnamed.is_empty(), "toestand {toestand}: {:?}", c.unnamed);
    }
}
/// Dezelfde software-renderer als de app; draait zonder scherm of webbrowser.
fn render(app: &App) -> tiny_skia::Pixmap {
    render_grootte(app, 1440, 900)
}
fn render_grootte(app: &App, breedte: u32, hoogte: u32) -> tiny_skia::Pixmap {
    use iced::advanced::renderer;
    use iced::{Color, Rectangle, mouse};
    lettertypen();
    let size = Size::new(breedte as f32, hoogte as f32);
    let mut element = app.view();
    let mut renderer = iced_tiny_skia::Renderer::new(
        ui_instellingen().default_font,
        ui_instellingen().default_text_size,
    );
    let mut tree = Tree::new(&element);
    let node = element.as_widget_mut().layout(
        &mut tree,
        &renderer,
        &layout::Limits::new(Size::ZERO, size),
    );
    let event = iced::Event::Window(iced::window::Event::RedrawRequested(
        std::time::Instant::now(),
    ));
    let mut messages = Vec::new();
    let mut shell = iced::advanced::Shell::new(&mut messages);
    element.as_widget_mut().update(
        &mut tree,
        &event,
        Layout::new(&node),
        mouse::Cursor::Unavailable,
        &renderer,
        &mut iced::advanced::clipboard::Null,
        &mut shell,
        &Rectangle::with_size(size),
    );
    let theme = app.thema.iced();
    let style = renderer::Style {
        text_color: theme.palette().text,
    };
    element.as_widget().draw(
        &tree,
        &mut renderer,
        &theme,
        &style,
        Layout::new(&node),
        mouse::Cursor::Unavailable,
        &Rectangle::with_size(size),
    );
    let mut bytes = vec![0; breedte as usize * hoogte as usize * 4];
    let mut pixels = tiny_skia::PixmapMut::from_bytes(&mut bytes, breedte, hoogte).unwrap();
    let mut mask = tiny_skia::Mask::new(breedte, hoogte).unwrap();
    renderer.draw(
        &mut pixels,
        &mut mask,
        &iced_tiny_skia::graphics::Viewport::with_physical_size(Size::new(breedte, hoogte), 1.),
        &[Rectangle::with_size(size)],
        Color::WHITE,
    );
    for pixel in bytes.as_chunks_mut::<4>().0 {
        pixel.swap(0, 2);
    }
    tiny_skia::Pixmap::from_vec(bytes, tiny_skia::IntSize::from_wh(breedte, hoogte).unwrap())
        .unwrap()
}
#[test]
fn native_schermen_renderen() {
    let uitvoer = std::env::var_os("OFFICE_TEST_SCHERMEN");
    let bronnen = [
        (
            "writer",
            Module::Writer,
            include_bytes!("../../office-core/tests/fixtures/writer.docx").as_slice(),
        ),
        (
            "spreadsheet",
            Module::Spreadsheet,
            include_bytes!("../../office-core/tests/fixtures/spreadsheet.xlsx").as_slice(),
        ),
        (
            "presentation",
            Module::Presentation,
            include_bytes!("../../office-core/tests/fixtures/presentation.pptx").as_slice(),
        ),
    ];
    for (naam, m, b) in bronnen {
        let mut app = app_met_document(m, b);
        for donker in [false, true] {
            app.thema = if donker {
                ThemeId::Dark
            } else {
                ThemeId::Light
            };
            let png = render(&app);
            if let Some(map) = &uitvoer {
                std::fs::create_dir_all(map).unwrap();
                png.save_png(PathBuf::from(map).join(format!("{naam}-{}.png", app.thema.key())))
                    .unwrap();
            }
        }
    }
    let mut home = App {
        thema: ThemeId::Light,
        ..App::default()
    };
    let png = render(&home);
    if let Some(map) = &uitvoer {
        png.save_png(PathBuf::from(map).join("start.png")).unwrap();
    }
    home.bestand = true;
    let png = render(&home);
    if let Some(map) = &uitvoer {
        png.save_png(PathBuf::from(map).join("bestand.png"))
            .unwrap();
    }
}

#[test]
fn geannuleerde_ifcx_export_verandert_de_huidige_bestandssoort_niet() {
    let mut app = app_met_document(
        Module::Writer,
        include_bytes!("../../office-core/tests/fixtures/writer.docx"),
    );
    let naam = app.tab().unwrap().naam.clone();
    let _ = app.update(Msg::Archiveer);
    assert!(app.tab().unwrap().export_ifcx);
    let _ = app.update(Msg::Doel(1, None));
    assert!(!app.tab().unwrap().ifcx);
    assert!(!app.tab().unwrap().export_ifcx);
    assert_eq!(app.tab().unwrap().naam, naam);
}

#[test]
fn alleen_lezen_laat_selecteren_toe_en_weigert_tekstwijziging() {
    let mut app = app_met_document(
        Module::Email,
        b"Subject: Selecteerbare tekst\r\n\r\nBericht",
    );
    let origineel = app.tab().unwrap().editor.text();
    let _ = app.update(Msg::Invoer(text_editor::Action::SelectAll));
    assert_eq!(
        app.tab().unwrap().editor.selection().as_deref(),
        Some(origineel.as_str())
    );
    let _ = app.update(Msg::Invoer(text_editor::Action::Edit(
        text_editor::Edit::Insert('x'),
    )));
    assert_eq!(app.tab().unwrap().editor.text(), origineel);
    assert!(!app.tab().unwrap().concept);
}

#[test]
fn alineaopdracht_weigert_concept_selectie_en_alleen_lezen() {
    let mut app = app_met_document(
        Module::Writer,
        include_bytes!("../../office-core/tests/fixtures/writer-structuur.docx"),
    );
    let bron = app.tab().unwrap().antwoord.as_ref().unwrap().bron.clone();
    let _ = app.update(Msg::Invoer(text_editor::Action::Edit(
        text_editor::Edit::Insert('x'),
    )));
    assert_eq!(app.update(Msg::SplitsAlinea).units(), 0);
    assert!(app.tab().unwrap().concept);
    assert!(!app.tab().unwrap().bezig);
    assert_eq!(*app.tab().unwrap().antwoord.as_ref().unwrap().bron, *bron);
    let _ = app.update(Msg::Terug);
    let _ = app.update(Msg::Invoer(text_editor::Action::SelectAll));
    assert_eq!(app.update(Msg::SplitsAlinea).units(), 0);
    assert_eq!(app.update(Msg::VoegAlineasSamen).units(), 0);
    assert!(app.melding.contains("zonder tekstselectie"));
    let mut mail = app_met_document(Module::Email, b"Subject: Alleen lezen\r\n\r\nBericht");
    assert_eq!(mail.update(Msg::SplitsAlinea).units(), 0);
    assert_eq!(mail.update(Msg::VoegAlineasSamen).units(), 0);
    assert!(!mail.tab().unwrap().bezig);
    assert_eq!(mail.tab().unwrap().editor.text(), "Alleen lezen");
}

#[test]
fn venster_sluiten_vanuit_instellingen_toont_een_bereikbare_sluitvraag() {
    let mut app = app_met_document(
        Module::Notition,
        &Sessie::nieuw(Module::Notition).unwrap().bron(),
    );
    app.instellingen = true;
    let _ = app.update(Msg::SluitVenster);
    assert!(!app.instellingen);
    assert_eq!(app.sluiten, Some(1));
    let _ = app.update(Msg::Annuleer);
    assert_eq!(app.tabs.len(), 1);
    assert!(!app.venster_sluiten);
}

#[test]
fn mislukte_eerste_weergave_ruimt_de_achtergrondsessie_op() {
    let mut app = App::default();
    let voer = |w: Werker, o| iced::futures::executor::block_on(w.voer_uit(1, o));
    assert!(voer(app.werker.clone(), Opdracht::Nieuw(Module::Notition)).is_ok());
    app.tabs.push(Tab::nieuw(1, "Onleesbaar document".into()));
    let _ = app.update(Msg::Gereed(1, Err("Weergave mislukt".into())));
    assert!(app.tabs.is_empty());
    let resultaat = voer(app.werker.clone(), Opdracht::Deel(0));
    assert!(
        resultaat.is_err(),
        "De gesloten achtergrondbron mag geen geheugen blijven vasthouden"
    );
}

#[test]
fn native_postvak_en_accountformulier_renderen_met_sluitbeveiliging() {
    let mut app = App {
        postvak: mail_ui::testvoorbeeld(),
        postvak_zichtbaar: true,
        thema: ThemeId::Light,
        ..App::default()
    };
    for naam in ["email-postvak", "email-account", "email-sluiten"] {
        if naam == "email-account" {
            let _ = app.update(Msg::Mail(mail_ui::BerichtUi::Wijzig));
            let _ = app.update(Msg::Mail(mail_ui::BerichtUi::Invoer(
                mail_ui::Veld::Naam,
                "Eigen account".into(),
            )));
        }
        if naam == "email-sluiten" {
            let _ = app.update(Msg::SluitVenster);
            assert!(app.postvak.sluitvraag);
            assert!(app.postvak.concept());
        }
        for thema in ThemeId::ALL {
            app.thema = thema;
            assert!(toegankelijkheid(&app).unnamed.is_empty());
            let png = render(&app);
            if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
                std::fs::create_dir_all(&map).unwrap();
                png.save_png(PathBuf::from(map).join(format!("{naam}-{}.png", thema.key())))
                    .unwrap();
            }
        }
    }
    let _ = app.update(Msg::Mail(mail_ui::BerichtUi::AnnuleerSluiten));
    let _ = app.update(Msg::Postvak(false));
    assert!(app.postvak.concept());
}

#[test]
fn mail_sluitvraag_verliest_geen_antwoord_van_de_documentwerkdraad() {
    let mut app = App {
        postvak: mail_ui::testvoorbeeld(),
        postvak_zichtbaar: true,
        ..App::default()
    };
    app.tabs.push(Tab::nieuw(1, "Voorbeeld.docx".into()));
    let _ = app.update(Msg::Mail(mail_ui::BerichtUi::Wijzig));
    let _ = app.update(Msg::Mail(mail_ui::BerichtUi::Invoer(
        mail_ui::Veld::Naam,
        "Eigen account".into(),
    )));
    let _ = app.update(Msg::SluitVenster);
    assert!(app.postvak.sluitvraag);
    let _ = app.update(Msg::Gereed(1, Err("Afgebroken testtaak".into())));
    // Een mislukte eerste weergave ruimt het lege tabblad op; het antwoord
    // mag niet door de maildialoog worden weggefilterd en bezig blijven.
    assert!(app.tabs.is_empty());
    let _ = app.update(Msg::Postvak(false));
    assert!(app.postvak_zichtbaar);
    let _ = app.update(Msg::Mail(mail_ui::BerichtUi::AnnuleerSluiten));
    assert!(!app.venster_sluiten);
    assert!(app.postvak.concept());
}

#[test]
fn document_sneltoetsen_veranderen_geen_verborgen_editor_in_het_postvak() {
    let mut app = App {
        postvak_zichtbaar: true,
        ..App::default()
    };
    let mut tab = Tab::nieuw(1, "Voorbeeld.docx".into());
    tab.bezig = false;
    tab.editor = text_editor::Content::with_text("Niet toegepaste documenttekst");
    tab.concept = true;
    app.tabs.push(tab);
    for letter in ["s", "z", "n", "o", "y", "b", "i", "u", "c", "x", "v"] {
        let taak = app.update(Msg::Toets(openaec_ui::keyboard::KeyPress {
            key: iced::keyboard::Key::Character(letter.into()),
            modifiers: iced::keyboard::Modifiers::COMMAND,
        }));
        assert_eq!(taak.units(), 0);
        assert!(app.tabs[0].concept);
        assert_eq!(app.tabs[0].editor.text(), "Niet toegepaste documenttekst");
        assert_eq!(app.tabs.len(), 1);
        assert!(app.postvak_zichtbaar);
    }
}

#[test]
fn documentwerkdraad_opent_diepe_velden_zonder_de_vensterdraad_te_gebruiken() {
    let werker = Werker::start();
    let antwoord = iced::futures::executor::block_on(werker.clone().voer_uit(
        1,
        Opdracht::Open(
            Module::Writer,
            include_bytes!("../../office-core/tests/fixtures/writer-diepe-velden.docx").to_vec(),
        ),
    ))
    .unwrap();
    assert_eq!(antwoord.beeld.velden[0].tekst, "Diep resultaat café 🏠");
    assert!(!antwoord.bron.is_empty());
    werker.sluit(1);
}

#[test]
fn exportdialoog_blokkeert_verborgen_acties_en_wijzigt_geen_opslagstatus() {
    let mut app = app_met_document(
        Module::Writer,
        include_bytes!("../../office-core/tests/fixtures/writer.docx"),
    );
    let opgeslagen = app.tab().unwrap().opgeslagen.clone();
    let _ = app.update(Msg::ExportMenu);
    assert!(app.exportblad.is_some());
    let _ = app.update(Msg::Nieuw(Module::Writer));
    assert_eq!(app.tabs.len(), 1);
    assert!(toegankelijkheid(&app).unnamed.is_empty());
    let png = render(&app);
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        png.save_png(PathBuf::from(map).join("export-pdf.png"))
            .unwrap();
    }
    let _ = app.update(Msg::Export(export_ui::Bericht::Annuleer));
    assert!(app.exportblad.is_none());
    app.export_bezig = true;
    let _ = app.update(Msg::SluitVenster);
    assert!(!app.venster_sluiten);
    app.sluiten = Some(1);
    let _ = app.update(Msg::ExportVoltooid(Err("Proeffout".into())));
    assert!(!app.export_bezig);
    assert_eq!(app.sluiten, Some(1));
    assert_eq!(app.tab().unwrap().opgeslagen, opgeslagen);
}

#[test]
#[ignore = "Vereist een geïnstalleerde kantoorruntime"]
fn native_export_via_interface_en_werkdraad_slaat_pdf_en_csv_op_zonder_documentopslag() {
    let uniek = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let map = std::env::temp_dir().join(format!(
        "office-export-proef-{}-{uniek}",
        std::process::id()
    ));
    std::fs::create_dir(&map).unwrap();
    for module in [Module::Writer, Module::Spreadsheet] {
        let bytes = if module == Module::Writer {
            include_bytes!("../../office-core/tests/fixtures/writer.docx").as_slice()
        } else {
            include_bytes!("../../office-core/tests/fixtures/spreadsheet.xlsx").as_slice()
        };
        let mut app = app_met_document(module, bytes);
        let bron = app.tab().unwrap().antwoord.as_ref().unwrap().bron.clone();
        let opgeslagen = app.tab().unwrap().opgeslagen.clone();
        let _ = app.update(Msg::ExportMenu);
        if module == Module::Spreadsheet {
            let csv = office_conversie::conversie::exportformaten("xlsx")
                .into_iter()
                .find(|f| f.extensie == "csv")
                .unwrap();
            for m in [
                export_ui::Bericht::Formaat(csv),
                export_ui::Bericht::Scheiding("Komma"),
                export_ui::Bericht::Codering("UTF-8 met BOM"),
            ] {
                let _ = app.update(Msg::Export(m));
            }
        }
        let plan = app.exportblad.as_ref().unwrap().plan().unwrap();
        let pad = map.join(&plan.naam);
        app.exportblad = None;
        app.export_bezig = true;
        voer_interface_uit(&mut app, Msg::ExportPad(plan, Some(pad.clone())));
        let uit = std::fs::read(pad).unwrap();
        if module == Module::Writer {
            assert!(uit.starts_with(b"%PDF-"));
        } else {
            assert!(uit.starts_with(&[0xef, 0xbb, 0xbf]));
            let tekst = String::from_utf8(uit).unwrap();
            let kop: Vec<_> = tekst
                .trim_start_matches('\u{feff}')
                .lines()
                .next()
                .unwrap()
                .split(',')
                .map(|s| s.trim_matches('"'))
                .collect();
            assert_eq!(kop, ["Omschrijving", "Aantal", "Prijs", "Totaal"]);
        }
        assert!(!app.export_bezig);
        assert!(app.melding.starts_with("Export opgeslagen:"));
        assert_eq!(*app.tab().unwrap().antwoord.as_ref().unwrap().bron, *bron);
        assert_eq!(app.tab().unwrap().opgeslagen, opgeslagen);
    }
    std::fs::remove_dir_all(map).unwrap();
}

#[test]
fn writer_indeling_bedient_de_echte_werkdraad_en_bewaart_de_actieve_sectie() {
    use office_core::writer_pagina::{PaginaActie as A, Papier};
    let bytes = include_bytes!("../../office-core/tests/fixtures/writer-structuur.docx");
    let mut app = app_met_werkdraad(Module::Writer, bytes);
    app.thema = ThemeId::Light;
    voer_interface_uit(&mut app, Msg::Lint(1));
    assert_eq!(app.lint_index(), 1);
    let namen = toegankelijkheid(&app);
    assert!(namen.unnamed.is_empty());
    for naam in ["Staand", "Liggend", "A4", "Smal", "Twee kolommen"] {
        assert!(namen.nodes.iter().any(|n| n.node.name == naam), "{naam}");
    }
    for actie in [A::Papier(Papier::A4), A::Liggend(true)] {
        voer_interface_uit(&mut app, Msg::Pagina(actie));
    }
    let t = app.tab().unwrap();
    let a = t.antwoord.as_ref().unwrap();
    assert!((a.beeld.pagina.breedte - 16838. / 15.).abs() < 0.1);
    assert!((a.beeld.pagina.hoogte - 11906. / 15.).abs() < 0.1);
    assert!(a.terug);
    assert!(t.gewijzigd());
    let office_core::document::Document::Writer(d) =
        office_core::document::Document::open(Module::Writer, &a.bron).unwrap()
    else {
        unreachable!()
    };
    assert_eq!(
        d.body()
            .final_section_properties
            .as_ref()
            .unwrap()
            .page_width,
        Some(12240.)
    );
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        let map = PathBuf::from(map);
        std::fs::create_dir_all(&map).unwrap();
        render(&app)
            .save_png(map.join("writer-indeling.png"))
            .unwrap();
    }
    voer_interface_uit(&mut app, Msg::Terug);
    voer_interface_uit(&mut app, Msg::Terug);
    assert_eq!(
        app.tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .as_slice(),
        bytes
    );
}
#[test]
fn writer_paginaopdracht_weigert_concept_en_verdwijnt_bij_andere_module() {
    use office_core::writer_pagina::PaginaActie as A;
    let mut app = app_met_document(
        Module::Writer,
        include_bytes!("../../office-core/tests/fixtures/writer.docx"),
    );
    let bron = app.tab().unwrap().antwoord.as_ref().unwrap().bron.clone();
    app.tab_mut().unwrap().concept = true;
    voer_interface_uit(&mut app, Msg::Pagina(A::Liggend(true)));
    assert_eq!(
        app.tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .as_slice(),
        bron.as_slice()
    );
    assert!(app.tab().unwrap().concept);
    let mut app = app_met_document(
        Module::Spreadsheet,
        include_bytes!("../../office-core/tests/fixtures/spreadsheet.xlsx"),
    );
    let bron = app.tab().unwrap().antwoord.as_ref().unwrap().bron.clone();
    app.lint = 2;
    assert_eq!(app.lint_index(), 0);
    assert!(!app.lint_titels().contains(&"Indeling"));
    voer_interface_uit(&mut app, Msg::Pagina(A::Liggend(true)));
    assert_eq!(
        app.tab()
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
fn symbool_in_bediening_gebruikt_het_gepinde_font_bij_ieder_lintgewicht() {
    use iced::advanced::graphics::text::cosmic_text::{
        Attrs, Buffer, Family, Metrics, Shaping, Weight,
    };
    lettertypen();
    let mut systeem = iced_tiny_skia::graphics::text::font_system()
        .write()
        .unwrap();
    let raw = systeem.raw();
    for gewicht in [400, 500, 600, 700] {
        let attrs = Attrs::new()
            .family(Family::Name("Inter"))
            .weight(Weight(gewicht));
        let mut buffer = Buffer::new(raw, Metrics::new(14., 20.));
        buffer.set_text(raw, "🏠", &attrs, Shaping::Advanced, None);
        buffer.shape_until_scroll(raw, false);
        let glyph = &buffer.layout_runs().next().expect("symboolregel").glyphs[0];
        let gezicht = raw.db().face(glyph.font_id).unwrap();
        assert_eq!(
            gezicht.families[0].0,
            office_core::lettertypen::SYMBOLEN.familie
        );
        assert_ne!(glyph.glyph_id, 0);
    }
}

#[test]
fn writer_beveiliging_blijft_zichtbaar_en_weigert_interfaceopdrachten() {
    let bytes = include_bytes!("../../office-core/tests/fixtures/writer-beveiligd.docx");
    let mut app = App::default();
    voer_interface_uit(
        &mut app,
        Msg::Gelezen(
            1,
            PathBuf::from("Beveiligd.docx"),
            Ok(Geopend {
                module: Module::Writer,
                bytes: bytes.to_vec(),
                hash: opslag::hash(bytes),
                archief: None,
            }),
        ),
    );
    let opgeslagen = app.tab().unwrap().opgeslagen.clone();
    let origineel = app.tab().unwrap().editor.text();
    for lint in [0, 1] {
        voer_interface_uit(&mut app, Msg::Lint(lint));
        let boom = toegankelijkheid(&app);
        assert!(boom.unnamed.is_empty());
        assert!(
            boom.nodes
                .iter()
                .any(|n| n.node.name.contains("actieve documentbeveiliging"))
        );
        let namen: &[&str] = if lint == 0 {
            &["Vet", "Cursief", "Lettertype", "Lettergrootte"]
        } else {
            &["Liggend", "A4", "Smal", "Twee kolommen"]
        };
        for naam in namen {
            let n = boom.nodes.iter().find(|n| &n.node.name == naam).unwrap();
            assert!(n.node.state.disabled, "{naam}");
        }
    }
    voer_interface_uit(&mut app, Msg::Lint(0));
    let grootte = app.tab().unwrap().grootte.clone();
    voer_tekstveld_in(&mut app, "Lettergrootte", "10,5");
    assert_eq!(app.tab().unwrap().grootte, grootte);
    voer_interface_uit(&mut app, Msg::Invoer(text_editor::Action::SelectAll));
    assert_eq!(
        app.tab().unwrap().editor.selection().as_deref(),
        Some(origineel.as_str())
    );
    for msg in [
        Msg::Invoer(text_editor::Action::Edit(text_editor::Edit::Insert('x'))),
        Msg::Opmaak(Opmaak::Vet(false)),
        Msg::Pagina(office_core::writer_pagina::PaginaActie::Liggend(true)),
        Msg::SplitsAlinea,
        Msg::VoegAlineasSamen,
        Msg::PasToe,
        Msg::Toets(openaec_ui::keyboard::KeyPress {
            key: iced::keyboard::Key::Character("b".into()),
            modifiers: iced::keyboard::Modifiers::COMMAND,
        }),
        Msg::Toets(openaec_ui::keyboard::KeyPress {
            key: iced::keyboard::Key::Character("i".into()),
            modifiers: iced::keyboard::Modifiers::COMMAND,
        }),
        Msg::Toets(openaec_ui::keyboard::KeyPress {
            key: iced::keyboard::Key::Character("u".into()),
            modifiers: iced::keyboard::Modifiers::COMMAND,
        }),
    ] {
        voer_interface_uit(&mut app, msg);
        let t = app.tab().unwrap();
        let a = t.antwoord.as_ref().unwrap();
        assert_eq!(a.bron.as_slice(), bytes);
        assert!(!a.terug && !a.vooruit);
        assert!(!t.concept && !t.gewijzigd());
        assert_eq!(t.opgeslagen, opgeslagen);
        assert_eq!(t.editor.text(), origineel);
    }
    let beeld = render(&app);
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        beeld
            .save_png(PathBuf::from(map).join("writer-beveiligd.png"))
            .unwrap();
    }
}

#[test]
fn nederlandse_lettergrootte_komt_via_de_werkdraad_in_alle_drie_documentmodellen() {
    for (invoer, verwacht) in [("10,5", 10.5), (" 12.5 ", 12.5), ("1", 1.), ("400", 400.)] {
        assert_eq!(lint::lettergrootte(invoer), Some(verwacht));
    }
    for invoer in [
        "", "NaN", "inf", "0", "400,1", "1.000,5", "1,2.3", "1e2", "-1", "10 5",
    ] {
        assert_eq!(lint::lettergrootte(invoer), None, "{invoer}");
    }
    for (module, bytes) in [
        (
            Module::Writer,
            include_bytes!("../../office-core/tests/fixtures/writer.docx").as_slice(),
        ),
        (
            Module::Spreadsheet,
            include_bytes!("../../office-core/tests/fixtures/spreadsheet.xlsx").as_slice(),
        ),
        (
            Module::Presentation,
            include_bytes!("../../office-core/tests/fixtures/presentation.pptx").as_slice(),
        ),
    ] {
        let mut app = app_met_werkdraad(module, bytes);
        let veld = app.tab().unwrap().gekozen;
        voer_tekstveld_in(&mut app, "Lettergrootte", "10,5");
        let t = app.tab().unwrap();
        assert!(
            t.antwoord.as_ref().unwrap().terug,
            "{module:?}: invoer={} melding={}",
            t.grootte,
            app.melding
        );
        let opnieuw =
            Sessie::open(module, t.antwoord.as_ref().unwrap().bron.as_ref().clone()).unwrap();
        assert_eq!(
            opnieuw.weergave(t.deel).unwrap().velden[veld]
                .opmaak
                .grootte,
            Some(10.5),
            "{module:?}"
        );
        voer_interface_uit(&mut app, Msg::Terug);
        assert_eq!(
            app.tab()
                .unwrap()
                .antwoord
                .as_ref()
                .unwrap()
                .bron
                .as_slice(),
            bytes
        );
    }
}

/// Bedien de echte Iced-widgets met muis- en toetsgebeurtenissen. De widgetboom
/// behoudt zijn focus/selectie tussen de opnieuw opgebouwde appweergaven.
/// Dit is geen proef met een fysiek venster of invoermethode van het systeem.
fn voer_tekstveld_in(app: &mut App, naam: &str, invoer: &str) {
    use iced::{keyboard as k, mouse};
    let doel = toegankelijkheid(app)
        .nodes
        .into_iter()
        .find(|n| n.node.name == naam)
        .unwrap()
        .bounds
        .center();
    let toets = |key: k::Key, modifiers, tekst: Option<&str>| {
        iced::Event::Keyboard(k::Event::KeyPressed {
            modified_key: key.clone(),
            key,
            physical_key: k::key::Physical::Unidentified(k::key::NativeCode::Unidentified),
            location: k::Location::Standard,
            modifiers,
            text: tekst.map(Into::into),
            repeat: false,
        })
    };
    let mut gebeurtenissen = vec![
        iced::Event::Mouse(mouse::Event::CursorMoved { position: doel }),
        iced::Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
        iced::Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
        iced::Event::Keyboard(k::Event::ModifiersChanged(k::Modifiers::COMMAND)),
        toets(k::Key::Character("a".into()), k::Modifiers::COMMAND, None),
        iced::Event::Keyboard(k::Event::ModifiersChanged(k::Modifiers::empty())),
    ];
    gebeurtenissen.extend(invoer.chars().map(|c| {
        let tekst = c.to_string();
        toets(
            k::Key::Character(tekst.clone().into()),
            k::Modifiers::empty(),
            Some(&tekst),
        )
    }));
    gebeurtenissen.push(toets(
        k::Key::Named(k::key::Named::Enter),
        k::Modifiers::empty(),
        None,
    ));
    voer_widgetgebeurtenissen_uit(app, doel, gebeurtenissen);
}
fn klik_bediening(app: &mut App, naam: &str) {
    use iced::mouse;
    let doel = toegankelijkheid(app)
        .nodes
        .into_iter()
        .find(|n| n.node.name == naam)
        .unwrap()
        .bounds
        .center();
    voer_widgetgebeurtenissen_uit(
        app,
        doel,
        vec![
            iced::Event::Mouse(mouse::Event::CursorMoved { position: doel }),
            iced::Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
            iced::Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
        ],
    );
}
fn voer_widgetgebeurtenissen_uit(
    app: &mut App,
    doel: iced::Point,
    gebeurtenissen: Vec<iced::Event>,
) {
    use iced::mouse;
    lettertypen();
    let renderer = iced_tiny_skia::Renderer::new(
        ui_instellingen().default_font,
        ui_instellingen().default_text_size,
    );
    let grootte = Size::new(1440., 900.);
    let mut boom = Tree::empty();
    for gebeurtenis in gebeurtenissen {
        let berichten = {
            let mut element = app.view();
            boom.diff(element.as_widget());
            let node = element.as_widget_mut().layout(
                &mut boom,
                &renderer,
                &layout::Limits::new(Size::ZERO, grootte),
            );
            let mut berichten = vec![];
            let mut shell = iced::advanced::Shell::new(&mut berichten);
            element.as_widget_mut().update(
                &mut boom,
                &gebeurtenis,
                Layout::new(&node),
                mouse::Cursor::Available(doel),
                &renderer,
                &mut iced::advanced::clipboard::Null,
                &mut shell,
                &iced::Rectangle::with_size(grootte),
            );
            berichten
        };
        for bericht in berichten {
            voer_interface_uit(app, bericht);
        }
    }
}

#[test]
fn writer_opmaak_in_het_lint_volgt_selectie_en_past_de_echte_knop_op_hetzelfde_bereik_toe() {
    use text_editor::{Action as A, Motion as M};
    let app = app_met_werkdraad(
        Module::Writer,
        include_bytes!("../../office-core/tests/fixtures/writer.docx"),
    );
    assert_eq!(app.tab().unwrap().grootte, "26");
    assert_eq!(app.tab().unwrap().lettertype, "Calibri");
    let bron = include_bytes!("../../office-core/tests/fixtures/writer-structuur.docx");
    let mut app = app_met_werkdraad(Module::Writer, bron);
    let index = app
        .tab()
        .unwrap()
        .antwoord
        .as_ref()
        .unwrap()
        .beeld
        .velden
        .iter()
        .position(|v| v.tekst == "Links 🏠 café rechts")
        .unwrap();
    voer_interface_uit(&mut app, Msg::Veld(index));
    assert!(!app.tab().unwrap().opmaak_van_selectie().unwrap().vet);
    voer_interface_uit(&mut app, Msg::Invoer(A::Move(M::DocumentStart)));
    for _ in "Links 🏠 ".chars() {
        voer_interface_uit(&mut app, Msg::Invoer(A::Select(M::Right)));
    }
    assert_eq!(
        app.tab().unwrap().editor.selection().as_deref(),
        Some("Links 🏠 ")
    );
    assert_eq!(app.tab().unwrap().tekstbereik(), Some((0, 8)));
    assert!(app.tab().unwrap().opmaak_van_selectie().unwrap().vet);
    let boom = toegankelijkheid(&app);
    assert_eq!(
        boom.nodes
            .iter()
            .find(|n| n.node.name == "Vet")
            .unwrap()
            .node
            .state
            .checked,
        Some(true)
    );
    let beeld = render(&app);
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        beeld
            .save_png(PathBuf::from(map).join("writer-selectie-opmaak.png"))
            .unwrap();
    }
    klik_bediening(&mut app, "Vet");
    let t = app.tab().unwrap();
    let a = t.antwoord.as_ref().unwrap();
    let id = &a.beeld.velden[index].id;
    let bereiken = &a.beeld.writer_opmaak[id];
    assert!(
        !office_core::writer_opmaak::selectie(bereiken, 0, 8)
            .unwrap()
            .vet
    );
    assert!(
        office_core::writer_opmaak::selectie(bereiken, 8, "Links 🏠 café rechts".chars().count())
            .unwrap()
            .cursief
    );
    assert_eq!(a.beeld.velden[index].tekst, "Links 🏠 café rechts");
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("writer-selectie-lint.docx"),
            a.bron.as_slice(),
        )
        .unwrap();
    }
    voer_interface_uit(&mut app, Msg::Terug);
    assert_eq!(
        app.tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .as_slice(),
        bron
    );
    voer_interface_uit(&mut app, Msg::Invoer(A::SelectAll));
    assert!(!app.tab().unwrap().opmaak_van_selectie().unwrap().vet);
    klik_bediening(&mut app, "Vet");
    assert!(app.tab().unwrap().opmaak_van_selectie().unwrap().vet);
    for letter in ["b", "i", "u"] {
        voer_interface_uit(
            &mut app,
            Msg::Toets(openaec_ui::keyboard::KeyPress {
                key: iced::keyboard::Key::Character(letter.into()),
                modifiers: iced::keyboard::Modifiers::COMMAND,
            }),
        );
    }
    let staat = app.tab().unwrap().opmaak_van_selectie().unwrap();
    assert!(!staat.vet && staat.cursief && staat.onderstrepen);
}

/// Handel uitsluitend eigen testtekst af; het systeemklembord wordt niet benaderd.
fn klembordtaak(taak: Task<Msg>, leestekst: Option<&str>) -> (Vec<String>, Vec<Msg>) {
    use iced::futures::StreamExt;
    let Some(mut stroom) = iced_runtime::task::into_stream(taak) else {
        return (vec![], vec![]);
    };
    iced::futures::executor::block_on(async move {
        let mut geschreven = vec![];
        let mut berichten = vec![];
        while let Some(actie) = stroom.next().await {
            match actie {
                iced_runtime::Action::Clipboard(iced_runtime::clipboard::Action::Read {
                    channel,
                    target,
                }) => {
                    assert_eq!(target, iced::advanced::clipboard::Kind::Standard);
                    channel.send(leestekst.map(str::to_string)).unwrap();
                }
                iced_runtime::Action::Clipboard(iced_runtime::clipboard::Action::Write {
                    contents,
                    target,
                }) => {
                    assert_eq!(target, iced::advanced::clipboard::Kind::Standard);
                    geschreven.push(contents);
                }
                iced_runtime::Action::Output(msg) => berichten.push(msg),
                ander => panic!("Onverwachte systeemopdracht in klembordproef: {ander:?}"),
            }
        }
        (geschreven, berichten)
    })
}
/// Verkrijg de opdracht via echte muisgebeurtenissen op de benoemde lintknop.
fn knopbericht(app: &App, naam: &str) -> Msg {
    use iced::mouse;
    lettertypen();
    let doel = toegankelijkheid(app)
        .nodes
        .into_iter()
        .find(|n| n.node.name == naam)
        .unwrap()
        .bounds
        .center();
    let renderer = iced_tiny_skia::Renderer::new(
        ui_instellingen().default_font,
        ui_instellingen().default_text_size,
    );
    let mut element = app.view();
    let mut tree = Tree::new(&element);
    let grootte = Size::new(1440., 900.);
    let node = element.as_widget_mut().layout(
        &mut tree,
        &renderer,
        &layout::Limits::new(Size::ZERO, grootte),
    );
    let mut berichten = vec![];
    for event in [
        mouse::Event::CursorMoved { position: doel },
        mouse::Event::ButtonPressed(mouse::Button::Left),
        mouse::Event::ButtonReleased(mouse::Button::Left),
    ] {
        let mut shell = iced::advanced::Shell::new(&mut berichten);
        element.as_widget_mut().update(
            &mut tree,
            &iced::Event::Mouse(event),
            Layout::new(&node),
            mouse::Cursor::Available(doel),
            &renderer,
            &mut iced::advanced::clipboard::Null,
            &mut shell,
            &iced::Rectangle::with_size(grootte),
        );
    }
    assert_eq!(berichten.len(), 1, "{naam}");
    berichten.pop().unwrap()
}
fn klembord_alinea(app: &mut App) -> usize {
    let index = app
        .tab()
        .unwrap()
        .antwoord
        .as_ref()
        .unwrap()
        .beeld
        .velden
        .iter()
        .position(|v| v.tekst == "Links 🏠 café rechts")
        .unwrap();
    voer_interface_uit(app, Msg::Veld(index));
    voer_interface_uit(
        app,
        Msg::Invoer(text_editor::Action::Move(
            text_editor::Motion::DocumentStart,
        )),
    );
    for _ in 0..8 {
        voer_interface_uit(
            app,
            Msg::Invoer(text_editor::Action::Select(text_editor::Motion::Right)),
        );
    }
    assert_eq!(
        app.tab().unwrap().editor.selection().as_deref(),
        Some("Links 🏠 ")
    );
    index
}
#[test]
fn klembord_lintknoppen_behouden_unicode_bron_opmaak_en_ongedaan_maken() {
    let bron = include_bytes!("../../office-core/tests/fixtures/writer-structuur.docx");
    let mut app = app_met_werkdraad(Module::Writer, bron);
    let index = klembord_alinea(&mut app);
    let gewijzigd = app.tab().unwrap().gewijzigd();
    let bericht = knopbericht(&app, "Kopiëren");
    let (geschreven, berichten) = klembordtaak(app.update(bericht), None);
    assert_eq!(geschreven, vec!["Links 🏠 "]);
    assert!(berichten.is_empty());
    assert_eq!(app.tab().unwrap().gewijzigd(), gewijzigd);
    let taak = app.update(Msg::Toets(openaec_ui::keyboard::KeyPress {
        key: iced::keyboard::Key::Character("c".into()),
        modifiers: iced::keyboard::Modifiers::COMMAND,
    }));
    let (geschreven, berichten) = klembordtaak(taak, None);
    assert_eq!(geschreven, vec!["Links 🏠 "]);
    assert!(berichten.is_empty());
    let bericht = knopbericht(&app, "Plakken");
    let (geschreven, berichten) = klembordtaak(app.update(bericht), Some("Nieuw 🏠 "));
    assert!(geschreven.is_empty());
    assert_eq!(berichten.len(), 1);
    for bericht in berichten {
        voer_interface_uit(&mut app, bericht);
    }
    let t = app.tab().unwrap();
    assert!(t.concept);
    assert_eq!(t.editor.text(), "Nieuw 🏠 café rechts");
    assert_eq!(t.antwoord.as_ref().unwrap().bron.as_slice(), bron);
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        render(&app)
            .save_png(PathBuf::from(map).join("writer-klembord-concept.png"))
            .unwrap();
    }
    klik_bediening(&mut app, "Tekst toepassen");
    let t = app.tab().unwrap();
    let a = t.antwoord.as_ref().unwrap();
    assert_eq!(a.beeld.velden[index].tekst, "Nieuw 🏠 café rechts");
    let bereiken = &a.beeld.writer_opmaak[&a.beeld.velden[index].id];
    assert!(
        office_core::writer_opmaak::selectie(bereiken, 8, "Nieuw 🏠 café rechts".chars().count())
            .unwrap()
            .cursief
    );
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("writer-klembord.docx"),
            a.bron.as_slice(),
        )
        .unwrap();
    }
    voer_interface_uit(&mut app, Msg::Terug);
    assert_eq!(
        app.tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .as_slice(),
        bron
    );
    klembord_alinea(&mut app);
    let bericht = knopbericht(&app, "Knippen");
    let (geschreven, berichten) = klembordtaak(app.update(bericht), None);
    assert_eq!(geschreven, vec!["Links 🏠 "]);
    assert!(berichten.is_empty());
    assert_eq!(app.tab().unwrap().editor.text(), "café rechts");
    assert!(app.tab().unwrap().concept);
    assert_eq!(
        app.tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .as_slice(),
        bron
    );
    klik_bediening(&mut app, "Tekst toepassen");
    voer_interface_uit(&mut app, Msg::Terug);
    assert_eq!(
        app.tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .as_slice(),
        bron
    );
}
#[test]
fn klembord_vertraagd_antwoord_verandert_geen_andere_editor_of_selectie() {
    let bron = include_bytes!("../../office-core/tests/fixtures/writer-structuur.docx");
    let mut app = app_met_werkdraad(Module::Writer, bron);
    klembord_alinea(&mut app);
    let (_, mut berichten) = klembordtaak(
        app.update(Msg::Klembord(klembord::Actie::Plak)),
        Some("Vertraagde eigen tekst"),
    );
    assert_eq!(berichten.len(), 1);
    voer_interface_uit(
        &mut app,
        Msg::Invoer(text_editor::Action::Move(
            text_editor::Motion::DocumentStart,
        )),
    );
    voer_interface_uit(&mut app, berichten.pop().unwrap());
    assert!(!app.tab().unwrap().concept);
    assert_eq!(app.tab().unwrap().editor.text(), "Links 🏠 café rechts");
    assert!(app.melding.contains("selectie is gewijzigd"));
    let (_, mut berichten) = klembordtaak(
        app.update(Msg::Klembord(klembord::Actie::Plak)),
        Some("Vertraagde eigen tekst"),
    );
    voer_interface_uit(&mut app, Msg::Nieuw(Module::Writer));
    let ongewijzigd = app.tab().unwrap().antwoord.as_ref().unwrap().bron.clone();
    voer_interface_uit(&mut app, berichten.pop().unwrap());
    assert_eq!(
        app.tab().unwrap().antwoord.as_ref().unwrap().bron,
        ongewijzigd
    );
    assert!(!app.tab().unwrap().concept);
    for leeg in [None, Some("")] {
        let (_, berichten) = klembordtaak(app.update(Msg::Klembord(klembord::Actie::Plak)), leeg);
        for bericht in berichten {
            voer_interface_uit(&mut app, bericht);
        }
        assert!(!app.tab().unwrap().concept);
    }
}
#[test]
fn klembord_respecteert_beveiliging_en_verborgen_of_modale_editors() {
    let bron = include_bytes!("../../office-core/tests/fixtures/writer-beveiligd.docx");
    let mut app = app_met_werkdraad(Module::Writer, bron);
    voer_interface_uit(&mut app, Msg::Invoer(text_editor::Action::SelectAll));
    let selectie = app.tab().unwrap().editor.selection().unwrap();
    let (geschreven, berichten) =
        klembordtaak(app.update(Msg::Klembord(klembord::Actie::Kopieer)), None);
    assert_eq!(geschreven, vec![selectie]);
    assert!(berichten.is_empty());
    for actie in [klembord::Actie::Knip, klembord::Actie::Plak] {
        let (a, b) = klembordtaak(app.update(Msg::Klembord(actie)), Some("Eigen tekst"));
        assert!(a.is_empty() && b.is_empty());
    }
    let boom = toegankelijkheid(&app);
    for naam in ["Knippen", "Plakken"] {
        assert!(
            boom.nodes
                .iter()
                .find(|n| n.node.name == naam)
                .unwrap()
                .node
                .state
                .disabled
        );
    }
    for toestand in 0..6 {
        app.bestand = toestand == 0;
        app.instellingen = toestand == 1;
        app.postvak_zichtbaar = toestand == 2;
        app.sluiten = (toestand == 3).then_some(1);
        app.postvak.sluitvraag = toestand == 4;
        app.tab_mut().unwrap().bezig = toestand == 5;
        for actie in [
            klembord::Actie::Kopieer,
            klembord::Actie::Knip,
            klembord::Actie::Plak,
        ] {
            let (a, b) = klembordtaak(app.update(Msg::Klembord(actie)), Some("Eigen tekst"));
            assert!(a.is_empty() && b.is_empty(), "toestand {toestand}");
        }
        assert_eq!(
            app.tab()
                .unwrap()
                .antwoord
                .as_ref()
                .unwrap()
                .bron
                .as_slice(),
            bron
        );
        assert!(!app.tab().unwrap().concept);
    }
}
#[test]
fn compacte_opmaakrij_bedient_doorhalen_uitvullen_en_letterstappen() {
    let bron = include_bytes!("../../office-core/tests/fixtures/writer.docx");
    let mut app = app_met_werkdraad(Module::Writer, bron);
    voer_interface_uit(&mut app, Msg::Veld(1));
    assert!(toegankelijkheid(&app).unnamed.is_empty());
    klik_bediening(&mut app, "Doorhalen");
    assert!(app.tab().unwrap().veld().unwrap().opmaak.doorhalen);
    klik_bediening(&mut app, "Uitvullen");
    klik_bediening(&mut app, "Lettertype vergroten");
    assert_eq!(app.tab().unwrap().veld().unwrap().opmaak.grootte, Some(12.));
    klik_bediening(&mut app, "Lettertype verkleinen");
    assert_eq!(app.tab().unwrap().veld().unwrap().opmaak.grootte, Some(11.));
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("writer-lintuitbreiding.docx"),
            app.tab()
                .unwrap()
                .antwoord
                .as_ref()
                .unwrap()
                .bron
                .as_slice(),
        )
        .unwrap();
    }
    for _ in 0..4 {
        voer_interface_uit(&mut app, Msg::Terug);
    }
    assert_eq!(
        app.tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .as_slice(),
        bron
    );

    voer_tekstveld_in(&mut app, "Lettergrootte", "80");
    klik_bediening(&mut app, "Lettertype verkleinen");
    assert_eq!(app.tab().unwrap().veld().unwrap().opmaak.grootte, Some(79.));
    klik_bediening(&mut app, "Lettertype vergroten");
    assert_eq!(app.tab().unwrap().veld().unwrap().opmaak.grootte, Some(80.));
    for _ in 0..3 {
        voer_interface_uit(&mut app, Msg::Terug);
    }
    assert_eq!(
        app.tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .as_slice(),
        bron
    );
    voer_tekstveld_in(&mut app, "Lettergrootte", "1");
    assert!(
        toegankelijkheid(&app)
            .nodes
            .iter()
            .find(|n| n.node.name == "Lettertype verkleinen")
            .unwrap()
            .node
            .state
            .disabled
    );
    klik_bediening(&mut app, "Lettertype vergroten");
    assert_eq!(app.tab().unwrap().veld().unwrap().opmaak.grootte, Some(2.));
    klik_bediening(&mut app, "Lettertype verkleinen");
    assert_eq!(app.tab().unwrap().veld().unwrap().opmaak.grootte, Some(1.));
    for _ in 0..3 {
        voer_interface_uit(&mut app, Msg::Terug);
    }
    assert_eq!(
        app.tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .as_slice(),
        bron
    );
    voer_interface_uit(&mut app, Msg::Lint(2));
    let panelen = app.tab().unwrap().panelen;
    klik_bediening(&mut app, "Inzoomen");
    assert!((app.tab().unwrap().zoom - 1.1).abs() < 0.0001);
    klik_bediening(&mut app, "100%");
    assert_eq!(app.tab().unwrap().zoom, 1.);
    klik_bediening(&mut app, "Panelen");
    assert_eq!(app.tab().unwrap().panelen, !panelen);
    klik_bediening(&mut app, "Panelen");
    assert_eq!(app.tab().unwrap().panelen, panelen);
    klik_bediening(&mut app, "Bestand");
    assert!(matches!(
        knopbericht(&app, "Bewaren als IFCX…"),
        Msg::Archiveer
    ));
    assert!(matches!(knopbericht(&app, "Markdown…"), Msg::Markdown));
    assert!(matches!(knopbericht(&app, "Exporteren…"), Msg::ExportMenu));
    assert_eq!(
        app.tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .as_slice(),
        bron
    );
}

#[path = "tests/raster_proeven.rs"]
mod raster_proeven;

#[test]
fn writer_meerdere_conceptbewerkingen_behouden_de_opmaak_tussen_de_wijzigingen() {
    let bron = include_bytes!("../../office-core/tests/fixtures/writer-structuur.docx");
    let mut app = app_met_werkdraad(Module::Writer, bron);
    let n = app
        .tab()
        .unwrap()
        .antwoord
        .as_ref()
        .unwrap()
        .beeld
        .velden
        .iter()
        .position(|v| v.tekst == "Links 🏠 café rechts")
        .unwrap();
    voer_interface_uit(&mut app, Msg::Veld(n));
    for actie in [
        text_editor::Action::Move(text_editor::Motion::DocumentEnd),
        text_editor::Action::Edit(text_editor::Edit::Insert('!')),
        text_editor::Action::Move(text_editor::Motion::DocumentStart),
        text_editor::Action::Edit(text_editor::Edit::Insert('?')),
    ] {
        voer_interface_uit(&mut app, Msg::Invoer(actie));
    }
    voer_interface_uit(&mut app, Msg::PasToe);
    let t = app.tab().unwrap();
    let v = t.veld().unwrap();
    assert_eq!(v.tekst, "?Links 🏠 café rechts!");
    let a = t.antwoord.as_ref().unwrap();
    let bereiken = &a.beeld.writer_opmaak[&v.id];
    let links = office_core::writer_opmaak::selectie(bereiken, 1, 9).unwrap();
    let rechts = office_core::writer_opmaak::selectie(bereiken, 9, 20).unwrap();
    assert!(
        links.vet && !links.cursief,
        "De ongewijzigde vette tekst verliest opmaak"
    );
    assert!(
        !rechts.vet && rechts.cursief,
        "De ongewijzigde cursieve tekst verliest opmaak"
    );
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("writer-conceptreeks.docx"),
            &*a.bron,
        )
        .unwrap();
    }
    voer_interface_uit(&mut app, Msg::Terug);
    let t = app.tab().unwrap();
    assert_eq!(t.antwoord.as_ref().unwrap().bron.as_slice(), bron);
    assert!(!t.antwoord.as_ref().unwrap().terug);
}

#[test]
fn writer_invoer_graphemen_selectie_regels_en_tabs_volgen_de_werkelijke_editor() {
    let bron = include_bytes!("../../office-core/tests/fixtures/writer-structuur.docx");
    let mut app = app_met_werkdraad(Module::Writer, bron);
    let n = app
        .tab()
        .unwrap()
        .antwoord
        .as_ref()
        .unwrap()
        .beeld
        .velden
        .iter()
        .position(|v| v.tekst == "Links 🏠 café rechts")
        .unwrap();
    voer_interface_uit(&mut app, Msg::Veld(n));
    use text_editor::{Action as A, Edit as E, Motion as M};
    let melding = app.melding.clone();
    // Verwijder een astrale letter met Backspace en een gecombineerd grafeem
    // met Delete. De bewaarde coördinaten zijn Unicode-tekens, geen bytes.
    for actie in [
        A::Move(M::DocumentStart),
        A::Select(M::DocumentEnd),
        A::Edit(E::Paste(std::sync::Arc::new("🏠e\u{301}\nRechts".into()))),
        A::Move(M::DocumentStart),
        A::Move(M::Right),
        A::Edit(E::Backspace),
        A::Edit(E::Delete),
        A::Edit(E::Paste(std::sync::Arc::new("🛠é".into()))),
        A::SelectAll,
        A::Edit(E::Indent),
        A::Edit(E::Unindent),
    ] {
        voer_interface_uit(&mut app, Msg::Invoer(actie));
        assert_eq!(app.melding, melding, "Invoer werd geweigerd");
    }
    let concept = app.tab().unwrap().editor.text();
    assert_eq!(concept, "🛠é\nRechts");
    voer_interface_uit(&mut app, Msg::PasToe);
    assert_eq!(app.tab().unwrap().veld().unwrap().tekst, concept);
    voer_interface_uit(&mut app, Msg::Terug);
    assert_eq!(
        app.tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .bron
            .as_slice(),
        bron
    );
}

#[path = "tests/schaduw_proeven.rs"]
mod schaduw_proeven;
