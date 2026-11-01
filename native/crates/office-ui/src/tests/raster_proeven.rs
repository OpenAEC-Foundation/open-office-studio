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
fn notitie_omzetting_bewaart_canvas_en_opent_een_gevulde_markdownkopie() {
    let bron = include_bytes!("../../../../../docs/voorbeelden/Notitieboek.json");
    let mut p = Proef::met_app(app_met_werkdraad(Module::Notition, bron));
    let origineel: serde_json::Value = serde_json::from_slice(bron).unwrap();
    p.klik(iced::Point::new(165., 95.));
    let d: serde_json::Value = serde_json::from_slice(&p.bron()).unwrap();
    let secties = d["boeken"][0]["secties"].as_array().unwrap();
    assert_eq!(
        secties.len(),
        3,
        "Een andere sectiesoort krijgt een afzonderlijke kopie"
    );
    assert_eq!(secties[0], origineel["boeken"][0]["secties"][0]);
    assert_eq!(secties[1], origineel["boeken"][0]["secties"][1]);
    assert_eq!(secties[2]["soort"], "markdown");
    assert!(
        secties[2]["paginas"][0]["markdown"]
            .as_str()
            .unwrap()
            .contains("Een vrij tekstvak")
    );
    assert!(
        secties[2]["paginas"][0]["markdown"]
            .as_str()
            .unwrap()
            .contains("Een idee op een andere plek")
    );
    assert!(
        p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .beeld
            .notitie
            .as_ref()
            .unwrap()
            .markdown
    );
    assert_eq!(p.app.tab().unwrap().deel, 2);
    let t = p.app.tab().unwrap();
    let document = t.id;
    let hash = t.antwoord.as_ref().unwrap().hash.clone();
    let voor = p.bron();
    p.bericht(Msg::NotitieSoort {
        document,
        hash: hash.clone(),
        deel: 2,
        markdown: true,
    });
    p.bericht(Msg::NotitieSoort {
        document: document + 1,
        hash,
        deel: 2,
        markdown: false,
    });
    assert_eq!(
        *p.bron(),
        *voor,
        "Gelijke keuze en een oud document mogen niets kopiëren"
    );
    p.bericht(Msg::Terug);
    assert_eq!(p.bron().as_slice(), bron.as_slice());
    assert_eq!(p.app.tab().unwrap().deel, 0);
    assert!(
        !p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .beeld
            .notitie
            .as_ref()
            .unwrap()
            .markdown
    );
    let t = p.app.tab().unwrap();
    let document = t.id;
    let hash = t.antwoord.as_ref().unwrap().hash.clone();
    p.bericht(Msg::NotitieSoort {
        document,
        hash,
        deel: 0,
        markdown: true,
    });
    let nieuw: serde_json::Value = serde_json::from_slice(&p.bron()).unwrap();
    assert_eq!(
        nieuw["boeken"][0]["secties"][0],
        origineel["boeken"][0]["secties"][0]
    );
    assert_eq!(
        nieuw["boeken"][0]["secties"][1],
        origineel["boeken"][0]["secties"][1]
    );
    assert_eq!(nieuw["boeken"][0]["secties"][2]["soort"], "markdown");
    assert!(
        nieuw["boeken"][0]["secties"][2]["paginas"][0]["markdown"]
            .as_str()
            .unwrap()
            .contains("Een vrij tekstvak")
    );
    assert_eq!(p.app.tab().unwrap().deel, 2);
    p.bericht(Msg::Terug);
    assert_eq!(p.bron().as_slice(), bron);
}
fn notitie_tekstpunt(p: &mut Proef, index: usize) -> iced::Point {
    let v = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .filter(|n| n.node.name == "Notitietekst")
        .nth(index)
        .unwrap()
        .bounds;
    iced::Point::new(v.x + 12., v.y + 10.)
}
#[test]
fn notitie_runtimebatch_bewaart_het_beginpunt_van_een_snelle_greep() {
    use iced::{Event, mouse};
    let bron = include_bytes!("../../../../../docs/voorbeelden/Notitieboek.json");
    let mut uit = Vec::new();
    for zoom in [0.75, 1., 1.5] {
        let mut p = Proef::met_app(app_met_werkdraad(Module::Notition, bron));
        p.bericht(Msg::Zoom(zoom));
        let g = p
            .toegankelijkheid()
            .nodes
            .into_iter()
            .find(|n| n.node.name == "Formaatgreep tekstvak 1")
            .unwrap()
            .bounds;
        let begin = iced::Point::new(g.x + g.width / 2., g.y + g.height / 2.);
        let eind = iced::Point::new(begin.x + 60., begin.y + 48.);
        let berichten = {
            let mut ui = iced_runtime::user_interface::UserInterface::build(
                p.app.view(),
                Size::new(1440., 900.),
                iced_runtime::user_interface::Cache::default(),
                &mut p.renderer,
            );
            let mut berichten = Vec::new();
            // De vensterruntime geeft de laatste cursorpositie mee aan de
            // gehele reeks. Gebruik hier werkelijk dezelfde UserInterface.
            ui.update(
                &[
                    Event::Mouse(mouse::Event::CursorMoved { position: begin }),
                    Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
                    Event::Mouse(mouse::Event::CursorMoved { position: eind }),
                    Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
                ],
                mouse::Cursor::Available(eind),
                &mut p.renderer,
                &mut p.klembord,
                &mut berichten,
            );
            berichten
        };
        for bericht in berichten {
            p.bericht(bericht);
        }
        let d: serde_json::Value = serde_json::from_slice(&p.bron()).unwrap();
        let v = &d["boeken"][0]["secties"][0]["paginas"][0]["vakken"][0];
        uit.push((
            zoom,
            v["breedte"].as_f64().unwrap(),
            v["hoogte"].as_f64().unwrap(),
        ));
    }
    assert_eq!(
        uit,
        vec![(0.75, 640., 224.), (1., 620., 208.), (1.5, 600., 192.)],
        "Ook een snelle echte runtimebatch moet op het oorspronkelijke grijppunt beginnen"
    );
}
fn notitie_runtime_ronde(
    p: &mut Proef,
    cache: iced_runtime::user_interface::Cache,
    events: &[iced::Event],
    cursor: iced::mouse::Cursor,
) -> iced_runtime::user_interface::Cache {
    let mut berichten = Vec::new();
    let cache = {
        let mut ui = iced_runtime::user_interface::UserInterface::build(
            p.app.view(),
            Size::new(1440., 900.),
            cache,
            &mut p.renderer,
        );
        ui.update(
            events,
            cursor,
            &mut p.renderer,
            &mut p.klembord,
            &mut berichten,
        );
        ui.into_cache()
    };
    for bericht in berichten {
        p.bericht(bericht);
    }
    cache
}
#[test]
fn notitie_runtimebatch_bewaart_focus_positie_en_undo_over_frames() {
    use iced::{Event, mouse};
    let bron = include_bytes!("../../../../../docs/voorbeelden/Notitieboek.json");
    for zoom in [0.75, 1., 1.5] {
        let mut p = Proef::met_app(app_met_werkdraad(Module::Notition, bron));
        p.bericht(Msg::Zoom(zoom));
        let ander = notitie_tekstpunt(&mut p, 1);
        let g = p
            .toegankelijkheid()
            .nodes
            .into_iter()
            .find(|n| n.node.name == "Formaatgreep tekstvak 1")
            .unwrap()
            .bounds;
        let begin = iced::Point::new(g.x + g.width / 2., g.y + g.height / 2.);
        let eind = iced::Point::new(begin.x + 60., begin.y + 48.);
        let cache = notitie_runtime_ronde(
            &mut p,
            Default::default(),
            &[
                Event::Mouse(mouse::Event::CursorMoved { position: ander }),
                Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
                Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
            ],
            mouse::Cursor::Available(ander),
        );
        let cache = notitie_runtime_ronde(
            &mut p,
            cache,
            &[Event::Mouse(mouse::Event::CursorMoved { position: begin })],
            mouse::Cursor::Available(begin),
        );
        // De druk heeft geen eigen positie. De runtime moet hiervoor de
        // cursor uit de vorige UI-cache gebruiken, niet het einde van de batch.
        let cache = notitie_runtime_ronde(
            &mut p,
            cache,
            &[
                Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
                Event::Mouse(mouse::Event::CursorMoved { position: eind }),
                Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
            ],
            mouse::Cursor::Available(eind),
        );
        let d: serde_json::Value = serde_json::from_slice(&p.bron()).unwrap();
        let v = &d["boeken"][0]["secties"][0]["paginas"][0]["vakken"][0];
        assert!((v["breedte"].as_f64().unwrap() - (560. + 60. / zoom as f64)).abs() < 0.001);
        assert!((v["hoogte"].as_f64().unwrap() - (160. + 48. / zoom as f64)).abs() < 0.001);
        p.bericht(Msg::Terug);
        assert_eq!(
            p.bron().as_slice(),
            bron,
            "Een runtimegesture blijft één bronexacte undo"
        );
        // Buiten het venster loslaten mag dezelfde bron niet alsnog wijzigen.
        let _cache = notitie_runtime_ronde(
            &mut p,
            cache,
            &[
                Event::Mouse(mouse::Event::CursorMoved { position: begin }),
                Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
                Event::Mouse(mouse::Event::CursorLeft),
                Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
            ],
            mouse::Cursor::Unavailable,
        );
        assert_eq!(p.bron().as_slice(), bron);
    }
}
#[test]
fn runtimebatch_gewone_knoppen_volgen_iedere_klik_en_de_vorige_framepositie() {
    use iced::{Event, mouse};
    let mut p = Proef::met_app(app_met_werkdraad(
        Module::Notition,
        include_bytes!("../../../../../docs/voorbeelden/Notitieboek.json"),
    ));
    let links = iced::Point::new(40., 20.);
    let rechts = iced::Point::new(120., 20.);
    let beweeg = |position| Event::Mouse(mouse::Event::CursorMoved { position });
    let druk = || Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left));
    let los = || Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left));
    let mut ronde = |cache, events: &[Event], punt| {
        let inhoud: iced::Element<'_, u8, iced::Theme, iced_tiny_skia::Renderer> =
            iced::widget::row![
                iced::widget::button("Links")
                    .width(80)
                    .height(40)
                    .on_press(1),
                iced::widget::button("Rechts")
                    .width(80)
                    .height(40)
                    .on_press(2),
            ]
            .into();
        let mut ui = iced_runtime::user_interface::UserInterface::build(
            inhoud,
            Size::new(160., 40.),
            cache,
            &mut p.renderer,
        );
        let mut berichten = Vec::new();
        ui.update(
            events,
            mouse::Cursor::Available(punt),
            &mut p.renderer,
            &mut p.klembord,
            &mut berichten,
        );
        (ui.into_cache(), berichten)
    };
    let (_, berichten) = ronde(
        Default::default(),
        &[beweeg(links), druk(), los(), beweeg(rechts), druk(), los()],
        rechts,
    );
    assert_eq!(
        berichten,
        vec![1, 2],
        "Iedere klik hoort bij zijn eigen knop"
    );
    let (cache, berichten) = ronde(Default::default(), &[beweeg(links)], links);
    assert!(berichten.is_empty());
    let (_, berichten) = ronde(cache, &[druk(), los(), beweeg(rechts)], rechts);
    assert_eq!(
        berichten,
        vec![1],
        "Een latere beweging verplaatst een eerdere klik niet"
    );
}
#[test]
fn notitie_originele_werkruimte_heeft_boek_en_paginakolom_en_een_licht_canvas() {
    let bron = include_bytes!("../../../../../docs/voorbeelden/Notitieboek.json");
    // De oorspronkelijke notities.css gebruikt 228/250 px voor de navigatie;
    // canvas.css houdt het werkblad ook bij een donkere schil op #fafaf9.
    for thema in [ThemeId::Light, ThemeId::Dark] {
        let mut app = app_met_werkdraad(Module::Notition, bron);
        app.thema = thema;
        let mut p = Proef::met_app(app);
        let nodes = p.toegankelijkheid().nodes;
        let boek = nodes
            .iter()
            .find(|n| n.node.name == "Notitieboeken")
            .expect("De oorspronkelijke boekkolom ontbreekt")
            .bounds;
        let pagina = nodes
            .iter()
            .find(|n| n.node.name == "Notitiepagina's")
            .expect("De afzonderlijke paginakolom ontbreekt")
            .bounds;
        let canvas = nodes
            .iter()
            .find(|n| n.node.name == "Notitiecanvas")
            .expect("Het herkenbare vrije canvas ontbreekt")
            .bounds;
        assert_eq!((boek.x, boek.width), (0., 228.));
        assert_eq!((pagina.x, pagina.width), (228., 250.));
        assert_eq!(canvas.x, 478.);
        let beeld = p.verbeeld();
        let kleur = beeld
            .pixel((canvas.x + 11.) as u32, (canvas.y + 11.) as u32)
            .unwrap();
        assert_eq!(
            (kleur.red(), kleur.green(), kleur.blue(), kleur.alpha()),
            (250, 250, 249, 255)
        );
        assert_eq!(p.bron().as_slice(), bron);
    }
}
#[test]
fn notitie_boekkiezer_en_panelen_behouden_identiteit_concept_en_bron() {
    let mut d: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../../../docs/voorbeelden/Notitieboek.json"
    ))
    .unwrap();
    fn nieuwe_ids(v: &mut serde_json::Value) {
        match v {
            serde_json::Value::Object(o) => {
                for (k, v) in o {
                    if k == "id" {
                        *v = serde_json::json!(format!("{}-kopie", v.as_str().unwrap()));
                    } else {
                        nieuwe_ids(v);
                    }
                }
            }
            serde_json::Value::Array(a) => {
                for v in a {
                    nieuwe_ids(v);
                }
            }
            _ => {}
        }
    }
    let mut kopie = d["boeken"][0].clone();
    nieuwe_ids(&mut kopie);
    kopie["naam"] = serde_json::json!("Dubbel / boek");
    d["boeken"][0]["naam"] = kopie["naam"].clone();
    d["boeken"].as_array_mut().unwrap().push(kopie);
    d["boeken"]
        .as_array_mut()
        .unwrap()
        .push(serde_json::json!({"id":"leeg-boek","naam":"Leeg boek","secties":[]}));
    let bron = serde_json::to_vec(&d).unwrap();
    let mut p = Proef::met_app(app_met_werkdraad(Module::Notition, &bron));
    p.bericht(Msg::NotitieBoek(1));
    assert_eq!(p.app.tab().unwrap().deel, 2);
    assert_eq!(
        p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .beeld
            .notitie
            .as_ref()
            .unwrap()
            .overzicht
            .boek,
        1
    );
    p.bericht(Msg::NotitieBoek(0));
    assert_eq!(p.app.tab().unwrap().deel, 0);
    p.bericht(Msg::NotitieBoek(2));
    assert_eq!(p.app.tab().unwrap().deel, 0);
    assert!(p.app.melding.contains("geen actieve pagina"));
    let punt = notitie_tekstpunt(&mut p, 0);
    p.klik(punt);
    p.toets(
        iced::keyboard::Key::Character("9".into()),
        iced::keyboard::Modifiers::empty(),
        Some("9"),
    );
    p.toets(
        iced::keyboard::Key::Character(" Twee extra ".into()),
        iced::keyboard::Modifiers::empty(),
        Some(" Twee extra "),
    );
    // '9 Twee extra Een vrij tekstvak' telt zes woorden; het tweede vak zes.
    assert_eq!(
        p.app
            .tab()
            .unwrap()
            .notitie_woorden
            .iter()
            .skip(1)
            .sum::<usize>(),
        12
    );
    assert_eq!(
        p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .beeld
            .notitie
            .as_ref()
            .unwrap()
            .woorden,
        9
    );
    let concept = p.app.tab().unwrap().editor.text();
    p.bericht(Msg::NotitieBoek(1));
    assert_eq!(p.app.tab().unwrap().deel, 0);
    assert_eq!(p.app.tab().unwrap().editor.text(), concept);
    p.bericht(Msg::Terug);
    assert_eq!(p.bron().as_slice(), bron);
    assert_eq!(
        p.app
            .tab()
            .unwrap()
            .notitie_woorden
            .iter()
            .skip(1)
            .sum::<usize>(),
        9
    );
    p.bericht(Msg::Panelen);
    let nodes = p.toegankelijkheid().nodes;
    assert!(!nodes.iter().any(|n| n.node.name == "Notitiepagina's"));
    assert_eq!(
        nodes
            .iter()
            .find(|n| n.node.name == "Notitiecanvas")
            .unwrap()
            .bounds
            .x,
        0.
    );
    p.bericht(Msg::Panelen);
    assert_eq!(
        p.toegankelijkheid()
            .nodes
            .iter()
            .find(|n| n.node.name == "Notitiecanvas")
            .unwrap()
            .bounds
            .x,
        478.
    );
    assert_eq!(p.bron().as_slice(), bron);
}
#[test]
fn notitie_canvas_dubbelklik_voegt_op_drie_zoomstanden_een_bewerkbaar_vak_toe() {
    use iced::{Event, keyboard as k, mouse};
    let bron = include_bytes!("../../../../../docs/voorbeelden/Notitieboek.json");
    for zoom in [0.75, 1., 1.5] {
        let mut p = Proef::met_app(app_met_werkdraad(Module::Notition, bron));
        p.bericht(Msg::Zoom(zoom));
        let grens = p
            .toegankelijkheid()
            .nodes
            .into_iter()
            .find(|n| n.node.name == "Notitiecanvas")
            .unwrap()
            .bounds;
        let punt = iced::Point::new(grens.x + 300. * zoom, grens.y + 300. * zoom);
        p.gebeurtenissen([
            Event::Mouse(mouse::Event::CursorMoved { position: punt }),
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
        ]);
        let d: serde_json::Value = serde_json::from_slice(&p.bron()).unwrap();
        let vakken = d["boeken"][0]["secties"][0]["paginas"][0]["vakken"]
            .as_array()
            .unwrap();
        assert_eq!(vakken.len(), 3);
        assert_eq!(vakken[2]["x"].as_f64(), Some(300.));
        assert_eq!(vakken[2]["y"].as_f64(), Some(300.));
        let punt = notitie_tekstpunt(&mut p, 2);
        p.klik(punt);
        p.toets(
            k::Key::Character("Nieuwe notitie9".into()),
            k::Modifiers::empty(),
            Some("Nieuwe notitie9"),
        );
        p.bericht(Msg::PasToe);
        let d: serde_json::Value = serde_json::from_slice(&p.bron()).unwrap();
        assert_eq!(
            d["boeken"][0]["secties"][0]["paginas"][0]["vakken"][2]["blokken"][0]["tekst"],
            "Nieuwe notitie9"
        );
        p.bericht(Msg::Terug);
        p.bericht(Msg::Terug);
        assert_eq!(p.bron().as_slice(), bron);
        let t = p.app.tab().unwrap();
        let document = t.id;
        let hash = t.antwoord.as_ref().unwrap().hash.clone();
        p.bericht(Msg::Bestand(true));
        p.bericht(Msg::NotitieNieuwVak {
            document,
            hash,
            deel: 0,
            x: 300.,
            y: 300.,
        });
        assert_eq!(p.bron().as_slice(), bron);
    }
}
#[test]
fn notitie_een_tekstklik_en_direct_typen_behouden_de_invoer() {
    let bron = include_bytes!("../../../../../docs/voorbeelden/Notitieboek.json");
    let mut p = Proef::met_app(app_met_werkdraad(Module::Notition, bron));
    let punt = notitie_tekstpunt(&mut p, 0);
    p.klik(punt);
    p.toets(
        iced::keyboard::Key::Character("9".into()),
        iced::keyboard::Modifiers::empty(),
        Some("9"),
    );
    let tekst = p.app.tab().unwrap().editor.text();
    assert_eq!(tekst.replace('9', ""), "Een vrij tekstvak");
    assert_eq!(
        tekst.matches('9').count(),
        1,
        "De eerste tekstklik moet ook invoer ontvangen"
    );
    p.bericht(Msg::PasToe);
    let d: serde_json::Value = serde_json::from_slice(&p.bron()).unwrap();
    assert_eq!(
        d["boeken"][0]["secties"][0]["paginas"][0]["vakken"][0]["blokken"][0]["tekst"],
        tekst
    );
    p.bericht(Msg::Terug);
    assert_eq!(p.bron().as_slice(), bron.as_slice());
}
#[test]
fn notitie_tekstklikken_en_unicode_in_dezelfde_widgetronde_bewaren_beide_vakken() {
    use iced::{Event, keyboard as k, mouse};
    let bron = include_bytes!("../../../../../docs/voorbeelden/Notitieboek.json");
    let mut p = Proef::met_app(app_met_werkdraad(Module::Notition, bron));
    let vakken: Vec<_> = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .filter(|n| n.node.name == "Notitietekst")
        .map(|n| n.bounds)
        .collect();
    assert_eq!(vakken.len(), 2);
    let mut events = vec![];
    for (vak, tekst) in vakken.iter().zip(["9", "é🏠"]) {
        events.extend([
            Event::Mouse(mouse::Event::CursorMoved {
                position: iced::Point::new(vak.x + 12., vak.y + 10.),
            }),
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
            Event::Keyboard(k::Event::KeyPressed {
                key: k::Key::Character(tekst.into()),
                modified_key: k::Key::Character(tekst.into()),
                physical_key: k::key::Physical::Unidentified(k::key::NativeCode::Unidentified),
                location: k::Location::Standard,
                modifiers: k::Modifiers::empty(),
                text: Some(tekst.into()),
                repeat: false,
            }),
        ]);
    }
    p.gebeurtenissen(events);
    let t = p.app.tab().unwrap();
    assert!(t.concept);
    let eerste = notitie_ui::inhoud(t, 1).unwrap().text();
    let tweede = notitie_ui::inhoud(t, 2).unwrap().text();
    assert_eq!(eerste.replace('9', ""), "Een vrij tekstvak");
    assert_eq!(eerste.matches('9').count(), 1);
    assert_eq!(tweede.replace("é🏠", ""), "Een idee op een andere plek");
    assert_eq!(tweede.matches("é🏠").count(), 1);
    assert_eq!(p.bron().as_slice(), bron);
    p.bericht(Msg::PasToe);
    let d: serde_json::Value = serde_json::from_slice(&p.bron()).unwrap();
    let vakken = &d["boeken"][0]["secties"][0]["paginas"][0]["vakken"];
    assert_eq!(vakken[0]["blokken"][0]["tekst"], eerste);
    assert_eq!(vakken[1]["blokken"][0]["tekst"], tweede);
    let heropen = Sessie::open(Module::Notition, p.bron().as_ref().clone()).unwrap();
    assert!(
        heropen
            .weergave(0)
            .unwrap()
            .velden
            .iter()
            .any(|v| v.tekst == tweede)
    );
    p.bericht(Msg::Terug);
    assert_eq!(p.bron().as_slice(), bron);
}
#[test]
fn notitie_late_invoer_van_een_andere_bron_wordt_niet_toegepast() {
    let bron = include_bytes!("../../../../../docs/voorbeelden/Notitieboek.json");
    let mut p = Proef::met_app(app_met_werkdraad(Module::Notition, bron));
    let t = p.app.tab().unwrap();
    let oud = Msg::NotitieInvoer {
        document: t.id,
        hash: t.antwoord.as_ref().unwrap().hash.clone(),
        veld: t.antwoord.as_ref().unwrap().beeld.velden[1].id.clone(),
        actie: text_editor::Action::Edit(text_editor::Edit::Insert('9')),
    };
    p.bericht(Msg::Notitie(
        office_core::notities::NotitieActie::KopieerSectie { markdown: true },
    ));
    let na = p.bron();
    p.bericht(oud);
    assert_eq!(*p.bron(), *na);
    assert!(!p.app.tab().unwrap().concept);
}
#[test]
fn notitie_paginawissel_rendert_ook_voordat_het_werkdraadantwoord_komt() {
    let bron = include_bytes!("../../../../../docs/voorbeelden/Notitieboek.json");
    let mut p = Proef::met_app(app_met_werkdraad(Module::Notition, bron));
    let punt = notitie_tekstpunt(&mut p, 0);
    p.klik(punt);
    assert_eq!(p.app.tab().unwrap().gekozen, 1);
    let taak = p.app.update(Msg::Deel(1));
    assert!(p.app.tab().unwrap().bezig);
    // Het echte venster tekent ook tussen de opdracht en het antwoord.
    // De oude pagina en alle bijbehorende editors moeten dan nog kloppen.
    let _ = p.verbeeld();
    let t = p.app.tab().unwrap();
    for (n, v) in t.antwoord.as_ref().unwrap().beeld.velden.iter().enumerate() {
        assert_eq!(notitie_ui::inhoud(t, n).unwrap().text(), v.tekst);
    }
    p.taak(taak);
    assert_eq!(p.app.tab().unwrap().deel, 1);
    assert_eq!(p.app.tab().unwrap().gekozen, 0);
    assert!(
        p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .beeld
            .notitie
            .as_ref()
            .unwrap()
            .markdown
    );
    assert_eq!(p.bron().as_slice(), bron);
}
#[test]
fn notitie_zichtbare_formaatgreep_vergroot_op_drie_zoomstanden_met_een_undo() {
    use iced::{Event, mouse};
    let bron = include_bytes!("../../../../../docs/voorbeelden/Notitieboek.json");
    // De fysieke sleepafstand 60 × 48 wordt door de zoom gedeeld:
    // 0,75: +80/+64; 1: +60/+48; 1,5: +40/+32 bronpunten.
    for (zoom, breedte, hoogte) in [(0.75, 640., 224.), (1., 620., 208.), (1.5, 600., 192.)] {
        let mut p = Proef::met_app(app_met_werkdraad(Module::Notition, bron));
        p.bericht(Msg::Zoom(zoom));
        let g = p
            .toegankelijkheid()
            .nodes
            .into_iter()
            .find(|n| n.node.name == "Formaatgreep tekstvak 1")
            .unwrap()
            .bounds;
        let begin = iced::Point::new(g.x + g.width / 2., g.y + g.height / 2.);
        let einde = iced::Point::new(begin.x + 60., begin.y + 48.);
        p.gebeurtenissen([
            Event::Mouse(mouse::Event::CursorMoved { position: begin }),
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
            Event::Mouse(mouse::Event::CursorMoved { position: einde }),
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
        ]);
        let d: serde_json::Value = serde_json::from_slice(&p.bron()).unwrap();
        let v = &d["boeken"][0]["secties"][0]["paginas"][0]["vakken"][0];
        assert_eq!(
            v["breedte"].as_f64(),
            Some(breedte),
            "De zichtbare greep moet het vak vergroten bij zoom {zoom}"
        );
        assert_eq!(v["hoogte"].as_f64(), Some(hoogte));
        assert_eq!(v["x"].as_f64(), Some(40.));
        assert_eq!(v["y"].as_f64(), Some(32.));
        if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
            std::fs::create_dir_all(&map).unwrap();
            p.verbeeld()
                .save_png(PathBuf::from(map).join(format!(
                    "notition-formaatgreep-{}.png",
                    (zoom * 100.) as u32
                )))
                .unwrap();
        }
        p.bericht(Msg::Terug);
        assert_eq!(p.bron().as_slice(), bron);
    }
}
#[test]
fn notitie_markdownvoorbeeld_herstelt_bij_ongedaan_maken_van_een_concept() {
    use iced::keyboard::{Key, Modifiers};
    let bron = include_bytes!("../../../../../docs/voorbeelden/Notitieboek.json");
    let mut p = Proef::met_app(app_met_werkdraad(Module::Notition, bron));
    p.bericht(Msg::Deel(1));
    let g = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| n.node.name == "Notitietekst")
        .unwrap()
        .bounds;
    p.klik(iced::Point::new(g.x + 12., g.y + 12.));
    let voor = p.app.tab().unwrap().editor.text();
    // Vergelijk beide modellen nadat de widgetboom hun stijlcaches heeft gevuld.
    let _ = p.verbeeld();
    let voorbeeld = format!("{:?}", p.app.tab().unwrap().markdown);
    p.toets(
        Key::Character("Voorbeeldconcept9".into()),
        Modifiers::empty(),
        Some("Voorbeeldconcept9"),
    );
    assert!(p.app.tab().unwrap().concept);
    assert!(format!("{:?}", p.app.tab().unwrap().markdown).contains("Voorbeeldconcept9"));
    p.toets(Key::Character("z".into()), Modifiers::COMMAND, None);
    let _ = p.verbeeld();
    let t = p.app.tab().unwrap();
    assert!(!t.concept);
    assert_eq!(t.editor.text(), voor);
    assert_eq!(
        format!("{:?}", t.markdown),
        voorbeeld,
        "Ook het voorbeeld moet de verworpen concepttekst vergeten"
    );
    assert_eq!(p.bron().as_slice(), bron);
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
fn writer_zoeksluitklik_behoudt_de_bevestigde_paginacursor() {
    use iced::keyboard::{Key, Modifiers};
    use zoeken_ui::Bericht as Z;
    let mut p = writer_paginaproef();
    let origineel = p.bron();
    p.bericht(Msg::Zoeken(Z::Open(false)));
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    assert_eq!(
        lint::tekenoffset(
            &p.app.tab().unwrap().editor,
            p.app.tab().unwrap().editor.cursor().position
        ),
        8
    );
    let knop = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| n.node.name == "Zoekpaneel sluiten")
        .unwrap()
        .bounds;
    p.klik(iced::Point::new(
        knop.x + knop.width * 0.5,
        knop.y + knop.height * 0.5,
    ));
    assert!(p.app.zoeken.is_none());
    assert!(
        p.app
            .tab()
            .unwrap()
            .writer_focus
            .load(std::sync::atomic::Ordering::Relaxed)
    );
    p.toets(Key::Character("!".into()), Modifiers::empty(), Some("!"));
    assert!(!p.app.tab().unwrap().concept);
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 !café rechts");
    assert_ne!(*p.bron(), *origineel);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *origineel);
}
#[test]
fn writer_zoeksluitklik_en_directe_toets_in_dezelfde_widgetronde() {
    use zoeken_ui::Bericht as Z;
    let mut p = writer_paginaproef();
    let origineel = p.bron();
    p.bericht(Msg::Zoeken(Z::Open(false)));
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    linttoets_in_dezelfde_ronde(
        &mut p,
        "Zoekpaneel sluiten",
        openaec_ui::design::a11y::Role::Button,
    );
    assert!(p.app.zoeken.is_none());
    assert!(!p.app.tab().unwrap().concept);
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 9café rechts");
    assert_ne!(*p.bron(), *origineel);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *origineel);
}
#[test]
fn writer_zoekopenfocus_laat_een_later_gekozen_paginacursor_werken() {
    use iced::keyboard::{Key, Modifiers};
    use zoeken_ui::Bericht as Z;
    let mut p = writer_paginaproef();
    let origineel = p.bron();
    let laat = p.app.update(Msg::Zoeken(Z::Open(false)));
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    assert_eq!(
        lint::tekenoffset(
            &p.app.tab().unwrap().editor,
            p.app.tab().unwrap().editor.cursor().position
        ),
        8
    );
    p.taak(laat);
    p.toets(Key::Character("9".into()), Modifiers::empty(), Some("9"));
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 9café rechts");
    assert!(!p.app.tab().unwrap().concept);
    assert_ne!(*p.bron(), *origineel);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *origineel);
}
#[test]
fn writer_zoekopenfocus_normale_opening_typen_en_kopieren_blijven_werken() {
    use iced::keyboard::{Key, Modifiers};
    use zoeken_ui::Bericht as Z;
    for vanaf_pagina in [false, true] {
        let mut p = writer_paginaproef();
        if vanaf_pagina {
            let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
            p.klik(punt);
        }
        let origineel = p.bron();
        p.bericht(Msg::Zoeken(Z::Open(false)));
        p.toets(Key::Character("9".into()), Modifiers::empty(), Some("9"));
        p.selecteer_alles();
        p.toets(Key::Character("c".into()), Modifiers::COMMAND, None);
        assert_eq!(p.klembord.tekst.as_deref(), Some("9"));
        assert_eq!(*p.bron(), *origineel);
        assert!(!p.app.tab().unwrap().concept);
    }
}
#[test]
fn writer_zoekopenfocus_laat_een_later_lettertypeveld_werken() {
    use iced::keyboard::{Key, Modifiers};
    use zoeken_ui::Bericht as Z;
    let mut p = writer_paginaproef();
    let origineel = p.bron();
    let laat = p.app.update(Msg::Zoeken(Z::Open(false)));
    let veld = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| {
            n.node.name == "Lettertype" && n.node.role == openaec_ui::design::a11y::Role::TextField
        })
        .unwrap()
        .bounds;
    p.klik(iced::Point::new(
        veld.x + veld.width * 0.5,
        veld.y + veld.height * 0.5,
    ));
    let oud = p.app.tab().unwrap().lettertype.clone();
    p.taak(laat);
    p.toets(Key::Character("9".into()), Modifiers::empty(), Some("9"));
    assert_ne!(p.app.tab().unwrap().lettertype, oud);
    assert!(p.app.tab().unwrap().lettertype.contains('9'));
    assert_eq!(*p.bron(), *origineel);
}
#[test]
fn writer_zoekopenfocus_laat_een_nieuwe_cursor_in_dezelfde_alinea_werken() {
    use iced::keyboard::{Key, Modifiers};
    use zoeken_ui::Bericht as Z;
    let mut p = writer_paginaproef();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 2);
    p.klik(punt);
    let origineel = p.bron();
    let versie = p.app.tab().unwrap().editerversie;
    let alinea = p.app.tab().unwrap().veld().unwrap().id.clone();
    let laat = p.app.update(Msg::Zoeken(Z::Open(false)));
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    // Ook een klik binnen dezelfde alinea vernieuwt de editor. De alinea
    // blijft gelijk en de nieuwe cursor moet vóór de oude focusvraag winnen.
    assert_eq!(p.app.tab().unwrap().editerversie, versie.wrapping_add(1));
    assert_eq!(p.app.tab().unwrap().veld().unwrap().id, alinea);
    assert_eq!(
        lint::tekenoffset(
            &p.app.tab().unwrap().editor,
            p.app.tab().unwrap().editor.cursor().position
        ),
        8
    );
    p.taak(laat);
    p.toets(Key::Character("9".into()), Modifiers::empty(), Some("9"));
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 9café rechts");
    assert!(!p.app.tab().unwrap().concept);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *origineel);
}
#[test]
fn writer_zoekopenfocus_gesloten_paneel_raakt_een_nieuw_paneel_niet() {
    use iced::keyboard::{Key, Modifiers};
    use zoeken_ui::Bericht as Z;
    let mut p = writer_paginaproef();
    let origineel = p.bron();
    let laat = p.app.update(Msg::Zoeken(Z::Open(false)));
    p.bericht(Msg::Zoeken(Z::Sluit));
    p.bericht(Msg::Zoeken(Z::Open(false)));
    // Een latere focusvraag kan ook uit een werkdraad komen, zonder muisgebeurtenis.
    p.taak(iced::widget::operation::focus("document-tekst-editor"));
    p.taak(laat);
    p.toets(Key::Character("9".into()), Modifiers::empty(), Some("9"));
    assert!(p.app.tab().unwrap().concept);
    assert!(p.app.tab().unwrap().editor.text().contains('9'));
    assert_eq!(*p.bron(), *origineel);
}
#[test]
fn writer_zoekopenfocus_van_ander_document_raakt_de_huidige_editor_niet() {
    use iced::keyboard::{Key, Modifiers};
    use zoeken_ui::Bericht as Z;
    let mut p = writer_paginaproef();
    let oud = p.app.tab().unwrap().id;
    let laat = p.app.update(Msg::Zoeken(Z::Open(false)));
    p.bericht(Msg::Nieuw(Module::Writer));
    assert_ne!(p.app.tab().unwrap().id, oud);
    p.bericht(Msg::Zoeken(Z::Open(false)));
    let origineel = p.bron();
    p.taak(iced::widget::operation::focus("document-tekst-editor"));
    p.taak(laat);
    p.toets(Key::Character("9".into()), Modifiers::empty(), Some("9"));
    assert!(p.app.tab().unwrap().concept);
    assert!(p.app.tab().unwrap().editor.text().contains('9'));
    assert_eq!(*p.bron(), *origineel);
}
#[test]
fn writer_zoekherkomst_sneltoets_en_paginaklik_in_dezelfde_widgetronde() {
    use iced::{Event, keyboard as k, mouse};
    let mut p = writer_paginaproef();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    let origineel = p.bron();
    p.gebeurtenissen([
        Event::Keyboard(k::Event::KeyPressed {
            key: k::Key::Character("f".into()),
            modified_key: k::Key::Character("f".into()),
            physical_key: k::key::Physical::Unidentified(k::key::NativeCode::Unidentified),
            location: k::Location::Standard,
            modifiers: k::Modifiers::COMMAND,
            text: None,
            repeat: false,
        }),
        Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
        Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
    ]);
    assert!(p.app.zoeken.is_some());
    assert!(
        p.app
            .tab()
            .unwrap()
            .writer_focus
            .load(std::sync::atomic::Ordering::Relaxed)
    );
    p.toets(
        k::Key::Character("9".into()),
        k::Modifiers::empty(),
        Some("9"),
    );
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 9café rechts");
    assert!(!p.app.tab().unwrap().concept);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *origineel);
}
#[test]
fn writer_zoekherkomst_lintklik_en_paginaklik_in_dezelfde_widgetronde() {
    use iced::{Event, keyboard as k, mouse};
    let mut p = writer_paginaproef();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    let origineel = p.bron();
    let b = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| n.node.name == "Zoeken" && n.node.role == openaec_ui::design::a11y::Role::Button)
        .unwrap()
        .bounds;
    let knop = iced::Point::new(b.x + b.width * 0.5, b.y + b.height * 0.5);
    p.gebeurtenissen([
        Event::Mouse(mouse::Event::CursorMoved { position: knop }),
        Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
        Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
        Event::Mouse(mouse::Event::CursorMoved { position: punt }),
        Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
        Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
    ]);
    assert!(p.app.zoeken.is_some());
    assert!(
        p.app
            .tab()
            .unwrap()
            .writer_focus
            .load(std::sync::atomic::Ordering::Relaxed)
    );
    p.toets(
        k::Key::Character("9".into()),
        k::Modifiers::empty(),
        Some("9"),
    );
    assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 9café rechts");
    assert!(!p.app.tab().unwrap().concept);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *origineel);
}
#[test]
fn writer_zoekherkomst_normale_zoek_en_vervangsneltoets_typen_in_het_zoekveld() {
    use iced::keyboard as k;
    for toets in ["f", "h"] {
        let mut p = writer_paginaproef();
        let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
        p.klik(punt);
        let origineel = p.bron();
        p.toets(k::Key::Character(toets.into()), k::Modifiers::COMMAND, None);
        assert!(p.app.zoeken.is_some());
        p.toets(
            k::Key::Character("9".into()),
            k::Modifiers::empty(),
            Some("9"),
        );
        p.selecteer_alles();
        p.toets(k::Key::Character("c".into()), k::Modifiers::COMMAND, None);
        assert_eq!(p.klembord.tekst.as_deref(), Some("9"));
        assert_eq!(*p.bron(), *origineel);
        assert!(!p.app.tab().unwrap().concept);
    }
}
#[test]
fn writer_heropen_negen_paginaklik_volgt_de_getekende_regel() {
    use iced::keyboard::{Key, Modifiers, key::Named};
    let mut p = writer_paginaproef();
    let tekst = "Links 🏠 café rechts";
    let punt = writer_punt(&mut p, tekst, tekst.chars().count());
    p.klik(punt);
    p.named(Named::End);
    p.named(Named::Enter);
    p.bericht(Msg::Opmaak(Opmaak::Vet(true)));
    p.toets(Key::Character("9".into()), Modifiers::empty(), Some("9"));
    let bron = p.bron();
    let mut q = Proef::met_app(app_met_werkdraad(Module::Writer, bron.as_slice()));
    q.klik(iced::Point::new(390., 401.));
    assert!(
        q.app
            .tab()
            .unwrap()
            .writer_focus
            .load(std::sync::atomic::Ordering::Relaxed)
    );
    assert_eq!(q.app.tab().unwrap().editor.text(), "9");
    q.named(Named::Home);
    assert_eq!(q.app.tab().unwrap().editor.text(), "9");
    q.selecteer_alles();
    q.toets(Key::Character("c".into()), Modifiers::COMMAND, None);
    assert_eq!(q.klembord.tekst.as_deref(), Some("9"));
    assert_eq!(*q.bron(), *bron);
    let bewaard =
        include_bytes!("../../../office-core/tests/fixtures/writer-heropen-invoegopmaak.docx");
    let mut q = Proef::met_app(app_met_werkdraad(Module::Writer, bewaard));
    q.klik(iced::Point::new(390., 401.));
    assert!(
        q.app
            .tab()
            .unwrap()
            .writer_focus
            .load(std::sync::atomic::Ordering::Relaxed)
    );
    assert_eq!(q.app.tab().unwrap().editor.text(), "9");
    q.named(Named::Home);
    assert_eq!(q.app.tab().unwrap().editor.text(), "9");
    q.selecteer_alles();
    q.toets(Key::Character("c".into()), Modifiers::COMMAND, None);
    assert_eq!(q.klembord.tekst.as_deref(), Some("9"));
    assert_eq!(q.bron().as_slice(), bewaard.as_slice());
}
#[test]
fn writer_heropen_home_selecteer_kopieer_wachten_op_dezelfde_navigatie() {
    use office_core::writer_navigatie::Richting;
    use text_editor::Action;
    use writer_direct::Bericht as B;
    let bron =
        include_bytes!("../../../office-core/tests/fixtures/writer-heropen-invoegopmaak.docx");
    let mut p = Proef::met_app(app_met_werkdraad(Module::Writer, bron));
    p.klik(iced::Point::new(390., 401.));
    assert_eq!(p.app.tab().unwrap().editor.text(), "9");
    writer_snel(
        &mut p,
        [
            B::Beweeg(Richting::RegelBegin, false),
            B::Invoer(Action::SelectAll),
            B::Klembord(klembord::Actie::Kopieer),
        ],
    );
    assert_eq!(p.app.tab().unwrap().editor.text(), "9");
    assert_eq!(p.klembord.tekst.as_deref(), Some("9"));
    assert_eq!(p.bron().as_slice(), bron.as_slice());
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

fn ruwe_rastertoets(key: iced::keyboard::Key, tekst: Option<&str>) -> iced::Event {
    use iced::keyboard as k;
    iced::Event::Keyboard(k::Event::KeyPressed {
        modified_key: key.clone(),
        key,
        physical_key: k::key::Physical::Unidentified(k::key::NativeCode::Unidentified),
        location: k::Location::Standard,
        modifiers: k::Modifiers::empty(),
        text: tekst.map(Into::into),
        repeat: false,
    })
}
#[test]
fn raster_snelle_pijl_binnen_het_werkvenster_vergt_geen_rasteropdracht() {
    use office_core::rekenblad::Richting;
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    let beeld = p
        .app
        .tab()
        .unwrap()
        .antwoord
        .as_ref()
        .unwrap()
        .beeld
        .afbeelding
        .as_ref()
        .unwrap()
        .as_ptr();
    let taak = p
        .app
        .update(Msg::Raster(raster_ui::Bericht::Verplaats(Richting::Onder)));
    assert!(
        !p.app.tab().unwrap().bezig,
        "Een zichtbare buurcel moet direct bereikbaar zijn"
    );
    assert_eq!(p.app.tab().unwrap().adres, "B3");
    assert_eq!(
        p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .beeld
            .afbeelding
            .as_ref()
            .unwrap()
            .as_ptr(),
        beeld
    );
    assert_eq!(*p.bron(), *bron);
    assert!(!p.app.tab().unwrap().antwoord.as_ref().unwrap().terug);
    p.taak(taak);
}
#[test]
fn raster_snelle_invoerronde_navigeert_typt_en_bevestigt_in_de_nieuwe_cel() {
    use iced::keyboard::{Key, key::Named};
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    // Zoals een vensterronde: alle widgets zien nog dezelfde oude weergave.
    // Pas daarna verwerkt de toepassing de gepubliceerde berichten in volgorde.
    p.gebeurtenissen([
        ruwe_rastertoets(Key::Named(Named::ArrowDown), None),
        ruwe_rastertoets(Key::Character("7".into()), Some("7")),
        ruwe_rastertoets(Key::Character("8".into()), Some("8")),
        ruwe_rastertoets(Key::Named(Named::Enter), None),
    ]);
    assert_eq!(p.app.tab().unwrap().adres, "B4");
    assert!(!p.app.tab().unwrap().concept);
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B2").unwrap().tekst, "3");
    assert_eq!(b.velden.iter().find(|v| v.id == "B3").unwrap().tekst, "78");
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("spreadsheet-snelle-invoer.xlsx"),
            p.bron().as_slice(),
        )
        .unwrap();
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("spreadsheet-snelle-invoer.png"))
            .unwrap();
    }
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn raster_snelle_f2_en_pijl_bewerken_de_nieuwe_cel_in_dezelfde_invoerronde() {
    use iced::keyboard::{Key, key::Named};
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    p.gebeurtenissen([
        ruwe_rastertoets(Key::Named(Named::ArrowDown), None),
        ruwe_rastertoets(Key::Named(Named::F2), None),
        ruwe_rastertoets(Key::Character("7".into()), Some("7")),
        ruwe_rastertoets(Key::Named(Named::ArrowLeft), None),
        ruwe_rastertoets(Key::Character("8".into()), Some("8")),
        ruwe_rastertoets(Key::Named(Named::Enter), None),
    ]);
    assert_eq!(p.app.tab().unwrap().adres, "B4");
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B3").unwrap().tekst, "287");
    assert_eq!(b.velden.iter().find(|v| v.id == "B2").unwrap().tekst, "3");
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}
#[test]
fn raster_snelle_invoerronde_omzeilt_nooit_de_bronbeveiliging() {
    use iced::keyboard::{Key, key::Named};
    let mut p = Proef::met_app(app_met_werkdraad(
        Module::Spreadsheet,
        include_bytes!("../../../office-core/tests/fixtures/spreadsheet-beveiligd.xlsx"),
    ));
    p.cel("B2", false);
    let bron = p.bron();
    p.gebeurtenissen([
        ruwe_rastertoets(Key::Named(Named::ArrowDown), None),
        ruwe_rastertoets(Key::Character("7".into()), Some("7")),
        ruwe_rastertoets(Key::Character("8".into()), Some("8")),
        ruwe_rastertoets(Key::Named(Named::Enter), None),
    ]);
    assert_eq!(p.app.tab().unwrap().adres, "B4");
    assert!(!p.app.tab().unwrap().concept && !p.app.tab().unwrap().raster.bewerken);
    assert_eq!(*p.bron(), *bron);
    assert!(!p.app.tab().unwrap().antwoord.as_ref().unwrap().terug);
}

