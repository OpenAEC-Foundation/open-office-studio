//! Systeemlettertypen opsommen en de bytes van één lettertype leveren (#22).
//!
//! De app meet en tekent documenten met echte lettertypebestanden. Staat een
//! lettertype uit het document op deze computer, dan gebruikt de app dat
//! bestand; anders een meegeleverde, metrisch gelijkwaardige vervanger.
use std::sync::OnceLock;

use fontdb::{Database, Family, Query, Style, Weight};

/// Grotere lettertypen (bijvoorbeeld volledige CJK-bestanden) worden niet doorgegeven.
const MAX_BYTES: usize = 40 * 1024 * 1024;

fn database() -> &'static Database {
    static DB: OnceLock<Database> = OnceLock::new();
    DB.get_or_init(|| {
        let mut db = Database::new();
        db.load_system_fonts();
        db
    })
}

/// Familienamen (de eerste, meestal Engelse naam van elk lettertype), gesorteerd en uniek.
pub fn families(db: &Database) -> Vec<String> {
    let mut namen: Vec<String> = db
        .faces()
        .filter_map(|face| face.families.first().map(|(naam, _)| naam.trim().to_owned()))
        .filter(|naam| !naam.is_empty() && !naam.starts_with('.'))
        .collect();
    namen.sort_by_key(|naam| naam.to_lowercase());
    namen.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    namen
}

/// De bytes van een lettertype met deze familie en stijl, of een fout.
pub fn bytes_van(db: &Database, familie: &str, vet: bool, cursief: bool) -> Result<Vec<u8>, String> {
    let families = [Family::Name(familie)];
    let query = Query {
        families: &families,
        weight: if vet { Weight::BOLD } else { Weight::NORMAL },
        style: if cursief { Style::Italic } else { Style::Normal },
        ..Query::default()
    };
    let id = db
        .query(&query)
        .ok_or_else(|| crate::taal::t_met("errors.font.notInstalled", &[("family", familie)]))?;
    let face = db.face(id).ok_or_else(|| crate::taal::t("errors.font.notFound"))?;
    if !face
        .families
        .iter()
        .any(|(naam, _)| naam.eq_ignore_ascii_case(familie))
    {
        return Err(crate::taal::t_met("errors.font.notInstalled", &[("family", familie)]));
    }
    db.with_face_data(id, |data, index| {
        if data.len() > MAX_BYTES {
            return Err(crate::taal::t("errors.font.fileTooLarge"));
        }
        // Een lettertypeverzameling (.ttc) kan de app niet als los lettertype gebruiken.
        if index != 0 || data.starts_with(b"ttcf") {
            return Err(crate::taal::t("errors.font.inCollection"));
        }
        Ok(data.to_vec())
    })
    .ok_or_else(|| crate::taal::t("errors.font.unreadable"))?
}

#[tauri::command]
pub async fn systeemlettertypen() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| families(database()))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn systeemlettertype(
    familie: String,
    vet: bool,
    cursief: bool,
) -> Result<tauri::ipc::Response, String> {
    if familie.len() > 200 {
        return Err(crate::taal::t("errors.font.nameInvalid"));
    }
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        bytes_van(database(), &familie, vet, cursief)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn somt_lettertypen_op_en_levert_bytes() {
        let db = database();
        let namen = families(db);
        let mut gesorteerd = namen.clone();
        gesorteerd.sort_by_key(|n| n.to_lowercase());
        assert_eq!(namen, gesorteerd);
        // Op een systeem zonder lettertypen valt er niets te controleren.
        let Some(eerste) = namen.iter().find(|naam| bytes_van(db, naam, false, false).is_ok()) else {
            return;
        };
        let bytes = bytes_van(db, eerste, false, false).unwrap();
        assert!(bytes.len() > 100);
        let kop = &bytes[0..4];
        assert!(kop == [0, 1, 0, 0] || kop == b"OTTO" || kop == b"true", "{kop:?}");
    }

    #[test]
    fn weigert_onbekende_lettertypen() {
        let fout = bytes_van(database(), "Bestaat Niet Lettertype 123", false, false).unwrap_err();
        assert!(fout.contains("niet op deze computer"));
    }
}
