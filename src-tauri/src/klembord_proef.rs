//! Expliciete systeemproef op een eigen X11-display; geen gewone bureaubladtest.
use tauri::test::{mock_builder, mock_context, noop_assets};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[test]
#[ignore = "Vereist een geïsoleerd X11-display en OPENAEC_TEST_KLEMBORD=1"]
fn leest_een_nieuwe_externe_kopie() {
    assert_eq!(std::env::var("OPENAEC_TEST_KLEMBORD").as_deref(), Ok("1"));
    assert!(std::env::var_os("DISPLAY").is_some());
    assert!(std::env::var_os("WAYLAND_DISPLAY").is_none());
    let bron = mock_builder()
        .plugin(tauri_plugin_clipboard_manager::init())
        .build(mock_context(noop_assets()))
        .unwrap();
    let doel = mock_builder()
        .plugin(tauri_plugin_clipboard_manager::init())
        .build(mock_context(noop_assets()))
        .unwrap();
    // Aparte verbindingen: de lezer krijgt de systeemkopie van de andere bron.
    bron.clipboard()
        .write_text("Buiten de editor gekopieerd")
        .unwrap();
    assert_eq!(
        doel.clipboard().read_text().unwrap(),
        "Buiten de editor gekopieerd"
    );
    bron.clipboard()
        .write_text("Een nieuwe externe kopie")
        .unwrap();
    assert_eq!(
        doel.clipboard().read_text().unwrap(),
        "Een nieuwe externe kopie"
    );
}
