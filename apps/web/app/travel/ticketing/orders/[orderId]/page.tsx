import { SecondaryShell } from '../../../../../components/app-shell';
import { TicketOrderDetailPanel } from '../../../../../components/ticket-order-detail-panel';

export const dynamic = 'force-dynamic';

export default async function TicketOrderDetailPage({
  params,
}: Readonly<{
  params: Promise<{ orderId: string }>;
}>) {
  const { orderId } = await params;

  return (
    <SecondaryShell title="票务订单" backHref="/account">
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
