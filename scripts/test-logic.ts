/**
 * 核心逻辑验证：锚点、拆分挂接、合并待重连、深度失效、移除钻孔、多标签页合并、升级。
 * 运行：npx tsx scripts/test-logic.ts
 */
import assert from 'node:assert';
import type { Correlation, DrillHole, Interval } from '../src/lib/types/geology';
import {
  createAnchorId,
  createId,
  intervalOverlap,
  mergeDrafts,
  migrateDraft,
  reattachCorrelationsOnMergeWithIds,
  reattachCorrelationsOnSplit,
  removeCorrelationsToHole,
  revalidateCorrelations,
} from '../src/lib/utils/geology';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

function makeInterval(id: string, from: number, to: number, anchorId?: string): Interval {
  return {
    id,
    anchorId: anchorId ?? createAnchorId(),
    from,
    to,
    lithology: '砂岩',
    color: '#aaa',
    structure: '块状',
    alteration: '无',
    mineralization: '无',
    description: '',
    photoUrl: '',
  };
}

function makeCorr(
  id: string,
  intervalId: string,
  anchorId: string,
  targetHoleId: string,
  targetIntervalId: string,
  targetAnchorId: string,
  status: Correlation['status'] = 'active',
): Correlation {
  return {
    id,
    intervalId,
    anchorId,
    targetHoleId,
    targetIntervalId,
    targetAnchorId,
    color: '#f00',
    status,
  };
}

function makeHole(id: string, intervals: Interval[], correlations: Correlation[] = []): DrillHole {
  return {
    id,
    name: id,
    project: '测试',
    coordinates: '',
    collarElevation: 0,
    totalDepth: 100,
    intervals,
    correlations,
  };
}

console.log('\n锚点与重叠');
test('intervalOverlap 计算正确', () => {
  assert.strictEqual(intervalOverlap({ from: 0, to: 10 }, { from: 5, to: 15 }), 5);
  assert.strictEqual(intervalOverlap({ from: 0, to: 5 }, { from: 5, to: 10 }), 0);
  assert.strictEqual(intervalOverlap({ from: 0, to: 4 }, { from: 5, to: 10 }), 0);
  assert.strictEqual(intervalOverlap({ from: 0, to: 20 }, { from: 5, to: 15 }), 10);
});

console.log('\n升级（旧数据无锚点）');
test('旧区间补锚点，旧连线按区间补锚点', () => {
  const intA = makeInterval('a', 0, 10, '');
  const intB = makeInterval('b', 5, 15, '');
  // 旧数据：没有 anchorId 字段
  const oldA = { ...intA, anchorId: undefined } as unknown as Interval;
  const oldB = { ...intB, anchorId: undefined } as unknown as Interval;
  const corr = makeCorr('c1', 'a', '', 'H2', 'b', '');
  const oldCorr = { ...corr, anchorId: undefined, targetAnchorId: undefined, status: undefined } as unknown as Correlation;
  const holes = [makeHole('H1', [oldA], [oldCorr]), makeHole('H2', [oldB])];
  const result = migrateDraft(holes);
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  const [h1, h2] = result.holes;
  assert.ok(h1.intervals[0].anchorId, '区间应有锚点');
  assert.ok(h2.intervals[0].anchorId, '目标区间应有锚点');
  assert.strictEqual(h1.correlations[0].anchorId, h1.intervals[0].anchorId);
  assert.strictEqual(h1.correlations[0].targetAnchorId, h2.intervals[0].anchorId);
  assert.strictEqual(h1.correlations[0].status, 'active');
});

test('找不到区间的旧连线升级为 invalid', () => {
  const oldA = { ...makeInterval('a', 0, 10), anchorId: undefined } as unknown as Interval;
  const corr = makeCorr('c1', 'gone', '', 'H2', 'b', '');
  const oldCorr = { ...corr, anchorId: undefined, targetAnchorId: undefined, status: undefined } as unknown as Correlation;
  const holes = [makeHole('H1', [oldA], [oldCorr]), makeHole('H2', [makeInterval('b', 5, 15)])];
  const result = migrateDraft(holes);
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.holes[0].correlations[0].status, 'invalid');
});

test('损坏数据升级失败并保留原稿', () => {
  const result = migrateDraft({ not: 'a draft' });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.ok(result.error);
  assert.deepStrictEqual(result.raw, { not: 'a draft' });
});

