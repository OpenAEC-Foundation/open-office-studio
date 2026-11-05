//! Dezelfde relatieve toetsintenties voor raster, inline-editor en focusoverdracht.
use super::*;
use office_core::rekenblad::Richting as R;
use raster_ui::Bericht as B;
use text_editor::{Action as A, Binding as K, Edit as E, KeyPress};

fn gewone_tekst(k: &KeyPress) -> Option<String> {
    (!k.modifiers.command() || k.modifiers.control() && k.modifiers.alt())
        .then_some(k.text.as_ref())
        .flatten()
        .filter(|s| s.chars().any(|c| !c.is_control()))
        .map(ToString::to_string)
}
pub fn onderschep(k: &KeyPress) -> bool {
    use iced::keyboard::{Key, key::Named};
    if !matches!(k.status, text_editor::Status::Focused { .. }) {
        return false;
    }
    // Deze opdrachten blijven bij de toepassingsabonnementen en krijgen daar
    // dezelfde document-/modaliteitscontrole als klikken op het lint.
    if k.modifiers.command()
        && !k.modifiers.alt()
        && matches!(k.key, iced::keyboard::Key::Character(_))
        && !k
            .key
            .to_latin(k.physical_key)
            .is_some_and(|c| matches!(c, 'c' | 'x' | 'v' | 'a'))
    {
        return false;
    }
    matches!(
        k.key,
        Key::Named(Named::F2 | Named::Escape | Named::Tab | Named::Enter)
    ) || gewone_tekst(k).is_some()
        || K::<()>::from_key_press(k.clone()).is_some()
}
pub fn wijzigt_invoer(k: &KeyPress) -> bool {
    if gewone_tekst(k).is_some() {
        return true;
    }
    matches!(
        K::<()>::from_key_press(k.clone()),
        Some(K::Cut | K::Paste | K::Insert(_) | K::Enter | K::Backspace | K::Delete)
    )
}
fn actie(k: K<()>) -> Option<A> {
    Some(match k {
        K::Move(m) => A::Move(m),
        K::Select(m) => A::Select(m),
        K::SelectAll => A::SelectAll,
        K::SelectWord => A::SelectWord,
        K::SelectLine => A::SelectLine,
        K::Insert(c) => A::Edit(E::Insert(c)),
        K::Enter => A::Edit(E::Enter),
        K::Backspace => A::Edit(E::Backspace),
        K::Delete => A::Edit(E::Delete),
        _ => return None,
    })
}
pub fn voer_uit(app: &mut App, k: KeyPress) -> Task<Msg> {
    use iced::keyboard::{Key, key::Named};
    if !onderschep(&k) {
        return Task::none();
    }
    let in_editor = app.tab().is_some_and(|t| t.raster.bewerken);
    let b = match &k.key {
        Key::Named(Named::Escape) => Some(B::Annuleer),
        Key::Named(Named::F2) => {
            if in_editor {
                None
            } else {
                Some(B::BewerkActief)
            }
        }
        Key::Named(Named::Enter) if !k.modifiers.alt() => {
            Some(B::Voltooi(if k.modifiers.shift() {
                R::Boven
            } else {
                R::Onder
            }))
        }
        Key::Named(Named::Tab) if !k.modifiers.alt() => Some(B::Voltooi(if k.modifiers.shift() {
            R::Links
        } else {
            R::Rechts
        })),
        _ => {
            if let Some(s) = gewone_tekst(&k) {
                Some(B::Typ(s))
            } else {
                match K::<()>::from_key_press(k.clone()) {
                    Some(K::Copy) => Some(B::Klembord(klembord::Actie::Kopieer)),
                    Some(K::Cut) => Some(B::Klembord(klembord::Actie::Knip)),
                    Some(K::Paste) => Some(B::Klembord(klembord::Actie::Plak)),
                    Some(K::Unfocus) => Some(B::Annuleer),
                    Some(binding) if in_editor => actie(binding).map(B::Invoer),
                    Some(K::Insert(c)) => Some(B::Typ(c.to_string())),
                    Some(K::Delete) => Some(B::Wis),
                    Some(K::Backspace) => Some(B::Typ(String::new())),
                    Some(K::Move(m) | K::Select(m)) => {
                        let richting = match m {
                            text_editor::Motion::Left => Some(R::Links),
                            text_editor::Motion::Right => Some(R::Rechts),
                            text_editor::Motion::Up => Some(R::Boven),
                            text_editor::Motion::Down => Some(R::Onder),
                            _ => None,
                        };
                        richting.map(|richting| B::Pijl {
                            richting,
                            selecteer: k.modifiers.shift(),
                        })
                    }
                    _ => None,
                }
            }
        }
    };
    b.map(|b| raster_invoer::voer_uit(app, b))
        .unwrap_or_else(Task::none)
}
