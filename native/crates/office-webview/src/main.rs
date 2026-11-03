use dioxus::{
    desktop::{Config, WindowBuilder, tao::dpi::LogicalSize},
    prelude::*,
};
use open_office_studio_webview::{model::Werkruimte, scherm::Scherm};

fn main() {
    if std::env::args().any(|a| a == "--version") {
        println!("Open Office Studio WebView {}", office_core::VERSIE);
        return;
    }
    dioxus::LaunchBuilder::desktop()
        .with_cfg(
            Config::new().with_menu(None).with_window(
                WindowBuilder::new()
                    .with_title("Open Office Studio — Rust WebView")
                    .with_inner_size(LogicalSize::new(1058., 892.)),
            ),
        )
        .launch(app);
}

fn app() -> Element {
    let mut werk = use_signal(Werkruimte::default);
    use_effect(move || {
        for pad in std::env::args_os().skip(1) {
            open_office_studio_webview::scherm::open_pad(werk, std::path::Path::new(&pad));
        }
    });
    let venster = dioxus::desktop::use_window();
    let sluitvenster = venster.clone();
    let mut terugtonen = false;
    dioxus::desktop::use_wry_event_handler(move |event, _| {
        use dioxus::desktop::{
            WindowCloseBehaviour,
            tao::event::{Event, WindowEvent},
        };
        if let Event::WindowEvent {
            window_id,
            event: WindowEvent::CloseRequested,
            ..
        } = event
            && *window_id == sluitvenster.id()
        {
            let vuil = werk.read().tabbladen.iter().any(|t| t.gewijzigd());
            sluitvenster.set_close_behavior(if vuil {
                WindowCloseBehaviour::WindowHides
            } else {
                WindowCloseBehaviour::WindowCloses
            });
            if vuil {
                werk.write().venster_sluiten = true;
                terugtonen = true;
            }
        }
        // Dioxus verbergt het venster na CloseRequested. Een effect na tekenen
        // kan in een verborgen WebView blijven wachten; herstel via de native lus.
        if terugtonen && matches!(event, Event::MainEventsCleared) {
            terugtonen = false;
            sluitvenster.set_visible(true);
            sluitvenster.set_focus();
        }
    });
    rsx! { Scherm { werk } }
}
