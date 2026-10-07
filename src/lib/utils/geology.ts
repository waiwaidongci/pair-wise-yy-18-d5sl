import type {
  Correlation,
  DraftConflict,
  DrillHole,
  Interval,
  LithologyOption,
} from '../types/geology';

export const LITHOLOGY_OPTIONS: LithologyOption[] = [
  { name: '腐殖土', color: '#8b6f47' },
  { name: '粉质黏土', color: '#c6a56d' },
  { name: '细砂', color: '#dfcf8f' },
  { name: '中砂', color: '#d5b56f' },
  { name: '砾砂', color: '#aa8860' },
  { name: '强风化花岗岩', color: '#9a8f82' },
  { name: '中风化花岗岩', color: '#81756c' },
  { name: '微风化花岗岩', color: '#5f5a58' },
  { name: '构造角砾岩', color: '#8f5f56' },
  { name: '石英脉', color: '#e8e2d7' },
];

export const STRUCTURE_OPTIONS = ['块状', '层状', '碎裂', '片理', '条带状', '角砾状'];
export const ALTERATION_OPTIONS = ['无', '弱硅化', '硅化', '绢云母化', '绿泥石化', '碳酸盐化'];
export const MINERALIZATION_OPTIONS = ['无', '黄铁矿化', '黄铜矿化', '方铅矿化', '闪锌矿化', '褐铁矿化'];

export const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const roundDepth = (value: number) => Math.round(value * 10) / 10;

