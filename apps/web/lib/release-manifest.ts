export type ReleaseChangeCategory = 'feat' | 'fix' | 'perf' | 'style';
export type ReleaseBump = 'major' | 'minor' | 'patch';

export interface ReleaseChange {
  category: ReleaseChangeCategory;
  breaking: boolean;
  scope?: string;
  summary: string;
  changeId: string;
}

export interface ReleaseRecord {
  version: string;
  bump?: ReleaseBump;
  releasedAt: string;
  changeCount: number;
  themes?: string[];
  sourceFingerprint?: string;
  changes: ReleaseChange[];
}

export interface ReleaseManifest {
  currentVersion: string;
  buildId: string;
  headSha: string;
  generatedAt: string;
  releaseWindowMinutes: number;
  releases: ReleaseRecord[];
}

export function readReleaseManifest(): ReleaseManifest {
  const fallback: ReleaseManifest = {
    currentVersion: process.env.NEXT_PUBLIC_YCT_RELEASE_VERSION ?? '2.0.0',
    buildId: process.env.NEXT_PUBLIC_YCT_BUILD_ID ?? 'dev',
    headSha: 'unknown',
    generatedAt: new Date(0).toISOString(),
    releaseWindowMinutes: 60,
    releases: [],
  };

  const raw = process.env.YCT_RELEASE_MANIFEST;
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ReleaseManifest>;
    if (
      typeof parsed.currentVersion !== 'string' ||
      typeof parsed.buildId !== 'string' ||
      !Array.isArray(parsed.releases)
    ) {
      return fallback;
    }
    return {
      ...fallback,
      ...parsed,
      releases: parsed.releases.filter(isReleaseRecord),
    };
  } catch {
    return fallback;
  }
}

function isReleaseRecord(value: unknown): value is ReleaseRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<ReleaseRecord>;
  return (
    typeof record.version === 'string' &&
    typeof record.releasedAt === 'string' &&
    typeof record.changeCount === 'number' &&
    Array.isArray(record.changes)
  );
}
