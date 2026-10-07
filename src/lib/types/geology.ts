export interface Interval {
  id: string;
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

export type CorrelationStatus = 'active' | 'pending' | 'invalid';

export interface Correlation {
  id: string;
  /** 同一条逻辑连线在两端记录中共享的标识，用于成对维护 */
  pairId: string;
  intervalId: string;
  /** 锚点深度：连线跟随的地层层位，取挂接区间的中点 */
  anchorDepth: number;
  targetHoleId: string;
  targetIntervalId: string;
  targetAnchorDepth: number;
  color: string;
  status: CorrelationStatus;
  /** 待重连 / 失效原因，供界面提示（含两边深度等信息） */
  reason: string;
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