export function createCorePhoto(
  lithology: string,
  baseColor: string,
  seed = 1,
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 150;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const gradient = context.createLinearGradient(0, 0, 320, 150);
  gradient.addColorStop(0, '#2f3033');
  gradient.addColorStop(1, '#17181a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 320, 150);
  context.fillStyle = '#090a0b';
  context.fillRect(15, 12, 290, 126);
  const coreGradient = context.createLinearGradient(20, 0, 300, 0);
  coreGradient.addColorStop(0, baseColor);
  coreGradient.addColorStop(0.35, '#d2c2a6');
  coreGradient.addColorStop(0.52, baseColor);
  coreGradient.addColorStop(0.75, '#b7a58d');
  coreGradient.addColorStop(1, baseColor);
  context.fillStyle = coreGradient;
  context.beginPath();
  context.roundRect(20, 20, 280, 108, 8);
  context.fill();
  let state = seed * 7919;
  for (let index = 0; index < 420; index += 1) {
    state = (state * 9301 + 49297) % 233280;
    const x = 22 + (state / 233280) * 276;
    state = (state * 9301 + 49297) % 233280;
    const y = 22 + (state / 233280) * 104;
    const size = 0.6 + ((state % 7) / 7) * 2.4;
    context.fillStyle = index % 3 === 0 ? 'rgba(45,38,30,.38)' : 'rgba(255,255,255,.18)';
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = 'rgba(255,255,255,.25)';
  context.lineWidth = 1;
  for (let index = 0; index < 9; index += 1) {
    const x = 38 + index * 29 + Math.sin(seed + index) * 7;
    context.beginPath();
    context.moveTo(x, 24);
    context.bezierCurveTo(x + 9, 50, x - 11, 88, x + 4, 124);
    context.stroke();
  }
  context.fillStyle = 'rgba(0,0,0,.7)';
  context.fillRect(20, 119, 280, 9);
  context.fillStyle = '#fff';
  context.font = '10px sans-serif';
  context.fillText(`${lithology} · 编录照片`, 24, 127);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function interval(
  from: number,
  to: number,
  lithology: string,
  color: string,
  structure: string,
  alteration: string,
  mineralization: string,
  description: string,
): Interval {
  return {
    id: createId('int'),
    anchorId: createAnchorId(),
    from,
    to,
    lithology,
    color,
    structure,
    alteration,
    mineralization,
    description,
    photoUrl: createCorePhoto(lithology, color, Math.round(from * 10 + to)),
  };
}

export function createMockHoles(): DrillHole[] {
  return [
    {
      id: 'ZK-1201',
      name: 'ZK-1201',
      project: '北岭铜多金属矿普查',
      coordinates: 'X 318742.6 / Y 2573198.1',
      collarElevation: 1264.8,
      totalDepth: 62,
      intervals: [
        interval(0, 4.2, '腐殖土', '#8b6f47', '松散', '无', '无', '褐灰色，含植物根系，表层局部回填。'),
        interval(4.2, 12.8, '粉质黏土', '#c6a56d', '层状', '弱硅化', '无', '黄褐色，稍湿，可塑，含少量铁锰氧化物。'),
        interval(12.8, 24.5, '砾砂', '#aa8860', '层状', '无', '无', '灰黄色，中密，砾石磨圆度较好，局部夹黏土透镜体。'),
        interval(24.5, 35.2, '强风化花岗岩', '#9a8f82', '碎裂', '绢云母化', '黄铁矿化', '褐灰色，原岩结构可辨，节理裂隙发育，岩芯呈碎块状。'),
        interval(35.2, 48.8, '中风化花岗岩', '#81756c', '块状', '硅化', '黄铜矿化', '灰至浅灰色，中细粒结构，岩芯较完整，沿裂隙见薄膜状矿化。'),
        interval(48.8, 62, '微风化花岗岩', '#5f5a58', '块状', '弱硅化', '无', '深灰色，岩质坚硬，RQD 约 82%，仅局部裂隙面见蚀变。'),
      ],
      correlations: [],
    },
    {
      id: 'ZK-1202',
      name: 'ZK-1202',
      project: '北岭铜多金属矿普查',
      coordinates: 'X 318918.4 / Y 2573054.7',
      collarElevation: 1271.3,
      totalDepth: 66,
      intervals: [
        interval(0, 6.5, '腐殖土', '#8b6f47', '松散', '无', '无', '灰褐色，覆盖层较厚，含碎石。'),
        interval(6.5, 16.2, '粉质黏土', '#c6a56d', '层状', '碳酸盐化', '无', '黄棕色，局部钙质结核，干强度中等。'),
        interval(16.2, 29.4, '细砂', '#dfcf8f', '层状', '无', '无', '浅黄色，饱和，中密，颗粒均匀。'),
        interval(29.4, 41.8, '强风化花岗岩', '#9a8f82', '碎裂', '绿泥石化', '黄铁矿化', '灰绿色，岩体破碎，蚀变不均匀。'),
        interval(41.8, 55.5, '中风化花岗岩', '#81756c', '块状', '硅化', '黄铜矿化', '浅灰色，裂隙面见孔雀石化，岩芯呈短柱状。'),
        interval(55.5, 66, '微风化花岗岩', '#5f5a58', '块状', '弱硅化', '无', '青灰色，坚硬完整。'),
      ],
      correlations: [],
    },
    {
      id: 'ZK-1203',
      name: 'ZK-1203',
      project: '北岭铜多金属矿普查',
      coordinates: 'X 319096.2 / Y 2572891.5',
      collarElevation: 1258.6,
      totalDepth: 58,
      intervals: [
        interval(0, 3.8, '腐殖土', '#8b6f47', '松散', '无', '无', '暗褐色，耕地回填层，底部见少量砾石。'),
        interval(3.8, 19.6, '砾砂', '#aa8860', '层状', '无', '无', '灰黄色，密实，含少量卵石。'),
        interval(19.6, 31.5, '构造角砾岩', '#8f5f56', '角砾状', '绢云母化', '黄铁矿化', '褐红色，角砾成分复杂，蚀变矿物沿胶结物分布。'),
        interval(31.5, 44.2, '中风化花岗岩', '#81756c', '块状', '硅化', '黄铜矿化', '灰白色，硅化较强，局部见细脉状金属矿物。'),
        interval(44.2, 58, '微风化花岗岩', '#5f5a58', '块状', '弱硅化', '无', '深灰色，岩芯完整。'),
      ],
      correlations: [],
    },
  ];
}

export function intervalAtDepth(hole: DrillHole, depth: number) {
  return hole.intervals.find((item) => depth >= item.from && depth <= item.to) ?? null;
}

export function sortIntervals(intervals: Interval[]) {
  return [...intervals].sort((a, b) => a.from - b.from || a.to - b.to);
}

export function validateHole(hole: DrillHole) {
  const errors: string[] = [];
  const intervals = sortIntervals(hole.intervals);
  intervals.forEach((item, index) => {
    if (item.to <= item.from) errors.push(`${item.lithology} 区间深度无效`);
    if (index > 0 && Math.abs(item.from - intervals[index - 1].to) > 0.001) {
      errors.push(`${intervals[index - 1].to} m 与 ${item.from} m 之间不连续`);
    }
  });
  if (intervals[0] && Math.abs(intervals[0].from) > 0.001) errors.push('柱状图必须从 0 m 开始');
  if (intervals.at(-1) && Math.abs(intervals.at(-1)!.to - hole.totalDepth) > 0.001) {
    errors.push(`底部深度应等于终孔深度 ${hole.totalDepth} m`);
  }
  return [...new Set(errors)];
}

// ---------------------------------------------------------------------------
// 锚点与对比线
// ---------------------------------------------------------------------------

export const createAnchorId = () => createId('anc');

/** 两个深度区间的重叠长度（不重叠返回 0） */
export function intervalOverlap(a: { from: number; to: number }, b: { from: number; to: number }) {
  return Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));
}

export function findIntervalByAnchor(hole: DrillHole, anchorId: string) {
  return hole.intervals.find((item) => item.anchorId === anchorId) ?? null;
}

/** 渲染/校验时定位对比线起点区间：先按区间 id，找不到再回退到锚点 */
export function findSourceInterval(hole: DrillHole, corr: Correlation): Interval | null {
  return (
    hole.intervals.find((item) => item.id === corr.intervalId) ??
    findIntervalByAnchor(hole, corr.anchorId)
  );
}

/** 渲染/校验时定位对比线目标区间：先按区间 id，找不到再回退到锚点 */
export function findTargetInterval(holes: DrillHole[], corr: Correlation): {
  hole: DrillHole;
  interval: Interval;
} | null {
  const hole = holes.find((item) => item.id === corr.targetHoleId);
  if (!hole) return null;
  const interval =
    hole.intervals.find((item) => item.id === corr.targetIntervalId) ??
    findIntervalByAnchor(hole, corr.targetAnchorId);
  if (!interval) return null;
  return { hole, interval };
}

/**
 * 拆分后把引用原区间的对比线重新挂接到重叠最多的子段。
 * 约定：上子段继承原锚点，下子段分配新锚点；每条线按与另一端的重叠长度选择落在哪一段。
 */
export function reattachCorrelationsOnSplit(
  holes: DrillHole[],
  splitHoleId: string,
  original: Interval,
  upper: Interval,
  lower: Interval,
) {
  const originalAnchor = original.anchorId;
  // 先确定两个子段的锚点：上子段继承原锚点，下子段分配新锚点
  upper.anchorId = originalAnchor;
  lower.anchorId = createAnchorId();
  for (const hole of holes) {
    for (const corr of hole.correlations) {
      const isSource = hole.id === splitHoleId && corr.intervalId === original.id;
      const isTarget = corr.targetHoleId === splitHoleId && corr.targetIntervalId === original.id;
      if (!isSource && !isTarget) continue;

      // 另一端区间，用于判断与哪个子段重叠更多
      let other: Interval | null = null;
      if (isSource) {
        other = findTargetInterval(holes, corr)?.interval ?? null;
      } else {
        other = findSourceInterval(hole, corr);
      }

      const overlapUpper = other ? intervalOverlap(upper, other) : 0;
      const overlapLower = other ? intervalOverlap(lower, other) : 0;
      // 重叠一样时优先挂上子段
      const attachUpper = overlapUpper >= overlapLower;

      if (isSource) {
        corr.intervalId = attachUpper ? upper.id : lower.id;
        corr.anchorId = attachUpper ? upper.anchorId : lower.anchorId;
      } else {
        corr.targetIntervalId = attachUpper ? upper.id : lower.id;
        corr.targetAnchorId = attachUpper ? upper.anchorId : lower.anchorId;
      }
    }
  }
}

/**
 * 合并后处理引用被合并两段的对比线（带两段原始 id，用于判断目标是否一致）。
 */
export function reattachCorrelationsOnMergeWithIds(
  holes: DrillHole[],
  mergedHoleId: string,
  merged: Interval,
  removedId: string,
  removedAnchor: string,
) {
  const sourceHole = holes.find((item) => item.id === mergedHoleId);
  const mergedCorrs =
    sourceHole?.correlations.filter(
      (item) => item.intervalId === merged.id || item.intervalId === removedId,
    ) ?? [];
  // 以被移除段为起点的目标集合
  const removedTargets = new Set(
    mergedCorrs
      .filter((item) => item.intervalId === removedId)
      .map((item) => `${item.targetHoleId}:${item.targetIntervalId}`),
  );
  // 以保留段为起点的目标集合（排除已被改成 merged 的，调用前 merged 仍是保留段 id）
  const keptTargets = new Set(
    mergedCorrs
      .filter((item) => item.intervalId === merged.id)
      .map((item) => `${item.targetHoleId}:${item.targetIntervalId}`),
  );
  const targetsDiffer =
    removedTargets.size > 0 &&
    keptTargets.size > 0 &&
    (removedTargets.size !== keptTargets.size ||
      [...removedTargets].some((key) => !keptTargets.has(key)));

  for (const hole of holes) {
    for (const corr of hole.correlations) {
      const isSource =
        hole.id === mergedHoleId &&
        (corr.intervalId === merged.id || corr.intervalId === removedId);
      const isTarget =
        corr.targetHoleId === mergedHoleId &&
        (corr.targetIntervalId === merged.id || corr.targetIntervalId === removedId);
      if (!isSource && !isTarget) continue;
      if (isSource) {
        corr.intervalId = merged.id;
        corr.anchorId = merged.anchorId;
      } else {
        corr.targetIntervalId = merged.id;
        corr.targetAnchorId = merged.anchorId;
      }
      if (targetsDiffer) corr.status = 'pending';
    }
  }
  void removedAnchor;
}

/**
 * 深度改动后校验所有对比线：起点或目标找不到、或深度区间不再重叠的，显式置为失效。
 * 仅处理 active 状态；pending / invalid 保持，等用户手动重连。
 */
export function revalidateCorrelations(holes: DrillHole[]) {
  for (const hole of holes) {
    for (const corr of hole.correlations) {
      if (corr.status !== 'active') continue;
      const source = findSourceInterval(hole, corr);
      const target = findTargetInterval(holes, corr);
      if (!source || !target) {
        corr.status = 'invalid';
        continue;
      }
      if (intervalOverlap(source, target.interval) <= 0) {
        corr.status = 'invalid';
      }
    }
  }
}

/** 移除钻孔后，清理其他孔指向该孔的对比线 */
export function removeCorrelationsToHole(holes: DrillHole[], removedHoleId: string) {
  for (const hole of holes) {
    if (hole.id === removedHoleId) continue;
    hole.correlations = hole.correlations.filter((item) => item.targetHoleId !== removedHoleId);
  }
}

// ---------------------------------------------------------------------------
// 数据升级（旧数据无锚点 → 按现有连线补锚点）
// ---------------------------------------------------------------------------

export type MigrationResult =
  | { ok: true; holes: DrillHole[] }
  | { ok: false; error: string; raw: unknown };

function isIntervalLike(value: unknown): value is Interval {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Interval).id === 'string' &&
    typeof (value as Interval).from === 'number' &&
    typeof (value as Interval).to === 'number'
  );
}

