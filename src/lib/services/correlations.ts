import type { Correlation, DrillHole, Interval } from '../types/geology';

/**
 * 对比线锚点维护。
 *
 * 连线不再死挂 intervalId，而是记录锚点深度（地层层位）。任何结构性编辑后
 * 都要重新核对挂接关系：
 * - 拆分：按与原子段重叠最多的新子段重新挂接
 * - 合并：两段连向不同目标时标成待重连，由编录员人工确认
 * - 深度边界改动：锚点落出本端区间或两端区间不再重叠时，连线显式失效
 * - 删除钻孔：所有指向它的连线一并清理
 */

const DEPTH_EPS = 1e-6;

export function intervalMidpoint(interval: Interval): number {
  return (interval.from + interval.to) / 2;
}

export function findInterval(hole: DrillHole, intervalId: string): Interval | undefined {
  return hole.intervals.find((item) => item.id === intervalId);
}

export function depthOverlap(aFrom: number, aTo: number, bFrom: number, bTo: number): number {
  return Math.max(0, Math.min(aTo, bTo) - Math.max(aFrom, bFrom));
}

/**
 * 找出与目标深度带重叠最多的区间。
 * 等重叠时优先取锚点严格落在其内部的区间，再等则取较浅的一段，保证结果确定。
 */
export function bestOverlapInterval(
  intervals: Interval[],
  from: number,
  to: number,
  anchorDepth: number,
): Interval | null {
  let best: Interval | null = null;
  let bestOverlap = 0;
  for (const interval of intervals) {
    const overlap = depthOverlap(from, to, interval.from, interval.to);
    if (overlap <= bestOverlap + DEPTH_EPS) {
      if (best && (overlap < bestOverlap - DEPTH_EPS || !tiePrefers(interval, best, anchorDepth))) {
        continue;
      }
    }
    best = interval;
    bestOverlap = overlap;
  }
  return bestOverlap > DEPTH_EPS ? best : null;
}

function tiePrefers(candidate: Interval, current: Interval, anchorDepth: number): boolean {
  const candidateContains = anchorDepth > candidate.from && anchorDepth < candidate.to;
  const currentContains = anchorDepth > current.from && anchorDepth < current.to;
  if (candidateContains !== currentContains) return candidateContains;
  return candidate.from < current.from;
}

interface LineSides {
  aHole: DrillHole;
  a: Correlation;
  bHole: DrillHole;
  b: Correlation;
}

/** 遍历每条逻辑连线的两端记录；找不到对端记录时跳过（升级/异常数据的防御）。 */
function eachLine(holes: DrillHole[], visit: (sides: LineSides) => void) {
  const seen = new Set<string>();
  const holeById = new Map(holes.map((hole) => [hole.id, hole]));
  for (const hole of holes) {
    for (const corr of hole.correlations) {
      if (seen.has(corr.id)) continue;
      const other = holeById.get(corr.targetHoleId);
      const mate = other?.correlations.find((item) => item.pairId === corr.pairId);
      if (!other || !mate) continue;
      // 以 pairId 两个记录 id 去重，避免同一对被处理两次
      seen.add(corr.id);
      seen.add(mate.id);
      visit({ aHole: hole, a: corr, bHole: other, b: mate });
    }
  }
}

function setSide(
  sides: LineSides,
  which: 'a' | 'b',
  patch: Partial<Correlation>,
  matePatch?: Partial<Correlation>,
) {
  if (which === 'a') {
    Object.assign(sides.a, patch);
    if (matePatch) Object.assign(sides.b, matePatch);
  } else {
    Object.assign(sides.b, patch);
    if (matePatch) Object.assign(sides.a, matePatch);
  }
}

function formatRange(interval: Interval | undefined): string {
  if (!interval) return '缺失区间';
  return `${interval.from.toFixed(1)}–${interval.to.toFixed(1)} m`;
}

/** 校验一条活动连线：两端深度带仍有重叠，且各自锚点仍挂在区间内。 */
function validateActiveLine(sides: LineSides): boolean {
  const { aHole, a, bHole, b } = sides;
  const source = findInterval(aHole, a.intervalId);
  const target = findInterval(bHole, b.intervalId);
  if (!source || !target) {
    markInvalid(sides, `一端地层已不存在（${aHole.name} / ${bHole.name}）`);
    return false;
  }
  // 先判深度带：边界改动后两端不再重叠时显式失效，原因里给出两边深度
  if (depthOverlap(source.from, source.to, target.from, target.to) <= DEPTH_EPS) {
    markInvalid(
      sides,
      `深度边界改动后两端不再重叠：${aHole.name} ${formatRange(source)} ↔ ${bHole.name} ${formatRange(target)}`,
    );
    return false;
  }
  if (a.anchorDepth < source.from - DEPTH_EPS || a.anchorDepth > source.to + DEPTH_EPS) {
    markInvalid(
      sides,
      `锚点 ${a.anchorDepth.toFixed(1)} m 已落出 ${aHole.name} 的 ${source.lithology}（${formatRange(source)}）`,
    );
    return false;
  }
  if (b.anchorDepth < target.from - DEPTH_EPS || b.anchorDepth > target.to + DEPTH_EPS) {
    markInvalid(
      sides,
      `锚点 ${b.anchorDepth.toFixed(1)} m 已落出 ${bHole.name} 的 ${target.lithology}（${formatRange(target)}）`,
    );
    return false;
  }
  return true;
}

