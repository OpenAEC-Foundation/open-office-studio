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
}
impl Proef {
    fn nieuw() -> Self {
        lettertypen();
        Self {
            app: app_met_werkdraad(
                Module::Spreadsheet,
                include_bytes!("../../../office-core/tests/fixtures/spreadsheet.xlsx"),
            ),
            boom: Tree::empty(),
            renderer: iced_tiny_skia::Renderer::new(
                ui_instellingen().default_font,
                ui_instellingen().default_text_size,
            ),
            klembord: Testklembord::default(),
            muis: iced::Point::new(-1., -1.),
            focusoperaties: 0,
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
            &iced::Event::Window(iced::window::Event::RedrawRequested(
                std::time::Instant::now(),
            )),
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
