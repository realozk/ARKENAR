import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { LogEntry, LogLevel, ScanFindingEvent, ScanStatsEvent, ScanLogEvent } from "../../types";

const LOG_CAP = 2_000;

export interface ScannerEventsResult {
  logs: LogEntry[];
  findings: ScanFindingEvent[];
  progress: number;
  stats: ScanStatsEvent | null;
  isComplete: boolean;
  resetSession: () => void;
}

export function useScannerEvents(): ScannerEventsResult {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [findings, setFindings] = useState<ScanFindingEvent[]>([]);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<ScanStatsEvent | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const logBuffer = useRef<LogEntry[]>([]);
  const findingBuffer = useRef<ScanFindingEvent[]>([]);
  const unlistenRef = useRef<(() => void)[]>([]);

  const resetSession = useCallback(() => {
    setLogs([]);
    setFindings([]);
    setProgress(0);
    setStats(null);
    setIsComplete(false);
    logBuffer.current = [];
    findingBuffer.current = [];
  }, []);

  useEffect(() => {
    unlistenRef.current.forEach((fn) => fn());
    unlistenRef.current = [];

    const setup = Promise.all([
      listen<ScanLogEvent>("scan-log", (event) => {
        const { level, message } = event.payload;
        const validLevel = (["info", "success", "error", "warn", "phase"].includes(level)
          ? level
          : "info") as LogLevel;
        const time = new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        logBuffer.current.push({ id: crypto.randomUUID(), time, level: validLevel, message });

        if (level === "phase") {
          if (message.includes("Scan started")) setProgress(5);
          else if (message.includes("Phase 1")) setProgress(20);
          else if (message.includes("Phase 2")) setProgress(50);
          else if (message.includes("Phase 3")) setProgress(75);
          else if (message.includes("Scan Complete")) setProgress(100);
        }
      }),
      listen<ScanStatsEvent>("scan-complete", (event) => {
        setStats(event.payload);
        setIsComplete(true);
        setProgress(100);
      }),
      listen<ScanFindingEvent[]>("scan-findings-batch", (event) => {
        for (const f of event.payload) {
          findingBuffer.current.push(f);
        }
        setProgress((p) => Math.min(p + event.payload.length, 90));
      }),
    ]);

    let cancelled = false;
    setup.then((fns) => {
      if (cancelled) {
        fns.forEach((fn) => fn());
      } else {
        unlistenRef.current = fns;
      }
    });

    return () => {
      cancelled = true;
      const fns = unlistenRef.current;
      unlistenRef.current = [];
      fns.forEach((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const FLUSH_MS = 150;
    const interval = setInterval(() => {
      if (logBuffer.current.length > 0) {
        const batch = [...logBuffer.current];
        logBuffer.current = [];
        setLogs((prev) => {
          let last = prev.length > 0 ? prev[prev.length - 1] : null;
          const deduped: LogEntry[] = [];
          for (const entry of batch) {
            if (!last || last.message !== entry.message || last.level !== entry.level) {
              deduped.push(entry);
              last = entry;
            }
          }
          if (deduped.length === 0) return prev;
          const next = [...prev, ...deduped];
          return next.length > LOG_CAP ? next.slice(next.length - LOG_CAP) : next;
        });
      }
      if (findingBuffer.current.length > 0) {
        const batch = [...findingBuffer.current];
        findingBuffer.current = [];
        setFindings((prev) => [...prev, ...batch]);
      }
    }, FLUSH_MS);
    return () => clearInterval(interval);
  }, []);

  return { logs, findings, progress, stats, isComplete, resetSession };
}
