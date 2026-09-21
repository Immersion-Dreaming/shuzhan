use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

#[cfg(target_os = "macos")]
tauri_nspanel::tauri_panel! {
    panel!(CompanionPanel {
        config: {
            can_become_key_window: false,
            can_become_main_window: false,
            becomes_key_only_if_needed: true,
            is_floating_panel: true
        }
    })
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn is_companion_visible(app: tauri::AppHandle) -> bool {
    app.get_webview_window("companion")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

#[tauri::command]
fn update_tray_status(app: tauri::AppHandle, title: Option<String>) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(title);
    }
}

#[cfg(target_os = "macos")]
fn companion_collection_behavior() -> tauri_nspanel::objc2_app_kit::NSWindowCollectionBehavior {
    use tauri_nspanel::objc2_app_kit::NSWindowCollectionBehavior;

    NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::CanJoinAllApplications
        | NSWindowCollectionBehavior::FullScreenAuxiliary
        | NSWindowCollectionBehavior::Stationary
        | NSWindowCollectionBehavior::IgnoresCycle
}

#[cfg(target_os = "macos")]
fn companion_window_level() -> i64 {
    tauri_nspanel::PanelLevel::ScreenSaver.value()
}

#[cfg(target_os = "macos")]
fn configure_companion_panel(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use tauri_nspanel::{objc2_app_kit::NSWindowStyleMask, WebviewWindowExt};

    let panel = window.to_panel::<CompanionPanel>()?;
    panel.set_floating_panel(true);
    panel.set_hides_on_deactivate(false);
    panel.set_released_when_closed(false);
    panel.set_level(companion_window_level());
    panel.set_collection_behavior(companion_collection_behavior());
    panel
        .add_style_mask(NSWindowStyleMask::NonactivatingPanel)
        .map_err(|error| tauri::Error::Anyhow(error.into()))?;
    panel.order_front_regardless();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app.clone());
        }))
        .plugin(tauri_nspanel::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            update_tray_status,
            show_main_window,
            is_companion_visible
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.handle()
                    .set_activation_policy(tauri::ActivationPolicy::Accessory)?;
                if let Some(companion) = app.get_webview_window("companion") {
                    configure_companion_panel(&companion)?;
                }
            }

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
            let companion =
                MenuItem::with_id(app, "companion", "显示 / 隐藏悬浮精灵", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出舒展", true, None::<&str>)?;
            let menu =
                Menu::with_items(app, &[&open, &toggle, &end, &companion, &separator, &quit])?;

            let mut tray = TrayIconBuilder::with_id("main")
                .menu(&menu)
                .tooltip("舒展 · 工作健康提醒")
                .title("舒");

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone()).icon_as_template(true);
            }

            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "open" => show_main_window(app.clone()),
                "toggle" => {
                    let _ = app.emit("tray-command", "toggle");
                }
                "end" => {
                    let _ = app.emit("tray-command", "end");
                }
                "companion" => {
                    if let Some(window) = app.get_webview_window("companion") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                            let _ = app.emit("companion-visibility", false);
                        } else {
                            let _ = window.show();
                            let _ = app.emit("companion-visibility", true);
                        }
                    }
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
                show_main_window(app.clone());
            }
        });
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use tauri_nspanel::objc2_app_kit::NSWindowCollectionBehavior;

    #[test]
    fn companion_panel_policy_spans_other_apps_fullscreen_spaces() {
        let behavior = companion_collection_behavior();

        assert!(behavior.contains(NSWindowCollectionBehavior::CanJoinAllSpaces));
        assert!(behavior.contains(NSWindowCollectionBehavior::CanJoinAllApplications));
        assert!(behavior.contains(NSWindowCollectionBehavior::FullScreenAuxiliary));
        assert!(behavior.contains(NSWindowCollectionBehavior::Stationary));
        assert_eq!(companion_window_level(), 1000);
    }
}