#[test]
fn raster_late_lokale_focus_neemt_geen_nieuwe_editor_of_dialoog_over() {
    use office_core::rekenblad::Richting;
    for dialoog in [false, true] {
        let mut p = Proef::nieuw();
        p.cel("B2", false);
        let taak = p
            .app
            .update(Msg::Raster(raster_ui::Bericht::Verplaats(Richting::Onder)));
        assert!(!p.app.tab().unwrap().bezig);
        if dialoog {
            p.app.bestand = true;
        } else {
            p.bericht(Msg::Raster(raster_ui::Bericht::Begin {
                id: "B3".into(),
                vervang: Some("7".into()),
                alles: false,
            }));
        }
        let aantal = p.focusoperaties;
        p.taak(taak);
        assert_eq!(
            p.focusoperaties, aantal,
            "Een oude lokale focusactie nam een latere bediening over"
        );
        if !dialoog {
            assert!(p.app.tab().unwrap().raster.bewerken);
            assert_eq!(p.app.tab().unwrap().editor.text(), "7");
        }
    }
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
                if let iced::Event::Mouse(iced::mouse::Event::CursorMoved { position }) = &event {
                    self.muis = *position;
                }
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
    for cel in ["B2", "X2"] {
        for soort in 0..3 {
            let mut p = Proef::nieuw();
            // Binnen het werkvenster is dit nu lokaal; op de rand blijft het
            // een echte werkdraadopdracht. Beide late paden blijven afgedekt.
            p.bericht(Msg::Raster(raster_ui::Bericht::Kies(cel.into())));
            let origineel = p.bron();
            let taak = p.app.update(Msg::Raster(raster_ui::Bericht::Verplaats(
                office_core::rekenblad::Richting::Rechts,
            )));
            assert_eq!(p.app.tab().unwrap().bezig, cel == "X2");
            match soort {
                0 => p.app.instellingen = true,
                1 => p.app.bestand = true,
                _ => p.app.sluiten = p.app.tab().map(|t| t.id),
            }
            let aantal = p.focusoperaties;
            p.taak(taak);
            assert_eq!(
                p.focusoperaties, aantal,
                "Een laat rasterantwoord of lokale taak verlegde de modale focus"
            );
            assert_eq!(p.bron().as_slice(), origineel.as_slice());
        }
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

#[test]
fn raster_asynchrone_grensronde_bewaart_alle_invoer_en_celbevestigingen() {
    use office_core::rekenblad::Richting as R;
    use raster_ui::Bericht as B;
    let mut p = Proef::nieuw();
    let origineel = p.bron();
    p.bericht(Msg::Raster(B::Kies("X2".into())));
    // Geen antwoord of widgetvernieuwing tussen deze gepubliceerde intenties.
    let taken: Vec<_> = [
        B::Pijl {
            richting: R::Rechts,
            selecteer: false,
        },
        B::Typ("7".into()),
        B::Voltooi(R::Onder),
        B::Typ("8".into()),
        B::Voltooi(R::Onder),
    ]
    .into_iter()
    .map(|b| p.app.update(Msg::Raster(b)))
    .collect();
    for taak in taken {
        p.taak(taak);
    }
    assert_eq!(p.app.tab().unwrap().adres, "Y4");
    let mut d = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone()).unwrap();
    let b = d.naar_cel(0, "Y2").unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "Y2").unwrap().tekst, "7");
    assert_eq!(b.velden.iter().find(|v| v.id == "Y3").unwrap().tekst, "8");
    p.bericht(Msg::Terug);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *origineel);
}
#[test]
fn raster_asynchrone_plak_enter_en_opslaan_wachten_op_de_geplakte_bron() {
    use office_core::rekenblad::Richting as R;
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let map = std::env::temp_dir().join(format!(
        "office-raster-plak-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir(&map).unwrap();
    let pad = map.join("Klembord.xlsx");
    std::fs::write(&pad, p.bron().as_slice()).unwrap();
    let id = p.app.tab().unwrap().id;
    {
        let t = p.app.tab_mut().unwrap();
        t.pad = Some(pad.clone());
        t.verwacht = Some(t.antwoord.as_ref().unwrap().hash.clone());
    }
    p.klembord.tekst = Some("7".into());
    let taken = vec![
        p.app.update(Msg::Klembord(klembord::Actie::Plak)),
        p.app
            .update(Msg::Raster(raster_ui::Bericht::Voltooi(R::Onder))),
        p.app.update(Msg::Opslaan(id, false)),
    ];
    for taak in taken {
        p.taak(taak);
    }
    assert_eq!(p.app.tab().unwrap().adres, "B3");
    let opgeslagen = std::fs::read(&pad).unwrap();
    let b = Sessie::open(Module::Spreadsheet, opgeslagen.clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B2").unwrap().tekst, "7");
    assert_eq!(opgeslagen.as_slice(), p.bron().as_slice());
    assert!(!p.app.tab().unwrap().gewijzigd());
    std::fs::remove_dir_all(map).unwrap();
}

#[test]
fn raster_klembord_bereik_kopieer_plak_en_wissen_zijn_geordend_en_bronexact_ongedaan() {
    use raster_ui::Bericht as B;
    let mut p = Proef::nieuw();
    let origineel = p.bron();
    p.bericht(Msg::Adres("B2:D4".into()));
    p.bericht(Msg::GaNaar);
    // Neem echte rasterfocus over zonder de rechthoekselectie te verliezen.
    p.app.tab_mut().unwrap().raster.focus = true;
    let taken = vec![
        p.app.update(Msg::Klembord(klembord::Actie::Kopieer)),
        p.app.update(Msg::Raster(B::Kies("F2".into()))),
        p.app.update(Msg::Klembord(klembord::Actie::Plak)),
    ];
    for taak in taken {
        p.taak(taak);
    }
    assert!(p.klembord.tekst.as_ref().unwrap().contains("37.5"));
    let t = p.app.tab().unwrap();
    assert_eq!(t.adres, "F2:H4");
    assert!(!t.concept && !t.bezig && !t.raster.heeft_werk());
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    for (id, tekst) in [
        ("F2", "3"),
        ("G2", "12.5"),
        ("H2", "37.5"),
        ("H3", "30"),
        ("F4", ""),
        ("H4", "67.5"),
        ("D2", "=B2*C2"),
    ] {
        assert_eq!(b.velden.iter().find(|v| v.id == id).unwrap().tekst, tekst);
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("spreadsheet-klembord-bereik.png"))
            .unwrap();
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("spreadsheet-klembord-ui.xlsx"),
            p.bron().as_slice(),
        )
        .unwrap();
    }
    p.bericht(Msg::Raster(B::Wis));
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert!(
        b.velden
            .iter()
            .filter(
                |v| ["F2", "G2", "H2", "F3", "G3", "H3", "F4", "G4", "H4"].contains(&v.id.as_str())
            )
            .all(|v| v.tekst.is_empty())
    );
    p.bericht(Msg::Terug);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *origineel);
}
#[test]
fn raster_klembord_modale_late_lezing_wacht_en_gaat_nooit_naar_een_ander_document() {
    use raster_ui::Bericht as B;
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    let (_, mut antwoorden) = klembordtaak(
        p.app.update(Msg::Klembord(klembord::Actie::Plak)),
        Some("7"),
    );
    assert_eq!(antwoorden.len(), 1);
    let vervolg = p.app.update(Msg::Raster(B::Voltooi(
        office_core::rekenblad::Richting::Onder,
    )));
    p.taak(vervolg);
    p.bericht(Msg::Bestand(true));
    p.bericht(antwoorden.pop().unwrap());
    assert_eq!(*p.bron(), *bron);
    assert!(p.app.tab().unwrap().raster.heeft_werk());
    p.bericht(Msg::Bestand(false));
    assert_eq!(p.app.tab().unwrap().adres, "B3");
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B2").unwrap().tekst, "7");
    let (_, mut antwoorden) = klembordtaak(
        p.app.update(Msg::Klembord(klembord::Actie::Plak)),
        Some("8"),
    );
    let oud = p.bron();
    p.bericht(Msg::Nieuw(Module::Spreadsheet));
    let tweede = p.bron();
    p.bericht(antwoorden.pop().unwrap());
    assert_eq!(*p.bron(), *tweede);
    assert!(!p.app.tab().unwrap().raster.heeft_werk());
    assert_eq!(*p.app.tabs[0].antwoord.as_ref().unwrap().bron, *oud);
    p.bericht(Msg::Selecteer(0));
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B3").unwrap().tekst, "8");
    assert_eq!(*p.app.tabs[1].antwoord.as_ref().unwrap().bron, *tweede);
}
#[test]
fn raster_klembord_ongeldige_late_formule_bewaart_de_bron_en_hersteltekst() {
    use raster_ui::Bericht as B;
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    let tekst = "7\t8\n9\t=1+";
    p.klembord.tekst = Some(tekst.into());
    let taken = vec![
        p.app.update(Msg::Klembord(klembord::Actie::Plak)),
        p.app.update(Msg::Raster(B::Typ("later".into()))),
        p.app.update(Msg::Opslaan(p.app.tab().unwrap().id, false)),
    ];
    for taak in taken {
        p.taak(taak);
    }
    let t = p.app.tab().unwrap();
    assert!(t.raster.fout);
    assert_eq!(t.raster.wachtend.len(), 2);
    assert_eq!(t.raster.plaktekst.as_deref(), Some(tekst));
    assert!(!t.antwoord.as_ref().unwrap().terug);
    assert_eq!(*p.bron(), *bron);
    p.klembord.tekst = Some("andere tekst".into());
    p.bericht(Msg::Raster(B::HerstelKopie));
    assert_eq!(p.klembord.tekst.as_deref(), Some(tekst));
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("spreadsheet-invoerherstel.png"))
            .unwrap();
    }
    p.bericht(Msg::Terug);
    let t = p.app.tab().unwrap();
    assert!(!t.raster.fout && !t.raster.heeft_werk());
    assert!(t.raster.plaktekst.is_none());
    assert_eq!(*p.bron(), *bron);
}
#[test]
fn raster_klembord_gewijzigd_doel_weigert_laat_antwoord_en_bewaart_wachtende_invoer() {
    use raster_ui::Bericht as B;
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    let (_, mut antwoorden) = klembordtaak(
        p.app.update(Msg::Klembord(klembord::Actie::Plak)),
        Some("7"),
    );
    p.bericht(Msg::Raster(B::Typ("later".into())));
    // Een expliciete adresbalkwijziging is geen relatieve rastertoets.
    p.bericht(Msg::Adres("F2".into()));
    p.bericht(Msg::GaNaar);
    p.bericht(antwoorden.pop().unwrap());
    assert!(p.app.tab().unwrap().raster.fout);
    assert_eq!(p.app.tab().unwrap().raster.wachtend.len(), 1);
    assert_eq!(*p.bron(), *bron);
    p.bericht(Msg::Terug);
    assert!(!p.app.tab().unwrap().raster.heeft_werk());
}
#[test]
fn raster_invoerbuffer_begrenst_grote_plak_en_meldt_afgewezen_opdrachten_blijvend() {
    use raster_ui::Bericht as B;
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    let (_, mut antwoorden) = klembordtaak(
        p.app.update(Msg::Klembord(klembord::Actie::Plak)),
        Some("7"),
    );
    p.bericht(Msg::Raster(B::Typ("x".repeat(4 * 1024 * 1024 + 1))));
    assert_eq!(p.app.tab().unwrap().raster.afgewezen, 1);
    assert!(p.app.tab().unwrap().raster.wachtend.is_empty());
    p.bericht(antwoorden.pop().unwrap());
    assert_eq!(p.app.tab().unwrap().raster.afgewezen, 1);
    assert!(
        p.toegankelijkheid()
            .nodes
            .iter()
            .any(|n| n.node.name.contains("Invoerbuffer vol"))
    );
    p.bericht(Msg::Raster(B::MeldingGelezen));
    assert_eq!(p.app.tab().unwrap().raster.afgewezen, 0);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn raster_bewaren_vanuit_de_sluitvraag_blijft_werken_met_de_invoerwachtrij() {
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    let pad = std::env::temp_dir().join(format!(
        "office-raster-sluiten-{}-{}.xlsx",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::write(&pad, bron.as_slice()).unwrap();
    {
        let t = p.app.tab_mut().unwrap();
        t.pad = Some(pad.clone());
        t.verwacht = Some(t.antwoord.as_ref().unwrap().hash.clone());
    }
    p.klembord.tekst = Some("7".into());
    p.bericht(Msg::Klembord(klembord::Actie::Plak));
    let id = p.app.tab().unwrap().id;
    p.bericht(Msg::Sluit(0));
    assert_eq!(p.app.sluiten, Some(id));
    p.bericht(Msg::SluitKeuze(true));
    assert!(p.app.tabs.is_empty());
    let b = Sessie::open(Module::Spreadsheet, std::fs::read(&pad).unwrap())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B2").unwrap().tekst, "7");
    std::fs::remove_file(pad).unwrap();
}
#[test]
fn raster_oud_muisdoel_na_bronbewerking_wordt_geweigerd_maar_relatieve_invoer_blijft_geordend() {
    use raster_ui::Bericht as B;
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    p.bericht(Msg::Raster(B::Typ("7".into())));
    let taken = vec![
        p.app.update(Msg::Raster(B::Voltooi(
            office_core::rekenblad::Richting::Onder,
        ))),
        p.app.update(Msg::Raster(B::Kies("F2".into()))),
        p.app.update(Msg::Raster(B::Typ("8".into()))),
        p.app.update(Msg::Raster(B::Voltooi(
            office_core::rekenblad::Richting::Onder,
        ))),
    ];
    for taak in taken {
        p.taak(taak);
    }
    assert_eq!(p.app.tab().unwrap().adres, "B4");
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    for (id, tekst) in [("B2", "7"), ("B3", "8"), ("F2", "")] {
        assert_eq!(b.velden.iter().find(|v| v.id == id).unwrap().tekst, tekst);
    }
    p.bericht(Msg::Terug);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn raster_rij_invoegen_na_plakken_blijft_achter_de_klembordbewerking() {
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    p.klembord.tekst = Some("7".into());
    let taken = vec![
        p.app.update(Msg::Klembord(klembord::Actie::Plak)),
        p.app.update(Msg::Structuur(Structuur::RijInvoegen)),
    ];
    for taak in taken {
        p.taak(taak);
    }
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B2").unwrap().tekst, "");
    assert_eq!(b.velden.iter().find(|v| v.id == "B3").unwrap().tekst, "7");
    p.bericht(Msg::Terug);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn raster_invoer_van_de_oude_inline_editor_bewerkt_na_enter_de_volgende_cel() {
    use office_core::rekenblad::Richting as R;
    use raster_ui::Bericht as B;
    use text_editor::{Action as A, Edit as E};
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    p.named(iced::keyboard::key::Named::F2);
    p.selecteer_alles();
    p.plak("7");
    // Deze berichten komen nog uit dezelfde inline-editorwidget, die bij het
    // verzamelen van de toetsen nog niet is verwijderd of opnieuw opgebouwd.
    let taken = vec![
        p.app.update(Msg::Raster(B::Voltooi(R::Onder))),
        p.app
            .update(Msg::Raster(B::Invoer(A::Edit(E::Insert('8'))))),
        p.app.update(Msg::Raster(B::Voltooi(R::Onder))),
    ];
    for taak in taken {
        p.taak(taak);
    }
    assert_eq!(p.app.tab().unwrap().adres, "B4");
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B2").unwrap().tekst, "7");
    assert_eq!(b.velden.iter().find(|v| v.id == "B3").unwrap().tekst, "8");
    p.bericht(Msg::Terug);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}
#[test]
fn raster_zijeditor_bewaart_zijn_eigen_invoer_en_toepassen() {
    use text_editor::{Action as A, Edit as E};
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    p.bericht(Msg::Invoer(A::SelectAll));
    p.bericht(Msg::Invoer(A::Edit(E::Paste(std::sync::Arc::new(
        "7".into(),
    )))));
    p.bericht(Msg::PasToe);
    assert_eq!(p.app.tab().unwrap().adres, "B2");
    assert!(!p.app.tab().unwrap().raster.bewerken);
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B2").unwrap().tekst, "7");
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn raster_toetsen_en_ime_commit_blijven_bewaard_terwijl_editorfocus_nog_onderweg_is() {
    use raster_ui::Bericht as B;
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    let oud = p.app.update(Msg::Raster(B::Typ("7".into())));
    assert!(p.app.tab().unwrap().raster.bewerken);
    // Bouw de nieuwe widgetboom, maar lever de eerste focusoperatie pas af
    // nadat de volgende echte toets en synthetische IME-commit zijn verwerkt.
    p.toets(
        iced::keyboard::Key::Character("8".into()),
        iced::keyboard::Modifiers::empty(),
        Some("8"),
    );
    assert_eq!(p.app.tab().unwrap().editor.text(), "78");
    p.toets(
        iced::keyboard::Key::Character("a".into()),
        iced::keyboard::Modifiers::COMMAND,
        None,
    );
    p.toets(
        iced::keyboard::Key::Character("9".into()),
        iced::keyboard::Modifiers::empty(),
        Some("9"),
    );
    p.gebeurtenis(iced::Event::InputMethod(
        iced::advanced::input_method::Event::Commit("é".into()),
    ));
    assert_eq!(p.app.tab().unwrap().editor.text(), "9é");
    p.named(iced::keyboard::key::Named::Enter);
    let aantal = p.focusoperaties;
    p.taak(oud);
    assert_eq!(p.focusoperaties, aantal);
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B2").unwrap().tekst, "9é");
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn raster_f2_en_selecteer_alles_in_dezelfde_oude_widget_overschrijven_de_cel() {
    use iced::keyboard::{Key, Modifiers, key::Named};
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    let mut alles = ruwe_rastertoets(Key::Character("a".into()), None);
    if let iced::Event::Keyboard(iced::keyboard::Event::KeyPressed { modifiers, .. }) = &mut alles {
        *modifiers = Modifiers::COMMAND;
    }
    p.gebeurtenissen([
        ruwe_rastertoets(Key::Named(Named::F2), None),
        alles,
        ruwe_rastertoets(Key::Character("7".into()), Some("7")),
        ruwe_rastertoets(Key::Named(Named::Enter), None),
    ]);
    assert_eq!(p.app.tab().unwrap().adres, "B3");
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B2").unwrap().tekst, "7");
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

fn rastertoets_met_modifiers(
    key: iced::keyboard::Key,
    modifiers: iced::keyboard::Modifiers,
    tekst: Option<&str>,
) -> iced::Event {
    let mut e = ruwe_rastertoets(key, tekst);
    if let iced::Event::Keyboard(iced::keyboard::Event::KeyPressed { modifiers: m, .. }) = &mut e {
        *m = modifiers;
    }
    e
}
#[test]
fn raster_vervolg_toetsen_geven_hetzelfde_resultaat_voor_en_na_editorfocus() {
    use iced::keyboard::{Key, Modifiers as M, key::Named as N};
    let mut s = Sessie::open(
        Module::Spreadsheet,
        include_bytes!("../../../office-core/tests/fixtures/spreadsheet.xlsx").to_vec(),
    )
    .unwrap();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: "B2".into(),
            tekst: "één twee 🏠".into(),
        },
    )
    .unwrap();
    let bron = s.bron();
    let mut normaal = Vec::new();
    let mut oud = Vec::new();
    for (key, m) in [
        (N::Home, M::empty()),
        (N::End, M::empty()),
        (N::ArrowLeft, M::COMMAND),
        (N::ArrowRight, M::COMMAND),
        (N::Home, M::SHIFT),
        (N::End, M::SHIFT),
        (N::ArrowLeft, M::COMMAND | M::SHIFT),
        (N::Enter, M::ALT),
    ] {
        for snel in [false, true] {
            let mut p = Proef::met_app(app_met_werkdraad(Module::Spreadsheet, bron.as_slice()));
            p.cel("B2", false);
            if snel {
                p.gebeurtenissen([
                    ruwe_rastertoets(Key::Named(N::F2), None),
                    rastertoets_met_modifiers(Key::Named(key), m, None),
                    ruwe_rastertoets(Key::Character("7".into()), Some("7")),
                    ruwe_rastertoets(Key::Named(N::Enter), None),
                ]);
            } else {
                p.named(N::F2);
                p.toets(Key::Named(key), m, None);
                p.toets(Key::Character("7".into()), M::empty(), Some("7"));
                p.named(N::Enter);
            }
            let tekst = p
                .app
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
                .tekst
                .clone();
            if snel {
                oud.push(tekst);
            } else {
                normaal.push(tekst);
            }
        }
    }
    assert_eq!(normaal[0], "7één twee 🏠");
    assert_eq!(normaal[1], "één twee 🏠7");
    assert_eq!(normaal[4], "7");
    assert_eq!(normaal[7], "één twee 🏠\n7");
    assert_eq!(oud, normaal);
}
#[test]
fn raster_vervolg_opmaak_tijdens_een_concept_verliest_geen_typtekst() {
    use iced::keyboard::{Key, Modifiers as M, key::Named as N};
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    p.gebeurtenissen([
        ruwe_rastertoets(Key::Character("7".into()), Some("7")),
        rastertoets_met_modifiers(Key::Character("b".into()), M::COMMAND, None),
        ruwe_rastertoets(Key::Character("8".into()), Some("8")),
        ruwe_rastertoets(Key::Named(N::Enter), None),
    ]);
    let t = p.app.tab().unwrap();
    assert_eq!(
        t.antwoord
            .as_ref()
            .unwrap()
            .beeld
            .velden
            .iter()
            .find(|v| v.id == "B2")
            .unwrap()
            .tekst,
        "78"
    );
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}
#[test]
fn raster_vervolg_typen_na_direct_bewaren_heeft_echte_rasterfocus() {
    use iced::keyboard::{Key, Modifiers as M, key::Named as N};
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    p.named(N::F2);
    p.klembord.tekst = Some("7".into());
    let pad = std::env::temp_dir().join(format!(
        "office-raster-focus-{}-{}.xlsx",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::write(&pad, p.bron().as_slice()).unwrap();
    let id = p.app.tab().unwrap().id;
    {
        let t = p.app.tab_mut().unwrap();
        t.pad = Some(pad.clone());
        t.verwacht = Some(t.antwoord.as_ref().unwrap().hash.clone());
    }
    let taken = vec![
        p.app.update(Msg::Klembord(klembord::Actie::Plak)),
        p.app.update(Msg::Raster(raster_ui::Bericht::Voltooi(
            office_core::rekenblad::Richting::Onder,
        ))),
        p.app.update(Msg::Opslaan(id, false)),
    ];
    for taak in taken {
        p.taak(taak);
    }
    assert_eq!(p.app.tab().unwrap().adres, "B3");
    // Gewone tekentoets na het bewaren, zonder extra klik of focusopdracht.
    p.toets(Key::Character("8".into()), M::empty(), Some("8"));
    assert_eq!(p.app.tab().unwrap().editor.text(), "8");
    assert!(p.app.tab().unwrap().raster.bewerken && p.app.tab().unwrap().concept);
    p.named(N::Escape);
    std::fs::remove_file(pad).unwrap();
}

#[test]
fn raster_aanvullend_meerdere_unicode_tekens_en_altgr_blijven_in_een_oude_widget_behouden() {
    use iced::keyboard::{Key, Modifiers as M, key::Named as N};
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let bron = p.bron();
    p.gebeurtenissen([
        ruwe_rastertoets(Key::Named(N::F2), None),
        rastertoets_met_modifiers(Key::Character("a".into()), M::COMMAND, None),
        ruwe_rastertoets(Key::Character("o\u{308}".into()), Some("o\u{308}")),
        rastertoets_met_modifiers(Key::Character("e".into()), M::CTRL | M::ALT, Some("€")),
        ruwe_rastertoets(Key::Named(N::Enter), None),
    ]);
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(
        b.velden.iter().find(|v| v.id == "B2").unwrap().tekst,
        "o\u{308}€"
    );
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn raster_aanvullend_reeds_gevalideerde_focus_steelt_geen_later_adresveld() {
    use iced::keyboard::{Key, Modifiers as M};
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let t = p.app.tab().unwrap();
    let laat = raster_focus::focus(t.id, t.editerversie, false);
    let bron = p.bron();
    let b = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| n.node.name == "Cel of bereik")
        .unwrap()
        .bounds;
    p.klik(iced::Point::new(b.x + b.width / 2., b.y + b.height / 2.));
    p.selecteer_alles();
    p.toets(Key::Character("9".into()), M::empty(), Some("9"));
    assert_eq!(p.app.tab().unwrap().adres, "9");
    p.taak(laat);
    p.toets(Key::Character("8".into()), M::empty(), Some("8"));
    assert_eq!(p.app.tab().unwrap().adres, "98");
    assert!(!p.app.tab().unwrap().raster.bewerken);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn raster_aanvullend_focus_op_een_verdwenen_doel_laat_de_nieuwe_editor_werken() {
    use iced::keyboard::{Key, Modifiers as M, key::Named as N};
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    let t = p.app.tab().unwrap();
    let laat = raster_focus::focus(t.id, t.editerversie, false);
    p.toets(Key::Character("7".into()), M::empty(), Some("7"));
    assert!(p.app.tab().unwrap().raster.bewerken);
    p.taak(laat);
    p.toets(Key::Character("8".into()), M::empty(), Some("8"));
    assert_eq!(p.app.tab().unwrap().editor.text(), "78");
    p.named(N::Escape);
}

#[test]
fn raster_aanvullend_een_oude_inline_cursoractie_verplaatst_geen_nieuwe_invoer() {
    use iced::keyboard::{Key, Modifiers as M, key::Named as N};
    let mut p = Proef::nieuw();
    p.cel("B2", false);
    p.named(N::F2);
    let t = p.app.tab().unwrap();
    let laat = Msg::Raster(raster_ui::Bericht::MuisInvoer {
        document: t.id,
        cel: t.adres.clone(),
        editerversie: t.editerversie,
        tekstversie: t.raster.tekstversie,
        actie: text_editor::Action::Move(text_editor::Motion::DocumentStart),
    });
    p.named(N::Enter);
    p.toets(Key::Character("7".into()), M::empty(), Some("7"));
    let cursor = p.app.tab().unwrap().editor.cursor();
    p.bericht(laat);
    assert_eq!(p.app.tab().unwrap().editor.cursor(), cursor);
    p.toets(Key::Character("8".into()), M::empty(), Some("8"));
    assert_eq!(p.app.tab().unwrap().adres, "B3");
    assert_eq!(p.app.tab().unwrap().editor.text(), "78");
    p.named(N::Escape);
}

#[test]
fn writer_alineatoets_enter_en_snellen_vervolgtekst_vormen_twee_bronexacte_undo_stappen() {
    use iced::keyboard::{Key, key::Named as N};
    let mut p = writer_paginaproef();
    let origineel = p.bron();
    let aantal = p
        .app
        .tab()
        .unwrap()
        .antwoord
        .as_ref()
        .unwrap()
        .beeld
        .velden
        .len();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    p.gebeurtenissen([
        ruwe_rastertoets(Key::Named(N::Enter), None),
        ruwe_rastertoets(Key::Character("7".into()), Some("7")),
    ]);
    let b = Sessie::open(Module::Writer, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.len(), aantal + 1);
    assert!(b.velden.iter().any(|v| v.tekst == "Links 🏠 "));
    assert!(b.velden.iter().any(|v| v.tekst == "7café rechts"));
    assert_eq!(p.app.tab().unwrap().editor.text(), "7café rechts");
    assert_eq!(
        lint::tekenoffset(
            &p.app.tab().unwrap().editor,
            p.app.tab().unwrap().editor.cursor().position
        ),
        1
    );
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("writer-alinea-invoer.png"))
            .unwrap();
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("writer-alinea-invoer-ui.docx"),
            p.bron().as_slice(),
        )
        .unwrap();
    }
    let klaar = p.bron();
    p.bericht(Msg::Terug);
    assert_eq!(p.app.tab().unwrap().editor.text(), "café rechts");
    assert_eq!(
        lint::tekenoffset(
            &p.app.tab().unwrap().editor,
            p.app.tab().unwrap().editor.cursor().position
        ),
        0
    );
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *origineel);
    assert_eq!(
        lint::tekenoffset(
            &p.app.tab().unwrap().editor,
            p.app.tab().unwrap().editor.cursor().position
        ),
        8
    );
    p.bericht(Msg::Vooruit);
    p.bericht(Msg::Vooruit);
    assert_eq!(*p.bron(), *klaar);
}

fn writer_grenstoetsproef(terug: bool, ingeklapt: bool) {
    use iced::keyboard::key::Named as N;
    {
        let mut p = writer_paginaproef();
        let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
        p.klik(punt);
        p.bericht(Msg::SplitsAlinea);
        let gesplitst = p.bron();
        let punt = writer_punt(
            &mut p,
            if terug { "café rechts" } else { "Links 🏠 " },
            if terug { 0 } else { 8 },
        );
        p.klik(punt);
        if ingeklapt {
            use iced::keyboard::{Key, Modifiers as M};
            p.toets(
                Key::Named(if terug { N::ArrowRight } else { N::ArrowLeft }),
                M::SHIFT,
                None,
            );
            p.toets(
                Key::Named(if terug { N::ArrowLeft } else { N::ArrowRight }),
                M::SHIFT,
                None,
            );
            assert!(
                p.app
                    .tab()
                    .unwrap()
                    .editor
                    .selection()
                    .is_none_or(|s| s.is_empty())
            );
        }
        p.named(if terug { N::Backspace } else { N::Delete });
        let b = Sessie::open(Module::Writer, p.bron().as_ref().clone())
            .unwrap()
            .weergave(0)
            .unwrap();
        assert!(b.velden.iter().any(|v| v.tekst == "Links 🏠 café rechts"));
        assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 café rechts");
        assert_eq!(
            lint::tekenoffset(
                &p.app.tab().unwrap().editor,
                p.app.tab().unwrap().editor.cursor().position
            ),
            8
        );
        p.bericht(Msg::Terug);
        assert_eq!(*p.bron(), *gesplitst);
    }
}

#[test]
fn writer_alineatoets_backspace_voegt_binnen_dezelfde_tekst_samen() {
    writer_grenstoetsproef(true, false);
}
#[test]
fn writer_alineatoets_delete_voegt_binnen_dezelfde_tekst_samen() {
    writer_grenstoetsproef(false, false);
}

#[test]
fn writer_alineatoets_shift_enter_blijft_een_zachte_regelovergang() {
    use iced::keyboard::{Key, Modifiers as M, key::Named as N};
    let mut p = writer_paginaproef();
    let bron = p.bron();
    let aantal = p
        .app
        .tab()
        .unwrap()
        .antwoord
        .as_ref()
        .unwrap()
        .beeld
        .velden
        .len();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    p.toets(Key::Named(N::Enter), M::SHIFT, None);
    let b = Sessie::open(Module::Writer, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.len(), aantal);
    assert!(b.velden.iter().any(|v| v.tekst == "Links 🏠 \ncafé rechts"));
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn writer_alineatoets_selectie_en_splitsen_zijn_een_bewerking_met_selectieherstel() {
    use iced::keyboard::{Key, Modifiers as M, key::Named as N};
    let mut p = writer_paginaproef();
    let bron = p.bron();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    for _ in 0..4 {
        p.toets(Key::Named(N::ArrowRight), M::SHIFT, None);
    }
    assert_eq!(
        p.app.tab().unwrap().editor.selection().as_deref(),
        Some("café")
    );
    p.named(N::Enter);
    let b = Sessie::open(Module::Writer, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert!(b.velden.iter().any(|v| v.tekst == "Links 🏠 "));
    assert!(b.velden.iter().any(|v| v.tekst == " rechts"));
    assert_eq!(p.app.tab().unwrap().editor.text(), " rechts");
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("writer-alinea-selectie.png"))
            .unwrap();
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("writer-alinea-selectie-ui.docx"),
            p.bron().as_slice(),
        )
        .unwrap();
    }
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
    assert_eq!(
        p.app.tab().unwrap().editor.selection().as_deref(),
        Some("café")
    );
}

#[test]
fn writer_alineatoets_op_de_grens_van_tabelcellen_bewaart_de_bron_en_geschiedenis() {
    use iced::keyboard::key::Named as N;
    let mut p = writer_paginaproef();
    let bron = p.bron();
    let punt = writer_punt(&mut p, "Cel één", 0);
    p.klik(punt);
    p.named(N::Backspace);
    assert_eq!(*p.bron(), *bron);
    assert!(!p.app.tab().unwrap().antwoord.as_ref().unwrap().terug);
    let punt = writer_punt(&mut p, "Cel twee", "Cel twee".chars().count());
    p.klik(punt);
    p.named(N::Delete);
    assert_eq!(*p.bron(), *bron);
    assert!(!p.app.tab().unwrap().antwoord.as_ref().unwrap().terug);
}

#[test]
fn writer_alineatoets_ongeimplementeerde_enter_combinaties_splitsen_geen_alinea() {
    use iced::keyboard::{Key, Modifiers as M, key::Named as N};
    for modifiers in [M::COMMAND, M::ALT, M::COMMAND | M::SHIFT] {
        let mut p = writer_paginaproef();
        let bron = p.bron();
        let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
        p.klik(punt);
        p.toets(Key::Named(N::Enter), modifiers, None);
        assert_eq!(*p.bron(), *bron);
        assert!(!p.app.tab().unwrap().antwoord.as_ref().unwrap().terug);
    }
}

#[test]
fn writer_alineatoets_aanvullend_ingeklapte_shift_selectie_voegt_toch_samen() {
    writer_grenstoetsproef(true, true);
    writer_grenstoetsproef(false, true);
}
#[test]
fn writer_alineatoets_aanvullend_typen_in_een_nieuwe_lege_alinea_bewaart_opmaak() {
    use iced::keyboard::{Key, Modifiers as M, key::Named as N};
    let mut p = writer_paginaproef();
    let bron = p.bron();
    let tekst = "Links 🏠 café rechts";
    let lengte = tekst.chars().count();
    let punt = writer_punt(&mut p, tekst, lengte);
    p.klik(punt);
    let t = p.app.tab().unwrap();
    assert_eq!(
        lint::tekenoffset(&t.editor, t.editor.cursor().position),
        lengte
    );
    p.named(N::Enter);
    let t = p.app.tab().unwrap();
    assert_eq!(t.editor.text(), "");
    assert!(t.veld().unwrap().opmaak.cursief);
    assert!(
        t.writer_direct
            .geometrie(t)
            .is_some_and(|m| m.cursor.is_some())
    );
    p.toets(Key::Character("9".into()), M::empty(), Some("9"));
    let t = p.app.tab().unwrap();
    assert_eq!(t.editor.text(), "9");
    assert!(t.veld().unwrap().opmaak.cursief);
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("writer-alinea-leeg-ui.docx"),
            p.bron().as_slice(),
        )
        .unwrap();
    }
    p.bericht(Msg::Terug);
    assert_eq!(p.app.tab().unwrap().editor.text(), "");
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn lege_invoegopmaak_echte_vetknop_op_nieuwe_alinea_bewaart_volgende_unicode_tekst() {
    use iced::keyboard::{Key, Modifiers as M, key::Named as N};
    let mut p = writer_paginaproef();
    let tekst = "Links 🏠 café rechts";
    let punt = writer_punt(&mut p, tekst, tekst.chars().count());
    p.klik(punt);
    p.named(N::Enter);
    let leeg = p.bron();
    let knop = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| n.node.name == "Vet")
        .unwrap();
    assert_eq!(knop.node.state.checked, Some(false));
    assert!(!knop.node.state.disabled);
    p.klik(iced::Point::new(
        knop.bounds.x + knop.bounds.width * 0.5,
        knop.bounds.y + knop.bounds.height * 0.5,
    ));
    assert!(
        p.app.tab().unwrap().opmaak_van_selectie().unwrap().vet,
        "Vet kiezen op de lege alinea is niet toegepast: {}",
        p.app.melding
    );
    assert_eq!(p.app.tab().unwrap().lettertype, "Cambria");
    assert_eq!(p.app.tab().unwrap().grootte, "11");
    let opgemaakt = p.bron();
    assert_ne!(*opgemaakt, *leeg);
    p.toets(Key::Character("9".into()), M::empty(), Some("9"));
    let t = p.app.tab().unwrap();
    assert_eq!(t.editor.text(), "9");
    assert!(t.veld().unwrap().opmaak.vet && t.veld().unwrap().opmaak.cursief);
    let cursor = t.writer_direct.geometrie(t).unwrap().cursor.unwrap();
    assert!(cursor.hoogte > 0.);
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("writer-lege-opmaak-ui.docx"),
            p.bron().as_slice(),
        )
        .unwrap();
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("writer-invoegopmaak-tekst.png"))
            .unwrap();
    }
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *opgemaakt);
    assert_eq!(p.app.tab().unwrap().lettertype, "Cambria");
    assert_eq!(p.app.tab().unwrap().grootte, "11");
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("writer-invoegopmaak-leeg.png"))
            .unwrap();
    }
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *leeg);
}

