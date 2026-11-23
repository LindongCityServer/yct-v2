'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  MaterialTransitNetworkSnapshot,
  MaterialTransitStationExit,
  MaterialTransitStationOrientation,
  MaterialTransitStationProfile,
  MaterialTransitStationStructure,
} from '@yct/contracts';
import { appPath } from '../lib/app-paths';
import { EditorDialogPortal } from './editor/editor-dialog-portal';
import { SegmentedControl } from './segmented-control';
import { Button, IconButton } from './ui/button';
import { Input, SearchField, Select, Textarea } from './ui/field';
import { Modal } from './ui/modal';

/**
 * 自定义线网的车站资料维护面板（P1 第一刀）。
 *
 * 目前只覆盖“导视牌用得上”的字段：车站结构 + 出口。运营单位/标志、楼层剖面
 * 等后续再扩。文案先中文，i18n 键在功能稳定后补。
 */

const orientationOptions: Array<{ value: MaterialTransitStationOrientation; label: string }> = [
  { value: 'N', label: '北' },
  { value: 'NE', label: '东北' },
  { value: 'E', label: '东' },
  { value: 'SE', label: '东南' },
  { value: 'S', label: '南' },
  { value: 'SW', label: '西南' },
  { value: 'W', label: '西' },
  { value: 'NW', label: '西北' },
];

const exitStatusOptions = [
  { value: 'open', label: '正常开放' },
  { value: 'closed', label: '暂停使用' },
  { value: 'reserved', label: '预留未开' },
] as const;

const positionOptions = [
  { value: 'underground', label: '地下' },
  { value: 'elevated', label: '高架' },
  { value: 'ground', label: '地面' },
  { value: 'mixed', label: '混合' },
] as const;

const platformTypeOptions = [
  { value: 'island', label: '岛式' },
  { value: 'side', label: '侧式' },
  { value: 'stacked', label: '叠岛' },
  { value: 'twin-island', label: '双岛' },
  { value: 'side-stacked', label: '侧式叠层' },
  { value: 'other', label: '其他' },
] as const;

const layerUsageOptions = [
  { value: 'concourse', label: '站厅' },
  { value: 'platform', label: '站台' },
  { value: 'entrance', label: '出入口' },
  { value: 'transfer', label: '换乘' },
  { value: 'equipment', label: '设备' },
  { value: 'other', label: '其他' },
] as const;

type StationFilter = 'all' | 'missing-exits' | 'missing-structure';

function nextExitCode(exits: MaterialTransitStationExit[]): string {
  const used = new Set(exits.map((exit) => exit.code.trim().toUpperCase()));
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (!used.has(letter)) return letter;
  }
  return `E${exits.length + 1}`;
}

