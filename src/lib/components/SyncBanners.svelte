<script lang="ts">
  import { conflictKey } from '$lib/services/draftSync';
  import { logbook } from '$lib/stores/logbook.svelte';

  let resolutions = $state<Record<string, 'left' | 'right'>>({});

  const migration = $derived(logbook.migration);
  const conflicts = $derived(logbook.syncConflicts);

  function choose(key: string, side: 'left' | 'right') {
    resolutions = { ...resolutions, [key]: side };
  }

  function applyResolutions() {
    logbook.resolveConflicts(resolutions);
    resolutions = {};
  }

  function chooseAll(side: 'left' | 'right') {
    const next: Record<string, 'left' | 'right'> = {};
    conflicts.forEach((conflict) => {
      next[conflictKey(conflict)] = side;
    });
    resolutions = next;
  }

  const chosenCount = $derived(Object.keys(resolutions).length);
</script>

{#if migration.state === 'failed'}
  <div class="sync-banner migration-banner" role="alert">
    <div class="banner-text">
      <strong>本地旧数据升级失败，原稿已保留</strong>
      <span>原因：{migration.reason}</span>
      <span>已将原始草稿备份保留，当前展示示例数据且不会覆盖原稿，可重试升级。</span>
    </div>
    <div class="banner-actions">
      <button class="btn btn-sm variant-filled-primary" onclick={() => logbook.retryMigration()}>重试升级</button>
    </div>
  </div>
{/if}

{#if conflicts.length}
  <div class="sync-banner conflict-banner" role="alert">
    <div class="banner-text">
      <strong>与另一标签页的草稿冲突（{conflicts.length} 处），保存已拦下</strong>
      <span>同一区间两边都改过，按区间标识核对后逐段选择；冲突段两边深度如下。</span>
    </div>
    <div class="conflict-list">
      {#each conflicts as conflict, index (conflictKey(conflict))}
        {@const key = conflictKey(conflict)}
        <div class="conflict-row">
          <span class="conflict-message" title={conflict.message}>{index + 1}. {conflict.message}</span>
          {#if conflict.kind !== 'interval'}
            <span class="depth-chip">{conflict.leftDepth ?? conflict.leftValue}</span>
            <span class="depth-sep">↔</span>
            <span class="depth-chip">{conflict.rightDepth ?? conflict.rightValue}</span>
          {:else}
            <span class="depth-chip left">本页 {conflict.leftDepth}</span>
            <span class="depth-sep">↔</span>
            <span class="depth-chip right">他页 {conflict.rightDepth}</span>
          {/if}
          <div class="conflict-choice">
            <button class:chosen={resolutions[key] === 'left'} onclick={() => choose(key, 'left')}>保留本页</button>
            <button class:chosen={resolutions[key] === 'right'} onclick={() => choose(key, 'right')}>采用他页</button>
          </div>
        </div>
      {/each}
    </div>
    <div class="banner-actions">
      <button class="btn btn-sm variant-soft" onclick={() => chooseAll('left')}>全选本页</button>
      <button class="btn btn-sm variant-soft" onclick={() => chooseAll('right')}>全选他页</button>
      <button class="btn btn-sm variant-soft" onclick={() => logbook.discardRemoteConflicts()}>放弃本页改动</button>
      <button
        class="btn btn-sm variant-filled-primary"
        disabled={chosenCount < conflicts.length}
        onclick={applyResolutions}
      >
        合并保存{chosenCount < conflicts.length ? `（还差 ${conflicts.length - chosenCount} 处）` : ''}
      </button>
    </div>
  </div>
{/if}

<style>
  .sync-banner { margin: 10px 16px 0; border-radius: 10px; padding: 10px 14px; display: grid; gap: 8px; }
  .migration-banner { border: 1px solid #fca5a5; background: #fef2f2; color: #991b1b; }
  .conflict-banner { border: 1px solid #fcd34d; background: #fffbeb; color: #92400e; }
  .banner-text { display: grid; gap: 2px; }
  .banner-text strong { font-size: 13px; }
  .banner-text span { font-size: 11px; }
  .conflict-list { display: grid; gap: 5px; max-height: 180px; overflow: auto; }
  .conflict-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; background: #fff; border: 1px solid #fde68a; border-radius: 8px; padding: 6px 10px; font-size: 11px; }
  .conflict-message { flex: 1 1 320px; color: #172033; font-weight: 650; }
  .depth-chip { font-variant-numeric: tabular-nums; background: #f1f5f9; border-radius: 6px; padding: 2px 7px; color: #334155; font-size: 10px; white-space: nowrap; }
  .depth-chip.left { background: #eef2ff; color: #3730a3; }
  .depth-chip.right { background: #ecfdf5; color: #065f46; }
  .depth-sep { color: #94a3b8; }
  .conflict-choice { display: flex; gap: 4px; }
  .conflict-choice button { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 3px 9px; font-size: 10px; cursor: pointer; }
  .conflict-choice button.chosen { border-color: #0f766e; background: #ccfbf1; color: #0f766e; font-weight: 800; }
  .banner-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
</style>
