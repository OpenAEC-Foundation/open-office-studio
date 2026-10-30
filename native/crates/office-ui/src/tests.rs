use super::*;
use iced::advanced::{
    layout::{self, Layout},
    widget::Tree,
};
use office_core::document::Sessie;
use openaec_ui::design::a11y::Collect;

fn app_met_document(module: Module, bytes: &[u8]) -> App {
    let mut app = App {
        thema: ThemeId::Light,
        ..App::default()
    };
    let sessie = Sessie::open(module, bytes.to_vec()).unwrap();
    let mut tab = Tab::nieuw(1, format!("Voorbeeld.{}", module.extensie()));
    tab.bezig = false;
    let beeld = sessie.weergave(0).unwrap();
    tab.afbeelding = beeld
        .afbeelding
        .as_ref()
        .map(|b| image::Handle::from_bytes(b.clone()));
    tab.antwoord = Some(Antwoord {
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
        fonts::install_fallback();
        let mut s = iced_tiny_skia::graphics::text::font_system()
            .write()
            .unwrap();
        for b in fonts::FILES {
            s.load_font(std::borrow::Cow::Borrowed(b));
        }
    });
}
fn toegankelijkheid(app: &App) -> Collect {
    lettertypen();
    let mut element = app.view();
    let r = iced_tiny_skia::Renderer::new(fonts::BODY, iced::Pixels(12.));
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
    use iced::advanced::renderer;
    use iced::{Color, Rectangle, mouse};
    lettertypen();
    let size = Size::new(1440., 900.);
    let mut element = app.view();
    let mut renderer = iced_tiny_skia::Renderer::new(fonts::BODY, iced::Pixels(12.));
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
    let mut bytes = vec![0; 1440 * 900 * 4];
    let mut pixels = tiny_skia::PixmapMut::from_bytes(&mut bytes, 1440, 900).unwrap();
    let mut mask = tiny_skia::Mask::new(1440, 900).unwrap();
    renderer.draw(
        &mut pixels,
        &mut mask,
        &iced_tiny_skia::graphics::Viewport::with_physical_size(Size::new(1440, 900), 1.),
        &[Rectangle::with_size(size)],
        Color::WHITE,
    );
    for pixel in bytes.as_chunks_mut::<4>().0 {
        pixel.swap(0, 2);
    }
    tiny_skia::Pixmap::from_vec(bytes, tiny_skia::IntSize::from_wh(1440, 900).unwrap()).unwrap()
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
