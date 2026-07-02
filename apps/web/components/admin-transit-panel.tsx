'use client';

import type {
  TransitDataRevision,
  TransitDataRevisionStatus,
  TransitModeProfile,
  TravelScheduleServiceProfile,
} from '@yct/contracts';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

export function AdminTransitPanel() {
  const [revisions, setRevisions] = useState<TransitDataRevision[]>([]);
  const [modeProfiles, setModeProfiles] = useState<TransitModeProfile[]>([]);
  const [serviceProfiles, setServiceProfiles] = useState<TravelScheduleServiceProfile[]>([]);
  const [statusText, setStatusText] = useState('正在读取交通数据版本');
  const [profileStatusText, setProfileStatusText] = useState('正在读取交通方式配置');
  const [serviceProfileStatusText, setServiceProfileStatusText] =
    useState('正在读取可排班服务配置');
  const [isBusy, setIsBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [serviceProfileBusy, setServiceProfileBusy] = useState(false);

  const sortedRevisions = useMemo(
    () => [...revisions].sort((left, right) => right.importedAt.localeCompare(left.importedAt)),
    [revisions],
  );

  const loadRevisions = async () => {
    const response = await fetch(appPath('/api/admin/transit/datasets'), { cache: 'no-store' });
    const data = (await response.json()) as { items?: TransitDataRevision[]; message?: string };
    if (!response.ok) {
      setStatusText(data.message ?? '交通数据后台暂不可用');
      return;
    }

    setRevisions(data.items ?? []);
    setStatusText(
      data.items?.length ? `已读取 ${data.items.length} 个交通数据版本` : '暂无交通数据版本',
    );
  };

  useEffect(() => {
    void Promise.all([loadRevisions(), loadModeProfiles(), loadServiceProfiles()]);
  }, []);

  const loadModeProfiles = async () => {
    const response = await fetch(appPath('/api/admin/transit/mode-profiles'), {
      cache: 'no-store',
    });
    const data = (await response.json()) as { items?: TransitModeProfile[]; message?: string };
    if (!response.ok) {
      setProfileStatusText(data.message ?? '交通方式配置暂不可用');
      return;
    }

    setModeProfiles(data.items ?? []);
    setProfileStatusText(
      data.items?.length ? `已读取 ${data.items.length} 个交通方式` : '暂无交通方式配置',
    );
  };

  const loadServiceProfiles = async () => {
    const response = await fetch(appPath('/api/admin/travel/service-profiles'), {
      cache: 'no-store',
    });
    const data = (await response.json()) as {
      items?: TravelScheduleServiceProfile[];
      message?: string;
    };
    if (!response.ok) {
      setServiceProfileStatusText(data.message ?? '可排班服务配置暂不可用');
      return;
    }

    setServiceProfiles(data.items ?? []);
    setServiceProfileStatusText(
      data.items?.length ? `已读取 ${data.items.length} 个可排班服务` : '暂无可排班服务配置',
    );
  };

  const importLatest = async () => {
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/transit/datasets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceProviderId: 'legacy-yct',
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '导入交通数据失败');
        return;
      }

      setStatusText('已从旧站导入最新交通数据');
      await loadRevisions();
    } finally {
      setIsBusy(false);
    }
  };

  const runAction = async (
    revisionId: string,
    action: 'submit' | 'approve' | 'reject' | 'publish',
  ) => {
    setIsBusy(true);
    try {
      const endpoint =
        action === 'submit'
          ? appPath(`/api/admin/transit/datasets/${encodeURIComponent(revisionId)}/submit`)
          : action === 'publish'
            ? appPath(`/api/admin/transit/datasets/${encodeURIComponent(revisionId)}/publish`)
            : appPath(`/api/admin/transit/datasets/${encodeURIComponent(revisionId)}/review`);
      const body =
        action === 'approve'
          ? { decision: 'approved' }
          : action === 'reject'
            ? { decision: 'rejected', reason: '后台退回' }
            : {};
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '操作失败');
        return;
      }

      setStatusText('操作已完成');
      await loadRevisions();
    } finally {
      setIsBusy(false);
    }
  };

  const updateModeProfileDraft = (
    mode: TransitModeProfile['mode'],
    patch: Partial<TransitModeProfile>,
  ) => {
    setModeProfiles((current) =>
      current.map((profile) => (profile.mode === mode ? { ...profile, ...patch } : profile)),
    );
  };

  const updateServiceProfileDraft = (
    kind: TravelScheduleServiceProfile['kind'],
    patch: Partial<TravelScheduleServiceProfile>,
  ) => {
    setServiceProfiles((current) =>
      current.map((profile) => (profile.kind === kind ? { ...profile, ...patch } : profile)),
    );
  };

  const saveModeProfiles = async () => {
    setProfileBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/transit/mode-profiles'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modes: modeProfiles.map(({ mode, label, color, icon, sortOrder, enabled }) => ({
            mode,
            label,
            color,
            icon,
            sortOrder,
            enabled,
          })),
        }),
      });
      const data = (await response.json()) as { items?: TransitModeProfile[]; message?: string };
      if (!response.ok) {
        setProfileStatusText(data.message ?? '保存交通方式配置失败');
        return;
      }

      setModeProfiles(data.items ?? []);
      setProfileStatusText('交通方式配置已保存');
    } finally {
      setProfileBusy(false);
    }
  };

  const saveServiceProfiles = async () => {
    setServiceProfileBusy(true);
    try {
      const response = await fetch(appPath('/api/admin/travel/service-profiles'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          services: serviceProfiles.map(({ kind, label, color, icon, sortOrder, enabled }) => ({
            kind,
            label,
            color,
            icon,
            sortOrder,
            enabled,
          })),
        }),
      });
      const data = (await response.json()) as {
        items?: TravelScheduleServiceProfile[];
        message?: string;
      };
      if (!response.ok) {
        setServiceProfileStatusText(data.message ?? '保存可排班服务配置失败');
        return;
      }

      setServiceProfiles(data.items ?? []);
      setServiceProfileStatusText('可排班服务配置已保存');
    } finally {
      setServiceProfileBusy(false);
    }
  };

  return (
    <section className="module-panel admin-operations-panel" aria-labelledby="admin-transit-title">
      <div className="section-heading">
        <h1 id="admin-transit-title">线路数据管理</h1>
        <span className="muted">{statusText}</span>
      </div>

      <div className="admin-toolbar">
        <button
          className="secondary-action-button is-primary"
          type="button"
          disabled={isBusy}
          onClick={importLatest}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            download
          </span>
          <span>从旧站导入最新线路</span>
        </button>
      </div>

      <section className="transit-mode-profile-editor" aria-labelledby="transit-mode-profile-title">
        <div className="section-heading">
          <h2 id="transit-mode-profile-title">交通方式配置</h2>
          <span className="muted">{profileStatusText}</span>
        </div>
        <div className="transit-mode-profile-grid" aria-label="交通方式颜色、图标和排序">
          {modeProfiles.map((profile) => (
            <article className="transit-mode-profile-item" key={profile.mode}>
              <div className="transit-mode-profile-preview">
                <span
                  className="material-symbols-outlined"
                  style={{ color: profile.color }}
                  aria-hidden="true"
                >
                  {profile.icon}
                </span>
                <strong>{profile.label}</strong>
              </div>
              <label>
                名称
                <input
                  type="text"
                  value={profile.label}
                  maxLength={40}
                  onChange={(event) =>
                    updateModeProfileDraft(profile.mode, { label: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                颜色
                <input
                  type="color"
                  value={profile.color}
                  onChange={(event) =>
                    updateModeProfileDraft(profile.mode, { color: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                图标
                <input
                  type="text"
                  value={profile.icon}
                  maxLength={80}
                  onChange={(event) =>
                    updateModeProfileDraft(profile.mode, { icon: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                排序
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={profile.sortOrder}
                  onChange={(event) =>
                    updateModeProfileDraft(profile.mode, {
                      sortOrder: Number(event.currentTarget.value),
                    })
                  }
                />
              </label>
              <label className="transit-mode-profile-toggle">
                <input
                  type="checkbox"
                  checked={profile.enabled}
                  onChange={(event) =>
                    updateModeProfileDraft(profile.mode, { enabled: event.currentTarget.checked })
                  }
                />
                <span>启用</span>
              </label>
            </article>
          ))}
        </div>
        <div className="admin-toolbar">
          <button
            className="secondary-action-button is-primary"
            type="button"
            disabled={profileBusy || modeProfiles.length === 0}
            onClick={saveModeProfiles}
          >
            保存交通方式配置
          </button>
        </div>
      </section>

      <section
        className="transit-mode-profile-editor"
        aria-labelledby="travel-service-profile-title"
      >
        <div className="section-heading">
          <h2 id="travel-service-profile-title">可排班服务配置</h2>
          <span className="muted">{serviceProfileStatusText}</span>
        </div>
        <div className="transit-mode-profile-grid" aria-label="可排班服务颜色、图标和排序">
          {serviceProfiles.map((profile) => (
            <article className="transit-mode-profile-item" key={profile.kind}>
              <div className="transit-mode-profile-preview">
                <span
                  className="material-symbols-outlined"
                  style={{ color: profile.color }}
                  aria-hidden="true"
                >
                  {profile.icon}
                </span>
                <strong>{profile.label}</strong>
              </div>
              <label>
                名称
                <input
                  type="text"
                  value={profile.label}
                  maxLength={40}
                  onChange={(event) =>
                    updateServiceProfileDraft(profile.kind, { label: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                颜色
                <input
                  type="color"
                  value={profile.color}
                  onChange={(event) =>
                    updateServiceProfileDraft(profile.kind, { color: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                图标
                <input
                  type="text"
                  value={profile.icon}
                  maxLength={80}
                  onChange={(event) =>
                    updateServiceProfileDraft(profile.kind, { icon: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                排序
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={profile.sortOrder}
                  onChange={(event) =>
                    updateServiceProfileDraft(profile.kind, {
                      sortOrder: Number(event.currentTarget.value),
                    })
                  }
                />
              </label>
              <label className="transit-mode-profile-toggle">
                <input
                  type="checkbox"
                  checked={profile.enabled}
                  onChange={(event) =>
                    updateServiceProfileDraft(profile.kind, {
                      enabled: event.currentTarget.checked,
                    })
                  }
                />
                <span>启用</span>
              </label>
            </article>
          ))}
        </div>
        <div className="admin-toolbar">
          <button
            className="secondary-action-button is-primary"
            type="button"
            disabled={serviceProfileBusy || serviceProfiles.length === 0}
            onClick={saveServiceProfiles}
          >
            保存可排班服务配置
          </button>
        </div>
      </section>

      <div className="admin-content-list" aria-label="交通数据版本">
        {sortedRevisions.map((revision) => (
          <article className="admin-content-item transit-revision-item" key={revision.revisionId}>
            <div>
              <strong>{revision.revisionId}</strong>
              <p className="muted">
                {statusLabel(revision.status)} · {formatSummary(revision)} ·{' '}
                {formatDate(revision.importedAt)}
              </p>
              <div className="transit-revision-summary" aria-label="版本摘要">
                {revision.summary.map((item) => (
                  <span key={item.mode}>
                    {item.label} {item.lineCount} 线 / {item.stationCount} 站
                  </span>
                ))}
              </div>
              <div className="transit-revision-validation" aria-label="校验结果">
                <span>错误 {revision.validation.errorCount}</span>
                <span>提醒 {revision.validation.warningCount}</span>
                {[...revision.validation.errors, ...revision.validation.warnings]
                  .slice(0, 3)
                  .map((message) => (
                    <span key={message}>{message}</span>
                  ))}
              </div>
              <div className="transit-revision-preview" aria-label="线路预览">
                {revision.lines.slice(0, 6).map((line) => (
                  <span key={line.sourceId}>{line.name}</span>
                ))}
              </div>
              <p className="muted">来源：{revision.sourceFiles.join('、')}</p>
            </div>
            <div className="admin-content-actions">
              <button
                type="button"
                disabled={isBusy || revision.status !== 'imported'}
                onClick={() => runAction(revision.revisionId, 'submit')}
              >
                提交
              </button>
              <button
                type="button"
                disabled={isBusy || revision.status !== 'pending_review'}
                onClick={() => runAction(revision.revisionId, 'approve')}
              >
                通过
              </button>
              <button
                type="button"
                disabled={isBusy || revision.status !== 'pending_review'}
                onClick={() => runAction(revision.revisionId, 'reject')}
              >
                驳回
              </button>
              <button
                type="button"
                disabled={isBusy || revision.status !== 'approved'}
                onClick={() => runAction(revision.revisionId, 'publish')}
              >
                发布
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatSummary(revision: TransitDataRevision): string {
  const lineCount = revision.summary.reduce((total, item) => total + item.lineCount, 0);
  const stationCount = revision.summary.reduce((total, item) => total + item.stationCount, 0);
  return `${lineCount} 条线路 / ${stationCount} 个站点`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(status: TransitDataRevisionStatus): string {
  const labels: Record<TransitDataRevisionStatus, string> = {
    imported: '已导入',
    validation_failed: '校验失败',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    published: '已发布',
    superseded: '已被替换',
    archived: '已归档',
  };

  return labels[status];
}