function isCorrelationLike(value: unknown): value is Correlation {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Correlation).id === 'string' &&
    typeof (value as Correlation).intervalId === 'string' &&
    typeof (value as Correlation).targetHoleId === 'string' &&
    typeof (value as Correlation).targetIntervalId === 'string'
  );
}

function isHoleLike(value: unknown): value is DrillHole {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as DrillHole).id === 'string' &&
    Array.isArray((value as DrillHole).intervals) &&
    (value as DrillHole).intervals.every(isIntervalLike) &&
    Array.isArray((value as DrillHole).correlations) &&
    (value as DrillHole).correlations.every(isCorrelationLike)
  );
}

/**
 * 把旧版本草稿升级为带锚点的新版本。
 * - 每个区间补 anchorId
 * - 每条连线按起点/目标区间补 anchorId / targetAnchorId
 * - 补 status；找不到区间或不再重叠的置为 invalid
 * 任何一步抛错都返回失败，保留原稿，由调用方重试。
 */
export function migrateDraft(raw: unknown): MigrationResult {
  try {
    let holes: DrillHole[];
    if (Array.isArray(raw)) {
      holes = raw as DrillHole[];
    } else if (
      typeof raw === 'object' &&
      raw !== null &&
      Array.isArray((raw as { holes?: unknown }).holes)
    ) {
      holes = (raw as { holes: DrillHole[] }).holes;
    } else {
      return { ok: false, error: '草稿格式无法识别', raw };
    }

    if (!holes.every(isHoleLike)) {
      return { ok: false, error: '草稿缺少必要的钻孔或区间字段', raw };
    }

    // 深拷贝，避免直接改原稿
    const migrated: DrillHole[] = structuredClone(holes);

    // 先给所有区间补锚点，再处理连线（连线可能跨孔引用，必须等所有锚点就位）
    for (const hole of migrated) {
      for (const interval of hole.intervals) {
        if (!interval.anchorId) interval.anchorId = createAnchorId();
      }
    }

    for (const hole of migrated) {
      for (const corr of hole.correlations) {
        const source = hole.intervals.find((item) => item.id === corr.intervalId);
        if (!source) {
          corr.status = 'invalid';
          continue;
        }
        if (!corr.anchorId) corr.anchorId = source.anchorId;

        const target = migrated.find((item) => item.id === corr.targetHoleId);
        const targetInterval = target?.intervals.find((item) => item.id === corr.targetIntervalId);
        if (!targetInterval) {
          corr.status = 'invalid';
          continue;
        }
        if (!corr.targetAnchorId) corr.targetAnchorId = targetInterval.anchorId;

        if (!corr.status) {
          corr.status = intervalOverlap(source, targetInterval) > 0 ? 'active' : 'invalid';
        }
      }
    }

    return { ok: true, holes: migrated };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '升级过程中发生未知错误',
      raw,
    };
  }
}

