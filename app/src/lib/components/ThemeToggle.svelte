<script lang="ts">
  import { appSettings } from "../stores/settings.svelte.js";

  function toggle() {
    appSettings.toggleTheme();
  }
</script>

<button
  onclick={toggle}
  class="theme-toggle"
  title="Toggle theme (Ctrl+Shift+T)"
  type="button"
>
  {appSettings.currentTheme === "dark" ? "🌙" : "☀️"}
</button>

<style>
  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.9em;
    transition: background 0.15s;
  }

  .theme-toggle:hover {
    background: var(--color-border, #27272a);
  }
</style>