console.log('\n拆分挂接');
test('拆分后连线挂到重叠最多的子段', () => {
  // H1: 区间 a(0-10) 连到 H2: 区间 b(8-12)。a 拆成 upper(0-5), lower(5-10)
  // b(8-12) 与 lower(5-10) 重叠 2，与 upper(0-5) 重叠 0 → 挂 lower
  const upper = makeInterval('a-up', 0, 5, 'anc-a');
  const lower = makeInterval('a-low', 5, 10, 'anc-new');
  const target = makeInterval('b', 8, 12, 'anc-b');
  const corr = makeCorr('c1', 'a', 'anc-a', 'H2', 'b', 'anc-b');
  const holes = [
    makeHole('H1', [makeInterval('a', 0, 10, 'anc-a')], [corr]),
    makeHole('H2', [target]),
  ];
  reattachCorrelationsOnSplit(holes, 'H1', holes[0].intervals[0], upper, lower);
  assert.strictEqual(holes[0].correlations[0].intervalId, 'a-low');
  // 锚点必须与所挂子段一致
  const attached = lower;
  assert.strictEqual(holes[0].correlations[0].anchorId, attached.anchorId);
});

test('拆分后反向连线也挂到重叠最多的子段', () => {
  // H2 的区间 b(8-12) 连到 H1 的 a(0-10)。a 拆成 upper(0-5), lower(5-10)
  const upper = makeInterval('a-up', 0, 5, 'anc-a');
  const lower = makeInterval('a-low', 5, 10, 'anc-new');
  const source = makeInterval('b', 8, 12, 'anc-b');
  const corr = makeCorr('c1', 'b', 'anc-b', 'H1', 'a', 'anc-a');
  const holes = [
    makeHole('H1', [makeInterval('a', 0, 10, 'anc-a')]),
    makeHole('H2', [source], [corr]),
  ];
  reattachCorrelationsOnSplit(holes, 'H1', holes[0].intervals[0], upper, lower);
  assert.strictEqual(holes[1].correlations[0].targetIntervalId, 'a-low');
  assert.strictEqual(holes[1].correlations[0].targetAnchorId, lower.anchorId);
});

console.log('\n合并待重连');
test('合并两段连的目标不同 → 待重连', () => {
  // H1: a(0-5) 连 H2 的 b(1-4)；c(5-10) 连 H2 的 d(6-9)。合并 a+c
  const a = makeInterval('a', 0, 5, 'anc-a');
  const c = makeInterval('c', 5, 10, 'anc-c');
  const b = makeInterval('b', 1, 4, 'anc-b');
  const d = makeInterval('d', 6, 9, 'anc-d');
  const corrA = makeCorr('ca', 'a', 'anc-a', 'H2', 'b', 'anc-b');
  const corrC = makeCorr('cc', 'c', 'anc-c', 'H2', 'd', 'anc-d');
  const holes = [
    makeHole('H1', [a, c], [corrA, corrC]),
    makeHole('H2', [b, d]),
  ];
  // 合并：a 保留，c 移除
  reattachCorrelationsOnMergeWithIds(holes, 'H1', a, 'c', 'anc-c');
  assert.strictEqual(holes[0].correlations[0].status, 'pending');
  assert.strictEqual(holes[0].correlations[1].status, 'pending');
  assert.strictEqual(holes[0].correlations[0].intervalId, 'a');
});

test('合并两段连的目标相同 → 保持 active', () => {
  const a = makeInterval('a', 0, 5, 'anc-a');
  const c = makeInterval('c', 5, 10, 'anc-c');
  const b = makeInterval('b', 1, 9, 'anc-b');
  const corrA = makeCorr('ca', 'a', 'anc-a', 'H2', 'b', 'anc-b');
  const corrC = makeCorr('cc', 'c', 'anc-c', 'H2', 'b', 'anc-b');
  const holes = [
    makeHole('H1', [a, c], [corrA, corrC]),
    makeHole('H2', [b]),
  ];
  reattachCorrelationsOnMergeWithIds(holes, 'H1', a, 'c', 'anc-c');
  assert.strictEqual(holes[0].correlations[0].status, 'active');
  assert.strictEqual(holes[0].correlations[1].status, 'active');
});

