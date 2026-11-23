'use client';

import type { ChangeEvent, ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MaterialTransitNetworkProject,
  MaterialTransitNetworkSnapshot,
  MaterialTransitStationProfile,
} from '@yct/contracts';
import { appPath } from '../lib/app-paths';
import { publishLoginRequiredForResponse } from '../lib/client-auth-events';
import {
  publishTransitNetworkImportFailed,
  publishTransitNetworkImportSucceeded,
  publishTransitNetworkProfilesChanged,
  publishTransitNetworkProjectSnapshotChanged,
  publishTransitNetworkSourceChanged,
  subscribeTransitNetworkLineNameEditorRequested,
  type TransitNetworkProjectOrigin,
  type TransitNetworkSourceKind,
} from '../lib/client-transit-network-events';
import {
  listMaterialTransitNetworkPalette,
  listMaterialTransitNetworkLines,
  listMaterialTransitNetworkNearbyStationNames,
  parseRmpTransitNetworkProject,
  RMP_TRANSIT_NETWORK_MAX_FILE_SIZE,
  resolveMaterialTransitNetworkLineNames,
} from '../lib/rmp-transit-network';
import { deriveMetroWayfindingLineIdentity } from '../lib/metro-wayfinding-line-source';
import { buildShenyangSamplePanelProfiles } from '../lib/shenyang-sample-station-exits';
import { useI18n } from '../lib/client-i18n';
import { EditorDialogPortal } from './editor/editor-dialog-portal';
import { SegmentedControl } from './segmented-control';
import { TransitNetworkProfilePanel } from './transit-network-profile-panel';
import { Modal } from './ui/modal';
import { Button, IconButton } from './ui/button';

type Translate = ReturnType<typeof useI18n>['t'];

/**
 * 名称编辑弹窗必须投送到 body：数据来源弹窗（advanced 材质）带 backdrop-filter，
 * 会成为 fixed 后代的包含块，嵌套 modal 会被困在面板里。
 */
function PortaledModal(props: ComponentProps<typeof Modal>) {
  return (
    <EditorDialogPortal>
      <Modal {...props} backdropClassName="transit-network-editor-backdrop" />
    </EditorDialogPortal>
  );
}

interface TransitNetworkLineNameDraft {
  name: string;
  secondaryName: string;
}

interface TransitNetworkStationNameDraft {
  name: string;
  secondaryName: string;
}

interface TransitNetworkSampleResponse {
  fileName: string;
  name: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  snapshot: MaterialTransitNetworkSnapshot;
}

async function fetchDefaultTransitNetworkSample(
  t: Translate,
): Promise<TransitNetworkSampleResponse> {
  const response = await fetch(appPath('/api/materials/transit-network-projects/sample'), {
    cache: 'no-store',
  });
  const data =
    (await readJsonResponse<
      Partial<TransitNetworkSampleResponse> & {
        message?: string;
      }
    >(response)) ?? {};
  if (
    !response.ok ||
    !data.fileName ||
    !data.name ||
    !data.sourceUrl ||
    !data.licenseName ||
    !data.licenseUrl ||
    !data.snapshot
  ) {
    throw new Error(data.message ?? t('transitNetworkSource.error.sampleLoadFailed'));
  }
  return data as TransitNetworkSampleResponse;
}

/**
 * 示例线网被另存/导入成项目时，节点 ID 仍是样本 ID；用这层合并让项目也能看到示例出口。
 * 只补项目里没有资料的节点，已有项目资料优先。
 */
function mergeShenyangSampleProfiles(
  snapshot: MaterialTransitNetworkSnapshot,
  profiles: MaterialTransitStationProfile[],
): MaterialTransitStationProfile[] {
  const sampleById = new Map(
    buildShenyangSamplePanelProfiles().map((profile) => [profile.nodeId, profile] as const),
  );
  const stationIds = snapshot.nodes
    .filter((node) => node.kind === 'station')
    .map((node) => node.id);
  if (!stationIds.some((id) => sampleById.has(id))) return profiles;
  const byId = new Map(profiles.map((profile) => [profile.nodeId, profile] as const));
  return stationIds.flatMap((id) => {
    const profile = byId.get(id) ?? sampleById.get(id);
    return profile ? [profile] : [];
  });
}

/**
 * 安全读取 JSON：401/重定向可能返回 HTML，直接 `json()` 会抛
 * `Unexpected token '<'`。非 JSON 响应统一当作空对象处理。
 */
async function readJsonResponse<T>(response: Response): Promise<T | undefined> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return undefined;
  }
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

