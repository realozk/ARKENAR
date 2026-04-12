/**
 * Arkenar fast-updating state store (Zustand).
 *
 * Only state that changes at high frequency lives here — rps, scanProgress,
 * and stats. These update many times per second during active scans and would
 * cause full-app re-renders if kept in React Context or top-level useState.
 *
 * All stable UI state (config, activeTab, modals, scanHistory, etc.) stays in
 * App.tsx as ordinary `useState` — no need to over-engineer.
 *
 * Usage:
 *   import { useScanStore } from '../store';
 *   const rps = useScanStore(s => s.rps);               // selector — only re-renders on rps change
 *   const { setRps, setScanProgress } = useScanStore(); // action access
 */

import { create } from 'zustand';
import type { ScanStatsEvent } from './types';

interface ScanStore {
  // ── State
  rps: number;
  scanProgress: number;
  stats: ScanStatsEvent;

  // ── Actions 
  setRps: (rps: number) => void;
  setScanProgress: (progress: number | ((prev: number) => number)) => void;
  setStats: (stats: ScanStatsEvent) => void;
  resetScanState: () => void;
}

const DEFAULT_STATS: ScanStatsEvent = {
  targets: 0,
  urls: 0,
  critical: 0,
  medium: 0,
  safe: 0,
  elapsed: '—',
};

export const useScanStore = create<ScanStore>((set: (partial: Partial<ScanStore> | ((s: ScanStore) => Partial<ScanStore>)) => void) => ({
  // Initial values
  rps: 0,
  scanProgress: 0,
  stats: DEFAULT_STATS,

  // Actions
  setRps: (rps: number) => set({ rps }),

  setScanProgress: (progress: number | ((prev: number) => number)) =>
    set((state: ScanStore) =>
      typeof progress === 'function'
        ? { scanProgress: progress(state.scanProgress) }
        : { scanProgress: progress }
    ),

  setStats: (stats: ScanStatsEvent) => set({ stats }),

  resetScanState: () =>
    set({ rps: 0, scanProgress: 0, stats: DEFAULT_STATS }),
}));
