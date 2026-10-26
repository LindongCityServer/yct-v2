import type { OperationsFeedItem, ServiceEntryGroup, TravelTripInstance } from '@yct/contracts';
import { faqAnswerText, type FaqItem } from './faq-content';
import type { LocalizedFaqContent } from './faq-translations';
import { filterMapMarkers, type SearchableMapMarker } from './map-marker-search';
import { matchSiteSocialLinks, type SiteSocialLink } from './site-social-links';
import type { WikiSearchResult } from './wiki-search';
import { normalizeTitleForSearch } from '../components/title-with-breaks';

export type SearchCategory = 'all' | 'operations' | 'poi' | 'schedules' | 'services' | 'wiki';

export interface ServiceSearchResult {
  entry: ServiceEntryGroup['items'][number];
  groupTitle: string;
  title: string;
  description?: string;
}

export interface FaqSearchResult {
  item: FaqItem;
  groupTitle: string;
}

export interface SearchResults {
  operations: OperationsFeedItem[];
  services: ServiceSearchResult[];
  faq: FaqSearchResult[];
  poi: SearchableMapMarker[];
  schedules: TravelTripInstance[];
  wiki: WikiSearchResult[];
  social: SiteSocialLink[];
  counts: Record<SearchCategory, number>;
  total: number;
  hasExactEntity: boolean;
  hasStrongResult: boolean;
}

interface SearchInput {
  operations: OperationsFeedItem[];
  serviceGroups: ServiceEntryGroup[];
  markers: SearchableMapMarker[];
  faqContent: LocalizedFaqContent;
  query: string;
  schedules?: TravelTripInstance[];
  wiki?: WikiSearchResult[];
}

export function buildSearchResults(input: SearchInput): SearchResults {
  const normalizedQuery = normalizeTitleForSearch(input.query.trim());
  const schedules = input.schedules ?? [];

  if (!normalizedQuery) {
    return {
      operations: [],
      services: [],
      faq: [],
      poi: [],
      schedules: [],
      wiki: [],
      social: [],
      counts: { all: 0, operations: 0, poi: 0, schedules: 0, services: 0, wiki: 0 },
      total: 0,
      hasExactEntity: false,
      hasStrongResult: false,
    };
  }

  const operations = input.operations
    .filter((item) =>
      [item.title, item.excerpt, item.categoryId, ...(item.customTags ?? []), ...(item.tags ?? [])]
        .filter(Boolean)
        .some((value) => normalizeTitleForSearch(value ?? '').includes(normalizedQuery)),
    )
    .sort((left, right) => toTime(right.publishedAt) - toTime(left.publishedAt));

  const services = input.serviceGroups.flatMap((group) =>
    group.items
      .map((entry) => {
        if (entry.id !== 'default-faq') {
          return {
            entry,
            groupTitle: group.title,
            title: entry.title,
            description: entry.description,
          };
        }

        return {
          entry,
          groupTitle: group.title,
          title: input.faqContent.serviceTitle,
          description: input.faqContent.serviceDescription,
        };
      })
      .filter(({ entry, groupTitle, title, description }) =>
        [title, description, groupTitle, entry.href]
          .filter(Boolean)
          .some((value) => normalizeTitleForSearch(value ?? '').includes(normalizedQuery)),
      ),
  );

  const faq = input.faqContent.groups.flatMap((group) =>
    group.items
      .filter((item) =>
        [item.question, faqAnswerText(item.answer), group.title, ...(item.keywords ?? [])].some(
          (value) => normalizeTitleForSearch(value).includes(normalizedQuery),
        ),
      )
      .map((item) => ({ item, groupTitle: group.title })),
  );

  const poi = filterMapMarkers(input.markers, input.query);
  const wiki = input.wiki ?? [];
  const social = matchSiteSocialLinks(input.query);
  const total =
    operations.length +
    poi.length +
    schedules.length +
    services.length +
    faq.length +
    wiki.length +
    social.length;
  const hasExactEntity = hasExactEntityMatch(input, normalizedQuery);

  return {
    operations,
    services,
    faq,
    poi,
    schedules,
    wiki,
    social,
    counts: {
      all: total,
      operations: operations.length,
      poi: poi.length,
      schedules: schedules.length,
      services: services.length + faq.length + social.length,
      wiki: wiki.length,
    },
    total,
    hasExactEntity,
    hasStrongResult: total > 0,
  };
}

function hasExactEntityMatch(input: SearchInput, normalizedQuery: string): boolean {
  const values = [
    ...input.operations.flatMap((item) => [
      item.title,
      ...(item.customTags ?? []),
      ...(item.tags ?? []),
    ]),
    ...input.markers.flatMap((marker) => [
      marker.label,
      marker.secondaryLabel,
      ...Object.values(marker.localizedLabels ?? {}),
    ]),
    ...input.serviceGroups.flatMap((group) =>
      group.items.flatMap((entry) => [entry.title, entry.href]),
    ),
    ...input.faqContent.groups.flatMap((group) =>
      group.items.flatMap((item) => [item.question, ...(item.keywords ?? [])]),
    ),
    ...(input.schedules ?? []).flatMap((trip) => [trip.lineName, trip.tripCode]),
    ...(input.wiki ?? []).map((item) => item.title),
    ...matchSiteSocialLinks(input.query).flatMap((link) => [link.label, link.labelEn]),
  ].filter((value): value is string => Boolean(value));

  return values.some((value) => normalizeTitleForSearch(value) === normalizedQuery);
}

export function formatPoiSummary(
  marker: SearchableMapMarker,
  options?: { categoryName?: string },
): string {
  return [
    options?.categoryName ?? marker.categoryId,
    marker.address,
    marker.floorLabel,
    marker.description,
    marker.openingHours,
    marker.facilities?.map((facility) => facility.description).join('、'),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function formatTripTitle(trip: TravelTripInstance): string {
  return [trip.tripCode, trip.lineName].filter(Boolean).join(' · ');
}

export function formatTripSummary(trip: TravelTripInstance): string {
  const route = [
    trip.originStationName ?? trip.stationNames[0],
    trip.destinationStationName ?? trip.stationNames.at(-1),
  ]
    .filter(Boolean)
    .join(' - ');
  const time = [trip.departureTime, trip.arrivalTime].filter(Boolean).join(' - ');
  return [trip.serviceLabel, route, time, trip.operator, trip.fareText].filter(Boolean).join(' · ');
}

function toTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