#[test]
fn lege_invoegopmaak_wachtrij_bewaart_opmaak_en_unicode_vanaf_dezelfde_oude_bron() {
    use iced::keyboard::key::Named as N;
    let mut p = writer_paginaproef();
    let tekst = "Links 🏠 café rechts";
    let punt = writer_punt(&mut p, tekst, tekst.chars().count());
    p.klik(punt);
    p.named(N::Enter);
    let leeg = p.bron();
    writer_snel(
        &mut p,
        [
            writer_direct::Bericht::OpmaakToets('b'),
            writer_direct::Bericht::Invoer(text_editor::Action::Edit(text_editor::Edit::Paste(
                std::sync::Arc::new("café 🏠".into()),
            ))),
        ],
    );
    let t = p.app.tab().unwrap();
    assert_eq!(t.editor.text(), "café 🏠");
    assert!(t.veld().unwrap().opmaak.vet && t.veld().unwrap().opmaak.cursief);
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("writer-lege-opmaak-wachtrij-ui.docx"),
            p.bron().as_slice(),
        )
        .unwrap();
    }
    p.bericht(Msg::Terug);
    assert_eq!(p.app.tab().unwrap().editor.text(), "");
    assert!(p.app.tab().unwrap().veld().unwrap().opmaak.vet);
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *leeg);
}

