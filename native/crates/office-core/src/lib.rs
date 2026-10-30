//! Documenten en veilige bestandsopslag zonder webinterface.
pub mod document;
pub mod ifcx;
pub mod opslag;
mod writer_beeld;
mod writer_tekst;
pub const VERSIE: &str = env!("CARGO_PKG_VERSION");
