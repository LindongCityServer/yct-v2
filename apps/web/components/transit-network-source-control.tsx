'use client';

import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MaterialTransitNetworkProject, MaterialTransitNetworkSnapshot } from '@yct/contracts';
import { appPath } from '../lib/app-paths';
import { publishLoginRequiredForResponse } from '../lib/client-auth-events';
import {
  publishTransitNetworkImportFailed,
  publishTransitNetworkImportSucceeded,
  publishTransitNetworkProjectSnapshotChanged,
  publishTransitNetworkSourceChanged,
  subscribeTransitNetworkLineNameEditorRequested,
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

type TransitNetworkProjectOrigin = 'none' | 'sample' | 'imported';

async function fetchDefaultTransitNetworkSample(): Promise<TransitNetworkSampleResponse> {
  const response = await fetch(appPath('/api/materials/transit-network-projects/sample'), {
    cache: 'no-store',
  });
  const data = (await response.json()) as Partial<TransitNetworkSampleResponse> & {
    message?: string;
  };
  if (
    !response.ok ||
    !data.fileName ||
    !data.name ||
    !data.sourceUrl ||
    !data.licenseName ||
    !data.licenseUrl ||
    !data.snapshot
  ) {
    throw new Error(data.message ?? '默认示例线网暂时无法加载。');
  }
  return data as TransitNetworkSampleResponse;
}

export function TransitNetworkSourceControl({
  studioId,
  initialSource,
  initialSnapshot,
}: Readonly<{
  studioId: string;
  initialSource?: TransitNetworkSourceKind;
  initialSnapshot?: MaterialTransitNetworkSnapshot;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const projectLoadRevisionRef = useRef(0);
  const sourceRef = useRef<TransitNetworkSourceKind>(initialSource ?? 'rmp');
  const hasUserSelectedSourceRef = useRef(false);
  const [source, setSource] = useState<TransitNetworkSourceKind>(sourceRef.current);
  const [snapshot, setSnapshot] = useState<MaterialTransitNetworkSnapshot>();
  const [projectId, setProjectId] = useState('');
  const [projectOrigin, setProjectOrigin] = useState<TransitNetworkProjectOrigin>('none');
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
    });
  };

  const importProject = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      if (file.size > RMP_TRANSIT_NETWORK_MAX_FILE_SIZE) {
        throw new Error('RMP 项目文件不能超过 5 MB。');
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
      });

      setIsPersisting(true);
      try {
        const response = await fetch(appPath('/api/materials/transit-network-projects'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, snapshot: nextSnapshot }),
        });
        const data = (await response.json()) as MaterialTransitNetworkProject & {
          message?: string;
        };
        if (response.status === 401) {
          setProjectId('');
          setErrorMessage('未登录，当前导入仅在本页有效。');
          return;
        }
        if (publishLoginRequiredForResponse(response)) {
          setProjectId('');
          return;
        }
        if (!response.ok) throw new Error(data.message ?? '无法暂存 RMP 项目。');
        setProjectId(data.id);
        setSnapshot(data.snapshot);
      } catch (error) {
        setProjectId('');
        setErrorMessage(
          `${error instanceof Error ? error.message : '无法暂存 RMP 项目。'} 当前导入仅在本页有效。`,
        );
      } finally {
        setIsPersisting(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法读取 RMP 项目文件。';
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
          const data = (await response.json()) as { message?: string };
          throw new Error(data.message ?? '无法删除暂存的线网项目。');
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '无法删除暂存的线网项目。');
        setIsPersisting(false);
        return;
      }
    }
    if (projectLoadRevisionRef.current !== loadRevision) return;
    setSnapshot(undefined);
    setProjectId('');
    setProjectOrigin('none');
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
    });
    setIsPersisting(false);
    setIsProjectLoading(true);
    try {
      const sample = await fetchDefaultTransitNetworkSample();
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
      });
    } catch (error) {
      if (projectLoadRevisionRef.current !== loadRevision) return;
      setErrorMessage(
        `${error instanceof Error ? error.message : '默认示例线网暂时无法加载。'} 仍可使用服务器线网或导入本地项目。`,
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
          return [line.id, { name: names?.name ?? '', secondaryName: names?.secondaryName ?? '' }];
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
        const data = (await response.json()) as MaterialTransitNetworkProject & {
          message?: string;
        };
        if (publishLoginRequiredForResponse(response)) {
          return;
        }
        if (!response.ok) throw new Error(data.message ?? '无法保存线路名称。');
        savedSnapshot = data.snapshot;
      }
      setSnapshot(savedSnapshot);
      setErrorMessage(
        projectId
          ? ''
          : projectOrigin === 'sample'
            ? '示例项目的线路名称调整仅在本页有效。'
            : '线路名称仅在本页有效；项目尚未成功暂存。',
      );
      setIsLineNameEditorOpen(false);
      publishTransitNetworkProjectSnapshotChanged({ studioId, snapshot: savedSnapshot });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法保存线路名称。');
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
        const data = (await response.json()) as MaterialTransitNetworkProject & {
          message?: string;
        };
        if (publishLoginRequiredForResponse(response)) return;
        if (!response.ok) throw new Error(data.message ?? '无法保存站点名称。');
        savedSnapshot = data.snapshot;
      }
      setSnapshot(savedSnapshot);
      setErrorMessage(
        projectId
          ? ''
          : projectOrigin === 'sample'
            ? '示例项目的站点名称调整仅在本页有效。'
            : '站点名称仅在本页有效；项目尚未成功暂存。',
      );
      setIsStationNameEditorOpen(false);
      publishTransitNetworkProjectSnapshotChanged({ studioId, snapshot: savedSnapshot });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法保存站点名称。');
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
        setFileName('本机草稿线网');
        setIsProjectLoading(false);
        if (sourceRef.current === 'rmp') {
          publishTransitNetworkSourceChanged({
            studioId,
            source: 'rmp',
            reason: 'initialization',
            snapshot: initialSnapshot,
          });
        }
        return;
      }
      let project: MaterialTransitNetworkProject | undefined;
      try {
        const response = await fetch(appPath('/api/materials/transit-network-projects'), {
          cache: 'no-store',
        });
        if (response.ok) {
          const data = (await response.json()) as { items?: MaterialTransitNetworkProject[] };
          project = data.items?.[0];
        }
      } catch {
        project = undefined;
      }
      if (cancelled || projectLoadRevisionRef.current !== loadRevision) return;
      if (project) {
        setProjectId(project.id);
        setProjectOrigin('imported');
        setSnapshot(project.snapshot);
        setFileName(project.fileName);
        setIsProjectLoading(false);
        if (sourceRef.current === 'rmp') {
          publishTransitNetworkSourceChanged({
            studioId,
            source: 'rmp',
            reason: 'initialization',
            snapshot: project.snapshot,
          });
        }
        return;
      }
      try {
        const sample = await fetchDefaultTransitNetworkSample();
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
          });
        }
      } catch (error) {
        if (cancelled || projectLoadRevisionRef.current !== loadRevision) return;
        setErrorMessage(
          `${error instanceof Error ? error.message : '默认示例线网暂时无法加载。'} 仍可使用服务器线网或导入本地项目。`,
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
          <h2 id={`${studioId}-network-source-title`}>线网数据</h2>
          <span>
            {source === 'rmp'
              ? projectOrigin === 'sample'
                ? 'RMP 画廊项目'
                : 'RMP 项目'
              : '服务器'}
          </span>
        </div>
        <button
          type="button"
          className={
            projectOrigin === 'sample'
              ? 'secondary-action-button transit-network-heading-import-button'
              : 'icon-button'
          }
          aria-label={projectOrigin === 'sample' ? '导入自己的 RMP 项目' : '导入 RMP 项目'}
          title={projectOrigin === 'sample' ? '导入自己的 RMP 项目' : '导入 RMP 项目'}
          onClick={() => inputRef.current?.click()}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            upload_file
          </span>
          {projectOrigin === 'sample' ? <span>导入</span> : null}
        </button>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void importProject(event)}
        />
      </div>

      <div className="material-mode-switch" role="group" aria-label="线网数据来源">
        <button
          type="button"
          className={source === 'server' ? 'is-active' : ''}
          onClick={() => selectSource('server')}
        >
          服务器线网
        </button>
        <button
          type="button"
          className={source === 'rmp' ? 'is-active' : ''}
          disabled={!snapshot}
          onClick={() => selectSource('rmp')}
        >
          {isProjectLoading ? '正在加载' : projectOrigin === 'sample' ? '示例线网' : '导入项目'}
        </button>
      </div>

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
              RMP v{snapshot.version} · {stationCount} 站 ·{' '}
              {unnamedStations.length ? `${unnamedStations.length} 站待补名` : '站名完整'} ·{' '}
              {projectLines.length} 条线路 · {snapshot.edges.length} 条连接 ·{' '}
              {isPersisting
                ? '正在暂存'
                : projectId
                  ? '已暂存'
                  : projectOrigin === 'sample'
                    ? '画廊示例'
                    : '仅本页'}
            </span>
            {projectOrigin === 'sample' ? (
              <span>
                来源：RMP 画廊 ·{' '}
                <a href={sampleLicenseUrl} target="_blank" rel="noreferrer">
                  {sampleLicenseName}
                </a>
              </span>
            ) : null}
          </div>
          <div className="transit-network-palette" aria-label={`${palette.length} 种线路配色`}>
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
                aria-label={`补全 ${unnamedStations.length} 个未命名站点`}
                title={`补全 ${unnamedStations.length} 个未命名站点`}
                disabled={isPersisting}
                onClick={openStationNameEditor}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  edit_location_alt
                </span>
                <span>补站名 {unnamedStations.length}</span>
              </button>
            ) : null}
            <button
              type="button"
              className="icon-button"
              aria-label="配置项目线路名称"
              title="配置项目线路名称"
              onClick={openLineNameEditor}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                edit
              </span>
            </button>
            {projectOrigin === 'imported' ? (
              <button
                type="button"
                className="icon-button"
                aria-label="移除已导入项目"
                title="移除已导入项目"
                disabled={isPersisting}
                onClick={() => void removeProject()}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="secondary-action-button transit-network-import-button"
          onClick={() => inputRef.current?.click()}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            upload_file
          </span>
          导入项目
        </button>
      )}

      {errorMessage ? (
        <p className="transit-network-import-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {isLineNameEditorOpen && snapshot ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsLineNameEditorOpen(false)}
        >
          <form
            className="modal-panel transit-network-line-name-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${studioId}-line-name-dialog-title`}
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveLineNames();
            }}
          >
            <div className="section-heading">
              <h2 id={`${studioId}-line-name-dialog-title`}>配置项目线路名称</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭"
                title="关闭"
                onClick={() => setIsLineNameEditorOpen(false)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
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
                    aria-label={`${line.lineKey}主名称`}
                    placeholder="主名称"
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
                    aria-label={`${line.lineKey}副名称`}
                    placeholder="副名称"
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
                取消
              </button>
              <button type="submit" className="primary-action-button">
                {isPersisting ? '正在保存' : '保存线路名称'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isStationNameEditorOpen && snapshot ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsStationNameEditorOpen(false)}
        >
          <form
            className="modal-panel transit-network-station-name-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${studioId}-station-name-dialog-title`}
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveStationNames();
            }}
          >
            <div className="section-heading">
              <h2 id={`${studioId}-station-name-dialog-title`}>补全未命名站点</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭"
                title="关闭"
                onClick={() => setIsStationNameEditorOpen(false)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
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
                          ? `相邻：${nearbyStationNames.join('、')}`
                          : '相邻站名不可用'}
                      </span>
                    </div>
                    <input
                      autoFocus={index === 0}
                      value={stationNameDraft[station.id]?.name ?? ''}
                      maxLength={160}
                      required={Boolean(stationNameDraft[station.id]?.secondaryName.trim())}
                      aria-label={`${station.id}主站名`}
                      placeholder="主站名"
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
                      aria-label={`${station.id}副站名`}
                      placeholder="副站名"
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
                取消
              </button>
              <button type="submit" className="primary-action-button" disabled={isPersisting}>
                {isPersisting ? '正在保存' : '保存已填写站名'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