#[test]
fn lege_invoegopmaak_late_focus_laat_een_later_lettertypeveld_werken() {
    use iced::keyboard::{Key, Modifiers as M};
    let mut p = writer_paginaproef();
    let bron = p.bron();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    let taak = writer_direct::vraag_focus(&p.app, p.app.tab().unwrap().id);
    let veld = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| {
            n.node.name == "Lettertype" && n.node.role == openaec_ui::design::a11y::Role::TextField
        })
        .unwrap()
        .bounds;
    p.klik(iced::Point::new(
        veld.x + veld.width * 0.5,
        veld.y + veld.height * 0.5,
    ));
    assert!(
        !p.app
            .tab()
            .unwrap()
            .writer_focus
            .load(std::sync::atomic::Ordering::Relaxed)
    );
    let oud = p.app.tab().unwrap().lettertype.clone();
    p.taak(taak);
    p.toets(Key::Character("9".into()), M::empty(), Some("9"));
    assert!(
        !p.app
            .tab()
            .unwrap()
            .writer_focus
            .load(std::sync::atomic::Ordering::Relaxed)
    );
    assert_ne!(p.app.tab().unwrap().lettertype, oud);
    assert!(p.app.tab().unwrap().lettertype.contains('9'));
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn lege_invoegopmaak_focus_van_een_ander_document_raakt_de_nieuwe_pagina_niet() {
    let mut p = writer_paginaproef();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    let oud = p.app.tab().unwrap().id;
    let taak = writer_direct::vraag_focus(&p.app, oud);
    p.bericht(Msg::Nieuw(Module::Writer));
    assert_ne!(p.app.tab().unwrap().id, oud);
    let bron = p.bron();
    assert!(
        !p.app
            .tab()
            .unwrap()
            .writer_focus
            .load(std::sync::atomic::Ordering::Relaxed)
    );
    p.taak(taak);
    assert!(
        !p.app
            .tab()
            .unwrap()
            .writer_focus
            .load(std::sync::atomic::Ordering::Relaxed)
    );
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn lege_invoegopmaak_lettervelden_zijn_zichtbaar_voor_de_eerste_letter() {
    use iced::keyboard::key::Named as N;
    let mut p = writer_paginaproef();
    let tekst = "Links 🏠 café rechts";
    let punt = writer_punt(&mut p, tekst, tekst.chars().count());
    p.klik(punt);
    p.named(N::Enter);
    assert_eq!(p.app.tab().unwrap().editor.text(), "");
    assert_eq!(p.app.tab().unwrap().lettertype, "Cambria");
    assert_eq!(p.app.tab().unwrap().grootte, "11");
    p.bericht(Msg::Opmaak(Opmaak::Lettertype("Inter".into())));
    p.bericht(Msg::Opmaak(Opmaak::Lettergrootte(13.5)));
    assert_eq!(p.app.tab().unwrap().lettertype, "Inter");
    assert_eq!(p.app.tab().unwrap().grootte, "13.5");
    assert_eq!(p.app.tab().unwrap().editor.text(), "");
}

#[test]
fn writer_zoekpaneel_late_sluitfocus_laat_een_later_lettertypeveld_werken() {
    use iced::keyboard::{Key, Modifiers};
    use zoeken_ui::Bericht as Z;
    let mut p = writer_paginaproef();
    p.bericht(Msg::Zoeken(Z::Open(false)));
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    let bron = p.bron();
    let taak = p.app.update(Msg::Zoeken(Z::Sluit));
    let veld = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| {
            n.node.name == "Lettertype" && n.node.role == openaec_ui::design::a11y::Role::TextField
        })
        .unwrap()
        .bounds;
    p.klik(iced::Point::new(
        veld.x + veld.width * 0.5,
        veld.y + veld.height * 0.5,
    ));
    let oud = p.app.tab().unwrap().lettertype.clone();
    p.taak(taak);
    p.toets(Key::Character("9".into()), Modifiers::empty(), Some("9"));
    assert_ne!(p.app.tab().unwrap().lettertype, oud);
    assert!(p.app.tab().unwrap().lettertype.contains('9'));
    assert_eq!(*p.bron(), *bron);
}