export function TransitNetworkProfilePanel({
  studioId,
  snapshot,
  projectId,
  initialProfiles,
  onClose,
  onSaved,
}: Readonly<{
  studioId: string;
  snapshot: MaterialTransitNetworkSnapshot;
  projectId: string;
  initialProfiles: MaterialTransitStationProfile[];
  onClose: () => void;
  onSaved: (profiles: MaterialTransitStationProfile[]) => void;
}>) {
  const stationNodes = useMemo(
    () =>
      snapshot.nodes
        .filter((node) => node.kind === 'station')
        .sort((left, right) =>
          (left.names[0] ?? left.id).localeCompare(right.names[0] ?? right.id, 'zh-CN'),
        ),
    [snapshot.nodes],
  );
  const [profiles, setProfiles] = useState<Record<string, MaterialTransitStationProfile>>(() => {
    const map: Record<string, MaterialTransitStationProfile> = {};
    for (const profile of initialProfiles) map[profile.nodeId] = profile;
    return map;
  });
  const [selectedNodeId, setSelectedNodeId] = useState(() => {
    const firstMissing = stationNodes.find(
      (node) =>
        !initialProfiles.some((profile) => profile.nodeId === node.id && profile.exits?.length),
    );
    return firstMissing?.id ?? stationNodes[0]?.id ?? '';
  });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StationFilter>('all');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  // 示例线网/异步项目资料可能在面板打开后才到，跟着 props 同步一次，避免一直显示“缺出口”。
  useEffect(() => {
    const map: Record<string, MaterialTransitStationProfile> = {};
    for (const profile of initialProfiles) map[profile.nodeId] = profile;
    setProfiles(map);
  }, [initialProfiles]);

  const withExitsCount = stationNodes.filter((node) => profiles[node.id]?.exits?.length).length;
  const withStructureCount = stationNodes.filter((node) => profiles[node.id]?.structure).length;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const filteredStations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return stationNodes.filter((node) => {
      if (normalizedQuery) {
        const haystack = [node.id, ...node.names].join(' ').toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      const profile = profiles[node.id];
      if (filter === 'missing-exits' && profile?.exits?.length) return false;
      if (filter === 'missing-structure' && profile?.structure) return false;
      return true;
    });
  }, [filter, profiles, query, stationNodes]);

  const selectedNode = stationNodes.find((node) => node.id === selectedNodeId);
  const currentProfile: MaterialTransitStationProfile = profiles[selectedNodeId] ?? {
    nodeId: selectedNodeId,
    exits: [],
  };
  const currentExits = currentProfile.exits ?? [];

  const updateProfile = (
    nodeId: string,
    updater: (profile: MaterialTransitStationProfile) => MaterialTransitStationProfile,
  ) => {
    setProfiles((current) => {
      const base = current[nodeId] ?? { nodeId };
      return { ...current, [nodeId]: updater(base) };
    });
    setNotice('');
  };

  const updateStructure = (patch: Partial<MaterialTransitStationStructure>) => {
    updateProfile(selectedNodeId, (profile) => ({
      ...profile,
      structure: { ...profile.structure, ...patch },
    }));
  };

  const updateExit = (index: number, patch: Partial<MaterialTransitStationExit>) => {
    updateProfile(selectedNodeId, (profile) => ({
      ...profile,
      exits: (profile.exits ?? []).map((exit, exitIndex) =>
        exitIndex === index ? { ...exit, ...patch } : exit,
      ),
    }));
  };

  const addExit = () => {
    updateProfile(selectedNodeId, (profile) => {
      const exits = profile.exits ?? [];
      return {
        ...profile,
        exits: [...exits, { code: nextExitCode(exits), status: 'open' as const }],
      };
    });
  };

  const removeExit = (index: number) => {
    updateProfile(selectedNodeId, (profile) => ({
      ...profile,
      exits: (profile.exits ?? []).filter((_, exitIndex) => exitIndex !== index),
    }));
  };

  const updateLayer = (
    index: number,
    patch: Partial<NonNullable<MaterialTransitStationStructure['layers']>[number]>,
  ) => {
    updateProfile(selectedNodeId, (profile) => ({
      ...profile,
      structure: {
        ...profile.structure,
        layers: (profile.structure?.layers ?? []).map((layer, layerIndex) =>
          layerIndex === index ? { ...layer, ...patch } : layer,
        ),
      },
    }));
  };

  const addLayer = () => {
    updateProfile(selectedNodeId, (profile) => {
      const layers = profile.structure?.layers ?? [];
      return {
        ...profile,
        structure: {
          ...profile.structure,
          layers: [
            ...layers,
            {
              name: `B${layers.length + 1}`,
              usage: 'concourse' as const,
              order: layers.length,
            },
          ],
        },
      };
    });
  };

  const removeLayer = (index: number) => {
    updateProfile(selectedNodeId, (profile) => ({
      ...profile,
      structure: {
        ...profile.structure,
        layers: (profile.structure?.layers ?? []).filter((_, layerIndex) => layerIndex !== index),
      },
    }));
  };

  const save = async () => {
    if (!projectId) {
      setErrorMessage('当前线网是示例或本机草稿，登录并保存线网后才能维护车站资料。');
      return;
    }
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      // 空资料也要提交：服务端按“空资料=清空该站”处理，否则删掉最后一个出口不会生效。
      const knownNodeIds = new Set(stationNodes.map((node) => node.id));
      const stationProfiles = Object.values(profiles).filter((profile) =>
        knownNodeIds.has(profile.nodeId),
      );
      for (const profile of stationProfiles) {
        const codes = (profile.exits ?? []).map((exit) => exit.code.trim());
        if (codes.some((code) => !code)) {
          setSelectedNodeId(profile.nodeId);
          throw new Error('每个出口都必须有编号。');
        }
        if (new Set(codes).size !== codes.length) {
          setSelectedNodeId(profile.nodeId);
          throw new Error('同一车站的出口编号不能重复。');
        }
      }
      const response = await fetch(
        appPath(`/api/materials/transit-network-projects/${projectId}`),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stationProfiles }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        supplement?: { stations?: MaterialTransitStationProfile[] };
      };
      if (!response.ok) {
        throw new Error(data.message ?? '保存车站资料失败。');
      }
      const saved = data.supplement?.stations ?? stationProfiles;
      const nextProfiles: Record<string, MaterialTransitStationProfile> = {};
      for (const profile of saved) nextProfiles[profile.nodeId] = profile;
      setProfiles(nextProfiles);
      setNotice('车站资料已保存。');
      onSaved(saved);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存车站资料失败。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorDialogPortal>
      <Modal
        labelledBy={`${studioId}-transit-network-profile-title`}
        backdropClassName="transit-network-editor-backdrop"
        className="transit-network-profile-dialog"
        as="form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <header className="transit-network-profile-header">
          <div>
            <span>我的线网</span>
            <h2 id={`${studioId}-transit-network-profile-title`}>车站资料</h2>
          </div>
          <IconButton variant="icon" icon="close" label="关闭" onClick={onClose} />
        </header>

        <div className="transit-network-profile-summary">
          <span>{stationNodes.length} 站</span>
          <span>已填出口 {withExitsCount}</span>
          <span>已填结构 {withStructureCount}</span>
          <span className="muted">出口会直接填进模板库的出口模板空位</span>
        </div>

        <div className="transit-network-profile-body">
          <aside className="transit-network-profile-sidebar">
            <SearchField
              value={query}
              placeholder="搜索站名或 ID"
              aria-label="搜索车站"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
              onClear={() => setQuery('')}
              clearLabel="清除搜索"
            />
            <SegmentedControl
              ariaLabel="车站资料筛选"
              className="transit-visual-segmented"
              wrapperClassName=""
              value={filter}
              options={[
                { value: 'all', label: '全部' },
                { value: 'missing-exits', label: '缺出口' },
                { value: 'missing-structure', label: '缺结构' },
              ]}
              onChange={(next) => setFilter(next as StationFilter)}
            />
            <div className="transit-network-profile-list" role="listbox" aria-label="车站列表">
              {filteredStations.length ? (
                filteredStations.map((node) => {
                  const profile = profiles[node.id];
                  const hasExits = Boolean(profile?.exits?.length);
                  const hasStructure = Boolean(profile?.structure);
                  return (
                    <button
                      key={node.id}
                      type="button"
                      role="option"
                      aria-selected={node.id === selectedNodeId}
                      className={
                        node.id === selectedNodeId
                          ? 'transit-network-profile-station is-active'
                          : 'transit-network-profile-station'
                      }
                      onClick={() => setSelectedNodeId(node.id)}
                    >
                      <span>
                        <strong>{node.names[0] ?? node.id}</strong>
                        <small>{node.id}</small>
                      </span>
                      <span className="transit-network-profile-badges">
                        {hasExits ? null : <em>缺出口</em>}
                        {hasStructure ? null : <em>缺结构</em>}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="poi-visual-panel-empty">没有匹配的车站。</p>
              )}
            </div>
          </aside>

          <section className="transit-network-profile-detail" aria-label="车站资料编辑">
            {selectedNode ? (
              <>
                <div className="transit-network-profile-detail-heading">
                  <div>
                    <h3>{selectedNode.names[0] ?? selectedNode.id}</h3>
                    <span>{selectedNode.id}</span>
                  </div>
                  <span className="muted">
                    {currentExits.length} 个出口 · {currentProfile.structure?.layers?.length ?? 0}{' '}
                    层
                  </span>
                </div>

                <div className="transit-network-profile-scroll">
                  <section className="transit-network-profile-section">
                    <h4>车站结构</h4>
                    <div className="transit-network-profile-grid">
                      <label className="transit-network-profile-field">
                        <span>车站形式</span>
                        <Select
                          value={currentProfile.structure?.position ?? ''}
                          onChange={(event) =>
                            updateStructure({
                              position: (event.currentTarget.value ||
                                undefined) as MaterialTransitStationStructure['position'],
                            })
                          }
                        >
                          <option value="">未填写</option>
                          {positionOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="transit-network-profile-field">
                        <span>站台形式</span>
                        <Select
                          value={currentProfile.structure?.platformType ?? ''}
                          onChange={(event) =>
                            updateStructure({
                              platformType: (event.currentTarget.value ||
                                undefined) as MaterialTransitStationStructure['platformType'],
                            })
                          }
                        >
                          <option value="">未填写</option>
                          {platformTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="transit-network-profile-field">
                        <span>站台数量</span>
                        <Input
                          type="number"
                          min={1}
                          max={16}
                          value={currentProfile.structure?.platformCount ?? ''}
                          placeholder="如 2"
                          onChange={(event) =>
                            updateStructure({
                              platformCount: event.currentTarget.value
                                ? Number(event.currentTarget.value)
                                : undefined,
                            })
                          }
                        />
                      </label>
                    </div>

                    <div className="transit-network-profile-layers">
                      <div className="transit-network-profile-subheading">
                        <span>楼层</span>
                        <Button variant="secondary" type="button" onClick={addLayer}>
                          添加楼层
                        </Button>
                      </div>
                      {(currentProfile.structure?.layers ?? []).length ? (
                        (currentProfile.structure?.layers ?? []).map((layer, index) => (
                          <div className="transit-network-profile-layer-row" key={`layer-${index}`}>
                            <Input
                              value={layer.name}
                              maxLength={40}
                              aria-label="楼层名称"
                              placeholder="如 B1"
                              onChange={(event) =>
                                updateLayer(index, { name: event.currentTarget.value })
                              }
                            />
                            <Select
                              value={layer.usage}
                              aria-label="楼层用途"
                              onChange={(event) =>
                                updateLayer(index, {
                                  usage: event.currentTarget.value as NonNullable<
                                    MaterialTransitStationStructure['layers']
                                  >[number]['usage'],
                                })
                              }
                            >
                              {layerUsageOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                            <IconButton
                              variant="icon"
                              icon="delete"
                              label="删除楼层"
                              onClick={() => removeLayer(index)}
                            />
                          </div>
                        ))
                      ) : (
                        <p className="poi-visual-panel-empty">还没有楼层，可先留空。</p>
                      )}
                    </div>
                  </section>

                  <section className="transit-network-profile-section">
                    <div className="transit-network-profile-subheading">
                      <h4>出口</h4>
                      <Button variant="secondary" type="button" onClick={addExit}>
                        添加出口
                      </Button>
                    </div>
                    {currentExits.length ? (
                      <div className="transit-network-profile-exits">
                        <div className="transit-network-profile-exit-head" aria-hidden="true">
                          <span>编号</span>
                          <span>方位</span>
                          <span>状态</span>
                          <span>楼层</span>
                          <span>说明 / 地标</span>
                          <span />
                        </div>
                        {currentExits.map((exit) => {
                          const index = (currentProfile.exits ?? []).indexOf(exit);
                          return (
                            <div className="transit-network-profile-exit-row" key={`exit-${index}`}>
                              <Input
                                value={exit.code}
                                maxLength={40}
                                aria-label={`出口 ${index + 1} 编号`}
                                onChange={(event) =>
                                  updateExit(index, { code: event.currentTarget.value })
                                }
                              />
                              <Select
                                value={exit.orientation ?? ''}
                                aria-label={`出口 ${exit.code} 方位`}
                                onChange={(event) =>
                                  updateExit(index, {
                                    orientation: (event.currentTarget.value ||
                                      undefined) as MaterialTransitStationExit['orientation'],
                                  })
                                }
                              >
                                <option value="">未填</option>
                                {orientationOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                value={exit.status ?? 'open'}
                                aria-label={`出口 ${exit.code} 状态`}
                                onChange={(event) =>
                                  updateExit(index, {
                                    status: event.currentTarget
                                      .value as MaterialTransitStationExit['status'],
                                  })
                                }
                              >
                                {exitStatusOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                              <Input
                                value={exit.floor ?? ''}
                                maxLength={40}
                                aria-label={`出口 ${exit.code} 楼层`}
                                placeholder="如 B1"
                                onChange={(event) =>
                                  updateExit(index, {
                                    floor: event.currentTarget.value || undefined,
                                  })
                                }
                              />
                              <Input
                                value={exit.description ?? ''}
                                maxLength={300}
                                aria-label={`出口 ${exit.code} 说明`}
                                placeholder="如 朝阳街路东"
                                onChange={(event) =>
                                  updateExit(index, {
                                    description: event.currentTarget.value || undefined,
                                  })
                                }
                              />
                              <IconButton
                                variant="icon"
                                icon="delete"
                                label={`删除${exit.code || '出口'}`}
                                onClick={() => removeExit(index)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="poi-visual-panel-empty">
                        还没有出口。补上编号和说明后，模板库的出口模板会自动填上。
                      </p>
                    )}
                  </section>

                  <section className="transit-network-profile-section">
                    <label className="transit-network-profile-field">
                      <span>备注</span>
                      <Textarea
                        value={currentProfile.note ?? ''}
                        maxLength={500}
                        rows={2}
                        placeholder="站内施工、临时封闭等说明（可选）"
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateProfile(selectedNodeId, (profile) => ({
                            ...profile,
                            note: value || undefined,
                          }));
                        }}
                      />
                    </label>
                  </section>
                </div>
              </>
            ) : (
              <p className="poi-visual-panel-empty">当前线网没有可维护的车站。</p>
            )}
          </section>
        </div>

        <footer className="transit-network-profile-footer">
          <div>
            {errorMessage ? (
              <span className="form-error-text" role="alert">
                {errorMessage}
              </span>
            ) : notice ? (
              <span className="transit-network-profile-notice">{notice}</span>
            ) : !projectId ? (
              <span className="muted">示例线网 / 本机草稿为只读；保存为项目后可编辑。</span>
            ) : (
              <span className="muted">资料按车站 ID 保存；重新导入同一份线网不会丢。</span>
            )}
          </div>
          <div className="material-action-row">
            <Button variant="secondary" type="button" onClick={onClose}>
              关闭
            </Button>
            <Button type="submit" loading={saving} disabled={!projectId}>
              {saving ? '保存中…' : '保存车站资料'}
            </Button>
          </div>
        </footer>
      </Modal>
    </EditorDialogPortal>
  );
}
