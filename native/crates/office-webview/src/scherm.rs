//! De klassen en elementvolgorde volgen de bestaande Office-componenten.
use crate::{
    STIJL, iconen as i,
    model::{Doel, Werkruimte},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use dioxus::prelude::*;
use office_core::{
    document::{Bewerking, Module, Resultaat},
    notities::NotitieActie as N,
};

fn voer(mut werk: Signal<Werkruimte>, f: impl FnOnce(&mut Werkruimte) -> Resultaat<()>) {
    let mut w = werk.write();
    let r = f(&mut w);
    w.meld(r);
}
fn nieuw(mut werk: Signal<Werkruimte>, module: Module) {
    let mut w = werk.write();
    let r = w.nieuw(module).map(|_| ());
    w.meld(r);
}
fn notitie(werk: Signal<Werkruimte>, doel: Doel, actie: N) {
    voer(werk, |w| w.bewerk(doel, Bewerking::Notitie(actie)));
}

pub fn openen(werk: Signal<Werkruimte>) {
    #[cfg(feature = "desktop")]
    spawn(async move {
        if let Some(bestand) = rfd::AsyncFileDialog::new()
            .add_filter(
                "Office-documenten",
                &["docx", "xlsx", "pptx", "json", "openaec-notities", "eml"],
            )
            .pick_file()
            .await
        {
            voer(werk, |w| w.open(bestand.path()).map(|_| ()));
        }
    });
    #[cfg(not(feature = "desktop"))]
    {
        voer(werk, |w| {
            w.melding = "Bestandsdialoog is alleen beschikbaar in de desktopapp".into();
            Ok(())
        });
    }
}
pub fn bewaren(werk: Signal<Werkruimte>, doel: Doel, als: bool) {
    let heeft_pad = werk
        .read()
        .tabbladen
        .iter()
        .find(|t| t.doel() == doel)
        .is_some_and(|t| t.pad.is_some());
    if heeft_pad && !als {
        bewaar_pad(werk, doel, None);
        return;
    }
    #[cfg(feature = "desktop")]
    {
        let naam = werk
            .read()
            .tabbladen
            .iter()
            .find(|t| t.doel() == doel)
            .map(|t| t.naam.clone())
            .unwrap_or_default();
        spawn(async move {
            if let Some(bestand) = rfd::AsyncFileDialog::new()
                .set_file_name(naam)
                .save_file()
                .await
            {
                // Een eerder gekozen bestaand document wordt hier niet stil overschreven.
                bewaar_pad(werk, doel, Some(bestand.path().to_path_buf()));
            }
        });
    }
    #[cfg(not(feature = "desktop"))]
    {
        voer(werk, |w| {
            w.melding = "Bestandsdialoog is alleen beschikbaar in de desktopapp".into();
            Ok(())
        });
    }
}

fn bewaar_pad(mut werk: Signal<Werkruimte>, doel: Doel, pad: Option<std::path::PathBuf>) {
    let taak = {
        let mut w = werk.write();
        match w.voorbereid_bewaren(doel, pad.as_deref()) {
            Ok(taak) => taak,
            Err(fout) => {
                w.meld(Err(fout));
                return;
            }
        }
    };
    // De bewaarkopie is vastgelegd; de UI-borrow eindigt vóór de await.
    // Het lint of bestandsmenu mag verdwijnen terwijl de bevestiging wacht.
    dioxus::core::spawn_forever(async move {
        let antwoord = taak.uitvoeren().await;
        let mut w = werk.write();
        let resultaat = w.voltooi_bewaren(antwoord).map(|_| ());
        w.meld(resultaat);
    });
}

#[component]
fn Icoon(bron: &'static str, maat: u32) -> Element {
    // Alleen gecontroleerde, vaste SVG-bron; documenttekst wordt nooit HTML.
    let svg = bron
        .replace("width=\"14\"", &format!("width=\"{maat}\""))
        .replace("height=\"14\"", &format!("height=\"{maat}\""));
    rsx! { span { style: "display:contents", "aria-hidden": "true", dangerous_inner_html: svg } }
}

#[component]
fn Huisstijl() -> Element {
    // De grote ingebedde letterstijl hoeft niet bij elke invoer opnieuw te worden opgebouwd.
    rsx! { style { "{STIJL}" } }
}

#[component]
pub fn Scherm(mut werk: Signal<Werkruimte>) -> Element {
    let mut sluiten = use_signal(|| None::<u64>);
    let (actief, doel, naam, donker, bestand, tabs, melding) = {
        let w = werk.read();
        (
            w.actief,
            w.tab().map(|t| t.doel()),
            w.tab()
                .map(|t| t.venstertitel())
                .unwrap_or_else(|| "Open Office Studio".into()),
            w.donker,
            w.bestand,
            w.tabbladen
                .iter()
                .map(|t| {
                    (
                        t.id,
                        t.tabnaam().to_string(),
                        t.gewijzigd(),
                        t.sessie.module,
                    )
                })
                .collect::<Vec<_>>(),
            w.melding.clone(),
        )
    };
    let sleutel = doel.map(Doel::sleutel).unwrap_or_default();
    let sluit_venster = werk.read().venster_sluiten;
    let modaal = sluiten().is_some() || sluit_venster;
    let merk = format!(
        "data:image/svg+xml;base64,{}",
        STANDARD.encode(include_bytes!("../../../../src/stijl/openaec-symbol.svg"))
    );
    rsx! {
        Huisstijl {}
        div { class: "office", tabindex: "-1", "data-office-thema": if donker { "forge" } else { "light" },
            onkeydown: move |e| {
                if e.key() == Key::Escape { werk.write().bestand = false; sluiten.set(None); werk.write().venster_sluiten = false; }
            },
            // De desktopinterpreter van Dioxus 0.7.10 behandelt inert nog niet
            // als boolean. Bij false moet het attribuut volledig ontbreken.
            div { style: "display:contents", inert: if modaal { Some("") } else { None },
            header { class: "office-titelbalk",
                div { class: "office-titelbalk-links",
                    button { class: "office-titelbalk-merk", title: "Naar Start", "aria-label": "Open Office Studio", onclick: move |_| werk.write().kies(None), img { src: merk, alt: "" } }
                    div { class: "office-snelletoegang", role: "toolbar", "aria-label": "Snelle toegang",
                        button { class: "office-snelknop", title: "Opslaan", "aria-label": "Opslaan", disabled: doel.is_none(), onclick: move |_| { if let Some(d) = doel { bewaren(werk,d,false); } }, Icoon { bron: i::OPSLAAN, maat: 16 } }
                        button { class: "office-snelknop", title: "Openen", "aria-label": "Openen", onclick: move |_| openen(werk), Icoon { bron: i::OPENEN, maat: 16 } }
                        button { class: "office-snelknop", title: "Opslaan als", "aria-label": "Opslaan als", disabled: doel.is_none(), onclick: move |_| { if let Some(d) = doel { bewaren(werk,d,true); } }, Icoon { bron: i::OPSLAAN_ALS, maat: 16 } }
                    }
                }
                div { class: "office-titelbalk-titel", "{naam}" }
                div { class: "office-titelbalk-rechts",
                    button { class: "office-iconknop", title: "Thema wisselen", "aria-label": "Thema wisselen", onclick: move |_| werk.write().donker = !donker, Icoon { bron: if donker { i::ZON } else { i::MAAN }, maat: 16 } }
                }
            }
            if let Some(d) = doel {
                if !bestand { div { class: "office-lintvlak", Lint { werk, doel: d } } }
            }
            div { class: "office-tabbalk", role: "tablist", "aria-label": "Documenten",
                div { class: if actief.is_none() { "office-tab office-starttab is-actief" } else { "office-tab office-starttab" }, role: "tab", tabindex: "0", "aria-selected": actief.is_none(), onclick: move |_| werk.write().kies(None), Icoon { bron: i::HUIS, maat: 14 } "Start" }
                div { class: "office-tablijst",
                    for (id,titel,vuil,module) in tabs {
                        div { key: "{id}", class: if actief == Some(id) { "office-tab is-actief" } else { "office-tab" }, role: "tab", tabindex: "0", "aria-selected": actief == Some(id), onclick: move |_| werk.write().kies(Some(id)),
                            Icoon { bron: module_icoon(module), maat: 14 }
                            span { class: "office-tabnaam", "{titel}" if vuil { " •" } }
                            button { class: "office-tabsluiten", title: "Sluiten", "aria-label": "Sluiten {titel}", onclick: move |e| {
                                e.stop_propagation();
                                if werk.read().tabbladen.iter().any(|t| t.id == id && t.gewijzigd()) { sluiten.set(Some(id)); }
                                else { voer(werk, |w| w.sluit(id,false)); }
                            }, Icoon { bron: i::SLUITEN, maat: 13 } }
                        }
                    }
                }
                button { class: "office-tabknop", "aria-label": "Nieuw document", title: "Nieuw document", onclick: move |_| werk.write().kies(None), Icoon { bron: i::TOEVOEGEN, maat: 15 } }
            }
            if !melding.is_empty() { div { role: "alert", class: "notities-melding is-fout", "{melding}", button { "aria-label": "Melding sluiten", onclick: move |_| werk.write().melding.clear(), "×" } } }
            div { class: "office-werkvlak",
                if actief.is_none() || bestand {
                    div { class: "office-tabpaneel office-backstage", Start { werk, terug: actief.is_some() } }
                } else if let Some(d) = doel {
                    div { class: "office-tabpaneel",
                        if werk.read().tab().is_some_and(|t| t.sessie.module == Module::Notition) { Notities { key: "{sleutel}", werk, doel: d } }
                        else { Document { key: "{sleutel}", werk, doel: d } }
                    }
                }
            }
            footer { class: "office-statusbalk", role: "status",
                span { "Lokaal" }
                span { class: "office-statusrechts", "Rust WebView · {office_core::VERSIE}" }
            }
            }
            if modaal {
                div { class: "office-dialoogachtergrond",
                    div { class: "office-dialoog", role: "alertdialog", "aria-modal": "true", "aria-label": "Niet opgeslagen wijzigingen",
                        h2 { "Wijzigingen bewaren?" } p { "Dit document bevat wijzigingen die nog niet zijn opgeslagen." }
                        div { class: "office-dialoogacties",
                            button { autofocus: true, onmounted: move |e| async move { let _ = e.data().set_focus(true).await; }, onclick: move |_| { sluiten.set(None); werk.write().venster_sluiten = false; }, "Annuleren" }
                            button { onclick: move |_| { if sluit_venster {
                                    let ids=werk.read().tabbladen.iter().map(|t|t.id).collect::<Vec<_>>();
                                    for id in ids { voer(werk,|w|w.sluit(id,true)); }
                                    werk.write().venster_sluiten=false;
                                    #[cfg(feature="desktop")] {
                                        let venster = dioxus::desktop::window();
                                        venster.set_close_behavior(dioxus::desktop::WindowCloseBehaviour::WindowCloses);
                                        venster.close();
                                    }
                                } else if let Some(id)=sluiten() { voer(werk, |w| w.sluit(id,true)); }
                                sluiten.set(None); }, "Verwerpen" }
                        }
                    }
                }
            }
        }
    }
}

