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
    let mut werk = use_signal(|| {
        let mut w = Werkruimte::default();
        for pad in std::env::args_os().skip(1) {
            let r = w.open(std::path::Path::new(&pad)).map(|_| ());
            w.meld(r);
        }
        w
    });
    let venster = dioxus::desktop::use_window();
    let sluitvenster = venster.clone();
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
            }
        }
    });
    use_effect(move || {
        if werk.read().venster_sluiten {
            venster.set_visible(true);
        }
    });
    rsx! { Scherm { werk } }
}
