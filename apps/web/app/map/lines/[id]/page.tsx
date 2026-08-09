import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { SecondaryShell } from '../../../../components/app-shell';
import { AdminEditLink } from '../../../../components/admin-edit-link';
import { TransitLineDetailPanel } from '../../../../components/transit-line-detail-panel';
import { readTransitOverview } from '../../../../lib/transit-data';
import { readTransitStationDetails } from '../../../../lib/transit-station-details';
import { createPageMetadata, resolveRequestLocale } from '../../../../lib/site-metadata';

export const dynamic = 'force-dynamic';

type MapTransitLineDetailPageProps = Readonly<{
  params: Promise<{ id: string }>;
}>;

const readTransitOverviewForPage = cache(readTransitOverview);

export async function generateMetadata({
  params,
}: MapTransitLineDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const decodedId = decodeSegment(id);
  const locale = await resolveRequestLocale();
  const overview = await readTransitOverviewForPage();
  const line = overview.lines.find((item) => item.id === decodedId);

  if (!line) {
    return createPageMetadata({
      title: locale === 'en' ? 'Transit Line' : locale === 'zh-Hant' ? '線路詳情' : '线路详情',
      description:
        locale === 'en'
          ? 'View transit line routes, stops, and service information in Yuchengtong.'
          : locale === 'zh-Hant'
            ? '查看雨城通公共交通線路的走向、停靠車站與營運資訊。'
            : '查看雨城通公共交通线路的走向、停靠站点与运营信息。',
      locale,
      noIndex: true,
    });
  }

  const lineName = (locale === 'zh-CN' ? undefined : line.localizedName?.[locale]) ?? line.name;
  return createPageMetadata({
    title: lineName,
    description:
      locale === 'en'
        ? `View the ${lineName} route, its ${line.stationCount} stops, and service information in Yuchengtong.`
        : locale === 'zh-Hant'
          ? `在雨城通查看${lineName}的線路走向、${line.stationCount}個停靠車站及營運資訊。`
          : `在雨城通查看${lineName}的线路走向、${line.stationCount}个停靠站点及运营信息。`,
    locale,
  });
}

export default async function MapTransitLineDetailPage({ params }: MapTransitLineDetailPageProps) {
  const { id } = await params;
  const decodedId = decodeSegment(id);
  const [overview, stationDetails] = await Promise.all([
    readTransitOverviewForPage(),
    readTransitStationDetails(),
  ]);
  const line = overview.lines.find((item) => item.id === decodedId);

  if (!line) {
    notFound();
  }

  return (
    <SecondaryShell
      title={line.name}
      backHref="/map"
      secondaryActions={
        <AdminEditLink
          href={`/admin/transit?section=lines&lineId=${encodeURIComponent(line.id)}`}
          label="编辑线路"
        />
      }
    >
      <TransitLineDetailPanel
        line={line}
        modeProfiles={overview.modeProfiles}
        stationDetails={stationDetails.items.filter((detail) => detail.lineName === line.name)}
      />
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
