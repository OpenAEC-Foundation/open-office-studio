//! Paginering en rasterweergave rechtstreeks in Rust.
//! De opbouw van de layoutaanvraag volgt de Apache-2.0 native-viewer van
//! openooxml/betteroffice (1455bef9b8e251e20c5a5a77322e8a850e87521c).
use crate::document::{Fout, Resultaat};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap};
fn fout(e: impl std::fmt::Display) -> Fout {
    Fout::Document(e.to_string())
}

type Blad = (Vec<u8>, usize, usize, crate::interactie::Pagina);
type BladMetOpmaak = (
    Vec<u8>,
    usize,
    usize,
    crate::interactie::Pagina,
    std::sync::Arc<crate::writer_opmaak::Alineas>,
);
struct Behouden {
    eigenaar: u64,
    bron_hash: String,
    generatie: (u64, usize),
    context: Context,
}
thread_local! {
    // Eén engine per werkdraad. Wisselen van document laat de vorige engine
    // vóór de nieuwe opbouw los; er stapelen geen grote documentengines op.
    static PAGINACACHE: std::cell::RefCell<Option<Behouden>> = const { std::cell::RefCell::new(None) };
    #[cfg(test)]
    static OPBOUWEN: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}
pub(crate) fn wis(eigenaar: u64) {
    // Ook tijdens het afsluiten van een draad mag opruimen niet panikeren.
    let _ = PAGINACACHE.try_with(|cel| {
        if let Ok(mut slot) = cel.try_borrow_mut()
            && slot.as_ref().is_some_and(|c| c.eigenaar == eigenaar)
        {
            slot.take();
        }
    });
}
#[cfg(test)]
pub fn pagina(bron: &[u8], nummer: usize) -> Resultaat<Blad> {
    pagina_binnen::<true>(bron, nummer, None)
}
#[cfg(test)]
fn pagina_binnen<const ALLEEN_GEVRAAGD: bool>(
    bron: &[u8],
    nummer: usize,
    _opmaak: Option<&mut crate::writer_opmaak::Alineas>,
) -> Resultaat<Blad> {
    Context::nieuw(bron, false)?.pagina::<ALLEEN_GEVRAAGD>(nummer)
}
pub(crate) fn pagina_met_opmaak(
    bron: &[u8],
    nummer: usize,
    eigenaar: Option<u64>,
) -> Resultaat<BladMetOpmaak> {
    let Some(eigenaar) = eigenaar else {
        // Zelfstandige documentrondgangen blijven onafhankelijke berekeningen.
        let mut c = Context::nieuw(bron, true)?;
        let (png, aantal, overgeslagen, pagina) = c.pagina::<true>(nummer)?;
        return Ok((png, aantal, overgeslagen, pagina, c.opmaak));
    };
    let bron_hash = crate::opslag::hash(bron);
    let generatie = docx_layout::measure_fonts_generation();
    let mut oud = PAGINACACHE.with(|cel| cel.borrow_mut().take());
    if oud.as_ref().is_some_and(|c| {
        c.eigenaar != eigenaar || c.bron_hash != bron_hash || c.generatie != generatie
    }) {
        // Een gewijzigde bron of fontregistratie mag geen oude layout gebruiken.
        oud = None;
    }
    let mut c = match oud {
        Some(c) => c,
        None => Behouden {
            eigenaar,
            bron_hash,
            generatie,
            context: Context::nieuw(bron, true)?,
        },
    };
    let (png, aantal, overgeslagen, pagina) = c.context.pagina::<true>(nummer)?;
    let opmaak = c.context.opmaak.clone();
    c.generatie = docx_layout::measure_fonts_generation();
    PAGINACACHE.with(|cel| *cel.borrow_mut() = Some(c));
    Ok((png, aantal, overgeslagen, pagina, opmaak))
}
struct Context {
    engine: docx_edit::EngineSession,
    verzoek: Value,
    benodigd: Value,
    afbeeldingen: docx_raster::ImageMap,
    opmaak: std::sync::Arc<crate::writer_opmaak::Alineas>,
}
impl Context {
    fn nieuw(bron: &[u8], met_opmaak: bool) -> Resultaat<Self> {
        #[cfg(test)]
        OPBOUWEN.with(|n| n.set(n.get() + 1));
        // De engine heeft per draad een fontregister. Dezelfde fontset kan daarom
        // tussen opeenvolgende paginabeelden behouden blijven, zonder globale blokkade.
        let parsed = docx_parse::parse_docx_s9_wire(bron, docx_parse::S9ParseOptions::default())
            .map_err(fout)?;
        let package = parsed.document.package;
        let engine = docx_edit::EngineSession::new(424242);
        docx_edit::seed_from_docx(engine.doc(), bron).map_err(fout)?;
        let opmaak = std::sync::Arc::new(if met_opmaak {
            crate::writer_opmaak::lees(engine.doc())?
        } else {
            Default::default()
        });
        let mut secties = Vec::new();
        for sectie in package.document.sections.as_deref().unwrap_or_default() {
            secties.push(json!({"sectionId":sectie.id,"properties":sectie.properties}));
        }
        let laatste = package
            .document
            .final_section_properties
            .as_ref()
            .map(serde_json::to_value)
            .transpose()?
            .unwrap_or(json!({}));
        secties.push(json!({"sectionId":laatste["sectionId"],"properties":laatste}));
        let mut noten = Vec::new();
        for (soort, inhoud) in [
            ("footnote", package.footnotes.as_deref()),
            ("endnote", package.endnotes.as_deref()),
        ] {
            for noot in inhoud.unwrap_or_default() {
                if !noot.is_separator() {
                    // Het bronmodel gebruikt f64, de layoutaanvraag een geheel ID.
                    // Onveilige of gebroken nummers mogen nooit worden afgerond.
                    if !noot.id.is_finite()
                        || noot.id.fract() != 0.
                        || noot.id.abs() > 9_007_199_254_740_991.
                    {
                        return Err(fout("Ongeldig voet- of eindnootnummer"));
                    }
                    noten.push(json!({"id":noot.id as i64,"noteKind":soort,"height":0}));
                }
            }
        }
        let verzoek = json!({"bodyStory":"body","options":{"pageGap":24},"regions":{"sections":secties,"settings":package.settings,"watermark":laatste["watermark"]},"notes":{"contents":noten},"renderEnv":{}});
        let mut benodigd: Value = serde_json::from_str(
            &engine
                .layout_font_requirements_json(&verzoek.to_string())
                .map_err(fout)?,
        )?;
        // Gewone documenten gebruiken uitsluitend de daadwerkelijk gevraagde
        // fonts; ongebruikte families uit fontTable mogen openen niet vertragen.
        // Gegenereerde tekst in kop-/voetteksten kan het standaardfont pas bij
        // de tekenopbouw gebruiken, ook wanneer de fontquery het niet noemt.
        // Dezelfde vier standaardstijlen moeten bij meten en tekenen beschikbaar zijn.
        voeg_letterfamilies_toe(
            &mut benodigd,
            BTreeMap::from([("Calibri".into(), "Calibri".into())]),
        )?;
        if !package.chart_entries.is_empty() {
            aanvullende_lettertypen(&mut benodigd, &package.theme, &package.font_table)?;
        }
        Ok(Self {
            engine,
            verzoek,
            benodigd,
            afbeeldingen: afbeeldingen(bron)?,
            opmaak,
        })
    }
    fn pagina<const ALLEEN_GEVRAAGD: bool>(&mut self, nummer: usize) -> Resultaat<Blad> {
        let Self {
            engine,
            verzoek,
            benodigd,
            afbeeldingen,
            ..
        } = self;
        LETTERCACHE.with(|cel| {
            let mut slot = cel.borrow_mut();
            let sleutel = benodigd.to_string();
            let generatie = docx_layout::measure_fonts_generation();
            if slot
                .as_ref()
                .is_none_or(|c| c.sleutel != sleutel || c.generatie != generatie)
            {
                *slot = Some(Lettercache::nieuw(benodigd, sleutel)?);
            }
            let cache = slot.as_ref().expect("zojuist aangemaakte lettercache");
            let Lettercache {
                fonts,
                meten,
                tekenen,
                ..
            } = cache;
            verzoek["measurement"] = json!({
                "fontChains": meten,
                "defaults": {"fontSize": 11, "fontFamily": "Calibri"},
                "authoritativeShaping": true
            });
            let meta = engine
                .layout_document_with_regions_retained_meta(&verzoek.to_string())
                .map_err(fout)?;
            // De hele bron blijft gepagineerd: paginatelling, velden, noten en
            // secties houden hun volledige context. Alleen de tekenopdrachten
            // buiten de zichtbare pagina hoeven niet opgebouwd te worden.
            // Na een bewerking kan de vorige laatste pagina verdwenen zijn.
            let nummer = nummer.min(meta.page_count.saturating_sub(1));
            if ALLEEN_GEVRAAGD {
                engine.set_display_window(Some(nummer..nummer + 1));
            }
            let mut extra = json!({"fontChains": meten});
            if let Some(payload) = engine.retained_headers_footers_json().map_err(fout)? {
                extra["headersFooters"] = serde_json::from_str(&payload)?;
            }
            engine
                .build_display_list_frame(&extra.to_string(), 0)
                .map_err(fout)?;
            let dl = engine
                .with_display_list(Clone::clone)
                .ok_or_else(|| fout("Geen paginabeeld"))?;
            let aantal = dl.pages.len();
            let resources = docx_raster::RenderResources::new(fonts, tekenen, afbeeldingen);
            let render = docx_raster::render_page(&dl, nummer, &resources).map_err(fout)?;
            let pagina = raakvlakken(
                dl.pages
                    .get(nummer)
                    .ok_or_else(|| fout("Pagina bestaat niet"))?,
            );
            Ok((render.bytes, aantal, render.skipped_images, pagina))
        })
    }
}

