'use client';

import type { ApiItemResponse, TicketOrderListItem } from '@yct/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { notifyTicketOrderStateChanged } from '../lib/client-ticket-orders';
import { useI18n } from '../lib/client-i18n';
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
  const { locale, t } = useI18n();
  const [statusText, setStatusText] = useState(() => t('ticketOrderDetail.loading'));
  const [isCancelling, setIsCancelling] = useState(false);

  const refreshOrder = async () => {
    setStatusText(t('ticketOrderDetail.loading'));
    try {
      const response = await fetch(
        appPath(`/api/travel/ticketing/orders/${encodeURIComponent(orderId)}`),
        { cache: 'no-store' },
      );
      const data = (await response.json()) as Partial<ApiItemResponse<TicketOrderListItem>> & {
        message?: string;
      };

      if (!response.ok || !data.item) {
        throw new Error(data.message ?? t('ticketOrderDetail.readFailed'));
      }

      setItem(data.item);
      setStatusText('');
    } catch (error) {
      setItem(null);
      setStatusText(error instanceof Error ? error.message : t('ticketOrderDetail.readFailed'));
    }
  };

  const cancelOrder = async () => {
    if (!window.confirm(t('ticketOrderDetail.cancelConfirm'))) {
      return;
    }

    setIsCancelling(true);
    setStatusText(t('ticketOrderDraft.canceling'));
    try {
      const response = await fetch(
        appPath(`/api/travel/ticketing/orders/${encodeURIComponent(orderId)}/cancel`),
        { method: 'POST' },
      );
      const data = (await response.json()) as Partial<ApiItemResponse<TicketOrderListItem>> & {
        message?: string;
      };

      if (!response.ok || !data.item) {
        throw new Error(data.message ?? t('ticketOrderDetail.cancelFailed'));
      }

      setItem(data.item);
      setStatusText(t('ticketOrderDetail.cancelDone'));
      notifyTicketOrderStateChanged();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : t('ticketOrderDetail.cancelFailed'));
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
        <h2>{statusText || t('ticketOrderDetail.unavailable')}</h2>
        <div className="settings-action-row">
          <button
            className="secondary-action-button"
            type="button"
            onClick={() => void refreshOrder()}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              refresh
            </span>
            <span>{t('ticketOrderDetail.retry')}</span>
          </button>
          <Link className="secondary-action-button" href={appPath('/account')}>
            <span className="material-symbols-outlined" aria-hidden="true">
              manage_accounts
            </span>
            <span>{t('ticketOrderDetail.backAccount')}</span>
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
          <h2 id="ticket-order-detail-title">
            {t('ticketOrderDetail.orderTitle', { id: order.orderId.slice(-8).toUpperCase() })}
          </h2>
          <p>{t('ticketOrderDetail.description')}</p>
        </div>
        <span className="ticket-order-status-badge">{formatTicketOrderStatus(order.status, t)}</span>
      </div>

      <dl className="ticket-order-detail-grid">
        <DetailItem label={t('ticketOrderDetail.field.orderId')} value={order.orderId} />
        <DetailItem
          label={t('ticketOrderDetail.field.serviceKind')}
          value={formatTicketServiceKind(order.serviceKind, t)}
        />
        <DetailItem
          label={t('ticketOrderDetail.field.passengerCount')}
          value={t('ticketOrderDraft.passengerCount', { count: order.passengerCount })}
        />
        <DetailItem label={t('ticketOrderDetail.field.tripId')} value={order.tripInstanceId} />
        <DetailItem label={t('ticketOrderDetail.field.fareProductId')} value={order.fareProductId} />
        <DetailItem label={t('ticketOrderDetail.field.createdAt')} value={formatDateTime(order.createdAt, locale)} />
        <DetailItem label={t('ticketOrderDetail.field.updatedAt')} value={formatDateTime(order.updatedAt, locale)} />
        {order.cancelledAt ? (
          <DetailItem label={t('ticketOrderDetail.field.cancelledAt')} value={formatDateTime(order.cancelledAt, locale)} />
        ) : null}
        {order.cancellationReason ? (
          <DetailItem
            label={t('ticketOrderDetail.field.cancellationReason')}
            value={formatCancellationReason(order.cancellationReason, t)}
          />
        ) : null}
      </dl>

      <section className="ticket-order-hold-panel" aria-label={t('ticketOrderDetail.hold.aria')}>
        <div className="ticket-order-subheading">
          <span className="material-symbols-outlined" aria-hidden="true">
            inventory_2
          </span>
          <h3>{t('ticketOrderDetail.hold.title')}</h3>
        </div>
        {inventoryHold ? (
          <dl className="ticket-order-detail-grid">
            <DetailItem label={t('ticketOrderDetail.hold.id')} value={inventoryHold.inventoryHoldId} />
            <DetailItem
              label={t('ticketOrderDetail.hold.status')}
              value={formatInventoryHoldStatus(inventoryHold.status, t)}
            />
            <DetailItem
              label={t('ticketOrderDetail.hold.quantity')}
              value={t('ticketOrderDetail.hold.quantityValue', { count: inventoryHold.quantity })}
            />
            <DetailItem
              label={t('ticketOrderDetail.hold.expiresAt')}
              value={formatTicketHoldExpiresAt(inventoryHold.expiresAt, locale)}
            />
            <DetailItem label={t('ticketOrderDetail.hold.poolId')} value={inventoryHold.inventoryPoolId} />
            {inventoryHold.releasedAt ? (
              <DetailItem label={t('ticketOrderDetail.hold.releasedAt')} value={formatDateTime(inventoryHold.releasedAt, locale)} />
            ) : null}
          </dl>
        ) : (
          <p className="muted">{t('ticketOrderDetail.hold.none')}</p>
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
          <span>{t('ticketOrderDetail.refresh')}</span>
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
          <span>
            {isCancelling ? t('ticketOrderDraft.canceling') : t('ticketOrderDraft.cancelDraft')}
          </span>
        </button>
        <Link className="secondary-action-button" href={appPath('/travel/schedules')}>
          <span className="material-symbols-outlined" aria-hidden="true">
            departure_board
          </span>
          <span>{t('travel.schedules.action')}</span>
        </Link>
        <Link className="secondary-action-button" href={appPath('/account')}>
          <span className="material-symbols-outlined" aria-hidden="true">
            manage_accounts
          </span>
          <span>{t('account.settings')}</span>
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

type Translate = ReturnType<typeof useI18n>['t'];

function formatDateTime(value: string, locale = 'zh-CN'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(locale, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatCancellationReason(
  reason: NonNullable<TicketOrderListItem['order']['cancellationReason']>,
  t: Translate,
): string {
  const labels: Record<NonNullable<TicketOrderListItem['order']['cancellationReason']>, string> = {
    admin_cancelled: t('ticketCancellation.adminCancelled'),
    inventory_expired: t('ticketCancellation.inventoryExpired'),
    issue_failed: t('ticketCancellation.issueFailed'),
    system: t('ticketCancellation.system'),
    user_cancelled: t('ticketCancellation.userCancelled'),
  };
  return labels[reason] ?? reason;
}

function formatInventoryHoldStatus(
  status: NonNullable<TicketOrderListItem['inventoryHold']>['status'],
  t: Translate,
): string {
  const labels: Record<NonNullable<TicketOrderListItem['inventoryHold']>['status'], string> = {
    cancelled: t('inventoryHoldStatus.cancelled'),
    confirmed: t('inventoryHoldStatus.confirmed'),
    expired: t('inventoryHoldStatus.expired'),
    held: t('inventoryHoldStatus.held'),
    released: t('inventoryHoldStatus.released'),
  };
  return labels[status] ?? status;
}
