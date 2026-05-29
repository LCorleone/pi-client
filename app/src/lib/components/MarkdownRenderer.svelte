<script lang="ts">
  import { Marked } from "marked";
  import DOMPurify from "dompurify";
  import hljs from "highlight.js";
  import "highlight.js/styles/github-dark.css";

  let { text }: { text: string } = $props();

  // Configure marked with highlight.js
  const marked = new Marked({
    renderer: {
      code({ text: codeText, lang }: { text: string; lang?: string }) {
        const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
        const highlighted = hljs.highlight(codeText, { language }).value;
        return `<pre class="code-block"><code class="hljs language-${language}">${highlighted}</code></pre>`;
      },
    },
  });

  let renderedHtml = $derived.by(() => {
    if (!text) return "";
    try {
      // Handle incomplete markdown during streaming:
      // Close unclosed code blocks
      let safeText = text;
      const backtickCount = (safeText.match(/```/g) || []).length;
      if (backtickCount % 2 !== 0) {
        safeText += "\n```";
      }
      const rawHtml = marked.parse(safeText, { async: false }) as string;
      return DOMPurify.sanitize(rawHtml);
    } catch {
      // Fallback: escape and display as-is
      return `<p>${text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`;
    }
  });
</script>

<div class="markdown-content">
  {@html renderedHtml}
</div>

<style>
  .markdown-content :global(p) {
    margin: 0.5em 0;
    line-height: 1.6;
  }

  .markdown-content :global(p:first-child) {
    margin-top: 0;
  }

  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4),
  .markdown-content :global(h5),
  .markdown-content :global(h6) {
    margin: 1em 0 0.5em;
    font-weight: 600;
    line-height: 1.3;
  }

  .markdown-content :global(h1) {
    font-size: 1.5em;
  }
  .markdown-content :global(h2) {
    font-size: 1.3em;
  }
  .markdown-content :global(h3) {
    font-size: 1.15em;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }

  .markdown-content :global(li) {
    margin: 0.25em 0;
    line-height: 1.5;
  }

  .markdown-content :global(code) {
    font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 0.875em;
  }

  .markdown-content :global(:not(pre) > code) {
    background: var(--color-bg-primary, #1a1a2e);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    color: #e8b4b8;
  }

  .markdown-content :global(.code-block) {
    margin: 0.75em 0;
    padding: 1em;
    border-radius: 8px;
    overflow-x: auto;
    background: #0d1117;
    border: 1px solid var(--color-border, #27272a);
  }

  .markdown-content :global(.code-block code) {
    font-size: 0.85em;
    line-height: 1.5;
  }

  .markdown-content :global(blockquote) {
    margin: 0.5em 0;
    padding: 0.5em 1em;
    border-left: 3px solid var(--color-accent, #6366f1);
    background: rgba(99, 102, 241, 0.08);
    border-radius: 0 4px 4px 0;
  }

  .markdown-content :global(table) {
    border-collapse: collapse;
    margin: 0.75em 0;
    width: 100%;
  }

  .markdown-content :global(th),
  .markdown-content :global(td) {
    border: 1px solid var(--color-border, #27272a);
    padding: 0.5em 0.75em;
    text-align: left;
  }

  .markdown-content :global(th) {
    background: var(--color-bg-primary, #1a1a2e);
    font-weight: 600;
  }

  .markdown-content :global(a) {
    color: var(--color-accent, #6366f1);
    text-decoration: none;
  }

  .markdown-content :global(a:hover) {
    text-decoration: underline;
  }

  .markdown-content :global(hr) {
    border: none;
    border-top: 1px solid var(--color-border, #27272a);
    margin: 1em 0;
  }

  .markdown-content :global(strong) {
    font-weight: 600;
  }

  .markdown-content :global(img) {
    max-width: 100%;
    border-radius: 8px;
  }
</style>