/// Grafiektekst staat buiten de gewone alineaverzameling van de fontquery.
/// Vul de in het pakket genoemde families en themasleutels aan vóór de layout,
/// zodat meten en rasteren dezelfde registraties en stijlen kunnen gebruiken.
fn aanvullende_lettertypen(
    benodigd: &mut Value,
    theme: &docx_parse::Theme,
    tabel: &docx_parse::fonts::FontTable,
) -> Resultaat<()> {
    let mut families = BTreeMap::from([
        ("Calibri".to_string(), "Calibri".to_string()),
        ("Inter".to_string(), "Inter".to_string()),
    ]);
    for font in &tabel.fonts {
        // Gewone familienamen zijn geen themaverwijzingen: ze houden hun naam.
        families.insert(font.name.clone(), font.name.clone());
        if let Some(alt) = &font.alt_name {
            families.insert(alt.clone(), alt.clone());
        }
    }
    for alias in ["+mn-lt", "+mj-lt", "+mn-ea", "+mj-ea", "+mn-cs", "+mj-cs"] {
        families.insert(
            alias.into(),
            docx_parse::theme::resolve_theme_font_ref(Some(theme), alias),
        );
    }
    voeg_letterfamilies_toe(benodigd, families)
}

fn voeg_letterfamilies_toe(
    benodigd: &mut Value,
    families: BTreeMap<String, String>,
) -> Resultaat<()> {
    let eisen = benodigd
        .as_array_mut()
        .ok_or_else(|| fout("Ongeldige fontvereisten"))?;
    let mut sleutels = std::collections::HashSet::new();
    let mut scripts = std::collections::BTreeSet::new();
    for eis in eisen.iter() {
        if let Some(key) = eis["key"].as_str() {
            sleutels.insert(key.to_string());
        }
        for script in eis["scripts"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            scripts.insert(script.to_string());
        }
    }
    if families.len() > 2048 || eisen.len() > 8192 {
        return Err(fout(
            "Te veel verschillende lettertypecombinaties in dit document",
        ));
    }
    for (alias, familie) in families {
        if alias.is_empty() {
            continue;
        }
        for vet in [false, true] {
            for cursief in [false, true] {
                let key = format!(
                    "{}|{}|{}",
                    alias.to_lowercase(),
                    u8::from(vet),
                    u8::from(cursief)
                );
                if sleutels.insert(key.clone()) {
                    if eisen.len() >= 8192 {
                        return Err(fout(
                            "Te veel verschillende lettertypecombinaties in dit document",
                        ));
                    }
                    eisen.push(json!({"key":key,"family":familie,"bold":vet,"italic":cursief,"scripts":scripts}));
                }
            }
        }
    }
    Ok(())
}

