//! De interface en documentopdrachten zijn Rust; het WebView verzorgt de DOM.
mod iconen;
pub mod model;
pub mod scherm;

pub const STIJL: &str = include_str!(concat!(env!("OUT_DIR"), "/office.css"));

#[cfg(test)]
extern crate self as open_office_studio_webview;
#[cfg(test)]
#[path = "../tests/gereedschap/mod.rs"]
mod proefhulp;