export function TransitNetworkSourceControl({
  studioId,
  initialSource,
  initialSnapshot,
  initialStationProfiles,
}: Readonly<{
  studioId: string;
  initialSource?: TransitNetworkSourceKind;
  initialSnapshot?: MaterialTransitNetworkSnapshot;
  initialStationProfiles?: MaterialTransitStationProfile[];
}>) {
  const { locale, t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const projectLoadRevisionRef = useRef(0);
  const sourceRef = useRef<TransitNetworkSourceKind>(initialSource ?? 'rmp');
  const hasUserSelectedSourceRef = useRef(false);
  const [source, setSource] = useState<TransitNetworkSourceKind>(sourceRef.current);
  const [snapshot, setSnapshot] = useState<MaterialTransitNetworkSnapshot>();
  const [projectId, setProjectId] = useState('');
  const [stationProfiles, setStationProfiles] = useState<MaterialTransitStationProfile[]>([]);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [projectOrigin, setProjectOrigin] = useState<TransitNetworkProjectOrigin>('none');
  useEffect(() => {
    if (projectId || !initialStationProfiles?.length) return;
    setStationProfiles(initialStationProfiles);
    publishTransitNetworkProfilesChanged({
      studioId,
      stationProfiles: initialStationProfiles,
    });
  }, [initialStationProfiles, projectId, studioId]);
  // 事件回调里要读最新的 origin（避免闭包拿到旧值）。
  const projectOriginRef = useRef<TransitNetworkProjectOrigin>('none');
  useEffect(() => {
    projectOriginRef.current = projectOrigin;
  }, [projectOrigin]);
  const [fileName, setFileName] = useState('');
  const [sampleName, setSampleName] = useState('');
  const [sampleSourceUrl, setSampleSourceUrl] = useState('');
  const [sampleLicenseName, setSampleLicenseName] = useState('');
  const [sampleLicenseUrl, setSampleLicenseUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPersisting, setIsPersisting] = useState(false);
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [isLineNameEditorOpen, setIsLineNameEditorOpen] = useState(false);
  const [isStationNameEditorOpen, setIsStationNameEditorOpen] = useState(false);
  const [lineNameDraft, setLineNameDraft] = useState<Record<string, TransitNetworkLineNameDraft>>(
    {},
  );
  const [stationNameDraft, setStationNameDraft] = useState<
    Record<string, TransitNetworkStationNameDraft>
  >({});
  const setActiveSource = useCallback((nextSource: TransitNetworkSourceKind): void => {
    sourceRef.current = nextSource;
    setSource(nextSource);
  }, []);
  const palette = snapshot ? listMaterialTransitNetworkPalette(snapshot) : [];
  const projectLines = useMemo(
    () => (snapshot ? listMaterialTransitNetworkLines(snapshot) : []),
    [snapshot],
  );
  const stationCount = snapshot?.nodes.filter((node) => node.kind === 'station').length ?? 0;
  const unnamedStations = useMemo(
    () =>
      snapshot?.nodes.filter((node) => node.kind === 'station' && node.names.length === 0) ?? [],
    [snapshot],
  );

  const selectSource = (nextSource: TransitNetworkSourceKind, nextSnapshot = snapshot): void => {
    if (nextSource === 'rmp' && !nextSnapshot) return;
    hasUserSelectedSourceRef.current = true;
    setActiveSource(nextSource);
    publishTransitNetworkSourceChanged({
      studioId,
      source: nextSource,
      reason: 'selection',
      snapshot: nextSource === 'rmp' ? nextSnapshot : undefined,
      projectOrigin: projectOriginRef.current,
    });
  };

  const importProject = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      if (file.size > RMP_TRANSIT_NETWORK_MAX_FILE_SIZE) {
        throw new Error(t('transitNetworkSource.error.fileTooLarge'));
      }
      const nextSnapshot = parseRmpTransitNetworkProject(await file.text());
      projectLoadRevisionRef.current += 1;
      setSnapshot(nextSnapshot);
      setFileName(file.name);
      setProjectOrigin('imported');
      setSampleName('');
      setSampleSourceUrl('');
      setSampleLicenseName('');
      setSampleLicenseUrl('');
      setErrorMessage('');
      setIsProjectLoading(false);
      setIsLineNameEditorOpen(false);
      setIsStationNameEditorOpen(false);
      hasUserSelectedSourceRef.current = true;
      setActiveSource('rmp');
      publishTransitNetworkImportSucceeded({
        studioId,
        fileName: file.name,
        snapshot: nextSnapshot,
      });
      publishTransitNetworkSourceChanged({
        studioId,
        source: 'rmp',
        reason: 'project-import',
        snapshot: nextSnapshot,
        projectOrigin: 'imported',
      });

      setIsPersisting(true);
      try {
        const response = await fetch(appPath('/api/materials/transit-network-projects'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, snapshot: nextSnapshot }),
        });
        const data = ((await readJsonResponse<MaterialTransitNetworkProject & { message?: string }>(
          response,
        )) ?? {}) as Partial<MaterialTransitNetworkProject> & { message?: string };
        if (response.status === 401) {
          setProjectId('');
          setErrorMessage(t('transitNetworkSource.error.notSignedIn'));
          return;
        }
        if (publishLoginRequiredForResponse(response)) {
          setProjectId('');
          return;
        }
        if (!response.ok)
          throw new Error(data.message ?? t('transitNetworkSource.error.persistFailed'));
        setProjectId(data.id!);
        setSnapshot(data.snapshot!);
        const profiles = mergeShenyangSampleProfiles(
          data.snapshot!,
          data.supplement?.stations ?? [],
        );
        setStationProfiles(profiles);
        publishTransitNetworkProfilesChanged({ studioId, stationProfiles: profiles });
      } catch (error) {
        setProjectId('');
        setErrorMessage(
          t('transitNetworkSource.error.persistFailedLocalOnly', {
            message:
              error instanceof Error
                ? error.message
                : t('transitNetworkSource.error.persistFailed'),
          }),
        );
      } finally {
        setIsPersisting(false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('transitNetworkSource.error.readFailed');
      setErrorMessage(message);
      publishTransitNetworkImportFailed({ studioId, fileName: file.name, message });
    }
  };

  const removeProject = async (): Promise<void> => {
    const loadRevision = ++projectLoadRevisionRef.current;
    if (projectId) {
      setIsPersisting(true);
      try {
        const response = await fetch(
          appPath(`/api/materials/transit-network-projects/${projectId}`),
          { method: 'DELETE' },
        );
        if (publishLoginRequiredForResponse(response)) {
          setIsPersisting(false);
          return;
        }
        if (!response.ok) {
          const data = (await readJsonResponse<{ message?: string }>(response)) ?? {};
          throw new Error(data.message ?? t('transitNetworkSource.error.deleteFailed'));
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : t('transitNetworkSource.error.deleteFailed'),
        );
        setIsPersisting(false);
        return;
      }
    }
    if (projectLoadRevisionRef.current !== loadRevision) return;
    setSnapshot(undefined);
    setProjectId('');
    setProjectOrigin('none');
    setStationProfiles([]);
    setFileName('');
    setSampleName('');
    setSampleSourceUrl('');
    setSampleLicenseName('');
    setSampleLicenseUrl('');
    setErrorMessage('');
    setIsLineNameEditorOpen(false);
    setIsStationNameEditorOpen(false);
    hasUserSelectedSourceRef.current = true;
    setActiveSource('rmp');
    publishTransitNetworkSourceChanged({
      studioId,
      source: 'rmp',
      reason: 'project-removal',
      clearSnapshot: true,
      projectOrigin: 'none',
    });
    publishTransitNetworkProfilesChanged({ studioId, stationProfiles: [] });
    setIsPersisting(false);
    setIsProjectLoading(true);
    try {
      const sample = await fetchDefaultTransitNetworkSample(t);
      if (projectLoadRevisionRef.current !== loadRevision) return;
      setSnapshot(sample.snapshot);
      setProjectOrigin('sample');
      setFileName(sample.fileName);
      setSampleName(sample.name);
      setSampleSourceUrl(sample.sourceUrl);
      setSampleLicenseName(sample.licenseName);
      setSampleLicenseUrl(sample.licenseUrl);
      setActiveSource('rmp');
      publishTransitNetworkSourceChanged({
        studioId,
        source: 'rmp',
        reason: 'project-removal',
        snapshot: sample.snapshot,
        projectOrigin: 'sample',
      });
      const profiles = buildShenyangSamplePanelProfiles();
      setStationProfiles(profiles);
      publishTransitNetworkProfilesChanged({ studioId, stationProfiles: profiles });
    } catch (error) {
      if (projectLoadRevisionRef.current !== loadRevision) return;
      setErrorMessage(
        t('transitNetworkSource.error.sampleLoadFailedHint', {
          message:
            error instanceof Error
              ? error.message
              : t('transitNetworkSource.error.sampleLoadFailed'),
        }),
      );
    } finally {
      if (projectLoadRevisionRef.current === loadRevision) setIsProjectLoading(false);
    }
  };

  const openLineNameEditor = useCallback((): void => {
    setLineNameDraft(
      Object.fromEntries(
        projectLines.map((line) => {
          const names = snapshot
            ? resolveMaterialTransitNetworkLineNames(snapshot, line.lineKey)
            : undefined;
          if (names?.name) {
            return [
              line.id,
              { name: names.name, secondaryName: names.secondaryName ?? '' },
            ] as const;
          }
          // 未配置名称时预填**从线路键推导**的默认名（`sh2` → `2号线`）：
          // RMP 存档不含线路名，但线路键的字母前缀是城市代号、数字部分就是编号。
          // 预填只是给出起点，用户仍需确认或改成正式名称。
          const derived = deriveMetroWayfindingLineIdentity(line.lineKey);
          return [
            line.id,
            {
              name: derived.suggestedName,
              secondaryName: derived.lineNumber ? `Line ${derived.lineNumber}` : '',
            },
          ] as const;
        }),
      ),
    );
    setIsLineNameEditorOpen(true);
  }, [projectLines, snapshot]);

  const saveLineNames = async (): Promise<void> => {
    if (!snapshot) return;
    const lineNames = projectLines.flatMap((line) => {
      const name = lineNameDraft[line.id]?.name.trim();
      const secondaryName = lineNameDraft[line.id]?.secondaryName.trim();
      return name
        ? [{ lineKey: line.lineKey, name, secondaryName: secondaryName || undefined }]
        : [];
    });
    const nextSnapshot: MaterialTransitNetworkSnapshot = {
      ...snapshot,
      lineNames: lineNames.length ? lineNames : undefined,
    };
    setIsPersisting(true);
    try {
      let savedSnapshot = nextSnapshot;
      if (projectId) {
        const response = await fetch(
          appPath(`/api/materials/transit-network-projects/${projectId}`),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lineNames }),
          },
        );
        const data = ((await readJsonResponse<MaterialTransitNetworkProject & { message?: string }>(
          response,
        )) ?? {}) as Partial<MaterialTransitNetworkProject> & { message?: string };
        if (publishLoginRequiredForResponse(response)) {
          return;
        }
        if (!response.ok)
          throw new Error(data.message ?? t('transitNetworkSource.error.saveLineNamesFailed'));
        savedSnapshot = data.snapshot!;
      }
      setSnapshot(savedSnapshot);
      setErrorMessage(
        projectId
          ? ''
          : projectOrigin === 'sample'
            ? t('transitNetworkSource.notice.lineNamesSampleLocalOnly')
            : t('transitNetworkSource.notice.lineNamesPendingPersist'),
      );
      setIsLineNameEditorOpen(false);
      publishTransitNetworkProjectSnapshotChanged({ studioId, snapshot: savedSnapshot });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('transitNetworkSource.error.saveLineNamesFailed'),
      );
    } finally {
      setIsPersisting(false);
    }
  };

  const openStationNameEditor = (): void => {
    if (!unnamedStations.length) return;
    setStationNameDraft(
      Object.fromEntries(
        unnamedStations.map((station) => [
          station.id,
          { name: station.names[0] ?? '', secondaryName: station.names[1] ?? '' },
        ]),
      ),
    );
    setIsStationNameEditorOpen(true);
  };

  const saveStationNames = async (): Promise<void> => {
    if (!snapshot) return;
    const stationNames = unnamedStations.flatMap((station) => {
      const name = stationNameDraft[station.id]?.name.trim();
      const secondaryName = stationNameDraft[station.id]?.secondaryName.trim();
      return name
        ? [{ nodeId: station.id, names: [name, ...(secondaryName ? [secondaryName] : [])] }]
        : [];
    });
    if (!stationNames.length) {
      setIsStationNameEditorOpen(false);
      return;
    }
    const stationNamesByNodeId = new Map(
      stationNames.map((station) => [station.nodeId, station.names] as const),
    );
    const nextSnapshot: MaterialTransitNetworkSnapshot = {
      ...snapshot,
      nodes: snapshot.nodes.map((node) => {
        const names = stationNamesByNodeId.get(node.id);
        return names ? { ...node, names } : node;
      }),
    };
    setIsPersisting(true);
    try {
      let savedSnapshot = nextSnapshot;
      if (projectId) {
        const response = await fetch(
          appPath(`/api/materials/transit-network-projects/${projectId}`),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stationNames }),
          },
        );
        const data = ((await readJsonResponse<MaterialTransitNetworkProject & { message?: string }>(
          response,
        )) ?? {}) as Partial<MaterialTransitNetworkProject> & { message?: string };
        if (publishLoginRequiredForResponse(response)) return;
        if (!response.ok)
          throw new Error(data.message ?? t('transitNetworkSource.error.saveStationNamesFailed'));
        savedSnapshot = data.snapshot!;
      }
      setSnapshot(savedSnapshot);
      setErrorMessage(
        projectId
          ? ''
          : projectOrigin === 'sample'
            ? t('transitNetworkSource.notice.stationNamesSampleLocalOnly')
            : t('transitNetworkSource.notice.stationNamesPendingPersist'),
      );
      setIsStationNameEditorOpen(false);
      publishTransitNetworkProjectSnapshotChanged({ studioId, snapshot: savedSnapshot });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('transitNetworkSource.error.saveStationNamesFailed'),
      );
    } finally {
      setIsPersisting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadRevision = ++projectLoadRevisionRef.current;
    if (!hasUserSelectedSourceRef.current) {
      setActiveSource(initialSource ?? 'rmp');
    }
    const loadInitialProject = async (): Promise<void> => {
      if (initialSource === 'rmp' && initialSnapshot) {
        setSnapshot(initialSnapshot);
        setProjectOrigin('imported');
        setProjectId('');
        setFileName(t('transitNetworkSource.localDraftName'));
        setIsProjectLoading(false);
        const draftProfiles = initialStationProfiles ?? [];
        if (draftProfiles.length) {
          setStationProfiles(draftProfiles);
          publishTransitNetworkProfilesChanged({ studioId, stationProfiles: draftProfiles });
        }
        if (sourceRef.current === 'rmp') {
          publishTransitNetworkSourceChanged({
            studioId,
            source: 'rmp',
            reason: 'initialization',
            snapshot: initialSnapshot,
            projectOrigin: 'imported',
          });
        }
        // 本地草稿只存了几何快照；车站资料仍从服务器项目补一次，否则刷新后出口会“消失”。
        void fetch(appPath('/api/materials/transit-network-projects'), { cache: 'no-store' })
          .then(async (response) => {
            if (!response.ok) return undefined;
            const data =
              (await readJsonResponse<{ items?: MaterialTransitNetworkProject[] }>(response)) ?? {};
            return data.items?.[0];
          })
          .then((project) => {
            if (cancelled || projectLoadRevisionRef.current !== loadRevision) return;
            if (!project) {
              const profiles = mergeShenyangSampleProfiles(
                initialSnapshot,
                initialStationProfiles ?? [],
              );
              setStationProfiles(profiles);
              publishTransitNetworkProfilesChanged({ studioId, stationProfiles: profiles });
              return;
            }
            setProjectId(project.id);
            const profiles = mergeShenyangSampleProfiles(
              project.snapshot,
              project.supplement?.stations ?? [],
            );
            setStationProfiles(profiles);
            publishTransitNetworkProfilesChanged({ studioId, stationProfiles: profiles });
          })
          .catch(() => undefined);
        return;
      }
      let project: MaterialTransitNetworkProject | undefined;
      let projectReadRequiresLogin = false;
      try {
        const response = await fetch(appPath('/api/materials/transit-network-projects'), {
          cache: 'no-store',
        });
        if (response.ok) {
          const data = (await readJsonResponse<{ items?: MaterialTransitNetworkProject[] }>(
            response,
          )) ?? { items: [] };
          project = data.items?.[0];
        } else if (response.status === 401) {
          projectReadRequiresLogin = true;
        }
      } catch {
        project = undefined;
      }
      if (cancelled || projectLoadRevisionRef.current !== loadRevision) return;
      if (projectReadRequiresLogin) {
        // 未登录时项目线网接口返回 401：给出稳定提示，不读取响应体更不会触发 JSON 解析异常。
        setErrorMessage(t('transitNetworkSource.notice.loginToReadProjects'));
      }
      if (project) {
        setProjectId(project.id);
        setProjectOrigin('imported');
        setSnapshot(project.snapshot);
        setFileName(project.fileName);
        const profiles = mergeShenyangSampleProfiles(
          project.snapshot,
          project.supplement?.stations ?? [],
        );
        setStationProfiles(profiles);
        setIsProjectLoading(false);
        if (sourceRef.current === 'rmp') {
          publishTransitNetworkSourceChanged({
            studioId,
            source: 'rmp',
            reason: 'initialization',
            snapshot: project.snapshot,
            projectOrigin: 'imported',
          });
          publishTransitNetworkProfilesChanged({ studioId, stationProfiles: profiles });
        }
        return;
      }
      try {
        const sample = await fetchDefaultTransitNetworkSample(t);
        if (cancelled || projectLoadRevisionRef.current !== loadRevision) return;
        setProjectOrigin('sample');
        setSnapshot(sample.snapshot);
        setFileName(sample.fileName);
        setSampleName(sample.name);
        setSampleSourceUrl(sample.sourceUrl);
        setSampleLicenseName(sample.licenseName);
        setSampleLicenseUrl(sample.licenseUrl);
        if (sourceRef.current === 'rmp') {
          publishTransitNetworkSourceChanged({
            studioId,
            source: 'rmp',
            reason: 'initialization',
            snapshot: sample.snapshot,
            projectOrigin: 'sample',
          });
          const profiles = buildShenyangSamplePanelProfiles();
          setStationProfiles(profiles);
          publishTransitNetworkProfilesChanged({ studioId, stationProfiles: profiles });
        }
      } catch (error) {
        if (cancelled || projectLoadRevisionRef.current !== loadRevision) return;
        setErrorMessage(
          t('transitNetworkSource.error.sampleLoadFailedHint', {
            message:
              error instanceof Error
                ? error.message
                : t('transitNetworkSource.error.sampleLoadFailed'),
          }),
        );
      } finally {
        if (!cancelled && projectLoadRevisionRef.current === loadRevision) {
          setIsProjectLoading(false);
        }
      }
    };
    void loadInitialProject();
    return () => {
      cancelled = true;
    };
  }, [initialSnapshot, initialSource, setActiveSource, studioId]);

  useEffect(() => {
    if (!isLineNameEditorOpen && !isStationNameEditorOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsLineNameEditorOpen(false);
      setIsStationNameEditorOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLineNameEditorOpen, isStationNameEditorOpen]);

  useEffect(
    () => subscribeTransitNetworkLineNameEditorRequested(studioId, openLineNameEditor),
    [openLineNameEditor, studioId],
  );

  return (
    <section
      className="transit-network-source"
      aria-labelledby={`${studioId}-network-source-title`}
    >
      <div className="transit-network-source-heading">
        <div>
          <h2 id={`${studioId}-network-source-title`}>{t('transitNetworkSource.title')}</h2>
          <span>
            {source === 'rmp'
              ? projectOrigin === 'sample'
                ? t('transitNetworkSource.origin.sample')
                : t('transitNetworkSource.origin.rmp')
              : t('transitNetworkSource.origin.server')}
          </span>
        </div>
        {projectOrigin === 'sample' ? (
          <Button
            variant="secondary"
            className="transit-network-heading-import-button"
            icon="upload_file"
            aria-label={t('transitNetworkSource.import.own')}
            title={t('transitNetworkSource.import.own')}
            onClick={() => inputRef.current?.click()}
          >
            {t('transitNetworkSource.import.short')}
          </Button>
        ) : (
          <IconButton
            icon="upload_file"
            label={t('transitNetworkSource.import.default')}
            onClick={() => inputRef.current?.click()}
          />
        )}
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void importProject(event)}
        />
      </div>

      <SegmentedControl
        wrapperClassName=""
        ariaLabel={t('transitNetworkSource.sourceAria')}
        className="transit-visual-segmented"
        value={source}
        options={[
          {
            value: 'server',
            label: t('transitNetworkSource.source.server'),
          },
          {
            value: 'rmp',
            label: isProjectLoading
              ? t('transitNetworkSource.source.loading')
              : projectOrigin === 'sample'
                ? t('transitNetworkSource.source.sample')
                : t('transitNetworkSource.source.imported'),
            disabled: !snapshot,
          },
        ]}
        onChange={(nextSource) => selectSource(nextSource)}
      />

      {snapshot ? (
        <div className="transit-network-import-summary">
          <div>
            {projectOrigin === 'sample' ? (
              <a href={sampleSourceUrl} target="_blank" rel="noreferrer" title={sampleSourceUrl}>
                <strong>{sampleName}</strong>
              </a>
            ) : (
              <strong title={fileName}>{fileName}</strong>
            )}
            <span>
              RMP v{snapshot.version} ·{' '}
              {t('transitNetworkSource.summary.stationCount', { count: stationCount })} ·{' '}
              {unnamedStations.length
                ? t('transitNetworkSource.summary.stationsUnnamed', {
                    count: unnamedStations.length,
                  })
                : t('transitNetworkSource.summary.stationsNamed')}{' '}
              · {t('transitNetworkSource.summary.lineCount', { count: projectLines.length })} ·{' '}
              {t('transitNetworkSource.summary.edgeCount', { count: snapshot.edges.length })} ·{' '}
              {isPersisting
                ? t('transitNetworkSource.status.persisting')
                : projectId
                  ? t('transitNetworkSource.status.persisted')
                  : projectOrigin === 'sample'
                    ? t('transitNetworkSource.status.gallerySample')
                    : t('transitNetworkSource.status.localOnly')}
            </span>
            {projectOrigin === 'sample' ? (
              <span>
                {t('transitNetworkSource.summary.source')}{' '}
                <a href={sampleLicenseUrl} target="_blank" rel="noreferrer">
                  {sampleLicenseName}
                </a>
              </span>
            ) : null}
          </div>
          <div
            className="transit-network-palette"
            aria-label={t('transitNetworkSource.palette.aria', { count: palette.length })}
          >
            {palette.slice(0, 8).map((option) => (
              <span
                key={option.value}
                title={option.label}
                style={{ backgroundColor: option.value }}
              />
            ))}
            {palette.length > 8 ? <small>+{palette.length - 8}</small> : null}
          </div>
          <div className="transit-network-import-actions">
            {unnamedStations.length ? (
              <button
                type="button"
                className="transit-network-maintenance-button"
                aria-label={t('transitNetworkSource.action.fillStationNamesAria', {
                  count: unnamedStations.length,
                })}
                title={t('transitNetworkSource.action.fillStationNamesAria', {
                  count: unnamedStations.length,
                })}
                disabled={isPersisting}
                onClick={openStationNameEditor}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  edit_location_alt
                </span>
                <span>
                  {t('transitNetworkSource.action.fillStationNames', {
                    count: unnamedStations.length,
                  })}
                </span>
              </button>
            ) : null}
            {projectOrigin !== 'none' ? (
              <button
                type="button"
                className="transit-network-maintenance-button"
                disabled={isPersisting}
                onClick={() => setIsProfilePanelOpen(true)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  edit_note
                </span>
                <span>{projectId ? '管理车站资料' : '查看车站资料'}</span>
              </button>
            ) : null}
            <IconButton
              variant="icon"
              icon="edit"
              label={t('transitNetworkSource.action.configureLineNames')}
              title={t('transitNetworkSource.action.configureLineNames')}
              onClick={openLineNameEditor}
            />
            {projectOrigin === 'imported' ? (
              <IconButton
                variant="icon"
                icon="close"
                label={t('transitNetworkSource.action.removeImported')}
                title={t('transitNetworkSource.action.removeImported')}
                disabled={isPersisting}
                onClick={() => void removeProject()}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          icon="upload_file"
          className="transit-network-import-button"
          onClick={() => inputRef.current?.click()}
        >
          {t('transitNetworkSource.import.project')}
        </Button>
      )}

      {errorMessage ? (
        <p className="transit-network-import-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {isLineNameEditorOpen && snapshot ? (
        <PortaledModal
          className="transit-network-line-name-dialog"
          as="form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveLineNames();
          }}
          onBackdropClick={() => setIsLineNameEditorOpen(false)}
        >
          <div className="section-heading">
            <h2 id={`${studioId}-line-name-dialog-title`}>
              {t('transitNetworkSource.lineName.title')}
            </h2>
            <IconButton
              variant="icon"
              icon="close"
              label={t('transitNetworkSource.action.close')}
              title={t('transitNetworkSource.action.close')}
              onClick={() => setIsLineNameEditorOpen(false)}
            />
          </div>
          <p className="transit-network-line-name-hint">
            {t('transitNetworkSource.lineName.hintPart1')}
            <code>sh2</code>
            {t('transitNetworkSource.lineName.hintPart2')}
            <code>bj1</code>
            {t('transitNetworkSource.lineName.hintPart3')}
            <code>sh2</code>
            {t('transitNetworkSource.lineName.hintPart4')}
          </p>
          <div className="transit-network-line-name-list">
            {projectLines.map((line, index) => (
              <label key={line.id}>
                <span>
                  <i style={{ backgroundColor: line.color }} aria-hidden="true" />
                  <strong>{line.lineKey}</strong>
                </span>
                <input
                  autoFocus={index === 0}
                  value={lineNameDraft[line.id]?.name ?? ''}
                  maxLength={120}
                  required={Boolean(lineNameDraft[line.id]?.secondaryName.trim())}
                  aria-label={t('transitNetworkSource.lineName.primaryAria', {
                    key: line.lineKey,
                  })}
                  placeholder={t('transitNetworkSource.lineName.primaryPlaceholder')}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setLineNameDraft((current) => ({
                      ...current,
                      [line.id]: {
                        name: value,
                        secondaryName: current[line.id]?.secondaryName ?? '',
                      },
                    }));
                  }}
                />
                <input
                  value={lineNameDraft[line.id]?.secondaryName ?? ''}
                  maxLength={120}
                  aria-label={t('transitNetworkSource.lineName.secondaryAria', {
                    key: line.lineKey,
                  })}
                  placeholder={t('transitNetworkSource.lineName.secondaryPlaceholder')}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setLineNameDraft((current) => ({
                      ...current,
                      [line.id]: {
                        name: current[line.id]?.name ?? '',
                        secondaryName: value,
                      },
                    }));
                  }}
                />
              </label>
            ))}
          </div>
          <div className="material-action-row">
            <button type="button" onClick={() => setIsLineNameEditorOpen(false)}>
              {t('transitNetworkSource.action.cancel')}
            </button>
            <Button type="submit" loading={isPersisting}>
              {isPersisting
                ? t('transitNetworkSource.action.saving')
                : t('transitNetworkSource.lineName.save')}
            </Button>
          </div>
        </PortaledModal>
      ) : null}

      {isStationNameEditorOpen && snapshot ? (
        <PortaledModal
          className="transit-network-station-name-dialog"
          as="form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveStationNames();
          }}
          onBackdropClick={() => setIsStationNameEditorOpen(false)}
        >
          <div className="section-heading">
            <h2 id={`${studioId}-station-name-dialog-title`}>
              {t('transitNetworkSource.stationName.title')}
            </h2>
            <IconButton
              variant="icon"
              icon="close"
              label={t('transitNetworkSource.action.close')}
              title={t('transitNetworkSource.action.close')}
              onClick={() => setIsStationNameEditorOpen(false)}
            />
          </div>
          <div className="transit-network-station-name-list">
            {unnamedStations.map((station, index) => {
              const nearbyStationNames = listMaterialTransitNetworkNearbyStationNames(
                snapshot,
                station.id,
              );
              return (
                <div key={station.id} className="transit-network-station-name-row">
                  <div>
                    <strong>{station.id}</strong>
                    <span>
                      {nearbyStationNames.length
                        ? t('transitNetworkSource.stationName.nearby', {
                            names: nearbyStationNames.join(locale === 'en' ? ', ' : '、'),
                          })
                        : t('transitNetworkSource.stationName.nearbyUnavailable')}
                    </span>
                  </div>
                  <input
                    autoFocus={index === 0}
                    value={stationNameDraft[station.id]?.name ?? ''}
                    maxLength={160}
                    required={Boolean(stationNameDraft[station.id]?.secondaryName.trim())}
                    aria-label={t('transitNetworkSource.stationName.primaryAria', {
                      id: station.id,
                    })}
                    placeholder={t('transitNetworkSource.stationName.primaryPlaceholder')}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setStationNameDraft((current) => ({
                        ...current,
                        [station.id]: {
                          name: value,
                          secondaryName: current[station.id]?.secondaryName ?? '',
                        },
                      }));
                    }}
                  />
                  <input
                    value={stationNameDraft[station.id]?.secondaryName ?? ''}
                    maxLength={160}
                    aria-label={t('transitNetworkSource.stationName.secondaryAria', {
                      id: station.id,
                    })}
                    placeholder={t('transitNetworkSource.stationName.secondaryPlaceholder')}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setStationNameDraft((current) => ({
                        ...current,
                        [station.id]: {
                          name: current[station.id]?.name ?? '',
                          secondaryName: value,
                        },
                      }));
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="material-action-row">
            <button type="button" onClick={() => setIsStationNameEditorOpen(false)}>
              {t('transitNetworkSource.action.cancel')}
            </button>
            <Button type="submit" loading={isPersisting}>
              {isPersisting
                ? t('transitNetworkSource.action.saving')
                : t('transitNetworkSource.stationName.save')}
            </Button>
          </div>
        </PortaledModal>
      ) : null}

      {isProfilePanelOpen && snapshot ? (
        <TransitNetworkProfilePanel
          studioId={studioId}
          snapshot={snapshot}
          projectId={projectId}
          initialProfiles={stationProfiles}
          onClose={() => setIsProfilePanelOpen(false)}
          onSaved={(profiles) => {
            setStationProfiles(profiles);
            publishTransitNetworkProfilesChanged({ studioId, stationProfiles: profiles });
          }}
        />
      ) : null}
    </section>
  );
}