struct Lettercache {
    sleutel: String,
    generatie: (u64, usize),
    fonts: ooxml_text::FontStore,
    meten: BTreeMap<String, Vec<u32>>,
    tekenen: docx_raster::FontChains,
}
thread_local! {static LETTERCACHE: std::cell::RefCell<Option<Lettercache>> = const {std::cell::RefCell::new(None)};}
impl Lettercache {
    fn nieuw(benodigd: &Value, sleutel: String) -> Resultaat<Self> {
        docx_layout::clear_measure_fonts();
        let mut fonts = ooxml_text::FontStore::new();
        let mut geregistreerd = HashMap::<usize, ooxml_text::FontId>::new();
        let mut meten = BTreeMap::<String, Vec<u32>>::new();
        let mut tekenen = HashMap::new();
        for eis in benodigd
            .as_array()
            .ok_or_else(|| fout("Ongeldige fontvereisten"))?
        {
            let key = eis["key"]
                .as_str()
                .ok_or_else(|| fout("Fontvereiste zonder sleutel"))?;
            let familie = eis["family"].as_str().unwrap_or("Calibri");
            let scripts = eis["scripts"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or_default();
            let mut chain = Vec::new();
            for letter in crate::lettertypen::keten(
                familie,
                eis["bold"].as_bool().unwrap_or(false),
                eis["italic"].as_bool().unwrap_or(false),
                scripts,
            ) {
                let ptr = letter.bytes.as_ptr() as usize;
                let id = if let Some(id) = geregistreerd.get(&ptr) {
                    *id
                } else {
                    let id =
                        docx_layout::register_measure_font_bytes(letter.bytes).map_err(fout)?;
                    let raster = fonts.register(letter.bytes.to_vec()).map_err(fout)?;
                    if id != raster.to_u32() {
                        return Err(fout("Fontregistraties wijken af"));
                    }
                    geregistreerd.insert(ptr, raster);
                    raster
                };
                chain.push(id);
            }
            meten.insert(key.into(), chain.iter().map(|id| id.to_u32()).collect());
            tekenen.insert(key.into(), chain);
        }

        Ok(Self {
            sleutel,
            generatie: docx_layout::measure_fonts_generation(),
            fonts,
            meten,
            tekenen,
        })
    }
}

fn raakvlakken(blad: &docx_layout::display_list::DisplayPage) -> crate::interactie::Pagina {
    use crate::interactie::{Pagina, Raakvlak, Rechthoek};
    use docx_layout::display_list::Primitive;
    let n = |v: &serde_json::Number| v.as_f64().unwrap_or_default() as f32;
    let mut pagina = Pagina {
        inhoud: blad
            .content_bounds
            .as_ref()
            .map(|g| crate::interactie::Rechthoek {
                x: n(&g.x),
                y: n(&g.y),
                breedte: n(&g.width),
                hoogte: n(&g.height),
            }),
        breedte: n(&blad.width),
        hoogte: n(&blad.height),
        vlakken: vec![],
    };
    for primitief in &blad.primitives {
        let (attrs, grens) = match primitief {
            Primitive::Rect(r) => (
                &r.attrs,
                Rechthoek {
                    x: n(&r.x),
                    y: n(&r.y),
                    breedte: n(&r.w),
                    hoogte: n(&r.h),
                },
            ),
            Primitive::Text(r) => (
                &r.attrs,
                Rechthoek {
                    x: n(&r.x),
                    y: n(&r.baseline_y) - 16.,
                    breedte: n(&r.width).max(8.),
                    hoogte: 22.,
                },
            ),
            Primitive::GlyphRun(r) if !r.glyphs.is_empty() => {
                let links = r
                    .glyphs
                    .iter()
                    .map(|g| g.x.min(g.x + g.advance))
                    .fold(f64::INFINITY, f64::min);
                let rechts = r
                    .glyphs
                    .iter()
                    .map(|g| g.x.max(g.x + g.advance))
                    .fold(f64::NEG_INFINITY, f64::max);
                let boven = r
                    .glyphs
                    .iter()
                    .map(|g| g.y - r.size)
                    .fold(f64::INFINITY, f64::min);
                let onder = r
                    .glyphs
                    .iter()
                    .map(|g| g.y + r.size * 0.3)
                    .fold(f64::NEG_INFINITY, f64::max);
                (
                    &r.attrs,
                    Rechthoek {
                        x: links as f32,
                        y: boven as f32,
                        breedte: (rechts - links).max(8.) as f32,
                        hoogte: (onder - boven) as f32,
                    },
                )
            }
            _ => continue,
        };
        if let Some(id) = &attrs.para_id
            && grens.breedte > 0.
            && grens.hoogte > 0.
        {
            pagina.vlakken.push(Raakvlak {
                id: id.clone(),
                grens,
            });
        }
    }
    pagina
}

fn afbeeldingen(bron: &[u8]) -> Resultaat<docx_raster::ImageMap> {
    use docx_parse::{
        RelationshipTarget, is_footer_relationship, is_header_relationship, is_image_relationship,
        resolve_relationship_target,
    };
    use docx_raster::{ImageScope, NoteKind, scoped_image_key};
    let parts = ooxml_opc::unzip_parts(bron)
        .map_err(fout)?
        .into_iter()
        .map(|(p, b)| (p.to_lowercase(), b))
        .collect::<HashMap<_, _>>();
    let relaties = docx_parse::parse_docx_relationship_parts(bron).map_err(fout)?;
    let mut koppen = HashMap::new();
    for part in &relaties.relationship_parts {
        if part
            .path
            .eq_ignore_ascii_case("word/_rels/document.xml.rels")
        {
            for (_, relatie) in &part.relationships {
                if (is_header_relationship(relatie) || is_footer_relationship(relatie))
                    && let RelationshipTarget::Internal(doel) =
                        resolve_relationship_target(&part.path, relatie).map_err(fout)?
                {
                    koppen.insert(doel.to_lowercase(), relatie.id.clone());
                }
            }
        }
    }
    let mut images = HashMap::new();
    for part in &relaties.relationship_parts {
        let Some((map, naam)) = part.path.split_once("/_rels/") else {
            continue;
        };
        let Some(naam) = naam.strip_suffix(".rels") else {
            continue;
        };
        let eigenaar = format!("{map}/{naam}").to_lowercase();
        for (_, relatie) in &part.relationships {
            if !is_image_relationship(relatie) {
                continue;
            }
            let RelationshipTarget::Internal(doel) =
                resolve_relationship_target(&part.path, relatie).map_err(fout)?
            else {
                continue;
            };
            let Some(bytes) = parts.get(&doel.to_lowercase()) else {
                continue;
            };
            let scope = match eigenaar.as_str() {
                "word/document.xml" => ImageScope::Body,
                "word/footnotes.xml" => ImageScope::Notes(NoteKind::Footnote),
                "word/endnotes.xml" => ImageScope::Notes(NoteKind::Endnote),
                _ => {
                    let Some(id) = koppen.get(&eigenaar) else {
                        continue;
                    };
                    ImageScope::HeaderFooter(id)
                }
            };
            images.insert(scoped_image_key(scope, &relatie.id), bytes.clone());
        }
    }
    Ok(images)
}

#[cfg(test)]
mod vensterproeven {
    use super::*;

