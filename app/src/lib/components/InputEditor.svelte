<script lang="ts">
  import { sendPrompt, abortAgent, steer } from "../ipc.js";
  import { session } from "../stores/session.svelte.js";

  let inputText = $state("");
  let textarea: HTMLTextAreaElement | undefined = $state();

  function autoResize() {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + "px";
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text && session.pendingImages.length === 0) return;

    // Add user message to local state immediately (with images)
    const images = session.getPendingImages();
    session.addUserMessage(text || "📷 Image", images.length > 0 ? images : undefined);
    session.clearPendingImages();
    inputText = "";
    if (textarea) {
      textarea.style.height = "auto";
    }

    try {
      if (session.isStreaming) {
        await steer(text);
      } else {
        await sendPrompt(text, images.length > 0 ? images : undefined);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      session.error = msg;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape" && session.isStreaming) {
      e.preventDefault();
      handleAbort();
    }
  }

  async function handleAbort() {
    try {
      await abortAgent();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to abort";
      session.error = msg;
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const name = `image_${Date.now()}.${item.type.split("/")[1] || "png"}`;
          session.addPendingImage({ dataUrl, name });
        };
        reader.readAsDataURL(blob);
      }
    }
  }

  function removeImage(index: number) {
    session.removePendingImage(index);
  }

  let canSend = $derived(
    (inputText.trim().length > 0 || session.pendingImages.length > 0) && session.initialized
  );
</script>

<div class="input-area">
  <!-- Image previews -->
  {#if session.pendingImages.length > 0}
    <div class="image-previews">
      {#each session.pendingImages as img, i (i)}
        <div class="image-preview">
          <img src={img.dataUrl} alt={img.name} class="preview-thumb" />
          <button class="remove-image" onclick={() => removeImage(i)} title="Remove image">
            ✕
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <div class="input-container">
    <div class="input-wrapper">
      <textarea
        bind:this={textarea}
        bind:value={inputText}
        oninput={autoResize}
        onkeydown={handleKeydown}
        onpaste={handlePaste}
        placeholder={session.isStreaming ? "Agent is working... (Escape to abort)" : "Message Pi... (Enter to send, Shift+Enter for new line, Ctrl+V to paste image)"}
        disabled={!session.initialized}
        rows="1"
        class="input-field"
      ></textarea>
    </div>

    {#if session.isStreaming}
      <button
        onclick={handleAbort}
        class="btn btn-abort"
        title="Abort (Esc)"
      >
        ■
      </button>
    {:else}
      <button
        onclick={handleSend}
        disabled={!canSend}
        class="btn btn-send"
        title="Send (Enter)"
      >
        ▶
      </button>
    {/if}
  </div>
</div>

<style>
  .input-area {
    border-top: 1px solid var(--color-border, #27272a);
    padding: 0.75em 1em;
    background: var(--color-bg-secondary, #16213e);
  }

  .image-previews {
    display: flex;
    gap: 0.5em;
    margin-bottom: 0.5em;
    flex-wrap: wrap;
  }

  .image-preview {
    position: relative;
    display: inline-flex;
  }

  .preview-thumb {
    width: 64px;
    height: 64px;
    object-fit: cover;
    border-radius: 8px;
    border: 1px solid var(--color-border, #27272a);
  }

  .remove-image {
    position: absolute;
    top: -6px;
    right: -6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid var(--color-border, #27272a);
    background: var(--color-bg-secondary, #16213e);
    color: var(--color-error, #ef4444);
    font-size: 0.65em;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .remove-image:hover {
    background: var(--color-error, #ef4444);
    color: white;
  }

  .input-container {
    display: flex;
    align-items: flex-end;
    gap: 0.5em;
    max-width: 900px;
    margin: 0 auto;
  }

  .input-wrapper {
    flex: 1;
  }

  .input-field {
    width: 100%;
    resize: none;
    border-radius: 12px;
    border: 1px solid var(--color-border, #27272a);
    background: var(--color-bg-primary, #1a1a2e);
    padding: 0.75em 1em;
    font-size: 0.9em;
    line-height: 1.5;
    color: var(--color-text-primary, #e4e4e7);
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
  }

  .input-field::placeholder {
    color: var(--color-text-secondary, #a1a1aa);
    font-size: 0.85em;
  }

  .input-field:focus {
    border-color: var(--color-accent, #6366f1);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
  }

  .input-field:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    border: none;
    font-size: 1em;
    cursor: pointer;
    transition: background 0.2s, opacity 0.2s;
    flex-shrink: 0;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-send {
    background: var(--color-accent, #6366f1);
    color: white;
  }

  .btn-send:hover:not(:disabled) {
    background: var(--color-accent-hover, #818cf8);
  }

  .btn-abort {
    background: #dc2626;
    color: white;
  }

  .btn-abort:hover {
    background: #b91c1c;
  }
</style>
