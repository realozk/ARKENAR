import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

type FeedType = "subdomain-found" | "port-open" | "dns-record" | "secret-found";

interface UseReconEventsCallbacks {
  onSubdomain: (host: string) => void;
  onPort: (host: string, ports: number[]) => void;
  onDns: (host: string) => void;
  onSecret: (url: string, secretType: string) => void;
  onFeedItem: (type: FeedType, message: string) => void;
}

export function useReconEvents({
  onSubdomain,
  onPort,
  onDns,
  onSecret,
  onFeedItem,
}: UseReconEventsCallbacks): void {
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    const setup = async () => {
      unsubs.push(
        await listen<{ host: string }>("recon-subdomain", (e) => {
          onSubdomain(e.payload.host);
          onFeedItem("subdomain-found", `Subdomain: ${e.payload.host}`);
        })
      );
      unsubs.push(
        await listen<{ host: string; ports: number[] }>("recon-ports", (e) => {
          onPort(e.payload.host, e.payload.ports);
          if (e.payload.ports.length > 0) {
            onFeedItem("port-open", `${e.payload.host}: ports ${e.payload.ports.join(", ")}`);
          }
        })
      );
      unsubs.push(
        await listen<{ host: string }>("recon-dns", (e) => {
          onDns(e.payload.host);
          onFeedItem("dns-record", `DNS resolved: ${e.payload.host}`);
        })
      );
      unsubs.push(
        await listen<{ url: string; secret_type: string }>("recon-js-secret", (e) => {
          onSecret(e.payload.url, e.payload.secret_type);
          onFeedItem("secret-found", `[${e.payload.secret_type}] in ${e.payload.url}`);
        })
      );
    };
    setup();
    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [onSubdomain, onPort, onDns, onSecret, onFeedItem]);
}
