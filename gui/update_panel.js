const fs = require('fs');
let code = fs.readFileSync('src/components/StudioPanel.tsx', 'utf8');

// Export types
code = code.replace(
  'type StudioResponse = {',
  'export type StudioResponse = {'
);
code = code.replace(
  'type StudioHistoryItem = {',
  'export type StudioHistoryItem = {'
);

// Update props
const oldProps = \export default function StudioPanel({
  initialRequest,
  onInitialRequestConsumed,
  onExit,
}: {
  initialRequest?: Partial<StudioRequest> | null;
  onInitialRequestConsumed?: () => void;
  onExit?: () => void;
}) {\;

const newProps = \export default function StudioPanel({
  initialRequest,
  onInitialRequestConsumed,
  history,
  setHistory,
  selectedHistoryId,
  setSelectedHistoryId
}: {
  initialRequest?: Partial<StudioRequest> | null;
  onInitialRequestConsumed?: () => void;
  history: StudioHistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<StudioHistoryItem[]>>;
  selectedHistoryId: string | null;
  setSelectedHistoryId: (id: string | null) => void;
}) {\;
code = code.replace(oldProps, newProps);

// Remove local state
code = code.replace(
  '  const [history, setHistory] = useState<StudioHistoryItem[]>([]);\n  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);',
  ''
);

// Remove aside entirely
const oldAside = \        <aside className="w-[280px] shrink-0 flex flex-col min-h-0 rounded-xl border border-border-subtle bg-bg-panel animate-fade-slide-in">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3 shrink-0">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-accent-text pt-0.5">Exploit Studio</div>
            <button onClick={() => { setSelectedHistoryId(null); setMethod("GET"); setUrl(""); setBody(""); setHeadersInput(""); setParamsInput(""); setResponse(null); setError(null); }} className="p-1 hover:bg-bg-hover rounded-md text-text-primary transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>

          <div className="h-[calc(100%-49px)] overflow-y-auto">
            {history.length === 0 ? (
              <div className="px-4 py-4 text-xs text-text-muted">No requests executed in this session.</div>
            ) : (
              history.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => loadHistoryItem(item)}
                  className={\\\w-full flex flex-col gap-2 border-b border-border-subtle p-3 text-left transition-all duration-200 \\\\\\}
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
                    <span className="text-[11px] font-semibold text-text-muted">#{history.length - idx}</span>
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
        </aside>\;

code = code.replace(oldAside, '');

// Also load active history item when \selectedHistoryId\ changes externally.
// Wait, actually I can just listen to selectedHistoryId changes inside a useEffect instead of relying solely on Sidebar passing a function down, 
// OR I can expose a \loadHistoryItem\ but the easier way is an effect:
const itemEffect = \  useEffect(() => {
    if (selectedHistoryId) {
      const item = history.find(i => i.id === selectedHistoryId);
      if (item) {
        setMethod(item.request.method);
        setUrl(item.request.url);
        setParamsInput(urlToParams(item.request.url));
        setHeadersInput(item.request.headers);
        setBody(item.request.body);
        setResponse(item.response);
        setError(item.error);
        setCompareMode(false);
      }
    }
  }, [selectedHistoryId]);\;

// add effect
code = code.replace('  useEffect(() => {\n    if (!initialRequest) return;', itemEffect + '\n\n  useEffect(() => {\n    if (!initialRequest) return;');

// Wait, the loadHistoryItem method inside StudioPanel is still used internally but now it is missing or what?
// Yes, loadHistoryItem is missing if we removed the aside, but let's just make sure it's removed if it is there:
code = code.replace(/  const loadHistoryItem = [\s\S]*?setCompareMode\(false\);\n  };\n/m, '');

fs.writeFileSync('src/components/StudioPanel.tsx', code);
