import { NextResponse } from 'next/server';
import { LdpassThemeScheduleProvider } from '@yct/adapters';
import type { LdpassAccentScheduleEntry } from '@yct/contracts';
import { markResponseNoStore } from '../../../../lib/http-cache';
import {
  createYctLdpassThemeScheduleResponse,
  normalizeLdpassAccentSchedule,
} from '../../../../lib/ldpass-theme-schedule';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import { createTimedCache } from '../../../../lib/server-cache';

export const dynamic = 'force-dynamic';

// 临东通主题计划变化频率很低，服务端缓存 60 秒，避免每个浏览器会话都直接打到临东通。
const themeScheduleCache = createTimedCache<LdpassAccentScheduleEntry[]>(60_000);

export async function GET() {
  const config = readRuntimeConfig();
  const ldpassBaseUrl = config.ldpassBaseUrl;

  if (!ldpassBaseUrl) {
    return markResponseNoStore(
      NextResponse.json(
        {
          error: 'ldpass_not_configured',
          message: 'LDPASS_BASE_URL 尚未配置。',
        },
        { status: 503 },
      ),
    );
  }

  try {
    const schedule = await themeScheduleCache.read(ldpassBaseUrl, async () => {
      const provider = new LdpassThemeScheduleProvider({ baseUrl: ldpassBaseUrl });
      const response = await provider.readThemeSchedule();
      return normalizeLdpassAccentSchedule(response);
    });

    return markResponseNoStore(NextResponse.json(createYctLdpassThemeScheduleResponse(schedule)));
  } catch {
    return markResponseNoStore(
      NextResponse.json(
        {
          error: 'ldpass_theme_unavailable',
          message: '无法读取临东通主题计划。',
        },
        { status: 502 },
      ),
    );
  }
}
