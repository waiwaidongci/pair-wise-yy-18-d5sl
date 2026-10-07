import type { Correlation, DrillHole, Interval } from '../types/geology';
import { intervalMidpoint, reconcileAll } from './correlations';

/**
 * 本地草稿同步。
 *
 * 存储信封：
 * - schema v2：holes + baseHoles（合并基准）+ revision
 * - schema core-column/v1：旧版裸数组，加载时升级；升级前原稿备份，失败保留可重试
 *
 * 两个标签页同时保存同一份草稿时做三向合并（base / 本页 / 他页）：
 * - 按钻孔、按区间标识逐段合并，不再整份覆盖
 * - 两边都改了同一区间且内容不一致 → 冲突拦下，给出两边深度
 */

export const SCHEMA_V2 = 'core-column-draft/v2';
export const SCHEMA_V1 = 'core-column/v1';

export interface DraftEnvelope {
  schema: typeof SCHEMA_V2;
  revision: number;
  updatedAt: string;
  holes: DrillHole[];
  /** 三向合并基准：本页加载或上次成功合并时的快照 */
  baseHoles: DrillHole[];
}

export type ConflictKind = 'interval' | 'hole-presence' | 'hole-field';
export type ConflictSide = 'left' | 'right';

export interface MergeConflict {
  kind: ConflictKind;
  holeId: string;
  holeName: string;
  intervalId?: string;
  /** 冲突区间在本页的深度 */
  leftDepth?: string;
  /** 冲突区间在他页的深度 */
  rightDepth?: string;
  field?: string;
  leftValue?: string;
  rightValue?: string;
  message: string;
}

export interface MergeResult {
  holes: DrillHole[];
  conflicts: MergeConflict[];
  /** 合并是否无冲突（可直接落盘） */
  clean: boolean;
}

export type MigrationStatus =
  | { state: 'none' }
  | { state: 'failed'; reason: string; savedAt: string };

