<script lang="ts">
  import { onMount } from 'svelte';
  import DepthLog from '$lib/components/DepthLog.svelte';
  import IntervalTable from '$lib/components/IntervalTable.svelte';
  import PhotoPanel from '$lib/components/PhotoPanel.svelte';
  import { logbook } from '$lib/stores/logbook.svelte';
  import { downloadJson, printLog } from '$lib/utils/exports';

  let zoom = $state(1);
  let topDepth = $state(0);
  let bottomDepth = $state(62);
  let panning = $state(false);
  let panStartY = $state(0);
  let panStartTop = $state(0);

  let activeHole = $derived(logbook.activeHole);
  let selectedInterval = $derived(logbook.selectedInterval);
  let visibleSpan = $derived((activeHole?.totalDepth ?? 62) / zoom);

  onMount(() => {
    logbook.selectHole(logbook.activeHoleId);
  });

  $effect(() => {
    if (activeHole) {
      if (zoom === 1) {
        topDepth = 0;
        bottomDepth = activeHole.totalDepth;
      } else {
        bottomDepth = Math.min(activeHole.totalDepth, topDepth + visibleSpan);
      }
    }
  });

  function changeZoom(next: number) {
    const center = (topDepth + bottomDepth) / 2;
    zoom = Math.max(1, Math.min(5, next));
    const span = (activeHole?.totalDepth ?? 62) / zoom;
    topDepth = Math.max(0, Math.min((activeHole?.totalDepth ?? 62) - span, center - span / 2));
    bottomDepth = topDepth + span;
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    changeZoom(zoom * (event.deltaY < 0 ? 1.15 : 0.87));
  }

  function beginPan(event: PointerEvent) {
    if (zoom <= 1) return;
    panning = true;
    panStartY = event.clientY;
    panStartTop = topDepth;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function movePan(event: PointerEvent) {
    if (!panning || !activeHole) return;
    const span = activeHole.totalDepth / zoom;
    const delta = ((event.clientY - panStartY) / 650) * span;
    topDepth = Math.max(0, Math.min(activeHole.totalDepth - span, panStartTop - delta));
    bottomDepth = topDepth + span;
  }

  function endPan(event: PointerEvent) {
    if (!panning) return;
    panning = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }
</script>

<svelte:head><title>单孔编录 · CoreColumn</title></svelte:head>

<div class="workbench">
  <aside class="hole-sidebar">
    <div class="section-head">
      <div><span>钻孔列表</span><strong>{activeHole?.project ?? ''}</strong></div>
      <button class="btn btn-sm variant-filled-primary" onclick={() => logbook.addHole()}>新增</button>
    </div>
    <div class="hole-list">
      {#each logbook.holes as hole}
        <button class:active={hole.id === activeHole?.id} class="hole-card" onclick={() => logbook.selectHole(hole.id)}>
          <span class="hole-code">{hole.name}</span>
          <span>{hole.totalDepth} m · {hole.intervals.length} 段</span>
          <small>{hole.coordinates}</small>
        </button>
      {/each}
    </div>
    <div class="hole-meta">
      <label>项目名称<input value={activeHole?.project ?? ''} disabled /></label>
      <label>孔口高程 (m)<input value={activeHole?.collarElevation ?? 0} disabled /></label>
      <label>终孔深度 (m)<input value={activeHole?.totalDepth ?? 0} disabled /></label>
    </div>
    <button class="btn variant-soft-error" disabled={logbook.holes.length <= 1} onclick={() => activeHole && logbook.removeHole(activeHole.id)}>
      删除当前钻孔
    </button>
  </aside>

  <main class="main-workbench">
    <div class="toolbar">
      <div>
        <span class="crumb">钻探编录 / 单孔柱状图</span>
        <h1>{activeHole?.name}</h1>
      </div>
      <div class="toolbar-actions">
        <button class="btn btn-sm variant-soft" onclick={() => logbook.undo()} disabled={!logbook.history.length}>撤销</button>
        <button class="btn btn-sm variant-soft" onclick={() => logbook.redo()} disabled={!logbook.future.length}>重做</button>
        <button class="btn btn-sm variant-soft" onclick={() => logbook.splitSelected()}>拆分区间</button>
        <button class="btn btn-sm variant-soft" onclick={() => logbook.mergeSelectedWithNext()}>合并下一段</button>
        <button class="btn btn-sm variant-soft" onclick={() => downloadJson(logbook.holes, logbook.activeHoleId)}>导出 JSON</button>
        <button class="btn btn-sm variant-filled-primary" onclick={printLog}>打印柱状图</button>
      </div>
    </div>

    {#if logbook.errors.length}
      <div class="validation-banner">
        <strong>深度校验未通过</strong>
        {#each logbook.errors as error}<span>{error}</span>{/each}
      </div>
    {/if}

    <div class="editor-grid">
      <section class="log-card">
        <div class="card-toolbar">
          <div>
            <strong>岩性柱状图</strong>
            <span>深度 {topDepth.toFixed(1)}–{bottomDepth.toFixed(1)} m · {zoom.toFixed(1)}×</span>
          </div>
          <div class="zoom-controls">
            <button onclick={() => changeZoom(zoom / 1.25)}>-</button>
            <button onclick={() => { zoom = 1; topDepth = 0; bottomDepth = activeHole?.totalDepth ?? 62; }}>适应</button>
            <button onclick={() => changeZoom(zoom * 1.25)}>+</button>
          </div>
        </div>
        <div
          class:panning
          class="log-scroll"
          onwheel={handleWheel}
          onpointerdown={beginPan}
          onpointermove={movePan}
          onpointerup={endPan}
          onpointercancel={endPan}
          role="presentation"
        >
          {#if activeHole}
            <DepthLog
              hole={activeHole}
              selectedIntervalId={logbook.selectedIntervalId}
              {topDepth}
              {bottomDepth}
              {zoom}
              editable
              onSelect={(id) => logbook.selectInterval(id)}
              onResizeBoundary={(index, depth) => logbook.setDepthBoundary(activeHole.id, index, depth)}
            />
          {/if}
        </div>
      </section>

      <aside class="detail-column">
        <PhotoPanel
          interval={selectedInterval}
          holeName={activeHole?.name ?? ''}
          onUpdate={(patch) => selectedInterval && logbook.updateInterval(selectedInterval.id, patch)}
        />
        <section class="summary-card">
          <header><strong>编录统计</strong><span>实时</span></header>
          <div class="summary-grid">
            <div><b>{activeHole?.intervals.length ?? 0}</b><span>编录区间</span></div>
            <div><b>{activeHole?.intervals.filter((item) => item.mineralization !== '无').length ?? 0}</b><span>矿化区间</span></div>
            <div><b>{activeHole?.intervals.filter((item) => item.alteration !== '无').length ?? 0}</b><span>蚀变区间</span></div>
            <div><b>{activeHole?.totalDepth ?? 0}</b><span>终孔深度</span></div>
          </div>
        </section>
      </aside>
    </div>

    <section class="table-section print-hide">
      <div class="section-head">
        <div><span>区间编辑表</span><strong>拖动左侧边界或直接修改深度，相邻区间保持连续</strong></div>
        <span class="autosave">本地自动保存</span>
      </div>
      {#if activeHole}
        <IntervalTable
          intervals={activeHole.intervals}
          selectedId={logbook.selectedIntervalId}
          onSelect={(id) => logbook.selectInterval(id)}
          onUpdate={(id, patch) => logbook.updateInterval(id, patch)}
          onDepthChange={(id, edge, value) => logbook.updateIntervalDepth(id, edge, value)}
        />
      {/if}
    </section>
  </main>
</div>

