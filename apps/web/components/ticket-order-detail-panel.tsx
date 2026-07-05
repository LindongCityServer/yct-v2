'use client';

import type { ApiItemResponse, TicketOrderListItem } from '@yct/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { notifyTicketOrderStateChanged } from '../lib/client-ticket-orders';
import {
  formatTicketHoldExpiresAt,
  formatTicketOrderStatus,
  formatTicketServiceKind,
} from './ticket-order-draft-panel';

export function TicketOrderDetailPanel({
  orderId,
}: Readonly<{
  orderId: string;
}>) {
  const [item, setItem] = useState<TicketOrderListItem | null>(null);
  const [statusText, setStatusText] = useState('正在读取订单详情');
  const [isCancelling, setIsCancelling] = useState(false);

  const refreshOrder = async () => {
    setStatusText('正在读取订单详情');
    try {
      const response = await fetch(
        appPath(`/api/travel/ticketing/orders/${encodeURIComponent(orderId)}`),
        { cache: 'no-store' },
      );
      const data = (await response.json()) as Partial<ApiItemResponse<TicketOrderListItem>> & {
        message?: string;
      };

      if (!response.ok || !data.item) {
        throw new Error(data.message ?? '订单详情读取失败');
      }

      setItem(data.item);
      setStatusText('');
    } catch (error) {
      setItem(null);
      setStatusText(error instanceof Error ? error.message : '订单详情读取失败');
    }
  };

  const cancelOrder = async () => {
    if (!window.confirm('要取消这个订单草稿并释放库存占用吗？')) {
      return;
    }

    setIsCancelling(true);
    setStatusText('正在取消订单草稿');
    try {
      const response = await fetch(
        appPath(`/api/travel/ticketing/orders/${encodeURIComponent(orderId)}/cancel`),
        { method: 'POST' },
      );
      const data = (await response.json()) as Partial<ApiItemResponse<TicketOrderListItem>> & {
        message?: string;
      };

      if (!response.ok || !data.item) {
        throw new Error(data.message ?? '订单草稿取消失败');
      }

      setItem(data.item);
      setStatusText('已取消订单草稿');
      notifyTicketOrderStateChanged();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '订单草稿取消失败');
    } finally {
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    void refreshOrder();
  }, [orderId]);

  if (!item) {
    return (
      <section className="ticket-order-detail-panel empty-state" aria-live="polite">
        <span className="material-symbols-outlined" aria-hidden="true">
          receipt_long
        </span>
        <h2>{statusText || '订单详情暂不可用'}</h2>
        <div className="settings-action-row">
          <button
            className="secondary-action-button"
            type="button"
            onClick={() => void refreshOrder()}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              refresh
            </span>
            <span>重新读取</span>
          </button>
          <Link className="secondary-action-button" href={appPath('/account')}>
            <span className="material-symbols-outlined" aria-hidden="true">
              manage_accounts
            </span>
            <span>返回账号</span>
          </Link>
        </div>
      </section>
    );
  }

  const { order, inventoryHold } = item;
  const canCancel = order.status === 'draft' || order.status === 'pending_issue';

  return (
    <section className="ticket-order-detail-panel" aria-labelledby="ticket-order-detail-title">
      <div className="ticket-order-detail-hero">
        <span className="material-symbols-outlined ticket-order-detail-icon" aria-hidden="true">
          receipt_long
        </span>
        <div>
          <h2 id="ticket-order-detail-title">订单 {order.orderId.slice(-8).toUpperCase()}</h2>
          <p>这里展示服务端订单草稿和占座状态，不代表已出票或可核销凭证。</p>
        </div>
        <span className="ticket-order-status-badge">{formatTicketOrderStatus(order.status)}</span>
      </div>

      <dl className="ticket-order-detail-grid">
        <DetailItem label="订单 ID" value={order.orderId} />
        <DetailItem label="服务类型" value={formatTicketServiceKind(order.serviceKind)} />
        <DetailItem label="乘车人数" value={`${order.passengerCount} 人`} />
        <DetailItem label="班次 ID" value={order.tripInstanceId} />
        <DetailItem label="票种 ID" value={order.fareProductId} />
        <DetailItem label="创建时间" value={formatDateTime(order.createdAt)} />
        <DetailItem label="更新时间" value={formatDateTime(order.updatedAt)} />
        {order.cancelledAt ? (
          <DetailItem label="取消时间" value={formatDateTime(order.cancelledAt)} />
        ) : null}
        {order.cancellationReason ? (
          <DetailItem label="取消原因" value={formatCancellationReason(order.cancellationReason)} />
        ) : null}
      </dl>

      <section className="ticket-order-hold-panel" aria-label="库存占用">
        <div className="ticket-order-subheading">
          <span className="material-symbols-outlined" aria-hidden="true">
            inventory_2
          </span>
          <h3>库存占用</h3>
        </div>
        {inventoryHold ? (
          <dl className="ticket-order-detail-grid">
            <DetailItem label="占用 ID" value={inventoryHold.inventoryHoldId} />
            <DetailItem label="占用状态" value={formatInventoryHoldStatus(inventoryHold.status)} />
            <DetailItem label="占用数量" value={`${inventoryHold.quantity} 张`} />
            <DetailItem label="占用到期" value={formatTicketHoldExpiresAt(inventoryHold.expiresAt)} />
            <DetailItem label="库存池 ID" value={inventoryHold.inventoryPoolId} />
            {inventoryHold.releasedAt ? (
              <DetailItem label="释放时间" value={formatDateTime(inventoryHold.releasedAt)} />
            ) : null}
          </dl>
        ) : (
          <p className="muted">当前订单没有库存占用记录。</p>
        )}
      </section>

      <div className="settings-action-row">
        <button
          className="secondary-action-button"
          type="button"
          onClick={() => void refreshOrder()}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            refresh
          </span>
          <span>刷新状态</span>
        </button>
        <button
          className="secondary-action-button"
          type="button"
          disabled={!canCancel || isCancelling}
          onClick={() => void cancelOrder()}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            cancel
          </span>
          <span>{isCancelling ? '取消中' : '取消草稿'}</span>
        </button>
        <Link className="secondary-action-button" href={appPath('/travel/schedules')}>
          <span className="material-symbols-outlined" aria-hidden="true">
            departure_board
          </span>
          <span>查询班次</span>
        </Link>
        <Link className="secondary-action-button" href={appPath('/account')}>
          <span className="material-symbols-outlined" aria-hidden="true">
            manage_accounts
          </span>
          <span>账号设置</span>
        </Link>
      </div>

      {statusText ? <p className="ticket-order-detail-status">{statusText}</p> : null}
    </section>
  );
}

function DetailItem({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatCancellationReason(
  reason: NonNullable<TicketOrderListItem['order']['cancellationReason']>,
): string {
  const labels: Record<NonNullable<TicketOrderListItem['order']['cancellationReason']>, string> = {
    admin_cancelled: '管理员取消',
    inventory_expired: '占座过期',
    issue_failed: '出票失败',
    system: '系统取消',
    user_cancelled: '用户取消',
  };
  return labels[reason] ?? reason;
}

function formatInventoryHoldStatus(
  status: NonNullable<TicketOrderListItem['inventoryHold']>['status'],
): string {
  const labels: Record<NonNullable<TicketOrderListItem['inventoryHold']>['status'], string> = {
    cancelled: '已取消',
    confirmed: '已确认',
    expired: '已过期',
    held: '占用中',
    released: '已释放',
  };
  return labels[status] ?? status;
}
