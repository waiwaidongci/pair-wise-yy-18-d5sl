import type { DrillHole, Interval } from '$lib/types/geology';
import {
  clamp,
  createId,
  createMockHoles,
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

  constructor() {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as DrillHole[];
          if (Array.isArray(parsed) && parsed.length) this.holes = parsed;
        }
      } catch {
        this.holes = createMockHoles();
      }
    }
    this.selectedIntervalId = this.activeHole?.intervals[0]?.id ?? null;
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
    this.commit(`边界调整至 ${safeDepth} m`, () => {
      current.to = safeDepth;
      next.from = safeDepth;
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
    });
  }

  splitSelected() {
    const hole = this.activeHole;
    const interval = this.selectedInterval;
    if (!hole || !interval || interval.to - interval.from < 0.4) return;
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
    this.commit('已合并相邻区间', () => {
      current.to = next.to;
      current.description = [current.description, next.description].filter(Boolean).join(' ');
      hole.intervals = intervals.filter((item) => item.id !== next.id);
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
      if (!source || !target) return;
      const color = source.intervals.find((item) => item.id === sourceIntervalId)?.color ?? '#64748b';
      source.correlations = [
        ...source.correlations.filter((item) => item.targetHoleId !== targetHoleId),
        {
          id: createId('corr'),
          intervalId: sourceIntervalId,
          targetHoleId,
          targetIntervalId,
          color,
        },
      ];
      target.correlations = [
        ...target.correlations.filter((item) => item.targetHoleId !== sourceHoleId),
        {
          id: createId('corr'),
          intervalId: targetIntervalId,
          targetHoleId: sourceHoleId,
          targetIntervalId: sourceIntervalId,
          color,
        },
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
    this.persist();
  }
}

export const logbook = new LogbookStore();

