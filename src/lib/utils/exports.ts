import type { DrillHole } from '$lib/types/geology';
import { SCHEMA_V2, type DraftEnvelope } from '$lib/services/draftSync';

export function downloadJson(holes: DrillHole[], activeHoleId: string) {
  const payload = {
    schema: SCHEMA_V2,
    exportedAt: new Date().toISOString(),
    activeHoleId,
    holes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${holes.find((item) => item.id === activeHoleId)?.name ?? '钻芯编录'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function printLog() {
  window.print();
}

export type { DraftEnvelope };