// ---------------------------------------------------------------------------
// 多标签页草稿合并（按区间标识合并，冲突段拦下给两边深度）
// ---------------------------------------------------------------------------

/** 合并两份连线列表：同 id 取远程（最新保存），其余按 id 并集 */
function mergeCorrelationLists(local: Correlation[], remote: Correlation[]): Correlation[] {
  const map = new Map<string, Correlation>();
  for (const corr of local) map.set(corr.id, corr);
  for (const corr of remote) map.set(corr.id, corr);
  return [...map.values()];
}

export interface DraftMergeResult {
  holes: DrillHole[];
  conflicts: DraftConflict[];
}

/**
 * 标签页 A 保存后，标签页 B 收到远程草稿时调用。
 * 按钻孔 id + 区间 id 合并：
 * - 远程新增的钻孔/区间 → 并入
 * - 两边都有且深度一致 → 合并（远程非深度字段生效）
 * - 同区间深度不一致 → 拦下，保留本地，上报冲突与两边深度
 */
export function mergeDrafts(local: DrillHole[], remote: DrillHole[]): DraftMergeResult {
  const conflicts: DraftConflict[] = [];
  const merged: DrillHole[] = [];

  for (const remoteHole of remote) {
    const localHole = local.find((item) => item.id === remoteHole.id);
    if (!localHole) {
      merged.push(structuredClone(remoteHole));
      continue;
    }

    const mergedIntervals: Interval[] = [];
    for (const remoteInterval of remoteHole.intervals) {
      const localInterval = localHole.intervals.find((item) => item.id === remoteInterval.id);
      if (!localInterval) {
        mergedIntervals.push(structuredClone(remoteInterval));
        continue;
      }
      const depthConflict =
        Math.abs(localInterval.from - remoteInterval.from) > 0.001 ||
        Math.abs(localInterval.to - remoteInterval.to) > 0.001;
      if (depthConflict) {
        conflicts.push({
          holeId: remoteHole.id,
          intervalId: remoteInterval.id,
          local: { from: localInterval.from, to: localInterval.to },
          remote: { from: remoteInterval.from, to: remoteInterval.to },
        });
        mergedIntervals.push(localInterval);
      } else {
        // 深度一致，非深度字段以远程为准
        mergedIntervals.push({ ...localInterval, ...remoteInterval });
      }
    }
    // 本地有、远程没有的区间保留
    for (const localInterval of localHole.intervals) {
      if (!remoteHole.intervals.some((item) => item.id === localInterval.id)) {
        mergedIntervals.push(localInterval);
      }
    }

    const mergedCorrelations = mergeCorrelationLists(
      localHole.correlations,
      remoteHole.correlations,
    );

    merged.push({
      ...localHole,
      intervals: mergedIntervals,
      correlations: mergedCorrelations,
    });
  }

  // 本地有、远程没有的钻孔保留
  for (const localHole of local) {
    if (!remote.some((item) => item.id === localHole.id)) {
      merged.push(localHole);
    }
  }

  return { holes: merged, conflicts };
}

/** 判断两份草稿是否深度一致（用于避免 storage 事件回环） */
export function draftsEqual(a: DrillHole[], b: DrillHole[]): boolean {
  if (a.length !== b.length) return false;
  for (const holeA of a) {
    const holeB = b.find((item) => item.id === holeA.id);
    if (!holeB) return false;
    if (holeA.intervals.length !== holeB.intervals.length) return false;
    for (const intA of holeA.intervals) {
      const intB = holeB.intervals.find((item) => item.id === intA.id);
      if (!intB) return false;
      if (
        Math.abs(intA.from - intB.from) > 0.001 ||
        Math.abs(intA.to - intB.to) > 0.001
      ) {
        return false;
      }
    }
  }
  return true;
}