// Gerichte regressies voor de werkelijk afgekeurde alpha-30-vensterproef.
#[test]
fn raster_beginfocus_nieuw_document_ontvangt_toetsen_zonder_celklik() {
    use iced::keyboard::{Key, Modifiers, key::Named};
    let mut p = Proef::met_app(App::default());
    p.bericht(Msg::Nieuw(Module::Spreadsheet));
    let bron = p.bron();
    p.named(Named::ArrowRight);
    assert_eq!(p.app.tab().unwrap().adres, "B1");
    p.toets(Key::Character("9".into()), Modifiers::empty(), Some("9"));
    p.named(Named::Enter);
    let t = p.app.tab().unwrap();
    assert_eq!(t.adres, "B2");
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B1").unwrap().tekst, "9");
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn raster_beginfocus_geopend_document_ontvangt_toetsen_zonder_celklik() {
    use iced::keyboard::{Key, Modifiers, key::Named};
    let mut p = Proef::met_app(App::default());
    let bytes = include_bytes!("../../../office-core/tests/fixtures/spreadsheet.xlsx").to_vec();
    p.bericht(Msg::Gelezen(
        1,
        PathBuf::from("Eigen.xlsx"),
        Ok(Geopend {
            module: Module::Spreadsheet,
            hash: opslag::hash(&bytes),
            bytes: bytes.clone(),
            archief: None,
        }),
    ));
    let bron = p.bron();
    p.named(Named::ArrowRight);
    assert_eq!(p.app.tab().unwrap().adres, "B1");
    p.toets(Key::Character("9".into()), Modifiers::empty(), Some("9"));
    p.named(Named::Enter);
    assert_eq!(p.app.tab().unwrap().adres, "B2");
    let b = Sessie::open(Module::Spreadsheet, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(b.velden.iter().find(|v| v.id == "B1").unwrap().tekst, "9");
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn raster_beginfocus_lange_rijkop_past_op_een_regel_en_celklik_blijft_juist() {
    use iced::advanced::text::Paragraph as _;
    use iced::keyboard::key::Named;
    let mut p = Proef::met_app(app_met_werkdraad(
        Module::Spreadsheet,
        include_bytes!("../../../office-core/tests/fixtures/spreadsheet-schaars.xlsx"),
    ));
    let bron = p.bron();
    p.cel("A1", false);
    p.named(Named::ArrowDown);
    assert_eq!(p.app.tab().unwrap().adres, "A1000000");
    for zoom in [0.75, 1., 1.5] {
        p.bericht(Msg::Zoom(zoom));
        let kop = p
            .toegankelijkheid()
            .nodes
            .into_iter()
            .find(|n| n.node.name == "Rij 1000000")
            .unwrap()
            .bounds;
        type Paragraaf = <iced_tiny_skia::Renderer as iced::advanced::text::Renderer>::Paragraph;
        let tekst = Paragraaf::with_text(iced::advanced::text::Text {
            content: "1000000",
            bounds: Size::new(f32::INFINITY, f32::INFINITY),
            size: iced::Pixels(11.),
            line_height: iced::advanced::text::LineHeight::Relative(1.),
            font: fonts::BODY,
            align_x: iced::advanced::text::Alignment::Center,
            align_y: iced::alignment::Vertical::Center,
            shaping: iced::advanced::text::Shaping::Basic,
            wrapping: iced::advanced::text::Wrapping::None,
        });
        assert!(
            kop.width >= tekst.min_bounds().width + 8.,
            "De rijkop van {} past niet bij zoom {zoom}: {:?}",
            tekst.min_bounds().width,
            kop
        );
        p.cel("B1000000", false);
        assert_eq!(p.app.tab().unwrap().adres, "B1000000");
        assert_eq!(*p.bron(), *bron);
        if zoom == 1.
            && let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN")
        {
            std::fs::create_dir_all(&map).unwrap();
            p.verbeeld()
                .save_png(PathBuf::from(map).join("spreadsheet-rijkop-lang.png"))
                .unwrap();
        }
    }
}

#[test]
fn raster_beginfocus_late_eerste_focus_laat_later_lettertypeveld_werken() {
    use iced::keyboard::{Key, Modifiers};
    let mut p = Proef::met_app(App::default());
    let bytes = include_bytes!("../../../office-core/tests/fixtures/spreadsheet.xlsx");
    let antwoord = iced::futures::executor::block_on(
        p.app
            .werker
            .clone()
            .voer_uit(1, Opdracht::Open(Module::Spreadsheet, bytes.to_vec())),
    )
    .unwrap();
    p.app.tabs.push(Tab::nieuw(1, "Eigen.xlsx".into()));
    p.app.volgend = 2;
    let taak = p.app.update(Msg::Gereed(1, Ok(antwoord)));
    let bron = p.bron();
    let veld = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| {
            n.node.name == "Lettertype" && n.node.role == openaec_ui::design::a11y::Role::TextField
        })
        .unwrap()
        .bounds;
    p.klik(iced::Point::new(
        veld.x + veld.width * 0.5,
        veld.y + veld.height * 0.5,
    ));
    let oud = p.app.tab().unwrap().lettertype.clone();
    p.taak(taak);
    p.toets(Key::Character("9".into()), Modifiers::empty(), Some("9"));
    assert_ne!(p.app.tab().unwrap().lettertype, oud);
    assert!(p.app.tab().unwrap().lettertype.contains('9'));
    assert_eq!(*p.bron(), *bron);
}

fn linttoets_in_dezelfde_ronde(p: &mut Proef, naam: &str, rol: openaec_ui::design::a11y::Role) {
    use iced::{Event, keyboard as k, mouse};
    let grens = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| n.node.name == naam && n.node.role == rol)
        .unwrap()
        .bounds;
    p.muis = iced::Point::new(grens.x + grens.width * 0.5, grens.y + grens.height * 0.5);
    p.gebeurtenis(Event::Mouse(mouse::Event::CursorMoved { position: p.muis }));
    // Zoals een venster dat meerdere X11-gebeurtenissen vóór de berichtafhandeling ontvangt:
    // laat de echte widgetboom klikken en typen afhandelen vóór alle vervolgtaken.
    p.gebeurtenissen([
        Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
        Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
        Event::Keyboard(k::Event::KeyPressed {
            key: k::Key::Character("9".into()),
            modified_key: k::Key::Character("9".into()),
            physical_key: k::key::Physical::Unidentified(k::key::NativeCode::Unidentified),
            location: k::Location::Standard,
            modifiers: k::Modifiers::empty(),
            text: Some("9".into()),
            repeat: false,
        }),
    ]);
}
#[test]
fn writer_lintfocus_echte_vetklik_en_typen_in_dezelfde_widgetronde_verliezen_geen_toets() {
    use iced::keyboard::key::Named;
    let mut p = writer_paginaproef();
    let tekst = "Links 🏠 café rechts";
    let punt = writer_punt(&mut p, tekst, tekst.chars().count());
    p.klik(punt);
    p.named(Named::End);
    p.named(Named::Enter);
    let leeg = p.bron();
    linttoets_in_dezelfde_ronde(&mut p, "Vet", openaec_ui::design::a11y::Role::ToggleButton);
    let t = p.app.tab().unwrap();
    assert_eq!(t.editor.text(), "9");
    assert!(t.veld().unwrap().opmaak.vet && t.veld().unwrap().opmaak.cursief);
    assert!(!t.concept && !t.bezig);
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("writer-lint-direct-typen.png"))
            .unwrap();
    }
    p.bericht(Msg::Terug);
    assert_eq!(p.app.tab().unwrap().editor.text(), "");
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *leeg);
}
#[test]
fn writer_lintfocus_lettertypeveld_en_typen_in_dezelfde_widgetronde_wijzigen_geen_document() {
    let mut p = writer_paginaproef();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    let bron = p.bron();
    let oud = p.app.tab().unwrap().lettertype.clone();
    linttoets_in_dezelfde_ronde(
        &mut p,
        "Lettertype",
        openaec_ui::design::a11y::Role::TextField,
    );
    assert_ne!(p.app.tab().unwrap().lettertype, oud);
    assert!(p.app.tab().unwrap().lettertype.contains('9'));
    assert_eq!(*p.bron(), *bron);
}

