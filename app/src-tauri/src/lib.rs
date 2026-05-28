use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager,
};

mod bridge;
mod commands;
mod session;
mod state;

/// Bridge event payload emitted to the frontend
#[derive(Debug, Clone, serde::Serialize)]
pub struct BridgeEventPayload {
    pub raw: String,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // ── System Tray ─────────────────────────────────────
            let show_item = MenuItemBuilder::with_id("show", "Show Pi Desktop").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .tooltip("Pi Desktop")
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // ── Window close → hide to tray ─────────────────────
            if let Some(window) = app.get_webview_window("main") {
                // Override close behavior: hide instead of quit
                let win = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                });
            }

            // ── Global Shortcut (Ctrl+Shift+P) ──────────────────
            // NOTE: In Tauri v2, global shortcuts require the
            // tauri-plugin-global-shortcut plugin. For now we register
            // the shortcut via the frontend keydown handler as a fallback.
            // The plugin can be added later for system-wide shortcuts.

            // ── Spawn bridge sidecar ─────────────────────────────
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = bridge::spawn_bridge(&handle).await {
                    eprintln!("Bridge error: {e}");
                }
            });

            Ok(())
        })
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            // Session persistence
            commands::list_sessions,
            commands::load_session,
            commands::save_session,
            commands::delete_session,
            commands::rename_session,
            commands::get_last_session_id,
            // Bridge commands
            commands::send_prompt,
            commands::abort_agent,
            commands::set_model,
            commands::get_models,
            commands::get_state,
            commands::get_messages,
            commands::new_session,
            commands::init_session,
            commands::pick_directory,
            commands::steer,
            commands::follow_up,
            commands::update_bridge_config,
            commands::compact,
            // File browser
            commands::list_files,
            // Settings
            commands::get_settings,
            commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
