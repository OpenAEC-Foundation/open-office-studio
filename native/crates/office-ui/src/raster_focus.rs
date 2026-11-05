//! Een oude focusoperatie ziet de actuele widgetboom en verplaatst geen andere invoer.
use super::*;
use iced::advanced::widget::{
    Id, Operation,
    operation::{Focusable, Outcome},
};

pub fn id(document: u64, versie: u64, editor: bool) -> Id {
    Id::from(format!(
        "{}:{document}:{versie}",
        if editor {
            raster_ui::EDITOR_ID
        } else {
            raster_ui::RASTER_ID
        }
    ))
}
struct Bewaker {
    doel: Id,
    eigen: [Id; 2],
    aanwezig: bool,
    ander: bool,
    eigen_focus: bool,
}
impl Operation for Bewaker {
    fn traverse(&mut self, operate: &mut dyn FnMut(&mut dyn Operation)) {
        operate(self);
    }
    fn focusable(&mut self, id: Option<&Id>, _: iced::Rectangle, staat: &mut dyn Focusable) {
        self.aanwezig |= id == Some(&self.doel);
        if staat.is_focused() {
            if self.eigen.iter().any(|e| Some(e) == id) {
                self.eigen_focus = true;
            } else {
                self.ander = true;
            }
        }
    }
    fn finish(&self) -> Outcome<()> {
        if self.aanwezig && (!self.ander || self.eigen_focus) {
            Outcome::Chain(Box::new(
                iced::advanced::widget::operation::focusable::focus(self.doel.clone()),
            ))
        } else {
            Outcome::None
        }
    }
}
pub fn focus(document: u64, versie: u64, editor: bool) -> Task<Msg> {
    let raster = id(document, versie, false);
    let cel = id(document, versie, true);
    bewaakt(
        if editor { cel.clone() } else { raster.clone() },
        [raster, cel],
    )
}
/// Het doel moet nog bestaan; een later invoerveld houdt zijn eigen focus.
pub fn bewaakt(doel: Id, eigen: [Id; 2]) -> Task<Msg> {
    iced::advanced::widget::operate(Bewaker {
        doel,
        eigen,
        aanwezig: false,
        ander: false,
        eigen_focus: false,
    })
    .discard()
}