export function clone<T>(value: T): T {
  return structuredClone(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// 升级
// ---------------------------------------------------------------------------

/**
 * 把 v1 旧数据（无锚点连线）补锚点升级为 v2。
 * 按现有连线两端区间的中点补出 anchorDepth / targetAnchorDepth，并补 pairId/status。
 * 抛错表示升级失败，调用方必须保留原稿。
 */
export function migrateV1ToV2(rawV1: unknown): DraftEnvelope {
  if (!Array.isArray(rawV1)) {
    throw new Error('旧稿不是钻孔数组，无法识别');
  }

  const holes = rawV1 as DrillHole[];
  if (
    !holes.every(
      (hole) => isPlainObject(hole) && typeof hole.id === 'string' && Array.isArray(hole.intervals),
    )
  ) {
    throw new Error('旧稿缺少钻孔标识或区间数据');
  }

  const intervalIndex = new Map<string, { hole: DrillHole; interval: Interval }>();
  const holeIndex = new Map<string, DrillHole>();
  holes.forEach((hole) => {
    if (!Array.isArray(hole.correlations)) hole.correlations = [];
    holeIndex.set(hole.id, hole);
    hole.intervals.forEach((interval) => {
      if (!isPlainObject(interval) || typeof interval.id !== 'string') {
        throw new Error(`钻孔 ${hole.name ?? hole.id} 存在缺少标识的区间`);
      }
      intervalIndex.set(interval.id, { hole, interval });
    });
  });

  const handledPairIds = new Set<string>();
  const handledCorrelationIds = new Set<string>();
  let pairCounter = 0;
  const nextPairId = () => {
    pairCounter += 1;
    return `migrated-pair-${pairCounter}`;
  };

  for (const hole of holes) {
    for (const corr of hole.correlations as Correlation[]) {
      if (handledCorrelationIds.has(corr.id)) continue;

      const source = intervalIndex.get(corr.intervalId);
      const targetHole = holeIndex.get(corr.targetHoleId);
      const target = targetHole ? intervalIndex.get(corr.targetIntervalId) : undefined;
      const mate = targetHole?.correlations.find(
        (item: Correlation) =>
          item.targetIntervalId === corr.intervalId &&
          item.targetHoleId === hole.id &&
          item.intervalId === corr.targetIntervalId,
      );

      if (!source || !targetHole || !target) {
        throw new Error(
          `连线引用了缺失的钻孔或区间（${hole.name ?? hole.id} → ${corr.targetHoleId}），无法补锚点`,
        );
      }

      const pairId =
        typeof corr.pairId === 'string' && !handledPairIds.has(corr.pairId)
          ? corr.pairId
          : mate && typeof mate.pairId === 'string' && !handledPairIds.has(mate.pairId)
            ? mate.pairId
            : nextPairId();

      const sourceDepth = intervalMidpoint(source.interval);
      const targetDepth = intervalMidpoint(target.interval);

      corr.pairId = pairId;
      corr.anchorDepth = sourceDepth;
      corr.targetAnchorDepth = targetDepth;
      corr.status = 'active';
      corr.reason = '';
      if (typeof corr.color !== 'string') corr.color = source.interval.color;
      handledCorrelationIds.add(corr.id);

      if (mate) {
        mate.pairId = pairId;
        mate.anchorDepth = targetDepth;
        mate.targetAnchorDepth = sourceDepth;
        mate.status = 'active';
        mate.reason = '';
        handledCorrelationIds.add(mate.id);
      }
      handledPairIds.add(pairId);
    }
  }

  reconcileAll(holes);

  return {
    schema: SCHEMA_V2,
    revision: 1,
    updatedAt: new Date(0).toISOString(),
    holes,
    baseHoles: clone(holes),
  };
}

// ---------------------------------------------------------------------------
// 三向合并
// ---------------------------------------------------------------------------

const HOLE_FIELDS: Array<keyof DrillHole> = [
  'name',
  'project',
  'coordinates',
  'collarElevation',
  'totalDepth',
];

const INTERVAL_FIELDS: Array<keyof Interval> = [
  'from',
  'to',
  'lithology',
  'color',
  'structure',
  'alteration',
  'mineralization',
  'description',
  'photoUrl',
];

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatIntervalDepth(interval: Interval | undefined): string {
  if (!interval) return '已删除';
  return `${interval.from.toFixed(1)}–${interval.to.toFixed(1)} m`;
}

interface IntervalTriple {
  base?: Interval;
  left?: Interval;
  leftPresent: boolean;
  right?: Interval;
  rightPresent: boolean;
}

/** 相对 base，某字段是否被这一侧改动过（新增数据视为改动）。 */
function changed(value: unknown, baseValue: unknown, hasBase: boolean): boolean {
  return !hasBase || !sameValue(value, baseValue);
}

/**
 * 三向合并。left 为本页草稿，right 为他页已保存稿，base 为共同基准。
 * 冲突段不合并，结果 holes 中保留本页版本并在 conflicts 中列出（含两边深度）。
 */
export function mergeDrafts(
  left: DrillHole[],
  right: DrillHole[],
  base: DrillHole[],
): MergeResult {
  const conflicts: MergeConflict[] = [];
  const result: DrillHole[] = [];

  const baseMap = new Map(base.map((hole) => [hole.id, hole]));
  const leftMap = new Map(left.map((hole) => [hole.id, hole]));
  const rightMap = new Map(right.map((hole) => [hole.id, hole]));
  const allIds = new Set([...baseMap.keys(), ...leftMap.keys(), ...rightMap.keys()]);

  for (const holeId of allIds) {
    const baseHole = baseMap.get(holeId);
    const leftHole = leftMap.get(holeId);
    const rightHole = rightMap.get(holeId);
    const name = leftHole?.name ?? rightHole?.name ?? baseHole?.name ?? holeId;

    // 钻孔增删：一边新增直接收下；一边删除而另一边改过 → 冲突
    if (!leftHole || !rightHole) {
      const survivor = leftHole ?? rightHole;
      if (!baseHole) {
        if (survivor) result.push(clone(survivor));
        continue;
      }
      const otherChanged = survivor && !sameValue(stripCorrelations(survivor), stripCorrelations(baseHole));
      if (otherChanged) {
        conflicts.push({
          kind: 'hole-presence',
          holeId,
          holeName: name,
          leftDepth: leftHole ? '保留' : '已删除',
          rightDepth: rightHole ? '保留' : '已删除',
          message: leftHole
            ? `本页保留钻孔「${name}」，他页已删除`
            : `本页已删除钻孔「${name}」，他页仍在修改`,
        });
        if (leftHole) result.push(clone(leftHole));
      }
      continue;
    }

    const mergedHole: DrillHole = clone(leftHole);

    // 钻孔标量字段的三向合并
    for (const field of HOLE_FIELDS) {
      const baseValue = baseHole?.[field];
      const leftValue = leftHole[field];
      const rightValue = rightHole[field];
      if (sameValue(leftValue, rightValue)) continue;
      const leftChanged = changed(leftValue, baseValue, Boolean(baseHole));
      const rightChanged = changed(rightValue, baseValue, Boolean(baseHole));
      if (leftChanged && rightChanged) {
        conflicts.push({
          kind: 'hole-field',
          holeId,
          holeName: name,
          field: field as string,
          leftValue: String(leftValue),
          rightValue: String(rightValue),
          message: `钻孔「${name}」的 ${fieldLabel(field as string)} 两边都改了：本页 ${leftValue}，他页 ${rightValue}`,
        });
        continue;
      }
      if (rightChanged) {
        (mergedHole as unknown as Record<string, unknown>)[field] = clone(rightValue);
      }
    }

    // 区间按标识三向合并
    const intervalMap = new Map<string, IntervalTriple>();
    const register = (interval: Interval, side: 'base' | 'left' | 'right') => {
      const triple = intervalMap.get(interval.id) ?? { leftPresent: false, rightPresent: false };
      if (side === 'base') triple.base = interval;
      if (side === 'left') {
        triple.left = interval;
        triple.leftPresent = true;
      }
      if (side === 'right') {
        triple.right = interval;
        triple.rightPresent = true;
      }
      intervalMap.set(interval.id, triple);
    };
    baseHole?.intervals.forEach((item) => register(item, 'base'));
    leftHole.intervals.forEach((item) => register(item, 'left'));
    rightHole.intervals.forEach((item) => register(item, 'right'));

    // 输出顺序：先按本页顺序，再补他页新增、base 新增
    const orderedIds: string[] = [];
    const pushOrdered = (ids: string[]) => {
      ids.forEach((id) => {
        if (!orderedIds.includes(id)) orderedIds.push(id);
      });
    };
    pushOrdered(leftHole.intervals.map((item) => item.id));
    pushOrdered(rightHole.intervals.map((item) => item.id));
    if (baseHole) pushOrdered(baseHole.intervals.map((item) => item.id));

    const mergedIntervals: Interval[] = [];
    for (const intervalId of orderedIds) {
      const triple = intervalMap.get(intervalId);
      if (!triple) continue;
      const merged = mergeInterval(triple, name, holeId, conflicts);
      if (merged) mergedIntervals.push(merged);
    }
    mergedHole.intervals = mergedIntervals;
    mergedHole.correlations = mergeCorrelations(leftHole, rightHole, mergedHole);

    result.push(mergedHole);
  }

  // 裁剪指向已不存在钻孔的连线，再按新深度复核锚点
  const aliveHoleIds = new Set(result.map((hole) => hole.id));
  result.forEach((hole) => {
    hole.correlations = hole.correlations.filter((corr) => aliveHoleIds.has(corr.targetHoleId));
  });
  reconcileAll(result);

  return { holes: result, conflicts, clean: conflicts.length === 0 };
}

function mergeInterval(
  triple: IntervalTriple,
  holeName: string,
  holeId: string,
  conflicts: MergeConflict[],
): Interval | null {
  const { base, left, leftPresent, right, rightPresent } = triple;

  if (leftPresent !== rightPresent) {
    const survivor = left ?? right;
    const survivorSide: ConflictSide = leftPresent ? 'left' : 'right';
    const survivorChanged =
      survivor && (!base || !sameValue(survivor, base));
    if (!base || !survivorChanged) {
      // 新增段的单边操作直接收下；与 base 一致的删除也直接接受
      return leftPresent && left ? clone(left) : null;
    }
    conflicts.push({
      kind: 'interval',
      holeId,
      holeName,
      intervalId: survivor!.id,
      leftDepth: leftPresent ? formatIntervalDepth(left) : '已删除',
      rightDepth: rightPresent ? formatIntervalDepth(right) : '已删除',
      message:
        survivorSide === 'left'
          ? `「${holeName}」区间 ${formatIntervalDepth(survivor)}：本页修改、他页删除`
          : `「${holeName}」区间 ${formatIntervalDepth(survivor)}：本页删除、他页修改`,
    });
    return leftPresent && left ? clone(left) : null;
  }

  if (!left || !right) return null;

  // 两边都在：逐字段三向比对
  const merged = clone(left);
  const conflictFields: string[] = [];
  for (const field of INTERVAL_FIELDS) {
    const baseValue = base?.[field];
    const leftValue = left[field];
    const rightValue = right[field];
    if (sameValue(leftValue, rightValue)) continue;
    const leftChanged = changed(leftValue, baseValue, Boolean(base));
    const rightChanged = changed(rightValue, baseValue, Boolean(base));
    if (leftChanged && rightChanged) {
      conflictFields.push(fieldLabel(field as string));
    } else if (rightChanged) {
      (merged as unknown as Record<string, unknown>)[field] = clone(rightValue);
    }
  }

  if (conflictFields.length) {
    conflicts.push({
      kind: 'interval',
      holeId,
      holeName,
      intervalId: left.id,
      leftDepth: formatIntervalDepth(left),
      rightDepth: formatIntervalDepth(right),
      message:
        `「${holeName}」同一区间两边改动冲突：本页 ${formatIntervalDepth(left)}，` +
        `他页 ${formatIntervalDepth(right)}（冲突字段：${conflictFields.join('、')}）`,
    });
    return clone(left); // 冲突段先保留本页版本，待编录员选择
  }
  return merged;
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    from: '顶界深度',
    to: '底界深度',
    lithology: '岩性',
    color: '颜色',
    structure: '结构',
    alteration: '蚀变',
    mineralization: '矿化',
    description: '描述',
    photoUrl: '照片',
    name: '名称',
    project: '项目',
    coordinates: '坐标',
    collarElevation: '孔口高程',
    totalDepth: '终孔深度',
  };
  return labels[field] ?? field;
}

function mergeCorrelations(
  leftHole: DrillHole,
  rightHole: DrillHole,
  mergedHole: DrillHole,
): Correlation[] {
  const byId = new Map<string, Correlation>();
  for (const corr of leftHole.correlations) byId.set(corr.id, clone(corr));
  for (const corr of rightHole.correlations) {
    const existing = byId.get(corr.id);
    if (!existing) {
      byId.set(corr.id, clone(corr));
    } else if (existing.status !== 'active' && corr.status === 'active') {
      byId.set(corr.id, clone(corr)); // 他页已重连恢复的连线优先
    }
  }
  const aliveIntervalIds = new Set(mergedHole.intervals.map((item) => item.id));
  return [...byId.values()].filter((corr) => aliveIntervalIds.has(corr.intervalId));
}

function stripCorrelations(hole: DrillHole): Omit<DrillHole, 'correlations'> {
  const { correlations: _correlations, ...rest } = hole;
  return rest;
}

// ---------------------------------------------------------------------------
// 存储仓储
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'core-column:draft:v2';
const LEGACY_KEY = 'core-column:holes';
const BACKUP_KEY = 'core-column:draft:v1-backup';
const MIGRATION_KEY = 'core-column:draft:migration';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LoadResult {
  envelope: DraftEnvelope | null;
  migration: MigrationStatus;
}

export class DraftRepository {
  private storage: StorageLike;
  private baseHoles: DrillHole[] = [];
  migration: MigrationStatus = { state: 'none' };

  constructor(storage: StorageLike) {
    this.storage = storage;
  }

  load(): LoadResult {
    this.migration = this.readMigration();

    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const envelope = JSON.parse(raw) as DraftEnvelope;
        if (envelope?.schema === SCHEMA_V2 && Array.isArray(envelope.holes)) {
          this.baseHoles = clone(envelope.baseHoles ?? envelope.holes);
          return { envelope, migration: this.migration };
        }
      } catch {
        // 落盘损坏，继续走旧键升级流程
      }
    }

    const legacy = this.storage.getItem(LEGACY_KEY);
    if (legacy !== null) return this.loadLegacy(legacy);
    return { envelope: null, migration: this.migration };
  }

  private loadLegacy(legacy: string): LoadResult {
    if (this.migration.state === 'failed') {
      // 升级失败后保留原稿：不覆盖、不自动重试，等待用户点“重试升级”
      return { envelope: null, migration: this.migration };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(legacy);
    } catch (error) {
      return this.failMigration(`原稿无法解析：${(error as Error).message}`);
    }
    try {
      const envelope = migrateV1ToV2(parsed);
      this.storage.setItem(BACKUP_KEY, legacy); // 先备份原稿
      this.writeEnvelope(envelope);
      this.storage.removeItem(LEGACY_KEY);
      this.clearMigration();
      this.baseHoles = clone(envelope.holes);
      return { envelope, migration: { state: 'none' } };
    } catch (error) {
      return this.failMigration((error as Error).message);
    }
  }

  private failMigration(reason: string): LoadResult {
    const status: MigrationStatus = {
      state: 'failed',
      reason,
      savedAt: new Date().toISOString(),
    };
    this.migration = status;
    this.storage.setItem(MIGRATION_KEY, JSON.stringify(status));
    // 原稿 LEGACY_KEY 原样保留，绝不写 v2 键覆盖
    return { envelope: null, migration: status };
  }

  retryMigration(): LoadResult {
    const legacy = this.storage.getItem(LEGACY_KEY);
    if (legacy === null) {
      this.clearMigration();
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw) {
        const envelope = JSON.parse(raw) as DraftEnvelope;
        this.baseHoles = clone(envelope.baseHoles ?? envelope.holes);
        return { envelope, migration: { state: 'none' } };
      }
      return { envelope: null, migration: { state: 'none' } };
    }
    this.migration = { state: 'none' };
    return this.loadLegacy(legacy);
  }

  get base(): DrillHole[] {
    return this.baseHoles;
  }

  resetBase(holes: DrillHole[]) {
    this.baseHoles = clone(holes);
  }

  /**
   * 保存本页草稿。他页已写入且与基准不同时，先按区间标识三向合并：
   * 干净则合并落盘并推进基准；有冲突则整份拦下，存储保持他页版本不动。
   */
  save(localHoles: DrillHole[]): MergeResult & { revision: number } {
    const remote = this.readRemote();
    const localBase = this.baseHoles.length ? this.baseHoles : localHoles;

    if (!remote || sameValue(remote.holes, localBase)) {
      const envelope: DraftEnvelope = {
        schema: SCHEMA_V2,
        revision: remote ? remote.revision + 1 : 1,
        updatedAt: new Date().toISOString(),
        holes: clone(localHoles),
        baseHoles: clone(localBase),
      };
      this.writeEnvelope(envelope);
      this.baseHoles = clone(envelope.holes);
      return { holes: envelope.holes, conflicts: [], clean: true, revision: envelope.revision };
    }

    const mergeBase = this.baseHoles.length ? this.baseHoles : remote.baseHoles ?? remote.holes;
    const merged = mergeDrafts(localHoles, remote.holes, mergeBase);
    if (!merged.clean) {
      // 冲突拦下：不落盘，revision 维持他页版本
      return { ...merged, revision: remote.revision };
    }

    const envelope: DraftEnvelope = {
      schema: SCHEMA_V2,
      revision: remote.revision + 1,
      updatedAt: new Date().toISOString(),
      holes: merged.holes,
      baseHoles: clone(remote.holes),
    };
    this.writeEnvelope(envelope);
    this.baseHoles = clone(merged.holes);
    return { ...merged, revision: envelope.revision };
  }

  /**
   * 他页 storage 事件到达：把他页稿合进本页内存。
   * 干净时推进本页基准；有冲突时返回冲突信息，由界面提示，本页编辑不丢。
   */
  ingestRemote(localHoles: DrillHole[]): MergeResult {
    const remote = this.readRemote();
    if (!remote) return { holes: localHoles, conflicts: [], clean: true };
    const mergeBase = this.baseHoles.length ? this.baseHoles : remote.baseHoles ?? remote.holes;
    const merged = mergeDrafts(localHoles, remote.holes, mergeBase);
    if (merged.clean) this.baseHoles = clone(remote.holes);
    return merged;
  }

  /** 编录员在冲突横幅逐段选择保留哪一侧后，重新合并并落盘。 */
  resolveWith(
    localHoles: DrillHole[],
    resolutions: Map<string, ConflictSide>,
  ): MergeResult & { revision: number } {
    const remote = this.readRemote();
    if (!remote) return this.save(localHoles);
    const mergeBase = this.baseHoles.length ? this.baseHoles : remote.baseHoles ?? remote.holes;
    const localResolved = applyResolutions(localHoles, remote.holes, resolutions);
    const merged = mergeDrafts(localResolved, remote.holes, mergeBase);
    if (!merged.clean) return { ...merged, revision: remote.revision };

    const envelope: DraftEnvelope = {
      schema: SCHEMA_V2,
      revision: remote.revision + 1,
      updatedAt: new Date().toISOString(),
      holes: merged.holes,
      baseHoles: clone(remote.holes),
    };
    this.writeEnvelope(envelope);
    this.baseHoles = clone(merged.holes);
    return { ...merged, revision: envelope.revision };
  }

  private readRemote(): DraftEnvelope | null {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const envelope = JSON.parse(raw) as DraftEnvelope;
      return envelope?.schema === SCHEMA_V2 ? envelope : null;
    } catch {
      return null;
    }
  }

  private writeEnvelope(envelope: DraftEnvelope) {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  }

  private readMigration(): MigrationStatus {
    const raw = this.storage.getItem(MIGRATION_KEY);
    if (!raw) return { state: 'none' };
    try {
      const parsed = JSON.parse(raw) as MigrationStatus;
      if (parsed?.state === 'failed') return parsed;
    } catch {
      // ignore
    }
    return { state: 'none' };
  }

  private clearMigration() {
    this.migration = { state: 'none' };
    this.storage.removeItem(MIGRATION_KEY);
  }
}

