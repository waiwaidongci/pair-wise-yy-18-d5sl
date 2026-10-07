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

export interface Correlation {
  id: string;
  intervalId: string;
  targetHoleId: string;
  targetIntervalId: string;
  color: string;
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

