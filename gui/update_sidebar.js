const fs = require('fs');
let code = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

// 1. Imports
code = code.replace(
  'import { t } from "../utils/i18n";',
  \import { t } from "../utils/i18n";
import type { StudioHistoryItem } from "./StudioPanel";
import { getStatusClass, buildHistoryLabel } from "./StudioPanel";\
);

// 2. Props
// Find interface SidebarProps
const oldProps = \interface SidebarProps {
  config: ScanConfig;
  onUpdate: <K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => void;
  onReset: () => void;
  scanQueue?: string[];
  onAddToQueue?: (targets: string[]) => void;
  onRemoveFromQueue?: (index: number) => void;
  language: "en" | "ar";
}\;

const newProps = \interface SidebarProps {
  config: ScanConfig;
  onUpdate: <K extends keyof ScanConfig>(key: K, value: ScanConfig[K]) => void;
  onReset: () => void;
  scanQueue?: string[];
  onAddToQueue?: (targets: string[]) => void;
  onRemoveFromQueue?: (index: number) => void;
  language: "en" | "ar";
  isStudioMode: boolean;
  studioHistory: StudioHistoryItem[];
  selectedStudioHistoryId: string | null;
  onSelectStudioHistoryItem: (id: string | null) => void;
  onNewStudioRequest: () => void;
}\;
code = code.replace(oldProps, newProps);

// 3. Component signature
const oldSig = \export function Sidebar({ config, onUpdate, onReset, scanQueue = [], onAddToQueue, onRemoveFromQueue, language }: SidebarProps) {\;
const newSig = \export function Sidebar({ config, onUpdate, onReset, scanQueue = [], onAddToQueue, onRemoveFromQueue, language, isStudioMode, studioHistory, selectedStudioHistoryId, onSelectStudioHistoryItem, onNewStudioRequest }: SidebarProps) {\;
code = code.replace(oldSig, newSig);

// 4. Return render based on isStudioMode
// Find return (
const renderStart = \  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-border-subtle bg-bg-panel overflow-y-auto">
      <div className="px-5 pt-6 pb-5 space-y-6 flex-1">\;

const studioBranch = \  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-border-subtle bg-bg-panel overflow-y-auto">
      {isStudioMode ? (
        <div className="flex h-full flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4 shrink-0">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-accent-text pt-0.5">Exploit Studio</div>
            <button onClick={onNewStudioRequest} className="p-1 hover:bg-bg-hover rounded-md text-text-primary transition-colors hover:shadow-[0_0_10px_rgba(var(--color-accent),0.2)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinelinejoin="round" className="text-accent-text"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>

          <div className="px-5 py-3 border-b border-border-subtle shrink-0">
            <SectionLabel icon={Bookmark} className="!mb-0">Saved Collections</SectionLabel>
            <div className="text-xs text-text-muted mt-2 italic">Coming soon...</div>
          </div>

          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-5 py-3 shrink-0 border-b border-border-subtle">
              <SectionLabel icon={RotateCcw} className="!mb-0">Request History</SectionLabel>
            </div>
            <div className="flex-1 overflow-y-auto">
              {studioHistory.length === 0 ? (
                <div className="px-5 py-4 text-xs text-text-muted">No requests executed yet.</div>
              ) : (
                studioHistory.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => onSelectStudioHistoryItem(item.id)}
                    className={\\\w-full flex flex-col gap-2 border-b border-border-subtle p-4 text-left transition-all duration-200 \\\\\\}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={\\\px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider \\\\\\}>
                        {item.request.method}
                      </span>
                      <span className="text-[11px] font-mono text-text-muted">
                        {new Date(item.createdAt).toLocaleTimeString([], { hour12: false })}
                      </span>
                    </div>
                    <div className="w-full truncate text-[13px] font-medium text-text-primary" title={buildHistoryLabel(item.request)}>
                      {buildHistoryLabel(item.request)}
                    </div>
                    <div className="flex items-center justify-between w-full mt-1">
                      <span className="text-[11px] font-semibold text-text-muted">#{studioHistory.length - idx}</span>
                      <span className={\\\	ext-[11px] font-black flex items-center gap-1.5 \\\\\\}>
                        {item.error ? "ERROR" : item.response ? (
                          <>
                            <span className={\\\w-1.5 h-1.5 rounded-full \\\ animate-pulse\\\}></span>
                            {item.response.status}
                          </>
                        ) : ""}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-5 pt-6 pb-5 space-y-6 flex-1">\;

code = code.replace(renderStart, studioBranch);

// Bottom of sidebar needs closing for the conditional branch
code = code.replace(
  '    </aside>\n  );\n}',
  '        </div>\n      )}\n    </aside>\n  );\n}'
);


fs.writeFileSync('src/components/Sidebar.tsx', code);
