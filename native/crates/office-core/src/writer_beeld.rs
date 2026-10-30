//! Paginering en rasterweergave rechtstreeks in Rust.
//! De opbouw van de layoutaanvraag volgt de Apache-2.0 native-viewer van
//! openooxml/betteroffice (1455bef9b8e251e20c5a5a77322e8a850e87521c).
use crate::document::{Fout, Resultaat};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap};
fn fout(e: impl std::fmt::Display) -> Fout {
    Fout::Document(e.to_string())
}

pub fn pagina(bron: &[u8], nummer: usize) -> Resultaat<(Vec<u8>, usize, usize)> {
    // De engine heeft een gedeelde fontregistratie; layout en raster krijgen
    // onder deze vergrendeling dezelfde font-id's, ook bij parallelle tests.
    static REGISTRATIE: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _slot = REGISTRATIE.lock().unwrap_or_else(|e| e.into_inner());
    let parsed = docx_parse::parse_docx_s9_wire(bron, docx_parse::S9ParseOptions::default())
        .map_err(fout)?;
    let package = parsed.document.package;
    let engine = docx_edit::EngineSession::new(424242);
    docx_edit::seed_from_docx(engine.doc(), bron).map_err(fout)?;
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
                noten.push(json!({"id":noot.id,"noteKind":soort,"height":0}));
            }
        }
    }
    let mut verzoek = json!({"bodyStory":"body","options":{"pageGap":24},"regions":{"sections":secties,"settings":package.settings,"watermark":laatste["watermark"]},"notes":{"contents":noten},"renderEnv":{}});
    let benodigd: Value = serde_json::from_str(
        &engine
            .layout_font_requirements_json(&verzoek.to_string())
            .map_err(fout)?,
    )?;
    docx_layout::clear_measure_fonts();
    let mut fonts = ooxml_text::FontStore::new();
    let mut ids = Vec::new();
    for bytes in [
        include_bytes!("../../../vendor/openaec-ui/assets/fonts/Inter-Regular.ttf").as_slice(),
        include_bytes!("../../../vendor/openaec-ui/assets/fonts/Inter-SemiBold.ttf").as_slice(),
        include_bytes!("../../../vendor/openaec-ui/assets/fonts/NotoSans-Regular.ttf").as_slice(),
    ] {
        let id = docx_layout::register_measure_font_bytes(bytes).map_err(fout)?;
        let raster = fonts.register(bytes.to_vec()).map_err(fout)?;
        if id != raster.to_u32() {
            return Err(fout("Fontregistraties wijken af"));
        }
        ids.push(raster);
    }
    let mut meten = BTreeMap::<String, Vec<u32>>::new();
    let mut tekenen = HashMap::new();
    for eis in benodigd
        .as_array()
        .ok_or_else(|| fout("Ongeldige fontvereisten"))?
    {
        let key = eis["key"]
            .as_str()
            .ok_or_else(|| fout("Fontvereiste zonder sleutel"))?;
        let chain = vec![
            ids[usize::from(eis["bold"].as_bool().unwrap_or(false))],
            ids[2],
        ];
        meten.insert(key.into(), chain.iter().map(|id| id.to_u32()).collect());
        tekenen.insert(key.into(), chain);
    }
    verzoek["measurement"] = json!({"fontChains":meten,"defaults":{"fontSize":11,"fontFamily":"Inter"},"authoritativeShaping":true});
    engine
        .layout_document_with_regions_retained_json(&verzoek.to_string())
        .map_err(fout)?;
    engine
        .build_display_list_frame(&json!({"fontChains":meten}).to_string(), 0)
        .map_err(fout)?;
    let dl = engine
        .with_display_list(Clone::clone)
        .ok_or_else(|| fout("Geen paginabeeld"))?;
    let aantal = dl.pages.len();
    let afbeeldingen = afbeeldingen(bron)?;
    let resources = docx_raster::RenderResources::new(&fonts, &tekenen, &afbeeldingen);
    let render = docx_raster::render_page(&dl, nummer, &resources).map_err(fout)?;
    Ok((render.bytes, aantal, render.skipped_images))
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
