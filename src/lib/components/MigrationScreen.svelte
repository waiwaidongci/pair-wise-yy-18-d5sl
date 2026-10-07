<script lang="ts">
  import { logbook } from '$lib/stores/logbook.svelte';

  let error = $derived(logbook.migrationError ?? '未知错误');
</script>

<div class="migration-screen">
  <div class="migration-card">
    <div class="migration-icon">!</div>
    <h1>草稿升级失败</h1>
    <p class="migration-desc">
      本地保存的旧版本草稿缺少锚点等必要信息，升级过程中出现问题。原稿已保留，可重试升级，不会丢失数据。
    </p>
    <div class="migration-error">
      <span>错误详情</span>
      <code>{error}</code>
    </div>
    <div class="migration-actions">
      <button class="btn variant-filled-primary" onclick={() => logbook.retryMigration()}>
        重试升级
      </button>
      <button class="btn variant-soft" onclick={() => logbook.reset()}>
        重置为示例数据
      </button>
    </div>
    <p class="migration-hint">
      重置会清除本地原稿并载入示例钻孔；建议先重试升级。
    </p>
  </div>
</div>

<style>
  .migration-screen {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background: rgba(15, 23, 42, 0.55);
    padding: 20px;
  }
  .migration-card {
    width: min(520px, 100%);
    background: #fff;
    border-radius: 14px;
    padding: 28px;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3);
    text-align: center;
  }
  .migration-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 14px;
    border-radius: 50%;
    background: #fef3c7;
    color: #b45309;
    font-size: 26px;
    font-weight: 800;
    display: grid;
    place-items: center;
  }
  .migration-card h1 {
    margin: 0 0 8px;
    font-size: 20px;
    color: #0f172a;
  }
  .migration-desc {
    margin: 0 0 16px;
    color: #475569;
    font-size: 13px;
    line-height: 1.6;
  }
  .migration-error {
    text-align: left;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 18px;
  }
  .migration-error span {
    display: block;
    font-size: 11px;
    color: #b91c1c;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .migration-error code {
    font-size: 11px;
    color: #7f1d1d;
    word-break: break-all;
  }
  .migration-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
  }
  .migration-hint {
    margin: 14px 0 0;
    font-size: 11px;
    color: #94a3b8;
  }
</style>
