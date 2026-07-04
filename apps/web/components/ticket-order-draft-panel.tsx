'use client';

import type { TicketOrderListItem, TicketableServiceKind, TravelTripInstance } from '@yct/contracts';
import Link from 'next/link';
import { appPath } from '../lib/app-paths';

type TicketOrderTripLookup = Map<string, TravelTripInstance>;

export function TicketOrderDraftPanel({
  cancellingOrderId,
  orders,
  statusText,
  title = '我的票务草稿',
  description = '仅显示占座中的草稿订单，不代表已出票。',
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
  const visibleOrders =
    orders?.filter((item) => item.order.status === 'draft' || item.order.status === 'pending_issue') ??
    [];

  return (
    <section className="ticket-order-draft-panel" aria-label={title}>
      <div className="ticket-order-draft-heading">
        <div>
          <h3>{title}</h3>
          <span className="muted">{description}</span>
        </div>
        <button className="icon-action-button" type="button" aria-label="刷新订单草稿" onClick={onRefresh}>
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
                <strong>{formatTicketOrderTitle(item, tripById)}</strong>
                <small>{formatTicketOrderSubtitle(item, tripById)}</small>
              </div>
              <span>
                {item.inventoryHold
                  ? `占用至 ${formatTicketHoldExpiresAt(item.inventoryHold.expiresAt)}`
                  : '无库存占用'}
              </span>
              <Link
                className="secondary-action-button"
                href={appPath(`/travel/ticketing/orders/${encodeURIComponent(item.order.orderId)}`)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  receipt_long
                </span>
                <span>详情</span>
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
                <span>{cancellingOrderId === item.order.orderId ? '取消中' : '取消草稿'}</span>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="ticket-order-draft-empty">
          {orders === null ? '正在读取订单草稿' : statusText || '暂无订单草稿。'}
        </p>
      )}
      {statusText && visibleOrders.length > 0 ? (
        <p className="ticket-order-draft-status">{statusText}</p>
      ) : null}
    </section>
  );
}

export function formatTicketHoldExpiresAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}

function formatTicketOrderTitle(
  item: TicketOrderListItem,
  tripById: TicketOrderTripLookup | undefined,
): string {
  const trip = tripById?.get(item.order.tripInstanceId);
  return trip ? formatTripHeading(trip) : `订单 ${item.order.orderId.slice(-8).toUpperCase()}`;
}

function formatTicketOrderSubtitle(
  item: TicketOrderListItem,
  tripById: TicketOrderTripLookup | undefined,
): string {
  const trip = tripById?.get(item.order.tripInstanceId);
  return [
    formatTicketServiceKind(item.order.serviceKind),
    trip ? formatTripEndpoints(trip) : undefined,
    `${item.order.passengerCount}人`,
    formatTicketOrderStatus(item.order.status),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function formatTicketOrderStatus(status: TicketOrderListItem['order']['status']): string {
  const labels: Record<TicketOrderListItem['order']['status'], string> = {
    cancelled: '已取消',
    checked_in: '已检票',
    completed: '已完成',
    draft: '草稿',
    expired: '已过期',
    issued: '已出票',
    manual_review: '人工审核',
    pending_issue: '待出票',
    refund_requested: '已申请退票',
    refunded: '已退票',
  };
  return labels[status] ?? status;
}

export function formatTicketServiceKind(kind: TicketableServiceKind): string {
  const labels: Record<TicketableServiceKind, string> = {
    coach: '客运',
    custom: '其他',
    ferry: '轮渡',
    flight: '航班',
    railway: '铁路',
  };
  return labels[kind] ?? kind;
}

function formatTripHeading(trip: TravelTripInstance): string {
  const prefix = trip.tripCode ?? `${trip.serviceLabel}班次`;
  return trip.lineName ? `${prefix} - ${trip.lineName}` : prefix;
}

function formatTripEndpoints(trip: TravelTripInstance): string {
  const first = trip.originStationName ?? trip.stationNames[0];
  const last = trip.destinationStationName ?? trip.stationNames[trip.stationNames.length - 1];
  const endpoints = first && last ? `${first} - ${last}` : `${trip.stationNames.length} 站`;
  return trip.routeNote ? `${endpoints} · ${trip.routeNote}` : endpoints;
}
