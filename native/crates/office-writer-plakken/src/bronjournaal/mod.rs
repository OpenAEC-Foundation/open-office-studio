//! Expliciet experimentele schema-3-route. De bestaande desktoproute blijft schema 2.
//! Deze module wordt uitsluitend gebouwd met de feature `writer-bronjournaal`.
mod adapter;
mod journaal;
mod voorraad;
mod werker;
pub use adapter::{AdapterFout, Binding};
pub use voorraad::{Voorraad, VoorraadFout};
pub use werker::WerkerFout;
#[cfg(test)]
mod adapterproef;
#[cfg(test)]
mod kernproef;
#[cfg(test)]
mod voorraadproef;
#[cfg(test)]
mod werkerproef;
#[cfg(test)]
fn proefpad() -> std::path::PathBuf {
    std::env::var_os("WRITER_EIGEN_REEKS")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/bronjournaal-geschiedenis.json")
        })
}
