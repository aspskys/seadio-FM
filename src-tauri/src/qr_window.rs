use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn open_netease_qr(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("netease-qr") {
        let _ = existing.set_focus();
        return Ok(());
    }
    let url = WebviewUrl::External(
        "http://127.0.0.1:8080/netease/qr-login"
            .parse()
            .map_err(|e: url::ParseError| e.to_string())?,
    );
    WebviewWindowBuilder::new(&app, "netease-qr", url)
        .title("Netease Login")
        .inner_size(360.0, 480.0)
        .resizable(false)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}
