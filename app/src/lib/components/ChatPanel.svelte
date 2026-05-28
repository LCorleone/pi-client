<script lang="ts">
  import { session } from "../stores/session.svelte.js";
  import { onMount, tick } from "svelte";
  import MessageBubble from "./MessageBubble.svelte";

  let chatContainer: HTMLDivElement | undefined = $state();

  // Auto-scroll when messages change or streaming text updates
  async function scrollToBottom() {
    await tick();
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  // Watch for message changes
  $effect(() => {
    const count = session.messages.length;
    const text = session.streamingText;
    scrollToBottom();
  });

  // Empty state
  let isEmpty = $derived(session.messages.length === 0 && !session.isStreaming);
</script>

<div
  bind:this={chatContainer}
  class="chat-panel"
>
  {#if isEmpty}
    <div class="empty-state">
      <div class="empty-icon">🤖</div>
      <div class="empty-title">Start a conversation</div>
      <p class="empty-desc">
        Type a message below to interact with the Pi coding agent.
      </p>
    </div>
  {:else}
    <div class="messages-container">
      {#each session.messages as msg, i (msg.id)}
        <MessageBubble message={msg} isLast={i === session.messages.length - 1} />
      {/each}

      <!-- If streaming and no messages yet, show the streaming bubble -->
      {#if session.isStreaming && session.messages.length === 0}
        <MessageBubble
          message={{ id: "streaming", role: "assistant", content: "", timestamp: Date.now() }}
          isLast={true}
        />
      {/if}
    </div>
  {/if}
</div>

<style>
  .chat-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    padding: 1em;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
    color: var(--color-text-secondary, #a1a1aa);
  }

  .empty-icon {
    font-size: 3em;
    margin-bottom: 0.5em;
    opacity: 0.6;
  }

  .empty-title {
    font-size: 1.25em;
    font-weight: 600;
    color: var(--color-text-primary, #e4e4e7);
    margin-bottom: 0.25em;
  }

  .empty-desc {
    font-size: 0.9em;
    max-width: 320px;
    margin: 0;
  }

  .messages-container {
    display: flex;
    flex-direction: column;
    gap: 1em;
    max-width: 900px;
    margin: 0 auto;
    width: 100%;
  }
</style>
