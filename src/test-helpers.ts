import type { Correlation, DrillHole, Interval } from './lib/types/geology';
import { buildCorrelationRecords } from './lib/services/correlations';

export function makeInterval(
  id: string,
  from: number,
  to: number,
  lithology = '花岗岩',
): Interval {
  return {
    id,
    from,
    to,
    lithology,
    color: '#888888',
    structure: '块状',
    alteration: '无',
    mineralization: '无',
    description: '',
    photoUrl: '',
  };
}

export function makeHole(id: string, intervals: Array<[string, number, number, string?]>, totalDepth?: number): DrillHole {
  return {
    id,
    name: id,
    project: '测试项目',
    coordinates: 'X 0 / Y 0',
    collarElevation: 100,
    totalDepth: totalDepth ?? intervals.at(-1)?.[2] ?? 100,
    intervals: intervals.map(([iid, from, to, lithology]) => makeInterval(iid, from, to, lithology)),
    correlations: [],
  };
}

export function connect(
  sourceHole: DrillHole,
  sourceIntervalId: string,
  targetHole: DrillHole,
  targetIntervalId: string,
): { source: Correlation; target: Correlation } {
  const sourceInterval = sourceHole.intervals.find((item) => item.id === sourceIntervalId)!;
  const targetInterval = targetHole.intervals.find((item) => item.id === targetIntervalId)!;
  const records = buildCorrelationRecords(sourceHole, sourceInterval, targetHole, targetInterval);
  sourceHole.correlations.push(records.source);
  targetHole.correlations.push(records.target);
  return records;
}

export function findCorr(hole: DrillHole, targetHoleId: string): Correlation {
  const corr = hole.correlations.find((item) => item.targetHoleId === targetHoleId);
  if (!corr) throw new Error(`未找到 ${hole.id} → ${targetHoleId} 的连线`);
  return corr;
}

export function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}
