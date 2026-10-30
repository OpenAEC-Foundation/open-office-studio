//! Office-kleuren uit src/stijl/openaec-shell.css (OpenAEC Foundation, CC-BY-SA-4.0).
//! De gedeelde Blueprint-bron blijft ongewijzigd; dit is de Office-toepassing ervan.
use openaec_ui::{
    design::{Look, ThemeId},
    iced::Color,
};
pub fn office(mut look: Look) -> Look {
    if !matches!(look.theme, ThemeId::Light | ThemeId::Dark) {
        return look;
    }
    let donker = look.theme == ThemeId::Dark;
    let rgb = |r, g, b| Color::from_rgb8(r, g, b);
    let tekst = if donker {
        rgb(250, 250, 249)
    } else {
        rgb(54, 54, 62)
    };
    let c = &mut look.color;
    c.frame = if donker {
        rgb(54, 54, 62)
    } else {
        rgb(250, 250, 249)
    };
    c.panel = if donker {
        rgb(54, 54, 62)
    } else {
        Color::WHITE
    };
    c.raised = if donker {
        rgb(68, 68, 76)
    } else {
        Color::WHITE
    };
    c.field = if donker {
        rgb(54, 54, 62)
    } else {
        rgb(250, 250, 249)
    };
    c.docbar = if donker {
        rgb(46, 46, 54)
    } else {
        rgb(245, 245, 244)
    };
    c.workspace = if donker {
        rgb(42, 42, 50)
    } else {
        rgb(245, 245, 244)
    };
    c.statusbar = rgb(54, 54, 62);
    c.statusbar_text = rgb(161, 161, 170);
    c.text = tekst;
    c.text_secondary = Color {
        a: if donker { 0.6 } else { 0.65 },
        ..tekst
    };
    c.text_muted = Color { a: 0.5, ..tekst };
    c.text_disabled = Color { a: 0.35, ..tekst };
    c.border = if donker {
        Color {
            a: 0.25,
            ..rgb(217, 119, 6)
        }
    } else {
        Color { a: 0.12, ..tekst }
    };
    c.border_subtle = Color { a: 0.06, ..tekst };
    c.accent = rgb(217, 119, 6);
    c.accent_hover = rgb(234, 88, 12);
    c.accent_text = c.accent;
    c.text_on_accent = if donker {
        rgb(54, 54, 62)
    } else {
        Color::WHITE
    };
    c.hover = Color {
        a: if donker { 0.1 } else { 0.08 },
        ..c.accent
    };
    c.pressed = Color {
        a: if donker { 0.18 } else { 0.15 },
        ..c.accent
    };
    c.selected = Color {
        a: if donker { 0.12 } else { 0.15 },
        ..c.accent
    };
    c.selected_bar = c.accent;
    c.focus = c.accent;
    look
}
