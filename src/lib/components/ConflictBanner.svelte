<script lang="ts">
  import { logbook } from '$lib/stores/logbook.svelte';

  let conflicts = $derived(logbook.conflicts);

  function holeName(holeId: string) {
    return logbook.holes.find((item) => item.id === holeId)?.name ?? holeId;
  }
</script>

{#if conflicts.length}
  <section class="conflict-banner">
    <header>
      <strong>检测到 {conflicts.length} 处区间深度冲突</strong>
      <span>两个标签页保存了同一份草稿，以下区间两边深度不一致。已先拦下并保留本地，请选择采用哪一边。</span>
    </header>
    <ul>
      {#each conflicts as conflict (conflict.holeId + conflict.intervalId)}
        <li>
          <div class="conflict-target">
            <strong>{holeName(conflict.holeId)}</strong>
            <code>{conflict.intervalId}</code>
          </div>
          <div class="conflict-depths">
            <div class="depth-box local">
              <span>本地</span>
              <strong>{conflict.local.from.toFixed(1)} – {conflict.local.to.toFixed(1)} m</strong>
            </div>
            <div class="depth-box remote">
              <span>远程</span>
              <strong>{conflict.remote.from.toFixed(1)} – {conflict.remote.to.toFixed(1)} m</strong>
            </div>
          </div>
          <div class="conflict-actions">
            <button class="btn btn-sm variant-soft" onclick={() => logbook.keepLocalDepth(conflict)}>
              保留本地
            </button>
            <button
              class="btn btn-sm variant-filled-primary"
              onclick={() => logbook.adoptRemoteDepth(conflict)}
            >
              采用远程
            </button>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .conflict-banner {
    border: 1px solid #fde68a;
    background: #fffbeb;
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }
  .conflict-banner header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 10px;
  }
  .conflict-banner strong {
    color: #92400e;
    font-size: 13px;
  }
  .conflict-banner header span {
    color: #78350f;
    font-size: 11px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #fff;
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 8px 10px;
    flex-wrap: wrap;
  }
  .conflict-target {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 120px;
  }
  .conflict-target strong {
    color: #172033;
    font-size: 12px;
  }
  .conflict-target code {
    font-size: 10px;
    color: #64748b;
  }
  .conflict-depths {
    display: flex;
    gap: 8px;
    flex: 1;
    min-width: 260px;
  }
  .depth-box {
    flex: 1;
    border-radius: 6px;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .depth-box.local {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
  }
  .depth-box.remote {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
  }
  .depth-box span {
    font-size: 10px;
    color: #64748b;
  }
  .depth-box strong {
    font-size: 12px;
    color: #0f172a;
  }
  .conflict-actions {
    display: flex;
    gap: 6px;
  }
</style>
