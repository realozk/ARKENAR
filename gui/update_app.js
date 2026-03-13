const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Import StudioHistoryItem
code = code.replace(
  'import StudioPanel, { type StudioRequest } from "./components/StudioPanel";',
  'import StudioPanel, { type StudioRequest, type StudioHistoryItem } from "./components/StudioPanel";'
);

// Add states
const stateInjection = \  const [initialStudioRequest, setInitialStudioRequest] = useState<Partial<StudioRequest> | null>(null);
  const [studioHistory, setStudioHistory] = useState<StudioHistoryItem[]>([]);
  const [selectedStudioHistoryId, setSelectedStudioHistoryId] = useState<string | null>(null);
\;
code = code.replace(
  '  const [initialStudioRequest, setInitialStudioRequest] = useState<Partial<StudioRequest> | null>(null);',
  stateInjection
);

// Find <Sidebar >
code = code.replace(
  /<Sidebar[\s\S]*?language=\{appSettings\.language\}[\s]*\/>/m,
  (match) => {
    return match.replace(
      '/>',
      \  isStudioMode={activeTab === "studio"}
              studioHistory={studioHistory}
              selectedStudioHistoryId={selectedStudioHistoryId}
              onSelectStudioHistoryItem={(id) => { setSelectedStudioHistoryId(id); setActiveTab("studio"); }}
              onNewStudioRequest={() => { setSelectedStudioHistoryId(null); setActiveTab("studio"); }}
            />\
    );
  }
);

// Update StudioPanel
code = code.replace(
  /<StudioPanel[\s\S]*?onExit=\{[^}]*\}[^>]*\/>/m,
  \<StudioPanel
                  initialRequest={initialStudioRequest}
                  onInitialRequestConsumed={() => setInitialStudioRequest(null)}
                  history={studioHistory}
                  setHistory={setStudioHistory}
                  selectedHistoryId={selectedStudioHistoryId}
                  setSelectedHistoryId={setSelectedStudioHistoryId}
                />\
);

// Double check StudioPanel invocation since the regex might be specific to old StudioPanel props.
// The old props mapped to: initialRequest, onInitialRequestConsumed, onExit. 
// Just in case:
code = code.replace(
  /<StudioPanel\s+initialRequest=\{initialStudioRequest\}\s+onInitialRequestConsumed=\{[^\}]+\}\s+onExit=\{[^\}]+\}\s+\/>/m,
  \<StudioPanel
                  initialRequest={initialStudioRequest}
                  onInitialRequestConsumed={() => setInitialStudioRequest(null)}
                  history={studioHistory}
                  setHistory={setStudioHistory}
                  selectedHistoryId={selectedStudioHistoryId}
                  setSelectedHistoryId={setSelectedStudioHistoryId}
                />\
);


fs.writeFileSync('src/App.tsx', code);
