'use client';

export const ticketOrderStateChangedEventName = 'yct-ticket-orders-changed';

export function notifyTicketOrderStateChanged(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(ticketOrderStateChangedEventName));
}
