import { describe, expect, it } from 'vitest';
import type { DrillHole } from './lib/types/geology';
import {
  pruneRemovedHole,
  reconcileAfterBoundary,
  remapOnMerge,
  remapOnSplit,
} from './lib/services/correlations';
import { connect, findCorr, makeHole } from './test-helpers';

function twoHoles() {
  const a = makeHole('A', [
    ['a1', 0, 10, '覆盖层'],
    ['a2', 10, 30, '风化层'],
    ['a3', 30, 50, '基岩'],
  ], 50);
  const b = makeHole('B', [
    ['b1', 0, 12, '覆盖层'],
    ['b2', 12, 32, '风化层'],
    ['b3', 32, 50, '基岩'],
  ], 50);
  return { a, b };
}

describe('拆分：按重叠最多的子段重新挂接', () => {
  it('本端区间拆分后，连线挂到重叠更大的子段，锚点更新', () => {
    const { a, b } = twoHoles();
    connect(a, 'a2', b, 'b2');
    // 把 a2(10-30) 拆成 10-16 与 16-30：后者与原段重叠更多
    const child = { ...a.intervals[1], id: 'a2b', from: 16, to: 30, lithology: '风化层（细分）' };
    a.intervals[1] = { ...a.intervals[1], to: 16 };
    a.intervals.splice(2, 0, child);

    remapOnSplit([a, b], 'A', 'a2', ['a2', 'a2b'], 10, 30);

    const corr = findCorr(a, 'B');
    expect(corr.intervalId).toBe('a2b');
    expect(corr.status).toBe('active');
    expect(corr.anchorDepth).toBeCloseTo((16 + 30) / 2);
    // 对端记录仍指向 b2，且 targetIntervalId 不变
    expect(findCorr(b, 'A').intervalId).toBe('b2');
  });

  it('对端区间拆分时，本端记录的 targetIntervalId 跟着改到重叠最多子段', () => {
    const { a, b } = twoHoles();
    connect(a, 'a2', b, 'b2');
    const child = { ...b.intervals[1], id: 'b2b', from: 20, to: 32 };
    b.intervals[1] = { ...b.intervals[1], to: 20 };
    b.intervals.splice(2, 0, child);

    remapOnSplit([a, b], 'B', 'b2', ['b2', 'b2b'], 12, 32);

    expect(findCorr(a, 'B').targetIntervalId).toBe('b2b');
    expect(findCorr(b, 'A').intervalId).toBe('b2b');
  });

  it('等重叠（中点拆分）时结果确定，选较浅的一段', () => {
    const { a, b } = twoHoles();
    connect(a, 'a3', b, 'b3'); // a3 30-50，中点 40
    // 30-40 / 40-50 等重叠，锚点 40 在边界上
    const child = { ...a.intervals[2], id: 'a3b', from: 40, to: 50 };
    a.intervals[2] = { ...a.intervals[2], to: 40 };
    a.intervals.push(child);

    remapOnSplit([a, b], 'A', 'a3', ['a3', 'a3b'], 30, 50);
    expect(findCorr(a, 'B').intervalId).toBe('a3'); // 较浅者
  });
});

