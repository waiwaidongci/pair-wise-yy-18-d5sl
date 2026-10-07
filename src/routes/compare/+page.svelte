<script lang="ts">
  import ComparisonView from '$lib/components/ComparisonView.svelte';
  import { logbook } from '$lib/stores/logbook.svelte';

  let topDepth = $state(0);
  let bottomDepth = $state(Math.max(...logbook.holes.map((hole) => hole.totalDepth)));
  let selectedHoleId = $state(logbook.activeHoleId);
  let selectedIntervalId = $state<string | null>(logbook.activeHole?.intervals[0]?.id ?? null);
  let comparisonHoles = $derived(
    logbook.comparisonIds
      .map((id) => logbook.holes.find((hole) => hole.id === id))
      .filter(Boolean) as typeof logbook.holes,
  );
</script>

<svelte:head><title>多孔对比 · CoreColumn</title></svelte:head>

<main class="compare-page">
  <div class="compare-header">
    <div>
      <span class="crumb">钻探编录 / 多孔地层对比</span>
      <h1>钻孔柱状图对比</h1>
      <p>选择三个以内钻孔，手工连接可对比地层；任一钻孔区间修改后会立即反映到对比图。</p>
    </div>
    <div class="toolbar-actions">
      <button class="btn btn-sm variant-soft" onclick={() => logbook.undo()}>撤销</button>
      <button class="btn btn-sm variant-soft" onclick={() => logbook.redo()}>重做</button>
      <button class="btn btn-sm variant-soft-error" onclick={() => logbook.clearCorrelations()}>清除连线</button>
      <button class="btn btn-sm variant-filled-primary" onclick={() => window.print()}>打印对比图</button>
    </div>
  </div>

  <section class="compare-selector">
    <div>
      <span>参与对比</span>
      <div class="chips">
        {#each logbook.holes as hole}
          <button
            class:active={logbook.comparisonIds.includes(hole.id)}
            class="chip"
            onclick={() => logbook.toggleComparison(hole.id)}
          >
            {hole.name}
          </button>
        {/each}
      </div>
    </div>
    <div class="depth-controls">
      <label>显示顶部<input type="number" bind:value={topDepth} min="0" step="1" /></label>
      <label>显示底部<input type="number" bind:value={bottomDepth} min={topDepth + 1} step="1" /></label>
    </div>
  </section>

  {#if comparisonHoles.length >= 2}
    <ComparisonView
      holes={comparisonHoles}
      {selectedHoleId}
      {selectedIntervalId}
      {topDepth}
      {bottomDepth}
      onSelectHole={(id) => {
        selectedHoleId = id;
        logbook.selectHole(id);
        selectedIntervalId = logbook.activeHole?.intervals[0]?.id ?? null;
      }}
      onSelectInterval={(id) => {
        selectedIntervalId = id;
        logbook.selectInterval(id);
      }}
      onConnect={(sourceHoleId, sourceIntervalId, targetHoleId, targetIntervalId) =>
        logbook.addCorrelation(sourceHoleId, sourceIntervalId, targetHoleId, targetIntervalId)}
    />
  {:else}
    <div class="compare-empty">至少选择两个钻孔才能进行地层对比。</div>
  {/if}
</main>

