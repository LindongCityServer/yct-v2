'use client';

import type { LocaleCode } from '@yct/contracts';
import { useEffect, useMemo, useState } from 'react';
import {
  localePreferenceChangedEventName,
  readLocalLocalePreference,
} from './client-locale-preference';

export type CommonMessageKey =
  | 'account.settings'
  | 'account.status.anonymous'
  | 'account.status.notConfigured'
  | 'account.status.readonly'
  | 'account.status.unavailable'
  | 'brand.home'
  | 'nav.collapse'
  | 'nav.back'
  | 'nav.expand'
  | 'nav.label'
  | 'nav.map'
  | 'nav.operations'
  | 'nav.services'
  | 'nav.travel'
  | 'offline.actions'
  | 'offline.description'
  | 'offline.manageAfterOnline'
  | 'offline.map'
  | 'offline.note'
  | 'offline.operations'
  | 'offline.schedules'
  | 'offline.title'
  | 'page.account'
  | 'page.offline'
  | 'page.operations'
  | 'page.scheduleSearch'
  | 'page.search'
  | 'page.services'
  | 'page.ticketOrder'
  | 'page.travelScreen'
  | 'quickAction.rideCode'
  | 'quickAction.rideCodeLoginRequired'
  | 'search.open'
  | 'settings.accent.gray'
  | 'settings.accent.green'
  | 'settings.accent.label'
  | 'settings.accent.ldpass'
  | 'settings.accent.red'
  | 'settings.appearanceLanguage'
  | 'settings.font.harmony'
  | 'settings.font.label'
  | 'settings.font.system'
  | 'settings.language.en'
  | 'settings.language.label'
  | 'settings.language.savedLocal'
  | 'settings.language.source.account'
  | 'settings.language.source.default'
  | 'settings.language.source.local'
  | 'settings.language.system'
  | 'settings.language.zhCN'
  | 'settings.language.zhHant'
  | 'settings.motion.full'
  | 'settings.motion.group'
  | 'settings.motion.label'
  | 'settings.motion.reduced'
  | 'settings.motion.system'
  | 'settings.theme.dark'
  | 'settings.theme.label'
  | 'settings.theme.light'
  | 'settings.theme.system'
  | 'services.category.operations'
  | 'services.category.other'
  | 'services.category.serverSites'
  | 'services.category.toolbox'
  | 'services.empty'
  | 'services.itemCount'
  | 'search.category.all'
  | 'search.category.lines'
  | 'search.category.operations'
  | 'search.category.services'
  | 'search.category.stations'
  | 'search.clear'
  | 'search.emptyPrompt'
  | 'search.facilityCount'
  | 'search.noCategoryResults'
  | 'search.noMatch'
  | 'search.placeholder'
  | 'search.resultCount'
  | 'search.results'
  | 'search.resultGroup.lines'
  | 'search.resultGroup.operations'
  | 'search.resultGroup.services'
  | 'search.resultGroup.stations'
  | 'search.resultFilters'
  | 'search.stopCount'
  | 'search.stationExitCount'
  | 'status.loggedIn'
  | 'status.noPending'
  | 'status.pendingItems'
  | 'sync.localTripsPending';

type CommonCatalog = Record<CommonMessageKey, string>;

