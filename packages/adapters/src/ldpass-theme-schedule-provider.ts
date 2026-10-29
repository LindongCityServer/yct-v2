import type { LdpassThemeScheduleResponse } from '@yct/contracts';

export interface LdpassThemeScheduleProviderConfig {
  baseUrl: string;
}

/**
 * 读取临东通公开的主题计划接口。
 * 只消费主题语义（teal / red / gray），不复制临东通的具体色值。
 */
export class LdpassThemeScheduleProvider {
  constructor(private readonly config: LdpassThemeScheduleProviderConfig) {}

  async readThemeSchedule(): Promise<LdpassThemeScheduleResponse> {
    const url = new URL('/api/theme/schedule', this.config.baseUrl);
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(`ldpass theme schedule failed: ${response.status}`);
    }

    return (await response.json()) as LdpassThemeScheduleResponse;
  }
}
