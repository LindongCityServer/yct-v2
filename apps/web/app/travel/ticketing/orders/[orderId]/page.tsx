import { SecondaryShell } from '../../../../../components/app-shell';
import { TicketOrderDetailPanel } from '../../../../../components/ticket-order-detail-panel';
import { getPageMetadata } from '../../../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('ticketOrder');
}

export default async function TicketOrderDetailPage({
  params,
}: Readonly<{
  params: Promise<{ orderId: string }>;
}>) {
  const { orderId } = await params;

  return (
    <SecondaryShell title="票务订单" titleKey="page.ticketOrder" backHref="/account">
      <TicketOrderDetailPanel orderId={decodeSegment(orderId)} />
    </SecondaryShell>
  );
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
