import type { ApiMeta, DataSourceStatus } from '@yct/contracts';

export function createApiMeta(sourceStatus: DataSourceStatus, message?: string): ApiMeta {
  return {
    generatedAt: new Date().toISOString(),
    sourceStatus,
    message,
  };
}
