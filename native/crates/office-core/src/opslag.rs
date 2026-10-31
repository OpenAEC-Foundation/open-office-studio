//! Een gewijzigde bron wordt nooit stil overschreven. Tijdelijke bestanden
//! staan naast het doel, zodat vervangen op hetzelfde bestandssysteem gebeurt.
use crate::document::{Fout, Resultaat};
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::Path};

pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn lees(pad: &Path) -> Resultaat<(Vec<u8>, String)> {
    let mut bestand = fs::File::open(pad)?;
    if bestand.metadata()?.len() > 64 * 1024 * 1024 {
        return Err(Fout::Document(
            "Bestand groter dan de native limiet van 64 MB".into(),
        ));
    }
    use std::io::Read;
    let mut bytes = Vec::new();
    (&mut bestand)
        .take(64 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err(Fout::Document("Bestand te groot".into()));
    }
    let controle = hash(&bytes);
    Ok((bytes, controle))
}

/// `verwacht == None` betekent: uitsluitend een nieuw bestand aanmaken.
/// Een expliciet gekozen bestaand doel krijgt eerst zijn eigen controlehash.
pub fn schrijf(pad: &Path, bytes: &[u8], verwacht: Option<&str>) -> Resultaat<String> {
    let ouder = pad
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut tijdelijk = tempfile::NamedTempFile::new_in(ouder)?;
    tijdelijk.write_all(bytes)?;
    tijdelijk.as_file().sync_all()?;
    match (verwacht, fs::read(pad)) {
        (Some(hashwaarde), Ok(huidig)) if hash(&huidig) == hashwaarde => {}
        (None, Err(e)) if e.kind() == std::io::ErrorKind::NotFound => {}
        (_, Err(e)) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.into()),
        _ => {
            return Err(Fout::Document(
                "Het bestand is buiten dit venster gewijzigd. Kies Opslaan als.".into(),
            ));
        }
    }
    if verwacht.is_none() {
        tijdelijk
            .persist_noclobber(pad)
            .map_err(|e| Fout::Io(e.error))?;
    } else {
        tijdelijk.persist(pad).map_err(|e| Fout::Io(e.error))?;
    }
    #[cfg(unix)]
    fs::File::open(ouder)?.sync_all()?;
    Ok(hash(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nieuwe_bestaande_en_extern_gewijzigde_bestanden() {
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join("document");
        let eerste = schrijf(&pad, b"een", None).unwrap();
        assert!(schrijf(&pad, b"overschrijven", None).is_err());
        let tweede = schrijf(&pad, b"twee", Some(&eerste)).unwrap();
        fs::write(&pad, b"extern").unwrap();
        assert!(schrijf(&pad, b"drie", Some(&tweede)).is_err());
        assert_eq!(fs::read(&pad).unwrap(), b"extern");
        fs::remove_file(&pad).unwrap();
        assert!(schrijf(&pad, b"drie", Some(&tweede)).is_err());
    }
}
