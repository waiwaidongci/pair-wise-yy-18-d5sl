<script lang="ts">
  import DepthLog from './DepthLog.svelte';
  import type { Correlation, DrillHole, Interval } from '$lib/types/geology';

  interface Props {
    holes: DrillHole[];
    selectedHoleId: string;
    selectedIntervalId: string | null;
    topDepth: number;
    bottomDepth: number;
    onSelectHole: (id: string) => void;
    onSelectInterval: (id: string) => void;
    onConnect: (sourceHoleId: string, sourceIntervalId: string, targetHoleId: string, targetIntervalId: string) => void;
    onReconnect: (holeId: string, pairId: string, targetHoleId: string, targetIntervalId: string) => void;
    onRemovePair: (holeId: string, pairId: string) => void;
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
    onReconnect,
    onRemovePair,
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

  function holeIndex(id: string) {
    return holes.findIndex((hole) => hole.id === id);
  }

  /** 活动线取挂接区间中点；问题线取锚点深度，保证失效后不再跳到别的地层。 */
  function lineDepth(hole: DrillHole, correlation: Correlation, which: 'source' | 'target'): number {
    const intervalId = which === 'source' ? correlation.intervalId : correlation.targetIntervalId;
    const anchor = which === 'source' ? correlation.anchorDepth : correlation.targetAnchorDepth;
    if (correlation.status !== 'active') return anchor;
    const interval = hole.intervals.find((item) => item.id === intervalId);
    return interval ? (interval.from + interval.to) / 2 : anchor;
  }

  /** 某一列间隙（index 与 index+1 之间）需要绘制的连线：端点分列间隙两侧，每条逻辑线每道间隙只画一次。 */
  function gapLines(index: number) {
    const seen = new Set<string>();
    const lines: Array<{ correlation: Correlation; sourceHole: DrillHole; targetHole: DrillHole }> = [];
    for (const hole of holes) {
      for (const correlation of hole.correlations) {
        if (seen.has(correlation.pairId)) continue;
        const left = Math.min(holeIndex(hole.id), holeIndex(correlation.targetHoleId));
        const right = Math.max(holeIndex(hole.id), holeIndex(correlation.targetHoleId));
        if (!(left <= index && right >= index + 1)) continue;
        const targetHole = holes.find((candidate) => candidate.id === correlation.targetHoleId);
        if (!targetHole) continue;
        seen.add(correlation.pairId);
        lines.push({ correlation, sourceHole: hole, targetHole });
      }
    }
    return lines;
  }

  function depthY(depth: number) {
    return 32 + ((depth - topDepth) / Math.max(1, bottomDepth - topDepth)) * 694;
  }

  interface Issue {
    pairId: string;
    hole: DrillHole;
    correlation: Correlation;
    targetHole: DrillHole | null;
  }

  let issues = $derived.by<Issue[]>(() => {
    const seen = new Set<string>();
    const list: Issue[] = [];
    for (const hole of holes) {
      for (const correlation of hole.correlations) {
        if (correlation.status === 'active' || seen.has(correlation.pairId)) continue;
        seen.add(correlation.pairId);
        const targetHole = holes.find((item) => item.id === correlation.targetHoleId) ?? null;
        list.push({ pairId: correlation.pairId, hole, correlation, targetHole });
      }
    }
    return list;
  });

  // 重连目标的选择状态按 pairId 保存（只存用户覆盖），避免 issues 派生重算时丢失
  let reconnectOverrides = $state<Record<string, { holeId: string; intervalId: string }>>({});

  function choiceFor(issue: Issue) {
    return (
      reconnectOverrides[issue.pairId] ?? {
        holeId: issue.correlation.targetHoleId,
        intervalId: '',
      }
    );
  }

  function issueIntervals(issue: Issue): Interval[] {
    return holes.find((hole) => hole.id === choiceFor(issue).holeId)?.intervals ?? [];
  }

  function statusLabel(status: Correlation['status']) {
    return status === 'pending' ? '待重连' : '已失效';
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

{#if issues.length}
  <div class="issue-panel">
    <header>
      <strong>问题连线（{issues.length}）</strong>
      <span>拆分/合并或深度改动后不再确定的连线；待重连需指定新层位，已失效的连线不会再自动跳转</span>
    </header>
    <div class="issue-list">
      {#each issues as issue (issue.pairId)}
        <div class="issue-row" class:issue-pending={issue.correlation.status === 'pending'} class:issue-invalid={issue.correlation.status === 'invalid'}>
          <span class="issue-badge">{statusLabel(issue.correlation.status)}</span>
          <span class="issue-ends">
            {issue.hole.name} {issue.correlation.anchorDepth.toFixed(1)} m
            → {issue.targetHole?.name ?? issue.correlation.targetHoleId} {issue.correlation.targetAnchorDepth.toFixed(1)} m
          </span>
          <span class="issue-reason" title={issue.correlation.reason}>{issue.correlation.reason}</span>
          <select
            value={choiceFor(issue).holeId}
            onchange={(event) => {
              reconnectOverrides[issue.pairId] = {
                holeId: (event.currentTarget as HTMLSelectElement).value,
                intervalId: '',
              };
            }}
          >
            {#each holes.filter((candidate) => candidate.id !== issue.hole.id) as option}
              <option value={option.id}>{option.name}</option>
            {/each}
          </select>
          <select
            value={choiceFor(issue).intervalId}
            onchange={(event) => {
              reconnectOverrides[issue.pairId] = {
                holeId: choiceFor(issue).holeId,
                intervalId: (event.currentTarget as HTMLSelectElement).value,
              };
            }}
          >
            <option value="">选择新层位</option>
            {#each issueIntervals(issue) as interval}
              <option value={interval.id}>{interval.from.toFixed(1)}–{interval.to.toFixed(1)} m · {interval.lithology}</option>
            {/each}
          </select>
          <button
            class="btn btn-sm variant-filled-primary"
            disabled={!choiceFor(issue).intervalId}
            onclick={() => {
              const choice = choiceFor(issue);
              if (choice.intervalId) {
                onReconnect(issue.hole.id, issue.pairId, choice.holeId, choice.intervalId);
                delete reconnectOverrides[issue.pairId];
              }
            }}
          >
            重连
          </button>
          <button class="btn btn-sm variant-soft-error" onclick={() => onRemovePair(issue.hole.id, issue.pairId)}>移除</button>
        </div>
      {/each}
    </div>
  </div>
{/if}

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
        <svg class="correlation-lines" viewBox="0 0 100 760" preserveAspectRatio="none">
          <title>地层对比线</title>
          {#each gapLines(index) as line (line.correlation.pairId)}
            {@const sourceDepth = lineDepth(line.sourceHole, line.correlation, 'source')}
            {@const targetDepth = lineDepth(line.targetHole, line.correlation, 'target')}
            <line
              x1="0"
              x2="100"
              y1={depthY(sourceDepth)}
              y2={depthY(targetDepth)}
              stroke={line.correlation.status === 'active' ? line.correlation.color : line.correlation.status === 'pending' ? '#d97706' : '#dc2626'}
              stroke-width={line.correlation.status === 'active' ? 2 : 1.6}
              stroke-dasharray={line.correlation.status === 'active' ? undefined : '5 4'}
              class:line-pending={line.correlation.status === 'pending'}
              class:line-invalid={line.correlation.status === 'invalid'}
              vector-effect="non-scaling-stroke"
            >
              <title>{`${line.correlation.status === 'pending' ? '待重连' : '已失效'}：${line.correlation.reason}`}</title>
            </line>
          {/each}
        </svg>
      {/if}
    {/each}
  </div>
</div>

<div class="comparison-legend">
  <span><i></i> 实线为有效连线，按锚点层位取深度</span>
  <span><i class="legend-pending"></i> 琥珀虚线待重连</span>
  <span><i class="legend-invalid"></i> 红色虚线已失效（不再重叠/层位丢失）</span>
</div>

<style>
  .comparison-toolbar { border: 1px solid #dbe3ec; border-radius: 10px; background: #fff; padding: 10px; margin-bottom: 10px; }
  .selection-grid { display: grid; grid-template-columns: 130px 1.4fr 130px 1.4fr auto; gap: 8px; align-items: end; }
  label { display: grid; gap: 3px; }
  label span { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; font-weight: 750; }
  select { width: 100%; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; padding: 7px; font-size: 11px; }
  .connect-button { height: 34px; white-space: nowrap; }
  .issue-panel { border: 1px solid #fcd34d; border-radius: 10px; background: #fffbeb; padding: 10px; margin-bottom: 10px; }
  .issue-panel header { display: grid; gap: 2px; margin-bottom: 8px; }
  .issue-panel header strong { font-size: 12px; color: #92400e; }
  .issue-panel header span { font-size: 10px; color: #b45309; }
  .issue-list { display: grid; gap: 6px; }
  .issue-row { display: grid; grid-template-columns: 64px 1.5fr 2fr 120px 1.4fr auto auto; gap: 6px; align-items: center; background: #fff; border: 1px solid #fde68a; border-radius: 8px; padding: 6px 8px; }
  .issue-row.issue-invalid { border-color: #fecaca; background: #fef2f2; }
  .issue-badge { font-size: 10px; font-weight: 800; border-radius: 999px; text-align: center; padding: 3px 6px; }
  .issue-pending .issue-badge { background: #fef3c7; color: #92400e; }
  .issue-invalid .issue-badge { background: #fee2e2; color: #991b1b; }
  .issue-ends { font-size: 11px; font-weight: 700; color: #172033; white-space: nowrap; }
  .issue-reason { font-size: 10px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .issue-row select { padding: 5px; font-size: 10px; }
  .comparison-scroll { overflow: auto; border: 1px solid #dbe3ec; border-radius: 10px; background: #e9eef4; padding: 10px; }
  .comparison-stage { min-width: max(980px, calc(var(--holes) * 340px)); display: flex; gap: 0; align-items: stretch; }
  .comparison-column { width: 300px; flex: 0 0 300px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 5px 18px rgba(15,23,42,.07); }
  .comparison-column.active { outline: 2px solid #4f46e5; }
  .column-heading { width: 100%; border: 0; border-bottom: 1px solid #dbe3ec; background: #f8fafc; text-align: left; padding: 9px 12px; }
  .column-heading strong { display: block; font-size: 13px; color: #172033; }
  .column-heading span { display: block; color: #64748b; font-size: 9px; margin-top: 2px; }
  .correlation-lines { flex: 1 1 40px; min-width: 38px; height: 760px; margin-top: 47px; overflow: visible; }
  .line-pending { opacity: .9; }
  .line-invalid { opacity: .55; }
  .comparison-legend { display: flex; gap: 14px; margin-top: 8px; color: #64748b; font-size: 10px; }
  .comparison-legend i { display: inline-block; width: 26px; height: 2px; background: #0f766e; vertical-align: middle; margin-right: 5px; }
  .comparison-legend .legend-pending { background: repeating-linear-gradient(90deg, #d97706 0 5px, transparent 5px 9px); }
  .comparison-legend .legend-invalid { background: repeating-linear-gradient(90deg, #dc2626 0 5px, transparent 5px 9px); }
  @media (max-width: 900px) {
    .selection-grid { grid-template-columns: 1fr 1fr; }
    .connect-button { grid-column: 1 / -1; }
    .issue-row { grid-template-columns: 64px 1fr 1fr; }
  }
</style>
