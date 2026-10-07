import type { DrillHole, Interval } from '$lib/types/geology';
import type { ConflictSide, MergeConflict, MigrationStatus } from '$lib/services/draftSync';
import {
  buildCorrelationRecords,
  findInterval,
  pruneRemovedHole,
  reconcileAfterBoundary,
  remapOnMerge,
  remapOnSplit,
} from '$lib/services/correlations';
import {
  conflictKey,
  DraftRepository,
  type MergeResult,
} from '$lib/services/draftSync';
import {
  clamp,
  createId,
  createMockHoles,
  roundDepth,
  sortIntervals,
  validateHole,
} from '$lib/utils/geology';

function clone<T>(value: T): T {
  return structuredClone(value);
}

class LogbookStore {
  holes = $state<DrillHole[]>(createMockHoles());
  activeHoleId = $state('ZK-1201');
  selectedIntervalId = $state<string | null>(null);
  comparisonIds = $state<string[]>(['ZK-1201', 'ZK-1202', 'ZK-1203']);
  history = $state<DrillHole[][]>([]);
  future = $state<DrillHole[][]>([]);
  message = $state('');
  /** 多标签页同时保存产生的冲突，未解决前保存会被拦下 */
  syncConflicts = $state<MergeConflict[]>([]);
  migration = $state<MigrationStatus>({ state: 'none' });

  private repo: DraftRepository;