#[test]
fn writer_lintfocus_na_een_opmaakklik_neemt_een_later_lettertypeveld_geen_documenttoets_over() {
    use iced::keyboard::key::Named;
    let mut p = writer_paginaproef();
    let tekst = "Links 🏠 café rechts";
    let punt = writer_punt(&mut p, tekst, tekst.chars().count());
    p.klik(punt);
    p.named(Named::End);
    p.named(Named::Enter);
    linttoets_in_dezelfde_ronde(&mut p, "Vet", openaec_ui::design::a11y::Role::ToggleButton);
    assert_eq!(p.app.tab().unwrap().editor.text(), "9");
    let bron = p.bron();
    let oud = p.app.tab().unwrap().lettertype.clone();
    linttoets_in_dezelfde_ronde(
        &mut p,
        "Lettertype",
        openaec_ui::design::a11y::Role::TextField,
    );
    assert_ne!(p.app.tab().unwrap().lettertype, oud);
    assert!(p.app.tab().unwrap().lettertype.contains('9'));
    assert_eq!(*p.bron(), *bron);
    assert_eq!(p.app.tab().unwrap().editor.text(), "9");
}

impl Proef {
    fn keuzelijst_grens(&mut self) -> iced::Rectangle {
        let mut element = self.app.view();
        self.boom.diff(element.as_widget());
        let node = element.as_widget_mut().layout(
            &mut self.boom,
            &self.renderer,
            &layout::Limits::new(Size::ZERO, Size::new(1440., 900.)),
        );
        let viewport = iced::Rectangle::with_size(Size::new(1440., 900.));
        let mut overlay = element
            .as_widget_mut()
            .overlay(
                &mut self.boom,
                Layout::new(&node),
                &self.renderer,
                &viewport,
                iced::Vector::ZERO,
            )
            .expect("Werkelijk geopende keuzelijst");
        let lijst = overlay
            .as_overlay_mut()
            .layout(&self.renderer, Size::new(1440., 900.));
        fn vind(node: &layout::Node) -> Option<iced::Rectangle> {
            let r = node.bounds();
            if r.width < 500. && r.height < 200. && r.width > 100. && r.height > 30. {
                return Some(r);
            }
            node.children().iter().find_map(vind)
        }
        vind(&lijst).expect("Twee echte zichtbare stijlopties")
    }
    fn keuzelijst_gebeurtenissen(&mut self, events: impl IntoIterator<Item = iced::Event>) {
        let events: Vec<_> = events.into_iter().collect();
        let mut berichten = vec![];
        {
            let maat = Size::new(1440., 900.);
            let viewport = iced::Rectangle::with_size(maat);
            let mut element = self.app.view();
            self.boom.diff(element.as_widget());
            let node = element.as_widget_mut().layout(
                &mut self.boom,
                &self.renderer,
                &layout::Limits::new(Size::ZERO, maat),
            );
            let mut statussen = vec![false; events.len()];
            let mut cursor = iced::mouse::Cursor::Available(self.muis);
            // Zoals iced_runtime::UserInterface: eerst alle gebeurtenissen op
            // de echte overlay, daarna alleen de niet-afgevangen op de basis.
            if let Some(overlay) = element.as_widget_mut().overlay(
                &mut self.boom,
                Layout::new(&node),
                &self.renderer,
                &viewport,
                iced::Vector::ZERO,
            ) {
                let mut overlay = iced::advanced::overlay::Nested::new(overlay);
                let lijst = overlay.layout(&self.renderer, maat);
                for (event, gevangen) in events.iter().zip(&mut statussen) {
                    let mut shell = iced::advanced::Shell::new(&mut berichten);
                    overlay.update(
                        event,
                        Layout::new(&lijst),
                        cursor,
                        &self.renderer,
                        &mut self.klembord,
                        &mut shell,
                    );
                    *gevangen = shell.is_event_captured();
                }
                if overlay.mouse_interaction(Layout::new(&lijst), cursor, &self.renderer)
                    != iced::mouse::Interaction::None
                {
                    cursor = iced::mouse::Cursor::Unavailable;
                }
            }
            for (event, gevangen) in events.iter().zip(statussen) {
                if !gevangen {
                    let mut shell = iced::advanced::Shell::new(&mut berichten);
                    element.as_widget_mut().update(
                        &mut self.boom,
                        event,
                        Layout::new(&node),
                        cursor,
                        &self.renderer,
                        &mut self.klembord,
                        &mut shell,
                        &viewport,
                    );
                }
            }
        }
        for bericht in berichten {
            self.bericht(bericht);
        }
    }
}
fn writer_stijlproef() -> Proef {
    Proef::met_app(app_met_werkdraad(
        Module::Writer,
        include_bytes!("../../../office-core/tests/fixtures/writer-stijlen.docx"),
    ))
}