fn module_icoon(module: Module) -> &'static str {
    match module {
        Module::Writer => i::DOCUMENT,
        Module::Spreadsheet => i::REKENBLAD,
        Module::Presentation => i::PRESENTATIE,
        Module::Notition => i::NOTITIES,
        Module::Email => i::EMAIL,
    }
}

#[component]
fn Start(mut werk: Signal<Werkruimte>, terug: bool) -> Element {
    rsx! {
        div { class: "office-start",
            aside { class: "start-navigatie",
                if terug { button { class: "start-terug", onmounted: move |e| async move { let _ = e.data().set_focus(true).await; }, onclick: move |_| werk.write().bestand = false, "← Terug naar werkruimte" } }
                div { class: "start-navgroep",
                    span { class: "start-label", "WERKRUIMTE" }
                    button { class: "geselecteerd", Icoon { bron: i::HUIS, maat: 18 } "Start" }
                    button { onclick: move |_| openen(werk), Icoon { bron: i::OPENEN, maat: 18 } "Openen" }
                    if let Some(d) = werk.read().tab().map(|t| t.doel()) { button { onclick: move |_| bewaren(werk,d,false), Icoon { bron: i::OPSLAAN, maat: 18 } "Opslaan" } }
                }
                div { class: "start-navgroep",
                    span { class: "start-label", "NIEUW BESTAND" }
                    for (module,label) in [(Module::Writer,"Tekst"),(Module::Spreadsheet,"Rekenblad"),(Module::Presentation,"Presentatie"),(Module::Notition,"Notities"),(Module::Email,"E-mail")] {
                        button { onclick: move |_| nieuw(werk,module), Icoon { bron: module_icoon(module), maat: 18 } span { "{label}" } Icoon { bron: i::TOEVOEGEN, maat: 13 } }
                    }
                }
                div { class: "start-navonder", span { class: "start-openaec", "OpenAEC Foundation" } }
            }
            main { class: "start-inhoud",
                div { class: "start-kop", div { span { class: "start-welkom", span {} "JOUW OPEN WERKRUIMTE" } h1 { {if terug { "Bestand" } else { "Welkom in je werkruimte" }} } p { "Documenten, rekenbladen, presentaties en notities. Lokaal, open en van jou." } }
                    button { class: "office-knop office-primair", onclick: move |_| openen(werk), Icoon { bron: i::OPENEN, maat: 17 } "Bestand openen" kbd { "Ctrl+O" } }
                }
                section { class: "start-nieuw", div { class: "start-sectiekop", h2 { "Nieuw bestand" } span { "Begin met een leeg document" } }
                    div { class: "start-sjablonen",
                        for (module,label) in [(Module::Writer,"Leeg document"),(Module::Spreadsheet,"Leeg rekenblad"),(Module::Presentation,"Lege presentatie")] {
                            button { class: "start-sjabloon module-{module.extensie()}", onclick: move |_| nieuw(werk,module),
                                div { class: "start-voorbeeld voorbeeld-{module.extensie()}", span { class: "voorbeeld-app", "{module.naam()}" } div { class: "voorbeeld-papier", div {} i {} i {} i {} i {} span {} } span { class: "voorbeeld-plus", Icoon { bron: i::TOEVOEGEN, maat: 18 } } }
                                div { class: "sjabloon-details", span { class: "module-icoon", Icoon { bron: module_icoon(module), maat: 19 } } div { strong { "{label}" } small { "{module.naam()}" } } }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn Lint(mut werk: Signal<Werkruimte>, doel: Doel) -> Element {
    let (terug, vooruit, notities, markdown) = {
        let w = werk.read();
        let t = w.tab().unwrap();
        (
            t.sessie.kan_terug(),
            t.sessie.kan_vooruit(),
            t.sessie.module == Module::Notition,
            t.beeld.notitie.as_ref().is_some_and(|p| p.markdown),
        )
    };
    rsx! {
        div { class: "ribbon",
            div { class: "ribbon-tabs",
                button { class: "ribbon-bestand", onclick: move |_| werk.write().bestand = true, "Bestand" }
                div { class: "ribbon-tabknoppen", role: "tablist", "aria-label": "Lint", button { role: "tab", "aria-selected": "true", "Start" } }
            }
            div { class: "ribbon-inhoud", role: "tabpanel",
                div { class: "ribbon-baan",
                    div { class: "ribbon-groep notities-historie", "data-niveau": "0", div { class: "ribbon-groep-inhoud",
                        button { class: "ribbon-actie", disabled: !terug, onclick: move |_| voer(werk, |w| w.historie(doel,false)), "↶" span { "Ongedaan maken" } }
                        button { class: "ribbon-actie", disabled: !vooruit, onclick: move |_| voer(werk, |w| w.historie(doel,true)), "↷" span { "Opnieuw" } }
                    } span { class: "ribbon-groep-naam", "Geschiedenis" } }
                    if notities {
                        div { class: "ribbon-groep", "data-niveau": "0", div { class: "ribbon-groep-inhoud",
                            button { class: "ribbon-actie ribbon-groot", onclick: move |_| notitie(werk,doel,N::NieuwePagina), Icoon { bron: i::DOCUMENT, maat: 25 } span { "Nieuwe pagina" } }
                            button { class: "ribbon-actie ribbon-groot", onclick: move |_| notitie(werk,doel,N::NieuweSectie { markdown: false }), Icoon { bron: i::TOEVOEGEN, maat: 25 } span { "Nieuwe sectie" } }
                            button { class: "ribbon-actie ribbon-groot", onclick: move |_| notitie(werk,doel,N::NieuwBoek), Icoon { bron: i::NOTITIES, maat: 25 } span { "Nieuw notitieboek" } }
                        } span { class: "ribbon-groep-naam", "Organiseren" } }
                        div { class: "ribbon-groep", "data-niveau": "0", div { class: "ribbon-groep-inhoud", button { class: "ribbon-actie ribbon-groot", disabled: markdown, title: "Tekstvak toevoegen aan een canvassectie", onclick: move |_| notitie(werk,doel,N::NieuwVak { x: 40., y: 32. }), Icoon { bron: i::TOEVOEGEN, maat: 25 } span { "Tekstvak" } } } span { class: "ribbon-groep-naam", "Invoegen" } }
                    }
                }
            }
        }
    }
}

#[component]
fn Notities(werk: Signal<Werkruimte>, doel: Doel) -> Element {
    let (beeld, melding) = {
        let w = werk.read();
        let t = w.tab().unwrap();
        (t.beeld.clone(), t.melding.clone())
    };
    let Some(p) = beeld.notitie.as_ref() else {
        return rsx! { p { "Geen notitiepagina" } };
    };
    let boek = &p.overzicht.boeken[p.overzicht.boek];
    let sectie = &boek.secties[p.overzicht.sectie];
    let titel = beeld.velden.first().cloned();
    rsx! {
        div { class: "notities-studio",
            div { class: "notities-werkruimte",
                aside { class: "notities-boeken", "aria-label": "Notitieboeken en secties",
                    div { class: "notities-zijlabel", "MIJN NOTITIEBOEKEN" }
                    div { class: "notities-boekkiezer", Icoon { bron: i::NOTITIES, maat: 19 }
                        select { "aria-label": "Notitieboek kiezen", style: if werk.read().donker { "color-scheme:dark" } else { "color-scheme:light" }, value: "{p.overzicht.boek}", onchange: move |e| {
                            let deel = { let w=werk.read(); let o=&w.tab().unwrap().beeld.notitie.as_ref().unwrap().overzicht; e.value().parse::<usize>().ok().and_then(|i|o.boeken.get(i)).and_then(|b|b.secties.iter().flat_map(|s|s.paginas.iter()).next()).map(|p|p.deel) };
                            if let Some(n) = deel { voer(werk,|w|w.kies_deel(doel,n)); }
                        }, for (n,b) in p.overzicht.boeken.iter().enumerate() { option { value: "{n}", "{b.naam}" } } }
                    }
                    div { class: "notities-sectiekop notities-zijlabel", "SECTIES", button { "aria-label": "Nieuwe sectie", onclick: move |_| notitie(werk,doel,N::NieuweSectie { markdown: false }), Icoon { bron: i::TOEVOEGEN, maat: 15 } } }
                    nav { "aria-label": "Secties", for (n,s) in boek.secties.iter().enumerate() {
                        if let Some(pagina) = s.paginas.first() { button { class: if n==p.overzicht.sectie { "is-geselecteerd" } else { "" }, onclick: { let deel=pagina.deel; move |_| voer(werk,|w|w.kies_deel(doel,deel)) }, i { style: "background:#d97706" } span { "{s.naam}" } small { "{s.paginas.len()}" } } }
                    } }
                    button { class: "notities-nieuwboek", onclick: move |_| notitie(werk,doel,N::NieuwBoek), Icoon { bron: i::TOEVOEGEN, maat: 15 } "Nieuw notitieboek" }
                }
                aside { class: "notities-paginas", "aria-label": "Pagina’s",
                    div { class: "notities-lijstkop", div { span { "PAGINA’S" } h2 { "{sectie.naam}" } } }
                    label { class: "notities-sectietype", "Sectietype", select { value: if p.markdown { "markdown" } else { "canvas" }, onchange: move |e| notitie(werk,doel,N::Sectiesoort { markdown: e.value()=="markdown" }), option { value: "canvas", "Vrij canvas" } option { value: "markdown", "Markdown" } } }
                    button { class: "notities-nieuwepagina", onclick: move |_| notitie(werk,doel,N::NieuwePagina), Icoon { bron: i::TOEVOEGEN, maat: 15 } "Nieuwe pagina" }
                    div { class: "notities-paginalijst", for pagina in &sectie.paginas { if !pagina.verwijderd {
                        button { class: if pagina.deel==doel.deel { "is-geselecteerd" } else { "" }, onclick: { let deel=pagina.deel; move |_| voer(werk,|w|w.kies_deel(doel,deel)) }, strong { "{pagina.titel}" } span { "{pagina.voorbeeld}" } small { "{pagina.bijgewerkt}" } }
                    } } }
                }
                main { class: "notities-pagina", article {
                    div { class: "notities-paginakop", span { "{boek.naam}" b { "/" } "{sectie.naam}" } }
                    if let Some(v) = titel { input { class: "notities-paginatitel", "aria-label": "Paginatitel", initial_value: v.tekst, maxlength: "300", oninput: move |e| { let id=v.id.clone(); voer(werk,|w|w.bewerk(doel,Bewerking::Tekst { id,tekst:e.value() })); } } }
                    div { class: "notities-paginadatum", "{p.bijgewerkt}" span { "·" } "{p.woorden} woorden" }
                    if p.markdown {
                        if let Some(v) = beeld.velden.get(1).cloned() { div { class: "notities-markdown", div { class: "notities-md-balk", span { "Markdown" } } div { class: "notities-md-panelen beeld-bron", label { class: "notities-md-bron", span { "Broncode" } textarea { dir: "auto", "aria-label": "Markdown-bron", spellcheck: false, initial_value: v.tekst, oninput: move |e| { let id=v.id.clone(); voer(werk,|w|w.bewerk(doel,Bewerking::Tekst { id,tekst:e.value() })); } } } } } }
                    } else {
                        div { class: "notities-canvasvenster", div { class: "notities-canvasruimte", style: "width:1600px;height:1200px", div { class: "notities-canvas met-raster", style: "width:1600px;height:1200px",
                            for vak in &p.vakken {
                                div { class: "notities-tekstvak", style: "left:{vak.grens.x}px;top:{vak.grens.y}px;width:{vak.grens.breedte}px;min-height:{vak.grens.hoogte}px",
                                    for n in &vak.velden { if let Some(v) = beeld.velden.get(*n).cloned() {
                                        div { key: "{v.id}", class: "notities-blok is-tekst", textarea { "aria-label": "Notitietekst", initial_value: v.tekst, rows: "3", oninput: move |e| { let id=v.id.clone(); voer(werk,|w|w.bewerk(doel,Bewerking::Tekst { id,tekst:e.value() })); } } }
                                    } }
                                }
                            }
                        } } }
                    }
                } }
            }
            div { class: "notities-opslagstatus", role: "status", "{melding}" span { {if p.markdown { "Markdown" } else { "Vrij canvas" }} " · {p.vakken.len()} tekstvakken" } }
        }
    }
}

#[component]
fn Document(werk: Signal<Werkruimte>, doel: Doel) -> Element {
    let beeld = werk.read().tab().unwrap().beeld.clone();
    let afbeelding = beeld
        .afbeelding
        .as_ref()
        .map(|b| format!("data:image/png;base64,{}", STANDARD.encode(b)));
    rsx! {
        div { style: "display:flex;flex:1;min-height:0;overflow:auto",
            aside { style: "width:260px;flex-shrink:0;overflow:auto;padding:16px",
                p { "Documentbediening wordt naar de oorspronkelijke interface overgezet." }
                for (n,naam) in beeld.onderdelen.iter().enumerate() { button { onclick: move |_| voer(werk,|w|w.kies_deel(doel,n)), "{naam}" } }
                for v in beeld.velden { label { key: "{v.id}", style: "display:block;margin:12px 0", "{v.naam}", textarea { style: "width:100%", disabled: !v.bewerkbaar, initial_value: v.tekst, oninput: move |e| { let id=v.id.clone(); voer(werk,|w|w.bewerk(doel,Bewerking::Tekst { id,tekst:e.value() })); } } } }
            }
            if let Some(src) = afbeelding { main { style: "overflow:auto;flex:1;background:#eee;padding:24px", img { src, alt: "Documentweergave uit de Rust-kern", style: "max-width:100%;height:auto" } } }
        }
    }
}

#[cfg(test)]
mod bewaarproef {
    use super::*;
    use dioxus::core::{generation, needs_update};
    use std::{
        path::PathBuf,
        time::{Duration, Instant},
    };

    #[derive(Props, Clone, PartialEq)]
    struct ProefProps {
        pad: PathBuf,
    }

    fn proef(props: ProefProps) -> Element {
        let werk = use_signal(|| {
            let mut w = Werkruimte::default();
            w.open(&props.pad).unwrap();
            let tab = w.tab().unwrap();
            let doel = tab.doel();
            let id = tab.beeld.velden[0].id.clone();
            w.bewerk(
                doel,
                Bewerking::Tekst {
                    id,
                    tekst: "Bewaard na verlaten van de bediening".into(),
                },
            )
            .unwrap();
            w
        });
        if generation() == 0 {
            needs_update();
            rsx! { BewaarKind { werk } }
        } else {
            let vuil = werk.read().tab().unwrap().gewijzigd();
            rsx! { div { if vuil { "nog gewijzigd" } else { "opslag bevestigd" } } }
        }
    }

    #[component]
    fn BewaarKind(werk: Signal<Werkruimte>) -> Element {
        use_hook(move || {
            let doel = werk.read().tab().unwrap().doel();
            bewaar_pad(werk, doel, None);
        });
        rsx! { div { "tijdelijke bewaarbediening" } }
    }

    #[test]
    fn webview_bewaarbevestiging_overleeft_het_verlaten_van_de_component() {
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join("notitie.json");
        let sessie = office_core::document::Sessie::nieuw(Module::Notition).unwrap();
        std::fs::write(&pad, sessie.bron().as_slice()).unwrap();
        let mut dom = VirtualDom::new_with_props(proef, ProefProps { pad: pad.clone() });
        dom.rebuild_in_place();
        let einde = Instant::now() + Duration::from_secs(5);
        loop {
            dom.render_immediate_to_vec();
            let html = dioxus_ssr::render(&dom);
            if html.contains("opslag bevestigd") {
                break;
            }
            assert!(
                Instant::now() < einde,
                "De bewaarbevestiging verdween met de bediening: {html}"
            );
            std::thread::sleep(Duration::from_millis(5));
        }
        let bron: serde_json::Value = serde_json::from_slice(&std::fs::read(pad).unwrap()).unwrap();
        assert_eq!(
            bron["boeken"][0]["secties"][0]["paginas"][0]["titel"],
            "Bewaard na verlaten van de bediening"
        );
    }
}
