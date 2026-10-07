<script lang="ts">
  import type { Interval } from '$lib/types/geology';
  import {
    ALTERATION_OPTIONS,
    LITHOLOGY_OPTIONS,
    MINERALIZATION_OPTIONS,
    STRUCTURE_OPTIONS,
  } from '$lib/utils/geology';

  interface Props {
    intervals: Interval[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onUpdate: (id: string, patch: Partial<Interval>) => void;
    onDepthChange: (id: string, edge: 'from' | 'to', value: number) => void;
  }

  let { intervals, selectedId, onSelect, onUpdate, onDepthChange }: Props = $props();
  let sorted = $derived([...intervals].sort((a, b) => a.from - b.from));

  function lithologyColor(name: string) {
    return LITHOLOGY_OPTIONS.find((item) => item.name === name)?.color ?? '#b8b1a5';
  }
</script>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>区间 / m</th>
        <th>岩性</th>
        <th>颜色</th>
        <th>结构</th>
        <th>蚀变</th>
        <th>矿化</th>
        <th>编录描述</th>
      </tr>
    </thead>
    <tbody>
      {#each sorted as interval (interval.id)}
        <tr class:active={selectedId === interval.id} onclick={() => onSelect(interval.id)}>
          <td class="depth-cell">
            <input
              type="number"
              min="0"
              step="0.1"
              value={interval.from.toFixed(1)}
              onchange={(event) =>
                onDepthChange(interval.id, 'from', Number((event.currentTarget as HTMLInputElement).value))}
            />
            <span>–</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={interval.to.toFixed(1)}
              onchange={(event) =>
                onDepthChange(interval.id, 'to', Number((event.currentTarget as HTMLInputElement).value))}
            />
          </td>
          <td>
            <select
              value={interval.lithology}
              onchange={(event) => {
                const lithology = (event.currentTarget as HTMLSelectElement).value;
                onUpdate(interval.id, { lithology, color: lithologyColor(lithology) });
              }}
            >
              {#each LITHOLOGY_OPTIONS as option}
                <option value={option.name}>{option.name}</option>
              {/each}
            </select>
          </td>
          <td>
            <div class="color-cell">
              <input
                type="color"
                value={interval.color}
                oninput={(event) => onUpdate(interval.id, { color: (event.currentTarget as HTMLInputElement).value })}
              />
              <code>{interval.color}</code>
            </div>
          </td>
          <td>
            <select value={interval.structure} onchange={(event) => onUpdate(interval.id, { structure: (event.currentTarget as HTMLSelectElement).value })}>
              {#each STRUCTURE_OPTIONS as option}<option value={option}>{option}</option>{/each}
            </select>
          </td>
          <td>
            <select value={interval.alteration} onchange={(event) => onUpdate(interval.id, { alteration: (event.currentTarget as HTMLSelectElement).value })}>
              {#each ALTERATION_OPTIONS as option}<option value={option}>{option}</option>{/each}
            </select>
          </td>
          <td>
            <select value={interval.mineralization} onchange={(event) => onUpdate(interval.id, { mineralization: (event.currentTarget as HTMLSelectElement).value })}>
              {#each MINERALIZATION_OPTIONS as option}<option value={option}>{option}</option>{/each}
            </select>
          </td>
          <td class="description-cell">
            <textarea
              rows="2"
              value={interval.description}
              placeholder="颜色、粒度、接触关系、取样位置等"
              oninput={(event) => onUpdate(interval.id, { description: (event.currentTarget as HTMLTextAreaElement).value })}
            ></textarea>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-wrap { overflow: auto; border: 1px solid var(--color-surface-300, #dbe3ec); border-radius: 10px; background: #fff; }
  table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 1030px; font-size: 12px; }
  th { position: sticky; top: 0; z-index: 2; padding: 9px 8px; text-align: left; background: #edf2f7; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  td { padding: 7px 6px; border-top: 1px solid #e7edf4; vertical-align: top; }
  tr.active td { background: #eef2ff; }
  tr:hover td { background: #f8fafc; }
  select, input, textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #1e293b; font: inherit; padding: 6px; }
  textarea { min-width: 240px; resize: vertical; line-height: 1.4; }
  input[type="color"] { width: 34px; min-width: 34px; height: 30px; padding: 2px; }
  .depth-cell { min-width: 126px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 4px; }
  .depth-cell input { text-align: center; }
  .color-cell { display: flex; align-items: center; gap: 5px; }
  .color-cell code { font-size: 9px; color: #64748b; }
  .description-cell { min-width: 250px; }
</style>

