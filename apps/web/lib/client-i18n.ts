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
  | 'inventoryHoldStatus.cancelled'
  | 'inventoryHoldStatus.confirmed'
  | 'inventoryHoldStatus.expired'
  | 'inventoryHoldStatus.held'
  | 'inventoryHoldStatus.released'
  | 'lineDetail.directionAria'
  | 'lineDetail.directionTo'
  | 'lineDetail.extra.departures'
  | 'lineDetail.extra.fare'
  | 'lineDetail.extra.stations'
  | 'lineDetail.extra.stopMetadata'
  | 'lineDetail.extraAttributes'
  | 'lineDetail.firstLast'
  | 'lineDetail.firstStation'
  | 'lineDetail.lastStation'
  | 'lineDetail.metroSuffix'
  | 'lineDetail.oneWay.forward'
  | 'lineDetail.oneWay.reverse'
  | 'lineDetail.operator'
  | 'lineDetail.overviewAria'
  | 'lineDetail.source'
  | 'lineDetail.stationList'
  | 'lineDetail.stationListEmpty'
  | 'lineDetail.summary.exits'
  | 'lineDetail.summary.facilities'
  | 'lineDetail.summary.surrounding'
  | 'lineDetail.summary.transfer'
  | 'lineDetail.toBeAdded'
  | 'map.category.all'
  | 'map.category.favorites'
  | 'map.categoryFilter.aria'
  | 'map.categoryFilter.collapse'
  | 'map.categoryFilter.expand'
  | 'map.empty.favorites'
  | 'map.empty.loading'
  | 'map.empty.nearby'
  | 'map.empty.noMatch'
  | 'map.markerList.count'
  | 'map.markerList.default'
  | 'map.markerList.nearby'
  | 'map.markerList.results'
  | 'map.nearby.exit'
  | 'map.nearby.note'
  | 'map.poi.actions'
  | 'map.poi.close'
  | 'map.poi.collapse'
  | 'map.poi.copyStatus'
  | 'map.poi.expand'
  | 'map.poi.facilities'
  | 'map.poi.favoriteAria'
  | 'map.poi.favoriteStatus'
  | 'map.poi.nearbyAria'
  | 'map.poi.objectFallback'
  | 'map.poi.route'
  | 'map.poi.shareAria'
  | 'map.poi.shareOpened'
  | 'map.poi.shareText'
  | 'map.poi.shareTitle'
  | 'map.poi.shareUnavailable'
  | 'map.poi.summary'
  | 'map.poi.tabsAria'
  | 'map.poi.unfavoriteAria'
  | 'map.poi.unfavoriteStatus'
  | 'map.search.aria'
  | 'map.search.clear'
  | 'map.search.placeholder'
  | 'map.title'
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
  | 'operations.category.all'
  | 'operations.category.bus'
  | 'operations.category.metro'
  | 'operations.category.notice'
  | 'operations.category.site'
  | 'operations.category.tram'
  | 'operations.category.updates'
  | 'operations.categoryAria'
  | 'operations.emptyAll'
  | 'operations.emptyCategory'
  | 'operations.emptyFeatured'
  | 'operations.expired'
  | 'operations.featuredAria'
  | 'operations.feedAria'
  | 'operations.itemCount'
  | 'operations.noStrongReminder'
  | 'operations.noTripReminder'
  | 'operations.remindersAria'
  | 'operations.strongReminder'
  | 'operations.validUntil'
  | 'page.account'
  | 'page.map'
  | 'page.offline'
  | 'page.operations'
  | 'page.scheduleSearch'
  | 'page.search'
  | 'page.services'
  | 'page.ticketOrder'
  | 'page.travel'
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
  | 'stationDetail.direction.down'
  | 'stationDetail.direction.unknown'
  | 'stationDetail.direction.up'
  | 'stationDetail.exits.count'
  | 'stationDetail.exits.empty'
  | 'stationDetail.exits.noDescription'
  | 'stationDetail.exits.title'
  | 'stationDetail.facilities.count'
  | 'stationDetail.facilities.empty'
  | 'stationDetail.facilities.locationUnknown'
  | 'stationDetail.facilities.title'
  | 'stationDetail.facilities.toFloor'
  | 'stationDetail.ground'
  | 'stationDetail.layers.count'
  | 'stationDetail.layers.empty'
  | 'stationDetail.layers.title'
  | 'stationDetail.location'
  | 'stationDetail.related.count'
  | 'stationDetail.related.empty'
  | 'stationDetail.related.surrounding'
  | 'stationDetail.related.title'
  | 'stationDetail.related.transfers'
  | 'stationDetail.source'
  | 'stationDetail.underground'
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
  | 'sync.localTripsPending'
  | 'ticketCancellation.adminCancelled'
  | 'ticketCancellation.inventoryExpired'
  | 'ticketCancellation.issueFailed'
  | 'ticketCancellation.system'
  | 'ticketCancellation.userCancelled'
  | 'ticketOrderDetail.backAccount'
  | 'ticketOrderDetail.cancelConfirm'
  | 'ticketOrderDetail.cancelDone'
  | 'ticketOrderDetail.cancelFailed'
  | 'ticketOrderDetail.description'
  | 'ticketOrderDetail.field.cancelledAt'
  | 'ticketOrderDetail.field.cancellationReason'
  | 'ticketOrderDetail.field.createdAt'
  | 'ticketOrderDetail.field.fareProductId'
  | 'ticketOrderDetail.field.orderId'
  | 'ticketOrderDetail.field.passengerCount'
  | 'ticketOrderDetail.field.serviceKind'
  | 'ticketOrderDetail.field.tripId'
  | 'ticketOrderDetail.field.updatedAt'
  | 'ticketOrderDetail.hold.aria'
  | 'ticketOrderDetail.hold.expiresAt'
  | 'ticketOrderDetail.hold.id'
  | 'ticketOrderDetail.hold.none'
  | 'ticketOrderDetail.hold.poolId'
  | 'ticketOrderDetail.hold.quantity'
  | 'ticketOrderDetail.hold.quantityValue'
  | 'ticketOrderDetail.hold.releasedAt'
  | 'ticketOrderDetail.hold.status'
  | 'ticketOrderDetail.hold.title'
  | 'ticketOrderDetail.loading'
  | 'ticketOrderDetail.orderTitle'
  | 'ticketOrderDetail.readFailed'
  | 'ticketOrderDetail.refresh'
  | 'ticketOrderDetail.retry'
  | 'ticketOrderDetail.unavailable'
  | 'ticketOrderDraft.cancelDraft'
  | 'ticketOrderDraft.canceling'
  | 'ticketOrderDraft.description'
  | 'ticketOrderDraft.details'
  | 'ticketOrderDraft.empty'
  | 'ticketOrderDraft.holdUntil'
  | 'ticketOrderDraft.loading'
  | 'ticketOrderDraft.noHold'
  | 'ticketOrderDraft.orderFallback'
  | 'ticketOrderDraft.passengerCount'
  | 'ticketOrderDraft.refresh'
  | 'ticketOrderDraft.serviceTrip'
  | 'ticketOrderDraft.stopCount'
  | 'ticketOrderDraft.title'
  | 'ticketOrderStatus.cancelled'
  | 'ticketOrderStatus.checkedIn'
  | 'ticketOrderStatus.completed'
  | 'ticketOrderStatus.draft'
  | 'ticketOrderStatus.expired'
  | 'ticketOrderStatus.issued'
  | 'ticketOrderStatus.manualReview'
  | 'ticketOrderStatus.pendingIssue'
  | 'ticketOrderStatus.refundRequested'
  | 'ticketOrderStatus.refunded'
  | 'ticketService.coach'
  | 'ticketService.custom'
  | 'ticketService.ferry'
  | 'ticketService.flight'
  | 'ticketService.railway'
  | 'tripReminder.action.cancel'
  | 'tripReminder.action.complete'
  | 'tripReminder.action.delete'
  | 'tripReminder.activeEmpty'
  | 'tripReminder.activeTitle'
  | 'tripReminder.add'
  | 'tripReminder.close'
  | 'tripReminder.error.invalidTime'
  | 'tripReminder.error.missingContent'
  | 'tripReminder.field.arrival'
  | 'tripReminder.field.departure'
  | 'tripReminder.field.lineName'
  | 'tripReminder.field.remindAt'
  | 'tripReminder.field.title'
  | 'tripReminder.formTitle'
  | 'tripReminder.historyEmpty'
  | 'tripReminder.historyTitle'
  | 'tripReminder.imported'
  | 'tripReminder.loading'
  | 'tripReminder.localBadge'
  | 'tripReminder.placeholder.optional'
  | 'tripReminder.placeholder.title'
  | 'tripReminder.routeMissing'
  | 'tripReminder.source.legacy'
  | 'tripReminder.source.local'
  | 'tripReminder.status.cancelled'
  | 'tripReminder.status.completed'
  | 'tripReminder.status.expired'
  | 'tripReminder.status.notificationQueued'
  | 'tripReminder.status.notified'
  | 'tripReminder.status.ongoing'
  | 'tripReminder.status.scheduled'
  | 'tripReminder.status.sent'
  | 'tripReminder.summary'
  | 'tripReminder.title'
  | 'travelSchedule.action.addReminder'
  | 'travelSchedule.action.legacyReference'
  | 'travelSchedule.action.saveRecord'
  | 'travelSchedule.empty.noMatch'
  | 'travelSchedule.feedback.historySaved'
  | 'travelSchedule.feedback.reminderAdded'
  | 'travelSchedule.filter.anyDestination'
  | 'travelSchedule.filter.anyOrigin'
  | 'travelSchedule.filter.anyStation'
  | 'travelSchedule.filter.date'
  | 'travelSchedule.filter.destination'
  | 'travelSchedule.filter.origin'
  | 'travelSchedule.filter.via'
  | 'travelSchedule.filters.aria'
  | 'travelSchedule.history.clear'
  | 'travelSchedule.history.clearConfirm'
  | 'travelSchedule.history.recentAria'
  | 'travelSchedule.history.summary'
  | 'travelSchedule.history.title'
  | 'travelSchedule.notice.aria'
  | 'travelSchedule.notice.count'
  | 'travelSchedule.notice.title'
  | 'travelSchedule.order.cancelConfirm'
  | 'travelSchedule.order.cancelDone'
  | 'travelSchedule.order.cancelFailed'
  | 'travelSchedule.order.canceling'
  | 'travelSchedule.order.createFailed'
  | 'travelSchedule.order.created'
  | 'travelSchedule.order.creating'
  | 'travelSchedule.order.empty'
  | 'travelSchedule.order.loginRequired'
  | 'travelSchedule.order.readFailed'
  | 'travelSchedule.order.unavailable'
  | 'travelSchedule.resultCount'
  | 'travelSchedule.search.aria'
  | 'travelSchedule.search.clear'
  | 'travelSchedule.search.placeholder'
  | 'travelSchedule.service.all'
  | 'travelSchedule.service.aria'
  | 'travelSchedule.service.unavailable'
  | 'travelSchedule.ticketing.createDraft'
  | 'travelSchedule.ticketing.creating'
  | 'travelSchedule.ticketing.inventoryPending'
  | 'travelSchedule.ticketing.legacyReference'
  | 'travelSchedule.ticketing.pending'
  | 'travelSchedule.ticketing.soldOut'
  | 'travelSchedule.ticketing.statusMissing'
  | 'travelSchedule.ticketing.unavailable'
  | 'travelSchedule.time.all'
  | 'travelSchedule.time.aria'
  | 'travelSchedule.time.past'
  | 'travelSchedule.time.upcoming'
  | 'travelSchedule.title'
  | 'travelSchedule.trip.aircraftType'
  | 'travelSchedule.trip.arrivalTime'
  | 'travelSchedule.trip.arrivalUnknown'
  | 'travelSchedule.trip.boardingGate'
  | 'travelSchedule.trip.checkInArrival'
  | 'travelSchedule.trip.departureTime'
  | 'travelSchedule.trip.departureUnknown'
  | 'travelSchedule.trip.direct'
  | 'travelSchedule.trip.fare'
  | 'travelSchedule.trip.gate'
  | 'travelSchedule.trip.operatingDays'
  | 'travelSchedule.trip.operator'
  | 'travelSchedule.trip.runtimeUnknown'
  | 'travelSchedule.trip.timeUnknown'
  | 'travelSchedule.trip.toBeAnnounced'
  | 'travelSchedule.trip.vehicleType'
  | 'travelSchedule.trip.vesselType'
  | 'travelSchedule.trip.via'
  | 'travelSchedule.trip.viaMany'
  | 'travelSchedule.tripList.aria'
  | 'travelSchedule.weekday.everyday'
  | 'travelSchedule.weekday.fri'
  | 'travelSchedule.weekday.mon'
  | 'travelSchedule.weekday.sat'
  | 'travelSchedule.weekday.sun'
  | 'travelSchedule.weekday.thu'
  | 'travelSchedule.weekday.tue'
  | 'travelSchedule.weekday.wed'
  | 'travel.schedules.action'
  | 'travel.schedules.detail'
  | 'travel.schedules.title'
  | 'travel.map.action'
  | 'travel.map.detail'
  | 'travel.map.title'
  | 'travel.screen.action'
  | 'travel.screen.detail'
  | 'travel.screen.title'
  | 'travel.services.subtitle'
  | 'travel.services.title'
  | 'travel.subtitle'
  | 'travel.ticketing.action'
  | 'travel.ticketing.detail'
  | 'travel.ticketing.title';