describe('合并：两段连的目标不同先标成待重连', () => {
  it('相邻两段连向同孔不同层位 → 两端记录均待重连，原因保留', () => {
    const a = makeHole('A', [
      ['a1', 0, 10, '覆盖层'],
      ['a2', 10, 20, '风化层'],
      ['a3', 20, 40, '基岩'],
    ], 40);
    const b = makeHole('B', [
      ['b1', 0, 10, '覆盖层'],
      ['b2', 10, 25, '风化层'],
      ['b3', 25, 40, '基岩'],
    ], 40);
    connect(a, 'a2', b, 'b2');
    connect(a, 'a3', b, 'b3');

    // 合并 a2 + a3 → a2
    a.intervals[1] = { ...a.intervals[1], to: 40 };
    a.intervals = a.intervals.filter((item) => item.id !== 'a3');
    remapOnMerge([a, b], 'A', 'a2', 'a3');

    const records = a.correlations.filter((item) => item.targetHoleId === 'B');
    expect(records.length).toBe(2);
    expect(records.every((item) => item.status === 'pending')).toBe(true);
    expect(records.every((item) => item.intervalId === 'a2')).toBe(true);
    expect(records.some((item) => item.reason.includes('连向不同地层'))).toBe(true);
    // 对端也待重连
    expect(b.correlations.every((item) => item.status === 'pending')).toBe(true);
  });

  it('相邻两段连向同一目标 → 归并为一条活动连线', () => {
    const a = makeHole('A', [
      ['a1', 0, 10, '覆盖层'],
      ['a2', 10, 20, '风化层'],
      ['a3', 20, 40, '基岩'],
    ], 40);
    const b = makeHole('B', [
      ['b1', 0, 40, '同一层'],
    ], 40);
    connect(a, 'a2', b, 'b1');
    connect(a, 'a3', b, 'b1');

    a.intervals[1] = { ...a.intervals[1], to: 40 };
    a.intervals = a.intervals.filter((item) => item.id !== 'a3');
    remapOnMerge([a, b], 'A', 'a2', 'a3');

    const records = a.correlations.filter((item) => item.targetHoleId === 'B');
    expect(records.length).toBe(1);
    expect(records[0].status).toBe('active');
    expect(records[0].intervalId).toBe('a2');
    expect(b.correlations.length).toBe(1);
  });

  it('两段连向不同钻孔 → 各自保持有效，不误标待重连', () => {
    const a = makeHole('A', [
      ['a1', 0, 20, '第一层'],
      ['a2', 20, 40, '第二层'],
    ], 40);
    const b = makeHole('B', [['b1', 0, 40, '对应层']], 40);
    const c = makeHole('C', [['c1', 0, 40, '对应层']], 40);
    connect(a, 'a1', b, 'b1');
    connect(a, 'a2', c, 'c1');

    a.intervals[0] = { ...a.intervals[0], to: 40 };
    a.intervals = a.intervals.filter((item) => item.id !== 'a2');
    remapOnMerge([a, b, c], 'A', 'a1', 'a2');

    expect(findCorr(a, 'B').status).toBe('active');
    expect(findCorr(a, 'C').status).toBe('active');
  });
});

describe('深度边界改动后不再重叠的连线显式失效', () => {
  it('锚点落出本端区间 → 失效且不再绘制到别的地层', () => {
    const { a, b } = twoHoles();
    connect(a, 'a2', b, 'b2'); // 锚点 20
    // 把 a2 改为 10-15（a3 顶界也移动），锚点 20 落到 a3
    a.intervals[1] = { ...a.intervals[1], to: 15 };
    a.intervals[2] = { ...a.intervals[2], from: 15 };

    reconcileAfterBoundary([a, b]);

    const corr = findCorr(a, 'B');
    expect(corr.status).toBe('invalid');
    expect(corr.intervalId).toBe('a2'); // 没有跳到 a3
    expect(corr.anchorDepth).toBe(20);
    expect(corr.reason).toContain('落出');
  });

  it('两端深度带不再重叠 → 失效，原因给出两边深度', () => {
    const a = makeHole('A', [['a1', 0, 20, '层位']], 20);
    const b = makeHole('B', [['b1', 0, 20, '层位']], 40);
    connect(a, 'a1', b, 'b1');
    // A 段收缩到 0-5，B 段挪到 12-40
    a.intervals[0] = { ...a.intervals[0], to: 5, from: 0 };
    a.totalDepth = 5;
    b.intervals[0] = { ...b.intervals[0], from: 12, to: 40 };

    reconcileAfterBoundary([a, b]);

    const corr = findCorr(a, 'B');
    expect(corr.status).toBe('invalid');
    expect(corr.reason).toContain('不再重叠');
    expect(corr.reason).toContain('0.0–5.0 m');
    expect(corr.reason).toContain('12.0–40.0 m');
  });

  it('边界微调后仍重叠 → 连线保持有效，锚点跟随中点', () => {
    const { a, b } = twoHoles();
    connect(a, 'a2', b, 'b2');
    // 共享边界 10 挪到 11：a1 0-11, a2 11-30，锚点 20 仍在 a2
    a.intervals[0] = { ...a.intervals[0], to: 11 };
    a.intervals[1] = { ...a.intervals[1], from: 11 };

    reconcileAfterBoundary([a, b]);
    expect(findCorr(a, 'B').status).toBe('active');
  });
});

describe('移除钻孔：别的孔不再留指向它的线', () => {
  it('删除中间孔后，剩余孔上指向它的记录全部清除', () => {
    const a = makeHole('A', [['a1', 0, 20, '层位']], 20);
    const b = makeHole('B', [['b1', 0, 20, '层位']], 20);
    const c = makeHole('C', [['c1', 0, 20, '层位']], 20);
    connect(a, 'a1', b, 'b1');
    connect(b, 'b1', c, 'c1');

    let holes: DrillHole[] = [a, b, c];
    pruneRemovedHole(holes, 'B');
    holes = holes.filter((hole) => hole.id !== 'B');

    expect(a.correlations).toHaveLength(0);
    expect(c.correlations).toHaveLength(0);
  });
});
