//! Alleen ontbrekende gevormde clusters krijgen een aanvullend gezicht.
//! Bestaande glyphs houden hun oorspronkelijke vorming en kerning.
use crate::{font, resources::ResolvedFont};
use rustybuzz::Face;
use tiny_skia::{FillRule, Paint, PathBuilder, Pixmap, Rect, Transform};
use xlsx_render::Align;

pub(crate) struct Glyph<'a> {
    face: &'a Face<'static>,
    id: u16,
    scale: f32,
    advance: f32,
    dx: f32,
    dy: f32,
    bold: bool,
    italic: bool,
}
pub(crate) struct Shaped<'a> {
    glyphs: Vec<Glyph<'a>>,
    pub width: f32,
}
fn ignorable(c: char) -> bool {
    matches!(c as u32, 0x200c | 0x200d | 0xfe00..=0xfe0f | 0xe0100..=0xe01ef)
}
fn covers(face: &Face<'_>, text: &str) -> bool {
    text.chars().all(|c| ignorable(c) || face.glyph_index(c).is_some_and(|id| id.0 != 0))
}
fn append<'a>(
    uit: &mut Vec<Glyph<'a>>, face: &'a Face<'static>, buffer: &rustybuzz::GlyphBuffer,
    range: std::ops::Range<usize>, size: f32, bold: bool, italic: bool,
) {
    let scale = size * font::PX_PER_PT / face.units_per_em() as f32;
    for i in range {
        let info = &buffer.glyph_infos()[i];
        let pos = &buffer.glyph_positions()[i];
        uit.push(Glyph {
            face, id: info.glyph_id as u16, scale,
            advance: pos.x_advance as f32 * scale,
            dx: pos.x_offset as f32 * scale, dy: pos.y_offset as f32 * scale,
            bold, italic,
        });
    }
}
pub(crate) fn shape<'a>(run: &'a font::TextRun<'a>, text: &str) -> Option<Shaped<'a>> {
    if run.fallbacks.is_empty() || covers(run.face, text) { return None; }
    let primary = font::shape(run.face, text);
    let infos = primary.glyph_infos();
    if !infos.iter().any(|g| g.glyph_id == 0) { return None; }
    let mut grenzen = infos.iter().map(|g| g.cluster as usize).collect::<Vec<_>>();
    grenzen.push(text.len()); grenzen.sort_unstable(); grenzen.dedup();
    let mut uit = Vec::with_capacity(infos.len());
    let mut gewijzigd = false;
    let mut i = 0;
    while i < infos.len() {
        let cluster = infos[i].cluster;
        let mut einde = i + 1;
        while einde < infos.len() && infos[einde].cluster == cluster { einde += 1; }
        let begin = cluster as usize;
        let stop = *grenzen.get(grenzen.partition_point(|p| *p <= begin))?;
        let tekst = text.get(begin..stop)?;
        let ontbreekt = infos[i..einde].iter().any(|g| g.glyph_id == 0);
        let fallback: Option<&ResolvedFont> = ontbreekt.then(|| run.fallbacks.iter().find(|f| covers(&f.face, tekst))).flatten();
        if let Some(f) = fallback {
            let buffer = font::shape(&f.face, tekst);
            if !buffer.glyph_infos().is_empty() && buffer.glyph_infos().iter().all(|g| g.glyph_id != 0) {
                append(&mut uit, &f.face, &buffer, 0..buffer.glyph_infos().len(), run.font_size_pt, f.synthetic_bold, f.synthetic_italic);
                gewijzigd = true; i = einde; continue;
            }
        }
        append(&mut uit, run.face, &primary, i..einde, run.font_size_pt, run.bold, run.italic);
        i = einde;
    }
    gewijzigd.then(|| Shaped { width: uit.iter().map(|g| g.advance).sum(), glyphs: uit })
}
fn paint_run(target: &mut Pixmap, run: &font::TextRun, shaped: &Shaped<'_>, pen: f32, ox: f32, oy: f32) {
    let mut paint = Paint::default(); paint.set_color(run.color); paint.anti_alias = true;
    let scale = run.font_size_pt * font::PX_PER_PT / run.face.units_per_em() as f32;
    font::paint_highlight(target, run.face, run, pen, shaped.width, scale, ox, oy);
    let mut x = pen;
    for g in &shaped.glyphs {
        if let Some(path) = font::glyph_path(g.face, g.id) {
            let shear = if g.italic { font::ITALIC_SHEAR*g.scale } else { 0. };
            let t = Transform::from_row(g.scale, 0., shear, -g.scale, x+g.dx-ox, run.y-g.dy-oy);
            target.fill_path(&path, &paint, FillRule::Winding, t, None);
            if g.bold { target.fill_path(&path, &paint, FillRule::Winding, t.post_translate(font::BOLD_OFFSET_PX,0.), None); }
        }
        x += g.advance;
    }
    font::paint_decorations(target, run.face, run, pen, shaped.width, scale, &paint, ox, oy);
}
fn past_binnen(run: &font::TextRun, shaped: &Shaped<'_>, pen: f32) -> bool {
    if run.highlight.is_some() || run.underline || run.strike || run.dashed_underline { return false; }
    if pen < run.clip.x || pen+shaped.width > run.clip.x+run.clip.w { return false; }
    let mut x = pen;
    for g in &shaped.glyphs {
        // Dezelfde binnen-/afkapbeslissing als een regel in dit gezicht zelf.
        // Ook de fontdaling telt mee wanneer de zichtbare contour nog past.
        if run.y-g.dy-g.face.ascender() as f32*g.scale < run.clip.y
            || run.y-g.dy-g.face.descender() as f32*g.scale > run.clip.y+run.clip.h { return false; }
        if let Some(b) = g.face.glyph_bounding_box(rustybuzz::ttf_parser::GlyphId(g.id)) {
            let shear = if g.italic { font::ITALIC_SHEAR*g.scale } else { 0. };
            for gx in [b.x_min,b.x_max] { for gy in [b.y_min,b.y_max] {
                let px = x+g.dx+gx as f32*g.scale+gy as f32*shear;
                let py = run.y-g.dy-gy as f32*g.scale;
                let vet = if g.bold { font::BOLD_OFFSET_PX } else { 0. };
                if px < run.clip.x+1. || px+vet > run.clip.x+run.clip.w-1.
                    || py < run.clip.y+1. || py > run.clip.y+run.clip.h-1. { return false; }
            }}
        }
        x += g.advance;
    }
    true
}
pub(crate) fn paint(pixmap: &mut Pixmap, run: &font::TextRun, shaped: &Shaped<'_>) {
    let pen = match run.align { Align::Left => run.x, Align::Center => run.x-shaped.width/2., Align::Right => run.x-shaped.width };
    // Binnen de cel direct schilderen: dezelfde rasterafronding als het eigen
    // gezicht, zonder een extra alfalaag of celgrote tijdelijke afbeelding.
    if past_binnen(run,shaped,pen) { paint_run(pixmap,run,shaped,pen,0.,0.); return; }
    let ox = run.clip.x.max(0.).floor(); let oy = run.clip.y.max(0.).floor();
    let rechts = (run.clip.x+run.clip.w).min(pixmap.width() as f32).ceil();
    let onder = (run.clip.y+run.clip.h).min(pixmap.height() as f32).ceil();
    if rechts <= ox || onder <= oy { return; }
    let Some(mut scratch) = Pixmap::new((rechts-ox) as u32, (onder-oy) as u32) else { return; };
    paint_run(&mut scratch,run,shaped,pen,ox,oy);
    // Het masker blijft celgroot; geen volledige paginamasker per tekstregel.
    if let Some(r) = Rect::from_xywh(run.clip.x-ox,run.clip.y-oy,run.clip.w,run.clip.h) {
        if let Some(mut mask) = tiny_skia::Mask::new(scratch.width(),scratch.height()) {
            mask.fill_path(&PathBuilder::from_rect(r),FillRule::Winding,true,Transform::identity());
            scratch.apply_mask(&mask);
        }
    }
    pixmap.draw_pixmap(ox as i32,oy as i32,scratch.as_ref(),&tiny_skia::PixmapPaint::default(),Transform::identity(),None);
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn paint_rotated_segment(
    scratch: &mut Pixmap, _run: &font::TextRun, shaped: &Shaped<'_>, offset: f32,
    width: f32, center_y: f32, cos: f32, sin: f32, cx: f32, cy: f32, paint: &Paint,
) {
    let mut pen = 0.;
    for g in &shaped.glyphs {
        if let Some(path) = font::glyph_path(g.face,g.id) {
            let x = offset+pen+g.dx-width/2.; let y = -g.dy-center_y;
            let shear = if g.italic { font::ITALIC_SHEAR*g.scale } else { 0. };
            let t = Transform::from_row(cos*g.scale,sin*g.scale,cos*shear+sin*g.scale,sin*shear-cos*g.scale,cos*x-sin*y+cx,sin*x+cos*y+cy);
            scratch.fill_path(&path,paint,FillRule::Winding,t,None);
            if g.bold { scratch.fill_path(&path,paint,FillRule::Winding,t.post_translate(cos*font::BOLD_OFFSET_PX,sin*font::BOLD_OFFSET_PX),None); }
        }
        pen += g.advance;
    }
}
