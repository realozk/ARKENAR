/**
 * Fetches the latest Arkenar release from GitHub and returns download URLs
 * for each platform. Uses the GitHub Releases API so the download button
 * always points at the newest release without requiring any code changes.
 *
 * Usage:
 *   const release = await getLatestRelease("real0zk/arkenar");
 *   window.open(release.windows, "_blank");
 */

export interface ReleaseAssets {
  version: string;
  windows: string | undefined;
  linuxAppImage: string | undefined;
  linuxDeb: string | undefined;
  releaseUrl: string;
}

interface GHAsset {
  name: string;
  browser_download_url: string;
}

interface GHRelease {
  tag_name: string;
  html_url: string;
  assets: GHAsset[];
}

/**
 * Returns download URLs for the latest non-prerelease from `owner/repo`.
 * Falls back gracefully: if the API is unreachable the URLs will be `undefined`
 * and the caller should show the Releases page link instead.
 */
export async function getLatestRelease(repo: string): Promise<ReleaseAssets> {
  const fallback: ReleaseAssets = {
    version: "latest",
    windows: undefined,
    linuxAppImage: undefined,
    linuxDeb: undefined,
    releaseUrl: `https://github.com/${repo}/releases/latest`,
  };

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!res.ok) return fallback;

    const release: GHRelease = await res.json();
    const assets = release.assets ?? [];

    return {
      version: release.tag_name,
      windows: assets.find((a) => a.name.endsWith("_x64-setup.exe"))?.browser_download_url,
      linuxAppImage: assets.find((a) => a.name.endsWith(".AppImage"))?.browser_download_url,
      linuxDeb: assets.find((a) => a.name.endsWith(".deb"))?.browser_download_url,
      releaseUrl: release.html_url,
    };
  } catch {
    return fallback;
  }
}