    fn vergelijk(bron: &[u8], nummer: usize) -> usize {
        let (png, aantal, overgeslagen, raak) = pagina(bron, nummer).unwrap();
        // Deze referentie bouwt alle pagina's. Geen schaling, masker of tolerantie.
        let (volledig, totaal, ontbrekend, gebieden) =
            pagina_binnen::<false>(bron, nummer, None).unwrap();
        assert_eq!(aantal, totaal);
        assert_eq!(overgeslagen, ontbrekend);
        assert_eq!(png, volledig, "Afwijkend paginabeeld op pagina {nummer}");
        assert_eq!(raak.breedte, gebieden.breedte);
        assert_eq!(raak.hoogte, gebieden.hoogte);
        assert_eq!(raak.inhoud, gebieden.inhoud);
        assert_eq!(raak.vlakken.len(), gebieden.vlakken.len());
        for (a, b) in raak.vlakken.iter().zip(&gebieden.vlakken) {
            assert_eq!(a.id, b.id);
            assert_eq!(a.grens, b.grens);
        }
        aantal
    }

    #[test]
    fn tekenvenster_behoudt_beeld_noten_tabellen_grafiek_en_klikgebieden() {
        for bron in [
            include_bytes!("../tests/fixtures/writer.docx").as_slice(),
            include_bytes!("../tests/fixtures/tabel.docx").as_slice(),
            include_bytes!("../tests/fixtures/writer-structuur.docx").as_slice(),
            include_bytes!("../tests/fixtures/writer-voetnoot.docx").as_slice(),
            include_bytes!("../tests/fixtures/writer-grafiek.docx").as_slice(),
            include_bytes!("../tests/fixtures/writer-velden.docx").as_slice(),
            include_bytes!("../tests/fixtures/writer-diepe-velden.docx").as_slice(),
        ] {
            let aantal = vergelijk(bron, 0);
            if aantal > 1 {
                vergelijk(bron, aantal - 1);
            }
        }
    }

