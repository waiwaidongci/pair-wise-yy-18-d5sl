import type { Correlation, DraftConflict, DrillHole, Interval } from '$lib/types/geology';
import {
  clamp,
  createAnchorId,
  createId,
  createMockHoles,
  draftsEqual,
  mergeDrafts,
  migrateDraft,
  reattachCorrelationsOnMergeWithIds,
  reattachCorrelationsOnSplit,
  removeCorrelationsToHole,
  revalidateCorrelations,
  roundDepth,
  sortIntervals,
  validateHole,
} from '$lib/utils/geology';

const STORAGE_KEY = 'core-column:holes';

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
  /** 多标签页合并时的冲突段 */
  conflicts = $state<DraftConflict[]>([]);
  /** 旧数据升级失败时的错误信息 */
  migrationError = $state<string | null>(null);
  /** 升级失败保留的原稿，供重试 */
  migrationRaw = $state<unknown>(null);

  private storageListener: ((event: StorageEvent) => void) | null = null;

  constructor() {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          const result = migrateDraft(parsed);
          if (result.ok) {
            this.holes = result.holes;
          } else {
            // 升级失败：保留原稿，等待重试
            this.migrationError = result.error;
            this.migrationRaw = result.raw;
            this.holes = [];
          }
        }
      } catch {
        this.holes = createMockHoles();
      }
    }
    this.selectedIntervalId = this.activeHole?.intervals[0]?.id ?? null;
    this.setupStorageListener();
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

  private persist() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.holes));
    }
  }

  private commit(label: string, mutation: () => void) {
    this.history = [...this.history.slice(-39), clone(this.holes)];
    this.future = [];
    mutation();
    this.message = label;
    this.persist();
  }

  /** 标签页 B 收到标签页 A 的保存：按区间标识合并，冲突段拦下 */
  private setupStorageListener() {
    if (typeof window === 'undefined') return;
    this.storageListener = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const remote = JSON.parse(event.newValue) as DrillHole[];
        if (!Array.isArray(remote)) return;
        const { holes: merged, conflicts } = mergeDrafts(this.holes, remote);
        if (conflicts.length) this.conflicts = [...this.conflicts, ...conflicts];
        if (!draftsEqual(this.holes, merged)) {
          this.holes = merged;
          this.persist();
        }
      } catch {
        // 远程草稿格式损坏，忽略
      }
    };
    window.addEventListener('storage', this.storageListener);
  }

  selectHole(id: string) {
    this.activeHoleId = id;
    this.selectedIntervalId = this.activeHole?.intervals[0]?.id ?? null;
  }

  selectInterval(id: string) {
    this.selectedIntervalId = id;
  }

  updateInterval(id: string, patch: Partial<Interval>) {
    const depthChanged = patch.from !== undefined || patch.to !== undefined;
    this.commit('已更新区间属性', () => {
      const hole = this.activeHole;
      if (!hole) return;
      hole.intervals = hole.intervals.map((item) => (item.id === id ? { ...item, ...patch } : item));
      if (depthChanged) revalidateCorrelations(this.holes);
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
    this.commit(`边界调整至 ${safeDepth} m`, () => {
      current.to = safeDepth;
      next.from = safeDepth;
      revalidateCorrelations(this.holes);
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
      revalidateCorrelations(this.holes);
    });
  }

  splitSelected() {
    const hole = this.activeHole;
    const interval = this.selectedInterval;
    if (!hole || !interval || interval.to - interval.from < 0.4) return;
    const middle = roundDepth(interval.from + (interval.to - interval.from) / 2);
    const upper: Interval = {
      ...interval,
      id: createId('int'),
      from: interval.from,
      to: middle,
      anchorId: interval.anchorId,
      lithology: interval.lithology,
      description: interval.description,
      photoUrl: interval.photoUrl,
    };
    const lower: Interval = {
      ...interval,
      id: createId('int'),
      from: middle,
      to: interval.to,
      anchorId: createAnchorId(),
      lithology: `${interval.lithology}（细分）`,
      description: '',
      photoUrl: interval.photoUrl,
    };
    this.commit('已拆分区间', () => {
      // 先把引用原区间的对比线按重叠挂到子段
      reattachCorrelationsOnSplit(this.holes, hole.id, interval, upper, lower);
      hole.intervals = sortIntervals([...hole.intervals.filter((item) => item.id !== interval.id), upper, lower]);
    });
    this.selectedIntervalId = upper.id;
  }

  mergeSelectedWithNext() {
    const hole = this.activeHole;
    const intervals = hole ? sortIntervals(hole.intervals) : [];
    const index = intervals.findIndex((item) => item.id === this.selectedIntervalId);
    const current = intervals[index];
    const next = intervals[index + 1];
    if (!hole || !current || !next) return;
    const removedId = next.id;
    const removedAnchor = next.anchorId;
    this.commit('已合并相邻区间', () => {
      current.to = next.to;
      current.description = [current.description, next.description].filter(Boolean).join(' ');
      // 合并前处理连线：目标不同则标待重连，并统一改挂到合并段
      reattachCorrelationsOnMergeWithIds(this.holes, hole.id, current, removedId, removedAnchor);
      hole.intervals = intervals.filter((item) => item.id !== removedId);
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
          anchorId: createAnchorId(),
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
      this.holes = this.holes.filter((item) => item.id !== id);
      this.comparisonIds = this.comparisonIds.filter((item) => item !== id);
      removeCorrelationsToHole(this.holes, id);
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
      if (!source || !target) return;
      const sourceInterval = source.intervals.find((item) => item.id === sourceIntervalId);
      const targetInterval = target.intervals.find((item) => item.id === targetIntervalId);
      if (!sourceInterval || !targetInterval) return;
      const color = sourceInterval.color ?? '#64748b';
      const make = (
        intervalId: string,
        anchorId: string,
        tHoleId: string,
        tIntervalId: string,
        tAnchorId: string,
      ): Correlation => ({
        id: createId('corr'),
        intervalId,
        anchorId,
        targetHoleId: tHoleId,
        targetIntervalId: tIntervalId,
        targetAnchorId: tAnchorId,
        color,
        status: 'active',
      });
      source.correlations = [
        ...source.correlations.filter((item) => item.targetHoleId !== targetHoleId),
        make(
          sourceIntervalId,
          sourceInterval.anchorId,
          targetHoleId,
          targetIntervalId,
          targetInterval.anchorId,
        ),
      ];
      target.correlations = [
        ...target.correlations.filter((item) => item.targetHoleId !== sourceHoleId),
        make(
          targetIntervalId,
          targetInterval.anchorId,
          sourceHoleId,
          sourceIntervalId,
          sourceInterval.anchorId,
        ),
      ];
    });
  }

  clearCorrelations() {
    this.commit('已清除地层连线', () => {
      this.holes.forEach((hole) => {
        hole.correlations = [];
      });
    });
  }

  /** 采用远程区间深度（解决冲突） */
  adoptRemoteDepth(conflict: DraftConflict) {
    this.commit('已采用远程深度', () => {
      const hole = this.holes.find((item) => item.id === conflict.holeId);
      if (!hole) return;
      const intervals = sortIntervals(hole.intervals);
      const index = intervals.findIndex((item) => item.id === conflict.intervalId);
      const interval = intervals[index];
      if (!interval) return;
      interval.from = conflict.remote.from;
      interval.to = conflict.remote.to;
      // 同步相邻区间边界，保持连续
      if (index > 0) intervals[index - 1].to = conflict.remote.from;
      if (index < intervals.length - 1) intervals[index + 1].from = conflict.remote.to;
      hole.intervals = intervals;
      revalidateCorrelations(this.holes);
    });
    this.conflicts = this.conflicts.filter(
      (item) =>
        !(item.holeId === conflict.holeId && item.intervalId === conflict.intervalId),
    );
  }

  /** 保留本地深度（解决冲突） */
  keepLocalDepth(conflict: DraftConflict) {
    this.conflicts = this.conflicts.filter(
      (item) =>
        !(item.holeId === conflict.holeId && item.intervalId === conflict.intervalId),
    );
  }

  /** 升级失败后重试 */
  retryMigration() {
    if (this.migrationRaw === null) return;
    const result = migrateDraft(this.migrationRaw);
    if (result.ok) {
      this.holes = result.holes;
      this.migrationError = null;
      this.migrationRaw = null;
      this.selectedIntervalId = this.activeHole?.intervals[0]?.id ?? null;
      this.persist();
    } else {
      this.migrationError = result.error;
      this.migrationRaw = result.raw;
    }
  }

  undo() {
    const previous = this.history.at(-1);
    if (!previous) return;
    this.future = [clone(this.holes), ...this.future];
    this.holes = clone(previous);
    this.history = this.history.slice(0, -1);
    this.message = '已撤销';
    this.persist();
  }

  redo() {
    const next = this.future[0];
    if (!next) return;
    this.history = [...this.history, clone(this.holes)];
    this.holes = clone(next);
    this.future = this.future.slice(1);
    this.message = '已重做';
    this.persist();
  }

  reset() {
    this.holes = createMockHoles();
    this.activeHoleId = this.holes[0].id;
    this.selectedIntervalId = this.holes[0].intervals[0].id;
    this.history = [];
    this.future = [];
    this.conflicts = [];
    this.migrationError = null;
    this.migrationRaw = null;
    this.persist();
  }
}

export const logbook = new LogbookStore();