const commonCatalogs: Record<LocaleCode, CommonCatalog> = {
  'zh-CN': {
    'account.settings': '账号设置',
    'account.status.anonymous': '未登录',
    'account.status.notConfigured': '临东通未配置',
    'account.status.readonly': '只读账号',
    'account.status.unavailable': '账号状态暂不可用',
    'brand.home': '雨城通首页',
    'nav.back': '返回',
    'nav.collapse': '收起主导航',
    'nav.expand': '展开主导航',
    'nav.label': '主导航',
    'nav.map': '探索',
    'nav.operations': '运营',
    'nav.services': '服务',
    'nav.travel': '出行',
    'offline.actions': '离线相关入口',
    'offline.description':
      '可以继续打开近期访问过的运营信息、线路、站点详情和服务入口。恢复联网后，雨城通会重新读取最新数据。',
    'offline.manageAfterOnline': '联网后管理',
    'offline.map': '地图探索',
    'offline.note':
      '如果这些入口无法打开，说明对应内容尚未被缓存。联网后可在账号设置中刷新缓存或更新自定义离线范围。',
    'offline.operations': '运营信息',
    'offline.schedules': '班次查询',
    'offline.title': '当前网络不可用',
    'page.account': '账号设置',
    'page.offline': '离线',
    'page.operations': '运营信息',
    'page.scheduleSearch': '班次查询',
    'page.search': '搜索',
    'page.services': '更多服务',
    'page.ticketOrder': '票务订单',
    'page.travelScreen': '智运大屏',
    'quickAction.rideCode': '乘车码',
    'quickAction.rideCodeLoginRequired': '乘车码需要登录后使用',
    'search.open': '搜索',
    'settings.accent.gray': '灰色',
    'settings.accent.green': '青绿',
    'settings.accent.label': '强调色',
    'settings.accent.ldpass': '跟随 ldpass',
    'settings.accent.red': '红色',
    'settings.appearanceLanguage': '外观与语言',
    'settings.font.harmony': 'HarmonyOS Sans',
    'settings.font.label': '字体',
    'settings.font.system': '系统',
    'settings.language.en': 'English',
    'settings.language.label': '语言',
    'settings.language.savedLocal': '已保存到本设备',
    'settings.language.source.account': '账号',
    'settings.language.source.default': '默认',
    'settings.language.source.local': '本机',
    'settings.language.system': '跟随系统',
    'settings.language.zhCN': '简体中文',
    'settings.language.zhHant': '繁體中文',
    'settings.motion.full': '开启',
    'settings.motion.group': '动态效果',
    'settings.motion.label': '动态',
    'settings.motion.reduced': '关闭',
    'settings.motion.system': '跟随系统',
    'settings.theme.dark': '深色',
    'settings.theme.label': '主题',
    'settings.theme.light': '浅色',
    'settings.theme.system': '跟随系统',
    'services.category.operations': '运营及周边',
    'services.category.other': '其他服务',
    'services.category.serverSites': '服务器网站',
    'services.category.toolbox': '工具箱',
    'services.empty': '暂无服务入口',
    'services.itemCount': '{count} 项',
    'search.category.all': '全部',
    'search.category.lines': '线路',
    'search.category.operations': '运营',
    'search.category.services': '服务',
    'search.category.stations': '站点',
    'search.clear': '清空搜索',
    'search.emptyPrompt': '输入关键词后显示运营信息、线路、站点和服务结果',
    'search.facilityCount': '{count} 项设施',
    'search.noCategoryResults': '当前分类下暂无匹配结果',
    'search.noMatch': '暂无匹配“{query}”的结果',
    'search.placeholder': '搜索资讯、线路、站点和服务',
    'search.resultCount': '{count} 项结果',
    'search.results': '搜索结果',
    'search.resultFilters': '搜索结果分类',
    'search.resultGroup.lines': '线路',
    'search.resultGroup.operations': '运营信息',
    'search.resultGroup.services': '服务与工具',
    'search.resultGroup.stations': '站点',
    'search.stationExitCount': '{count} 个出入口',
    'search.stopCount': '{count} 站',
    'status.loggedIn': '已登录',
    'status.noPending': '无待办',
    'status.pendingItems': '{count} 个待处理事项',
    'sync.localTripsPending': '{count} 个本地行程待同步',
  },
  'zh-Hant': {
    'account.settings': '帳號設定',
    'account.status.anonymous': '未登入',
    'account.status.notConfigured': '臨東通未設定',
    'account.status.readonly': '唯讀帳號',
    'account.status.unavailable': '帳號狀態暫不可用',
    'brand.home': '雨城通首頁',
    'nav.back': '返回',
    'nav.collapse': '收合主導覽',
    'nav.expand': '展開主導覽',
    'nav.label': '主導覽',
    'nav.map': '探索',
    'nav.operations': '營運',
    'nav.services': '服務',
    'nav.travel': '出行',
    'offline.actions': '離線相關入口',
    'offline.description':
      '可以繼續開啟近期訪問過的營運資訊、線路、站點詳情和服務入口。恢復連線後，雨城通會重新讀取最新資料。',
    'offline.manageAfterOnline': '連線後管理',
    'offline.map': '地圖探索',
    'offline.note':
      '如果這些入口無法開啟，表示對應內容尚未被快取。連線後可在帳號設定中重新整理快取或更新自訂離線範圍。',
    'offline.operations': '營運資訊',
    'offline.schedules': '班次查詢',
    'offline.title': '目前網路不可用',
    'page.account': '帳號設定',
    'page.offline': '離線',
    'page.operations': '營運資訊',
    'page.scheduleSearch': '班次查詢',
    'page.search': '搜尋',
    'page.services': '更多服務',
    'page.ticketOrder': '票務訂單',
    'page.travelScreen': '智運大屏',
    'quickAction.rideCode': '乘車碼',
    'quickAction.rideCodeLoginRequired': '乘車碼需要登入後使用',
    'search.open': '搜尋',
    'settings.accent.gray': '灰色',
    'settings.accent.green': '青綠',
    'settings.accent.label': '強調色',
    'settings.accent.ldpass': '跟隨 ldpass',
    'settings.accent.red': '紅色',
    'settings.appearanceLanguage': '外觀與語言',
    'settings.font.harmony': 'HarmonyOS Sans',
    'settings.font.label': '字體',
    'settings.font.system': '系統',
    'settings.language.en': 'English',
    'settings.language.label': '語言',
    'settings.language.savedLocal': '已儲存到本機',
    'settings.language.source.account': '帳號',
    'settings.language.source.default': '預設',
    'settings.language.source.local': '本機',
    'settings.language.system': '跟隨系統',
    'settings.language.zhCN': '简体中文',
    'settings.language.zhHant': '繁體中文',
    'settings.motion.full': '開啟',
    'settings.motion.group': '動態效果',
    'settings.motion.label': '動態',
    'settings.motion.reduced': '關閉',
    'settings.motion.system': '跟隨系統',
    'settings.theme.dark': '深色',
    'settings.theme.label': '主題',
    'settings.theme.light': '淺色',
    'settings.theme.system': '跟隨系統',
    'services.category.operations': '營運及周邊',
    'services.category.other': '其他服務',
    'services.category.serverSites': '伺服器網站',
    'services.category.toolbox': '工具箱',
    'services.empty': '暫無服務入口',
    'services.itemCount': '{count} 項',
    'search.category.all': '全部',
    'search.category.lines': '線路',
    'search.category.operations': '營運',
    'search.category.services': '服務',
    'search.category.stations': '站點',
    'search.clear': '清空搜尋',
    'search.emptyPrompt': '輸入關鍵字後顯示營運資訊、線路、站點和服務結果',
    'search.facilityCount': '{count} 項設施',
    'search.noCategoryResults': '目前分類下暫無符合結果',
    'search.noMatch': '暫無符合「{query}」的結果',
    'search.placeholder': '搜尋資訊、線路、站點和服務',
    'search.resultCount': '{count} 項結果',
    'search.results': '搜尋結果',
    'search.resultFilters': '搜尋結果分類',
    'search.resultGroup.lines': '線路',
    'search.resultGroup.operations': '營運資訊',
    'search.resultGroup.services': '服務與工具',
    'search.resultGroup.stations': '站點',
    'search.stationExitCount': '{count} 個出入口',
    'search.stopCount': '{count} 站',
    'status.loggedIn': '已登入',
    'status.noPending': '無待辦',
    'status.pendingItems': '{count} 個待處理事項',
    'sync.localTripsPending': '{count} 個本機行程待同步',
  },
  en: {
    'account.settings': 'Account Settings',
    'account.status.anonymous': 'Not signed in',
    'account.status.notConfigured': 'Ldpass is not configured',
    'account.status.readonly': 'Read-only account',
    'account.status.unavailable': 'Account status unavailable',
    'brand.home': 'Yuchengtong Home',
    'nav.back': 'Back',
    'nav.collapse': 'Collapse main navigation',
    'nav.expand': 'Expand main navigation',
    'nav.label': 'Main navigation',
    'nav.map': 'Explore',
    'nav.operations': 'Updates',
    'nav.services': 'Services',
    'nav.travel': 'Travel',
    'offline.actions': 'Offline shortcuts',
    'offline.description':
      'You can continue opening recently visited updates, lines, station details, and service entries. YCT will refresh the latest data after the connection is restored.',
    'offline.manageAfterOnline': 'Manage online',
    'offline.map': 'Map Explore',
    'offline.note':
      'If these shortcuts cannot open, the content has not been cached yet. Once online, refresh the cache or update custom offline areas in account settings.',
    'offline.operations': 'Updates',
    'offline.schedules': 'Schedule Search',
    'offline.title': 'Network unavailable',
    'page.account': 'Account Settings',
    'page.offline': 'Offline',
    'page.operations': 'Updates',
    'page.scheduleSearch': 'Schedule Search',
    'page.search': 'Search',
    'page.services': 'More Services',
    'page.ticketOrder': 'Ticket Order',
    'page.travelScreen': 'Operations Board',
    'quickAction.rideCode': 'Ride Code',
    'quickAction.rideCodeLoginRequired': 'Sign in to use the ride code',
    'search.open': 'Search',
    'settings.accent.gray': 'Gray',
    'settings.accent.green': 'Teal',
    'settings.accent.label': 'Accent',
    'settings.accent.ldpass': 'Follow ldpass',
    'settings.accent.red': 'Red',
    'settings.appearanceLanguage': 'Appearance and Language',
    'settings.font.harmony': 'HarmonyOS Sans',
    'settings.font.label': 'Font',
    'settings.font.system': 'System',
    'settings.language.en': 'English',
    'settings.language.label': 'Language',
    'settings.language.savedLocal': 'Saved on this device',
    'settings.language.source.account': 'Account',
    'settings.language.source.default': 'Default',
    'settings.language.source.local': 'Local',
    'settings.language.system': 'Follow system',
    'settings.language.zhCN': 'Simplified Chinese',
    'settings.language.zhHant': 'Traditional Chinese',
    'settings.motion.full': 'On',
    'settings.motion.group': 'Motion',
    'settings.motion.label': 'Motion',
    'settings.motion.reduced': 'Off',
    'settings.motion.system': 'Follow system',
    'settings.theme.dark': 'Dark',
    'settings.theme.label': 'Theme',
    'settings.theme.light': 'Light',
    'settings.theme.system': 'Follow system',
    'services.category.operations': 'Updates and Nearby',
    'services.category.other': 'Other Services',
    'services.category.serverSites': 'Server Sites',
    'services.category.toolbox': 'Toolbox',
    'services.empty': 'No service entries yet',
    'services.itemCount': '{count} items',
    'search.category.all': 'All',
    'search.category.lines': 'Lines',
    'search.category.operations': 'Updates',
    'search.category.services': 'Services',
    'search.category.stations': 'Stations',
    'search.clear': 'Clear search',
    'search.emptyPrompt': 'Enter a keyword to search updates, lines, stations, and services.',
    'search.facilityCount': '{count} facilities',
    'search.noCategoryResults': 'No matches in this category',
    'search.noMatch': 'No results matching "{query}"',
    'search.placeholder': 'Search updates, lines, stations, and services',
    'search.resultCount': '{count} results',
    'search.results': 'Search Results',
    'search.resultFilters': 'Search result categories',
    'search.resultGroup.lines': 'Lines',
    'search.resultGroup.operations': 'Updates',
    'search.resultGroup.services': 'Services and Tools',
    'search.resultGroup.stations': 'Stations',
    'search.stationExitCount': '{count} exits',
    'search.stopCount': '{count} stops',
    'status.loggedIn': 'Signed in',
    'status.noPending': 'No pending items',
    'status.pendingItems': '{count} pending items',
    'sync.localTripsPending': '{count} local trips to sync',
  },
};

export function useI18n() {
  const [locale, setLocale] = useState<LocaleCode>(() => readLocalLocalePreference().resolvedLocale);

  useEffect(() => {
    const syncLocale = () => setLocale(readLocalLocalePreference().resolvedLocale);
    window.addEventListener(localePreferenceChangedEventName, syncLocale);
    window.addEventListener('storage', syncLocale);
    return () => {
      window.removeEventListener(localePreferenceChangedEventName, syncLocale);
      window.removeEventListener('storage', syncLocale);
    };
  }, []);

  return useMemo(
    () => ({
      locale,
      t: (key: CommonMessageKey, values: Record<string, string | number> = {}) =>
        formatMessage(commonCatalogs[locale]?.[key] ?? commonCatalogs['zh-CN'][key], values),
    }),
    [locale],
  );
}

function formatMessage(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
