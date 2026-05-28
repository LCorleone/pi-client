<script lang="ts">
  import MarkdownRenderer from "./MarkdownRenderer.svelte";

  let { text, isStreaming = false }: { text: string; isStreaming?: boolean } = $props();
</script>

<div class="relative">
  <MarkdownRenderer {text} />
  {#if isStreaming && text}
    <span class="streaming-cursor"></span>
  {/if}
</div>

<style>
  .streaming-cursor {
    display: inline-block;
    animation: blink 1s step-end infinite;
    color: var(--color-accent, #6366f1);
    font-weight: bold;
    margin-left: 2px;
  }

  .streaming-cursor::after {
    content: "▊";
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
</style>
