import { useState, useCallback } from "react";
import { ReconHost } from "../../types";
import { useReconEvents } from "./useReconEvents";
import ReconTopBar from "./ReconTopBar";
import ReconLeftRail from "./ReconLeftRail";
import ReconHostBoard from "./ReconHostBoard";
import ReconHostDetail from "./ReconHostDetail";

interface ReconWorkspaceProps {
  hosts: Map<string, ReconHost>;
  isRunning: boolean;
  isComplete: boolean;
  onRun: (domain: string) => Promise<void>;
  onStop: () => Promise<void>;
  onAddToQueue: (targets: string[]) => void;
  onSendToStudio: (host: string) => void;
}

type FeedType = "subdomain-found" | "port-open" | "dns-record" | "secret-found";

interface FeedItem {
  id: string;
  type: FeedType;
  message: string;
  time: string;
}

function nowStr(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}


export default function ReconWorkspace({
  hosts,
  isRunning,
  isComplete,
  onRun,
  onStop,
  onAddToQueue,
  onSendToStudio,
}: ReconWorkspaceProps) {
  const [domain, setDomain] = useState("");
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [hostFilter, setHostFilter] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "high" | "alive" | "secrets">("all");
  const [activeTab, setActiveTab] = useState<"ports" | "dns" | "secrets">("ports");
  const [queuedHosts, setQueuedHosts] = useState<string[]>([]);
  const [eventFeed, setEventFeed] = useState<FeedItem[]>([]);
  const [enableSubdomains, setEnableSubdomains] = useState(true);
  const [enablePortScan, setEnablePortScan] = useState(true);
  const [enableDns, setEnableDns] = useState(true);
  const [enableJsSecrets, setEnableJsSecrets] = useState(true);

  const handleFeedItem = useCallback((type: FeedType, message: string) => {
    setEventFeed((prev) => {
      const item: FeedItem = { id: crypto.randomUUID(), type, message, time: nowStr() };
      return [item, ...prev].slice(0, 50);
    });
  }, []);

  const noop = useCallback(() => {}, []);

  useReconEvents({
    onSubdomain: noop,
    onPort: noop,
    onDns: noop,
    onSecret: noop,
    onFeedItem: handleFeedItem,
  });

  const hostsArray = Array.from(hosts.values());
  const totalHosts = hosts.size;
  const totalAlive = hostsArray.filter((h) => h.ports.length > 0).length;
  const totalPorts = hostsArray.reduce((s: number, h: ReconHost) => s + h.ports.length, 0);
  const totalSecrets = hostsArray.reduce((s: number, h: ReconHost) => s + h.jsSecrets.length, 0);
  const totalDns = hostsArray.filter((h) => h.dns !== null).length;

  const selectedHost = selectedHostId ? hosts.get(selectedHostId) ?? null : null;

  const handleLaunch = useCallback(() => {
    if (domain.trim()) onRun(domain.trim());
  }, [domain, onRun]);

  const handleExportCsv = useCallback(() => {
    const header = "host,alive,ports,dns_a,secrets_count\n";
    const rows = hostsArray.map((h: ReconHost) => {
      const alive = h.ports.length > 0 ? "yes" : "no";
      const ports = h.ports.join("|");
      const dnsA = h.dns ? h.dns.a.join("|") : "";
      const secrets = h.jsSecrets.length;
      return `"${h.host}","${alive}","${ports}","${dnsA}",${secrets}`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "arkenar-recon.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [hostsArray]);

  const handleToggleQueue = useCallback((host: string) => {
    setQueuedHosts((prev) =>
      prev.includes(host) ? prev.filter((h) => h !== host) : [...prev, host]
    );
  }, []);

  const handleRemoveFromQueue = useCallback((host: string) => {
    setQueuedHosts((prev) => prev.filter((h) => h !== host));
  }, []);

  const handleScanQueue = useCallback(() => {
    if (queuedHosts.length > 0) {
      onAddToQueue([...queuedHosts]);
      setQueuedHosts([]);
    }
  }, [queuedHosts, onAddToQueue]);

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden font-mono"
      style={{
        background: "var(--color-bg-root)",
        color: "var(--color-text-primary)",
      }}
    >
      <ReconTopBar
        domain={domain}
        onDomainChange={setDomain}
        isRunning={isRunning}
        isComplete={isComplete}
        onRun={handleLaunch}
        onStop={onStop}
        totalHosts={totalHosts}
        totalAlive={totalAlive}
        totalPorts={totalPorts}
        totalSecrets={totalSecrets}
        totalDns={totalDns}
        onExportCsv={handleExportCsv}
      />

      <div className="flex flex-1 overflow-hidden min-h-0">
        <ReconLeftRail
          enableSubdomains={enableSubdomains}
          enablePortScan={enablePortScan}
          enableDns={enableDns}
          enableJsSecrets={enableJsSecrets}
          onToggleSubdomains={setEnableSubdomains}
          onTogglePortScan={setEnablePortScan}
          onToggleDns={setEnableDns}
          onToggleJsSecrets={setEnableJsSecrets}
          isRunning={isRunning}
          queuedHosts={queuedHosts}
          onRemoveFromQueue={handleRemoveFromQueue}
          onScanQueue={handleScanQueue}
        />

        <ReconHostBoard
          hosts={hosts}
          hostFilter={hostFilter}
          onFilterChange={setHostFilter}
          filterMode={filterMode}
          onFilterModeChange={setFilterMode}
          selectedHostId={selectedHostId}
          onSelectHost={setSelectedHostId}
          queuedHosts={queuedHosts}
          onToggleQueue={handleToggleQueue}
          totalHosts={totalHosts}
          totalAlive={totalAlive}
          totalPorts={totalPorts}
          totalSecrets={totalSecrets}
          totalDns={totalDns}
          eventFeed={eventFeed}
        />

        <div
          className="flex flex-col overflow-hidden shrink-0 border-l border-[color:var(--color-border-subtle)]"
          style={{ width: 320, minWidth: 320 }}
        >
          <ReconHostDetail
            host={selectedHost}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onAddToQueue={onAddToQueue}
            onSendToStudio={onSendToStudio}
            onClose={() => setSelectedHostId(null)}
            totalPorts={totalPorts}
            totalDns={totalDns}
            totalSecrets={totalSecrets}
          />
        </div>
      </div>
    </div>
  );
}
