import { NextResponse } from 'next/server';
import type { SettingsBootstrap } from '@yct/contracts';
import { appPath } from '../../../../lib/app-paths';
import { readRuntimeConfig } from '../../../../lib/runtime-config';

export function GET() {
  const config = readRuntimeConfig();
  const payload: SettingsBootstrap = {
    brand: {
      name: '雨城通',
      englishName: 'Yuchengtong',
      abbreviation: 'YCT',
      iconUrl: appPath('/icons/yct-icon.svg'),
      wordmarkUrl: appPath('/icons/yct-logo-wordmark.svg'),
    },
    integrations: {
      ldpassConfigured: Boolean(config.ldpassBaseUrl && config.ldpassClientId),
      tileProvidersConfigured: Boolean(
        config.tileFreshHttpTemplate || config.tileSafeHttpsStaticTemplate,
      ),
    },
    pwa: {
      installCopy:
        '把 YCT 添加到主屏幕，快速查看运营信息、线路和站点详情。支持缓存已下载的自定义范围离线包，并在你允许后接收行程、运营、订票和检票提醒。',
      offlinePackageMode: 'custom_rectangle',
    },
  };

  return NextResponse.json(payload);
}
