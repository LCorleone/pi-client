use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

/// Shared bridge process handle
pub struct BridgeProcess {
    child: Arc<Mutex<Option<Child>>>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    ready: AtomicBool,
    last_error: Arc<Mutex<Option<String>>>,
}

impl BridgeProcess {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            stdin: Arc::new(Mutex::new(None)),
            ready: AtomicBool::new(false),
            last_error: Arc::new(Mutex::new(None)),
        }
    }

    /// Check if the bridge sidecar is running and ready
    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::SeqCst)
    }

    /// Send a JSON command to the bridge via stdin
    pub async fn send_command(&self, cmd: &serde_json::Value) -> Result<(), String> {
        let mut guard = self.stdin.lock().await;
        let stdin = guard.as_mut().ok_or("Bridge not running")?;
        let mut line = serde_json::to_string(cmd).map_err(|e| e.to_string())?;
        line.push('\n');
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to bridge: {e}"))?;
        stdin.flush().await.map_err(|e| format!("Failed to flush: {e}"))?;
        Ok(())
    }

    /// Kill the bridge process
    pub async fn kill(&self) {
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take() {
            let _ = child.kill().await;
        }
        self.ready.store(false, Ordering::SeqCst);
        // Also clear stdin
        let mut stdin_guard = self.stdin.lock().await;
        *stdin_guard = None;
    }

    /// Store the last error from bridge spawn failure
    pub async fn set_error(&self, error: String) {
        let mut guard = self.last_error.lock().await;
        *guard = Some(error);
    }

    /// Get the last error (if any)
    pub async fn get_error(&self) -> Option<String> {
        let guard = self.last_error.lock().await;
        guard.clone()
    }
}

/// Get the bridge binary name for the current platform
fn bridge_binary_name() -> String {
    if cfg!(target_os = "windows") {
        "pi-bridge-x86_64-pc-windows-msvc.exe".to_string()
    } else if cfg!(target_arch = "aarch64") && cfg!(target_os = "macos") {
        "pi-bridge-aarch64-apple-darwin".to_string()
    } else if cfg!(target_arch = "x86_64") && cfg!(target_os = "macos") {
        "pi-bridge-x86_64-apple-darwin".to_string()
    } else {
        "pi-bridge-x86_64-unknown-linux-gnu".to_string()
    }
}

/// Spawn the bridge process, attach it to an existing BridgeProcess, and read events.
pub async fn spawn_and_attach(app: &AppHandle, bridge: &Arc<BridgeProcess>) -> Result<(), String> {
    // Resolve bridge path: next to the main executable
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Cannot find exe path: {e}"))?
        .parent()
        .ok_or("Cannot determine exe directory")?
        .to_path_buf();

    let bridge_name = bridge_binary_name();
    let bridge_path = exe_dir.join(&bridge_name);

    if !bridge_path.exists() {
        return Err(format!(
            "Bridge binary not found at {}",
            bridge_path.display()
        ));
    }

    // Spawn the bridge process
    let mut child = Command::new(&bridge_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn bridge at {}: {e}", bridge_path.display()))?;

    let stdin = child.stdin.take().ok_or("Failed to get bridge stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get bridge stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get bridge stderr")?;

    // Store handles
    {
        let mut guard = bridge.child.lock().await;
        *guard = Some(child);
    }
    {
        let mut guard = bridge.stdin.lock().await;
        *guard = Some(stdin);
    }
    bridge.ready.store(true, Ordering::SeqCst);

    // Clone for cleanup
    let bridge_clone = bridge.clone();

    // Read stdout line by line and emit to frontend
    let app_handle = app.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let _ = app_handle.emit(
                "agent_event",
                serde_json::from_str::<serde_json::Value>(trimmed)
                    .unwrap_or_else(|_| serde_json::json!({ "raw": trimmed })),
            );
        }
        // stdout closed — bridge exited
        eprintln!("Bridge stdout closed");
        bridge_clone.kill().await;
        let _ = app_handle.emit("bridge_exited", ());
    });

    // Read stderr for logging
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("Bridge stderr: {}", line.trim());
        }
    });

    // Notify the frontend that the bridge is up and ready
    let _ = app.emit("bridge_ready", ());

    Ok(())
}
