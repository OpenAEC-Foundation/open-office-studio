mod gereedschap;
use dioxus::prelude::*;
use office_core::document::{Bewerking, Module};
use open_office_studio_webview::{STIJL, model::Werkruimte, scherm::Scherm};

fn proef() -> Element {
    let werk = use_signal(|| {
        let mut w = Werkruimte::default();
        gereedschap::opdracht(&mut w, |w| w.nieuw(Module::Notition)).unwrap();
        let t = w.tab().unwrap();
        let doel = t.doel();
        let id = t.beeld.velden[0].id.clone();
        gereedschap::opdracht(&mut w, |w| {
            w.bewerk(
                doel,
                Bewerking::Tekst {
                    id,
                    tekst: "<script>onveilig()</script> & eigen notitie 🏠".into(),
                },
            )
        })
        .unwrap();
        w
    });
    rsx! { Scherm { werk } }
}

#[test]
fn webview_rust_dom_heeft_oorspronkelijke_schil_en_escape_documenttekst() {
    let mut dom = VirtualDom::new(proef);
    dom.rebuild_in_place();
    let html = dioxus_ssr::render(&dom);
    for klasse in [
        "office-titelbalk",
        "office-snelletoegang",
        "office-tabbalk",
        "office-lintvlak",
        "ribbon-tabs",
        "notities-werkruimte",
        "notities-boeken",
        "notities-paginas",
        "notities-paginatitel",
        "notities-markdown",
    ] {
        assert!(html.contains(klasse), "{klasse}");
    }
    assert!(html.contains("&#60;script&#62;onveilig()&#60;/script&#62;"));
    assert!(!html.contains("<script>onveilig()"));
    assert!(html.contains("aria-label=\"Paginatitel\""));
    assert!(html.contains("aria-label=\"Markdown-bron\""));
    assert!(html.contains("data-office-thema=\"light\""));
    assert!(!html.contains("<iframe"));
}

#[test]
fn webview_stijl_is_offline_en_bevat_de_oorspronkelijke_css() {
    assert!(STIJL.contains(include_str!("../../../../src/titelbalk.css")));
    assert!(STIJL.contains(include_str!("../../../../src/tabbalk.css")));
    assert!(STIJL.contains(include_str!("../../../../src/notities/canvas.css")));
    assert_eq!(STIJL.matches("data:font/woff2;base64,").count(), 34);
    assert!(!STIJL.contains("@import"));
    assert!(!STIJL.contains("http://"));
    assert!(!STIJL.contains("https://"));
}

fn modale_proef() -> Element {
    let werk = use_signal(|| {
        let mut w = Werkruimte::default();
        w.venster_sluiten = true;
        w
    });
    rsx! { Scherm { werk } }
}

#[test]
fn webview_clientmutaties_laten_inert_weg_buiten_een_dialoog() {
    use dioxus::core::{AttributeValue, Mutation, Mutations};
    // SSR weet dat inert een boolean is, maar de gepinde desktopinterpreter
    // zet false als aanwezig attribuut. Controleer daarom de echte mutaties.
    for (component, modaal) in [(proef as fn() -> Element, false), (modale_proef, true)] {
        let mut dom = VirtualDom::new(component);
        let mut mutaties = Mutations::default();
        dom.rebuild(&mut mutaties);
        let mut aanwezig = false;
        for mutatie in &mutaties.edits {
            if let Mutation::SetAttribute {
                name: "inert",
                value,
                ..
            } = mutatie
            {
                assert!(
                    !matches!(value, AttributeValue::Bool(false)),
                    "inert=false blokkeert de desktopinterface"
                );
                aanwezig |= !matches!(value, AttributeValue::None);
            }
        }
        assert_eq!(aanwezig, modaal);
    }
}

#[test]
fn webview_tekstinvoer_overschrijft_geen_nieuwere_browserwaarde() {
    use dioxus::core::{AttributeValue, Mutation, Mutations};
    let mut dom = VirtualDom::new(proef);
    let mut mutaties = Mutations::default();
    dom.rebuild(&mut mutaties);
    let mut titel = false;
    for mutatie in &mutaties.edits {
        if let Mutation::SetAttribute {
            name,
            value: AttributeValue::Text(tekst),
            ..
        } = mutatie
            && tekst.contains("onveilig()")
        {
            assert_eq!(
                *name, "initial_value",
                "Documenttekst mag geen levende invoer terugzetten"
            );
            titel = true;
        }
    }
    assert!(
        titel,
        "De echte clientmutaties moeten de begintitel bevatten"
    );
}
