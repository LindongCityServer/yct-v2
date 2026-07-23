import type {
  MapGeometry,
  LocalizedLabelMap,
  PoiCategory,
  TileFreshness,
  TileProviderDescriptor,
  TransitLine,
  TransitStation,
  YctProfileId,
} from './domain';
import type { LdpassClientSessionResponse } from './ldpass';

export interface TileProvider {
  id: string;
  name: string;
  describe(profileId: YctProfileId): Promise<TileProviderDescriptor>;
  getTileTemplate(profileId: YctProfileId): Promise<string>;
  getAttribution(profileId: YctProfileId): Promise<string | null>;
  getFreshness?(profileId: YctProfileId): Promise<TileFreshness>;
}

export interface MapMarkerSnapshot {
  fetchedAt: string;
  markers: Array<{
    id: string;
    label: string;
    localizedLabels?: LocalizedLabelMap;
    categoryId?: string;
    geometry: MapGeometry;
    iconFileName?: string;
    symbolIcon?: string;
    accentColor?: string;
    description?: string;
    href?: string;
    imageUrls?: string[];
    /** @deprecated 兼容旧地图数据，值应等于 imageUrls 的第一项。 */
    imageUrl?: string;
    parentLabel?: string;
    secondaryLabel?: string;
    parentMarkerId?: string;
    floorLabel?: string;
    boundRegionMarkerIds?: string[];
    openingHours?: string;
    address?: string;
    addressRoadMarkerId?: string;
    facilities?: Array<{
      symbolIcon: string;
      description: string;
    }>;
    playerLocation?: MapPlayerLocationMetadata;
  }>;
}

export interface MapPlayerLocationMetadata {
  serverAccountName: string;
  avatarUrl?: string;
  presence: 'online' | 'offline';
  isCurrentAccount: boolean;
  observedAt: string;
  lastSeenAt: string;
}

export interface MarkerProvider {
  id: string;
  name: string;
  fetchMarkers(profileId: YctProfileId): Promise<MapMarkerSnapshot>;
  fetchCategories?(profileId: YctProfileId): Promise<PoiCategory[]>;
}

export interface TransitDataProvider {
  id: string;
  name: string;
  fetchLines(profileId: YctProfileId): Promise<TransitLine[]>;
  fetchStations(profileId: YctProfileId): Promise<TransitStation[]>;
}

export interface LoginRedirectInput {
  redirectUri: string;
  state: string;
}

export interface ClientSessionInput {
  clientId: string;
  cookieHeader?: string;
}

export interface IdentityProvider {
  id: string;
  name: string;
  buildLoginUrl(input: LoginRedirectInput): Promise<string>;
  readClientSession(input: ClientSessionInput): Promise<LdpassClientSessionResponse>;
}
