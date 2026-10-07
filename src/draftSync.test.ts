import { describe, expect, it } from 'vitest';
import type { DrillHole, Interval } from './lib/types/geology';
import {
  conflictKey,
  DraftRepository,
  mergeDrafts,
  migrateV1ToV2,
} from './lib/services/draftSync';
import { makeHole, makeMemoryStorage } from './test-helpers';

function editDepth(hole: DrillHole, intervalId: string, patch: Partial<Interval>): DrillHole[] {
  const next = structuredClone(hole);
  next.intervals = next.intervals.map((item) => (item.id === intervalId ? { ...item, ...patch } : item));
  return [next];
}

describe('三向合并：按区间标识，不整份覆盖', () => {
  it('两边各改不同区间 → 干净合并，两处改动都保留', () => {
    const base = makeHole('A', [
      ['i1', 0, 10, '覆盖层'],
      ['i2', 10, 30, '风化层'],
    ], 30);
    const left = editDepth(base, 'i1', { description: '本页改了第一段' })[0];
    const right = editDepth(base, 'i2', { description: '他页改了第二段' })[0];

    const result = mergeDrafts([left], [right], [base]);

    expect(result.clean).toBe(true);
    const merged = result.holes[0];
    expect(merged.intervals.find((i) => i.id === 'i1')!.description).toBe('本页改了第一段');
    expect(merged.intervals.find((i) => i.id === 'i2')!.description).toBe('他页改了第二段');
  });

  it('两边改同一区间且深度不一致 → 冲突拦下，给出两边深度', () => {
    const base = makeHole('A', [['i1', 0, 20, '覆盖层']], 20);
    const left = structuredClone(base);
    const right = structuredClone(base);
    left.intervals[0].to = 12;
    right.intervals[0].to = 8;

    const result = mergeDrafts([left], [right], [base]);

    expect(result.clean).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    const conflict = result.conflicts[0];
    expect(conflict.kind).toBe('interval');
    expect(conflict.leftDepth).toContain('12.0');
    expect(conflict.rightDepth).toContain('8.0');
    expect(conflict.message).toContain('本页');
    expect(conflict.message).toContain('他页');
  });

  it('只有一边相对基准改深度 → 不冲突，直接采用改动方', () => {
    const base = makeHole('A', [['i1', 0, 10, '覆盖层']], 10);
    const left = structuredClone(base); // 本页没动
    const right = structuredClone(base);
    right.intervals[0].to = 14;

    const result = mergeDrafts([left], [right], [base]);
    expect(result.clean).toBe(true);
    expect(result.holes[0].intervals[0].to).toBe(14);
  });

  it('一边新增区间另一边没动 → 合并后带上新区间', () => {
    const base = makeHole('A', [['i1', 0, 10, '覆盖层']], 20);
    const leftHole = structuredClone(base);
    leftHole.intervals.push({
      ...leftHole.intervals[0],
      id: 'i2',
      from: 10,
      to: 20,
      lithology: '基岩',
    });
    leftHole.intervals[0].to = 10;
    const right = structuredClone(base);

    const result = mergeDrafts([leftHole], [right], [base]);
    expect(result.clean).toBe(true);
    expect(result.holes[0].intervals.map((i) => i.id)).toEqual(['i1', 'i2']);
  });

  it('一边删除另一边在改同一区间 → 冲突，并标明哪侧已删除', () => {
    const base = makeHole('A', [['i1', 0, 10, '覆盖层']], 10);
    const leftHole = structuredClone(base);
    leftHole.intervals[0].lithology = '本页改成黏土';
    const rightHole = structuredClone(base);
    rightHole.intervals = [];

    const result = mergeDrafts([leftHole], [rightHole], [base]);
    expect(result.clean).toBe(false);
    expect(result.conflicts[0].leftDepth).not.toBe('已删除');
    expect(result.conflicts[0].rightDepth).toBe('已删除');
  });

  it('他页新增的钻孔也能合进来，不被本页整份覆盖掉', () => {
    const baseA = makeHole('A', [['i1', 0, 10, '覆盖层']], 10);
    const newB = makeHole('B', [['j1', 0, 20, '砂层']], 20);
    const result = mergeDrafts([structuredClone(baseA)], [structuredClone(baseA), structuredClone(newB)], [structuredClone(baseA)]);
    expect(result.clean).toBe(true);
    expect(result.holes.map((h) => h.id).sort()).toEqual(['A', 'B']);
  });
});

