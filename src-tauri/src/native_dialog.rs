//! rfd's portal backend uses the external Zenity program for message dialogs.
//! Keep file pickers on the existing portal backend; distinguish a missing
//! confirmation requirement from an actual user cancellation before polling.
use std::future::Future;

#[cfg(target_os = "linux")]
fn uitvoerbaar(pad: &std::path::Path) -> bool {
    use std::os::unix::ffi::OsStrExt;
    unsafe extern "C" {
        fn access(pad: *const std::ffi::c_char, mode: std::ffi::c_int) -> std::ffi::c_int;
    }
    let Ok(naam) = std::ffi::CString::new(pad.as_os_str().as_bytes()) else {
        return false;
    };
    pad.is_file() && unsafe { access(naam.as_ptr(), 1) == 0 } // POSIX X_OK; no helper is run.
}

#[cfg(target_os = "linux")]
fn in_pad(pad: Option<&std::ffi::OsStr>) -> bool {
    pad.map(|p| std::env::split_paths(p).any(|map| uitvoerbaar(&map.join("zenity"))))
        .unwrap_or(false)
}

fn beschikbaar() -> bool {
    #[cfg(target_os = "linux")]
    return in_pad(std::env::var_os("PATH").as_deref());
    #[cfg(not(target_os = "linux"))]
    true
}

async fn indien_beschikbaar<F: Future>(
    beschikbaar: bool,
    dialoog: F,
    fout: String,
) -> Result<F::Output, String> {
    if !beschikbaar {
        return Err(fout);
    }
    Ok(dialoog.await)
}

/// The caller supplies its localized actionable error. No dialog is polled and
/// no continuation/write/close is approved when the Linux helper is missing.
pub async fn toon<F: Future>(dialoog: F, fout: String) -> Result<F::Output, String> {
    indien_beschikbaar(beschikbaar(), dialoog, fout).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::task::{Context, Poll, Wake, Waker};

    struct Wakker;
    impl Wake for Wakker {
        fn wake(self: Arc<Self>) {}
    }
    fn klaar<F: Future>(toekomst: F) -> F::Output {
        let waker = Waker::from(Arc::new(Wakker));
        let mut context = Context::from_waker(&waker);
        let mut toekomst = std::pin::pin!(toekomst);
        match toekomst.as_mut().poll(&mut context) {
            Poll::Ready(uitkomst) => uitkomst,
            Poll::Pending => panic!("Test future must finish without a GUI"),
        }
    }

    #[test]
    fn ontbrekend_backend_polt_geen_dialoog_en_schrijft_of_sluit_niets() {
        let pad = std::env::temp_dir().join(format!("oos-dialog-{}", std::process::id()));
        std::fs::write(&pad, b"original source").unwrap();
        let gesloten = std::cell::Cell::new(false);
        let resultaat = klaar(indien_beschikbaar(
            false,
            async {
                std::fs::write(&pad, b"must never be written").unwrap();
                gesloten.set(true);
                "yes"
            },
            "Install Zenity".into(),
        ));
        assert_eq!(resultaat, Err("Install Zenity".into()));
        assert_eq!(std::fs::read(&pad).unwrap(), b"original source");
        assert!(!gesloten.get());
        std::fs::remove_file(pad).unwrap();
    }

    #[test]
    fn echte_cancel_is_een_normale_keuze_geen_dependencyfout() {
        let resultaat = klaar(indien_beschikbaar(
            true,
            std::future::ready("cancel"),
            "missing".into(),
        ));
        assert_eq!(resultaat, Ok("cancel"));
    }

    #[test]
    fn positieve_en_aangepaste_keuzes_blijven_ongewijzigd() {
        for keuze in ["yes", "no", "save as", "overwrite"] {
            assert_eq!(
                klaar(indien_beschikbaar(
                    true,
                    std::future::ready(keuze),
                    "missing".into()
                )),
                Ok(keuze)
            );
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_pad_vergt_een_uitvoerbaar_bestand_geen_map_of_alleen_leesrecht() {
        use std::os::unix::fs::PermissionsExt;
        let map = std::env::temp_dir().join(format!("oos-zenity-{}", std::process::id()));
        std::fs::create_dir_all(&map).unwrap();
        let pad = map.join("zenity");
        assert!(!in_pad(None));
        assert!(!in_pad(Some(map.as_os_str())));
        std::fs::create_dir(&pad).unwrap();
        assert!(!in_pad(Some(map.as_os_str())));
        std::fs::remove_dir(&pad).unwrap();
        std::fs::write(&pad, b"not executed by the test").unwrap();
        std::fs::set_permissions(&pad, std::fs::Permissions::from_mode(0o600)).unwrap();
        assert!(!in_pad(Some(map.as_os_str())));
        std::fs::set_permissions(&pad, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert!(in_pad(Some(map.as_os_str())));
        std::fs::remove_file(&pad).unwrap();
        std::fs::remove_dir(map).unwrap();
    }
}