#[test]
fn writer_lijst_ribbon_en_directe_toets_behouden_selectie_bron_en_undo() {
    use office_core::opmaak::LijstSoort as L;
    use openaec_ui::design::a11y::Role;
    for (naam, soort) in [("Opsomming", L::Opsomming), ("Nummering", L::Nummering)] {
        let mut p = writer_paginaproef();
        let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
        p.klik(punt);
        let origineel = p.bron();
        linttoets_in_dezelfde_ronde(&mut p, naam, Role::ToggleButton);
        let t = p.app.tab().unwrap();
        assert_eq!(t.editor.text(), "Links 🏠 9café rechts");
        let id = t.veld().unwrap().id.clone();
        assert_eq!(
            t.antwoord.as_ref().unwrap().beeld.writer_lijsten[&id].soort,
            soort
        );
        let knop = p
            .toegankelijkheid()
            .nodes
            .into_iter()
            .find(|n| n.node.name == naam && n.node.role == Role::ToggleButton)
            .unwrap();
        assert_eq!(knop.node.state.checked, Some(true));
        if soort == L::Nummering {
            if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
                std::fs::create_dir_all(&map).unwrap();
                std::fs::write(
                    PathBuf::from(map).join("writer-lijsten-lint.docx"),
                    p.bron().as_slice(),
                )
                .unwrap();
            }
            if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
                std::fs::create_dir_all(&map).unwrap();
                p.verbeeld()
                    .save_png(PathBuf::from(map).join("writer-nummering-direct-typen.png"))
                    .unwrap();
            }
        }
        p.bericht(Msg::Terug);
        assert_eq!(p.app.tab().unwrap().editor.text(), "Links 🏠 café rechts");
        assert!(
            p.app
                .tab()
                .unwrap()
                .antwoord
                .as_ref()
                .unwrap()
                .beeld
                .writer_lijsten
                .contains_key(&id)
        );
        p.bericht(Msg::Terug);
        assert_eq!(*p.bron(), *origineel);
    }
}

