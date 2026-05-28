<script lang="ts">
  import type { Message, ToolCall } from "../stores/session.svelte.js";
  import { session } from "../stores/session.svelte.js";
  import MarkdownRenderer from "./MarkdownRenderer.svelte";
  import StreamingText from "./StreamingText.svelte";
  import ThinkingBlock from "./ThinkingBlock.svelte";
  import ToolCallCard from "./ToolCallCard.svelte";

  let {
    message,
    isLast = false,
  }: {
    message: Message;
    isLast?: boolean;
  } = $props();

  let isUser = $derived(message.role === "user");

  let hasImages = $derived(
    message.images && message.images.length > 0
  );

  // For the last assistant message during streaming, show the active tool calls
  let showActiveTools = $derived(
    isLast && !isUser && session.isStreaming && session.activeToolCalls.size > 0
  );

  let activeToolsList = $derived.by(() => {
    if (!showActiveTools) return [];
    return Array.from(session.activeToolCalls.values());
  });
</script>

<div class="flex {isUser ? 'justify-end' : 'justify-start'}">
  <div class="message-bubble {isUser ? 'user-bubble' : 'assistant-bubble'}">
    {#if isUser}
      <!-- User message: text + images -->
      {#if hasImages}
        <div class="message-images">
          {#each message.images || [] as img, i (i)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="message-image-wrapper"
              onclick={() => window.open(img.dataUrl, "_blank")}
              onkeydown={(e) => { if (e.key === "Enter") window.open(img.dataUrl, "_blank"); }}
              role="link"
              tabindex="0"
            >
              <img src={img.dataUrl} alt={img.name} class="message-image" />
            </div>
          {/each}
        </div>
      {/if}
      <pre class="message-text">{message.content}</pre>
    {:else}
      <!-- Assistant message -->

      <!-- Thinking block (collapsed) -->
      {#if message.thinking}
        <ThinkingBlock content={message.thinking} />
      {/if}

      <!-- Tool call cards from this message -->
      {#if message.toolCalls && message.toolCalls.length > 0}
        {#each message.toolCalls as tc (tc.id)}
          <ToolCallCard toolCall={tc} />
        {/each}
      {/if}

      <!-- Markdown content -->
      {#if message.content}
        <MarkdownRenderer text={message.content} />
      {/if}

      <!-- For the last message during streaming, show streaming content and active tools -->
      {#if isLast && session.isStreaming}
        {#if session.streamingThinking}
          <ThinkingBlock content={session.streamingThinking} />
        {/if}

        {#each activeToolsList as tc (tc.id)}
          <ToolCallCard toolCall={tc} />
        {/each}

        {#if session.streamingText}
          <StreamingText text={session.streamingText} isStreaming={true} />
        {:else if !showActiveTools}
          <span class="typing-indicator">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </span>
        {/if}
      {/if}
    {/if}
  </div>
</div>

<style>
  .message-bubble {
    max-width: 85%;
    padding: 0.75em 1em;
    border-radius: 12px;
    line-height: 1.5;
  }

  .user-bubble {
    background: var(--color-user-bubble, #4f46e5);
    color: #fff;
    border-bottom-right-radius: 4px;
  }

  .assistant-bubble {
    background: var(--color-assistant-bubble, #27272a);
    color: var(--color-text-primary, #e4e4e7);
    border-bottom-left-radius: 4px;
    min-width: 80px;
  }

  .message-text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: 0.9em;
  }

  .message-images {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    margin-bottom: 0.5em;
  }

  .message-image-wrapper {
    display: inline-block;
    cursor: pointer;
  }

  .message-image {
    max-width: 200px;
    max-height: 150px;
    border-radius: 8px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: transform 0.15s, border-color 0.15s;
  }

  .message-image-wrapper:hover .message-image {
    transform: scale(1.02);
    border-color: var(--color-accent, #6366f1);
  }

  .typing-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 0;
  }

  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-secondary, #a1a1aa);
    animation: typing-bounce 1.4s ease-in-out infinite;
  }

  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes typing-bounce {
    0%,
    60%,
    100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }
</style>
