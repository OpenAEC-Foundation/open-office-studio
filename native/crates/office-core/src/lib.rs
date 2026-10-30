//! Documenten en veilige bestandsopslag zonder webinterface.
pub mod document;
pub mod ifcx;
pub mod interactie;
pub mod lettertypen;
pub mod notities;
pub mod opmaak;
pub mod opslag;
pub mod presentatie;
mod presentatie_tekst;
pub mod rekenblad;
pub mod writer;
mod writer_beeld;
mod writer_tekst;
pub const VERSIE: &str = env!("CARGO_PKG_VERSION");