#[test]
fn writer_lijst_enter_vervolgt_en_een_lege_lijst_eindigt_zonder_extra_alinea() {
    use iced::keyboard::key::Named;
    use openaec_ui::design::a11y::Role;
    let mut p = writer_paginaproef();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    let grens = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| n.node.name == "Nummering" && n.node.role == Role::ToggleButton)
        .unwrap()
        .bounds;
    p.klik(iced::Point::new(grens.center_x(), grens.center_y()));
    let nummer = {
        let t = p.app.tab().unwrap();
        t.antwoord.as_ref().unwrap().beeld.writer_lijsten[&t.veld().unwrap().id].nummer
    };
    p.named(Named::End);
    p.named(Named::Enter);
    let t = p.app.tab().unwrap();
    assert_eq!(t.editor.text(), "");
    let id = t.veld().unwrap().id.clone();
    assert_eq!(
        t.antwoord.as_ref().unwrap().beeld.writer_lijsten[&id].nummer,
        nummer
    );
    let aantal = t.antwoord.as_ref().unwrap().beeld.velden.len();
    let leeg = p.bron();
    p.named(Named::Enter);
    let t = p.app.tab().unwrap();
    assert_eq!(t.antwoord.as_ref().unwrap().beeld.velden.len(), aantal);
    assert_eq!(t.veld().unwrap().id, id);
    assert!(
        !t.antwoord
            .as_ref()
            .unwrap()
            .beeld
            .writer_lijsten
            .contains_key(&id)
    );
    p.bericht(Msg::Terug);
    assert_eq!(*p.bron(), *leeg);
    p.toets(
        iced::keyboard::Key::Character("9".into()),
        iced::keyboard::Modifiers::empty(),
        Some("9"),
    );
    assert_eq!(p.app.tab().unwrap().editor.text(), "9");
    assert_eq!(
        p.app
            .tab()
            .unwrap()
            .antwoord
            .as_ref()
            .unwrap()
            .beeld
            .writer_lijsten[&id]
            .nummer,
        nummer
    );
}
fn open_stijllijst(p: &mut Proef) -> iced::Rectangle {
    let grens = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| {
            n.node.name == "Alineastijl" && n.node.role == openaec_ui::design::a11y::Role::ComboBox
        })
        .unwrap()
        .bounds;
    p.klik(iced::Point::new(grens.center_x(), grens.center_y()));
    p.keuzelijst_grens()
}
#[test]
fn alineastijl_echte_keuze_en_directe_toets_behouden_cursor_runs_en_bronexacte_undo() {
    use iced::{Event, keyboard as k, mouse};
    let mut p = writer_stijlproef();
    let tekst = "Links 🏠 café rechts";
    let punt = writer_punt(&mut p, tekst, 8);
    p.klik(punt);
    let origineel = p.bron();
    let lijst = open_stijllijst(&mut p);
    p.muis = iced::Point::new(lijst.center_x(), lijst.y + lijst.height * 0.75);
    p.keuzelijst_gebeurtenissen([
        Event::Mouse(mouse::Event::CursorMoved { position: p.muis }),
        Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
        Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
        Event::Keyboard(k::Event::KeyPressed {
            key: k::Key::Character("9".into()),
            modified_key: k::Key::Character("9".into()),
            physical_key: k::key::Physical::Unidentified(k::key::NativeCode::Unidentified),
            location: k::Location::Standard,
            modifiers: k::Modifiers::empty(),
            text: Some("9".into()),
            repeat: false,
        }),
    ]);
    let b = Sessie::open(Module::Writer, p.bron().as_ref().clone())
        .unwrap()
        .weergave(0)
        .unwrap();
    let v = b
        .velden
        .iter()
        .find(|v| v.tekst == "Links 🏠 9café rechts")
        .unwrap();
    assert_eq!(
        b.writer_stijlen.huidig.get(&v.id).map(String::as_str),
        Some("EigenKop")
    );
    assert_eq!(v.opmaak.grootte, Some(20.));
    assert!(
        p.app
            .tab()
            .unwrap()
            .writer_focus
            .load(std::sync::atomic::Ordering::Relaxed)
    );
    assert_eq!(
        lint::tekenoffset(
            &p.app.tab().unwrap().editor,
            p.app.tab().unwrap().editor.cursor().position
        ),
        9
    );
    let n = p
        .toegankelijkheid()
        .nodes
        .into_iter()
        .find(|n| n.node.name == "Alineastijl")
        .unwrap();
    assert_eq!(n.node.value.as_deref(), Some("Kop 1"));
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            PathBuf::from(map).join("writer-alineastijl-lint.docx"),
            p.bron().as_slice(),
        )
        .unwrap();
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_SCHERMEN") {
        std::fs::create_dir_all(&map).unwrap();
        p.verbeeld()
            .save_png(PathBuf::from(map).join("writer-alineastijl-lint.png"))
            .unwrap();
    }
    p.bericht(Msg::Terug);
    assert_eq!(p.app.tab().unwrap().editor.text(), tekst);
    let na_stijl = p.bron();
    assert_ne!(na_stijl.as_slice(), origineel.as_slice());
    p.bericht(Msg::Terug);
    assert_eq!(p.bron().as_slice(), origineel.as_slice());
    p.bericht(Msg::Vooruit);
    assert_eq!(p.bron().as_slice(), na_stijl.as_slice());
}
#[test]
fn alineastijl_open_lijst_typen_en_annuleren_wijzigen_de_bron_niet() {
    use iced::{Event, keyboard as k, mouse};
    let mut p = writer_stijlproef();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    let bron = p.bron();
    open_stijllijst(&mut p);
    p.keuzelijst_gebeurtenissen([Event::Keyboard(k::Event::KeyPressed {
        key: k::Key::Character("9".into()),
        modified_key: k::Key::Character("9".into()),
        physical_key: k::key::Physical::Unidentified(k::key::NativeCode::Unidentified),
        location: k::Location::Standard,
        modifiers: k::Modifiers::empty(),
        text: Some("9".into()),
        repeat: false,
    })]);
    assert_eq!(p.bron().as_slice(), bron.as_slice());
    p.muis = iced::Point::new(1100., 170.);
    p.keuzelijst_gebeurtenissen([
        Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
        Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
    ]);
    assert_eq!(p.bron().as_slice(), bron.as_slice());
    assert!(!p.app.tab().unwrap().antwoord.as_ref().unwrap().terug);
}
#[test]
fn alineastijl_verouderde_keuze_mag_geen_nieuwe_tab_of_andere_alinea_raken() {
    let mut p = writer_stijlproef();
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    let t = p.app.tab().unwrap();
    let a = t.antwoord.as_ref().unwrap();
    let m = Msg::Alineastijl {
        document: t.id,
        hash: a.hash.clone(),
        alinea: t.veld().unwrap().id.clone(),
        stijl: "EigenKop".into(),
    };
    let bron = p.bron();
    p.bericht(Msg::Veld(0));
    p.bericht(m.clone());
    assert_eq!(p.bron().as_slice(), bron.as_slice());
    let punt = writer_punt(&mut p, "Links 🏠 café rechts", 8);
    p.klik(punt);
    p.toets(
        iced::keyboard::Key::Character("é".into()),
        iced::keyboard::Modifiers::empty(),
        Some("é"),
    );
    let gewijzigd = p.bron();
    assert_ne!(gewijzigd.as_slice(), bron.as_slice());
    p.bericht(m.clone());
    assert_eq!(p.bron().as_slice(), gewijzigd.as_slice());
    p.bericht(Msg::Nieuw(Module::Writer));
    let nieuw = p.bron();
    p.bericht(m);
    assert_eq!(p.bron().as_slice(), nieuw.as_slice());
}

#[test]
fn alineastijl_enter_en_spatie_in_dezelfde_lijstronde_komen_op_de_pagina() {
    use iced::{Event, keyboard as k, mouse};
    for enter in [true, false] {
        let mut p = writer_stijlproef();
        let tekst = "Links 🏠 café rechts";
        let punt = writer_punt(&mut p, tekst, tekst.chars().count());
        p.klik(punt);
        p.named(k::key::Named::End);
        p.named(k::key::Named::Enter);
        let gesplitst = p.bron();
        let lijst = open_stijllijst(&mut p);
        p.muis = iced::Point::new(lijst.center_x(), lijst.y + lijst.height * 0.75);
        let toets = |key: k::Key, text| {
            Event::Keyboard(k::Event::KeyPressed {
                modified_key: key.clone(),
                key,
                physical_key: k::key::Physical::Unidentified(k::key::NativeCode::Unidentified),
                location: k::Location::Standard,
                modifiers: k::Modifiers::empty(),
                text,
                repeat: false,
            })
        };
        p.keuzelijst_gebeurtenissen([
            Event::Mouse(mouse::Event::CursorMoved { position: p.muis }),
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)),
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)),
            toets(
                k::Key::Named(if enter {
                    k::key::Named::Enter
                } else {
                    k::key::Named::Space
                }),
                if enter { None } else { Some(" ".into()) },
            ),
            toets(k::Key::Character("9".into()), Some("9".into())),
        ]);
        let b = Sessie::open(Module::Writer, p.bron().as_ref().clone())
            .unwrap()
            .weergave(0)
            .unwrap();
        let plek = b.velden.iter().position(|v| v.tekst == tekst).unwrap();
        let laatste = if enter { plek + 2 } else { plek + 1 };
        if enter {
            assert_eq!(b.velden[plek + 1].tekst, "");
        }
        assert_eq!(b.velden[laatste].tekst, if enter { "9" } else { " 9" });
        for v in &b.velden[plek + 1..=laatste] {
            assert_eq!(
                b.writer_stijlen.huidig.get(&v.id).map(String::as_str),
                Some("EigenKop")
            );
            assert_eq!(v.opmaak.grootte, Some(20.));
        }
        if enter {
            p.bericht(Msg::Terug);
        }
        p.bericht(Msg::Terug);
        p.bericht(Msg::Terug);
        assert_eq!(p.bron().as_slice(), gesplitst.as_slice());
    }
}
