<script lang="ts">
  import { page } from '$app/state';
  import { logbook } from '$lib/stores/logbook.svelte';
  import '../app.css';

  let { children } = $props();
</script>

<svelte:head>
  <title>CoreColumn 地质钻芯编录</title>
</svelte:head>

<div class="app-frame">
  <header class="app-header">
    <a class="brand" href="/">
      <span class="brand-icon">CC</span>
      <span><strong>CoreColumn</strong><small>地质钻芯编录与柱状图编辑器</small></span>
    </a>
    <nav>
      <a class:active={page.url.pathname === '/'} href="/">单孔编录</a>
      <a class:active={page.url.pathname.startsWith('/compare')} href="/compare">多孔对比</a>
    </nav>
    <div class="header-status">
      <span class="status-dot"></span>
      <span>{logbook.holes.length} 孔 · {logbook.message || '本地自动保存'}</span>
    </div>
  </header>
  {@render children()}
</div>

