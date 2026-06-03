import { site } from "./site";

export type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
};

export type Release = {
  tag_name: string;
  html_url: string;
  published_at: string;
  assets: ReleaseAsset[];
};

/**
 * Direct download links for every supported platform, resolved from the latest
 * GitHub release. Each falls back to the releases page when the matching asset
 * (or the network) is unavailable so a button is never dead.
 */
export type Downloads = {
  version: string;
  releasesUrl: string;
  publishedAt: string | null;
  macArm: string;
  macIntel: string;
  windows: string;
  linuxAppImage: string;
  linuxDeb: string;
};

const REPO = "0xlau/openbroca";

export async function getLatestRelease(): Promise<Release | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
        // Refresh at most once an hour so we stay well under GitHub's
        // unauthenticated rate limit while keeping the version current.
        next: { revalidate: 3600 },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as Release;
  } catch {
    return null;
  }
}

export async function getDownloads(): Promise<Downloads> {
  const release = await getLatestRelease();
  const fallback = site.releases;

  const find = (re: RegExp): string =>
    release?.assets.find((a) => re.test(a.name))?.browser_download_url ??
    fallback;

  return {
    version: release?.tag_name?.replace(/^v/, "") ?? site.version,
    releasesUrl: release?.html_url ?? fallback,
    publishedAt: release?.published_at ?? null,
    macArm: find(/arm64\.dmg$/i),
    macIntel: find(/(x64|x86_64|intel)\.dmg$/i),
    windows: find(/(setup\.exe|\.exe)$/i),
    linuxAppImage: find(/\.AppImage$/i),
    linuxDeb: find(/\.deb$/i),
  };
}
