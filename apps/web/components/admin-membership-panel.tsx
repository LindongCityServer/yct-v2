'use client';

import type { YctAdminMembership, YctAdminRole, YctUserLink } from '@yct/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

interface AdminMembershipDirectory {
  memberships: YctAdminMembership[];
  users: YctUserLink[];
  message?: string;
}

export function AdminMembershipPanel() {
  const [directory, setDirectory] = useState<AdminMembershipDirectory | null>(null);
  const [query, setQuery] = useState('');
  const [statusText, setStatusText] = useState('正在读取管理员成员');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(appPath('/api/admin/memberships'), { cache: 'no-store' });
      const data = (await response.json()) as AdminMembershipDirectory;
      if (!response.ok) {
        setDirectory(null);
        setStatusText(data.message ?? '管理员成员暂不可用');
        return;
      }
      setDirectory(data);
      setStatusText(`共 ${data.users.length} 位已登录雨城通用户`);
    } catch {
      setDirectory(null);
      setStatusText('管理员成员暂不可用');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const membershipByUserId = useMemo(
    () => new Map(directory?.memberships.map((item) => [item.ldpassUserId, item]) ?? []),
    [directory],
  );
  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    const users = directory?.users ?? [];
    if (!normalized) {
      return users;
    }
    return users.filter((user) =>
      [user.usernameSnapshot, user.emailSnapshot, user.ldpassUserId]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('zh-CN').includes(normalized)),
    );
  }, [directory, query]);

  const updateMembership = async (
    user: YctUserLink,
    role: YctAdminRole,
    status: YctAdminMembership['status'],
  ) => {
    setBusyUserId(user.ldpassUserId);
    setStatusText(`正在更新 ${user.usernameSnapshot} 的权限`);
    try {
      const response = await fetch(appPath('/api/admin/memberships'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ldpassUserId: user.ldpassUserId, role, status }),
      });
      const data = (await response.json()) as YctAdminMembership & { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '管理员权限更新失败');
        return;
      }
      setDirectory((current) =>
        current
          ? {
              ...current,
              memberships: current.memberships.some((item) => item.id === data.id)
                ? current.memberships.map((item) => (item.id === data.id ? data : item))
                : [...current.memberships, data],
            }
          : current,
      );
      setStatusText(
        data.status === 'active'
          ? `已授予 ${user.usernameSnapshot} ${formatRole(data.role)}权限`
          : `已停用 ${user.usernameSnapshot} 的本地管理员权限`,
      );
    } catch {
      setStatusText('管理员权限更新失败');
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <section
      className="module-panel admin-membership-panel"
      aria-labelledby="admin-membership-title"
    >
      <div className="section-heading">
        <div>
          <h1 id="admin-membership-title">管理员成员</h1>
          <span className="muted">仅显示至少登录过一次雨城通的真实用户。</span>
        </div>
        <span className="muted" role="status">
          {statusText}
        </span>
      </div>
      {directory ? (
        <>
          <label className="admin-membership-search">
            <span className="material-symbols-outlined" aria-hidden="true">
              search
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="搜索用户名、邮箱或用户 ID"
            />
          </label>
          <div className="admin-membership-list">
            {filteredUsers.map((user) => {
              const membership = membershipByUserId.get(user.ldpassUserId);
              const role = membership?.role ?? 'admin';
              const isBusy = busyUserId === user.ldpassUserId;
              return (
                <div className="admin-membership-row" key={user.id}>
                  <div className="admin-membership-identity">
                    <strong>{user.usernameSnapshot}</strong>
                    <span>{user.emailSnapshot ?? user.ldpassUserId}</span>
                    <small>
                      {user.serverAccountVerifiedSnapshot ? '服务器账号已验证' : '未验证服务器账号'}
                    </small>
                  </div>
                  <select
                    aria-label={`${user.usernameSnapshot} 的管理员角色`}
                    disabled={isBusy}
                    value={role}
                    onChange={(event) =>
                      void updateMembership(
                        user,
                        event.currentTarget.value as YctAdminRole,
                        membership?.status ?? 'active',
                      )
                    }
                  >
                    <option value="admin">管理员</option>
                    <option value="super_admin">超级管理员</option>
                  </select>
                  <button
                    className={membership?.status === 'active' ? 'is-danger' : 'is-primary'}
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void updateMembership(
                        user,
                        role,
                        membership?.status === 'active' ? 'suspended' : 'active',
                      )
                    }
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {membership?.status === 'active' ? 'person_remove' : 'person_add'}
                    </span>
                    <span>{membership?.status === 'active' ? '停用' : '授权'}</span>
                  </button>
                </div>
              );
            })}
          </div>
          {filteredUsers.length === 0 ? <p className="muted">没有符合条件的用户。</p> : null}
        </>
      ) : null}
    </section>
  );
}

function formatRole(role: YctAdminRole): string {
  return role === 'super_admin' ? '超级管理员' : '管理员';
}