type CommonCatalog = Record<CommonMessageKey, string>;

const commonCatalogs: Record<LocaleCode, CommonCatalog> = {
  'zh-CN': {
    'account.settings': '账号设置',
    'account.status.anonymous': '未登录',
    'account.status.notConfigured': '临东通未配置',
    'account.status.readonly': '只读账号',
    'account.status.unavailable': '账号状态暂不可用',
    'brand.home': '雨城通首页',
    'inventoryHoldStatus.cancelled': '已取消',
    'inventoryHoldStatus.confirmed': '已确认',
    'inventoryHoldStatus.expired': '已过期',
    'inventoryHoldStatus.held': '占用中',
    'inventoryHoldStatus.released': '已释放',
    'lineDetail.directionAria': '线路方向',
    'lineDetail.directionTo': '{station}方向',
    'lineDetail.extra.departures': '{count} 个班次',
    'lineDetail.extra.fare': '票价 {fare}',
    'lineDetail.extra.stations': '{count} 站',
    'lineDetail.extra.stopMetadata': '{count} 项停靠属性',
    'lineDetail.extraAttributes': '其他线路属性',
    'lineDetail.firstLast': '首末车时间',
    'lineDetail.firstStation': '第一站',
    'lineDetail.lastStation': '最后一站',
    'lineDetail.metroSuffix': '号线',
    'lineDetail.oneWay.forward': '仅正向',
    'lineDetail.oneWay.reverse': '仅反向',
    'lineDetail.operator': '运营单位',
    'lineDetail.overviewAria': '线路概览',
    'lineDetail.source': '数据来源：{source}',
    'lineDetail.stationList': '站点列表',
    'lineDetail.stationListEmpty': '这条线路暂未导入站点列表',
    'lineDetail.summary.exits': '{count} 个出入口',
    'lineDetail.summary.facilities': '{count} 类设施',
    'lineDetail.summary.surrounding': '周边 {count} 站',
    'lineDetail.summary.transfer': '换乘 {lines}',
    'lineDetail.toBeAdded': '待补充',
    'map.category.all': '全部',
    'map.category.favorites': '收藏',
    'map.categoryFilter.aria': '筛选地图标记分类',
    'map.categoryFilter.collapse': '收起分类筛选',
    'map.categoryFilter.expand': '展开分类筛选',
    'map.empty.favorites': '暂无收藏地点',
    'map.empty.loading': '正在读取地图标记',
    'map.empty.nearby': '周边暂无可显示标记',
    'map.empty.noMatch': '暂无匹配标记',
    'map.markerList.count': '{count} 个',
    'map.markerList.default': '地图标记',
    'map.markerList.nearby': '{name}周边',
    'map.markerList.results': '搜索结果',
    'map.nearby.exit': '退出',
    'map.nearby.note': '按距离显示 {name} 周边标记',
    'map.poi.actions': '地点操作',
    'map.poi.close': '关闭地点信息',
    'map.poi.collapse': '收起地点信息',
    'map.poi.copyStatus': '已复制地点链接',
    'map.poi.expand': '展开地点信息',
    'map.poi.facilities': '设施/出入口',
    'map.poi.favoriteAria': '收藏 {name}',
    'map.poi.favoriteStatus': '已收藏 {name}',
    'map.poi.nearbyAria': '搜索 {name} 周边',
    'map.poi.objectFallback': '地图对象',
    'map.poi.route': '查看路线',
    'map.poi.shareAria': '分享 {name}',
    'map.poi.shareOpened': '已打开系统分享面板',
    'map.poi.shareText': '在雨城通地图中查看 {name}',
    'map.poi.shareTitle': '{name} - 雨城通地图',
    'map.poi.shareUnavailable': '当前浏览器暂不支持分享或复制',
    'map.poi.summary': '简介',
    'map.poi.tabsAria': '地点信息分类',
    'map.poi.unfavoriteAria': '取消收藏 {name}',
    'map.poi.unfavoriteStatus': '已取消收藏 {name}',
    'map.search.aria': '筛选地图标记',
    'map.search.clear': '清空地图搜索',
    'map.search.placeholder': '搜索地点或标记',
    'map.title': '地图探索',
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
    'operations.category.all': '全部',
    'operations.category.bus': '公交运营',
    'operations.category.metro': '地铁运营',
    'operations.category.notice': '通知公告',
    'operations.category.site': '网站公告',
    'operations.category.tram': '有轨运营',
    'operations.category.updates': '运营信息',
    'operations.categoryAria': '运营信息分类',
    'operations.emptyAll': '暂无运营信息',
    'operations.emptyCategory': '暂无{category}运营信息',
    'operations.emptyFeatured': '暂无已发布重点资讯',
    'operations.expired': '过期消息',
    'operations.featuredAria': '重点资讯',
    'operations.feedAria': '运营信息列表',
    'operations.itemCount': '{count} 条',
    'operations.noStrongReminder': '暂无生效的强提醒',
    'operations.noTripReminder': '暂无行程提醒',
    'operations.remindersAria': '强提醒面板',
    'operations.strongReminder': '强提醒',
    'operations.validUntil': '有效至 {date}',
    'page.account': '账号设置',
    'page.map': '地图探索',
    'page.offline': '离线',
    'page.operations': '运营信息',
    'page.scheduleSearch': '班次查询',
    'page.search': '搜索',
    'page.services': '更多服务',
    'page.ticketOrder': '票务订单',
    'page.travel': '出行',
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
    'stationDetail.direction.down': '下行',
    'stationDetail.direction.unknown': '方向待补',
    'stationDetail.direction.up': '上行',
    'stationDetail.exits.count': '{count} 个',
    'stationDetail.exits.empty': '暂无出入口数据',
    'stationDetail.exits.noDescription': '暂无描述',
    'stationDetail.exits.title': '出入口',
    'stationDetail.facilities.count': '{count} 项',
    'stationDetail.facilities.empty': '暂无设施数据',
    'stationDetail.facilities.locationUnknown': '位置待补',
    'stationDetail.facilities.title': '站内设施',
    'stationDetail.facilities.toFloor': '至 {floor}',
    'stationDetail.ground': '地面站',
    'stationDetail.layers.count': '{count} 层',
    'stationDetail.layers.empty': '暂无站内层级数据',
    'stationDetail.layers.title': '站内层级',
    'stationDetail.location': '位置 {location}',
    'stationDetail.related.count': '{count} 项',
    'stationDetail.related.empty': '暂无换乘或周边站点数据',
    'stationDetail.related.surrounding': '周边站点',
    'stationDetail.related.title': '换乘与周边',
    'stationDetail.related.transfers': '换乘线路',
    'stationDetail.source': '数据来源：{source}',
    'stationDetail.underground': '地下站',
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
    'ticketCancellation.adminCancelled': '管理员取消',
    'ticketCancellation.inventoryExpired': '占座过期',
    'ticketCancellation.issueFailed': '出票失败',
    'ticketCancellation.system': '系统取消',
    'ticketCancellation.userCancelled': '用户取消',
    'ticketOrderDetail.backAccount': '返回账号',
    'ticketOrderDetail.cancelConfirm': '要取消这个订单草稿并释放库存占用吗？',
    'ticketOrderDetail.cancelDone': '已取消订单草稿',
    'ticketOrderDetail.cancelFailed': '订单草稿取消失败',
    'ticketOrderDetail.description': '这里展示服务端订单草稿和占座状态，不代表已出票或可核销凭证。',
    'ticketOrderDetail.field.cancelledAt': '取消时间',
    'ticketOrderDetail.field.cancellationReason': '取消原因',
    'ticketOrderDetail.field.createdAt': '创建时间',
    'ticketOrderDetail.field.fareProductId': '票种 ID',
    'ticketOrderDetail.field.orderId': '订单 ID',
    'ticketOrderDetail.field.passengerCount': '乘车人数',
    'ticketOrderDetail.field.serviceKind': '服务类型',
    'ticketOrderDetail.field.tripId': '班次 ID',
    'ticketOrderDetail.field.updatedAt': '更新时间',
    'ticketOrderDetail.hold.aria': '库存占用',
    'ticketOrderDetail.hold.expiresAt': '占用到期',
    'ticketOrderDetail.hold.id': '占用 ID',
    'ticketOrderDetail.hold.none': '当前订单没有库存占用记录。',
    'ticketOrderDetail.hold.poolId': '库存池 ID',
    'ticketOrderDetail.hold.quantity': '占用数量',
    'ticketOrderDetail.hold.quantityValue': '{count} 张',
    'ticketOrderDetail.hold.releasedAt': '释放时间',
    'ticketOrderDetail.hold.status': '占用状态',
    'ticketOrderDetail.hold.title': '库存占用',
    'ticketOrderDetail.loading': '正在读取订单详情',
    'ticketOrderDetail.orderTitle': '订单 {id}',
    'ticketOrderDetail.readFailed': '订单详情读取失败',
    'ticketOrderDetail.refresh': '刷新状态',
    'ticketOrderDetail.retry': '重新读取',
    'ticketOrderDetail.unavailable': '订单详情暂不可用',
    'ticketOrderDraft.cancelDraft': '取消草稿',
    'ticketOrderDraft.canceling': '取消中',
    'ticketOrderDraft.description': '仅显示占座中的草稿订单，不代表已出票。',
    'ticketOrderDraft.details': '详情',
    'ticketOrderDraft.empty': '暂无订单草稿。',
    'ticketOrderDraft.holdUntil': '占用至 {time}',
    'ticketOrderDraft.loading': '正在读取订单草稿',
    'ticketOrderDraft.noHold': '无库存占用',
    'ticketOrderDraft.orderFallback': '订单 {id}',
    'ticketOrderDraft.passengerCount': '{count}人',
    'ticketOrderDraft.refresh': '刷新订单草稿',
    'ticketOrderDraft.serviceTrip': '{service}班次',
    'ticketOrderDraft.stopCount': '{count} 站',
    'ticketOrderDraft.title': '我的票务草稿',
    'ticketOrderStatus.cancelled': '已取消',
    'ticketOrderStatus.checkedIn': '已检票',
    'ticketOrderStatus.completed': '已完成',
    'ticketOrderStatus.draft': '草稿',
    'ticketOrderStatus.expired': '已过期',
    'ticketOrderStatus.issued': '已出票',
    'ticketOrderStatus.manualReview': '人工审核',
    'ticketOrderStatus.pendingIssue': '待出票',
    'ticketOrderStatus.refundRequested': '已申请退票',
    'ticketOrderStatus.refunded': '已退票',
    'ticketService.coach': '客运',
    'ticketService.custom': '其他',
    'ticketService.ferry': '轮渡',
    'ticketService.flight': '航班',
    'ticketService.railway': '铁路',
    'tripReminder.action.cancel': '取消提醒',
    'tripReminder.action.complete': '标记完成',
    'tripReminder.action.delete': '删除记录',
    'tripReminder.activeEmpty': '暂无即将进行的行程。',
    'tripReminder.activeTitle': '即将进行',
    'tripReminder.add': '添加提醒',
    'tripReminder.close': '关闭',
    'tripReminder.error.invalidTime': '请选择有效的提醒时间。',
    'tripReminder.error.missingContent': '至少填写标题、线路或起终点之一。',
    'tripReminder.field.arrival': '到达',
    'tripReminder.field.departure': '出发',
    'tripReminder.field.lineName': '线路',
    'tripReminder.field.remindAt': '提醒时间',
    'tripReminder.field.title': '标题',
    'tripReminder.formTitle': '添加行程提醒',
    'tripReminder.historyEmpty': '暂无历史行程。',
    'tripReminder.historyTitle': '历史行程',
    'tripReminder.imported': '已从旧站本地 {source} 导入 {count} 条行程记录。',
    'tripReminder.loading': '正在读取本地行程',
    'tripReminder.localBadge': '{count} 个本地记录',
    'tripReminder.placeholder.optional': '可选',
    'tripReminder.placeholder.title': '例如：去大学城',
    'tripReminder.routeMissing': '未填写路线信息',
    'tripReminder.source.legacy': '旧站导入',
    'tripReminder.source.local': '本地保存',
    'tripReminder.status.cancelled': '已取消',
    'tripReminder.status.completed': '已完成',
    'tripReminder.status.expired': '已过期',
    'tripReminder.status.notificationQueued': '待推送',
    'tripReminder.status.notified': '已提醒',
    'tripReminder.status.ongoing': '进行中',
    'tripReminder.status.scheduled': '待提醒',
    'tripReminder.status.sent': '已发送',
    'tripReminder.summary': '{scheduled} 个即将进行，{history} 个历史记录',
    'tripReminder.title': '行程提醒',
    'travelSchedule.action.addReminder': '添加提醒',
    'travelSchedule.action.legacyReference': '旧版参考',
    'travelSchedule.action.saveRecord': '保存记录',
    'travelSchedule.empty.noMatch': '没有匹配的班次',
    'travelSchedule.feedback.historySaved': '已保存到本地班次记录',
    'travelSchedule.feedback.reminderAdded': '已添加 {time} 的本地提醒',
    'travelSchedule.filter.anyDestination': '任意终点',
    'travelSchedule.filter.anyOrigin': '任意起点',
    'travelSchedule.filter.anyStation': '任意车站',
    'travelSchedule.filter.date': '日期',
    'travelSchedule.filter.destination': '终点',
    'travelSchedule.filter.origin': '起点',
    'travelSchedule.filter.via': '经过',
    'travelSchedule.filters.aria': '班次筛选',
    'travelSchedule.history.clear': '清空班次记录',
    'travelSchedule.history.clearConfirm': '要清空本地班次查询历史吗？行程提醒不会被删除。',
    'travelSchedule.history.recentAria': '最近班次记录',
    'travelSchedule.history.summary': '{count} 条，{reminderCount} 条已关联提醒',
    'travelSchedule.history.title': '本地班次记录',
    'travelSchedule.notice.aria': '班次公告',
    'travelSchedule.notice.count': '{count} 条',
    'travelSchedule.notice.title': '客运提醒',
    'travelSchedule.order.cancelConfirm': '要取消这个订单草稿并释放库存占用吗？',
    'travelSchedule.order.cancelDone': '已取消订单草稿',
    'travelSchedule.order.cancelFailed': '订单草稿取消失败',
    'travelSchedule.order.canceling': '正在取消订单草稿',
    'travelSchedule.order.createFailed': '订单草稿创建失败',
    'travelSchedule.order.created': '已创建订单草稿，库存占用至 {expiresAt}',
    'travelSchedule.order.creating': '正在创建订单草稿',
    'travelSchedule.order.empty': '暂无订单草稿。',
    'travelSchedule.order.loginRequired': '登录后可查看订单草稿。',
    'travelSchedule.order.readFailed': '订单草稿读取失败',
    'travelSchedule.order.unavailable': '当前班次暂不可创建订单草稿',
    'travelSchedule.resultCount': '{count} / {total} 个可查询班次',
    'travelSchedule.search.aria': '搜索班次、线路、车站、检票口或运营方',
    'travelSchedule.search.clear': '清空班次搜索',
    'travelSchedule.search.placeholder': '搜索班次、线路、车站或运营方',
    'travelSchedule.service.all': '全部',
    'travelSchedule.service.aria': '交通方式',
    'travelSchedule.service.unavailable': '未接入',
    'travelSchedule.ticketing.createDraft': '创建草稿',
    'travelSchedule.ticketing.creating': '创建中',
    'travelSchedule.ticketing.inventoryPending': '库存待配置',
    'travelSchedule.ticketing.legacyReference': '旧版参考可用',
    'travelSchedule.ticketing.pending': '新票务待接入',
    'travelSchedule.ticketing.soldOut': '暂无余票',
    'travelSchedule.ticketing.statusMissing': '新版票务状态尚未返回。',
    'travelSchedule.ticketing.unavailable': '暂不可订',
    'travelSchedule.time.all': '全部',
    'travelSchedule.time.aria': '时间筛选',
    'travelSchedule.time.past': '已过',
    'travelSchedule.time.upcoming': '即将',
    'travelSchedule.title': '统一班次查询',
    'travelSchedule.trip.aircraftType': '机型',
    'travelSchedule.trip.arrivalTime': '到达时间',
    'travelSchedule.trip.arrivalUnknown': '到达地点待公布',
    'travelSchedule.trip.boardingGate': '登船口',
    'travelSchedule.trip.checkInArrival': '值机/到达',
    'travelSchedule.trip.departureTime': '出发时间',
    'travelSchedule.trip.departureUnknown': '出发地点待公布',
    'travelSchedule.trip.direct': '直达',
    'travelSchedule.trip.fare': '票价',
    'travelSchedule.trip.gate': '检票口',
    'travelSchedule.trip.operatingDays': '运行日',
    'travelSchedule.trip.operator': '运营',
    'travelSchedule.trip.runtimeUnknown': '运行时间待公布',
    'travelSchedule.trip.timeUnknown': '待定',
    'travelSchedule.trip.toBeAnnounced': '待公布',
    'travelSchedule.trip.vehicleType': '车型',
    'travelSchedule.trip.vesselType': '船型',
    'travelSchedule.trip.via': '经停 {stations}',
    'travelSchedule.trip.viaMany': '经停 {stations} 等 {count} 站',
    'travelSchedule.tripList.aria': '班次列表',
    'travelSchedule.weekday.everyday': '每日',
    'travelSchedule.weekday.fri': '周五',
    'travelSchedule.weekday.mon': '周一',
    'travelSchedule.weekday.sat': '周六',
    'travelSchedule.weekday.sun': '周日',
    'travelSchedule.weekday.thu': '周四',
    'travelSchedule.weekday.tue': '周二',
    'travelSchedule.weekday.wed': '周三',
    'travel.schedules.action': '查询班次',
    'travel.schedules.detail':
      '客运 {tripCount} 个班次，{stationCount} 个车站；轮渡与航班预留统一入口',
    'travel.schedules.title': '班次查询',
    'travel.map.action': '打开地图',
    'travel.map.detail': '在地图中查看线路、站点、接驳和地点详情',
    'travel.map.title': '线路与站点',
    'travel.screen.action': '查看大屏',
    'travel.screen.detail': '{gateCount} 个检票口数据，展示近期客运班次与运营提示',
    'travel.screen.title': '智运大屏',
    'travel.services.subtitle': '班次查询、线路站点、客运展示与后续票务入口',
    'travel.services.title': '出行服务',
    'travel.subtitle': '提醒、班次与后续票务',
    'travel.ticketing.action': '待接入',
    'travel.ticketing.detail': '真实电子票、检票、退票和乘车码后续接入临东通',
    'travel.ticketing.title': '票券与订单',
  },
  'zh-Hant': {
    'account.settings': '帳號設定',
    'account.status.anonymous': '未登入',
    'account.status.notConfigured': '臨東通未設定',
    'account.status.readonly': '唯讀帳號',
    'account.status.unavailable': '帳號狀態暫不可用',
    'brand.home': '雨城通首頁',
    'inventoryHoldStatus.cancelled': '已取消',
    'inventoryHoldStatus.confirmed': '已確認',
    'inventoryHoldStatus.expired': '已過期',
    'inventoryHoldStatus.held': '占用中',
    'inventoryHoldStatus.released': '已釋放',
    'lineDetail.directionAria': '線路方向',
    'lineDetail.directionTo': '{station}方向',
    'lineDetail.extra.departures': '{count} 個班次',
    'lineDetail.extra.fare': '票價 {fare}',
    'lineDetail.extra.stations': '{count} 站',
    'lineDetail.extra.stopMetadata': '{count} 項停靠屬性',
    'lineDetail.extraAttributes': '其他線路屬性',
    'lineDetail.firstLast': '首末車時間',
    'lineDetail.firstStation': '第一站',
    'lineDetail.lastStation': '最後一站',
    'lineDetail.metroSuffix': '號線',
    'lineDetail.oneWay.forward': '僅正向',
    'lineDetail.oneWay.reverse': '僅反向',
    'lineDetail.operator': '營運單位',
    'lineDetail.overviewAria': '線路概覽',
    'lineDetail.source': '資料來源：{source}',
    'lineDetail.stationList': '站點列表',
    'lineDetail.stationListEmpty': '這條線路暫未匯入站點列表',
    'lineDetail.summary.exits': '{count} 個出入口',
    'lineDetail.summary.facilities': '{count} 類設施',
    'lineDetail.summary.surrounding': '周邊 {count} 站',
    'lineDetail.summary.transfer': '換乘 {lines}',
    'lineDetail.toBeAdded': '待補充',
    'map.category.all': '全部',
    'map.category.favorites': '收藏',
    'map.categoryFilter.aria': '篩選地圖標記分類',
    'map.categoryFilter.collapse': '收合分類篩選',
    'map.categoryFilter.expand': '展開分類篩選',
    'map.empty.favorites': '暫無收藏地點',
    'map.empty.loading': '正在讀取地圖標記',
    'map.empty.nearby': '周邊暫無可顯示標記',
    'map.empty.noMatch': '暫無符合標記',
    'map.markerList.count': '{count} 個',
    'map.markerList.default': '地圖標記',
    'map.markerList.nearby': '{name}周邊',
    'map.markerList.results': '搜尋結果',
    'map.nearby.exit': '退出',
    'map.nearby.note': '按距離顯示 {name} 周邊標記',
    'map.poi.actions': '地點操作',
    'map.poi.close': '關閉地點資訊',
    'map.poi.collapse': '收起地點資訊',
    'map.poi.copyStatus': '已複製地點連結',
    'map.poi.expand': '展開地點資訊',
    'map.poi.facilities': '設施/出入口',
    'map.poi.favoriteAria': '收藏 {name}',
    'map.poi.favoriteStatus': '已收藏 {name}',
    'map.poi.nearbyAria': '搜尋 {name} 周邊',
    'map.poi.objectFallback': '地圖物件',
    'map.poi.route': '查看路線',
    'map.poi.shareAria': '分享 {name}',
    'map.poi.shareOpened': '已開啟系統分享面板',
    'map.poi.shareText': '在雨城通地圖中查看 {name}',
    'map.poi.shareTitle': '{name} - 雨城通地圖',
    'map.poi.shareUnavailable': '目前瀏覽器暫不支援分享或複製',
    'map.poi.summary': '簡介',
    'map.poi.tabsAria': '地點資訊分類',
    'map.poi.unfavoriteAria': '取消收藏 {name}',
    'map.poi.unfavoriteStatus': '已取消收藏 {name}',
    'map.search.aria': '篩選地圖標記',
    'map.search.clear': '清空地圖搜尋',
    'map.search.placeholder': '搜尋地點或標記',
    'map.title': '地圖探索',
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
    'operations.category.all': '全部',
    'operations.category.bus': '公交營運',
    'operations.category.metro': '地鐵營運',
    'operations.category.notice': '通知公告',
    'operations.category.site': '網站公告',
    'operations.category.tram': '有軌營運',
    'operations.category.updates': '營運資訊',
    'operations.categoryAria': '營運資訊分類',
    'operations.emptyAll': '暫無營運資訊',
    'operations.emptyCategory': '暫無{category}營運資訊',
    'operations.emptyFeatured': '暫無已發布重點資訊',
    'operations.expired': '過期消息',
    'operations.featuredAria': '重點資訊',
    'operations.feedAria': '營運資訊列表',
    'operations.itemCount': '{count} 條',
    'operations.noStrongReminder': '暫無生效的強提醒',
    'operations.noTripReminder': '暫無行程提醒',
    'operations.remindersAria': '強提醒面板',
    'operations.strongReminder': '強提醒',
    'operations.validUntil': '有效至 {date}',
    'page.account': '帳號設定',
    'page.map': '地圖探索',
    'page.offline': '離線',
    'page.operations': '營運資訊',
    'page.scheduleSearch': '班次查詢',
    'page.search': '搜尋',
    'page.services': '更多服務',
    'page.ticketOrder': '票務訂單',
    'page.travel': '出行',
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
    'stationDetail.direction.down': '下行',
    'stationDetail.direction.unknown': '方向待補',
    'stationDetail.direction.up': '上行',
    'stationDetail.exits.count': '{count} 個',
    'stationDetail.exits.empty': '暫無出入口資料',
    'stationDetail.exits.noDescription': '暫無描述',
    'stationDetail.exits.title': '出入口',
    'stationDetail.facilities.count': '{count} 項',
    'stationDetail.facilities.empty': '暫無設施資料',
    'stationDetail.facilities.locationUnknown': '位置待補',
    'stationDetail.facilities.title': '站內設施',
    'stationDetail.facilities.toFloor': '至 {floor}',
    'stationDetail.ground': '地面站',
    'stationDetail.layers.count': '{count} 層',
    'stationDetail.layers.empty': '暫無站內層級資料',
    'stationDetail.layers.title': '站內層級',
    'stationDetail.location': '位置 {location}',
    'stationDetail.related.count': '{count} 項',
    'stationDetail.related.empty': '暫無換乘或周邊站點資料',
    'stationDetail.related.surrounding': '周邊站點',
    'stationDetail.related.title': '換乘與周邊',
    'stationDetail.related.transfers': '換乘線路',
    'stationDetail.source': '資料來源：{source}',
    'stationDetail.underground': '地下站',
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
    'ticketCancellation.adminCancelled': '管理員取消',
    'ticketCancellation.inventoryExpired': '占座過期',
    'ticketCancellation.issueFailed': '出票失敗',
    'ticketCancellation.system': '系統取消',
    'ticketCancellation.userCancelled': '使用者取消',
    'ticketOrderDetail.backAccount': '返回帳號',
    'ticketOrderDetail.cancelConfirm': '要取消這個訂單草稿並釋放庫存占用嗎？',
    'ticketOrderDetail.cancelDone': '已取消訂單草稿',
    'ticketOrderDetail.cancelFailed': '訂單草稿取消失敗',
    'ticketOrderDetail.description': '這裡展示服務端訂單草稿和占座狀態，不代表已出票或可核銷憑證。',
    'ticketOrderDetail.field.cancelledAt': '取消時間',
    'ticketOrderDetail.field.cancellationReason': '取消原因',
    'ticketOrderDetail.field.createdAt': '建立時間',
    'ticketOrderDetail.field.fareProductId': '票種 ID',
    'ticketOrderDetail.field.orderId': '訂單 ID',
    'ticketOrderDetail.field.passengerCount': '乘車人數',
    'ticketOrderDetail.field.serviceKind': '服務類型',
    'ticketOrderDetail.field.tripId': '班次 ID',
    'ticketOrderDetail.field.updatedAt': '更新時間',
    'ticketOrderDetail.hold.aria': '庫存占用',
    'ticketOrderDetail.hold.expiresAt': '占用到期',
    'ticketOrderDetail.hold.id': '占用 ID',
    'ticketOrderDetail.hold.none': '目前訂單沒有庫存占用記錄。',
    'ticketOrderDetail.hold.poolId': '庫存池 ID',
    'ticketOrderDetail.hold.quantity': '占用數量',
    'ticketOrderDetail.hold.quantityValue': '{count} 張',
    'ticketOrderDetail.hold.releasedAt': '釋放時間',
    'ticketOrderDetail.hold.status': '占用狀態',
    'ticketOrderDetail.hold.title': '庫存占用',
    'ticketOrderDetail.loading': '正在讀取訂單詳情',
    'ticketOrderDetail.orderTitle': '訂單 {id}',
    'ticketOrderDetail.readFailed': '訂單詳情讀取失敗',
    'ticketOrderDetail.refresh': '刷新狀態',
    'ticketOrderDetail.retry': '重新讀取',
    'ticketOrderDetail.unavailable': '訂單詳情暫不可用',
    'ticketOrderDraft.cancelDraft': '取消草稿',
    'ticketOrderDraft.canceling': '取消中',
    'ticketOrderDraft.description': '僅顯示占座中的草稿訂單，不代表已出票。',
    'ticketOrderDraft.details': '詳情',
    'ticketOrderDraft.empty': '暫無訂單草稿。',
    'ticketOrderDraft.holdUntil': '占用至 {time}',
    'ticketOrderDraft.loading': '正在讀取訂單草稿',
    'ticketOrderDraft.noHold': '無庫存占用',
    'ticketOrderDraft.orderFallback': '訂單 {id}',
    'ticketOrderDraft.passengerCount': '{count}人',
    'ticketOrderDraft.refresh': '刷新訂單草稿',
    'ticketOrderDraft.serviceTrip': '{service}班次',
    'ticketOrderDraft.stopCount': '{count} 站',
    'ticketOrderDraft.title': '我的票務草稿',
    'ticketOrderStatus.cancelled': '已取消',
    'ticketOrderStatus.checkedIn': '已檢票',
    'ticketOrderStatus.completed': '已完成',
    'ticketOrderStatus.draft': '草稿',
    'ticketOrderStatus.expired': '已過期',
    'ticketOrderStatus.issued': '已出票',
    'ticketOrderStatus.manualReview': '人工審核',
    'ticketOrderStatus.pendingIssue': '待出票',
    'ticketOrderStatus.refundRequested': '已申請退票',
    'ticketOrderStatus.refunded': '已退票',
    'ticketService.coach': '客運',
    'ticketService.custom': '其他',
    'ticketService.ferry': '輪渡',
    'ticketService.flight': '航班',
    'ticketService.railway': '鐵路',
    'tripReminder.action.cancel': '取消提醒',
    'tripReminder.action.complete': '標記完成',
    'tripReminder.action.delete': '刪除記錄',
    'tripReminder.activeEmpty': '暫無即將進行的行程。',
    'tripReminder.activeTitle': '即將進行',
    'tripReminder.add': '新增提醒',
    'tripReminder.close': '關閉',
    'tripReminder.error.invalidTime': '請選擇有效的提醒時間。',
    'tripReminder.error.missingContent': '至少填寫標題、線路或起終點之一。',
    'tripReminder.field.arrival': '到達',
    'tripReminder.field.departure': '出發',
    'tripReminder.field.lineName': '線路',
    'tripReminder.field.remindAt': '提醒時間',
    'tripReminder.field.title': '標題',
    'tripReminder.formTitle': '新增行程提醒',
    'tripReminder.historyEmpty': '暫無歷史行程。',
    'tripReminder.historyTitle': '歷史行程',
    'tripReminder.imported': '已從舊站本機 {source} 匯入 {count} 條行程記錄。',
    'tripReminder.loading': '正在讀取本機行程',
    'tripReminder.localBadge': '{count} 個本機記錄',
    'tripReminder.placeholder.optional': '可選',
    'tripReminder.placeholder.title': '例如：去大學城',
    'tripReminder.routeMissing': '未填寫路線資訊',
    'tripReminder.source.legacy': '舊站匯入',
    'tripReminder.source.local': '本機儲存',
    'tripReminder.status.cancelled': '已取消',
    'tripReminder.status.completed': '已完成',
    'tripReminder.status.expired': '已過期',
    'tripReminder.status.notificationQueued': '待推送',
    'tripReminder.status.notified': '已提醒',
    'tripReminder.status.ongoing': '進行中',
    'tripReminder.status.scheduled': '待提醒',
    'tripReminder.status.sent': '已發送',
    'tripReminder.summary': '{scheduled} 個即將進行，{history} 個歷史記錄',
    'tripReminder.title': '行程提醒',
    'travelSchedule.action.addReminder': '新增提醒',
    'travelSchedule.action.legacyReference': '舊版參考',
    'travelSchedule.action.saveRecord': '儲存記錄',
    'travelSchedule.empty.noMatch': '沒有符合的班次',
    'travelSchedule.feedback.historySaved': '已儲存到本機班次記錄',
    'travelSchedule.feedback.reminderAdded': '已新增 {time} 的本機提醒',
    'travelSchedule.filter.anyDestination': '任意終點',
    'travelSchedule.filter.anyOrigin': '任意起點',
    'travelSchedule.filter.anyStation': '任意車站',
    'travelSchedule.filter.date': '日期',
    'travelSchedule.filter.destination': '終點',
    'travelSchedule.filter.origin': '起點',
    'travelSchedule.filter.via': '經過',
    'travelSchedule.filters.aria': '班次篩選',
    'travelSchedule.history.clear': '清空班次記錄',
    'travelSchedule.history.clearConfirm': '要清空本機班次查詢歷史嗎？行程提醒不會被刪除。',
    'travelSchedule.history.recentAria': '最近班次記錄',
    'travelSchedule.history.summary': '{count} 條，{reminderCount} 條已關聯提醒',
    'travelSchedule.history.title': '本機班次記錄',
    'travelSchedule.notice.aria': '班次公告',
    'travelSchedule.notice.count': '{count} 條',
    'travelSchedule.notice.title': '客運提醒',
    'travelSchedule.order.cancelConfirm': '要取消這個訂單草稿並釋放庫存佔用嗎？',
    'travelSchedule.order.cancelDone': '已取消訂單草稿',
    'travelSchedule.order.cancelFailed': '訂單草稿取消失敗',
    'travelSchedule.order.canceling': '正在取消訂單草稿',
    'travelSchedule.order.createFailed': '訂單草稿建立失敗',
    'travelSchedule.order.created': '已建立訂單草稿，庫存佔用至 {expiresAt}',
    'travelSchedule.order.creating': '正在建立訂單草稿',
    'travelSchedule.order.empty': '暫無訂單草稿。',
    'travelSchedule.order.loginRequired': '登入後可查看訂單草稿。',
    'travelSchedule.order.readFailed': '訂單草稿讀取失敗',
    'travelSchedule.order.unavailable': '目前班次暫不可建立訂單草稿',
    'travelSchedule.resultCount': '{count} / {total} 個可查詢班次',
    'travelSchedule.search.aria': '搜尋班次、線路、車站、檢票口或營運方',
    'travelSchedule.search.clear': '清空班次搜尋',
    'travelSchedule.search.placeholder': '搜尋班次、線路、車站或營運方',
    'travelSchedule.service.all': '全部',
    'travelSchedule.service.aria': '交通方式',
    'travelSchedule.service.unavailable': '未接入',
    'travelSchedule.ticketing.createDraft': '建立草稿',
    'travelSchedule.ticketing.creating': '建立中',
    'travelSchedule.ticketing.inventoryPending': '庫存待設定',
    'travelSchedule.ticketing.legacyReference': '舊版參考可用',
    'travelSchedule.ticketing.pending': '新票務待接入',
    'travelSchedule.ticketing.soldOut': '暫無餘票',
    'travelSchedule.ticketing.statusMissing': '新版票務狀態尚未返回。',
    'travelSchedule.ticketing.unavailable': '暫不可訂',
    'travelSchedule.time.all': '全部',
    'travelSchedule.time.aria': '時間篩選',
    'travelSchedule.time.past': '已過',
    'travelSchedule.time.upcoming': '即將',
    'travelSchedule.title': '統一班次查詢',
    'travelSchedule.trip.aircraftType': '機型',
    'travelSchedule.trip.arrivalTime': '到達時間',
    'travelSchedule.trip.arrivalUnknown': '到達地點待公布',
    'travelSchedule.trip.boardingGate': '登船口',
    'travelSchedule.trip.checkInArrival': '值機/到達',
    'travelSchedule.trip.departureTime': '出發時間',
    'travelSchedule.trip.departureUnknown': '出發地點待公布',
    'travelSchedule.trip.direct': '直達',
    'travelSchedule.trip.fare': '票價',
    'travelSchedule.trip.gate': '檢票口',
    'travelSchedule.trip.operatingDays': '運行日',
    'travelSchedule.trip.operator': '營運',
    'travelSchedule.trip.runtimeUnknown': '運行時間待公布',
    'travelSchedule.trip.timeUnknown': '待定',
    'travelSchedule.trip.toBeAnnounced': '待公布',
    'travelSchedule.trip.vehicleType': '車型',
    'travelSchedule.trip.vesselType': '船型',
    'travelSchedule.trip.via': '經停 {stations}',
    'travelSchedule.trip.viaMany': '經停 {stations} 等 {count} 站',
    'travelSchedule.tripList.aria': '班次列表',
    'travelSchedule.weekday.everyday': '每日',
    'travelSchedule.weekday.fri': '週五',
    'travelSchedule.weekday.mon': '週一',
    'travelSchedule.weekday.sat': '週六',
    'travelSchedule.weekday.sun': '週日',
    'travelSchedule.weekday.thu': '週四',
    'travelSchedule.weekday.tue': '週二',
    'travelSchedule.weekday.wed': '週三',
    'travel.schedules.action': '查詢班次',
    'travel.schedules.detail':
      '客運 {tripCount} 個班次，{stationCount} 個車站；輪渡與航班預留統一入口',
    'travel.schedules.title': '班次查詢',
    'travel.map.action': '打開地圖',
    'travel.map.detail': '在地圖中查看線路、站點、接駁和地點詳情',
    'travel.map.title': '線路與站點',
    'travel.screen.action': '查看大屏',
    'travel.screen.detail': '{gateCount} 個檢票口資料，展示近期客運班次與營運提示',
    'travel.screen.title': '智運大屏',
    'travel.services.subtitle': '班次查詢、線路站點、客運展示與後續票務入口',
    'travel.services.title': '出行服務',
    'travel.subtitle': '提醒、班次與後續票務',
    'travel.ticketing.action': '待接入',
    'travel.ticketing.detail': '真實電子票、檢票、退票和乘車碼後續接入臨東通',
    'travel.ticketing.title': '票券與訂單',
  },
  en: {
    'account.settings': 'Account Settings',
    'account.status.anonymous': 'Not signed in',
    'account.status.notConfigured': 'Ldpass is not configured',
    'account.status.readonly': 'Read-only account',
    'account.status.unavailable': 'Account status unavailable',
    'brand.home': 'Yuchengtong Home',
    'inventoryHoldStatus.cancelled': 'Cancelled',
    'inventoryHoldStatus.confirmed': 'Confirmed',
    'inventoryHoldStatus.expired': 'Expired',
    'inventoryHoldStatus.held': 'Held',
    'inventoryHoldStatus.released': 'Released',
    'lineDetail.directionAria': 'Line direction',
    'lineDetail.directionTo': 'To {station}',
    'lineDetail.extra.departures': '{count} departures',
    'lineDetail.extra.fare': 'Fare {fare}',
    'lineDetail.extra.stations': '{count} stops',
    'lineDetail.extra.stopMetadata': '{count} stop attributes',
    'lineDetail.extraAttributes': 'Other line attributes',
    'lineDetail.firstLast': 'First / Last service',
    'lineDetail.firstStation': 'First stop',
    'lineDetail.lastStation': 'Last stop',
    'lineDetail.metroSuffix': 'Line',
    'lineDetail.oneWay.forward': 'Forward only',
    'lineDetail.oneWay.reverse': 'Reverse only',
    'lineDetail.operator': 'Operator',
    'lineDetail.overviewAria': 'Line overview',
    'lineDetail.source': 'Data source: {source}',
    'lineDetail.stationList': 'Stop list',
    'lineDetail.stationListEmpty': 'No stop list has been imported for this line yet',
    'lineDetail.summary.exits': '{count} exits',
    'lineDetail.summary.facilities': '{count} facility types',
    'lineDetail.summary.surrounding': '{count} nearby stops',
    'lineDetail.summary.transfer': 'Transfer to {lines}',
    'lineDetail.toBeAdded': 'To be added',
    'map.category.all': 'All',
    'map.category.favorites': 'Favorites',
    'map.categoryFilter.aria': 'Filter map marker categories',
    'map.categoryFilter.collapse': 'Collapse category filters',
    'map.categoryFilter.expand': 'Expand category filters',
    'map.empty.favorites': 'No favorite places yet',
    'map.empty.loading': 'Loading map markers',
    'map.empty.nearby': 'No nearby markers to show',
    'map.empty.noMatch': 'No matching markers',
    'map.markerList.count': '{count} items',
    'map.markerList.default': 'Map Markers',
    'map.markerList.nearby': 'Near {name}',
    'map.markerList.results': 'Search Results',
    'map.nearby.exit': 'Exit',
    'map.nearby.note': 'Showing markers near {name} by distance',
    'map.poi.actions': 'Place actions',
    'map.poi.close': 'Close place details',
    'map.poi.collapse': 'Collapse place details',
    'map.poi.copyStatus': 'Copied place link',
    'map.poi.expand': 'Expand place details',
    'map.poi.facilities': 'Facilities and Exits',
    'map.poi.favoriteAria': 'Favorite {name}',
    'map.poi.favoriteStatus': 'Added {name} to favorites',
    'map.poi.nearbyAria': 'Search near {name}',
    'map.poi.objectFallback': 'Map object',
    'map.poi.route': 'Directions',
    'map.poi.shareAria': 'Share {name}',
    'map.poi.shareOpened': 'Opened the system share sheet',
    'map.poi.shareText': 'View {name} on Yuchengtong Map',
    'map.poi.shareTitle': '{name} - Yuchengtong Map',
    'map.poi.shareUnavailable': 'This browser does not support sharing or copying yet',
    'map.poi.summary': 'Overview',
    'map.poi.tabsAria': 'Place detail sections',
    'map.poi.unfavoriteAria': 'Remove {name} from favorites',
    'map.poi.unfavoriteStatus': 'Removed {name} from favorites',
    'map.search.aria': 'Filter map markers',
    'map.search.clear': 'Clear map search',
    'map.search.placeholder': 'Search places or markers',
    'map.title': 'Map Explore',
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
    'operations.category.all': 'All',
    'operations.category.bus': 'Bus Updates',
    'operations.category.metro': 'Metro Updates',
    'operations.category.notice': 'Notices',
    'operations.category.site': 'Site Notices',
    'operations.category.tram': 'Tram Updates',
    'operations.category.updates': 'Updates',
    'operations.categoryAria': 'Update categories',
    'operations.emptyAll': 'No updates yet',
    'operations.emptyCategory': 'No {category} yet',
    'operations.emptyFeatured': 'No featured updates published yet',
    'operations.expired': 'Expired Updates',
    'operations.featuredAria': 'Featured update',
    'operations.feedAria': 'Updates list',
    'operations.itemCount': '{count} items',
    'operations.noStrongReminder': 'No active reminders',
    'operations.noTripReminder': 'No trip reminders',
    'operations.remindersAria': 'Important reminders',
    'operations.strongReminder': 'Important reminders',
    'operations.validUntil': 'Valid until {date}',
    'page.account': 'Account Settings',
    'page.map': 'Map Explore',
    'page.offline': 'Offline',
    'page.operations': 'Updates',
    'page.scheduleSearch': 'Schedule Search',
    'page.search': 'Search',
    'page.services': 'More Services',
    'page.ticketOrder': 'Ticket Order',
    'page.travel': 'Travel',
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
    'settings.language.zhCN': '简体中文',
    'settings.language.zhHant': '繁體中文',
    'settings.motion.full': 'On',
    'settings.motion.group': 'Motion',
    'settings.motion.label': 'Motion',
    'settings.motion.reduced': 'Off',
    'settings.motion.system': 'Follow system',
    'settings.theme.dark': 'Dark',
    'settings.theme.label': 'Theme',
    'settings.theme.light': 'Light',
    'settings.theme.system': 'Follow system',
    'stationDetail.direction.down': 'Downbound',
    'stationDetail.direction.unknown': 'Direction to be added',
    'stationDetail.direction.up': 'Upbound',
    'stationDetail.exits.count': '{count} exits',
    'stationDetail.exits.empty': 'No exit data yet',
    'stationDetail.exits.noDescription': 'No description yet',
    'stationDetail.exits.title': 'Exits',
    'stationDetail.facilities.count': '{count} facilities',
    'stationDetail.facilities.empty': 'No facility data yet',
    'stationDetail.facilities.locationUnknown': 'Location to be added',
    'stationDetail.facilities.title': 'Station Facilities',
    'stationDetail.facilities.toFloor': 'To {floor}',
    'stationDetail.ground': 'Above-ground station',
    'stationDetail.layers.count': '{count} levels',
    'stationDetail.layers.empty': 'No station level data yet',
    'stationDetail.layers.title': 'Station Levels',
    'stationDetail.location': 'Location {location}',
    'stationDetail.related.count': '{count} items',
    'stationDetail.related.empty': 'No transfer or nearby station data yet',
    'stationDetail.related.surrounding': 'Nearby Stations',
    'stationDetail.related.title': 'Transfers and Nearby',
    'stationDetail.related.transfers': 'Transfer Lines',
    'stationDetail.source': 'Data source: {source}',
    'stationDetail.underground': 'Underground station',
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
    'ticketCancellation.adminCancelled': 'Cancelled by admin',
    'ticketCancellation.inventoryExpired': 'Inventory hold expired',
    'ticketCancellation.issueFailed': 'Issue failed',
    'ticketCancellation.system': 'System cancelled',
    'ticketCancellation.userCancelled': 'Cancelled by user',
    'ticketOrderDetail.backAccount': 'Back to account',
    'ticketOrderDetail.cancelConfirm': 'Cancel this order draft and release the held inventory?',
    'ticketOrderDetail.cancelDone': 'Order draft cancelled',
    'ticketOrderDetail.cancelFailed': 'Failed to cancel order draft',
    'ticketOrderDetail.description':
      'This page shows the server-side order draft and seat-hold status. It is not an issued or check-in credential.',
    'ticketOrderDetail.field.cancelledAt': 'Cancelled at',
    'ticketOrderDetail.field.cancellationReason': 'Cancellation reason',
    'ticketOrderDetail.field.createdAt': 'Created at',
    'ticketOrderDetail.field.fareProductId': 'Fare product ID',
    'ticketOrderDetail.field.orderId': 'Order ID',
    'ticketOrderDetail.field.passengerCount': 'Passengers',
    'ticketOrderDetail.field.serviceKind': 'Service type',
    'ticketOrderDetail.field.tripId': 'Trip ID',
    'ticketOrderDetail.field.updatedAt': 'Updated at',
    'ticketOrderDetail.hold.aria': 'Inventory hold',
    'ticketOrderDetail.hold.expiresAt': 'Hold expires',
    'ticketOrderDetail.hold.id': 'Hold ID',
    'ticketOrderDetail.hold.none': 'This order has no inventory hold record.',
    'ticketOrderDetail.hold.poolId': 'Inventory pool ID',
    'ticketOrderDetail.hold.quantity': 'Held quantity',
    'ticketOrderDetail.hold.quantityValue': '{count} tickets',
    'ticketOrderDetail.hold.releasedAt': 'Released at',
    'ticketOrderDetail.hold.status': 'Hold status',
    'ticketOrderDetail.hold.title': 'Inventory Hold',
    'ticketOrderDetail.loading': 'Reading order details',
    'ticketOrderDetail.orderTitle': 'Order {id}',
    'ticketOrderDetail.readFailed': 'Failed to read order details',
    'ticketOrderDetail.refresh': 'Refresh status',
    'ticketOrderDetail.retry': 'Retry',
    'ticketOrderDetail.unavailable': 'Order details unavailable',
    'ticketOrderDraft.cancelDraft': 'Cancel draft',
    'ticketOrderDraft.canceling': 'Cancelling',
    'ticketOrderDraft.description': 'Only seat-hold drafts are shown. They are not issued tickets.',
    'ticketOrderDraft.details': 'Details',
    'ticketOrderDraft.empty': 'No order drafts yet.',
    'ticketOrderDraft.holdUntil': 'Held until {time}',
    'ticketOrderDraft.loading': 'Reading order drafts',
    'ticketOrderDraft.noHold': 'No inventory hold',
    'ticketOrderDraft.orderFallback': 'Order {id}',
    'ticketOrderDraft.passengerCount': '{count} passengers',
    'ticketOrderDraft.refresh': 'Refresh order drafts',
    'ticketOrderDraft.serviceTrip': '{service} trip',
    'ticketOrderDraft.stopCount': '{count} stops',
    'ticketOrderDraft.title': 'My Ticket Drafts',
    'ticketOrderStatus.cancelled': 'Cancelled',
    'ticketOrderStatus.checkedIn': 'Checked in',
    'ticketOrderStatus.completed': 'Completed',
    'ticketOrderStatus.draft': 'Draft',
    'ticketOrderStatus.expired': 'Expired',
    'ticketOrderStatus.issued': 'Issued',
    'ticketOrderStatus.manualReview': 'Manual review',
    'ticketOrderStatus.pendingIssue': 'Pending issue',
    'ticketOrderStatus.refundRequested': 'Refund requested',
    'ticketOrderStatus.refunded': 'Refunded',
    'ticketService.coach': 'Coach',
    'ticketService.custom': 'Other',
    'ticketService.ferry': 'Ferry',
    'ticketService.flight': 'Flight',
    'ticketService.railway': 'Railway',
    'tripReminder.action.cancel': 'Cancel reminder',
    'tripReminder.action.complete': 'Mark completed',
    'tripReminder.action.delete': 'Delete record',
    'tripReminder.activeEmpty': 'No upcoming trips.',
    'tripReminder.activeTitle': 'Upcoming',
    'tripReminder.add': 'Add reminder',
    'tripReminder.close': 'Close',
    'tripReminder.error.invalidTime': 'Choose a valid reminder time.',
    'tripReminder.error.missingContent': 'Enter at least a title, line, origin, or destination.',
    'tripReminder.field.arrival': 'Arrival',
    'tripReminder.field.departure': 'Departure',
    'tripReminder.field.lineName': 'Line',
    'tripReminder.field.remindAt': 'Reminder time',
    'tripReminder.field.title': 'Title',
    'tripReminder.formTitle': 'Add Trip Reminder',
    'tripReminder.historyEmpty': 'No trip history.',
    'tripReminder.historyTitle': 'Trip History',
    'tripReminder.imported': 'Imported {count} trip records from legacy local {source}.',
    'tripReminder.loading': 'Reading local trips',
    'tripReminder.localBadge': '{count} local records',
    'tripReminder.placeholder.optional': 'Optional',
    'tripReminder.placeholder.title': 'Example: Go to University Town',
    'tripReminder.routeMissing': 'No route information',
    'tripReminder.source.legacy': 'Legacy import',
    'tripReminder.source.local': 'Saved locally',
    'tripReminder.status.cancelled': 'Cancelled',
    'tripReminder.status.completed': 'Completed',
    'tripReminder.status.expired': 'Expired',
    'tripReminder.status.notificationQueued': 'Push queued',
    'tripReminder.status.notified': 'Reminded',
    'tripReminder.status.ongoing': 'Ongoing',
    'tripReminder.status.scheduled': 'Scheduled',
    'tripReminder.status.sent': 'Sent',
    'tripReminder.summary': '{scheduled} upcoming, {history} history records',
    'tripReminder.title': 'Trip Reminders',
    'travelSchedule.action.addReminder': 'Add reminder',
    'travelSchedule.action.legacyReference': 'Legacy reference',
    'travelSchedule.action.saveRecord': 'Save record',
    'travelSchedule.empty.noMatch': 'No matching trips',
    'travelSchedule.feedback.historySaved': 'Saved to local schedule history',
    'travelSchedule.feedback.reminderAdded': 'Added a local reminder for {time}',
    'travelSchedule.filter.anyDestination': 'Any destination',
    'travelSchedule.filter.anyOrigin': 'Any origin',
    'travelSchedule.filter.anyStation': 'Any station',
    'travelSchedule.filter.date': 'Date',
    'travelSchedule.filter.destination': 'Destination',
    'travelSchedule.filter.origin': 'Origin',
    'travelSchedule.filter.via': 'Via',
    'travelSchedule.filters.aria': 'Schedule filters',
    'travelSchedule.history.clear': 'Clear schedule history',
    'travelSchedule.history.clearConfirm':
      'Clear local schedule search history? Trip reminders will not be deleted.',
    'travelSchedule.history.recentAria': 'Recent schedule records',
    'travelSchedule.history.summary': '{count} records, {reminderCount} linked to reminders',
    'travelSchedule.history.title': 'Local Schedule History',
    'travelSchedule.notice.aria': 'Schedule notice',
    'travelSchedule.notice.count': '{count} items',
    'travelSchedule.notice.title': 'Coach Notices',
    'travelSchedule.order.cancelConfirm':
      'Cancel this order draft and release the held inventory?',
    'travelSchedule.order.cancelDone': 'Order draft cancelled',
    'travelSchedule.order.cancelFailed': 'Failed to cancel order draft',
    'travelSchedule.order.canceling': 'Cancelling order draft',
    'travelSchedule.order.createFailed': 'Failed to create order draft',
    'travelSchedule.order.created': 'Order draft created. Inventory held until {expiresAt}',
    'travelSchedule.order.creating': 'Creating order draft',
    'travelSchedule.order.empty': 'No order drafts yet.',
    'travelSchedule.order.loginRequired': 'Sign in to view order drafts.',
    'travelSchedule.order.readFailed': 'Failed to read order drafts',
    'travelSchedule.order.unavailable': 'This trip cannot create an order draft yet',
    'travelSchedule.resultCount': '{count} / {total} searchable trips',
    'travelSchedule.search.aria': 'Search trips, lines, stations, gates, or operators',
    'travelSchedule.search.clear': 'Clear schedule search',
    'travelSchedule.search.placeholder': 'Search trips, lines, stations, or operators',
    'travelSchedule.service.all': 'All',
    'travelSchedule.service.aria': 'Transport modes',
    'travelSchedule.service.unavailable': 'Not connected',
    'travelSchedule.ticketing.createDraft': 'Create draft',
    'travelSchedule.ticketing.creating': 'Creating',
    'travelSchedule.ticketing.inventoryPending': 'Inventory pending',
    'travelSchedule.ticketing.legacyReference': 'Legacy reference available',
    'travelSchedule.ticketing.pending': 'New ticketing pending',
    'travelSchedule.ticketing.soldOut': 'Sold out',
    'travelSchedule.ticketing.statusMissing': 'New ticketing status has not returned yet.',
    'travelSchedule.ticketing.unavailable': 'Unavailable',
    'travelSchedule.time.all': 'All',
    'travelSchedule.time.aria': 'Time filter',
    'travelSchedule.time.past': 'Past',
    'travelSchedule.time.upcoming': 'Upcoming',
    'travelSchedule.title': 'Unified Schedule Search',
    'travelSchedule.trip.aircraftType': 'Aircraft',
    'travelSchedule.trip.arrivalTime': 'Arrival Time',
    'travelSchedule.trip.arrivalUnknown': 'Arrival place to be announced',
    'travelSchedule.trip.boardingGate': 'Boarding gate',
    'travelSchedule.trip.checkInArrival': 'Check-in / arrival',
    'travelSchedule.trip.departureTime': 'Departure Time',
    'travelSchedule.trip.departureUnknown': 'Departure place to be announced',
    'travelSchedule.trip.direct': 'Direct',
    'travelSchedule.trip.fare': 'Fare',
    'travelSchedule.trip.gate': 'Gate',
    'travelSchedule.trip.operatingDays': 'Operating days',
    'travelSchedule.trip.operator': 'Operator',
    'travelSchedule.trip.runtimeUnknown': 'Runtime to be announced',
    'travelSchedule.trip.timeUnknown': 'TBD',
    'travelSchedule.trip.toBeAnnounced': 'To be announced',
    'travelSchedule.trip.vehicleType': 'Vehicle',
    'travelSchedule.trip.vesselType': 'Vessel',
    'travelSchedule.trip.via': 'Via {stations}',
    'travelSchedule.trip.viaMany': 'Via {stations} and {count} stops total',
    'travelSchedule.tripList.aria': 'Schedule list',
    'travelSchedule.weekday.everyday': 'Daily',
    'travelSchedule.weekday.fri': 'Fri',
    'travelSchedule.weekday.mon': 'Mon',
    'travelSchedule.weekday.sat': 'Sat',
    'travelSchedule.weekday.sun': 'Sun',
    'travelSchedule.weekday.thu': 'Thu',
    'travelSchedule.weekday.tue': 'Tue',
    'travelSchedule.weekday.wed': 'Wed',
    'travel.schedules.action': 'Search schedules',
    'travel.schedules.detail':
      'Coach: {tripCount} trips and {stationCount} stations. Ferry and flight entries are reserved for the unified platform.',
    'travel.schedules.title': 'Schedule Search',
    'travel.map.action': 'Open map',
    'travel.map.detail': 'View lines, stations, connections, and place details on the map.',
    'travel.map.title': 'Lines and Stations',
    'travel.screen.action': 'View board',
    'travel.screen.detail':
      '{gateCount} check-in gates with recent coach trips and update notices.',
    'travel.screen.title': 'Operations Board',
    'travel.services.subtitle':
      'Schedule search, line and station map, coach board, and future ticketing entry points',
    'travel.services.title': 'Travel Services',
    'travel.subtitle': 'Reminders, schedules, and future ticketing',
    'travel.ticketing.action': 'Planned',
    'travel.ticketing.detail':
      'Real e-tickets, check-in, refunds, and ride code integration will connect to ldpass later.',
    'travel.ticketing.title': 'Tickets and Orders',
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
