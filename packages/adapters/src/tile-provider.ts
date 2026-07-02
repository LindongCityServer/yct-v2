import type {
  TileFreshness,
  TileProvider,
  TileProviderDescriptor,
  YctProfileId,
} from '@yct/contracts';

export interface StaticTileProviderConfig extends TileProviderDescriptor {
  profileIds?: YctProfileId[];
}

export function createStaticTileProvider(config: StaticTileProviderConfig): TileProvider {
  return {
    id: config.id,
    name: config.name,
    async describe() {
      return {
        id: config.id,
        name: config.name,
        sourceKind: config.sourceKind,
        tileTemplate: config.tileTemplate,
        attribution: config.attribution,
        freshness: config.freshness,
      };
    },
    async getTileTemplate() {
      return config.tileTemplate;
    },
    async getAttribution() {
      return config.attribution ?? null;
    },
    async getFreshness(): Promise<TileFreshness> {
      return config.freshness ?? {};
    },
  };
}

export interface TileProviderSelectionInput {
  preferFreshTiles: boolean;
  pageProtocol: 'http:' | 'https:';
  freshHttpProvider?: TileProviderDescriptor;
  safeHttpsStaticProvider?: TileProviderDescriptor;
}

export function selectTileProviderDescriptor(
  input: TileProviderSelectionInput,
): TileProviderDescriptor | null {
  if (input.pageProtocol === 'https:' && input.safeHttpsStaticProvider) {
    return input.safeHttpsStaticProvider;
  }

  if (input.preferFreshTiles && input.freshHttpProvider) {
    return input.freshHttpProvider;
  }

  return input.safeHttpsStaticProvider ?? input.freshHttpProvider ?? null;
}