function markInvalid(sides: LineSides, reason: string) {
  if (sides.a.status === 'invalid' && sides.b.status === 'invalid') {
    if (!sides.a.reason) sides.a.reason = reason;
    if (!sides.b.reason) sides.b.reason = reason;
    return;
  }
  sides.a.status = 'invalid';
  sides.b.status = 'invalid';
  sides.a.reason = reason;
  sides.b.reason = reason;
}

/** 全量复核：只处理活动连线；待重连保持待重连，失效的需编录员重新连接才恢复。 */
export function reconcileAll(holes: DrillHole[]): DrillHole[] {
  eachLine(holes, (sides) => {
    if (sides.a.status !== 'active') return;
    validateActiveLine(sides);
  });
  return holes;
}

/**
 * 拆分区间后的重挂。
 *
 * @param holeId      被拆分的钻孔
 * @param parentId    原区间 id（仍存在，被截短）
 * @param childIds    拆分产生的全部区间 id（含被截短的原区间与新区间）
 * @param parentFrom/parentTo 拆分前原区间的深度范围
 */
export function remapOnSplit(
  holes: DrillHole[],
  holeId: string,
  parentId: string,
  childIds: string[],
  parentFrom: number,
  parentTo: number,
): DrillHole[] {
  const splitHole = holes.find((hole) => hole.id === holeId);
  if (!splitHole) return holes;
  const children = splitHole.intervals.filter((item) => childIds.includes(item.id));

  eachLine(holes, (sides) => {
    if (sides.aHole.id === holeId && sides.a.status === 'active') {
      remapSide(sides, 'a', parentId, children, parentFrom, parentTo);
    }
    if (sides.bHole.id === holeId && sides.b.status === 'active') {
      remapSide(sides, 'b', parentId, children, parentFrom, parentTo);
    }
  });
  return holes;
}

function remapSide(
  sides: LineSides,
  which: 'a' | 'b',
  parentId: string,
  children: Interval[],
  parentFrom: number,
  parentTo: number,
) {
  const corr = which === 'a' ? sides.a : sides.b;
  const hole = which === 'a' ? sides.aHole : sides.bHole;
  if (corr.intervalId !== parentId) return;
  // 按重叠最多的子段重新挂接；重叠相同用锚点位置裁决
  const winner = bestOverlapInterval(children, parentFrom, parentTo, corr.anchorDepth);
  if (!winner) {
    markInvalid(sides, `拆分后在 ${hole.name} 找不到与原层位重叠的子段`);
    return;
  }
  const anchor = intervalMidpoint(winner);
  setSide(
    sides,
    which,
    { intervalId: winner.id, anchorDepth: anchor, reason: '', status: 'active' },
    // 本端挂接改变时，对端记录里的目标层位与目标锚点同步更新
    { targetIntervalId: winner.id, targetAnchorDepth: anchor, reason: '', status: 'active' },
  );
}

/**
 * 合并两个相邻区间后的处理。
 *
 * @param keptId    合并后保留的区间 id（深度已扩展）
 * @param removedId 被并入并删除的区间 id
 *
 * 按目标孔分组：两段在同一目标孔连向不同地层时，整组标成待重连；
 * 连向同一地层时归并为一条连线，重复的成对记录删除。
 */
