import type { ApiMeta } from './api';
import type { ISODateTimeString, LocaleCode } from './domain';

export type PublicApiVersion = 'v1';

export interface PublicApiMeta extends ApiMeta {
  apiVersion: PublicApiVersion;
  locale: LocaleCode;
  timezone: 'Asia/Shanghai';
  asOf?: ISODateTimeString;
  canonicalUrl?: string;
}

export interface PublicApiListResponse<TItem> {
  data: TItem[];
  meta: PublicApiMeta;
}

export interface PublicApiItemResponse<TItem> {
  data?: TItem;
  meta: PublicApiMeta;
}