console.log('\n深度失效');
test('边界改动后不再重叠的连线显式失效', () => {
  // a(0-10) 连 b(8-12)，重叠 2 → active
  const a = makeInterval('a', 0, 10, 'anc-a');
  const b = makeInterval('b', 8, 12, 'anc-b');
  const corr = makeCorr('c1', 'a', 'anc-a', 'H2', 'b', 'anc-b');
  const holes = [makeHole('H1', [a], [corr]), makeHole('H2', [b])];
  revalidateCorrelations(holes);
  assert.strictEqual(holes[0].correlations[0].status, 'active');
  // 把 a 的底提到 7，a(0-7) 与 b(8-12) 不再重叠 → invalid
  a.to = 7;
  revalidateCorrelations(holes);
  assert.strictEqual(holes[0].correlations[0].status, 'invalid');
});

test('找不到起点区间的连线显式失效', () => {
  const b = makeInterval('b', 8, 12, 'anc-b');
  const corr = makeCorr('c1', 'gone', 'anc-a', 'H2', 'b', 'anc-b');
  const holes = [makeHole('H1', [], [corr]), makeHole('H2', [b])];
  revalidateCorrelations(holes);
  assert.strictEqual(holes[0].correlations[0].status, 'invalid');
});

console.log('\n移除钻孔');
test('移除钻孔后其他孔指向它的连线被清理', () => {
  const a = makeInterval('a', 0, 10, 'anc-a');
  const b = makeInterval('b', 8, 12, 'anc-b');
  const corr = makeCorr('c1', 'a', 'anc-a', 'H2', 'b', 'anc-b');
  const holes = [makeHole('H1', [a], [corr]), makeHole('H2', [b])];
  removeCorrelationsToHole(holes, 'H2');
  assert.strictEqual(holes[0].correlations.length, 0);
});

console.log('\n多标签页合并');
test('同区间深度不一致 → 冲突，拦下本地，给出两边深度', () => {
  const localA = makeInterval('a', 0, 10, 'anc-a');
  const remoteA = makeInterval('a', 0, 12, 'anc-a');
  const local = [makeHole('H1', [localA])];
  const remote = [makeHole('H1', [remoteA])];
  const { holes, conflicts } = mergeDrafts(local, remote);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].holeId, 'H1');
  assert.strictEqual(conflicts[0].intervalId, 'a');
  assert.deepStrictEqual(conflicts[0].local, { from: 0, to: 10 });
  assert.deepStrictEqual(conflicts[0].remote, { from: 0, to: 12 });
  // 本地被保留
  assert.strictEqual(holes[0].intervals[0].to, 10);
});

test('远程新增区间 → 并入', () => {
  const local = [makeHole('H1', [makeInterval('a', 0, 10, 'anc-a')])];
  const remote = [makeHole('H1', [makeInterval('a', 0, 10, 'anc-a'), makeInterval('b', 10, 20, 'anc-b')])];
  const { holes, conflicts } = mergeDrafts(local, remote);
  assert.strictEqual(conflicts.length, 0);
  assert.strictEqual(holes[0].intervals.length, 2);
});

test('远程新增钻孔 → 并入', () => {
  const local = [makeHole('H1', [makeInterval('a', 0, 10, 'anc-a')])];
  const remote = [
    makeHole('H1', [makeInterval('a', 0, 10, 'anc-a')]),
    makeHole('H2', [makeInterval('b', 0, 10, 'anc-b')]),
  ];
  const { holes, conflicts } = mergeDrafts(local, remote);
  assert.strictEqual(conflicts.length, 0);
  assert.strictEqual(holes.length, 2);
});

test('深度一致时非深度字段以远程为准', () => {
  const localA = makeInterval('a', 0, 10, 'anc-a');
  localA.lithology = '砂岩';
  const remoteA = makeInterval('a', 0, 10, 'anc-a');
  remoteA.lithology = '砾岩';
  const local = [makeHole('H1', [localA])];
  const remote = [makeHole('H1', [remoteA])];
  const { holes, conflicts } = mergeDrafts(local, remote);
  assert.strictEqual(conflicts.length, 0);
  assert.strictEqual(holes[0].intervals[0].lithology, '砾岩');
});

console.log(`\n${passed} 项通过\n`);
if (process.exitCode) process.exit(process.exitCode);
