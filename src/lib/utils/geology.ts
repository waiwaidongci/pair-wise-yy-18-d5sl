import type { DrillHole, Interval, LithologyOption } from '../types/geology';

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

