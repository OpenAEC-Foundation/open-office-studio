//! De interface en documentopdrachten zijn Rust; het WebView verzorgt de DOM.
mod iconen;
pub mod model;
pub mod scherm;

pub const STIJL: &str = include_str!(concat!(env!("OUT_DIR"), "/office.css"));
