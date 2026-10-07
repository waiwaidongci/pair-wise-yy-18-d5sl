<script lang="ts">
  import type { DrillHole } from '$lib/types/geology';

  interface Props {
    hole: DrillHole;
    selectedIntervalId?: string | null;
    topDepth?: number;
    bottomDepth?: number;
    zoom?: number;
    compact?: boolean;
    editable?: boolean;
    onSelect?: (id: string) => void;
    onResizeBoundary?: (index: number, depth: number) => void;
  }

  let {
    hole,
    selectedIntervalId = null,
    topDepth = 0,
    bottomDepth = hole.totalDepth,
    zoom = 1,
    compact = false,
    editable = false,
    onSelect = () => {},
    onResizeBoundary = () => {},
  }: Props = $props();

  const viewHeight = 760;
  const topPadding = 32;
  const bottomPadding = 34;
  const plotHeight = viewHeight - topPadding - bottomPadding;
  let svgElement = $state<SVGSVGElement | null>(null);
  let dragIndex = $state<number | null>(null);

  let intervals = $derived([...hole.intervals].sort((a, b) => a.from - b.from));
  let visibleSpan = $derived(Math.max(1, bottomDepth - topDepth));

  function depthToY(depth: number) {
    return topPadding + ((depth - topDepth) / visibleSpan) * plotHeight;
  }

  function yToDepth(y: number) {
    return topDepth + ((y - topPadding) / plotHeight) * visibleSpan;
  }

  function pointerDepth(event: PointerEvent) {
    if (!svgElement) return topDepth;
    const rect = svgElement.getBoundingClientRect();
    const y = ((event.clientY - rect.top) / rect.height) * viewHeight;
    return Math.max(topDepth, Math.min(bottomDepth, yToDepth(y)));
  }

  function beginBoundary(index: number, event: PointerEvent) {
    if (!editable) return;
    dragIndex = index;
    (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
  }

  function moveBoundary(event: PointerEvent) {
    if (dragIndex === null) return;
    onResizeBoundary(dragIndex, pointerDepth(event));
  }

  function endBoundary(event: PointerEvent) {
    if (dragIndex === null) return;
    (event.currentTarget as SVGElement).releasePointerCapture(event.pointerId);
    dragIndex = null;
  }

  let ticks = $derived.by(() => {
    const span = bottomDepth - topDepth;
    const rawStep = span / 9;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const normalized = rawStep / magnitude;
    const step = (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
    const start = Math.ceil(topDepth / step) * step;
    const result: number[] = [];
    for (let depth = start; depth <= bottomDepth + 0.001; depth += step) {
      result.push(Number(depth.toFixed(1)));
    }
    return result;
  });
</script>

<div class:compact class="depth-log-wrap">
  <svg
    bind:this={svgElement}
    class="depth-log"
    viewBox={compact ? `0 0 260 ${viewHeight}` : `0 0 520 ${viewHeight}`}
    role="img"
    aria-label={`${hole.name} 岩性柱状图`}
    onpointermove={moveBoundary}
    onpointerup={endBoundary}
    onpointercancel={endBoundary}
  >
    <rect width="100%" height="100%" class="svg-paper" />
    <text x={compact ? 12 : 18} y="18" class="hole-title">{hole.name}</text>
    <text x={compact ? 240 : 496} y="18" text-anchor="end" class="depth-caption">深度 / m</text>

    {#each ticks as tick}
      <line
        x1={compact ? 44 : 54}
        x2={compact ? 52 : 80}
        y1={depthToY(tick)}
        y2={depthToY(tick)}
        class="tick-line"
      />
      <text
        x={compact ? 39 : 49}
        y={depthToY(tick) + 3}
        text-anchor="end"
        class:tick-label-fine={!compact}
        class="tick-label"
      >{tick.toFixed(0)}</text>
      <line
        x1={compact ? 54 : 87}
        x2={compact ? 252 : 510}
        y1={depthToY(tick)}
        y2={depthToY(tick)}
        class="grid-line"
      />
    {/each}

    {#each intervals as interval, index (interval.id)}
      {@const y = depthToY(interval.from)}
      {@const height = Math.max(1, depthToY(interval.to) - y)}
      <g
        class:selected={selectedIntervalId === interval.id}
        class="interval-group"
        role="button"
        tabindex="0"
        onclick={() => onSelect(interval.id)}
        onkeydown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelect(interval.id);
        }}
      >
        <rect
          x={compact ? 54 : 87}
          y={y}
          width={compact ? 198 : 423}
          height={height}
          fill={interval.color}
          class="interval-fill"
        />
        {#if height > 22}
          <text x={compact ? 63 : 98} y={y + Math.min(18, height / 2 + 4)} class="interval-label">
            {interval.lithology}
            {#if !compact && height > 38}
              <tspan x={98} dy="15" class="interval-sub">
                {interval.from.toFixed(1)}–{interval.to.toFixed(1)} m · {interval.structure}
              </tspan>
            {/if}
          </text>
        {/if}
      </g>
      {#if index < intervals.length - 1 && editable}
        <line
          x1={compact ? 54 : 87}
          x2={compact ? 252 : 510}
          y1={depthToY(interval.to)}
          y2={depthToY(interval.to)}
          class="boundary-handle-hit"
        />
        <rect
          x={compact ? 48 : 79}
          y={depthToY(interval.to) - 5}
          width="16"
          height="10"
          rx="5"
          class="boundary-handle"
          role="slider"
          tabindex="0"
          aria-label={`${interval.to} 米深度边界`}
          aria-valuenow={interval.to}
          aria-valuemin={interval.from}
          aria-valuemax={intervals[index + 1]?.to ?? hole.totalDepth}
          onpointerdown={(event) => beginBoundary(index, event)}
          onkeydown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              onResizeBoundary(index, interval.to + (event.key === 'ArrowUp' ? -0.1 : 0.1));
            }
          }}
        />
      {/if}
    {/each}

    <line x1={compact ? 54 : 87} x2={compact ? 54 : 87} y1={topPadding} y2={viewHeight - bottomPadding} class="column-axis" />
    <line x1={compact ? 54 : 87} x2={compact ? 252 : 510} y1={topPadding} y2={topPadding} class="column-axis" />
    <line x1={compact ? 54 : 87} x2={compact ? 252 : 510} y1={viewHeight - bottomPadding} y2={viewHeight - bottomPadding} class="column-axis" />
  </svg>
  {#if editable}
    <div class="drag-hint">拖动区间边界可连续调整上下两段，系统会自动阻止重叠和空段</div>
  {/if}
</div>

<style>
  .depth-log-wrap { position: relative; width: 100%; height: 100%; min-height: 0; }
  .depth-log { display: block; width: 100%; height: 100%; min-height: 620px; user-select: none; }
  .svg-paper { fill: #fff; }
  .hole-title { fill: #1e293b; font-size: 14px; font-weight: 800; }
  .depth-caption { fill: #64748b; font-size: 10px; }
  .tick-line, .column-axis { stroke: #475569; stroke-width: 1; }
  .grid-line { stroke: #dbe3ec; stroke-width: 1; stroke-dasharray: 3 5; }
  .tick-label { fill: #64748b; font-size: 9px; }
  .tick-label-fine { font-size: 10px; }
  .interval-group { cursor: pointer; outline: none; }
  .interval-fill { stroke: rgba(255,255,255,.7); stroke-width: 1; transition: filter .15s ease; }
  .interval-group:hover .interval-fill { filter: brightness(1.05); }
  .interval-group.selected .interval-fill { stroke: #0f172a; stroke-width: 2.5; }
  .interval-label { fill: #172033; font-size: 11px; font-weight: 750; pointer-events: none; }
  .interval-sub { fill: rgba(23,32,51,.65); font-size: 9px; font-weight: 550; }
  .boundary-handle-hit { stroke: transparent; stroke-width: 16; cursor: ns-resize; pointer-events: stroke; }
  .boundary-handle { fill: #0f172a; cursor: ns-resize; opacity: .45; }
  .boundary-handle:hover { opacity: 1; }
  .drag-hint { position: absolute; left: 88px; bottom: 8px; color: #64748b; font-size: 10px; }
  .compact .depth-log { min-height: 660px; }
  .compact .hole-title { font-size: 12px; }
</style>
