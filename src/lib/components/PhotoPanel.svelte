<script lang="ts">
  import type { Interval } from '$lib/types/geology';
  import { createCorePhoto } from '$lib/utils/geology';

  interface Props {
    interval: Interval | null;
    holeName: string;
    onUpdate: (patch: Partial<Interval>) => void;
  }

  let { interval, holeName, onUpdate }: Props = $props();

  function regenerate() {
    if (!interval) return;
    onUpdate({
      photoUrl: createCorePhoto(interval.lithology, interval.color, Math.round(interval.to * 13 + interval.from * 7)),
    });
  }
</script>

<section class="photo-panel">
  <header>
    <div>
      <span>钻芯照片</span>
      <strong>{holeName} · {interval ? `${interval.from.toFixed(1)}–${interval.to.toFixed(1)} m` : '未选择'}</strong>
    </div>
    <button class="btn btn-sm variant-soft" disabled={!interval} onclick={regenerate}>重新采样</button>
  </header>
  {#if interval}
    <div class="photo-frame">
      {#if interval.photoUrl}
        <img src={interval.photoUrl} alt={`${holeName} ${interval.from}-${interval.to} 米钻芯照片`} />
      {:else}
        <div class="photo-empty">点击“重新采样”生成该区间照片</div>
      {/if}
      <div class="scale-line"><span>0</span><span>5 cm</span><span>10 cm</span></div>
    </div>
    <dl>
      <div><dt>岩性</dt><dd>{interval.lithology}</dd></div>
      <div><dt>结构</dt><dd>{interval.structure}</dd></div>
      <div><dt>蚀变</dt><dd>{interval.alteration}</dd></div>
      <div><dt>矿化</dt><dd>{interval.mineralization}</dd></div>
    </dl>
    <p>{interval.description || '尚未填写详细编录描述。'}</p>
  {:else}
    <div class="photo-empty tall">选择一段区间后显示照片与编录属性</div>
  {/if}
</section>

<style>
  .photo-panel { border: 1px solid #dbe3ec; border-radius: 10px; background: #fff; padding: 12px; }
  header { display: flex; align-items: start; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
  header div { display: grid; gap: 2px; }
  header span { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; font-weight: 750; }
  header strong { color: #172033; font-size: 13px; }
  .photo-frame { position: relative; overflow: hidden; border-radius: 8px; background: #111827; }
  img { display: block; width: 100%; aspect-ratio: 2.1; object-fit: cover; }
  .scale-line { position: absolute; left: 14px; right: 14px; bottom: 9px; display: flex; justify-content: space-between; color: #fff; font-size: 8px; border-bottom: 2px solid #fff; padding-bottom: 2px; }
  .photo-empty { min-height: 150px; display: grid; place-items: center; color: #94a3b8; font-size: 12px; }
  .photo-empty.tall { min-height: 330px; }
  dl { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #e2e8f0; margin: 12px 0 0; border: 1px solid #e2e8f0; }
  dl div { background: #f8fafc; padding: 7px; }
  dt { color: #64748b; font-size: 9px; }
  dd { margin: 2px 0 0; font-weight: 750; font-size: 11px; }
  p { margin: 10px 0 0; color: #475569; font-size: 11px; line-height: 1.6; }
</style>