function applyResolutions(
  localHoles: DrillHole[],
  remoteHoles: DrillHole[],
  resolutions: Map<string, ConflictSide>,
): DrillHole[] {
  if (resolutions.size === 0) return localHoles;
  const result = clone(localHoles);
  const remoteHoleMap = new Map(remoteHoles.map((hole) => [hole.id, hole]));

  for (const [key, side] of resolutions) {
    const [holeId, intervalId] = key.split('::');
    const localHole = result.find((hole) => hole.id === holeId);
    const remoteHole = remoteHoleMap.get(holeId);

    if (!intervalId || intervalId === 'hole') {
      if (side === 'right' && remoteHole) {
        const index = result.findIndex((hole) => hole.id === holeId);
        if (index >= 0) result[index] = clone(remoteHole);
        else result.push(clone(remoteHole));
      }
      // 选本页：保留本页钻孔；若他页删了本孔，需要让基准接受“保留”——保持现状即可
      continue;
    }

    if (side === 'right') {
      if (!localHole) continue;
      const remoteInterval = remoteHole?.intervals.find((item) => item.id === intervalId);
      const index = localHole.intervals.findIndex((item) => item.id === intervalId);
      if (remoteInterval) {
        if (index >= 0) localHole.intervals[index] = clone(remoteInterval);
        else localHole.intervals.push(clone(remoteInterval));
      } else if (index >= 0) {
        localHole.intervals.splice(index, 1); // 接受他页删除
      }
    }
    // 选本页保持本页值（包括本页删除的区间维持删除）
  }
  return result;
}

export function conflictKey(conflict: MergeConflict): string {
  return conflict.intervalId
    ? `${conflict.holeId}::${conflict.intervalId}`
    : `${conflict.holeId}::hole`;
}