export function remapOnMerge(
  holes: DrillHole[],
  holeId: string,
  keptId: string,
  removedId: string,
): DrillHole[] {
  const mergedHole = holes.find((hole) => hole.id === holeId);
  if (!mergedHole) return holes;
  const keptInterval = findInterval(mergedHole, keptId);

  const touching = mergedHole.correlations.filter(
    (item) => item.intervalId === keptId || item.intervalId === removedId,
  );
  const groups = new Map<string, Correlation[]>();
  for (const corr of touching) {
    const list = groups.get(corr.targetHoleId) ?? [];
    list.push(corr);
    groups.set(corr.targetHoleId, list);
  }

  const removePair = (record: Correlation) => {
    mergedHole.correlations = mergedHole.correlations.filter((item) => item.id !== record.id);
    const targetHole = holes.find((hole) => hole.id === record.targetHoleId);
    if (targetHole) {
      targetHole.correlations = targetHole.correlations.filter((item) => item.pairId !== record.pairId);
    }
  };

  groups.forEach((group) => {
    const active = group.filter((item) => item.status === 'active');
    const distinctTargets = new Set(active.map((item) => item.targetIntervalId));

    if (active.length > 1 && distinctTargets.size > 1) {
      // 两段连的目标不同 → 全部待重连（两端成对标记）
      const reason = `合并的两段连向不同地层，请重新选择层位（合并后层位 ${formatRange(keptInterval)}）`;
      active.forEach((record) => {
        record.status = 'pending';
        record.intervalId = keptId;
        if (keptInterval) record.anchorDepth = intervalMidpoint(keptInterval);
        record.reason = reason;
        const mate = findMate(holes, record);
        if (mate) {
          mate.record.status = 'pending';
          mate.record.reason = reason;
        }
      });
      group
        .filter((item) => item.status !== 'active' && item.status !== 'invalid')
        .forEach((record) => repointToKept(record));
      return;
    }

    // 目标一致：保留一条（优先原本就挂在保留段上的），其余成对删除
    if (active.length > 1) {
      const survivor = active.find((item) => item.intervalId === keptId) ?? active[0];
      active.forEach((record) => {
        if (record === survivor) {
          repointToKept(record);
        } else {
          removePair(record);
        }
      });
      group
        .filter((item) => item.status === 'pending')
        .forEach((record) => repointToKept(record));
      return;
    }

    // 组内只有一条（或全为非活动状态）：保留段重挂，状态语义不变
    group.forEach((record) => {
      if (record.status === 'invalid') return;
      repointToKept(record);
    });
  });

  // 防御：被删区间上仍残留的失效记录改挂保留段，避免悬挂 id
  mergedHole.correlations.forEach((corr) => {
    if (corr.intervalId === removedId && keptInterval) {
      corr.intervalId = keptId;
      corr.anchorDepth = intervalMidpoint(keptInterval);
    }
  });

  reconcileAll(holes);
  return holes;

  function repointToKept(record: Correlation) {
    record.intervalId = keptId;
    if (keptInterval) record.anchorDepth = intervalMidpoint(keptInterval);
  }
}

function findMate(holes: DrillHole[], record: Correlation): { hole: DrillHole; record: Correlation } | null {
  const targetHole = holes.find((hole) => hole.id === record.targetHoleId);
  const mate = targetHole?.correlations.find((item) => item.pairId === record.pairId);
  return targetHole && mate ? { hole: targetHole, record: mate } : null;
}

/** 深度边界改动后复核（活动连线锚点落出区间或两端不再重叠时显式失效）。 */
export function reconcileAfterBoundary(holes: DrillHole[]): DrillHole[] {
  return reconcileAll(holes);
}

/** 删除钻孔：清理所有孔中指向它、以及它自身留存的连线记录。 */
export function pruneRemovedHole(holes: DrillHole[], removedHoleId: string): DrillHole[] {
  holes.forEach((hole) => {
    hole.correlations = hole.correlations.filter(
      (item) => item.targetHoleId !== removedHoleId && hole.id !== removedHoleId,
    );
  });
  return holes;
}

export interface NewCorrelationRecords {
  source: Correlation;
  target: Correlation;
}

let pairCounter = 0;
export function createPairId(): string {
  pairCounter += 1;
  return `pair-${Date.now().toString(36)}-${pairCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 新建一条逻辑连线的两端记录（同孔对之间的旧活动连线由调用方先剔除）。 */
export function buildCorrelationRecords(
  sourceHole: DrillHole,
  sourceInterval: Interval,
  targetHole: DrillHole,
  targetInterval: Interval,
): NewCorrelationRecords {
  const pairId = createPairId();
  const source: Correlation = {
    id: `corr-${Math.random().toString(36).slice(2, 9)}-a`,
    pairId,
    intervalId: sourceInterval.id,
    anchorDepth: intervalMidpoint(sourceInterval),
    targetHoleId: targetHole.id,
    targetIntervalId: targetInterval.id,
    targetAnchorDepth: intervalMidpoint(targetInterval),
    color: sourceInterval.color,
    status: 'active',
    reason: '',
  };
  const target: Correlation = {
    id: `corr-${Math.random().toString(36).slice(2, 9)}-b`,
    pairId,
    intervalId: targetInterval.id,
    anchorDepth: intervalMidpoint(targetInterval),
    targetHoleId: sourceHole.id,
    targetIntervalId: sourceInterval.id,
    targetAnchorDepth: intervalMidpoint(sourceInterval),
    color: sourceInterval.color,
    status: 'active',
    reason: '',
  };
  return { source, target };
}

