use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::{process::CommandChild, ShellExt};
use tokio::sync::Mutex;

/// Shared bridge process handle
pub struct BridgeProcess {
    child: Arc<Mutex<Option<CommandChild>>>,
}

impl BridgeProcess {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
        }
    }

    /// Send a JSON command to the bridge via stdin
    pub async fn send_command(&self, cmd: &serde_json::Value) -> Result<(), String> {
        let mut guard = self.child.lock().await;
        let child = guard.as_mut().ok_or("Bridge not running")?;
        let mut line = serde_json::to_string(cmd).map_err(|e| e.to_string())?;
        line.push('\n');
        child.write(line.as_bytes()).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Store the child handle
    pub async fn set_child(&self, new_child: CommandChild) {
        let mut guard = self.child.lock().await;
        *guard = Some(new_child);
    }

    /// Kill the bridge process
    pub async fn kill(&self) {
        let mut guard = self.child.lock().await;
        if let Some(child) = guard.take() {
            let _ = child.kill();
        }
    }
}

/// Spawn the bridge sidecar, attach it to an existing BridgeProcess, and read events.
pub async fn spawn_and_attach(app: &AppHandle, bridge: &Arc<BridgeProcess>) -> Result<(), String> {
    // Start the sidecar
    let (mut rx, child) = app
        .shell()
        .sidecar("pi-bridge")
        .map_err(|e| format!("Failed to create sidecar: {e}"))?
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

    bridge.set_child(child).await;

    // Read events from bridge stdout and emit to frontend
    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    let trimmed = String::from_utf8_lossy(&line);
                    let trimmed = trimmed.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    let _ = app_handle.emit(
                        "agent_event",
                        serde_json::from_str::<serde_json::Value>(trimmed)
                            .unwrap_or_else(|_| serde_json::json!({ "raw": trimmed })),
                    );
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    eprintln!("Bridge stderr: {}", text.trim());
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                    eprintln!("Bridge process exited: {:?}", status);
                    let _ = app_handle.emit("bridge_exited", ());
                    break;
                }
                tauri_plugin_shell::process::CommandEvent::Error(err) => {
                    eprintln!("Bridge error: {}", err);
                    let _ = app_handle.emit("bridge_exited", ());
                    break;
                }
            }
        }
    });

    Ok(())
}