  constructor() {
    const storage = typeof localStorage !== 'undefined' ? localStorage : undefined;
    this.repo = new DraftRepository(storage ?? memoryStorage());
    const { envelope, migration } = this.repo.load();
    this.migration = migration;
    if (envelope) {
      this.holes = envelope.holes;
    } else if (migration.state !== 'failed') {
      this.bootstrapMock();
    }
    this.selectedIntervalId = this.activeHole?.intervals[0]?.id ?? null;

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key !== 'core-column:draft:v2' || !event.newValue) return;
        this.handleRemoteDraft();
      });
    }
  }

  private bootstrapMock() {
    // 首次使用（无任何本地数据）：落一份 v2 草稿，建立合并基准
    this.holes = createMockHoles();
    this.repo.resetBase(this.holes);
    this.persist('已载入示例钻孔');
  }

  get activeHole() {
    return this.holes.find((hole) => hole.id === this.activeHoleId) ?? this.holes[0];
  }

  get selectedInterval() {
    return this.activeHole?.intervals.find((item) => item.id === this.selectedIntervalId) ?? null;
  }

  get errors() {
    return this.activeHole ? validateHole(this.activeHole) : [];
  }

  /** 待重连 / 已失效的连线，供对比页问题面板提示 */
  get issueCorrelations() {
    return this.holes.flatMap((hole) =>
      hole.correlations
        .filter((item) => item.status !== 'active')
        .map((item) => ({ hole, correlation: item })),
    );
  }

  private persist(label: string, refetchAfter = false): MergeResult | null {
    if (this.migration.state === 'failed') {
      // 升级失败：原稿保留期间不允许覆盖
      this.message = '旧数据升级失败，原稿已保留，请先处理升级';
      return null;
    }
    const result = this.repo.save(this.holes);
    if (!result.clean) {
      this.syncConflicts = result.conflicts;
      this.message = `保存被拦下：${result.conflicts.length} 处与另一标签页冲突`;
      return result;
    }
    this.syncConflicts = [];
    this.message = label;
    if (refetchAfter) this.holes = result.holes;
    return result;
  }

  private commit(label: string, mutation: () => void) {
    this.history = [...this.history.slice(-39), clone(this.holes)];
    this.future = [];
    mutation();
    this.persist(label);
  }

  private handleRemoteDraft() {
    const merged = this.repo.ingestRemote(this.holes);
    if (merged.clean) {
      this.holes = merged.holes;
      this.syncConflicts = [];
    } else {
      this.syncConflicts = merged.conflicts;
    }
  }

  retryMigration() {
    const { envelope, migration } = this.repo.retryMigration();
    this.migration = migration;
    if (envelope) {
      this.holes = envelope.holes;
      this.syncConflicts = [];
      this.activeHoleId = this.holes[0]?.id ?? '';
      this.selectedIntervalId = this.holes[0]?.intervals[0]?.id ?? null;
      this.message = '旧数据已按现有连线补出锚点并升级';
    }
  }

  resolveConflicts(resolutions: Record<string, ConflictSide>) {
    const map = new Map(Object.entries(resolutions));
    const result = this.repo.resolveWith(this.holes, map);
    if (result.clean) {
      this.holes = result.holes;
      this.syncConflicts = [];
      this.message = '冲突已解决并合并保存';
    } else {
      this.syncConflicts = result.conflicts;
      this.message = `仍有 ${result.conflicts.length} 处冲突未解决`;
    }
  }

  discardRemoteConflicts() {
    // 放弃本页未保存的冲突段编辑，以他页已保存稿为准
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('core-column:draft:v2') : null;
    if (raw) {
      const envelope = JSON.parse(raw);
      this.holes = envelope.holes;
      this.repo.resetBase(envelope.baseHoles ?? envelope.holes);
      this.syncConflicts = [];
      this.message = '已采用另一标签页的版本';
    }
  }

  selectHole(id: string) {
    this.activeHoleId = id;
    this.selectedIntervalId = this.activeHole?.intervals[0]?.id ?? null;
  }

  selectInterval(id: string) {
    this.selectedIntervalId = id;
  }

  updateInterval(id: string, patch: Partial<Interval>) {
    this.commit('已更新区间属性', () => {
      const hole = this.activeHole;
      if (!hole) return;
      hole.intervals = hole.intervals.map((item) => (item.id === id ? { ...item, ...patch } : item));
    });
  }

  setDepthBoundary(holeId: string, intervalIndex: number, depth: number) {
    const hole = this.holes.find((item) => item.id === holeId);
    if (!hole) return;
    const intervals = sortIntervals(hole.intervals);
    const current = intervals[intervalIndex];
    const next = intervals[intervalIndex + 1];
    if (!current || !next) return;
    const lower = current.from + 0.2;
    const upper = next.to - 0.2;
    const safeDepth = roundDepth(clamp(depth, lower, upper));
    if (safeDepth === current.to) return;
    this.commit(`边界调整至 ${safeDepth} m`, () => {
      current.to = safeDepth;
      next.from = safeDepth;
      reconcileAfterBoundary(this.holes);
    });
  }

  updateIntervalDepth(id: string, edge: 'from' | 'to', value: number) {
    this.commit('已调整区间深度', () => {
      const hole = this.activeHole;
      if (!hole) return;
      const intervals = sortIntervals(hole.intervals);
      const index = intervals.findIndex((item) => item.id === id);
      const interval = intervals[index];
      if (!interval) return;
      if (edge === 'from') {
        const min = index === 0 ? 0 : intervals[index - 1].from + 0.2;
        const max = interval.to - 0.2;
        const safe = roundDepth(clamp(value, min, max));
        interval.from = safe;
        if (index > 0) intervals[index - 1].to = safe;
      } else {
        const min = interval.from + 0.2;
        const max = index === intervals.length - 1 ? hole.totalDepth : intervals[index + 1].to - 0.2;
        const safe = roundDepth(clamp(value, min, max));
        interval.to = safe;
        if (index < intervals.length - 1) intervals[index + 1].from = safe;
      }
      hole.intervals = intervals;
      reconcileAfterBoundary(this.holes);
    });
  }

  splitSelected() {
    const hole = this.activeHole;
    const interval = this.selectedInterval;
    if (!hole || !interval || interval.to - interval.from < 0.4) return;
    const parentFrom = interval.from;
    const parentTo = interval.to;
    const parentId = interval.id;
    const middle = roundDepth(interval.from + (interval.to - interval.from) / 2);
    const newInterval: Interval = {
      ...interval,
      id: createId('int'),
      from: middle,
      to: interval.to,
      lithology: `${interval.lithology}（细分）`,
      description: '',
      photoUrl: interval.photoUrl,
    };
    this.commit('已拆分区间', () => {
      interval.to = middle;
      hole.intervals = sortIntervals([...hole.intervals, newInterval]);
      remapOnSplit(this.holes, hole.id, parentId, [parentId, newInterval.id], parentFrom, parentTo);
    });
    this.selectedIntervalId = newInterval.id;
  }

  mergeSelectedWithNext() {
    const hole = this.activeHole;
    const intervals = hole ? sortIntervals(hole.intervals) : [];
    const index = intervals.findIndex((item) => item.id === this.selectedIntervalId);
    const current = intervals[index];
    const next = intervals[index + 1];
    if (!hole || !current || !next) return;
    const keptId = current.id;
    const removedId = next.id;
    this.commit('已合并相邻区间', () => {
      current.to = next.to;
      current.description = [current.description, next.description].filter(Boolean).join(' ');
      hole.intervals = intervals.filter((item) => item.id !== removedId);
      remapOnMerge(this.holes, hole.id, keptId, removedId);
    });
    this.selectedIntervalId = current.id;
  }

  addHole() {
    const index = this.holes.length + 1;
    const hole: DrillHole = {
      id: `ZK-120${index}`,
      name: `ZK-120${index}`,
      project: this.activeHole?.project ?? '新建钻探项目',
      coordinates: '待测量',
      collarElevation: 0,
      totalDepth: 40,
      intervals: [
        {
          id: createId('int'),
          from: 0,
          to: 40,
          lithology: '待编录',
          color: '#b8b1a5',
          structure: '块状',
          alteration: '无',
          mineralization: '无',
          description: '',
          photoUrl: '',
        },
      ],
      correlations: [],
    };
    this.commit('已新增钻孔', () => {
      this.holes = [...this.holes, hole];
    });
    this.activeHoleId = hole.id;
    this.selectedIntervalId = hole.intervals[0].id;
  }

  removeHole(id: string) {
    if (this.holes.length <= 1) return;
    this.commit('已删除钻孔', () => {
      pruneRemovedHole(this.holes, id);
      this.holes = this.holes.filter((item) => item.id !== id);
      this.comparisonIds = this.comparisonIds.filter((item) => item !== id);
    });
    this.activeHoleId = this.holes[0].id;
    this.selectedIntervalId = this.holes[0].intervals[0]?.id ?? null;
  }

  toggleComparison(id: string) {
    if (this.comparisonIds.includes(id)) {
      if (this.comparisonIds.length > 2) this.comparisonIds = this.comparisonIds.filter((item) => item !== id);
    } else if (this.comparisonIds.length < 3) {
      this.comparisonIds = [...this.comparisonIds, id];
    }
  }

  addCorrelation(sourceHoleId: string, sourceIntervalId: string, targetHoleId: string, targetIntervalId: string) {
    this.commit('已连接地层线', () => {
      const source = this.holes.find((item) => item.id === sourceHoleId);
      const target = this.holes.find((item) => item.id === targetHoleId);
      const sourceInterval = findInterval(source!, sourceIntervalId);
      const targetInterval = findInterval(target!, targetIntervalId);
      if (!source || !target || !sourceInterval || !targetInterval) return;
      // 同孔对之间只保留最新一条连线：旧活动线与待重连/失效线一并移除
      this.removePairBetween(source, target.id);
      this.removePairBetween(target, source.id);
      const records = buildCorrelationRecords(source, sourceInterval, target, targetInterval);
      source.correlations = [...source.correlations, records.source];
      target.correlations = [...target.correlations, records.target];
      reconcileAfterBoundary(this.holes);
    });
  }

  /** 清理两个钻孔之间的全部逻辑连线（按 pairId 成对删除，不误伤连向其他孔的线） */
  private removePairBetween(hole: DrillHole, otherHoleId: string) {
    const pairIds = new Set(
      hole.correlations.filter((item) => item.targetHoleId === otherHoleId).map((item) => item.pairId),
    );
    if (!pairIds.size) return;
    hole.correlations = hole.correlations.filter((item) => !pairIds.has(item.pairId));
    const other = this.holes.find((item) => item.id === otherHoleId);
    if (other) {
      other.correlations = other.correlations.filter((item) => !pairIds.has(item.pairId));
    }
  }

  /** 问题面板：删除一条（待重连/失效）逻辑连线的两端记录 */
  removeCorrelationPair(holeId: string, pairId: string) {
    this.commit('已移除问题连线', () => {
      this.holes.forEach((hole) => {
        hole.correlations = hole.correlations.filter(
          (item) =>
            !(
              item.pairId === pairId &&
              (hole.id === holeId || item.targetHoleId === holeId)
            ),
        );
      });
    });
  }

  /** 问题面板：按新层位重新连接一条待重连/失效连线 */
  reconnectCorrelation(
    holeId: string,
    pairId: string,
    newTargetHoleId: string,
    newTargetIntervalId: string,
  ) {
    this.commit('已重新连接地层线', () => {
      const sourceHole = this.holes.find((hole) => hole.id === holeId);
      const sourceRecord = sourceHole?.correlations.find((item) => item.pairId === pairId);
      if (!sourceHole || !sourceRecord) return;
      const sourceInterval = sourceHole.intervals.find((item) => item.id === sourceRecord.intervalId);
      const targetHole = this.holes.find((hole) => hole.id === newTargetHoleId);
      const targetInterval = targetHole?.intervals.find((item) => item.id === newTargetIntervalId);
      if (!sourceInterval || !targetHole || !targetInterval) return;

      const oldTargetHoleId = sourceRecord.targetHoleId;
      sourceRecord.targetHoleId = targetHole.id;
      sourceRecord.targetIntervalId = targetInterval.id;
      sourceRecord.anchorDepth = (sourceInterval.from + sourceInterval.to) / 2;
      sourceRecord.targetAnchorDepth = (targetInterval.from + targetInterval.to) / 2;
      sourceRecord.status = 'active';
      sourceRecord.reason = '';
      sourceRecord.color = sourceInterval.color;

      // 对端记录可能要迁到新的目标孔
      const mateHole = this.holes.find(
        (hole) =>
          hole.id !== sourceHole.id &&
          hole.correlations.some((item) => item.pairId === pairId),
      );
      const mate = mateHole?.correlations.find((item) => item.pairId === pairId);
      if (mate && mateHole) {
        if (mateHole.id !== targetHole.id) {
          mateHole.correlations = mateHole.correlations.filter((item) => item !== mate);
          targetHole.correlations = [...targetHole.correlations, mate];
        }
        mate.targetHoleId = sourceHole.id;
        mate.targetIntervalId = sourceInterval.id;
        mate.intervalId = targetInterval.id;
        mate.anchorDepth = (targetInterval.from + targetInterval.to) / 2;
        mate.targetAnchorDepth = (sourceInterval.from + sourceInterval.to) / 2;
        mate.status = 'active';
        mate.reason = '';
        mate.color = sourceInterval.color;
      }
      void oldTargetHoleId;
      reconcileAfterBoundary(this.holes);
    });
  }

  clearCorrelations() {
    this.commit('已清除地层连线', () => {
      this.holes.forEach((hole) => {
        hole.correlations = [];
      });
    });
  }

  undo() {
    const previous = this.history.at(-1);
    if (!previous) return;
    this.future = [clone(this.holes), ...this.future];
    this.holes = clone(previous);
    this.history = this.history.slice(0, -1);
    this.message = '已撤销';
    this.persist('已撤销');
  }

  redo() {
    const next = this.future[0];
    if (!next) return;
    this.history = [...this.history, clone(this.holes)];
    this.holes = clone(next);
    this.future = this.future.slice(1);
    this.message = '已重做';
    this.persist('已重做');
  }

  reset() {
    this.holes = createMockHoles();
    this.activeHoleId = this.holes[0].id;
    this.selectedIntervalId = this.holes[0].intervals[0].id;
    this.history = [];
    this.future = [];
    this.repo.resetBase(this.holes);
    this.migration = { state: 'none' };
    this.syncConflicts = [];
    this.persist('已重置为示例数据');
  }
}

function memoryStorage(): Storage {
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

export const logbook = new LogbookStore();
