use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

pub async fn start_sidecars(app: &AppHandle) -> Result<(), String> {
    spawn_named(app, "netease-api", vec![("PORT", "3000"), ("HOST", "127.0.0.1")])?;
    spawn_named(app, "seadio-server", vec![("PORT", "8080")])?;

    wait_for_http("http://127.0.0.1:8080/", Duration::from_secs(30))
        .await
        .map_err(|e| format!("server never became healthy: {e}"))?;
    Ok(())
}

fn spawn_named(app: &AppHandle, name: &str, env: Vec<(&str, &str)>) -> Result<(), String> {
    let mut cmd = app
        .shell()
        .sidecar(name)
        .map_err(|e| format!("sidecar({name}) lookup failed: {e}"))?;
    for (k, v) in env {
        cmd = cmd.env(k, v);
    }
    let (mut rx, _child) = cmd
        .spawn()
        .map_err(|e| format!("sidecar({name}) spawn failed: {e}"))?;

    let label = name.to_string();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("[{label}] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[{label}] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(err) => eprintln!("[{label}] error: {err}"),
                CommandEvent::Terminated(payload) => {
                    eprintln!("[{label}] exited: {:?}", payload);
                    break;
                }
                _ => {}
            }
        }
    });
    Ok(())
}

async fn wait_for_http(url: &str, timeout: Duration) -> Result<(), String> {
    let started = Instant::now();
    loop {
        let url_owned = url.to_string();
        let ok = tokio::task::spawn_blocking(move || {
            reqwest::blocking::Client::builder()
                .timeout(Duration::from_millis(500))
                .build()
                .map_err(|e| e.to_string())
                .and_then(|c| c.get(&url_owned).send().map_err(|e| e.to_string()))
                .map(|r| r.status().is_success() || r.status().is_client_error())
                .unwrap_or(false)
        })
        .await
        .unwrap_or(false);
        if ok {
            return Ok(());
        }
        if started.elapsed() > timeout {
            return Err(format!("timeout after {:?}", timeout));
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
}
