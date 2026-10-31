//! Vervangt uitsluitend gewone tekst. Ongewijzigde tekstdelen houden hun
//! runopmaak; velden, revisies, afbeeldingen en links worden niet afgevlakt.
use crate::document::{Fout, Resultaat};
use betteroffice_docx::{self as docx, InlineNode as I, ParagraphContent as P, RunContent as R};
use std::sync::Arc;

/// Lees de resultaatboom van velden, niet de vlakke reservekopie. Die kopie
/// bevat bij een genest veld niet alle zichtbare tekst. Hyperlinks kunnen
/// eveneens zo'n veld bevatten. De expliciete stapel voorkomt diepe recursie.
pub fn alinea_tekst(p: &docx::Paragraph) -> String {
    enum Stap<'a> {
        Inline(&'a I, bool),
        Run(&'a docx::Run, bool),
    }
    let mut uit = String::new();
    let mut stappen: Vec<_> = p
        .content
        .iter()
        .rev()
        .filter_map(|c| {
            if let P::Inline(i) = c {
                Some(Stap::Inline(i, true))
            } else {
                None
            }
        })
        .collect();
    while let Some(stap) = stappen.pop() {
        match stap {
            Stap::Run(r, scheiding) => {
                for c in &r.content {
                    match c {
                        R::Text { text, .. } => uit.push_str(text),
                        R::Tab if scheiding => uit.push('\t'),
                        R::Break { break_type, .. } if scheiding => {
                            uit.push(if break_type.as_deref() == Some("page") {
                                '\u{000c}'
                            } else {
                                '\n'
                            })
                        }
                        _ => {}
                    }
                }
            }
            Stap::Inline(i, scheiding) => match i {
                I::Run(r) => stappen.push(Stap::Run(r, scheiding)),
                I::Hyperlink(h) => stappen.extend(
                    h.structured_children
                        .as_ref()
                        .unwrap_or(&h.children)
                        .iter()
                        .rev()
                        .map(|i| Stap::Inline(i, false)),
                ),
                I::SimpleField(f) => {
                    if let Some(inline) =
                        f.structured_result.as_ref().and_then(|s| s.inline.as_ref())
                    {
                        stappen.extend(inline.iter().rev().map(|i| Stap::Inline(i, false)));
                    } else {
                        stappen.extend(f.content.iter().rev().map(|r| Stap::Run(r, false)));
                    }
                }
                I::ComplexField(f) => {
                    if let Some(inline) =
                        f.structured_result.as_ref().and_then(|s| s.inline.as_ref())
                    {
                        stappen.extend(inline.iter().rev().map(|i| Stap::Inline(i, false)));
                    } else {
                        stappen.extend(f.field_result.iter().rev().map(|r| Stap::Run(r, false)));
                    }
                }
                _ => {}
            },
        }
    }
    uit
}
fn fout() -> Fout {
    Fout::Document("Deze alinea bevat een object, veld, link of revisie die nog niet veilig native kan worden bewerkt".into())
}
pub fn ondersteund(p: &docx::Paragraph) -> bool {
    p.property_changes.is_none()
        && p.p_pr_ins.is_none()
        && p.p_pr_del.is_none()
        && p.content.iter().all(|c| match c {
            P::Inline(I::Run(r)) => {
                r.property_changes.is_none()
                    && r.content.iter().all(|c| {
                        matches!(
                            c,
                            R::Text { .. }
                                | R::Tab
                                | R::Break {
                                    break_type: None,
                                    clear: None
                                }
                        )
                    })
            }
            _ => false,
        })
}
fn tekst(r: &docx::Run) -> String {
    r.content
        .iter()
        .map(|c| match c {
            R::Text { text, .. } => text.as_str(),
            R::Tab => "\t",
            R::Break { .. } => "\n",
            _ => "",
        })
        .collect()
}
fn inhoud(s: &str) -> Vec<R> {
    let mut uit = Vec::new();
    let mut begin = 0;
    for (i, c) in s.char_indices() {
        if c == '\n' || c == '\t' {
            if begin < i {
                uit.push(R::Text {
                    text: s[begin..i].into(),
                    preserve_space: Some(true),
                });
            }
            uit.push(if c == '\n' {
                R::Break {
                    break_type: None,
                    clear: None,
                }
            } else {
                R::Tab
            });
            begin = i + c.len_utf8();
        }
    }
    if begin < s.len() {
        uit.push(R::Text {
            text: s[begin..].into(),
            preserve_space: Some(true),
        });
    }
    uit
}

/// Knipt runs op een Unicode-grens; beide helften behouden hun eigen runopmaak.
pub(crate) fn splits_inhoud(p: &docx::Paragraph, positie: usize) -> (Vec<P>, Vec<P>) {
    let mut links = Vec::new();
    let mut rechts = Vec::new();
    let mut rest = positie;
    for c in &p.content {
        if let P::Inline(I::Run(run)) = c {
            let tekens: Vec<_> = tekst(run).chars().collect();
            let knip = rest.min(tekens.len());
            rest -= knip;
            if knip > 0 {
                let mut r = run.clone();
                r.content = inhoud(&tekens[..knip].iter().collect::<String>());
                links.push(P::Inline(I::Run(r)));
            }
            if knip < tekens.len() {
                let mut r = run.clone();
                r.content = inhoud(&tekens[knip..].iter().collect::<String>());
                rechts.push(P::Inline(I::Run(r)));
            }
        }
    }
    // Ook een lege nieuwe alinea houdt de opmaak bij de splitspositie.
    if links.is_empty()
        && let Some(P::Inline(I::Run(r))) = p.content.first()
    {
        let mut r = r.clone();
        r.content.clear();
        links.push(P::Inline(I::Run(r)));
    }
    if rechts.is_empty()
        && let Some(P::Inline(I::Run(r))) = p.content.last()
    {
        let mut r = r.clone();
        r.content.clear();
        rechts.push(P::Inline(I::Run(r)));
    }
    (links, rechts)
}
pub fn vervang(d: &mut docx::Document, id: &str, nieuw: &str) -> Resultaat<()> {
    if nieuw.len() > 500_000 {
        return Err(Fout::Document(
            "Alinea groter dan de bewerkingslimiet".into(),
        ));
    }
    let mut p = d
        .paragraph(id)
        .ok_or_else(|| Fout::Document("Alinea bestaat niet".into()))?
        .clone();
    if !ondersteund(&p) {
        return Err(fout());
    }
    let oud = docx::get_paragraph_text(&p);
    let a: Vec<char> = oud.chars().collect();
    let b: Vec<char> = nieuw.chars().collect();
    let prefix = a.iter().zip(&b).take_while(|(a, b)| a == b).count();
    let suffix = a[prefix..]
        .iter()
        .rev()
        .zip(b[prefix..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let midden: String = b[prefix..b.len() - suffix].iter().collect();
    let mut runs: Vec<docx::Run> = p
        .content
        .iter()
        .filter_map(|c| {
            if let P::Inline(I::Run(r)) = c {
                Some(r.clone())
            } else {
                None
            }
        })
        .collect();
    if runs.is_empty() {
        runs.push(docx::Run {
            node_type: docx_parse::inline::RunType::Run,
            formatting: None,
            property_changes: None,
            content: vec![],
        });
    }
    let mut uit = Vec::new();
    let mut positie = 0;
    let mut ingevoegd = false;
    for run in runs {
        let t: Vec<char> = tekst(&run).chars().collect();
        let einde = positie + t.len();
        let voor = prefix.saturating_sub(positie).min(t.len());
        if voor > 0 {
            let mut r = run.clone();
            r.content = inhoud(&t[..voor].iter().collect::<String>());
            uit.push(P::Inline(I::Run(r)));
        }
        if !ingevoegd && einde >= prefix {
            if !midden.is_empty() {
                let mut r = run.clone();
                r.content = inhoud(&midden);
                uit.push(P::Inline(I::Run(r)));
            }
            ingevoegd = true;
        }
        let start = (a.len() - suffix)
            .saturating_sub(positie)
            .min(t.len())
            .max(voor);
        if start < t.len() {
            let mut r = run.clone();
            r.content = inhoud(&t[start..].iter().collect::<String>());
            uit.push(P::Inline(I::Run(r)));
        }
        positie = einde;
    }
    p.content = uit;
    schrijf(d, id, &p);
    Ok(())
}

/// Voer de werkelijk geregistreerde invoerstappen uit op een lokale alineakopie.
/// Schrijf pas na de laatste controle, zodat ook de directe document-API atomair is.
pub fn reeks(
    d: &mut docx::Document,
    id: &str,
    bron: &str,
    resultaat: &str,
    stappen: &[crate::document::TekstStap],
) -> Resultaat<()> {
    let p = bereid_reeks(d, id, bron, resultaat, stappen)?;
    schrijf(d, id, &p);
    Ok(())
}

/// Controleer alle alinea's vóór de eerste modelwijziging. Een late fout mag
/// ook bij rechtstreekse documentbediening geen eerdere vervanging achterlaten.
pub(crate) fn reeksen(
    d: &mut docx::Document,
    reeksen: &[crate::document::TekstReeks],
) -> Resultaat<()> {
    let omvang = reeksen.iter().try_fold(0usize, |n, r| {
        n.checked_add(r.bron.len())?.checked_add(r.tekst.len())
    });
    let werk = reeksen.iter().try_fold(0usize, |n, r| {
        n.checked_add(r.bron.len().checked_mul(r.stappen.len())?)
    });
    let gewijzigd = reeksen
        .iter()
        .flat_map(|r| &r.stappen)
        .try_fold(0usize, |n, s| {
            n.checked_add(s.tekst.len())?.checked_add(s.verwacht.len())
        });
    let stappen = reeksen
        .iter()
        .try_fold(0usize, |n, r| n.checked_add(r.stappen.len()));
    if reeksen.is_empty()
        || reeksen.len() > 4096
        || omvang.is_none_or(|n| n > 16 * 1024 * 1024)
        || stappen.is_none_or(|n| n > 4096)
        || werk.is_none_or(|n| n > 32 * 1024 * 1024)
        || gewijzigd.is_none_or(|n| n > 16 * 1024 * 1024)
    {
        return Err(Fout::Document(
            "Vervangopdracht overschrijdt de bewerkingslimiet".into(),
        ));
    }
    let mut paragrafen = std::collections::HashMap::new();
    for p in d.paragraphs() {
        if let Some(id) = p.para_id.as_deref()
            && paragrafen.insert(id, p).is_some()
        {
            return Err(Fout::Document("Alinea-adres is niet uniek".into()));
        }
    }
    let mut klaar = std::collections::HashMap::new();
    for r in reeksen {
        if klaar.contains_key(r.id.as_str()) {
            return Err(Fout::Document(
                "Een vervangopdracht bevat dezelfde alinea tweemaal".into(),
            ));
        }
        let p = paragrafen
            .get(r.id.as_str())
            .ok_or_else(|| Fout::Document("Alinea bestaat niet".into()))?;
        klaar.insert(
            r.id.as_str(),
            Arc::new(bereid_alinea(p, &r.bron, &r.tekst, &r.stappen)?),
        );
    }
    schrijf_lijst(d, &klaar);
    Ok(())
}

fn bereid_reeks(
    d: &docx::Document,
    id: &str,
    bron: &str,
    resultaat: &str,
    stappen: &[crate::document::TekstStap],
) -> Resultaat<docx::Paragraph> {
    let p = d
        .paragraph(id)
        .ok_or_else(|| Fout::Document("Alinea bestaat niet".into()))?;
    bereid_alinea(p, bron, resultaat, stappen)
}
fn bereid_alinea(
    p: &docx::Paragraph,
    bron: &str,
    resultaat: &str,
    stappen: &[crate::document::TekstStap],
) -> Resultaat<docx::Paragraph> {
    if bron.len() > 500_000
        || resultaat.len() > 500_000
        || stappen.len() > 4096
        || stappen
            .iter()
            .try_fold(0usize, |n, s| {
                n.checked_add(s.tekst.len())?.checked_add(s.verwacht.len())
            })
            .is_none_or(|n| n > 16 * 1024 * 1024)
    {
        return Err(Fout::Document(
            "Tekstconcept overschrijdt de bewerkingslimiet".into(),
        ));
    }
    let mut p = p.clone();
    if !ondersteund(&p) {
        return Err(fout());
    }
    if alinea_tekst(&p) != bron {
        return Err(Fout::Document(
            "Het tekstconcept hoort bij een andere alineaversie".into(),
        ));
    }
    for stap in stappen {
        let oud: Vec<_> = alinea_tekst(&p).chars().collect();
        if stap.begin > stap.einde
            || stap.einde > oud.len()
            || oud[stap.begin..stap.einde].iter().collect::<String>() != stap.verwacht
        {
            return Err(Fout::Document(
                "Tekststap past niet bij het verwachte bereik".into(),
            ));
        }
        let nieuw_bytes = oud[..stap.begin]
            .iter()
            .map(|c| c.len_utf8())
            .sum::<usize>()
            + stap.tekst.len()
            + oud[stap.einde..]
                .iter()
                .map(|c| c.len_utf8())
                .sum::<usize>();
        if nieuw_bytes > 500_000 {
            return Err(Fout::Document(
                "Alinea groter dan de bewerkingslimiet".into(),
            ));
        }
        vervang_bereik(&mut p, stap.begin, stap.einde, &stap.tekst);
    }
    if alinea_tekst(&p) != resultaat {
        return Err(Fout::Document(
            "Tekststappen leveren niet het zichtbare concept op".into(),
        ));
    }
    Ok(p)
}
fn vervang_bereik(p: &mut docx::Paragraph, begin: usize, einde: usize, nieuw: &str) {
    let mut runs: Vec<_> = p
        .content
        .iter()
        .filter_map(|c| {
            if let P::Inline(I::Run(r)) = c {
                Some(r.clone())
            } else {
                None
            }
        })
        .collect();
    if runs.is_empty() {
        runs.push(docx::Run {
            node_type: docx_parse::inline::RunType::Run,
            formatting: None,
            property_changes: None,
            content: vec![],
        });
    }
    let mut offset = 0;
    // Vervangen neemt de eerste geselecteerde run; invoegen de linkerbuur.
    // Zo kan een selectie aan een opmaakgrens niet de vorige run overnemen.
    let stijl = runs
        .iter()
        .find(|r| {
            offset += tekst(r).chars().count();
            if begin == einde {
                offset >= begin
            } else {
                offset > begin
            }
        })
        .unwrap_or_else(|| runs.last().unwrap())
        .clone();
    let mut uit = Vec::new();
    let mut positie = 0;
    let mut ingevoegd = false;
    for run in runs {
        let t: Vec<_> = tekst(&run).chars().collect();
        let voor = begin.saturating_sub(positie).min(t.len());
        if voor > 0 {
            let mut r = run.clone();
            r.content = inhoud(&t[..voor].iter().collect::<String>());
            uit.push(P::Inline(I::Run(r)));
        }
        if !ingevoegd && positie + t.len() >= begin {
            if !nieuw.is_empty() {
                let mut r = stijl.clone();
                r.content = inhoud(nieuw);
                uit.push(P::Inline(I::Run(r)));
            }
            ingevoegd = true;
        }
        let na = einde.saturating_sub(positie).min(t.len()).max(voor);
        if na < t.len() {
            let mut r = run;
            r.content = inhoud(&t[na..].iter().collect::<String>());
            uit.push(P::Inline(I::Run(r)));
        }
        positie += t.len();
    }
    if uit.is_empty() {
        let mut r = stijl;
        r.content.clear();
        uit.push(P::Inline(I::Run(r)));
    }
    p.content = uit;
}

fn schrijf(d: &mut docx::Document, id: &str, p: &docx::Paragraph) {
    schrijf_lijst(
        d,
        &std::collections::HashMap::from([(id, Arc::new(p.clone()))]),
    );
}
/// Eén doorloop, ook bij duizenden geraakte alinea's. De afzonderlijke
/// sectiebeelden moeten naar precies dezelfde nieuwe alineakopieën verwijzen.
fn schrijf_lijst(
    d: &mut docx::Document,
    nieuw: &std::collections::HashMap<&str, Arc<docx::Paragraph>>,
) {
    fn pas_toe(
        blokken: &mut [docx::BlockContent],
        nieuw: &std::collections::HashMap<&str, Arc<docx::Paragraph>>,
    ) {
        for blok in blokken {
            match blok {
                docx::BlockContent::Paragraph(p) => {
                    if let Some(id) = p.para_id.as_deref()
                        && let Some(n) = nieuw.get(id)
                    {
                        *p = n.clone();
                    }
                }
                docx::BlockContent::Table(t) => {
                    for rij in &mut Arc::make_mut(t).rows {
                        for cel in &mut rij.cells {
                            pas_toe(&mut cel.content, nieuw);
                        }
                    }
                }
                docx::BlockContent::BlockSdt(s) => pas_toe(&mut Arc::make_mut(s).content, nieuw),
                _ => {}
            }
        }
    }
    let model = d.model_mut();
    pas_toe(&mut model.body.content, nieuw);
    if let Some(secties) = &mut model.body.sections {
        for s in secties {
            pas_toe(&mut s.content, nieuw);
        }
    }
}

/// Aantallen in Unicode-tekens; nooit bytes of halve UTF-16-surrogaten.
pub fn opmaak(
    d: &mut docx::Document,
    id: &str,
    begin: usize,
    einde: usize,
    stijl: &crate::opmaak::Opmaak,
) -> Resultaat<()> {
    use crate::opmaak::{Opmaak as O, Uitlijning as U};
    stijl.controleer()?;
    let mut p = d
        .paragraph(id)
        .ok_or_else(|| Fout::Document("Alinea bestaat niet".into()))?
        .clone();
    if !ondersteund(&p) {
        return Err(fout());
    }
    let lengte = docx::get_paragraph_text(&p).chars().count();
    if begin > einde || einde > lengte {
        return Err(Fout::Document("Tekstselectie valt buiten de alinea".into()));
    }
    if let O::Uitlijning(a) = stijl {
        p.formatting.get_or_insert_with(Default::default).alignment = Some(
            match a {
                U::Links => "left",
                U::Midden => "center",
                U::Rechts => "right",
                U::Uitvullen => "both",
            }
            .into(),
        );
    } else {
        // Een lege selectie op een niet-lege alinea mag geen schijnbewerking zijn.
        if begin == einde {
            return Err(Fout::Document(
                "Selecteer tekst om de opmaak te wijzigen".into(),
            ));
        }
        let mut uit = Vec::new();
        let mut offset = 0;
        for item in &p.content {
            let P::Inline(I::Run(run)) = item else {
                return Err(fout());
            };
            let chars: Vec<char> = tekst(run).chars().collect();
            let eind = offset + chars.len();
            let links = begin.saturating_sub(offset).min(chars.len());
            let rechts = einde.saturating_sub(offset).min(chars.len());
            for (a, b, pas_aan) in [
                (0, links, false),
                (links, rechts, true),
                (rechts, chars.len(), false),
            ] {
                if a >= b {
                    continue;
                }
                let mut r = run.clone();
                r.content = inhoud(&chars[a..b].iter().collect::<String>());
                if pas_aan {
                    let f = r.formatting.get_or_insert_with(Default::default);
                    match stijl {
                        O::Vet(v) => {
                            f.bold = Some(*v);
                            f.bold_cs = Some(*v);
                        }
                        O::Cursief(v) => {
                            f.italic = Some(*v);
                            f.italic_cs = Some(*v);
                        }
                        O::Onderstrepen(v) => {
                            f.underline = Some(docx_parse::scalars::UnderlineValue {
                                style: if *v { "single" } else { "none" }.into(),
                                color: None,
                            })
                        }
                        O::Doorhalen(v) => f.strike = Some(*v),
                        O::Lettergrootte(v) => {
                            // Dezelfde positieve halvepuntenafronding als de
                            // vaste serializer: model en bewaarde bron blijven gelijk.
                            f.font_size = Some((*v * 2. + 0.5).floor());
                            f.font_size_cs = Some(*v * 2.);
                        }
                        O::Lettertype(v) => {
                            let fam = f.font_family.get_or_insert_with(Default::default);
                            fam.ascii = Some(v.clone());
                            fam.h_ansi = Some(v.clone());
                            fam.ascii_theme = None;
                            fam.h_ansi_theme = None;
                        }
                        O::Kleur(v) => {
                            f.color = Some(docx_parse::scalars::ColorValue::from_attribute(&v[1..]))
                        }
                        O::Achtergrond(v) => {
                            let shade = f.shading.get_or_insert_with(Default::default);
                            shade.fill =
                                Some(docx_parse::scalars::ColorValue::from_attribute(&v[1..]));
                        }
                        _ => {
                            return Err(Fout::Document(
                                "Deze tekstopmaak wordt nog niet ondersteund".into(),
                            ));
                        }
                    }
                }
                uit.push(P::Inline(I::Run(r)));
            }
            offset = eind;
        }
        p.content = uit;
    }
    schrijf(d, id, &p);
    Ok(())
}
pub fn staat(p: &docx::Paragraph) -> crate::opmaak::OpmaakStaat {
    let f = p.content.iter().find_map(|c| match c {
        P::Inline(I::Run(r)) => r.formatting.as_ref(),
        _ => None,
    });
    crate::opmaak::OpmaakStaat {
        vet: f.and_then(|f| f.bold).unwrap_or(false),
        cursief: f.and_then(|f| f.italic).unwrap_or(false),
        onderstrepen: f
            .and_then(|f| f.underline.as_ref())
            .is_some_and(|v| v.style != "none"),
        doorhalen: f.and_then(|f| f.strike).unwrap_or(false),
        grootte: f.and_then(|f| f.font_size).map(|n| n / 2.),
        lettertype: f
            .and_then(|f| f.font_family.as_ref())
            .and_then(|v| v.ascii.clone()),
    }
}
