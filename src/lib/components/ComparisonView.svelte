<script lang="ts">
  import DepthLog from './DepthLog.svelte';
  import type { DrillHole, Interval } from '$lib/types/geology';

  interface Props {
    holes: DrillHole[];
    selectedHoleId: string;
    selectedIntervalId: string | null;
    topDepth: number;
    bottomDepth: number;
    onSelectHole: (id: string) => void;
    onSelectInterval: (id: string) => void;
    onConnect: (sourceHoleId: string, sourceIntervalId: string, targetHoleId: string, targetIntervalId: string) => void;
  }

  let {
    holes,
    selectedHoleId,
    selectedIntervalId,
    topDepth,
    bottomDepth,
    onSelectHole,
    onSelectInterval,
    onConnect,
  }: Props = $props();

  let sourceHoleId = $state('');
  let sourceIntervalId = $state('');
  let targetHoleId = $state('');
  let targetIntervalId = $state('');

  $effect(() => {
    if (!sourceHoleId && holes[0]) sourceHoleId = holes[0].id;
    if (!targetHoleId && holes[1]) targetHoleId = holes[1].id;
  });

  function sourceIntervals(): Interval[] {
    return holes.find((item) => item.id === sourceHoleId)?.intervals ?? [];
  }

  function targetIntervals(): Interval[] {
    return holes.find((item) => item.id === targetHoleId)?.intervals ?? [];
  }

  function intervalMidpoint(hole: DrillHole, intervalId: string) {
    const item = hole.intervals.find((interval) => interval.id === intervalId);
    if (!item) return (topDepth + bottomDepth) / 2;
    return (Math.max(item.from, topDepth) + Math.min(item.to, bottomDepth)) / 2;
  }
</script>

<div class="comparison-toolbar">
  <div class="selection-grid">
    <label>
      <span>起点钻孔</span>
      <select bind:value={sourceHoleId} onchange={() => { sourceIntervalId = sourceIntervals()[0]?.id ?? ''; }}>
        {#each holes as hole}<option value={hole.id}>{hole.name}</option>{/each}
      </select>
    </label>
    <label>
      <span>起点地层</span>
      <select bind:value={sourceIntervalId}>
        <option value="">选择区间</option>
        {#each sourceIntervals() as interval}
          <option value={interval.id}>{interval.from.toFixed(1)}–{interval.to.toFixed(1)} m · {interval.lithology}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>目标钻孔</span>
      <select bind:value={targetHoleId} onchange={() => { targetIntervalId = targetIntervals()[0]?.id ?? ''; }}>
        {#each holes as hole}<option value={hole.id}>{hole.name}</option>{/each}
      </select>
    </label>
    <label>
      <span>目标地层</span>
      <select bind:value={targetIntervalId}>
        <option value="">选择区间</option>
        {#each targetIntervals() as interval}
          <option value={interval.id}>{interval.from.toFixed(1)}–{interval.to.toFixed(1)} m · {interval.lithology}</option>
        {/each}
      </select>
    </label>
    <button
      class="btn variant-filled-primary connect-button"
      disabled={!sourceIntervalId || !targetIntervalId || sourceHoleId === targetHoleId}
      onclick={() => onConnect(sourceHoleId, sourceIntervalId, targetHoleId, targetIntervalId)}
    >
      连接地层线
    </button>
  </div>
</div>

<div class="comparison-scroll">
  <div class="comparison-stage" style={`--holes:${holes.length}`}>
    {#each holes as hole, index (hole.id)}
      <div class="comparison-column" class:active={selectedHoleId === hole.id}>
        <button class="column-heading" onclick={() => onSelectHole(hole.id)}>
          <strong>{hole.name}</strong>
          <span>孔口 {hole.collarElevation} m · 终孔 {hole.totalDepth} m</span>
        </button>
        <DepthLog
          {hole}
          selectedIntervalId={selectedHoleId === hole.id ? selectedIntervalId : null}
          {topDepth}
          {bottomDepth}
          compact
          onSelect={(id) => {
            onSelectHole(hole.id);
            onSelectInterval(id);
          }}
        />
      </div>
      {#if index < holes.length - 1}
        <svg class="correlation-lines" viewBox="0 0 100 760" preserveAspectRatio="none" aria-hidden="true">
          {#each hole.correlations.filter((item) => holes.some((candidate) => candidate.id === item.targetHoleId)) as correlation}
            {@const targetHole = holes.find((candidate) => candidate.id === correlation.targetHoleId)}
            {@const sourceDepth = intervalMidpoint(hole, correlation.intervalId)}
            {@const targetDepth = targetHole ? intervalMidpoint(targetHole, correlation.targetIntervalId) : sourceDepth}
            <line
              x1="0"
              x2="100"
              y1={32 + ((sourceDepth - topDepth) / Math.max(1, bottomDepth - topDepth)) * 694}
              y2={32 + ((targetDepth - topDepth) / Math.max(1, bottomDepth - topDepth)) * 694}
              stroke={correlation.color}
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          {/each}
        </svg>
      {/if}
    {/each}
  </div>
</div>

<div class="comparison-legend">
  <span><i></i> 连线颜色取自起点地层颜色</span>
  <span>修改任一钻孔区间后，柱状图与连线深度会同步重算</span>
</div>

<style>
  .comparison-toolbar { border: 1px solid #dbe3ec; border-radius: 10px; background: #fff; padding: 10px; margin-bottom: 10px; }
  .selection-grid { display: grid; grid-template-columns: 130px 1.4fr 130px 1.4fr auto; gap: 8px; align-items: end; }
  label { display: grid; gap: 3px; }
  label span { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; font-weight: 750; }
  select { width: 100%; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; padding: 7px; font-size: 11px; }
  .connect-button { height: 34px; white-space: nowrap; }
  .comparison-scroll { overflow: auto; border: 1px solid #dbe3ec; border-radius: 10px; background: #e9eef4; padding: 10px; }
  .comparison-stage { min-width: max(980px, calc(var(--holes) * 340px)); display: flex; gap: 0; align-items: stretch; }
  .comparison-column { width: 300px; flex: 0 0 300px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 5px 18px rgba(15,23,42,.07); }
  .comparison-column.active { outline: 2px solid #4f46e5; }
  .column-heading { width: 100%; border: 0; border-bottom: 1px solid #dbe3ec; background: #f8fafc; text-align: left; padding: 9px 12px; }
  .column-heading strong { display: block; font-size: 13px; color: #172033; }
  .column-heading span { display: block; color: #64748b; font-size: 9px; margin-top: 2px; }
  .correlation-lines { flex: 1 1 40px; min-width: 38px; height: 760px; margin-top: 47px; overflow: visible; opacity: .8; }
  .comparison-legend { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; color: #64748b; font-size: 10px; }
  .comparison-legend i { display: inline-block; width: 26px; height: 2px; background: #4f46e5; vertical-align: middle; margin-right: 5px; }
  @media (max-width: 900px) {
    .selection-grid { grid-template-columns: 1fr 1fr; }
    .connect-button { grid-column: 1 / -1; }
  }
</style>

