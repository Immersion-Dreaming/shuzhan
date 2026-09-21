use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn update_tray_status(app: tauri::AppHandle, title: Option<String>) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(title);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![update_tray_status])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let open = MenuItem::with_id(app, "open", "打开舒展", true, None::<&str>)?;
            let toggle =
                MenuItem::with_id(app, "toggle", "开始 / 暂停 / 继续", true, None::<&str>)?;
            let end = MenuItem::with_id(app, "end", "结束本次工作", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出舒展", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &toggle, &end, &separator, &quit])?;

            let mut tray = TrayIconBuilder::with_id("main")
                .menu(&menu)
                .tooltip("舒展 · 工作健康提醒")
                .title("舒");

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone()).icon_as_template(true);
            }

            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "open" => show_main_window(app),
                "toggle" => {
                    let _ = app.emit("tray-command", "toggle");
                }
                "end" => {
                    let _ = app.emit("tray-command", "end");
                }
                "quit" => app.exit(0),
                _ => {}
            })
            .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } = event
            {
                show_main_window(app);
            }
        });
}
