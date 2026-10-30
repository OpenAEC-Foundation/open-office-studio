//! Gedeelde documentcoördinaten: de interface schaalt beeld en raakvlakken samen.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Rechthoek {
    pub x: f32,
    pub y: f32,
    pub breedte: f32,
    pub hoogte: f32,
}
impl Rechthoek {
    pub fn bevat(self, x: f32, y: f32) -> bool {
        x >= self.x && y >= self.y && x < self.x + self.breedte && y < self.y + self.hoogte
    }
}
#[derive(Debug, Clone)]
pub struct Raakvlak {
    pub id: String,
    pub grens: Rechthoek,
}
#[derive(Debug, Clone, Default)]
pub struct Pagina {
    pub breedte: f32,
    pub hoogte: f32,
    pub inhoud: Option<Rechthoek>,
    pub vlakken: Vec<Raakvlak>,
}
impl Pagina {
    pub fn raak(&self, x: f32, y: f32) -> Option<&str> {
        // Kleinste vlak wint: een tekstvak binnen een groter object blijft bereikbaar.
        self.vlakken
            .iter()
            .filter(|v| v.grens.bevat(x, y))
            .min_by(|a, b| {
                (a.grens.breedte * a.grens.hoogte).total_cmp(&(b.grens.breedte * b.grens.hoogte))
            })
            .map(|v| v.id.as_str())
    }
}
/// Begrensde werkweergave; de volledige werkmap blijft in de engine.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RasterVenster {
    pub rij: u32,
    pub kolom: u32,
}
