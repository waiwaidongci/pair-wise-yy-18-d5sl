export interface Interval {
  id: string;
  /** 锚点：标识稳定的地层层位，拆分/合并后对比线随锚点走 */
  anchorId: string;
  from: number;
  to: number;
  lithology: string;
  color: string;
  structure: string;
  alteration: string;
  mineralization: string;
  description: string;
  photoUrl: string;
}

/**
 * 对比线状态：
 * - active 正常连线
 * - pending 合并后两段连的目标不同，待手动重连
 * - invalid 深度边界改动后不再重叠，显式失效
 */
export type CorrelationStatus = 'active' | 'pending' | 'invalid';

export interface Correlation {
  id: string;
  /** 起点区间 id（渲染时优先用，找不到再回退到锚点） */
  intervalId: string;
  /** 起点锚点，对比线跟着地层层位走 */
  anchorId: string;
  targetHoleId: string;
  targetIntervalId: string;
  /** 目标锚点 */
  targetAnchorId: string;
  color: string;
  status: CorrelationStatus;
}

/** 两个标签页合并草稿时，同一区间深度不一致的冲突 */
export interface DraftConflict {
  holeId: string;
  intervalId: string;
  local: { from: number; to: number };
  remote: { from: number; to: number };
}

export interface DrillHole {
  id: string;
  name: string;
  project: string;
  coordinates: string;
  collarElevation: number;
  totalDepth: number;
  intervals: Interval[];
  correlations: Correlation[];
}

export interface LithologyOption {
  name: string;
  color: string;
}

export interface DepthWindow {
  top: number;
  bottom: number;
  zoom: number;
}

