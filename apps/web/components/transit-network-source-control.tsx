'use client';

import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MaterialTransitNetworkProject, MaterialTransitNetworkSnapshot } from '@yct/contracts';
import { appPath } from '../lib/app-paths';
import {
  publishTransitNetworkImportFailed,
  publishTransitNetworkImportSucceeded,
  publishTransitNetworkLineNamesChanged,
  publishTransitNetworkSourceChanged,
  subscribeTransitNetworkLineNameEditorRequested,
  type TransitNetworkSourceKind,
} from '../lib/client-transit-network-events';
import {
  listMaterialTransitNetworkPalette,
  listMaterialTransitNetworkLines,
  parseRmpTransitNetworkProject,
  RMP_TRANSIT_NETWORK_MAX_FILE_SIZE,
} from '../lib/rmp-transit-network';

interface TransitNetworkLineNameDraft {
  name: string;
  secondaryName: string;
}

export function TransitNetworkSourceControl({ studioId }: Readonly<{ studioId: string }>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<TransitNetworkSourceKind>('server');
  const [snapshot, setSnapshot] = useState<MaterialTransitNetworkSnapshot>();
  const [projectId, setProjectId] = useState('');
  const [fileName, setFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPersisting, setIsPersisting] = useState(false);
  const [isLineNameEditorOpen, setIsLineNameEditorOpen] = useState(false);
  const [lineNameDraft, setLineNameDraft] = useState<Record<string, TransitNetworkLineNameDraft>>(
    {},
  );
  const palette = snapshot ? listMaterialTransitNetworkPalette(snapshot) : [];
  const projectLines = useMemo(
    () => (snapshot ? listMaterialTransitNetworkLines(snapshot) : []),
    [snapshot],
  );
  const stationCount = snapshot?.nodes.filter((node) => node.kind === 'station').length ?? 0;

  const selectSource = (nextSource: TransitNetworkSourceKind, nextSnapshot = snapshot): void => {
    if (nextSource === 'rmp' && !nextSnapshot) return;
    setSource(nextSource);
    publishTransitNetworkSourceChanged({
      studioId,
      source: nextSource,
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
      setSnapshot(nextSnapshot);
      setFileName(file.name);
      setErrorMessage('');
      setIsLineNameEditorOpen(false);
      setSource('rmp');
      publishTransitNetworkImportSucceeded({
        studioId,
        fileName: file.name,
        snapshot: nextSnapshot,
      });
      publishTransitNetworkSourceChanged({ studioId, source: 'rmp', snapshot: nextSnapshot });

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
    if (projectId) {
      setIsPersisting(true);
      try {
        const response = await fetch(
          appPath(`/api/materials/transit-network-projects/${projectId}`),
          { method: 'DELETE' },
        );
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
    setSnapshot(undefined);
    setProjectId('');
    setFileName('');
    setErrorMessage('');
    setIsLineNameEditorOpen(false);
    setSource('server');
    publishTransitNetworkSourceChanged({ studioId, source: 'server', clearSnapshot: true });
    setIsPersisting(false);
  };

  const openLineNameEditor = useCallback((): void => {
    setLineNameDraft(
      Object.fromEntries(
        projectLines.map((line) => {
          const names = snapshot?.lineNames?.find(
            (candidate) => candidate.lineKey === line.lineKey,
          );
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
        if (!response.ok) throw new Error(data.message ?? '无法保存线路名称。');
        savedSnapshot = data.snapshot;
      }
      setSnapshot(savedSnapshot);
      setErrorMessage(projectId ? '' : '线路名称仅在本页有效；项目尚未成功暂存。');
      setIsLineNameEditorOpen(false);
      publishTransitNetworkLineNamesChanged({ studioId, snapshot: savedSnapshot });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法保存线路名称。');
    } finally {
      setIsPersisting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void fetch(appPath('/api/materials/transit-network-projects'), { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return undefined;
        const data = (await response.json()) as { items?: MaterialTransitNetworkProject[] };
        return data.items?.[0];
      })
      .then((project) => {
        if (!project || cancelled) return;
        setProjectId(project.id);
        setSnapshot(project.snapshot);
        setFileName(project.fileName);
        publishTransitNetworkSourceChanged({
          studioId,
          source: 'server',
          snapshot: project.snapshot,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [studioId]);

  useEffect(() => {
    if (!isLineNameEditorOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsLineNameEditorOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLineNameEditorOpen]);

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
          <span>{source === 'rmp' ? 'RMP 项目' : '服务器'}</span>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="导入 RMP 项目"
          title="导入 RMP 项目"
          onClick={() => inputRef.current?.click()}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            upload_file
          </span>
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
          导入项目
        </button>
      </div>

      {snapshot ? (
        <div className="transit-network-import-summary">
          <div>
            <strong title={fileName}>{fileName}</strong>
            <span>
              RMP v{snapshot.version} · {stationCount} 站 · {projectLines.length} 条线路 ·{' '}
              {snapshot.edges.length} 条连接 ·{' '}
              {isPersisting ? '正在暂存' : projectId ? '已暂存' : '仅本页'}
            </span>
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
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="transit-network-import-button"
          onClick={() => inputRef.current?.click()}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            upload_file
          </span>
          导入 RMP 项目
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
    </section>
  );
}