describe('DraftRepository：两个标签页并发保存', () => {
  function setup() {
    const storage = makeMemoryStorage();
    const base = makeHole('A', [
      ['i1', 0, 10, '覆盖层'],
      ['i2', 10, 20, '风化层'],
    ], 20);
    const tab1 = new DraftRepository(storage);
    expect(tab1.load().envelope).toBeNull();
    tab1.resetBase([structuredClone(base)]);
    // 标签页 1 先保存
    const first = tab1.save([structuredClone(base)]);
    expect(first.clean).toBe(true);
    // 标签页 2 从同一存储加载（共享同一基准）
    const tab2 = new DraftRepository(storage);
    const loaded = tab2.load();
    expect(loaded.envelope?.revision).toBe(first.revision);
    return { storage, base, tab1, tab2 };
  }

  it('两个标签页各改不同区间后保存：第二个标签页触发合并，不覆盖', () => {
    const { base, tab1, tab2 } = setup();

    const t1Holes = editDepth(base, 'i1', { description: '标签页1' });
    expect(tab1.save(t1Holes).clean).toBe(true);

    const t2Holes = editDepth(base, 'i2', { description: '标签页2' });
    const result = tab2.save(t2Holes);
    expect(result.clean).toBe(true);
    expect(result.holes[0].intervals.find((i) => i.id === 'i1')!.description).toBe('标签页1');
    expect(result.holes[0].intervals.find((i) => i.id === 'i2')!.description).toBe('标签页2');
  });

  it('两个标签页同改一段深度：后保存者被拦下，存储保持他页版本', () => {
    const { base, tab1, tab2, storage } = setup();

    const t1Holes = structuredClone([structuredClone(base)]) as DrillHole[];
    t1Holes[0].intervals[0].to = 13;
    t1Holes[0].intervals[1] = { ...t1Holes[0].intervals[1], from: 13 };
    expect(tab1.save(t1Holes).clean).toBe(true);

    const t2Holes = structuredClone([structuredClone(base)]) as DrillHole[];
    t2Holes[0].intervals[0].to = 7;
    t2Holes[0].intervals[1] = { ...t2Holes[0].intervals[1], from: 7 };
    const blocked = tab2.save(t2Holes);
    expect(blocked.clean).toBe(false);
    expect(blocked.conflicts[0].leftDepth).toContain('7.0');
    expect(blocked.conflicts[0].rightDepth).toContain('13.0');

    // 存储未被本页覆盖
    const persisted = JSON.parse(storage.getItem('core-column:draft:v2')!);
    expect(persisted.holes[0].intervals[0].to).toBe(13);
  });

  it('冲突后逐段选择“采用他页”，resolveWith 合并落盘', () => {
    const { base, tab1, tab2 } = setup();
    const t1Holes: DrillHole[] = structuredClone([structuredClone(base)]);
    t1Holes[0].intervals[0].to = 13;
    t1Holes[0].intervals[1] = { ...t1Holes[0].intervals[1], from: 13 };
    tab1.save(t1Holes);

    const t2Holes: DrillHole[] = structuredClone([structuredClone(base)]);
    t2Holes[0].intervals[0].to = 7;
    t2Holes[0].intervals[1] = { ...t2Holes[0].intervals[1], from: 7 };
    const blocked = tab2.save(t2Holes);
    expect(blocked.clean).toBe(false);

    const resolutions = new Map(blocked.conflicts.map((c) => [conflictKey(c), 'right' as const]));
    const resolved = tab2.resolveWith(t2Holes, resolutions);
    expect(resolved.clean).toBe(true);
    expect(resolved.holes[0].intervals[0].to).toBe(13);
  });
});

describe('v1 旧数据升级：按现有连线补锚点', () => {
  it('无锚点的旧连线补出两端锚点、pairId 和状态', () => {
    const holes = [
      makeHole('A', [['i1', 0, 10, '覆盖层']], 10),
      makeHole('B', [['j1', 5, 20, '覆盖层']], 20),
    ];
    // 手工构造 v1 连线（无 anchorDepth / status / pairId）
    holes[0].correlations = [
      {
        id: 'old-a',
        intervalId: 'i1',
        targetHoleId: 'B',
        targetIntervalId: 'j1',
        color: '#123456',
      } as never,
    ];
    holes[1].correlations = [
      {
        id: 'old-b',
        intervalId: 'j1',
        targetHoleId: 'A',
        targetIntervalId: 'i1',
        color: '#123456',
      } as never,
    ];

    const envelope = migrateV1ToV2(holes);
    expect(envelope.schema).toBe('core-column-draft/v2');
    const a = envelope.holes[0].correlations[0];
    const b = envelope.holes[1].correlations[0];
    expect(a.anchorDepth).toBeCloseTo(5);
    expect(a.targetAnchorDepth).toBeCloseTo(12.5);
    expect(b.anchorDepth).toBeCloseTo(12.5);
    expect(a.status).toBe('active');
    expect(a.pairId).toBeTruthy();
    expect(a.pairId).toBe(b.pairId);
    expect(envelope.baseHoles).toBeDefined();
  });

  it('连线引用了已不存在的区间 → 抛错（升级失败，原稿保留）', () => {
    const holes = [makeHole('A', [['i1', 0, 10, '覆盖层']], 10), makeHole('B', [['j1', 0, 10, '覆盖层']], 10)];
    holes[0].correlations = [
      { id: 'broken', intervalId: 'missing', targetHoleId: 'B', targetIntervalId: 'j1', color: '#000' } as never,
    ];
    expect(() => migrateV1ToV2(holes)).toThrow(/缺失的钻孔或区间/);
  });

  it('升级失败后原稿保留，重试成功', () => {
    const storage = makeMemoryStorage();
    const broken = [makeHole('A', [['i1', 0, 10, '覆盖层']], 10), makeHole('B', [['j1', 0, 10, '覆盖层']], 10)];
    broken[0].correlations = [
      { id: 'broken', intervalId: 'missing', targetHoleId: 'B', targetIntervalId: 'j1', color: '#000' } as never,
    ];
    storage.setItem('core-column:holes', JSON.stringify(broken));

    const repo = new DraftRepository(storage);
    const failed = repo.load();
    expect(failed.envelope).toBeNull();
    expect(failed.migration.state).toBe('failed');
    // v2 键不得被写入，原稿仍在
    expect(storage.getItem('core-column:draft:v2')).toBeNull();
    expect(storage.getItem('core-column:holes')).toBe(JSON.stringify(broken));

    // 修好原稿后重试
    const fixed = structuredClone(broken);
    fixed[0].correlations[0].intervalId = 'i1';
    storage.setItem('core-column:holes', JSON.stringify(fixed));
    const retried = repo.retryMigration();
    expect(retried.migration.state).toBe('none');
    expect(retried.envelope?.holes[0].correlations[0].anchorDepth).toBeCloseTo(5);
    expect(storage.getItem('core-column:holes')).toBeNull();
    expect(storage.getItem('core-column:draft:v1-backup')).toBe(JSON.stringify(fixed));
  });
});
