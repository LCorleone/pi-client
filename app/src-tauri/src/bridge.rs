use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::{process::CommandChild, ShellExt};
use tokio::io::{AsyncBufReadExt, BufReader};
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

/// Spawn the bridge sidecar and read events
pub async fn spawn_bridge(app: &AppHandle) -> Result<(), String> {
    let bridge = BridgeProcess::new();
    let bridge = Arc::new(bridge);

    // Start the sidecar
    let (rx, child) = app
        .shell()
        .sidecar("pi-bridge")
        .map_err(|e| format!("Failed to create sidecar: {e}"))?
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

    bridge.set_child(child).await;

    // Store bridge in app state (we'll manage it separately)
    app.manage(bridge.clone());

    // Read events from bridge stdout and emit to frontend
    let app_handle = app.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(rx);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => {
                    // EOF — bridge exited
                    eprintln!("Bridge process exited");
                    let _ = app_handle.emit("bridge_exited", ());
                    break;
                }
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    // Emit the raw JSON line as a bridge event
                    let _ = app_handle.emit(
                        "agent_event",
                        serde_json::from_str::<serde_json::Value>(trimmed)
                            .unwrap_or_else(|_| serde_json::json!({ "raw": trimmed })),
                    );
                }
                Err(e) => {
                    eprintln!("Bridge read error: {e}");
                    break;
                }
            }
        }
    });

    Ok(())
}
