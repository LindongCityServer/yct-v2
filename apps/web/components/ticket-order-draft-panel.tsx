'use client';

import type { TicketOrderListItem, TicketableServiceKind, TravelTripInstance } from '@yct/contracts';
import Link from 'next/link';
import { appPath } from '../lib/app-paths';
import { useI18n } from '../lib/client-i18n';

type TicketOrderTripLookup = Map<string, TravelTripInstance>;
type Translate = ReturnType<typeof useI18n>['t'];

export function TicketOrderDraftPanel({
  cancellingOrderId,
  orders,
  statusText,
  title,
  description,
  tripById,
  onCancel,
  onRefresh,
}: Readonly<{
  cancellingOrderId: string | null;
  orders: TicketOrderListItem[] | null;
  statusText: string;
  title?: string;
  description?: string;
  tripById?: TicketOrderTripLookup;
  onCancel: (orderId: string) => void;
  onRefresh: () => void;
}>) {
  const { locale, t } = useI18n();
  const displayTitle = title ?? t('ticketOrderDraft.title');
  const displayDescription = description ?? t('ticketOrderDraft.description');
  const visibleOrders =
    orders?.filter((item) => item.order.status === 'draft' || item.order.status === 'pending_issue') ??
    [];

  return (
    <section className="ticket-order-draft-panel" aria-label={displayTitle}>
      <div className="ticket-order-draft-heading">
        <div>
          <h3>{displayTitle}</h3>
          <span className="muted">{displayDescription}</span>
        </div>
        <button
          className="icon-action-button"
          type="button"
          aria-label={t('ticketOrderDraft.refresh')}
          onClick={onRefresh}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            refresh
          </span>
        </button>
      </div>
      {visibleOrders.length > 0 ? (
        <div className="ticket-order-draft-list">
          {visibleOrders.map((item) => (
            <article className="ticket-order-draft-item" key={item.order.orderId}>
              <div>
                <strong>{formatTicketOrderTitle(item, tripById, t)}</strong>
                <small>{formatTicketOrderSubtitle(item, tripById, t)}</small>
              </div>
              <span>
                {item.inventoryHold
                  ? t('ticketOrderDraft.holdUntil', {
                      time: formatTicketHoldExpiresAt(item.inventoryHold.expiresAt, locale),
                    })
                  : t('ticketOrderDraft.noHold')}
              </span>
              <Link
                className="secondary-action-button"
                href={appPath(`/travel/ticketing/orders/${encodeURIComponent(item.order.orderId)}`)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  receipt_long
                </span>
                <span>{t('ticketOrderDraft.details')}</span>
              </Link>
              <button
                className="secondary-action-button"
                type="button"
                disabled={cancellingOrderId === item.order.orderId}
                onClick={() => onCancel(item.order.orderId)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  cancel
                </span>
                <span>
                  {cancellingOrderId === item.order.orderId
                    ? t('ticketOrderDraft.canceling')
                    : t('ticketOrderDraft.cancelDraft')}
                </span>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="ticket-order-draft-empty">
          {orders === null ? t('ticketOrderDraft.loading') : statusText || t('ticketOrderDraft.empty')}
        </p>
      )}
      {statusText && visibleOrders.length > 0 ? (
        <p className="ticket-order-draft-status">{statusText}</p>
      ) : null}
    </section>
  );
}

export function formatTicketHoldExpiresAt(value: string, locale = 'zh-CN'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(locale, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}

function formatTicketOrderTitle(
  item: TicketOrderListItem,
  tripById: TicketOrderTripLookup | undefined,
  t?: Translate,
): string {
  const trip = tripById?.get(item.order.tripInstanceId);
  return trip
    ? formatTripHeading(trip, t)
    : t
      ? t('ticketOrderDraft.orderFallback', { id: item.order.orderId.slice(-8).toUpperCase() })
      : `订单 ${item.order.orderId.slice(-8).toUpperCase()}`;
}

function formatTicketOrderSubtitle(
  item: TicketOrderListItem,
  tripById: TicketOrderTripLookup | undefined,
  t?: Translate,
): string {
  const trip = tripById?.get(item.order.tripInstanceId);
  return [
    formatTicketServiceKind(item.order.serviceKind, t),
    trip ? formatTripEndpoints(trip, t) : undefined,
    t
      ? t('ticketOrderDraft.passengerCount', { count: item.order.passengerCount })
      : `${item.order.passengerCount}人`,
    formatTicketOrderStatus(item.order.status, t),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function formatTicketOrderStatus(
  status: TicketOrderListItem['order']['status'],
  t?: Translate,
): string {
  const labels: Record<TicketOrderListItem['order']['status'], string> = {
    cancelled: t ? t('ticketOrderStatus.cancelled') : '已取消',
    checked_in: t ? t('ticketOrderStatus.checkedIn') : '已检票',
    completed: t ? t('ticketOrderStatus.completed') : '已完成',
    draft: t ? t('ticketOrderStatus.draft') : '草稿',
    expired: t ? t('ticketOrderStatus.expired') : '已过期',
    issued: t ? t('ticketOrderStatus.issued') : '已出票',
    manual_review: t ? t('ticketOrderStatus.manualReview') : '人工审核',
    pending_issue: t ? t('ticketOrderStatus.pendingIssue') : '待出票',
    refund_requested: t ? t('ticketOrderStatus.refundRequested') : '已申请退票',
    refunded: t ? t('ticketOrderStatus.refunded') : '已退票',
  };
  return labels[status] ?? status;
}

export function formatTicketServiceKind(kind: TicketableServiceKind, t?: Translate): string {
  const labels: Record<TicketableServiceKind, string> = {
    coach: t ? t('ticketService.coach') : '客运',
    custom: t ? t('ticketService.custom') : '其他',
    ferry: t ? t('ticketService.ferry') : '轮渡',
    flight: t ? t('ticketService.flight') : '航班',
    railway: t ? t('ticketService.railway') : '铁路',
  };
  return labels[kind] ?? kind;
}

function formatTripHeading(trip: TravelTripInstance, t?: Translate): string {
  const prefix =
    trip.tripCode ??
    (t ? t('ticketOrderDraft.serviceTrip', { service: trip.serviceLabel }) : `${trip.serviceLabel}班次`);
  return trip.lineName ? `${prefix} - ${trip.lineName}` : prefix;
}

function formatTripEndpoints(trip: TravelTripInstance, t?: Translate): string {
  const first = trip.originStationName ?? trip.stationNames[0];
  const last = trip.destinationStationName ?? trip.stationNames[trip.stationNames.length - 1];
  const endpoints =
    first && last
      ? `${first} - ${last}`
      : t
        ? t('ticketOrderDraft.stopCount', { count: trip.stationNames.length })
        : `${trip.stationNames.length} 站`;
  return trip.routeNote ? `${endpoints} · ${trip.routeNote}` : endpoints;
}
