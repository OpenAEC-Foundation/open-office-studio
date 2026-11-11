//! Locate the private runtime inside the installed app, never via the working directory.
use serde_json::Value;
use std::{fs, path::{Path, PathBuf}};

const MANIFEST: &str = include_str!("../../assets/kantoorruntime.json");

fn target() -> String {
    let os = match std::env::consts::OS { "windows" => "win32", "macos" => "darwin", other => other };
    let arch = match std::env::consts::ARCH { "x86_64" => "x64", "aarch64" => "arm64", other => other };
    format!("{os}-{arch}")
}

/// The receipt is produced only after verified extraction and copying succeeded.
/// macOS keeps the signed app in Contents/Helpers, preserving its symbolic links.
pub fn vind(resources: &Path) -> Option<PathBuf> {
    if !resources.is_absolute() { return None; }
    let manifest: Value = serde_json::from_str(MANIFEST).ok()?;
    let receipt_file = resources.join("kantoorruntime/meta/receipt.json");
    if fs::metadata(&receipt_file).ok()?.len() > 64 * 1024 { return None; }
    let receipt: Value = serde_json::from_str(&fs::read_to_string(receipt_file).ok()?).ok()?;
    let target = target();
    let asset = manifest["targets"].get(&target)?;
    if receipt["schemaVersion"] != 1 || receipt["layoutVersion"] != manifest["layoutVersion"]
        || receipt["version"] != manifest["version"] || receipt["target"].as_str()? != target
        || receipt["sourceSha256"] != asset["sha256"] { return None; }
    #[cfg(target_os = "macos")]
    let (root, executable, licenses) = {
        let root = resources.parent()?.join("Helpers/LibreOffice.app");
        let licenses = root.join("Contents/Resources");
        (root, Path::new("Contents/MacOS/soffice"), licenses)
    };
    #[cfg(target_os = "linux")]
    let (root, executable, licenses) = {
        if resources.parent()?.file_name()? != "lib" { return None; }
        let root = resources.parent()?.parent()?.join("libexec").join(resources.file_name()?).join("kantoorruntime");
        (root.clone(), Path::new("program/soffice"), root)
    };
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    let (root, executable, licenses) = {
        let root = resources.join("kantoorruntime");
        let executable = if cfg!(windows) { Path::new("program/soffice.com") } else { Path::new("program/soffice") };
        (root.clone(), executable, root)
    };
    if !licenses.join("LICENSE.html").is_file() || !licenses.join("NOTICE").is_file() { return None; }
    #[cfg(windows)]
    if !root.join("program/msvcp140.dll").is_file() || !root.join("program/vcruntime140.dll").is_file() { return None; }
    let program = root.join(executable);
    let canonical_root = fs::canonicalize(&root).ok()?;
    let canonical_program = fs::canonicalize(&program).ok()?;
    #[cfg(target_os = "macos")]
    let container = fs::canonicalize(resources.parent()?).ok()?;
    #[cfg(target_os = "linux")]
    let container = fs::canonicalize(resources.parent()?.parent()?).ok()?;
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    let container = fs::canonicalize(resources).ok()?;
    if !canonical_root.starts_with(container) || !canonical_program.starts_with(&canonical_root) || !program.is_file() { return None; }
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        if fs::metadata(&program).ok()?.permissions().mode() & 0o111 == 0 { return None; }
    }
    Some(program)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let resources = if cfg!(target_os = "linux") { temp.path().join("usr/lib/Fixture Office") } else { temp.path().join("Contents/Resources") };
        fs::create_dir_all(resources.join("kantoorruntime/meta")).unwrap();
        #[cfg(target_os = "macos")]
        let (executable, licenses) = (temp.path().join("Contents/Helpers/LibreOffice.app/Contents/MacOS/soffice"), temp.path().join("Contents/Helpers/LibreOffice.app/Contents/Resources"));
        #[cfg(target_os = "linux")]
        let (executable, licenses) = (temp.path().join("usr/libexec/Fixture Office/kantoorruntime/program/soffice"), temp.path().join("usr/libexec/Fixture Office/kantoorruntime"));
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        let (executable, licenses) = (resources.join(if cfg!(windows) { "kantoorruntime/program/soffice.com" } else { "kantoorruntime/program/soffice" }), resources.join("kantoorruntime"));
        fs::create_dir_all(executable.parent().unwrap()).unwrap();
        fs::create_dir_all(&licenses).unwrap();
        fs::write(&executable, b"test fixture, never executed").unwrap();
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).unwrap();
        }
        fs::write(licenses.join("LICENSE.html"), "original license fixture").unwrap();
        fs::write(licenses.join("NOTICE"), "original notice fixture").unwrap();
        #[cfg(windows)]
        for name in ["msvcp140.dll", "vcruntime140.dll"] { fs::write(executable.parent().unwrap().join(name), "fixture, never executed").unwrap(); }
        let manifest: Value = serde_json::from_str(MANIFEST).unwrap();
        fs::write(resources.join("kantoorruntime/meta/receipt.json"), serde_json::to_vec(&json!({
            "schemaVersion": 1, "layoutVersion": manifest["layoutVersion"], "version": manifest["version"],
            "target": target(), "sourceSha256": manifest["targets"][target()]["sha256"],
        })).unwrap()).unwrap();
        (temp, resources, executable)
    }

    #[test]
    fn vindt_de_meegelverde_runtime_vanuit_de_appresources() {
        let (_temp, resources, executable) = fixture();
        assert_eq!(vind(&resources), Some(executable));
        assert!(vind(Path::new(".")).is_none());
    }

    #[test]
    fn weigert_een_verkeerde_architectuur_versie_of_bronhash() {
        for (field, value) in [("target", "wrong-architecture"), ("version", "0.0.0"), ("sourceSha256", "wrong-source")] {
            let (_temp, resources, _program) = fixture();
            let path = resources.join("kantoorruntime/meta/receipt.json");
            let mut receipt: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
            receipt[field] = value.into();
            fs::write(path, serde_json::to_vec(&receipt).unwrap()).unwrap();
            assert!(vind(&resources).is_none(), "{field}");
        }
    }

    #[test]
    fn een_ontbrekend_programma_of_incomplete_extractie_is_geen_runtime() {
        let (_temp, resources, executable) = fixture();
        fs::remove_file(executable).unwrap();
        assert!(vind(&resources).is_none());
        let (_temp, resources, _executable) = fixture();
        fs::remove_file(resources.join("kantoorruntime/meta/receipt.json")).unwrap();
        assert!(vind(&resources).is_none());
    }

    #[cfg(unix)]
    #[test]
    fn weigert_een_programmalink_buiten_de_meegelverde_runtime() {
        let (temp, resources, executable) = fixture();
        let outside = temp.path().join("outside-soffice");
        fs::write(&outside, "never executed").unwrap();
        fs::remove_file(&executable).unwrap();
        std::os::unix::fs::symlink(outside, executable).unwrap();
        assert!(vind(&resources).is_none());
    }
}