    #[test]
    fn tekenvenster_behoudt_paginavelden_kopvoetvarianten_en_laatste_pagina() {
        let mut delen =
            ooxml_opc::unzip_parts(include_bytes!("../tests/fixtures/writer-kopvoet.docx"))
                .unwrap();
        let veld = r#"<w:p><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t> / </w:t></w:r><w:fldSimple w:instr="NUMPAGES"><w:r><w:t>3</w:t></w:r></w:fldSimple></w:p>"#;
        for (naam, xml) in &mut delen {
            if naam.starts_with("word/header") && naam.ends_with(".xml") {
                let tekst = String::from_utf8(xml.clone()).unwrap();
                assert!(tekst.contains("</w:hdr>"));
                *xml = tekst
                    .replace("</w:hdr>", &format!("{veld}</w:hdr>"))
                    .into_bytes();
            }
        }
        let bron = ooxml_opc::rezip_parts(&delen).unwrap();
        for nummer in 0..3 {
            assert_eq!(vergelijk(&bron, nummer), 3);
        }
        assert_eq!(vergelijk(&bron, usize::MAX), 3);
        assert_eq!(
            pagina(&bron, usize::MAX).unwrap().0,
            pagina(&bron, 2).unwrap().0
        );
    }
}

#[cfg(test)]
mod cacheproeven {
    use super::*;
    use crate::document::{Bewerking, Document, Module, Sessie};
    fn bron() -> Vec<u8> {
        let mut delen =
            ooxml_opc::unzip_parts(include_bytes!("../tests/fixtures/writer-kopvoet.docx"))
                .unwrap();
        let (_, bytes) = delen
            .iter_mut()
            .find(|(n, _)| n == "word/document.xml")
            .unwrap();
        let tekst = String::from_utf8(bytes.clone()).unwrap();
        let begin = tekst.find("<w:body>").unwrap();
        let eind = tekst.find("</w:body>").unwrap() + "</w:body>".len();
        let sectiebegin = tekst.rfind("<w:sectPr").unwrap();
        let sectieeind =
            tekst[sectiebegin..].find("</w:sectPr>").unwrap() + sectiebegin + "</w:sectPr>".len();
        let mut body = String::from("<w:body>");
        for i in 0..6 {
            body.push_str(&format!("<w:p><w:pPr>{}</w:pPr><w:r><w:t>Eigen cachepagina {i} met café en 🏠.</w:t></w:r></w:p>",if i>0 { "<w:pageBreakBefore/>" } else { "" }));
        }
        body.push_str(&tekst[sectiebegin..sectieeind]);
        body.push_str("</w:body>");
        *bytes = format!("{}{}{}", &tekst[..begin], body, &tekst[eind..]).into_bytes();
        ooxml_opc::rezip_parts(&delen).unwrap()
    }
    fn aantal() -> usize {
        OPBOUWEN.with(|n| n.get())
    }
    #[test]
    fn paginacache_hergebruikt_een_engine_en_blijft_gelijk_aan_verse_beelden() {
        let bytes = bron();
        let s = Sessie::open(Module::Writer, bytes.clone()).unwrap();
        for (stap, pagina) in [0, 1, 2, 3, 4, 0, 5].into_iter().enumerate() {
            let voor = aantal();
            let b = s.weergave(pagina).unwrap();
            assert_eq!(
                aantal() - voor,
                usize::from(stap == 0),
                "onnodige engine-opbouw op stap {stap}"
            );
            let vers = Document::open(Module::Writer, &bytes)
                .unwrap()
                .weergave(pagina)
                .unwrap();
            assert_eq!(b.onderdelen.len(), 6);
            assert_eq!(b.afbeelding, vers.afbeelding, "pagina {pagina}");
            assert_eq!(format!("{:?}", b.pagina), format!("{:?}", vers.pagina));
            for (v, r) in b.velden.iter().zip(vers.velden.iter()) {
                assert_eq!(v.tekst, r.tekst);
                assert_eq!(v.opmaak, r.opmaak);
            }
        }
        assert!(PAGINACACHE.with(|c| c.borrow().is_some()));
        drop(s);
        assert!(PAGINACACHE.with(|c| c.borrow().is_none()));
    }
    #[test]
    fn paginacache_ververst_bij_fontgeneratie_en_isoleert_documenten() {
        let bytes = bron();
        let s = Sessie::open(Module::Writer, bytes.clone()).unwrap();
        let eerste = s.weergave(0).unwrap();
        for pagina in 1..5 {
            s.weergave(pagina).unwrap();
        }
        docx_layout::clear_measure_fonts();
        let voor = aantal();
        let opnieuw = s.weergave(0).unwrap();
        assert_eq!(aantal(), voor + 1);
        assert_eq!(eerste.afbeelding, opnieuw.afbeelding);
        let ander = Sessie::open(Module::Writer, bytes).unwrap();
        let voor = aantal();
        ander.weergave(0).unwrap();
        assert_eq!(aantal(), voor + 1);
        let eigenaar = PAGINACACHE.with(|c| c.borrow().as_ref().unwrap().eigenaar);
        drop(s);
        assert_eq!(
            PAGINACACHE.with(|c| c.borrow().as_ref().unwrap().eigenaar),
            eigenaar
        );
        let voor = aantal();
        ander.weergave(4).unwrap();
        assert_eq!(aantal(), voor);
        drop(ander);
        assert!(PAGINACACHE.with(|c| c.borrow().is_none()));
    }
    #[test]
    fn paginacache_volgt_bewerken_undo_en_laat_fouten_niet_achter() {
        let bytes = include_bytes!("../tests/fixtures/writer.docx");
        let mut s = Sessie::open(Module::Writer, bytes.to_vec()).unwrap();
        let eerste = s.weergave(0).unwrap();
        let voor = aantal();
        s.bewerk(
            0,
            Bewerking::Tekst {
                id: eerste.velden[1].id.clone(),
                tekst: "Eigen gewijzigde tekst met café en 🏠.".into(),
            },
        )
        .unwrap();
        assert_eq!(aantal(), voor + 1);
        let bewerkt = s.weergave(0).unwrap();
        assert_ne!(eerste.afbeelding, bewerkt.afbeelding);
        let vers = Document::open(Module::Writer, &s.bron())
            .unwrap()
            .weergave(0)
            .unwrap();
        assert_eq!(bewerkt.afbeelding, vers.afbeelding);
        s.terug().unwrap();
        let voor = aantal();
        let hersteld = s.weergave(0).unwrap();
        assert_eq!(aantal(), voor + 1);
        assert_eq!(eerste.afbeelding, hersteld.afbeelding);
        assert_eq!(s.bron().as_slice(), bytes);
        assert!(pagina_met_opmaak(b"Geen document", 0, Some(u64::MAX)).is_err());
        assert!(PAGINACACHE.with(|c| c.borrow().is_none()));
    }
}
