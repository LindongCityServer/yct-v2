'use client';

import type { LocaleCode } from '@yct/contracts';
import { useEffect, useMemo, useState } from 'react';
import {
  localePreferenceChangedEventName,
  readLocalLocalePreference,
} from './client-locale-preference';

type MapCategoryMessageKey =
  | 'map.categoryName.airport'
  | 'map.categoryName.busStop'
  | 'map.categoryName.coachStation'
  | 'map.categoryName.commerce'
  | 'map.categoryName.dining'
  | 'map.categoryName.education'
  | 'map.categoryName.facility'
  | 'map.categoryName.ferryPort'
  | 'map.categoryName.industry'
  | 'map.categoryName.mapMarker'
  | 'map.categoryName.medical'
  | 'map.categoryName.metroEntrance'
  | 'map.categoryName.metroStation'
  | 'map.categoryName.museum'
  | 'map.categoryName.park'
  | 'map.categoryName.parking'
  | 'map.categoryName.player'
  | 'map.categoryName.publicService'
  | 'map.categoryName.railway'
  | 'map.categoryName.railwayStation'
  | 'map.categoryName.residence'
  | 'map.categoryName.road'
  | 'map.categoryName.scenery'
  | 'map.categoryName.sports'
  | 'map.categoryName.tramStation'
  | 'map.categoryName.transitLine'
  | 'map.categoryName.water';

export type CommonMessageKey =
  | MapCategoryMessageKey
  | 'account.offlinePackage.area'
  | 'account.offlinePackage.bounds'
  | 'account.offlinePackage.close'
  | 'account.offlinePackage.delete'
  | 'account.offlinePackage.deleteAria'
  | 'account.offlinePackage.deleteConfirm'
  | 'account.offlinePackage.description'
  | 'account.offlinePackage.empty'
  | 'account.offlinePackage.error.emptyArea'
  | 'account.offlinePackage.error.invalidBounds'
  | 'account.offlinePackage.error.missingName'
  | 'account.offlinePackage.lastRefreshed'
  | 'account.offlinePackage.listAria'
  | 'account.offlinePackage.maxX'
  | 'account.offlinePackage.maxZ'
  | 'account.offlinePackage.minX'
  | 'account.offlinePackage.minZ'
  | 'account.offlinePackage.name'
  | 'account.offlinePackage.namePlaceholder'
  | 'account.offlinePackage.newRange'
  | 'account.offlinePackage.refresh'
  | 'account.offlinePackage.refreshing'
  | 'account.offlinePackage.save'
  | 'account.offlinePackage.strategyNote'
  | 'account.offlinePackage.status.baseCacheRefreshed'
  | 'account.offlinePackage.status.refreshFailed'
  | 'account.offlinePackage.status.registered'
  | 'account.offlinePackage.status.requestFailed'
  | 'account.offlinePackage.status.serverRequested'
  | 'account.offlinePackage.summary.area'
  | 'account.offlinePackage.summary.refreshed'
  | 'account.offlinePackage.summary.total'
  | 'account.offlinePackage.title'
  | 'account.cache.offlineDeletedAll'
  | 'account.cache.offlineDeletedLocalOnly'
  | 'account.cache.offlineRefreshFailed'
  | 'account.cache.refreshFailed'
  | 'account.cache.refreshingOfflineBase'
  | 'account.error.offlinePackageRequestFailed'
  | 'account.error.offlineScopeDeleteFailed'
  | 'account.error.offlineScopeUnavailable'
  | 'account.error.pushPreferenceUnavailable'
  | 'account.error.tripReminderDeleteFailed'
  | 'account.error.tripRemindersUnavailable'
  | 'account.push.insecureContext'
  | 'account.push.loginRequired'
  | 'account.push.missingKeys'
  | 'account.push.missingPublicKey'
  | 'account.push.permissionDenied'
  | 'account.push.registerFailed'
  | 'account.push.revokeFailed'
  | 'account.push.serviceWorkerNotReady'
  | 'account.push.unknownHost'
  | 'account.push.unsupported'
  | 'account.error.cacheRefreshFailed'
  | 'account.about.currentVersion'
  | 'account.about.github'
  | 'account.about.mcpCopied'
  | 'account.about.mcpCopy'
  | 'account.about.mcpDescription'
  | 'account.about.mcpTitle'
  | 'account.about.title'
  | 'account.about.viewChangelog'
  | 'account.auth.adminOperations'
  | 'account.auth.adminPortal'
  | 'account.auth.adminPoi'
  | 'account.auth.adminServices'
  | 'account.auth.adminTransit'
  | 'account.auth.defaultTitle'
  | 'account.auth.introConfigured'
  | 'account.auth.introNotConfigured'
  | 'account.auth.ldpassAccount'
  | 'account.auth.localAdminLogin'
  | 'account.auth.localAdminLoginHint'
  | 'account.auth.login'
  | 'account.auth.logout'
  | 'account.auth.readonlyStatus'
  | 'account.auth.serverUnverified'
  | 'account.auth.serverVerified'
  | 'account.auth.serverVerifiedWithName'
  | 'account.authStatus.ldpassNotConfigured'
  | 'account.authStatus.loggedOut'
  | 'account.authStatus.loginSuccess'
  | 'account.authStatus.readonly'
  | 'account.authStatus.sessionCookieMissing'
  | 'account.authStatus.sessionError'
  | 'account.authStatus.sessionUnavailable'
  | 'account.authStatus.sessionUnavailableLocalhost'
  | 'account.authStatus.stateInvalid'
  | 'account.history.action.clearLocal'
  | 'account.history.action.manageTrips'
  | 'account.history.action.revokeLegacy'
  | 'account.history.action.revokingLegacy'
  | 'account.history.action.searchSchedules'
  | 'account.history.action.sync'
  | 'account.history.action.syncing'
  | 'account.history.action.viewMap'
  | 'account.history.clearConfirm'
  | 'account.history.legacyRevokeConfirmLocal'
  | 'account.history.legacyRevokeConfirmWithAccount'
  | 'account.history.legacyRevokeDeleteFailed'
  | 'account.history.legacyRevokeDeleted'
  | 'account.history.legacyRevokeDeleting'
  | 'account.history.legacyRevokeDone'
  | 'account.history.legacyRevokeNoCopies'
  | 'account.history.legacySyncConfirm'
  | 'account.history.legacySyncKept'
  | 'account.history.loadedFromAccount'
  | 'account.history.loading'
  | 'account.history.mapFavorites'
  | 'account.history.noSyncNeeded'
  | 'account.history.pendingSync'
  | 'account.history.scheduleRecords'
  | 'account.history.syncDone'
  | 'account.history.syncDoneWithSkipped'
  | 'account.history.syncFailed'
  | 'account.history.syncing'
  | 'account.history.title'
  | 'account.history.total'
  | 'account.history.tripHistory'
  | 'account.history.upcomingTrips'
  | 'account.notification.checkinDescription'
  | 'account.notification.checkinLabel'
  | 'account.notification.disabled'
  | 'account.notification.enabled'
  | 'account.notification.gridAria'
  | 'account.notification.masterLabelDisabled'
  | 'account.notification.masterLabelEnabled'
  | 'account.notification.note'
  | 'account.notification.operationsDescription'
  | 'account.notification.operationsLabel'
  | 'account.notification.quietEnd'
  | 'account.notification.quietStart'
  | 'account.notification.statusDisabledPreference'
  | 'account.notification.statusLoginRequired'
  | 'account.notification.statusRegistered'
  | 'account.notification.statusRegistering'
  | 'account.notification.statusRevoked'
  | 'account.notification.statusRevoking'
  | 'account.notification.statusSyncFailed'
  | 'account.notification.ticketDescription'
  | 'account.notification.ticketLabel'
  | 'account.notification.title'
  | 'account.notification.tripDescription'
  | 'account.notification.tripLabel'
  | 'account.pwa.action.clearCache'
  | 'account.pwa.action.install'
  | 'account.pwa.action.refreshCache'
  | 'account.pwa.cacheChecking'
  | 'account.pwa.cacheClearing'
  | 'account.pwa.cacheEmpty'
  | 'account.pwa.cacheItems'
  | 'account.pwa.cacheRefreshing'
  | 'account.pwa.cacheUnavailable'
  | 'account.pwa.description'
  | 'account.pwa.descriptionPrefix'
  | 'account.pwa.status.checking'
  | 'account.pwa.status.installed'
  | 'account.pwa.status.installable'
  | 'account.pwa.status.manual'
  | 'account.pwa.status.unsupported'
  | 'account.pwa.statusDescription.checking'
  | 'account.pwa.statusDescription.installed'
  | 'account.pwa.statusDescription.installable'
  | 'account.pwa.statusDescription.manual'
  | 'account.pwa.statusDescription.unsupported'
  | 'account.pwa.title'
  | 'account.settings'
  | 'account.ticketDraft.count'
  | 'account.ticketDraft.readonly'
  | 'account.status.anonymous'
  | 'account.status.notConfigured'
  | 'account.status.readonly'
  | 'account.status.unavailable'
  | 'brand.home'
  | 'changelog.category.feat'
  | 'changelog.category.fix'
  | 'changelog.category.perf'
  | 'changelog.category.style'
  | 'changelog.changeCount'
  | 'changelog.empty'
  | 'changelog.title'
  | 'contentPoiBinding.empty'
  | 'contentPoiBinding.hint'
  | 'contentPoiBinding.loading'
  | 'contentPoiBinding.optionsAria'
  | 'contentPoiBinding.searchAria'
  | 'contentPoiBinding.searchPlaceholder'
  | 'contentPoiBinding.selectedAria'
  | 'contentPoiBinding.title'
  | 'contentPoiBinding.unavailable'
  | 'embeddedMapPicker.empty'
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
  | 'map.empty.unavailable'
  | 'map.geometry.linearObject'
  | 'map.geometry.lineString'
  | 'map.geometry.pointMarker'
  | 'map.geometry.region'
  | 'map.geometry.roadEndpointCount'
  | 'map.geometry.transitLineDetail'
  | 'map.geometry.transitLineObject'
  | 'map.geometry.transitLinePending'
  | 'map.markerList.count'
  | 'map.markerList.default'
  | 'map.markerList.fullLength'
  | 'map.markerList.nearby'
  | 'map.markerList.nearbyLinear'
  | 'map.markerList.playerCount'
  | 'map.markerList.results'
  | 'map.metroInfrastructure.direction.down'
  | 'map.metroInfrastructure.direction.here'
  | 'map.metroInfrastructure.direction.up'
  | 'map.metroInfrastructure.downwardsTerminus'
  | 'map.metroInfrastructure.exitGroup.left'
  | 'map.metroInfrastructure.exitGroup.right'
  | 'map.metroInfrastructure.facing'
  | 'map.metroInfrastructure.facility.elevator'
  | 'map.metroInfrastructure.facility.escalator'
  | 'map.metroInfrastructure.facility.escalatorAndStairs'
  | 'map.metroInfrastructure.facility.accessibleRestroom'
  | 'map.metroInfrastructure.facility.exit'
  | 'map.metroInfrastructure.facility.familyRestroom'
  | 'map.metroInfrastructure.facility.meetingPoint'
  | 'map.metroInfrastructure.facility.mensRestroom'
  | 'map.metroInfrastructure.facility.nursingRoom'
  | 'map.metroInfrastructure.facility.passengerServiceCenter'
  | 'map.metroInfrastructure.facility.platformDoor'
  | 'map.metroInfrastructure.facility.police'
  | 'map.metroInfrastructure.facility.stairs'
  | 'map.metroInfrastructure.facility.stairsTwoWay'
  | 'map.metroInfrastructure.facility.subway'
  | 'map.metroInfrastructure.facility.thirdRestroom'
  | 'map.metroInfrastructure.facility.ticketMachine'
  | 'map.metroInfrastructure.facility.toilet'
  | 'map.metroInfrastructure.facility.waitingRoom'
  | 'map.metroInfrastructure.facility.wheelchair'
  | 'map.metroInfrastructure.facility.wheelchairLift'
  | 'map.metroInfrastructure.facility.womensRestroom'
  | 'map.metroInfrastructure.floorEmpty'
  | 'map.metroInfrastructure.layer.concourse'
  | 'map.metroInfrastructure.layer.entrance'
  | 'map.metroInfrastructure.layer.passageway'
  | 'map.metroInfrastructure.layer.platform'
  | 'map.metroInfrastructure.layer.transfer'
  | 'map.metroInfrastructure.lineTowards'
  | 'map.metroInfrastructure.oneWay.both'
  | 'map.metroInfrastructure.oneWay.down'
  | 'map.metroInfrastructure.oneWay.up'
  | 'map.metroInfrastructure.platformDoors'
  | 'map.metroInfrastructure.platformSide.both'
  | 'map.metroInfrastructure.platformSide.left'
  | 'map.metroInfrastructure.platformSide.right'
  | 'map.metroInfrastructure.platformSide.unknown'
  | 'map.metroInfrastructure.tabsAria'
  | 'map.metroInfrastructure.title'
  | 'map.metroInfrastructure.towardsLeft'
  | 'map.metroInfrastructure.towardsRight'
  | 'map.metroInfrastructure.transferAction'
  | 'map.metroInfrastructure.transferDirection.downwards'
  | 'map.metroInfrastructure.transferDirection.upwards'
  | 'map.metroInfrastructure.upwardsTerminus'
  | 'map.hud.aria'
  | 'map.hud.cursor'
  | 'map.hud.scale.blocks'
  | 'map.hud.scale.kilometers'
  | 'map.layer.aria'
  | 'map.layer.linearFeatures'
  | 'map.layer.linearFeaturesHidden'
  | 'map.layer.linearFeaturesVisible'
  | 'map.layer.markers'
  | 'map.layer.markersHidden'
  | 'map.layer.markersVisible'
  | 'map.layer.modeAria'
  | 'map.layer.mode.roadNetwork'
  | 'map.layer.mode.satellite'
  | 'map.layer.mode.traffic'
  | 'map.layer.noteRoadNetwork'
  | 'map.layer.noteSatellite'
  | 'map.layer.noteTraffic'
  | 'map.layer.open'
  | 'map.layer.players'
  | 'map.layer.playersHidden'
  | 'map.layer.playersVisible'
  | 'map.layer.perspective'
  | 'map.layer.perspectiveHidden'
  | 'map.layer.perspectiveVisible'
  | 'map.layer.submitPoi'
  | 'map.layer.tileProvider'
  | 'map.layer.tileProviderAria'
  | 'map.lineDetail.fare'
  | 'map.lineDetail.stations'
  | 'map.lineInfo.openAria'
  | 'map.lineInfo.timezoneNote'
  | 'map.lineInfo.title'
  | 'map.lineRealtime.allTrips'
  | 'map.lineRealtime.atStation'
  | 'map.lineRealtime.beijingTime'
  | 'map.lineRealtime.boardArrivalAt'
  | 'map.lineRealtime.boardArriving'
  | 'map.lineRealtime.boardDepartureAt'
  | 'map.lineRealtime.boardLeaving'
  | 'map.lineRealtime.boardMinutes'
  | 'map.lineRealtime.boardWaiting'
  | 'map.lineRealtime.countBadge'
  | 'map.lineRealtime.countBadgeAria'
  | 'map.lineRealtime.detailArrival'
  | 'map.lineRealtime.detailDeparture'
  | 'map.lineRealtime.detailDepartureAtStation'
  | 'map.lineRealtime.detailPosition'
  | 'map.lineRealtime.detailSelectedStation'
  | 'map.lineRealtime.detailStatus'
  | 'map.lineRealtime.detailWaiting'
  | 'map.lineRealtime.emptyActive'
  | 'map.lineRealtime.emptySchedule'
  | 'map.lineRealtime.inSegment'
  | 'map.lineRealtime.lastTripPassed'
  | 'map.lineRealtime.lastTripPassedNextDay'
  | 'map.lineRealtime.minutesToNext'
  | 'map.lineRealtime.nextDeparture'
  | 'map.lineRealtime.nextDepartureNextDay'
  | 'map.lineRealtime.noMoreTrips'
  | 'map.lineRealtime.note'
  | 'map.lineRealtime.selectStationHint'
  | 'map.lineRealtime.stationAt'
  | 'map.lineRealtime.stationEta'
  | 'map.lineRealtime.stationNextArrival'
  | 'map.lineRealtime.stationNoData'
  | 'map.lineRealtime.stationNoVehicle'
  | 'map.lineRealtime.stationPassed'
  | 'map.lineRealtime.summary'
  | 'map.lineRealtime.title'
  | 'map.lineRealtime.trip'
  | 'map.lineRealtime.tripTitlePosition'
  | 'map.lineRealtime.updatedAt'
  | 'map.lineRealtime.vehicleBadge'
  | 'map.lineStation.showPoi'
  | 'map.nearby.exit'
  | 'map.nearby.mileage'
  | 'map.nearby.note'
  | 'map.nearby.noteLinear'
  | 'map.nearby.rangeAria'
  | 'map.nearby.rangeLabel'
  | 'map.nearby.rangeValue'
  | 'map.nearby.scopeAria'
  | 'map.nearby.scopeInside'
  | 'map.nearby.scopeOutside'
  | 'map.overlay.aria'
  | 'map.overlay.linearPoiTitle'
  | 'map.overlay.markerTitle'
  | 'map.overlay.roadTraceTitle'
  | 'map.overlay.transitTraceTitle'
  | 'map.overlay.viewMarker'
  | 'map.player.lastSeen'
  | 'map.player.observed'
  | 'map.player.serverAccount'
  | 'map.player.status.offline'
  | 'map.player.status.online'
  | 'map.poi.actions'
  | 'map.poi.address'
  | 'map.poi.close'
  | 'map.poi.collapse'
  | 'map.poi.connections'
  | 'map.poi.coordinate'
  | 'map.poi.count'
  | 'map.poi.copyStatus'
  | 'map.poi.expand'
  | 'map.poi.facilities'
  | 'map.poi.favoriteAria'
  | 'map.poi.favoriteStatus'
  | 'map.poi.floor'
  | 'map.poi.filterAll'
  | 'map.poi.filterCategory'
  | 'map.poi.filterFloor'
  | 'map.poi.filterKeyword'
  | 'map.poi.filterKeywordPlaceholder'
  | 'map.poi.group.access'
  | 'map.poi.group.building'
  | 'map.poi.group.facility'
  | 'map.poi.group.nearby'
  | 'map.poi.group.scenery'
  | 'map.poi.group.transport'
  | 'map.poi.imageAlt'
  | 'map.poi.imageCounter'
  | 'map.poi.imageNext'
  | 'map.poi.imagePrevious'
  | 'map.poi.nearbyAlongAria'
  | 'map.poi.nearbyAria'
  | 'map.poi.noConnections'
  | 'map.poi.noFacilities'
  | 'map.poi.objectFallback'
  | 'map.poi.openDetail'
  | 'map.poi.openingHours'
  | 'map.poi.operations'
  | 'map.poi.operationsEmpty'
  | 'map.poi.operationsLoading'
  | 'map.poi.parent'
  | 'map.poi.boundRegions'
  | 'map.poi.parentFallback'
  | 'map.poi.relatedPlaceFallback'
  | 'map.poi.relatedPlaces'
  | 'map.poi.route'
  | 'map.poi.shareAria'
  | 'map.poi.shareOpened'
  | 'map.poi.shareText'
  | 'map.poi.shareTitle'
  | 'map.poi.shareUnavailable'
  | 'map.poi.summary'
  | 'map.poi.tabsAria'
  | 'map.poi.type'
  | 'map.poi.unfavoriteAria'
  | 'map.poi.unfavoriteStatus'
  | 'map.poiSubmit.category'
  | 'map.poiSubmit.address'
  | 'map.poiSubmit.addressPlaceholder'
  | 'map.poiSubmit.addressRoad'
  | 'map.poiSubmit.floor'
  | 'map.poiSubmit.floorPlaceholder'
  | 'map.poiSubmit.close'
  | 'map.poiSubmit.description'
  | 'map.poiSubmit.descriptionPlaceholder'
  | 'map.poiSubmit.href'
  | 'map.poiSubmit.hrefPlaceholder'
  | 'map.poiSubmit.imageFile'
  | 'map.poiSubmit.imageFileCount'
  | 'map.poiSubmit.imageUploadFailed'
  | 'map.poiSubmit.imageUrl'
  | 'map.poiSubmit.imageUrlPlaceholder'
  | 'map.poiSubmit.invalid'
  | 'map.poiSubmit.invalidFacility'
  | 'map.poiSubmit.tooManyImages'
  | 'map.poiSubmit.name'
  | 'map.poiSubmit.namePlaceholder'
  | 'map.poiSubmit.noAddressRoad'
  | 'map.poiSubmit.openingHours'
  | 'map.poiSubmit.openingHoursPlaceholder'
  | 'map.poiSubmit.pickCancel'
  | 'map.poiSubmit.pickDone'
  | 'map.poiSubmit.pickHint'
  | 'map.poiSubmit.pickOnMap'
  | 'map.poiSubmit.pickPrompt'
  | 'map.poiSubmit.submit'
  | 'map.poiSubmit.submitFailed'
  | 'map.poiSubmit.submitting'
  | 'map.poiSubmit.success'
  | 'map.poiSubmit.title'
  | 'map.poiSubmit.x'
  | 'map.poiSubmit.z'
  | 'map.source.loading'
  | 'map.source.objectCount'
  | 'map.source.provider.lindongFreshHttp'
  | 'map.source.provider.lindongSafeHttpsStatic'
  | 'map.source.provider.lindongUnminedStatic'
  | 'map.source.providerNote.lindongFreshHttp'
  | 'map.source.providerNote.lindongSafeHttpsStatic'
  | 'map.source.providerNote.lindongUnminedStatic'
  | 'map.source.tileFallback'
  | 'map.source.tileProvider'
  | 'map.source.tooltipLoading'
  | 'map.source.unavailable'
  | 'map.location.currentAccount'
  | 'map.search.aria'
  | 'map.search.clear'
  | 'map.search.placeholder'
  | 'map.routingStatus.projecting'
  | 'map.share.actions'
  | 'map.share.close'
  | 'map.share.footerDisclaimer'
  | 'map.share.footerPrefix'
  | 'map.share.footerText'
  | 'map.share.image'
  | 'map.share.imageDownloaded'
  | 'map.share.imageShared'
  | 'map.share.coordinate'
  | 'map.share.coordinateCopied'
  | 'map.share.copy'
  | 'map.share.copyKind'
  | 'map.share.link'
  | 'map.share.linkCopied'
  | 'map.share.processing'
  | 'map.share.qrCode'
  | 'map.share.text'
  | 'map.share.textCopied'
  | 'map.share.teleport'
  | 'map.share.teleportCopied'
  | 'map.share.title'
  | 'map.share.unavailable'
  | 'map.toolbar.reset'
  | 'map.toolbar.zoomIn'
  | 'map.toolbar.zoomOut'
  | 'map.title'
  | 'mapStageLoader.aria'
  | 'mapStageLoader.loading'
  | 'siteLegal.aria'
  | 'siteLegal.disclaimer'
  | 'siteLegal.icp'
  | 'siteLegal.police'
  | 'siteLegal.version'
  | 'map.route.alight'
  | 'map.route.alightFerry'
  | 'map.route.alightMetro'
  | 'map.route.aria'
  | 'map.route.arrive'
  | 'map.route.badge.fastest'
  | 'map.route.badge.fewestTransfers'
  | 'map.route.badge.leastWalking'
  | 'map.route.board'
  | 'map.route.boardFerry'
  | 'map.route.boardMetro'
  | 'map.route.close'
  | 'map.route.collapse'
  | 'map.route.currentLocation'
  | 'map.route.defaultView'
  | 'map.route.depart'
  | 'map.route.destination'
  | 'map.route.taxiDirect'
  | 'map.route.taxiAlternativeOne'
  | 'map.route.taxiAlternativeTwo'
  | 'map.route.taxiFewestSegments'
  | 'map.route.taxiNote'
  | 'map.route.taxiWithDistance'
  | 'map.route.taxiWalkFromDropoff'
  | 'map.route.taxiWalkToPickup'
  | 'map.route.directTitle'
  | 'map.route.distance.blocks'
  | 'map.route.duration.short'
  | 'map.route.duration.step'
  | 'map.route.edit'
  | 'map.route.linearEndpointBlocked'
  | 'map.route.endpointCandidatesAria'
  | 'map.route.expand'
  | 'map.route.featuresAria'
  | 'map.route.fare.estimated'
  | 'map.route.fare.exact'
  | 'map.route.fare.partial'
  | 'map.route.fare.unavailable'
  | 'map.route.input.destination'
  | 'map.route.input.origin'
  | 'map.route.loadingDetail'
  | 'map.route.loadingNote'
  | 'map.route.loadingTitle'
  | 'map.route.marker.destination'
  | 'map.route.marker.origin'
  | 'map.route.metroEnterViaAccess'
  | 'map.route.metroExitViaAccess'
  | 'map.route.mode.all'
  | 'map.route.mode.bus'
  | 'map.route.mode.coach'
  | 'map.route.mode.collapse'
  | 'map.route.mode.taxi'
  | 'map.route.mode.ferry'
  | 'map.route.mode.metro'
  | 'map.route.mode.more'
  | 'map.route.mode.railway'
  | 'map.route.mode.tram'
  | 'map.route.mode.walk'
  | 'map.route.modeAria'
  | 'map.route.noEndpointCandidates'
  | 'map.route.noModes'
  | 'map.route.noOptions'
  | 'map.route.optionFallback'
  | 'map.route.optionsAria'
  | 'map.route.origin'
  | 'map.route.planning'
  | 'map.route.ride'
  | 'map.route.road.approach'
  | 'map.route.road.connection'
  | 'map.route.road.depart'
  | 'map.route.road.enter'
  | 'map.route.selectDestination'
  | 'map.route.selectOrigin'
  | 'map.route.sort.time'
  | 'map.route.sort.fare'
  | 'map.route.sort.transfers'
  | 'map.route.sort.walking'
  | 'map.route.sortAria'
  | 'map.route.copyStatus'
  | 'map.route.share'
  | 'map.route.shareOpened'
  | 'map.route.shareText'
  | 'map.route.shareTitle'
  | 'map.route.shareUnavailable'
  | 'map.route.stationCount'
  | 'map.route.stepDetails.collapse'
  | 'map.route.stepDetails.expand'
  | 'map.route.stepsAria'
  | 'map.route.summary.directEstimate'
  | 'map.route.summary.roadEstimate'
  | 'map.route.summary.walking'
  | 'map.route.swap'
  | 'map.route.traceTitle'
  | 'map.route.transferAction'
  | 'map.route.transferTitle'
  | 'map.route.transferWalk'
  | 'map.route.transitNote.default'
  | 'map.route.transitNote.fallbackRoad'
  | 'map.route.transitNote.road'
  | 'map.route.turn.left'
  | 'map.route.turn.right'
  | 'map.route.turn.slightLeft'
  | 'map.route.turn.slightRight'
  | 'map.route.turn.straight'
  | 'map.route.transitNote.transfer'
  | 'map.route.useMapCenter'
  | 'map.route.walkDirect'
  | 'map.route.walkAlternativeOne'
  | 'map.route.walkAlternativeTwo'
  | 'map.route.walkFewerTurns'
  | 'map.route.walkFewestSegments'
  | 'map.route.walkFromAccess'
  | 'map.route.walkNote.direct'
  | 'map.route.walkNote.road'
  | 'map.route.walkRoadWithDistance'
  | 'map.route.walkStraight'
  | 'map.route.walkToAccess'
  | 'map.route.walkWithDistance'
  | 'map.roadDetail.description'
  | 'map.roadDetail.endpointCount'
  | 'map.roadDetail.endpointCountValue'
  | 'map.roadDetail.traceHighlighted'
  | 'map.roadDetail.traceStatus'
  | 'metroWayfindingEditor.action.addElement'
  | 'metroWayfindingEditor.action.cancel'
  | 'metroWayfindingEditor.action.clear'
  | 'metroWayfindingEditor.action.close'
  | 'metroWayfindingEditor.action.delete'
  | 'metroWayfindingEditor.action.done'
  | 'metroWayfindingEditor.action.dragToReorder'
  | 'metroWayfindingEditor.action.duplicate'
  | 'metroWayfindingEditor.action.duplicateElement'
  | 'metroWayfindingEditor.action.importSign'
  | 'metroWayfindingEditor.action.moveDown'
  | 'metroWayfindingEditor.action.moveLeft'
  | 'metroWayfindingEditor.action.moveRight'
  | 'metroWayfindingEditor.action.moveRowDownAria'
  | 'metroWayfindingEditor.action.moveRowUpAria'
  | 'metroWayfindingEditor.action.moveUp'
  | 'metroWayfindingEditor.action.openProjectLibraryTitle'
  | 'metroWayfindingEditor.action.openTemplateLibrary'
  | 'metroWayfindingEditor.action.removeElement'
  | 'metroWayfindingEditor.action.replaceSign'
  | 'metroWayfindingEditor.action.reverse'
  | 'metroWayfindingEditor.action.reverseDisabledVertical'
  | 'metroWayfindingEditor.action.reverseTitle'
  | 'metroWayfindingEditor.action.templateLibrary'
  | 'metroWayfindingEditor.align.center'
  | 'metroWayfindingEditor.align.left'
  | 'metroWayfindingEditor.align.right'
  | 'metroWayfindingEditor.aria.addElementToRow'
  | 'metroWayfindingEditor.aria.canvas'
  | 'metroWayfindingEditor.aria.combination'
  | 'metroWayfindingEditor.aria.defaultLineName'
  | 'metroWayfindingEditor.aria.draggableTab'
  | 'metroWayfindingEditor.aria.emptyState'
  | 'metroWayfindingEditor.aria.fixedSpace'
  | 'metroWayfindingEditor.aria.flexSpace'
  | 'metroWayfindingEditor.aria.inlineEditable'
  | 'metroWayfindingEditor.aria.largeTextWithSummary'
  | 'metroWayfindingEditor.aria.partSuffix'
  | 'metroWayfindingEditor.aria.removeSegment'
  | 'metroWayfindingEditor.aria.rowElements'
  | 'metroWayfindingEditor.aria.segmentOrdinal'
  | 'metroWayfindingEditor.aria.suffixOrdinal'
  | 'metroWayfindingEditor.aria.textElement'
  | 'metroWayfindingEditor.aria.textSegment'
  | 'metroWayfindingEditor.color.background'
  | 'metroWayfindingEditor.color.custom'
  | 'metroWayfindingEditor.color.customAria'
  | 'metroWayfindingEditor.color.foreground'
  | 'metroWayfindingEditor.color.inherit'
  | 'metroWayfindingEditor.combination.addAria'
  | 'metroWayfindingEditor.combination.addFacility'
  | 'metroWayfindingEditor.combination.addSpace'
  | 'metroWayfindingEditor.combination.childDuplicateAria'
  | 'metroWayfindingEditor.combination.childMoveDownAria'
  | 'metroWayfindingEditor.combination.childMoveUpAria'
  | 'metroWayfindingEditor.combination.childRemoveAria'
  | 'metroWayfindingEditor.combination.childType'
  | 'metroWayfindingEditor.combination.closeAria'
  | 'metroWayfindingEditor.combination.description'
  | 'metroWayfindingEditor.combination.editTitle'
  | 'metroWayfindingEditor.combination.editWithCount'
  | 'metroWayfindingEditor.combination.empty'
  | 'metroWayfindingEditor.combination.eyebrow'
  | 'metroWayfindingEditor.combination.fill'
  | 'metroWayfindingEditor.combination.fillColor'
  | 'metroWayfindingEditor.combination.listAria'
  | 'metroWayfindingEditor.combination.scale'
  | 'metroWayfindingEditor.combination.stripeColor'
  | 'metroWayfindingEditor.combination.stripePosition'
  | 'metroWayfindingEditor.combination.templateHint'
  | 'metroWayfindingEditor.confirm.clear'
  | 'metroWayfindingEditor.direction.down'
  | 'metroWayfindingEditor.direction.left'
  | 'metroWayfindingEditor.direction.right'
  | 'metroWayfindingEditor.direction.up'
  | 'metroWayfindingEditor.divider.note'
  | 'metroWayfindingEditor.elementLabel.arrow'
  | 'metroWayfindingEditor.elementLabel.combination'
  | 'metroWayfindingEditor.elementLabel.divider'
  | 'metroWayfindingEditor.elementLabel.facility'
  | 'metroWayfindingEditor.elementLabel.largeText'
  | 'metroWayfindingEditor.elementLabel.space'
  | 'metroWayfindingEditor.elementLabel.text'
  | 'metroWayfindingEditor.elementType.arrow'
  | 'metroWayfindingEditor.elementType.combination'
  | 'metroWayfindingEditor.elementType.divider'
  | 'metroWayfindingEditor.elementType.facility'
  | 'metroWayfindingEditor.elementType.largeText'
  | 'metroWayfindingEditor.elementType.space'
  | 'metroWayfindingEditor.elementType.spaceShort'
  | 'metroWayfindingEditor.elementType.text'
  | 'metroWayfindingEditor.empty.description'
  | 'metroWayfindingEditor.empty.title'
  | 'metroWayfindingEditor.error.fileTooLarge'
  | 'metroWayfindingEditor.error.parseFailed'
  | 'metroWayfindingEditor.error.tooManyFiles'
  | 'metroWayfindingEditor.examples.aria'
  | 'metroWayfindingEditor.examples.categoriesAria'
  | 'metroWayfindingEditor.examples.categoryEntry'
  | 'metroWayfindingEditor.examples.categoryExit'
  | 'metroWayfindingEditor.examples.categoryTransfer'
  | 'metroWayfindingEditor.examples.description'
  | 'metroWayfindingEditor.examples.empty'
  | 'metroWayfindingEditor.examples.line'
  | 'metroWayfindingEditor.examples.loadAria'
  | 'metroWayfindingEditor.examples.station'
  | 'metroWayfindingEditor.examples.title'
  | 'metroWayfindingEditor.examples.useTemplate'
  | 'metroWayfindingEditor.field.addForegroundStroke'
  | 'metroWayfindingEditor.field.addFrame'
  | 'metroWayfindingEditor.field.alignment'
  | 'metroWayfindingEditor.field.arrow'
  | 'metroWayfindingEditor.field.backgroundColor'
  | 'metroWayfindingEditor.field.defaultForegroundColor'
  | 'metroWayfindingEditor.field.elementType'
  | 'metroWayfindingEditor.field.exitIconDirection'
  | 'metroWayfindingEditor.field.facilityIcon'
  | 'metroWayfindingEditor.field.iconDirection'
  | 'metroWayfindingEditor.field.iconVariant'
  | 'metroWayfindingEditor.field.layout'
  | 'metroWayfindingEditor.field.rowDivider'
  | 'metroWayfindingEditor.field.writingMode'
  | 'metroWayfindingEditor.fill.color'
  | 'metroWayfindingEditor.fill.inverse'
  | 'metroWayfindingEditor.fill.none'
  | 'metroWayfindingEditor.fill.stripe'
  | 'metroWayfindingEditor.frame.circle'
  | 'metroWayfindingEditor.frame.fill'
  | 'metroWayfindingEditor.frame.fillColor'
  | 'metroWayfindingEditor.frame.none'
  | 'metroWayfindingEditor.frame.rectangle'
  | 'metroWayfindingEditor.frame.shape'
  | 'metroWayfindingEditor.import.description'
  | 'metroWayfindingEditor.import.dropActive'
  | 'metroWayfindingEditor.import.dropHint'
  | 'metroWayfindingEditor.import.fileLimits'
  | 'metroWayfindingEditor.import.fileLimitsDescription'
  | 'metroWayfindingEditor.import.selectFiles'
  | 'metroWayfindingEditor.import.sourceExternalHint'
  | 'metroWayfindingEditor.import.sourceYct'
  | 'metroWayfindingEditor.import.sourceYctHint'
  | 'metroWayfindingEditor.import.supportedSources'
  | 'metroWayfindingEditor.import.title'
  | 'metroWayfindingEditor.importPreview.closeAria'
  | 'metroWayfindingEditor.importPreview.eyebrow'
  | 'metroWayfindingEditor.importPreview.footerSummary'
  | 'metroWayfindingEditor.importPreview.mode'
  | 'metroWayfindingEditor.importPreview.modeSemantic'
  | 'metroWayfindingEditor.importPreview.modeSourceStyle'
  | 'metroWayfindingEditor.importPreview.previewNote'
  | 'metroWayfindingEditor.importPreview.rowsAria'
  | 'metroWayfindingEditor.importPreview.source'
  | 'metroWayfindingEditor.importPreview.sourceStyle'
  | 'metroWayfindingEditor.importPreview.targetStyle'
  | 'metroWayfindingEditor.importPreview.warningCount'
  | 'metroWayfindingEditor.importPreview.warningsAria'
  | 'metroWayfindingEditor.importPreview.warningsTitle'
  | 'metroWayfindingEditor.largeText.fieldLabel'
  | 'metroWayfindingEditor.largeText.insertSuffix'
  | 'metroWayfindingEditor.option.all'
  | 'metroWayfindingEditor.option.doubleRow'
  | 'metroWayfindingEditor.option.entry'
  | 'metroWayfindingEditor.option.exit'
  | 'metroWayfindingEditor.option.singleRow'
  | 'metroWayfindingEditor.option.transfer'
  | 'metroWayfindingEditor.option.vertical'
  | 'metroWayfindingEditor.projectDialog.closeAria'
  | 'metroWayfindingEditor.projectDialog.eyebrow'
  | 'metroWayfindingEditor.projectDialog.import'
  | 'metroWayfindingEditor.projectDialog.source'
  | 'metroWayfindingEditor.projectDialog.templates'
  | 'metroWayfindingEditor.projectDialog.title'
  | 'metroWayfindingEditor.row.first'
  | 'metroWayfindingEditor.row.second'
  | 'metroWayfindingEditor.segment.boxed'
  | 'metroWayfindingEditor.segment.boxedShort'
  | 'metroWayfindingEditor.segment.chooseLineColor'
  | 'metroWayfindingEditor.segment.insertBoxed'
  | 'metroWayfindingEditor.segment.insertLine'
  | 'metroWayfindingEditor.segment.line'
  | 'metroWayfindingEditor.segment.text'
  | 'metroWayfindingEditor.space.fixed'
  | 'metroWayfindingEditor.space.flex'
  | 'metroWayfindingEditor.space.flexNote'
  | 'metroWayfindingEditor.space.mode'
  | 'metroWayfindingEditor.space.width'
  | 'metroWayfindingEditor.status.parsing'
  | 'metroWayfindingEditor.status.parsingFiles'
  | 'metroWayfindingEditor.stripePosition.bottom'
  | 'metroWayfindingEditor.stripePosition.left'
  | 'metroWayfindingEditor.stripePosition.right'
  | 'metroWayfindingEditor.suffix.label'
  | 'metroWayfindingEditor.suffix.placeholder'
  | 'metroWayfindingEditor.suffix.remove'
  | 'metroWayfindingEditor.suggestion.acceptAria'
  | 'metroWayfindingEditor.suggestion.acceptTitle'
  | 'metroWayfindingEditor.tab.childCount'
  | 'metroWayfindingEditor.text.addMainRow'
  | 'metroWayfindingEditor.text.addRowAria'
  | 'metroWayfindingEditor.text.addSecondaryRow'
  | 'metroWayfindingEditor.text.deleteRow'
  | 'metroWayfindingEditor.text.deleteRowAria'
  | 'metroWayfindingEditor.text.dynamicFontSize'
  | 'metroWayfindingEditor.text.main'
  | 'metroWayfindingEditor.text.mainRowLabel'
  | 'metroWayfindingEditor.text.metrics'
  | 'metroWayfindingEditor.text.moveRowDownAria'
  | 'metroWayfindingEditor.text.moveRowUpAria'
  | 'metroWayfindingEditor.text.rowHeader'
  | 'metroWayfindingEditor.text.rowsAria'
  | 'metroWayfindingEditor.text.secondary'
  | 'metroWayfindingEditor.text.secondaryRowLabel'
  | 'metroWayfindingEditor.toolbar.title'
  | 'metroWayfindingEditor.writing.horizontal'
  | 'metroWayfindingEditor.writing.horizontalText'
  | 'metroWayfindingEditor.writing.vertical'
  | 'metroWayfindingEditor.writing.verticalText'
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
  | 'operations.featuredNext'
  | 'operations.featuredPage'
  | 'operations.featuredPages'
  | 'operations.featuredPrevious'
  | 'operations.feedAria'
  | 'operations.itemCount'
  | 'operations.latestTitle'
  | 'operations.noStrongReminder'
  | 'operations.noTripReminder'
  | 'operations.remindersAria'
  | 'operations.serverStatus.latency'
  | 'operations.serverStatus.offline'
  | 'operations.serverStatus.online'
  | 'operations.serverStatus.openPlayers'
  | 'operations.serverStatus.players'
  | 'operations.serverStatus.title'
  | 'operations.serverStatus.unknown'
  | 'operations.serverStatusAria'
  | 'operations.social.afdian'
  | 'operations.social.bilibili'
  | 'operations.social.qq'
  | 'operations.social.qqChannel'
  | 'operations.social.wechat'
  | 'operations.socialAria'
  | 'operations.startsAt'
  | 'operations.strongReminder'
  | 'operations.validUntil'
  | 'operationRelatedPois.count'
  | 'operationRelatedPois.fallback'
  | 'operationRelatedPois.title'
  | 'operationToc.collapse'
  | 'operationToc.expand'
  | 'operationToc.title'
  | 'page.account'
  | 'page.ask'
  | 'page.map'
  | 'page.offline'
  | 'page.operations'
  | 'page.scheduleSearch'
  | 'page.search'
  | 'page.services'
  | 'page.changelog'
  | 'page.faq'
  | 'page.roadMaterials'
  | 'page.telegraph'
  | 'page.transitMaterials'
  | 'page.transitNetworkHealth'
  | 'page.ticketOrder'
  | 'page.travel'
  | 'page.travelScreen'
  | 'poiFacility.add'
  | 'poiFacility.descriptionLabel'
  | 'poiFacility.descriptionPlaceholder'
  | 'poiFacility.hint'
  | 'poiFacility.icon.accessible'
  | 'poiFacility.icon.childCare'
  | 'poiFacility.icon.elevator'
  | 'poiFacility.icon.escalator'
  | 'poiFacility.icon.info'
  | 'poiFacility.icon.luggage'
  | 'poiFacility.icon.medical'
  | 'poiFacility.icon.parking'
  | 'poiFacility.icon.pets'
  | 'poiFacility.icon.power'
  | 'poiFacility.icon.restaurant'
  | 'poiFacility.icon.shopping'
  | 'poiFacility.icon.smoking'
  | 'poiFacility.icon.wc'
  | 'poiFacility.icon.wifi'
  | 'poiFacility.iconLabel'
  | 'poiFacility.removeAria'
  | 'poiFacility.removeTitle'
  | 'poiFacility.title'
  | 'globalSearch.action.ask'
  | 'globalSearch.action.askThis'
  | 'globalSearch.action.clearInput'
  | 'globalSearch.action.close'
  | 'globalSearch.action.newConversation'
  | 'globalSearch.actionLabel'
  | 'globalSearch.action.open'
  | 'globalSearch.action.revert'
  | 'globalSearch.action.search'
  | 'globalSearch.action.send'
  | 'globalSearch.assistant.answerTitle'
  | 'globalSearch.assistant.clear'
  | 'globalSearch.assistant.configure'
  | 'globalSearch.assistant.copy'
  | 'globalSearch.assistant.copied'
  | 'globalSearch.assistant.disclaimer'
  | 'globalSearch.assistant.error'
  | 'globalSearch.assistant.followUps'
  | 'globalSearch.assistant.followUpsLoading'
  | 'globalSearch.assistant.followUpsUnavailable'
  | 'globalSearch.assistant.key'
  | 'globalSearch.assistant.keyPlaceholder'
  | 'globalSearch.assistant.model'
  | 'globalSearch.assistant.needsKey'
  | 'globalSearch.assistant.networkError'
  | 'globalSearch.assistant.provider'
  | 'globalSearch.assistant.references'
  | 'globalSearch.assistant.retry'
  | 'globalSearch.assistant.save'
  | 'globalSearch.assistant.setupDescription'
  | 'globalSearch.assistant.setupTitle'
  | 'globalSearch.assistant.stop'
  | 'globalSearch.assistant.streaming'
  | 'globalSearch.capability.account'
  | 'globalSearch.capability.faq'
  | 'globalSearch.capability.map'
  | 'globalSearch.capability.operations'
  | 'globalSearch.capability.rmp'
  | 'globalSearch.capability.roadMaterials'
  | 'globalSearch.capability.schedule'
  | 'globalSearch.capability.transitMaterials'
  | 'globalSearch.docsFallback'
  | 'globalSearch.docsFallbackEmpty'
  | 'globalSearch.easterEgg.close'
  | 'globalSearch.easterEgg.description'
  | 'globalSearch.easterEgg.hint'
  | 'globalSearch.easterEgg.title'
  | 'globalSearch.emptyHint'
  | 'globalSearch.liveResults'
  | 'globalSearch.mode.ask'
  | 'globalSearch.mode.search'
  | 'globalSearch.noMatch'
  | 'globalSearch.pageDisabled'
  | 'globalSearch.placeholder'
  | 'globalSearch.placeholderAsk'
  | 'globalSearch.resultCount'
  | 'globalSearch.searchAll'
  | 'globalSearch.status.askReady'
  | 'globalSearch.status.askSoon'
  | 'globalSearch.status.loadingData'
  | 'globalSearch.status.searching'
  | 'globalSearch.suggestion.account'
  | 'globalSearch.suggestion.aiLoading'
  | 'globalSearch.suggestion.aiOff'
  | 'globalSearch.suggestion.aiSettings'
  | 'globalSearch.suggestion.aiUnavailable'
  | 'globalSearch.suggestion.highlightLine'
  | 'globalSearch.suggestion.highlightMarker'
  | 'globalSearch.suggestion.highlightStation'
  | 'globalSearch.suggestion.operations'
  | 'globalSearch.suggestion.refresh'
  | 'globalSearch.suggestion.route'
  | 'globalSearch.suggestion.schedule'
  | 'globalSearch.suggestion.thisPage'
  | 'globalSearch.suggestion.title'
  | 'globalSearch.title'
  | 'globalSearch.unavailable'
  | 'globalSearch.viewAll'
  | 'quickAction.rideCode'
  | 'quickAction.rideCodeLoginRequired'
  | 'quickAction.rideCodeUnavailable'
  | 'search.open'
  | 'scheduleStopTable.aria'
  | 'scheduleStopTable.arrival'
  | 'scheduleStopTable.arrivalAria'
  | 'scheduleStopTable.departure'
  | 'scheduleStopTable.departureAria'
  | 'scheduleStopTable.dwell'
  | 'scheduleStopTable.dwellAria'
  | 'scheduleStopTable.empty'
  | 'scheduleStopTable.station'
  | 'scheduleStopTable.stop'
  | 'scheduleStopTable.stopAria'
  | 'shortcut.acceptSuggestion'
  | 'shortcut.adminReview'
  | 'shortcut.close'
  | 'shortcut.deleteSelected'
  | 'shortcut.dismissLayers'
  | 'shortcut.documentToc'
  | 'shortcut.duplicateElement'
  | 'shortcut.editor'
  | 'shortcut.exportProject'
  | 'shortcut.firstLastSection'
  | 'shortcut.focusMapSearch'
  | 'shortcut.focusScheduleSearch'
  | 'shortcut.global'
  | 'shortcut.globalSearch'
  | 'shortcut.holdCtrl'
  | 'shortcut.insertAppend'
  | 'shortcut.insertNearest'
  | 'shortcut.insertPrepend'
  | 'shortcut.lineEditor'
  | 'shortcut.lineEditor.toolMove'
  | 'shortcut.lineEditor.toolPan'
  | 'shortcut.lineEditor.toolStation'
  | 'shortcut.lineEditor.toolWaypoint'
  | 'shortcut.listBulk'
  | 'shortcut.listNavigate'
  | 'shortcut.listOpen'
  | 'shortcut.listSelect'
  | 'shortcut.map'
  | 'shortcut.moveElement'
  | 'shortcut.openMenu'
  | 'shortcut.openTemplateLibrary'
  | 'shortcut.planFocusedMarker'
  | 'shortcut.planJourney'
  | 'shortcut.previewMaterial'
  | 'shortcut.redo'
  | 'shortcut.resetFilters'
  | 'shortcut.resetMapView'
  | 'shortcut.reverseElements'
  | 'shortcut.save'
  | 'shortcut.saveAndBack'
  | 'shortcut.searchNearby'
  | 'shortcut.searchResults'
  | 'shortcut.sections'
  | 'shortcut.swapRouteEndpoints'
  | 'shortcut.switchDataSource'
  | 'shortcut.switchRow'
  | 'shortcut.switchTemplate'
  | 'shortcut.title'
  | 'shortcut.toggleFavorite'
  | 'shortcut.toggleLayers'
  | 'shortcut.toggleNavigation'
  | 'shortcut.travel'
  | 'shortcut.undo'
  | 'shortcut.wayfinding'
  | 'settings.accent.gray'
  | 'settings.accent.green'
  | 'settings.accent.label'
  | 'settings.accent.ldpass'
  | 'settings.accent.red'
  | 'settings.appearanceLanguage'
  | 'settings.assistant.allPages'
  | 'settings.assistant.allPagesNote'
  | 'settings.assistant.aiSuggestions'
  | 'settings.assistant.aiSuggestionsNote'
  | 'settings.assistant.clear'
  | 'settings.assistant.enabled'
  | 'settings.assistant.enabledNote'
  | 'settings.assistant.encryptionNote'
  | 'settings.assistant.group'
  | 'settings.assistant.configure'
  | 'settings.assistant.configTitle'
  | 'settings.assistant.configDescription'
  | 'settings.assistant.key'
  | 'settings.assistant.keyPlaceholder'
  | 'settings.assistant.model'
  | 'settings.assistant.modelNote'
  | 'settings.assistant.notConfigured'
  | 'settings.assistant.provider'
  | 'settings.assistant.save'
  | 'settings.assistant.saved'
  | 'settings.assistant.savedEncrypted'
  | 'settings.assistant.savedSession'
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
  | 'settings.material.advanced'
  | 'settings.material.balanced'
  | 'settings.material.group'
  | 'settings.material.label'
  | 'settings.material.performance'
  | 'settings.material.thickness'
  | 'settings.material.thicknessValue'
  | 'settings.motion.full'
  | 'settings.motion.group'
  | 'settings.motion.label'
  | 'settings.motion.reduced'
  | 'settings.motion.system'
  | 'settings.mobileActionRail.disabled'
  | 'settings.mobileActionRail.enabled'
  | 'settings.mobileActionRail.group'
  | 'settings.mobileActionRail.label'
  | 'settings.mobileActionRail.left'
  | 'settings.mobileActionRail.note'
  | 'settings.mobileActionRail.position'
  | 'settings.mobileActionRail.right'
  | 'settings.mobileActionRail.topOffset'
  | 'settings.mobileActionRail.topOffsetValue'
  | 'mobileActionRail.aria'
  | 'mobileActionRail.more'
  | 'mobileActionRail.overflowAria'
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
  | 'materialStudio.history'
  | 'materialStudio.preview'
  | 'materialStudio.updatePreview'
  | 'materialStudio.submitReview'
  | 'materialStudio.submitReviewManualHint'
  | 'materialStudio.exportProject'
  | 'materialStudio.download'
  | 'materialStudio.downloadWatermarkFree'
  | 'materialStudio.loginRequired'
  | 'materialStudio.serverUnverified'
  | 'materialStudio.serverUnverifiedHint'
  | 'materialStudio.loginRemoveWatermark'
  | 'materialStudio.reviewRequired'
  | 'materialStudio.templateReadFailed'
  | 'materialStudio.noTemplates'
  | 'materialStudio.workspaceUnavailable'
  | 'materialStudio.exportOnlyManual'
  | 'materialStudio.offlineBlocked'
  | 'materialStudio.noSyncTemplate'
  | 'materialStudio.serverSubmitOnlineOnly'
  | 'materialStudio.loginFirst'
  | 'materialStudio.localSyncFailed'
  | 'materialStudio.localSyncedSubmitHint'
  | 'materialStudio.networkError'
  | 'materialStudio.localSyncNetworkError'
  | 'materialStudio.noProjectStations'
  | 'materialStudio.selectServerStation'
  | 'materialStudio.selectProjectLine'
  | 'materialStudio.selectDirectionLine'
  | 'materialStudio.selectServerLine'
  | 'materialStudio.selectServerPlace'
  | 'materialStudio.selectCoordinate'
  | 'materialStudio.selectLinkedMode'
  | 'materialStudio.previewFailed'
  | 'materialStudio.previewNetworkError'
  | 'materialStudio.noSubmittableTemplate'
  | 'materialStudio.saveCustomFailed'
  | 'materialStudio.savedSubmitFailed'
  | 'materialStudio.submitNetworkError'
  | 'materialStudio.downloadFailed'
  | 'materialStudio.downloadNetworkError'
  | 'materialStudio.downloadPreviewNetworkError'
  | 'materialStudio.selectTemplateAndMode'
  | 'materialStudio.serverVerifiedDownloadHint'
  | 'materialStudio.operationBusy'
  | 'materialStudio.modeNoReviewNeeded'
  | 'materialStudio.localDraft'
  | 'materialStudio.workspaceEyebrow'
  | 'materialStudio.syncLocalDraft'
  | 'materialStudio.templates'
  | 'materialStudio.networkData'
  | 'materialStudio.online'
  | 'materialStudio.offline'
  | 'materialStudio.dimensions'
  | 'materialStudio.dataSource'
  | 'materialStudio.manualInput'
  | 'materialStudio.roadTitle'
  | 'materialStudio.transitTitle'
  | 'materialStudio.serverNetwork'
  | 'materialStudio.sampleProject'
  | 'materialStudio.importedProject'
  | 'materialStudio.projectStation'
  | 'materialStudio.projectCurrentStation'
  | 'materialStudio.variant'
  | 'materialStudio.group.busStop'
  | 'materialStudio.group.busStopHorizontal'
  | 'materialStudio.group.metroLineMap'
  | 'materialStudio.group.layout'
  | 'materialStudio.group.style'
  | 'materialStudio.layout.lineMap'
  | 'materialStudio.layout.stationName'
  | 'materialStudio.layout.direction'
  | 'materialStudio.layout.busTerminal'
  | 'materialStudio.layout.busOverview'
  | 'materialStudio.layout.busDetail'
  | 'materialStudio.projectLineCount'
  | 'materialStudio.busLineCount'
  | 'materialStudio.stationProjectLines'
  | 'materialStudio.projectLines'
  | 'materialStudio.mapDrivingDirection'
  | 'materialStudio.roadDrivingDirection'
  | 'materialStudio.stationProperties'
  | 'materialStudio.originStation'
  | 'materialStudio.terminalStation'
  | 'materialStudio.sameDirectionLines'
  | 'materialStudio.singleSelect'
  | 'materialStudio.maxLines'
  | 'materialStudio.destinationPending'
  | 'materialStudio.directionTo'
  | 'materialStudio.originAtStation'
  | 'materialStudio.terminalAtStation'
  | 'materialStudio.noProjectConnection'
  | 'materialStudio.noDirectionLine'
  | 'materialStudio.configureLineName'
  | 'materialStudio.serverLines'
  | 'materialStudio.stationsCount'
  | 'materialStudio.notOpened'
  | 'materialStudio.serverStations'
  | 'materialStudio.searchServerPlace'
  | 'materialStudio.serverPlaces'
  | 'materialStudio.coordinateX'
  | 'materialStudio.coordinateZ'
  | 'materialStudio.pickCoordinateHint'
  | 'materialStudio.clickMapCoordinate'
  | 'materialStudio.fillCoordinateFirst'
  | 'materialStudio.previewAria'
  | 'materialStudio.previewAlt'
  | 'materialStudio.closePreview'
  | 'materialStudio.historyTitle'
  | 'materialStudio.historyHint'
  | 'materialStudio.closeHistory'
  | 'materialStudio.submittedAt'
  | 'materialStudio.reviewedAt'
  | 'materialStudio.noSubmittedYet'
  | 'materialStudio.previewWatermark'
  | 'materialStudio.updating'
  | 'materialStudio.noPreviewYet'
  | 'materialStudio.signHeight'
  | 'materialStudio.signLength'
  | 'materialStudio.signWidth'
  | 'materialStudio.widthMeters'
  | 'materialStudio.heightMeters'
  | 'materialStudio.alignmentUnit'
  | 'materialStudio.alignToMapSize'
  | 'materialStudio.firstBus'
  | 'materialStudio.lastBus'
  | 'materialStudio.projectNoTimeHint'
  | 'materialStudio.pleaseSelect'
  | 'materialStudio.colorPaletteAria'
  | 'materialStudio.colorHexAria'
  | 'materialStudio.orientationRight'
  | 'materialStudio.orientationLeft'
  | 'materialStudio.orientationUp'
  | 'materialStudio.orientationDown'
  | 'materialStudio.draftStatus.draft'
  | 'materialStudio.draftStatus.pending_review'
  | 'materialStudio.draftStatus.approved'
  | 'materialStudio.draftStatus.rejected'
  | 'materialStudio.syncStatus.pending'
  | 'materialStudio.syncStatus.syncing'
  | 'materialStudio.syncStatus.synced'
  | 'materialStudio.syncStatus.conflict'
  | 'materialStudio.syncStatus.failed'
  | 'materialStudio.emptyFields'
  | 'materialStudio.watermarkedPreviewSuffix'
  | 'telegraph.stage.header'
  | 'telegraph.stage.recipient'
  | 'telegraph.stage.code'
  | 'telegraph.stage.message'
  | 'telegraph.stage.footer'
  | 'telegraph.stage.stamp'
  | 'telegraph.stage.envelope'
  | 'telegraph.newLetter'
  | 'telegraph.history'
  | 'telegraph.startWriting'
  | 'telegraph.replayAnimation'
  | 'telegraph.continueScroll'
  | 'telegraph.continueScrollStart'
  | 'telegraph.simulateSend'
  | 'telegraph.skipAnimation'
  | 'telegraph.continueConfirm'
  | 'telegraph.province'
  | 'telegraph.city'
  | 'telegraph.county'
  | 'telegraph.otherLocation'
  | 'telegraph.recipientInfo'
  | 'telegraph.body'
  | 'telegraph.senderName'
  | 'telegraph.senderAddress'
  | 'telegraph.senderLock'
  | 'telegraph.billableGrids'
  | 'telegraph.amount'
  | 'telegraph.billingRule'
  | 'telegraph.cellRecipient'
  | 'telegraph.cellBody'
  | 'telegraph.noCellSelected'
  | 'telegraph.flipEnvelope'
  | 'telegraph.flipToFront'
  | 'telegraph.flipToBack'
  | 'telegraph.openEnvelope'
  | 'telegraph.insertEnvelope'
  | 'telegraph.envelopeFront'
  | 'telegraph.envelopeBack'
  | 'telegraph.openEnvelopeView'
  | 'telegraph.insertReceivePaper'
  | 'telegraph.receivePaper'
  | 'telegraph.sendPaper'
  | 'telegraph.switchPaper'
  | 'telegraph.switchToSend'
  | 'telegraph.switchToReceive'
  | 'telegraph.envelopeFlip'
  | 'telegraph.code'
  | 'telegraph.audio'
  | 'telegraph.sendPaperTemplate'
  | 'telegraph.sendPaperPreview'
  | 'telegraph.enterDestination'
  | 'telegraph.enterRecipient'
  | 'telegraph.enterBody'
  | 'telegraph.recipientOverflow'
  | 'telegraph.bodyOverflow'
  | 'telegraph.unsupported'
  | 'telegraph.envelopeDone'
  | 'telegraph.skippedDone'
  | 'telegraph.imageFailed'
  | 'telegraph.sendPaperFile'
  | 'telegraph.receivePaperFile'
  | 'telegraph.imageDownloadFailed'
  | 'telegraph.codeFile'
  | 'telegraph.filePrefix'
  | 'telegraph.welcomeTitle'
  | 'telegraph.welcomeP1'
  | 'telegraph.welcomeP2'
  | 'telegraph.welcomeP3'
  | 'telegraph.confirmTitle'
  | 'telegraph.closeConfirm'
  | 'telegraph.destination'
  | 'telegraph.recipient'
  | 'telegraph.notFilled'
  | 'telegraph.confirmBody'
  | 'telegraph.confirmHint'
  | 'telegraph.backEdit'
  | 'telegraph.confirmSend'
  | 'telegraph.localHistory'
  | 'telegraph.deleteHistory'
  | 'telegraph.unnamed'
  | 'telegraph.noHistory'
  | 'telegraph.cellAria'
  | 'telegraph.toolbarAria'
  | 'transitLineBrowser.filterAria'
  | 'transitLineBrowser.listAria'
  | 'transitLineBrowser.modeRailway'
  | 'transitLineBrowser.summaryAria'
  | 'transitHealth.dimension.topology'
  | 'transitHealth.dimension.operations'
  | 'transitHealth.dimension.scale'
  | 'transitHealth.dimension.places'
  | 'transitHealth.dimension.demand'
  | 'transitHealth.dimension.data_quality'
  | 'transitHealth.analysisEyebrow'
  | 'transitHealth.subtitle'
  | 'transitHealth.onlineSnapshot'
  | 'transitHealth.offlineSnapshot'
  | 'transitHealth.dataTime'
  | 'transitHealth.noLines'
  | 'transitHealth.filterAria'
  | 'transitHealth.modeLegend'
  | 'transitHealth.scopeCurrent'
  | 'transitHealth.scopeAll'
  | 'transitHealth.demandWithLines'
  | 'transitHealth.demandPotentialOnly'
  | 'transitHealth.mLines'
  | 'transitHealth.mTopologyNote'
  | 'transitHealth.mStations'
  | 'transitHealth.mLocatedNote'
  | 'transitHealth.mLength'
  | 'transitHealth.mLocatedSegNote'
  | 'transitHealth.mCoverage'
  | 'transitHealth.mScheduledNote'
  | 'transitHealth.mServiceSpan'
  | 'transitHealth.mLateNote'
  | 'transitHealth.mPlaceCoverage'
  | 'transitHealth.mPlacesNote'
  | 'transitHealth.mRoadCoverage'
  | 'transitHealth.mRoadsNote'
  | 'transitHealth.mDemandAttainment'
  | 'transitHealth.mPotentialDemand'
  | 'transitHealth.mAttainedNote'
  | 'transitHealth.mPotentialHint'
  | 'transitHealth.chartEyebrow'
  | 'transitHealth.chartTitle'
  | 'transitHealth.locatedSampleHint'
  | 'transitHealth.opEyebrow'
  | 'transitHealth.opTitle'
  | 'transitHealth.opCountHint'
  | 'transitHealth.opTableNote'
  | 'transitHealth.colOperator'
  | 'transitHealth.colStations'
  | 'transitHealth.colStationsTitle'
  | 'transitHealth.colLines'
  | 'transitHealth.colAvgConnectivity'
  | 'transitHealth.colConnectivityTitle'
  | 'transitHealth.colConnectivityWeight'
  | 'transitHealth.colWeightTitle'
  | 'transitHealth.colLinesPerSegment'
  | 'transitHealth.colSharedSegments'
  | 'transitHealth.colScheduleCoverage'
  | 'transitHealth.colServiceSpan'
  | 'transitHealth.opComponentsNote'
  | 'transitHealth.rankLabel'
  | 'transitHealth.methodEyebrow'
  | 'transitHealth.methodTitle'
  | 'transitHealth.noMockHint'
  | 'transitHealth.dmTopology'
  | 'transitHealth.dmTopologyDetail'
  | 'transitHealth.dmOperations'
  | 'transitHealth.dmOperationsDetail'
  | 'transitHealth.dmScale'
  | 'transitHealth.dmScaleDetail'
  | 'transitHealth.dmPlaces'
  | 'transitHealth.dmPlacesDetail'
  | 'transitHealth.dmDemand'
  | 'transitHealth.dmDemandDetail'
  | 'transitHealth.dmRoads'
  | 'transitHealth.dmRoadsDetail'
  | 'transitHealth.sugEyebrow'
  | 'transitHealth.sugTitle'
  | 'transitHealth.sugMergedHint'
  | 'transitHealth.sugEmpty'
  | 'transitHealth.targetItem'
  | 'transitHealth.viewAllTargets'
  | 'transitHealth.dialogTargetLabel'
  | 'transitHealth.itemCount'
  | 'transitHealth.dialogClose'
  | 'transitHealth.dialogCloseAria'
  | 'transitHealth.searchTargets'
  | 'transitHealth.searchPlaceholder'
  | 'transitHealth.noMatchedTargets'
  | 'transitHealth.kindOperator'
  | 'transitHealth.kindLine'
  | 'transitHealth.kindStation'
  | 'transitHealth.kindSegment'
  | 'transitHealth.kindPlace'
  | 'transitHealth.kindCategory'
  | 'transitHealth.kindRoad'
  | 'transitHealth.moreOperators'
  | 'transitHealth.cModeTitle'
  | 'transitHealth.cModeSubtitle'
  | 'transitHealth.cTotalLines'
  | 'transitHealth.cLinesUnit'
  | 'transitHealth.cHoursTitle'
  | 'transitHealth.cHoursSubtitle'
  | 'transitHealth.cNoSchedule'
  | 'transitHealth.cPlaceTitle'
  | 'transitHealth.cPlaceSubtitle'
  | 'transitHealth.cPlaceRate'
  | 'transitHealth.cPlaceEntered'
  | 'transitHealth.cHotspotTitle1'
  | 'transitHealth.cHotspotTitle2'
  | 'transitHealth.cHotspotSub1'
  | 'transitHealth.cHotspotSub2'
  | 'transitHealth.cDemandRate'
  | 'transitHealth.cAttained'
  | 'transitHealth.cNearbyCount'
  | 'transitHealth.cAround'
  | 'transitHealth.cHotspotEmpty'
  | 'transitHealth.cOperatorTitle'
  | 'transitHealth.cOperatorSubtitle'
  | 'transitHealth.cOperatorBarLabel'
  | 'transitNetworkSource.title'
  | 'transitNetworkSource.origin.sample'
  | 'transitNetworkSource.origin.rmp'
  | 'transitNetworkSource.origin.server'
  | 'transitNetworkSource.import.own'
  | 'transitNetworkSource.import.default'
  | 'transitNetworkSource.import.short'
  | 'transitNetworkSource.import.project'
  | 'transitNetworkSource.sourceAria'
  | 'transitNetworkSource.source.server'
  | 'transitNetworkSource.source.loading'
  | 'transitNetworkSource.source.sample'
  | 'transitNetworkSource.source.imported'
  | 'transitNetworkSource.localDraftName'
  | 'transitNetworkSource.summary.stationCount'
  | 'transitNetworkSource.summary.stationsUnnamed'
  | 'transitNetworkSource.summary.stationsNamed'
  | 'transitNetworkSource.summary.lineCount'
  | 'transitNetworkSource.summary.edgeCount'
  | 'transitNetworkSource.summary.source'
  | 'transitNetworkSource.status.persisting'
  | 'transitNetworkSource.status.persisted'
  | 'transitNetworkSource.status.gallerySample'
  | 'transitNetworkSource.status.localOnly'
  | 'transitNetworkSource.palette.aria'
  | 'transitNetworkSource.action.fillStationNamesAria'
  | 'transitNetworkSource.action.fillStationNames'
  | 'transitNetworkSource.action.configureLineNames'
  | 'transitNetworkSource.action.removeImported'
  | 'transitNetworkSource.action.cancel'
  | 'transitNetworkSource.action.saving'
  | 'transitNetworkSource.action.close'
  | 'transitNetworkSource.error.fileTooLarge'
  | 'transitNetworkSource.error.notSignedIn'
  | 'transitNetworkSource.error.persistFailed'
  | 'transitNetworkSource.error.persistFailedLocalOnly'
  | 'transitNetworkSource.error.readFailed'
  | 'transitNetworkSource.error.deleteFailed'
  | 'transitNetworkSource.error.saveLineNamesFailed'
  | 'transitNetworkSource.error.saveStationNamesFailed'
  | 'transitNetworkSource.error.sampleLoadFailed'
  | 'transitNetworkSource.error.sampleLoadFailedHint'
  | 'transitNetworkSource.notice.lineNamesSampleLocalOnly'
  | 'transitNetworkSource.notice.lineNamesPendingPersist'
  | 'transitNetworkSource.notice.stationNamesSampleLocalOnly'
  | 'transitNetworkSource.notice.stationNamesPendingPersist'
  | 'transitNetworkSource.lineName.title'
  | 'transitNetworkSource.lineName.hintPart1'
  | 'transitNetworkSource.lineName.hintPart2'
  | 'transitNetworkSource.lineName.hintPart3'
  | 'transitNetworkSource.lineName.hintPart4'
  | 'transitNetworkSource.lineName.primaryAria'
  | 'transitNetworkSource.lineName.primaryPlaceholder'
  | 'transitNetworkSource.lineName.secondaryAria'
  | 'transitNetworkSource.lineName.secondaryPlaceholder'
  | 'transitNetworkSource.lineName.save'
  | 'transitNetworkSource.stationName.title'
  | 'transitNetworkSource.stationName.nearby'
  | 'transitNetworkSource.stationName.nearbyUnavailable'
  | 'transitNetworkSource.stationName.primaryAria'
  | 'transitNetworkSource.stationName.primaryPlaceholder'
  | 'transitNetworkSource.stationName.secondaryAria'
  | 'transitNetworkSource.stationName.secondaryPlaceholder'
  | 'transitNetworkSource.stationName.save'
  | 'transitScreen.legacy'
  | 'transitScreen.summaryAria'
  | 'transitScreen.upcomingAria'
  | 'transitScreen.viewTrips'
  | 'transitScreen.empty.unavailable'
  | 'transitScreen.empty.noData'
  | 'operation.contentTagsAria'
  | 'operation.legacyBodyDescription'
  | 'operation.legacyBodyTitle'
  | 'operation.legacyImageSource'
  | 'operation.openOriginal'
  | 'operation.originalLink'
  | 'transitServiceNotice.activeCount'
  | 'transitServiceNotice.history'
  | 'transitServiceNotice.itemCount'
  | 'transitServiceNotice.periodRange'
  | 'transitServiceNotice.title'
  | 'admin.edit'
  | 'admin.editLine'
  | 'admin.editPoi'
  | 'admin.home.title'
  | 'admin.home.description'
  | 'admin.editOperation'
  | 'search.category.all'
  | 'search.category.lines'
  | 'search.category.operations'
  | 'search.category.poi'
  | 'search.category.schedules'
  | 'search.category.services'
  | 'search.category.stations'
  | 'search.category.wiki'
  | 'search.clear'
  | 'search.emptyPrompt'
  | 'search.facilityCount'
  | 'search.loading'
  | 'search.noCategoryResults'
  | 'search.noMatch'
  | 'search.placeholder'
  | 'search.resultCount'
  | 'search.results'
  | 'search.resultGroup.lines'
  | 'search.resultGroup.operations'
  | 'search.resultGroup.poi'
  | 'search.resultGroup.player'
  | 'search.resultGroup.schedules'
  | 'search.resultGroup.services'
  | 'search.resultGroup.social'
  | 'search.resultGroup.stations'
  | 'search.resultGroup.wiki'
  | 'search.social.description'
  | 'search.wiki.loading'
  | 'search.wiki.updatedAt'
  | 'search.resultFilters'
  | 'search.stopCount'
  | 'search.stationExitCount'
  | 'search.unavailable'
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
  | 'toast.close'
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
  | 'travelSchedule.empty.unavailable'
  | 'travelSchedule.empty.noData'
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
  | 'travelSchedule.reminder.detailDeparture'
  | 'travelSchedule.reminder.detailFare'
  | 'travelSchedule.reminder.detailTrip'
  | 'travelSchedule.reminder.titleWithTime'
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
  | 'travelSchedule.trip.dayOffset'
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
  | 'travelSchedule.journey.missingEndpoints'
  | 'travelSchedule.journey.planning'
  | 'travelSchedule.journey.planFailed'
  | 'travelSchedule.journey.found'
  | 'travelSchedule.journey.noneFound'
  | 'travelSchedule.journey.segmentUnavailable'
  | 'travelSchedule.journey.holding'
  | 'travelSchedule.journey.orderFailed'
  | 'travelSchedule.journey.orderCreated'
  | 'travelSchedule.journey.swapEndpoints'
  | 'travelSchedule.journey.combining'
  | 'travelSchedule.journey.query'
  | 'travelSchedule.journey.title'
  | 'travelSchedule.journey.planCount'
  | 'travelSchedule.journey.tbd'
  | 'travelSchedule.journey.direct'
  | 'travelSchedule.journey.transferCount'
  | 'travelSchedule.journey.transferDetail'
  | 'travelSchedule.journey.locking'
  | 'travelSchedule.journey.bookJoint'
  | 'travelSchedule.journey.planIndex'
  | 'travelSchedule.journey.durationHours'
  | 'travelSchedule.journey.durationMinutes'
  | 'travelSchedule.journey.availableAll'
  | 'travelSchedule.journey.partial'
  | 'travelSchedule.journey.queryOnly'
  | 'travelSchedule.journey.lineGroupAria'
  | 'travelSchedule.journey.tripCount'
  | 'travelSchedule.journey.stopsAria'
  | 'travelSchedule.journey.passThrough'
  | 'travelSchedule.journey.editTrip'
  | 'travelSchedule.journey.period'
  | 'travelSchedule.journey.arrival'
  | 'travelSchedule.journey.stopCount'
  | 'travelSchedule.journey.serviceTrip'
  | 'travelSchedule.journey.tripLabel'
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
  | 'travel.screenDetail.empty'
  | 'travel.screenDetail.fare'
  | 'travel.screenDetail.filterAria'
  | 'travel.screenDetail.gate'
  | 'travel.screenDetail.line'
  | 'travel.screenDetail.listAria'
  | 'travel.screenDetail.noticeAria'
  | 'travel.screenDetail.operator'
  | 'travel.screenDetail.past'
  | 'travel.screenDetail.routes'
  | 'travel.screenDetail.runtime'
  | 'travel.screenDetail.search'
  | 'travel.screenDetail.searchClear'
  | 'travel.screenDetail.station'
  | 'travel.screenDetail.stationCount'
  | 'travel.screenDetail.stationFlowAria'
  | 'travel.screenDetail.stations'
  | 'travel.screenDetail.summaryAria'
  | 'travel.screenDetail.timeFilterAria'
  | 'travel.screenDetail.title'
  | 'travel.screenDetail.total'
  | 'travel.screenDetail.trip'
  | 'travel.screenDetail.trips'
  | 'travel.screenDetail.upcoming'
  | 'travel.services.subtitle'
  | 'travel.services.title'
  | 'travel.subtitle'
  | 'travel.ticketing.action'
  | 'travel.ticketing.detail'
  | 'travel.ticketing.title'
  | 'worldCoordinate.axis'
  | 'worldCoordinate.footerEmpty'
  | 'worldCoordinate.footerPick'
  | 'worldCoordinate.title'
  | 'worldCoordinate.yInherited'
  | 'worldCoordinate.yPlaceholder';

type CommonCatalog = Record<CommonMessageKey, string>;

const commonCatalogs: Record<LocaleCode, CommonCatalog> = {
  'zh-CN': {
    'account.offlinePackage.area': '面积 {area} 方块',
    'account.offlinePackage.bounds': 'X {minX} 至 {maxX}，Z {minZ} 至 {maxZ}',
    'account.offlinePackage.close': '关闭',
    'account.offlinePackage.delete': '删除',
    'account.offlinePackage.deleteAria': '删除 {name}',
    'account.offlinePackage.deleteConfirm': '要删除离线范围“{name}”吗？',
    'account.offlinePackage.description': '使用 Minecraft 世界坐标记录一个矩形范围。',
    'account.offlinePackage.empty': '还没有自定义离线范围。',
    'account.offlinePackage.error.emptyArea': '离线范围需要同时具有宽度和高度。',
    'account.offlinePackage.error.invalidBounds': '请输入有效的 Minecraft X/Z 矩形坐标。',
    'account.offlinePackage.error.missingName': '请给这个离线范围起一个名称。',
    'account.offlinePackage.lastRefreshed': '上次刷新 {time}',
    'account.offlinePackage.listAria': '自定义离线范围',
    'account.offlinePackage.maxX': '最大 X',
    'account.offlinePackage.maxZ': '最大 Z',
    'account.offlinePackage.minX': '最小 X',
    'account.offlinePackage.minZ': '最小 Z',
    'account.offlinePackage.name': '名称',
    'account.offlinePackage.namePlaceholder': '例如：大学城周边',
    'account.offlinePackage.newRange': '新建范围',
    'account.offlinePackage.refresh': '刷新范围',
    'account.offlinePackage.refreshing': '刷新中',
    'account.offlinePackage.save': '保存范围',
    'account.offlinePackage.status.baseCacheRefreshed': '基础缓存已刷新',
    'account.offlinePackage.status.refreshFailed': '刷新失败',
    'account.offlinePackage.status.registered': '待生成',
    'account.offlinePackage.status.requestFailed': '请求失败',
    'account.offlinePackage.status.serverRequested': '已请求生成',
    'account.offlinePackage.summary.area': '{area} 方块范围',
    'account.offlinePackage.summary.refreshed': '{count} 个已刷新基础缓存',
    'account.offlinePackage.summary.total': '{count} 个自定义范围',
    'account.offlinePackage.strategyNote':
      '自定义范围当前记录边界并刷新公开基础数据，真实瓦片离线包仍等待体积上限和生成策略确认。',
    'account.offlinePackage.title': '新建离线范围',
    'account.cache.offlineDeletedAll': '已删除本机与账号中的离线范围请求',
    'account.cache.offlineDeletedLocalOnly': '已删除本机离线范围，账号侧请求删除失败',
    'account.cache.offlineRefreshFailed': '离线范围基础数据刷新失败',
    'account.cache.refreshFailed': '刷新失败',
    'account.cache.refreshingOfflineBase': '正在刷新离线范围基础数据',
    'account.error.cacheRefreshFailed': '{url} 刷新失败',
    'account.error.offlinePackageRequestFailed': '服务端离线包请求失败',
    'account.error.offlineScopeDeleteFailed': '账号离线范围请求删除失败',
    'account.error.offlineScopeUnavailable': '账号离线范围暂不可用',
    'account.error.pushPreferenceUnavailable': '通知偏好暂不可用',
    'account.error.tripReminderDeleteFailed': '账号提醒副本删除失败',
    'account.error.tripRemindersUnavailable': '账号提醒暂不可用',
    'account.push.insecureContext': '当前页面不是安全上下文，浏览器不会开放 Push 订阅',
    'account.push.loginRequired': '需要先使用临东通登录。',
    'account.push.missingKeys': '浏览器返回的 Push 订阅缺少必要密钥',
    'account.push.missingPublicKey': 'Web Push 公钥尚未配置，本设备暂不能订阅推送',
    'account.push.permissionDenied': '浏览器通知权限未开启',
    'account.push.registerFailed': 'Push 设备订阅登记失败',
    'account.push.revokeFailed': 'Push 设备订阅撤销失败',
    'account.push.serviceWorkerNotReady': 'Service Worker 尚未就绪，暂不能订阅 Push',
    'account.push.unknownHost': '未知服务',
    'account.push.unsupported': '当前浏览器不支持 Web Push',
    'account.about.currentVersion': '当前版本：{version}',
    'account.about.github': 'GitHub 仓库',
    'account.about.mcpCopied': '已复制 MCP 地址',
    'account.about.mcpCopy': '复制 MCP 地址',
    'account.about.mcpDescription':
      '问一问的站内数据能力已封装成只读 MCP Server，可在支持 Streamable HTTP 的 MCP 客户端里直接添加这个地址；接口匿名只读，不包含你的模型 Key。',
    'account.about.mcpTitle': 'MCP 开放接口',
    'account.about.title': '关于与更新',
    'account.about.viewChangelog': '查看版本更新',
    'account.auth.adminOperations': '内容后台',
    'account.auth.adminPortal': '管理后台',
    'account.auth.adminPoi': 'POI 后台',
    'account.auth.adminServices': '服务后台',
    'account.auth.adminTransit': '线路后台',
    'account.auth.defaultTitle': '临东通账号',
    'account.auth.introConfigured': '使用临东通账号登录后可同步历史、偏好和后续票券状态。',
    'account.auth.introNotConfigured': '临东通登录尚未配置。',
    'account.auth.ldpassAccount': '临东通账号',
    'account.auth.localAdminLogin': '本地管理员登录',
    'account.auth.localAdminLoginHint': '仅用于本机开发，不会绕过后台 API 鉴权。',
    'account.auth.login': '使用临东通登录',
    'account.auth.logout': '退出雨城通',
    'account.auth.readonlyStatus': '账号状态：{status}',
    'account.auth.serverUnverified': '服务器账号未验证',
    'account.auth.serverVerified': '服务器账号已验证',
    'account.auth.serverVerifiedWithName': '服务器账号已验证：{name}',
    'account.authStatus.ldpassNotConfigured': '临东通登录尚未配置。',
    'account.authStatus.loggedOut': '已退出雨城通本地会话。',
    'account.authStatus.loginSuccess': '已完成临东通登录。',
    'account.authStatus.readonly': '当前账号只能进入只读账号页。',
    'account.authStatus.sessionCookieMissing':
      '雨城通没有收到临东通共享登录 Cookie。请确认临东通生产环境已配置 AUTH_COOKIE_DOMAIN=.shangxiaoguan.top，重启临东通并重新登录后再试。',
    'account.authStatus.sessionError': '临东通会话读取失败，请稍后重试。',
    'account.authStatus.sessionUnavailable': '未能从临东通读取有效账号信息。',
    'account.authStatus.sessionUnavailableLocalhost':
      '当前回跳地址是 localhost/127.0.0.1，本地站点无法直接读取临东通共享会话。请改用共享域名测试，或将本地服务切到已接入的同域测试环境。',
    'account.authStatus.stateInvalid': '登录状态校验失败，请重新发起登录。',
    'account.history.action.clearLocal': '清空本地',
    'account.history.action.manageTrips': '管理行程',
    'account.history.action.revokeLegacy': '撤销旧站同步',
    'account.history.action.revokingLegacy': '撤销中',
    'account.history.action.searchSchedules': '查询班次',
    'account.history.action.sync': '同步提醒',
    'account.history.action.syncing': '同步中',
    'account.history.action.viewMap': '查看地图',
    'account.history.clearConfirm':
      '要清空雨城通新版本地行程提醒、历史记录、班次查询记录和地图收藏吗？旧站 orders 原始数据不会被删除。',
    'account.history.legacyRevokeConfirmLocal':
      '撤销后，后续同步账号时会再次询问是否同步旧站 orders 导入的记录。',
    'account.history.legacyRevokeConfirmWithAccount':
      '撤销后，会删除账号中由旧站 orders 同步来的提醒副本，并保留本机旧站记录。后续同步账号时会再次询问。',
    'account.history.legacyRevokeDeleteFailed': '已撤销本地同意，账号副本删除失败',
    'account.history.legacyRevokeDeleted':
      '已撤销旧站记录同步同意，并删除 {count} 个账号侧旧站提醒副本',
    'account.history.legacyRevokeDeleting': '正在删除账号中的旧站提醒副本',
    'account.history.legacyRevokeDone': '已撤销旧站记录同步同意',
    'account.history.legacyRevokeNoCopies':
      '已撤销旧站记录同步同意，账号中没有需要删除的旧站提醒副本',
    'account.history.legacySyncConfirm':
      '这次同步包含 {count} 条从旧站 orders 只读导入的记录。同步后它们只会作为账号侧行程提醒快照，不代表新版票务订单、票券或核销凭证。是否同意同步这些旧站记录？',
    'account.history.legacySyncKept': '已保留旧站记录在本机，未同步到账号',
    'account.history.loadedFromAccount': '已载入账号中的 {count} 个提醒',
    'account.history.loading': '读取中',
    'account.history.mapFavorites': '{count} 个地图收藏',
    'account.history.noSyncNeeded': '没有需要同步的提醒',
    'account.history.pendingSync': '{count} 个待同步',
    'account.history.scheduleRecords': '{count} 条班次记录',
    'account.history.syncDone': '已同步 {count} 个提醒',
    'account.history.syncDoneWithSkipped': '已同步 {count} 个提醒，保留 {skipped} 条旧站记录在本机',
    'account.history.syncFailed': '行程提醒同步失败',
    'account.history.syncing': '正在同步提醒',
    'account.history.title': '本地历史',
    'account.history.total': '{count} 条',
    'account.history.tripHistory': '{count} 个历史行程',
    'account.history.upcomingTrips': '{count} 个即将进行',
    'account.notification.checkinDescription': '检票、核销和乘车码相关提醒',
    'account.notification.checkinLabel': '检票提醒',
    'account.notification.disabled': '本设备推送已关闭',
    'account.notification.enabled': '本设备推送已开启',
    'account.notification.gridAria': '允许推送的提醒类型',
    'account.notification.masterLabelDisabled': '本设备推送通知总开关，当前已关闭',
    'account.notification.masterLabelEnabled': '本设备推送通知总开关，当前已开启',
    'account.notification.note':
      '总开关只控制本设备是否接收 Push；下方分类决定哪些提醒允许推送；免打扰时段不会关闭分类，只会静默或延后这些提醒。',
    'account.notification.operationsDescription': '公告、线路调整和运营状态',
    'account.notification.operationsLabel': '运营提醒',
    'account.notification.quietEnd': '免打扰结束时间',
    'account.notification.quietStart': '免打扰开始时间',
    'account.notification.statusDisabledPreference': '已关闭通知偏好',
    'account.notification.statusLoginRequired': '登录后可把本设备加入服务端 Push 订阅',
    'account.notification.statusRegistered': '本设备已加入 Push 订阅：{host}',
    'account.notification.statusRegistering': '正在登记本设备 Push 订阅',
    'account.notification.statusRevoked': '已撤销本设备 Push 订阅',
    'account.notification.statusRevoking': '正在撤销本设备 Push 订阅',
    'account.notification.statusSyncFailed': '本设备 Push 订阅同步失败',
    'account.notification.ticketDescription': '订票、退票和票券状态变化',
    'account.notification.ticketLabel': '票务状态',
    'account.notification.title': '推送通知与免打扰时段',
    'account.notification.tripDescription': '出发、到站、历史行程相关提醒',
    'account.notification.tripLabel': '行程提醒',
    'account.pwa.action.clearCache': '清理缓存',
    'account.pwa.action.install': '安装雨城通',
    'account.pwa.action.refreshCache': '刷新缓存',
    'account.pwa.cacheChecking': '正在检查',
    'account.pwa.cacheClearing': '正在清理',
    'account.pwa.cacheEmpty': '暂无缓存',
    'account.pwa.cacheItems': '已缓存 {count} 项',
    'account.pwa.cacheRefreshing': '正在刷新',
    'account.pwa.cacheUnavailable': '缓存不可用',
    'account.pwa.description':
      '把 YCT 添加到主屏幕，快速查看运营信息、线路和站点详情。支持缓存已下载的自定义范围离线包，并在你允许后接收行程、运营、订票和检票提醒。',
    'account.pwa.descriptionPrefix': '安装雨城通：',
    'account.pwa.status.checking': '检查中',
    'account.pwa.status.installed': '已安装',
    'account.pwa.status.installable': '可安装',
    'account.pwa.status.manual': '可添加',
    'account.pwa.status.unsupported': '不可用',
    'account.pwa.statusDescription.checking': '正在检查当前浏览器是否支持安装入口。',
    'account.pwa.statusDescription.installed':
      '当前已经以独立应用方式打开，后续可继续在这里管理离线缓存。',
    'account.pwa.statusDescription.installable':
      '当前浏览器支持直接安装，点击“安装雨城通”即可打开安装确认。',
    'account.pwa.statusDescription.manual':
      '当前浏览器需要通过菜单添加到主屏幕或安装为应用；在 Safari 中可使用分享菜单里的“添加到主屏幕”。',
    'account.pwa.statusDescription.unsupported':
      '当前浏览器不支持安装入口，仍可继续使用网页和近期内容缓存。',
    'account.pwa.title': '安装与离线',
    'account.settings': '账号设置',
    'account.ticketDraft.count': '{count} 个',
    'account.ticketDraft.readonly': '账号为只读状态，Active 后可查看订单草稿。',
    'account.status.anonymous': '未登录',
    'account.status.notConfigured': '临东通未配置',
    'account.status.readonly': '只读账号',
    'account.status.unavailable': '账号状态暂不可用',
    'changelog.category.feat': '新增',
    'changelog.category.fix': '修复',
    'changelog.category.perf': '优化',
    'changelog.category.style': '界面',
    'changelog.changeCount': '{count} 项变更',
    'changelog.empty': '当前还没有可展示的版本更新。',
    'changelog.title': '版本更新',
    'brand.home': '雨城通首页',
    'contentPoiBinding.empty': '没有匹配的公开 POI。',
    'contentPoiBinding.hint': '只展示公开地图中的 POI；消息发布后才会在 POI 详情中生效。',
    'contentPoiBinding.loading': '正在读取公开 POI',
    'contentPoiBinding.optionsAria': '可关联 POI',
    'contentPoiBinding.searchAria': '搜索关联 POI',
    'contentPoiBinding.searchPlaceholder': '搜索 POI 名称、地址或 ID',
    'contentPoiBinding.selectedAria': '已关联 POI',
    'contentPoiBinding.title': '关联 POI',
    'contentPoiBinding.unavailable': '公开 POI 暂不可用',
    'embeddedMapPicker.empty': '请先输入坐标或选择一个参考地点。',
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
    'map.categoryName.airport': '机场',
    'map.categoryName.busStop': '公交站',
    'map.categoryName.coachStation': '客运站',
    'map.categoryName.commerce': '商业',
    'map.categoryName.dining': '餐饮',
    'map.categoryName.education': '教育',
    'map.categoryName.facility': '设施',
    'map.categoryName.ferryPort': '轮渡码头',
    'map.categoryName.industry': '产业设施',
    'map.categoryName.mapMarker': '地图标记',
    'map.categoryName.medical': '医疗',
    'map.categoryName.metroEntrance': '地铁出入口',
    'map.categoryName.metroStation': '地铁站',
    'map.categoryName.museum': '展馆',
    'map.categoryName.park': '公园绿地',
    'map.categoryName.parking': '停车',
    'map.categoryName.player': '玩家',
    'map.categoryName.publicService': '公共服务',
    'map.categoryName.railway': '铁路',
    'map.categoryName.railwayStation': '铁路车站',
    'map.categoryName.residence': '居住区',
    'map.categoryName.road': '道路',
    'map.categoryName.scenery': '景点',
    'map.categoryName.sports': '体育',
    'map.categoryName.tramStation': '有轨电车站',
    'map.categoryName.transitLine': '线路',
    'map.categoryName.water': '水域',
    'map.empty.favorites': '暂无收藏地点',
    'map.empty.loading': '正在读取地图标记',
    'map.empty.nearby': '周边暂无可显示标记',
    'map.empty.noMatch': '暂无匹配标记',
    'map.empty.unavailable': '暂无可显示地图标记',
    'map.geometry.linearObject': '线性对象端点组，{count} 个端点',
    'map.geometry.lineString': '线性对象，{count} 个节点',
    'map.geometry.pointMarker': '点标记',
    'map.geometry.region': '区域对象，{count} 个边界节点',
    'map.geometry.roadEndpointCount': '道路端点 {count} 个',
    'map.geometry.transitLineDetail': '站点坐标直连 {count} 个点',
    'map.geometry.transitLineObject': '线路对象，{count} 个站点坐标直连点',
    'map.geometry.transitLinePending': '待补线路坐标',
    'map.hud.aria': '地图比例尺与坐标',
    'map.hud.cursor': '移动光标查看坐标',
    'map.hud.scale.blocks': '{value} 格',
    'map.hud.scale.kilometers': '{value} km',
    'map.markerList.count': '{count} 个',
    'map.markerList.default': '地图标记',
    'map.markerList.fullLength': '全长 {distance}',
    'map.markerList.nearby': '{name}周边',
    'map.markerList.nearbyLinear': '{name}沿线',
    'map.markerList.playerCount': '{online}/{total} 个',
    'map.markerList.results': '搜索结果',
    'map.metroInfrastructure.direction.down': '向下',
    'map.metroInfrastructure.direction.here': '本站换乘',
    'map.metroInfrastructure.direction.up': '向上',
    'map.metroInfrastructure.downwardsTerminus': '下行终点',
    'map.metroInfrastructure.exitGroup.left': '{arrow}{codes}出口',
    'map.metroInfrastructure.exitGroup.right': '{codes}出口{arrow}',
    'map.metroInfrastructure.facing': '朝向 {orientation}',
    'map.metroInfrastructure.facility.elevator': '电梯',
    'map.metroInfrastructure.facility.escalator': '扶梯',
    'map.metroInfrastructure.facility.escalatorAndStairs': '扶梯/楼梯',
    'map.metroInfrastructure.facility.exit': '出口',
    'map.metroInfrastructure.facility.familyRestroom': '家庭卫生间',
    'map.metroInfrastructure.facility.accessibleRestroom': '无障碍卫生间',
    'map.metroInfrastructure.facility.meetingPoint': '会合点',
    'map.metroInfrastructure.facility.mensRestroom': '男卫生间',
    'map.metroInfrastructure.facility.nursingRoom': '母婴室',
    'map.metroInfrastructure.facility.passengerServiceCenter': '乘客服务中心',
    'map.metroInfrastructure.facility.platformDoor': '屏蔽门',
    'map.metroInfrastructure.facility.police': '警务室',
    'map.metroInfrastructure.facility.stairs': '楼梯',
    'map.metroInfrastructure.facility.stairsTwoWay': '双向楼梯',
    'map.metroInfrastructure.facility.subway': '地铁',
    'map.metroInfrastructure.facility.thirdRestroom': '第三卫生间',
    'map.metroInfrastructure.facility.ticketMachine': '自动售票机',
    'map.metroInfrastructure.facility.toilet': '卫生间',
    'map.metroInfrastructure.facility.waitingRoom': '候车室',
    'map.metroInfrastructure.facility.wheelchair': '无障碍设施',
    'map.metroInfrastructure.facility.wheelchairLift': '轮椅升降机',
    'map.metroInfrastructure.facility.womensRestroom': '女卫生间',
    'map.metroInfrastructure.floorEmpty': '暂无站内节点记录',
    'map.metroInfrastructure.layer.concourse': '站厅层',
    'map.metroInfrastructure.layer.entrance': '入口层',
    'map.metroInfrastructure.layer.passageway': '通道层',
    'map.metroInfrastructure.layer.platform': '站台层',
    'map.metroInfrastructure.layer.transfer': '换乘层',
    'map.metroInfrastructure.lineTowards': '{lineName} 开往{terminal}',
    'map.metroInfrastructure.oneWay.both': '双向通行',
    'map.metroInfrastructure.oneWay.down': '仅下行',
    'map.metroInfrastructure.oneWay.up': '仅上行',
    'map.metroInfrastructure.platformDoors': '{side}开门',
    'map.metroInfrastructure.platformSide.both': '两侧',
    'map.metroInfrastructure.platformSide.left': '左侧',
    'map.metroInfrastructure.platformSide.right': '右侧',
    'map.metroInfrastructure.platformSide.unknown': '方向未记录',
    'map.metroInfrastructure.tabsAria': '线路设施信息',
    'map.metroInfrastructure.title': '站内设施信息',
    'map.metroInfrastructure.towardsLeft': '← 开往 {station}',
    'map.metroInfrastructure.towardsRight': '开往 {station} →',
    'map.metroInfrastructure.transferAction': '查看{title}站台设施',
    'map.metroInfrastructure.transferDirection.downwards': '下行方向换乘',
    'map.metroInfrastructure.transferDirection.upwards': '上行方向换乘',
    'map.metroInfrastructure.upwardsTerminus': '上行终点',
    'map.layer.aria': '图层与投稿',
    'map.layer.linearFeatures': '线条与标签',
    'map.layer.linearFeaturesHidden': '已隐藏道路/线路覆盖',
    'map.layer.linearFeaturesVisible': '显示道路/线路覆盖',
    'map.layer.markers': '标记点',
    'map.layer.markersHidden': '已隐藏地点标记',
    'map.layer.markersVisible': '显示地点标记',
    'map.layer.modeAria': '地图浏览模式',
    'map.layer.mode.roadNetwork': '路网',
    'map.layer.mode.satellite': '卫星',
    'map.layer.mode.traffic': '交通',
    'map.layer.noteRoadNetwork': '关闭瓦片，突出道路网络和道路文字。',
    'map.layer.noteSatellite': '加载{name}，仅叠加关键道路。',
    'map.layer.noteTraffic': '关闭瓦片，突出公共交通站点并淡化道路。',
    'map.layer.open': '图层与投稿',
    'map.layer.players': '玩家位置',
    'map.layer.playersHidden': '已隐藏在线/离线玩家',
    'map.layer.playersVisible': '显示在线/离线玩家',
    'map.layer.perspective': '俯视 2.5D',
    'map.layer.perspectiveHidden': '按二维区域显示',
    'map.layer.perspectiveVisible': '显示立体 POI 体块',
    'map.layer.submitPoi': '投稿 POI',
    'map.layer.tileProvider': '瓦片源',
    'map.layer.tileProviderAria': '瓦片源',
    'map.lineDetail.fare': '票价',
    'map.lineDetail.stations': '站点',
    'map.lineInfo.openAria': '查看 {name} 线路信息',
    'map.lineInfo.timezoneNote': '首末车、发车时刻与预计到站时间均为北京时间（UTC+8）。',
    'map.lineInfo.title': '{name} · 线路信息',
    'map.lineRealtime.allTrips': '全部班次',
    'map.lineRealtime.atStation': '停靠 {station}',
    'map.lineRealtime.beijingTime': '北京时间',
    'map.lineRealtime.boardArrivalAt': '{time} 到达',
    'map.lineRealtime.boardArriving': '即将到站',
    'map.lineRealtime.boardDepartureAt': '{time} 离开',
    'map.lineRealtime.boardLeaving': '即将离开',
    'map.lineRealtime.boardMinutes': '{minutes} 分钟',
    'map.lineRealtime.boardWaiting': '等待发车',
    'map.lineRealtime.countBadge': '{active}/{total}',
    'map.lineRealtime.countBadgeAria': '在途 {active} 辆，未离开选中车站 {total} 班',
    'map.lineRealtime.detailArrival': '预计到达',
    'map.lineRealtime.detailDeparture': '首站发车',
    'map.lineRealtime.detailDepartureAtStation': '预计离开',
    'map.lineRealtime.detailPosition': '当前位置',
    'map.lineRealtime.detailSelectedStation': '选中车站',
    'map.lineRealtime.detailStatus': '到站状态',
    'map.lineRealtime.detailWaiting': '尚未发车',
    'map.lineRealtime.emptyActive': '当前时段暂无在途车辆',
    'map.lineRealtime.emptySchedule': '该方向尚未录入发车时刻表',
    'map.lineRealtime.inSegment': '行驶于 {from} → {to} 区间',
    'map.lineRealtime.lastTripPassed': '末班车已过，下一班 {time}',
    'map.lineRealtime.lastTripPassedNextDay': '末班车已过，下一班 {time}（次日）',
    'map.lineRealtime.minutesToNext': '距下一站约 {count} 分钟',
    'map.lineRealtime.nextDeparture': '下一班 {time}',
    'map.lineRealtime.nextDepartureNextDay': '下一班 {time}（次日）',
    'map.lineRealtime.noMoreTrips': '今日已无后续班次',
    'map.lineRealtime.note':
      '按已录入的首站发车时刻推算；区间用时优先使用后台设置，缺失时按线路长度与平均速度估算。',
    'map.lineRealtime.selectStationHint': '点击站点查看该站实时信息',
    'map.lineRealtime.stationAt': '当前有车停靠',
    'map.lineRealtime.stationEta': '预计 {time} 到达 · 约 {minutes} 分钟',
    'map.lineRealtime.stationNextArrival': '最近一班约 {minutes} 分钟后到达（预计 {time}）',
    'map.lineRealtime.stationNoData': '该站暂无实时站点数据',
    'map.lineRealtime.stationNoVehicle': '当前没有前往该站的车辆',
    'map.lineRealtime.stationPassed': '已通过该站',
    'map.lineRealtime.summary': '共 {count} 辆在途',
    'map.lineRealtime.title': '实时公交',
    'map.lineRealtime.trip': '第 {count} 班 · {time} 发车',
    'map.lineRealtime.tripTitlePosition': '第 {current}/{total} 班',
    'map.lineRealtime.updatedAt': '更新于 {time}',
    'map.lineRealtime.vehicleBadge': '第 {count} 班 · {time} 发车',
    'map.lineStation.showPoi': '查看站点',
    'map.nearby.exit': '退出',
    'map.nearby.mileage': '沿线 {distance}',
    'map.nearby.note': '按距离显示 {name} 周边标记',
    'map.nearby.noteLinear': '按沿线里程显示 {name} 沿线标记',
    'map.nearby.rangeAria': '沿线里程范围',
    'map.nearby.rangeLabel': '沿线范围',
    'map.nearby.rangeValue': '{from} - {to}',
    'map.nearby.scopeAria': '区域周边范围',
    'map.nearby.scopeInside': '区域内',
    'map.nearby.scopeOutside': '区域外附近',
    'map.overlay.aria': '地图标记示意层',
    'map.overlay.linearPoiTitle': '{name} · {count} 个端点',
    'map.overlay.markerTitle': '{name}（{x}, {z}）',
    'map.overlay.roadTraceTitle': '{name} · 近似线，{count} 个端点',
    'map.overlay.transitTraceTitle': '{name} · {count} 个途经站',
    'map.overlay.viewMarker': '查看 {name}',
    'map.player.lastSeen': '最后在线：{time}',
    'map.player.observed': '最近观测：{time}',
    'map.player.serverAccount': '服务器账号',
    'map.player.status.offline': '离线',
    'map.player.status.online': '在线',
    'map.poi.actions': '地点操作',
    'map.poi.address': '地址',
    'map.poi.close': '关闭地点信息',
    'map.poi.collapse': '收起地点信息',
    'map.poi.connections': '接驳线路',
    'map.poi.coordinate': '坐标',
    'map.poi.count': '{count} 个',
    'map.poi.copyStatus': '已复制地点链接',
    'map.poi.expand': '展开地点信息',
    'map.poi.facilities': '设施/出入口',
    'map.poi.favoriteAria': '收藏 {name}',
    'map.poi.favoriteStatus': '已收藏 {name}',
    'map.poi.floor': '楼层',
    'map.poi.filterAll': '全部',
    'map.poi.filterCategory': '子地点分类',
    'map.poi.filterFloor': '楼层',
    'map.poi.filterKeyword': '检索子地点',
    'map.poi.filterKeywordPlaceholder': '名称、地址、设施等',
    'map.poi.group.access': '出入口',
    'map.poi.group.building': '楼栋',
    'map.poi.group.facility': '设施',
    'map.poi.group.nearby': '周边',
    'map.poi.group.scenery': '景点',
    'map.poi.group.transport': '交通',
    'map.poi.imageAlt': '{name} 图片',
    'map.poi.imageCounter': '{current} / {total}',
    'map.poi.imageNext': '下一张图片',
    'map.poi.imagePrevious': '上一张图片',
    'map.poi.nearbyAlongAria': '搜索 {name} 沿线标记',
    'map.poi.nearbyAria': '搜索 {name} 周边',
    'map.poi.noConnections': '暂无已知接驳线路',
    'map.poi.noFacilities': '暂无设施数据',
    'map.poi.objectFallback': '地图对象',
    'map.poi.openDetail': '打开详情',
    'map.poi.openingHours': '营业时间',
    'map.poi.operations': '运营消息',
    'map.poi.operationsEmpty': '当前没有生效中的运营消息',
    'map.poi.operationsLoading': '正在读取运营消息',
    'map.poi.parent': '所属地点',
    'map.poi.boundRegions': '所属区域',
    'map.poi.parentFallback': '父地点',
    'map.poi.relatedPlaceFallback': '关联地点',
    'map.poi.relatedPlaces': '关联地点',
    'map.poi.route': '查看路线',
    'map.poi.shareAria': '分享 {name}',
    'map.poi.shareOpened': '已打开系统分享面板',
    'map.poi.shareText': '在雨城通地图中查看 {name}',
    'map.poi.shareTitle': '{name} - 雨城通地图',
    'map.poi.shareUnavailable': '当前浏览器暂不支持分享或复制',
    'map.poi.summary': '简介',
    'map.poi.tabsAria': '地点信息分类',
    'map.poi.type': '类型',
    'map.poi.unfavoriteAria': '取消收藏 {name}',
    'map.poi.unfavoriteStatus': '已取消收藏 {name}',
    'map.poiSubmit.category': '分类',
    'map.poiSubmit.address': '文字地址',
    'map.poiSubmit.addressPlaceholder': '例如：青年大街 18 号',
    'map.poiSubmit.addressRoad': '地址道路',
    'map.poiSubmit.floor': '楼层',
    'map.poiSubmit.floorPlaceholder': '例如：B1、3F、站厅层',
    'map.poiSubmit.close': '关闭投稿窗口',
    'map.poiSubmit.description': '地点简介',
    'map.poiSubmit.descriptionPlaceholder': '可填写地点用途、开放状态、出入口说明等',
    'map.poiSubmit.href': '相关链接',
    'map.poiSubmit.hrefPlaceholder': 'https://...',
    'map.poiSubmit.imageFile': '上传图片',
    'map.poiSubmit.imageFileCount': '已选择 {count} 张图片',
    'map.poiSubmit.imageUploadFailed': '图片上传失败',
    'map.poiSubmit.imageUrl': '图片链接',
    'map.poiSubmit.imageUrlPlaceholder': 'https://.../photo.png',
    'map.poiSubmit.invalid': '请填写名称、分类和有效坐标。',
    'map.poiSubmit.invalidFacility': '请填写每条设施信息的文字描述。',
    'map.poiSubmit.tooManyImages': '每个 POI 最多可提交 12 张图片。',
    'map.poiSubmit.name': '地点名称',
    'map.poiSubmit.namePlaceholder': '地点名称',
    'map.poiSubmit.noAddressRoad': '不绑定道路',
    'map.poiSubmit.openingHours': '营业时间',
    'map.poiSubmit.openingHoursPlaceholder': '例如：周一至周五 09:00-18:00',
    'map.poiSubmit.pickCancel': '取消',
    'map.poiSubmit.pickDone': '已选择坐标 {point}。',
    'map.poiSubmit.pickHint': '轻点地图空白处设置投稿坐标',
    'map.poiSubmit.pickOnMap': '在地图上选点',
    'map.poiSubmit.pickPrompt': '请在地图空白处轻点，选择投稿 POI 的坐标。',
    'map.poiSubmit.submit': '提交审核',
    'map.poiSubmit.submitFailed': '投稿提交失败',
    'map.poiSubmit.submitting': '提交中',
    'map.poiSubmit.success': '已提交，等待管理员审核。',
    'map.poiSubmit.title': '投稿公开 POI',
    'map.poiSubmit.x': 'X 坐标',
    'map.poiSubmit.z': 'Z 坐标',
    'map.source.loading': '地图数据读取中',
    'map.source.objectCount': '{count} 个对象',
    'map.source.provider.lindongFreshHttp': 'Lindong 较新瓦片',
    'map.source.provider.lindongSafeHttpsStatic': 'Lindong HTTPS 静态瓦片',
    'map.source.provider.lindongUnminedStatic': 'Lindong uNmINeD 静态瓦片',
    'map.source.providerNote.lindongFreshHttp':
      '该源较新，已通过 YCT 后端代理同源加载以避免 HTTPS 混合内容风险。',
    'map.source.providerNote.lindongSafeHttpsStatic':
      '该源无混合内容风险，但可能不反映最新地图状态。',
    'map.source.providerNote.lindongUnminedStatic':
      '该源来自 map.shangxiaoguan.top 的 HTTPS 静态地图，后续需接入 uNmINeD 坐标转换后完整渲染。',
    'map.source.tileFallback': '地图瓦片',
    'map.source.tileProvider': '当前瓦片源：{name}',
    'map.source.tooltipLoading': '地图数据正在读取。',
    'map.source.unavailable': '地图数据暂不可用',
    'map.location.currentAccount': '当前账号：{name}',
    'map.search.aria': '搜索地图地点',
    'map.search.clear': '清空地图搜索',
    'map.search.placeholder': '搜索地图地点、道路或线路',
    'map.routingStatus.projecting': '正在准备道路接入点',
    'map.share.actions': '分享方式',
    'map.share.close': '关闭分享面板',
    'map.share.footerDisclaimer': '上述地名、组织名均为虚构',
    'map.share.footerPrefix': '来自',
    'map.share.footerText': '来自雨城通',
    'map.share.image': '分享图',
    'map.share.imageDownloaded': '分享图已下载',
    'map.share.imageShared': '已打开图片分享面板',
    'map.share.coordinate': '复制坐标',
    'map.share.coordinateCopied': '坐标已复制',
    'map.share.copy': '复制',
    'map.share.copyKind': '复制内容',
    'map.share.link': '复制链接',
    'map.share.linkCopied': '已复制分享链接',
    'map.share.processing': '处理中',
    'map.share.qrCode': '分享链接二维码',
    'map.share.text': '复制文字版',
    'map.share.textCopied': '已复制文字版内容',
    'map.share.teleport': '复制传送指令',
    'map.share.teleportCopied': '传送指令已复制',
    'map.share.title': '分享',
    'map.share.unavailable': '当前浏览器暂不支持该分享方式',
    'map.toolbar.reset': '回到当前位置或默认视图',
    'map.toolbar.zoomIn': '放大地图',
    'map.toolbar.zoomOut': '缩小地图',
    'map.title': '地图探索',
    'mapStageLoader.aria': '地图加载中',
    'mapStageLoader.loading': '地图正在加载',
    'siteLegal.aria': '备案信息',
    'siteLegal.disclaimer': '本站部分代码使用人工智能技术生成，上述地名、组织名均为虚构。',
    'siteLegal.icp': '辽ICP备2021004959号-1',
    'siteLegal.police': '辽公网安备21100502000117号',
    'siteLegal.version': '版本 {version}',
    'map.route.alight': '{name} 下车',
    'map.route.alightFerry': '{name} 下船',
    'map.route.alightMetro': '{name} 出站',
    'map.route.linearEndpointBlocked': '起点和终点不能同时为线路或道路等线性要素',
    'map.route.aria': '路线规划',
    'map.route.arrive': '到达 {name}',
    'map.route.badge.fastest': '最快到达',
    'map.route.badge.fewestTransfers': '最少换乘',
    'map.route.badge.leastWalking': '最少步行',
    'map.route.board': '{name} 上车',
    'map.route.boardFerry': '{name} 上船',
    'map.route.boardMetro': '{name} 进站',
    'map.route.close': '关闭路线规划',
    'map.route.collapse': '收起路线规划',
    'map.route.currentLocation': '当前地点',
    'map.route.defaultView': '默认视图',
    'map.route.depart': '{name} 出发',
    'map.route.destination': '终点',
    'map.route.directTitle': '{mode}直达',
    'map.route.taxiDirect': '打车直达',
    'map.route.taxiAlternativeOne': '打车备选 1',
    'map.route.taxiAlternativeTwo': '打车备选 2',
    'map.route.taxiFewestSegments': '少路段打车',
    'map.route.taxiNote':
      '出租车只沿道路行驶；移动时间按后台默认限速 {speed} km/h 与路口延误估算，计价规则由后台维护。',
    'map.route.taxiWithDistance': '乘出租车沿道路行驶 {distance} {duration}',
    'map.route.taxiWalkFromDropoff': '下车后步行 {distance} {duration}',
    'map.route.taxiWalkToPickup': '步行到道路上车点 {distance} {duration}',
    'map.route.distance.blocks': '{count} 格',
    'map.route.duration.short': '约 {count} 分',
    'map.route.duration.step': '{count}分钟',
    'map.route.edit': '修改',
    'map.route.endpointCandidatesAria': '路线端点候选',
    'map.route.expand': '展开路线规划',
    'map.route.featuresAria': '路线特征',
    'map.route.fare.estimated': '预计 {amount}',
    'map.route.fare.exact': '{amount}',
    'map.route.fare.partial': '已知 {amount} 起',
    'map.route.fare.unavailable': '票价待确认',
    'map.route.input.destination': '输入路线终点',
    'map.route.input.origin': '输入路线起点',
    'map.route.loadingDetail': '首次构建道路图可能需要几秒',
    'map.route.loadingNote': '旧道路图较大时，首次规划可能需要几秒。',
    'map.route.loadingTitle': '正在计算路线方案',
    'map.route.marker.destination': '终',
    'map.route.marker.origin': '起',
    'map.route.metroEnterViaAccess': '经 {access} 进站',
    'map.route.metroExitViaAccess': '经 {access} 出站',
    'map.route.mode.all': '全部',
    'map.route.mode.bus': '公交',
    'map.route.mode.coach': '客运',
    'map.route.mode.collapse': '收起',
    'map.route.mode.taxi': '打车',
    'map.route.mode.ferry': '轮渡',
    'map.route.mode.metro': '地铁',
    'map.route.mode.more': '更多{count}',
    'map.route.mode.railway': '铁路',
    'map.route.mode.tram': '有轨',
    'map.route.mode.walk': '步行',
    'map.route.modeAria': '路线交通方式',
    'map.route.noEndpointCandidates': '没有匹配的可定位标记。',
    'map.route.noModes': '请至少启用一种交通方式。',
    'map.route.noOptions': '暂未找到可用路线方案。',
    'map.route.optionFallback': '路线方案',
    'map.route.optionsAria': '路线方案',
    'map.route.origin': '起点',
    'map.route.planning': '正在根据道路和交通方式规划候选路线…',
    'map.route.ride': '乘坐 {line}（{direction}方向） {stops}站 {duration}',
    'map.route.road.approach': '接近 {road}',
    'map.route.road.connection': '连接到 {road}',
    'map.route.road.depart': '前往终点',
    'map.route.road.enter': '进入{road}',
    'map.route.selectDestination': '选择终点',
    'map.route.selectOrigin': '选择起点',
    'map.route.sort.time': '按时间排序',
    'map.route.sort.fare': '按票价排序',
    'map.route.sort.transfers': '按换乘次数排序',
    'map.route.sort.walking': '按步行距离排序',
    'map.route.sortAria': '路线排序方式',
    'map.route.copyStatus': '已复制路线链接',
    'map.route.share': '分享路线',
    'map.route.shareOpened': '已打开系统分享面板',
    'map.route.shareText': '查看 {route} 的路线规划',
    'map.route.shareTitle': '分享雨城通路线规划',
    'map.route.shareUnavailable': '分享不可用，请手动复制当前链接。',
    'map.route.stationCount': '{count}站',
    'map.route.stepDetails.collapse': '收起详细步骤',
    'map.route.stepDetails.expand': '展开详细步骤',
    'map.route.stepsAria': '选中路线步骤',
    'map.route.summary.directEstimate': '直线估算',
    'map.route.summary.roadEstimate': '沿道路估算',
    'map.route.summary.walking': '步行',
    'map.route.swap': '交换起终点',
    'map.route.traceTitle': '{title} · 初步估算',
    'map.route.transferAction': '{name} 换乘',
    'map.route.transferTitle': '{firstMode}+{secondMode}换乘',
    'map.route.transferWalk': '换乘 步行 {distance} {duration}',
    'map.route.transitNote.default':
      '已按真实线路站序生成候选；站间耗时优先使用旧数据 travelTime，缺失时仍按距离估算。',
    'map.route.transitNote.fallbackRoad':
      '公交/客运站间要求沿道路行驶；当前路网缺失或不连通时不会生成该候选。站间耗时优先使用后台区间用时，其次使用旧数据 travelTime。',
    'map.route.transitNote.road':
      '公交/客运站间只沿旧地图道路中心线生成，并仅在中心线平面相交处推断路口；无法连通的候选已排除。站间耗时优先使用后台区间用时，其次使用旧数据 travelTime。',
    'map.route.transitNote.transfer':
      '已按真实线路站序组合一次换乘候选；换乘距离和缺失站间耗时仍为估算。',
    'map.route.turn.left': '左转',
    'map.route.turn.right': '右转',
    'map.route.turn.slightLeft': '向左前方',
    'map.route.turn.slightRight': '向右前方',
    'map.route.turn.straight': '直行',
    'map.route.useMapCenter': '使用地图中心',
    'map.route.walkDirect': '步行直达',
    'map.route.walkAlternativeOne': '步行备选 1',
    'map.route.walkAlternativeTwo': '步行备选 2',
    'map.route.walkFewerTurns': '少转弯步行',
    'map.route.walkFewestSegments': '少路段步行',
    'map.route.walkFromAccess': '经 {access} 步行至终点 {distance} {duration}',
    'map.route.walkNote.direct': '当前未找到可连通道路图，步行暂按直线估算。',
    'map.route.walkNote.road':
      '步行默认优先使用旧地图道路中心线，并只在中心线平面交点换路；无法连通的片段会回退直线估算。',
    'map.route.walkRoadWithDistance': '沿道路步行 {distance} {duration}',
    'map.route.walkStraight': '直线步行',
    'map.route.walkToAccess': '步行至 {access} {distance} {duration}',
    'map.route.walkWithDistance': '步行 {distance} {duration}',
    'map.roadDetail.description': '这是一组从旧地图道路端点归并出的线性地点，当前轨迹为近似展示。',
    'map.roadDetail.endpointCount': '端点数量',
    'map.roadDetail.endpointCountValue': '{count} 个',
    'map.roadDetail.traceHighlighted': '已在地图上高亮近似轨迹',
    'map.roadDetail.traceStatus': '轨迹状态',
    'metroWayfindingEditor.action.addElement': '添加元素',
    'metroWayfindingEditor.action.cancel': '取消',
    'metroWayfindingEditor.action.clear': '清空',
    'metroWayfindingEditor.action.close': '关闭',
    'metroWayfindingEditor.action.delete': '删除',
    'metroWayfindingEditor.action.done': '完成',
    'metroWayfindingEditor.action.dragToReorder': '拖动更改顺序',
    'metroWayfindingEditor.action.duplicate': '复制',
    'metroWayfindingEditor.action.duplicateElement': '创建元素副本',
    'metroWayfindingEditor.action.importSign': '导入导视牌',
    'metroWayfindingEditor.action.moveDown': '下移',
    'metroWayfindingEditor.action.moveLeft': '向左移动',
    'metroWayfindingEditor.action.moveRight': '向右移动',
    'metroWayfindingEditor.action.moveRowDownAria': '下移此行',
    'metroWayfindingEditor.action.moveRowUpAria': '上移此行',
    'metroWayfindingEditor.action.moveUp': '上移',
    'metroWayfindingEditor.action.openProjectLibraryTitle': '版式模板与导入工程',
    'metroWayfindingEditor.action.openTemplateLibrary': '打开模板库',
    'metroWayfindingEditor.action.removeElement': '移除元素',
    'metroWayfindingEditor.action.replaceSign': '替换现有导视牌',
    'metroWayfindingEditor.action.reverse': '反转',
    'metroWayfindingEditor.action.reverseDisabledVertical': '竖向模板不支持反转顺序',
    'metroWayfindingEditor.action.reverseTitle': '反转导视牌元素顺序',
    'metroWayfindingEditor.action.templateLibrary': '模板库',
    'metroWayfindingEditor.align.center': '居中',
    'metroWayfindingEditor.align.left': '左对齐',
    'metroWayfindingEditor.align.right': '右对齐',
    'metroWayfindingEditor.aria.addElementToRow': '向{row}添加元素',
    'metroWayfindingEditor.aria.canvas': '地铁导视牌编排',
    'metroWayfindingEditor.aria.combination': '组合框，{count} 个子元素，缩放 {scale}%',
    'metroWayfindingEditor.aria.defaultLineName': '线路',
    'metroWayfindingEditor.aria.draggableTab': '{label}，可拖动更改顺序',
    'metroWayfindingEditor.aria.emptyState': '开始创建导视牌',
    'metroWayfindingEditor.aria.fixedSpace': '固定空白，{units} 格',
    'metroWayfindingEditor.aria.flexSpace': '弹性空白',
    'metroWayfindingEditor.aria.inlineEditable': '{label}，可内联编辑',
    'metroWayfindingEditor.aria.largeTextWithSummary': '大文字，{summary}',
    'metroWayfindingEditor.aria.partSuffix': '，{value}',
    'metroWayfindingEditor.aria.removeSegment': '删除{kind}',
    'metroWayfindingEditor.aria.rowElements': '{row}已添加元素',
    'metroWayfindingEditor.aria.segmentOrdinal': '第 {index} 个{kind}',
    'metroWayfindingEditor.aria.suffixOrdinal': '第 {index} 个下角标',
    'metroWayfindingEditor.aria.textElement': '文字，{rows} 行，{alignment}',
    'metroWayfindingEditor.aria.textSegment': '{label}的文本段 {index}',
    'metroWayfindingEditor.color.background': '元素背景色',
    'metroWayfindingEditor.color.custom': '自定义颜色',
    'metroWayfindingEditor.color.customAria': '{label}自定义颜色',
    'metroWayfindingEditor.color.foreground': '元素文字、线条与图标颜色',
    'metroWayfindingEditor.color.inherit': '跟随导视牌',
    'metroWayfindingEditor.combination.addAria': '添加组合框子元素',
    'metroWayfindingEditor.combination.addFacility': '设施图标',
    'metroWayfindingEditor.combination.addSpace': '空格',
    'metroWayfindingEditor.combination.childDuplicateAria': '复制子元素',
    'metroWayfindingEditor.combination.childMoveDownAria': '子元素下移',
    'metroWayfindingEditor.combination.childMoveUpAria': '子元素上移',
    'metroWayfindingEditor.combination.childRemoveAria': '删除子元素',
    'metroWayfindingEditor.combination.childType': '子元素类型',
    'metroWayfindingEditor.combination.closeAria': '关闭组合框编辑',
    'metroWayfindingEditor.combination.description':
      '支持设施图标、箭头、文字、大文字和固定或弹性空格，子元素不会超出组合框。',
    'metroWayfindingEditor.combination.editTitle': '编辑组合内容',
    'metroWayfindingEditor.combination.editWithCount': '编辑组合内容（{count}）',
    'metroWayfindingEditor.combination.empty': '组合框还没有子元素。',
    'metroWayfindingEditor.combination.eyebrow': '组合框子元素',
    'metroWayfindingEditor.combination.fill': '组合框填充',
    'metroWayfindingEditor.combination.fillColor': '组合框填充色',
    'metroWayfindingEditor.combination.listAria': '组合框子元素列表',
    'metroWayfindingEditor.combination.scale': '组合框缩放倍数',
    'metroWayfindingEditor.combination.stripeColor': '色带颜色',
    'metroWayfindingEditor.combination.stripePosition': '色带位置',
    'metroWayfindingEditor.combination.templateHint':
      '「线路编号」内容模板已移至编辑器上方的「插入建议」区域：选中线路后可替换本组合框的子元素，并按颜色填充或色带样式套用线路标识色。',
    'metroWayfindingEditor.confirm.clear': '确认清空当前地铁导视牌的全部元素？',
    'metroWayfindingEditor.direction.down': '向下',
    'metroWayfindingEditor.direction.left': '向左',
    'metroWayfindingEditor.direction.right': '向右',
    'metroWayfindingEditor.direction.up': '向上',
    'metroWayfindingEditor.divider.note': '竖线宽 {width}、高 72，随导视牌像素单元等比缩放。',
    'metroWayfindingEditor.elementLabel.arrow': '箭头 · 85 × 85',
    'metroWayfindingEditor.elementLabel.combination': '组合框 · {scale}% · {count} 个子元素',
    'metroWayfindingEditor.elementLabel.divider': '分割线 · {width} × 72',
    'metroWayfindingEditor.elementLabel.facility': '设施图标 · 85 × 85',
    'metroWayfindingEditor.elementLabel.largeText': '大文字 · 字高 {size}',
    'metroWayfindingEditor.elementLabel.space': '空白元素',
    'metroWayfindingEditor.elementLabel.text': '文字 · {rows} 行',
    'metroWayfindingEditor.elementType.arrow': '箭头',
    'metroWayfindingEditor.elementType.combination': '组合框',
    'metroWayfindingEditor.elementType.divider': '分割线',
    'metroWayfindingEditor.elementType.facility': '设施',
    'metroWayfindingEditor.elementType.largeText': '大文字',
    'metroWayfindingEditor.elementType.space': '空白',
    'metroWayfindingEditor.elementType.spaceShort': '空格',
    'metroWayfindingEditor.elementType.text': '文字',
    'metroWayfindingEditor.empty.description': '添加第一个元素，或从模板库载入现成版式。',
    'metroWayfindingEditor.empty.title': '开始创建导视牌',
    'metroWayfindingEditor.error.fileTooLarge': '{name} 超过 {limit} MB，已停止读取。',
    'metroWayfindingEditor.error.parseFailed': '工程文件解析失败。',
    'metroWayfindingEditor.error.tooManyFiles': '一次最多导入 {count} 个工程文件。',
    'metroWayfindingEditor.examples.aria': '地铁导视版式模板',
    'metroWayfindingEditor.examples.categoriesAria': '模板分类',
    'metroWayfindingEditor.examples.categoryEntry': '进站相关',
    'metroWayfindingEditor.examples.categoryExit': '出站相关',
    'metroWayfindingEditor.examples.categoryTransfer': '换乘相关',
    'metroWayfindingEditor.examples.description': '选择一个版式开始编辑',
    'metroWayfindingEditor.examples.empty': '当前线网没有可用示例模板',
    'metroWayfindingEditor.examples.line': '套用线路',
    'metroWayfindingEditor.examples.loadAria': '载入{remark}，{mode}，{size}',
    'metroWayfindingEditor.examples.station': '套用车站',
    'metroWayfindingEditor.examples.title': '版式模板',
    'metroWayfindingEditor.examples.useTemplate': '使用此模板',
    'metroWayfindingEditor.field.addForegroundStroke': '添加前景色描边',
    'metroWayfindingEditor.field.addFrame': '添加外框',
    'metroWayfindingEditor.field.alignment': '对齐',
    'metroWayfindingEditor.field.arrow': '箭头',
    'metroWayfindingEditor.field.backgroundColor': '导视牌底色',
    'metroWayfindingEditor.field.defaultForegroundColor': '默认文字与图形颜色',
    'metroWayfindingEditor.field.elementType': '元素类型',
    'metroWayfindingEditor.field.exitIconDirection': '出口图标方向',
    'metroWayfindingEditor.field.facilityIcon': '设施图标',
    'metroWayfindingEditor.field.iconDirection': '图标方向',
    'metroWayfindingEditor.field.iconVariant': '图标变种',
    'metroWayfindingEditor.field.layout': '版式',
    'metroWayfindingEditor.field.rowDivider': '添加行间分割线',
    'metroWayfindingEditor.field.writingMode': '文字排列',
    'metroWayfindingEditor.fill.color': '颜色填充',
    'metroWayfindingEditor.fill.inverse': '反色填充',
    'metroWayfindingEditor.fill.none': '无填充',
    'metroWayfindingEditor.fill.stripe': '无填充+色带',
    'metroWayfindingEditor.frame.circle': '圆形',
    'metroWayfindingEditor.frame.fill': '外框填充',
    'metroWayfindingEditor.frame.fillColor': '外框填充色',
    'metroWayfindingEditor.frame.none': '无',
    'metroWayfindingEditor.frame.rectangle': '矩形',
    'metroWayfindingEditor.frame.shape': '外框形状',
    'metroWayfindingEditor.import.description':
      '选择 JSON 工程文件，系统会先解析并展示转换预览，确认后再替换当前导视牌。',
    'metroWayfindingEditor.import.dropActive': '松开鼠标即可导入工程文件',
    'metroWayfindingEditor.import.dropHint': '也可以将 JSON 工程文件拖放到此处',
    'metroWayfindingEditor.import.fileLimits': '文件限制',
    'metroWayfindingEditor.import.fileLimitsDescription':
      '最多选择 {count} 个文件，单个文件不超过 {size} MB；不同编辑器的工程不能混合导入。',
    'metroWayfindingEditor.import.selectFiles': '选择工程文件',
    'metroWayfindingEditor.import.sourceExternalHint': '外部编辑器',
    'metroWayfindingEditor.import.sourceYct': 'YCT 地铁导视工程',
    'metroWayfindingEditor.import.sourceYctHint': '本站工程',
    'metroWayfindingEditor.import.supportedSources': '支持来源',
    'metroWayfindingEditor.import.title': '导入外部导视工程',
    'metroWayfindingEditor.importPreview.closeAria': '关闭导入预览',
    'metroWayfindingEditor.importPreview.eyebrow': '工程转换预览',
    'metroWayfindingEditor.importPreview.footerSummary': '{count} 个 JSON · 单文件上限 {size} MB',
    'metroWayfindingEditor.importPreview.mode': '转换方式',
    'metroWayfindingEditor.importPreview.modeSemantic': '仅语义（推荐）',
    'metroWayfindingEditor.importPreview.modeSourceStyle': '保留源样式',
    'metroWayfindingEditor.importPreview.previewNote':
      '按画布比例缩小的牌面示意，仅用于确认转换后的内容与排版',
    'metroWayfindingEditor.importPreview.rowsAria': '待导入行顺序',
    'metroWayfindingEditor.importPreview.source': '来源',
    'metroWayfindingEditor.importPreview.sourceStyle': '来源风格',
    'metroWayfindingEditor.importPreview.targetStyle': '目标风格',
    'metroWayfindingEditor.importPreview.warningCount': '（{count} 处）',
    'metroWayfindingEditor.importPreview.warningsAria': '转换提醒',
    'metroWayfindingEditor.importPreview.warningsTitle': '转换提醒',
    'metroWayfindingEditor.largeText.fieldLabel': '大文字（字高 {size}）',
    'metroWayfindingEditor.largeText.insertSuffix': '在光标处添加下角标',
    'metroWayfindingEditor.option.all': '全部',
    'metroWayfindingEditor.option.doubleRow': '双行',
    'metroWayfindingEditor.option.entry': '进站',
    'metroWayfindingEditor.option.exit': '出站',
    'metroWayfindingEditor.option.singleRow': '单行',
    'metroWayfindingEditor.option.transfer': '换乘',
    'metroWayfindingEditor.option.vertical': '竖向',
    'metroWayfindingEditor.projectDialog.closeAria': '关闭模板库与导入',
    'metroWayfindingEditor.projectDialog.eyebrow': '地铁导视牌',
    'metroWayfindingEditor.projectDialog.import': '导入工程',
    'metroWayfindingEditor.projectDialog.source': '工程来源',
    'metroWayfindingEditor.projectDialog.templates': '版式模板',
    'metroWayfindingEditor.projectDialog.title': '模板库与导入',
    'metroWayfindingEditor.row.first': '第一行',
    'metroWayfindingEditor.row.second': '第二行',
    'metroWayfindingEditor.segment.boxed': '方框文本',
    'metroWayfindingEditor.segment.boxedShort': '方框',
    'metroWayfindingEditor.segment.chooseLineColor': '选择线路色（同时填入线路号）',
    'metroWayfindingEditor.segment.insertBoxed': '在光标处添加方框',
    'metroWayfindingEditor.segment.insertLine': '在光标处添加线路号',
    'metroWayfindingEditor.segment.line': '线路号',
    'metroWayfindingEditor.segment.text': '文本段',
    'metroWayfindingEditor.space.fixed': '固定宽度',
    'metroWayfindingEditor.space.flex': '平分剩余宽度',
    'metroWayfindingEditor.space.flexNote': '所有“平分剩余宽度”空白元素会均分可用空间。',
    'metroWayfindingEditor.space.mode': '空白方式',
    'metroWayfindingEditor.space.width': '宽度（16 像素间距单位）',
    'metroWayfindingEditor.status.parsing': '解析中',
    'metroWayfindingEditor.status.parsingFiles': '正在解析',
    'metroWayfindingEditor.stripePosition.bottom': '下',
    'metroWayfindingEditor.stripePosition.left': '左',
    'metroWayfindingEditor.stripePosition.right': '右',
    'metroWayfindingEditor.suffix.label': '下角标',
    'metroWayfindingEditor.suffix.placeholder': '下标',
    'metroWayfindingEditor.suffix.remove': '删除此下角标',
    'metroWayfindingEditor.suggestion.acceptAria': '采纳建议：{suggestion}',
    'metroWayfindingEditor.suggestion.acceptTitle': '采纳建议（Tab）',
    'metroWayfindingEditor.tab.childCount': '{count} 个子元素',
    'metroWayfindingEditor.text.addMainRow': '添加主文本行',
    'metroWayfindingEditor.text.addRowAria': '添加文本行',
    'metroWayfindingEditor.text.addSecondaryRow': '添加副文本行',
    'metroWayfindingEditor.text.deleteRow': '删除文本行',
    'metroWayfindingEditor.text.deleteRowAria': '删除第 {index} 行',
    'metroWayfindingEditor.text.dynamicFontSize': '动态字高',
    'metroWayfindingEditor.text.main': '主文本',
    'metroWayfindingEditor.text.mainRowLabel': '第 {index} 行主文本内容',
    'metroWayfindingEditor.text.metrics': '主文本 {main} · 副文本 {secondary}',
    'metroWayfindingEditor.text.moveRowDownAria': '第 {index} 行下移',
    'metroWayfindingEditor.text.moveRowUpAria': '第 {index} 行上移',
    'metroWayfindingEditor.text.rowHeader': '第 {index} 行 · {kind}',
    'metroWayfindingEditor.text.rowsAria': '文本行',
    'metroWayfindingEditor.text.secondary': '副文本',
    'metroWayfindingEditor.text.secondaryRowLabel': '第 {index} 行副文本内容',
    'metroWayfindingEditor.toolbar.title': '版式与外观',
    'metroWayfindingEditor.writing.horizontal': '横向',
    'metroWayfindingEditor.writing.horizontalText': '横排',
    'metroWayfindingEditor.writing.vertical': '竖向',
    'metroWayfindingEditor.writing.verticalText': '竖排',
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
    'operations.featuredNext': '下一条重点资讯',
    'operations.featuredPage': '查看第 {index} 条重点资讯',
    'operations.featuredPages': '重点资讯页码',
    'operations.featuredPrevious': '上一条重点资讯',
    'operations.feedAria': '运营信息列表',
    'operations.itemCount': '{count} 条',
    'operations.latestTitle': '最新资讯',
    'operations.noStrongReminder': '暂无生效的强提醒',
    'operations.noTripReminder': '暂无行程提醒',
    'operations.remindersAria': '强提醒面板',
    'operations.serverStatus.latency': '延迟',
    'operations.serverStatus.offline': '离线',
    'operations.serverStatus.online': '在线',
    'operations.serverStatus.openPlayers': '查看玩家位置',
    'operations.serverStatus.players': '玩家',
    'operations.serverStatus.title': '服务器状态',
    'operations.serverStatus.unknown': '状态未知',
    'operations.serverStatusAria': '服务器状态与在线玩家',
    'operations.social.afdian': '爱发电',
    'operations.social.bilibili': 'Bilibili',
    'operations.social.qq': 'QQ 群',
    'operations.social.qqChannel': 'QQ 频道',
    'operations.social.wechat': '微信',
    'operations.socialAria': '社交与社区链接',
    'operations.startsAt': '开始于 {date}',
    'operations.strongReminder': '强提醒',
    'operations.validUntil': '有效至 {date}',
    'operationRelatedPois.count': '{count} 个 POI',
    'operationRelatedPois.fallback': '地图地点',
    'operationRelatedPois.title': '相关地点',
    'operationToc.collapse': '收起{title}',
    'operationToc.expand': '展开{title}',
    'operationToc.title': '文章目录',
    'page.account': '账号设置',
    'page.ask': '问一问',
    'page.map': '地图探索',
    'page.offline': '离线',
    'page.operations': '运营信息',
    'page.scheduleSearch': '班次查询',
    'page.search': '搜索',
    'page.services': '更多服务',
    'page.changelog': '版本更新',
    'page.faq': '帮助与常见问题',
    'page.roadMaterials': '路牌物料',
    'page.telegraph': '电报体验',
    'page.transitMaterials': '公共交通导视',
    'page.transitNetworkHealth': '公共交通网络健康度',
    'page.ticketOrder': '票务订单',
    'page.travel': '出行',
    'page.travelScreen': '智运大屏',
    'poiFacility.add': '添加设施',
    'poiFacility.descriptionLabel': '文字描述',
    'poiFacility.descriptionPlaceholder': '例如：一层东侧设有无障碍电梯',
    'poiFacility.hint': '图标与文字描述',
    'poiFacility.icon.accessible': '无障碍',
    'poiFacility.icon.childCare': '母婴',
    'poiFacility.icon.elevator': '电梯',
    'poiFacility.icon.escalator': '自动扶梯',
    'poiFacility.icon.info': '信息',
    'poiFacility.icon.luggage': '行李寄存',
    'poiFacility.icon.medical': '医疗',
    'poiFacility.icon.parking': '停车',
    'poiFacility.icon.pets': '宠物',
    'poiFacility.icon.power': '充电',
    'poiFacility.icon.restaurant': '餐饮',
    'poiFacility.icon.shopping': '购物',
    'poiFacility.icon.smoking': '吸烟区',
    'poiFacility.icon.wc': '卫生间',
    'poiFacility.icon.wifi': '无线网络',
    'poiFacility.iconLabel': '设施图标',
    'poiFacility.removeAria': '删除第 {index} 条设施信息',
    'poiFacility.removeTitle': '删除设施',
    'poiFacility.title': '设施信息',
    'quickAction.rideCode': '乘车码',
    'quickAction.rideCodeLoginRequired': '乘车码需要登录后使用',
    'quickAction.rideCodeUnavailable': '乘车码暂不可用，请稍后重试',
    'scheduleStopTable.aria': '各站停站时刻',
    'scheduleStopTable.arrival': '到达',
    'scheduleStopTable.arrivalAria': '{station} 到达时间',
    'scheduleStopTable.departure': '出发',
    'scheduleStopTable.departureAria': '{station} 出发时间',
    'scheduleStopTable.dwell': '停车(分)',
    'scheduleStopTable.dwellAria': '{station} 停车分钟',
    'scheduleStopTable.empty': '暂无停站时刻',
    'scheduleStopTable.station': '站点',
    'scheduleStopTable.stop': '停站',
    'scheduleStopTable.stopAria': '{station} 是否停站',
    'globalSearch.action.ask': '问一问',
    'globalSearch.action.askThis': '把这个问题交给问一问',
    'globalSearch.action.clearInput': '清空输入',
    'globalSearch.action.close': '关闭搜索',
    'globalSearch.action.newConversation': '新对话',
    'globalSearch.actionLabel': '可以直接',
    'globalSearch.action.open': '全站搜索',
    'globalSearch.action.revert': '改回搜索',
    'globalSearch.action.search': '搜索',
    'globalSearch.action.send': '发送',
    'globalSearch.assistant.answerTitle': '问一问',
    'globalSearch.assistant.clear': '清除 Key',
    'globalSearch.assistant.configure': '配置 Key',
    'globalSearch.assistant.copy': '复制回答',
    'globalSearch.assistant.copied': '已复制',
    'globalSearch.assistant.disclaimer': '回答由你配置的模型生成，请以站内引用为准。',
    'globalSearch.assistant.error': '问一问暂时没有返回结果，先给你站内资料。',
    'globalSearch.assistant.followUps': '继续追问',
    'globalSearch.assistant.followUpsLoading': '正在准备追问建议…',
    'globalSearch.assistant.followUpsUnavailable': 'AI 追问建议暂时不可用。',
    'globalSearch.assistant.key': 'API Key',
    'globalSearch.assistant.keyPlaceholder': '粘贴你的 API Key',
    'globalSearch.assistant.model': '模型',
    'globalSearch.assistant.needsKey': '配置模型 Key 后可使用问一问',
    'globalSearch.assistant.networkError': '网络连接失败，请检查网络后重试。',
    'globalSearch.assistant.provider': '模型提供商',
    'globalSearch.assistant.references': '引用与入口',
    'globalSearch.assistant.retry': '重新回答',
    'globalSearch.assistant.save': '保存并提问',
    'globalSearch.assistant.setupDescription':
      'Key 只保存在当前浏览器会话，关闭标签页后失效；本站不记录。',
    'globalSearch.assistant.setupTitle': '配置问一问',
    'globalSearch.assistant.stop': '停止回答',
    'globalSearch.assistant.streaming': '正在回答…',
    'globalSearch.capability.account': '打开账号设置',
    'globalSearch.capability.faq': '查看帮助与常见问题',
    'globalSearch.capability.map': '打开地图',
    'globalSearch.capability.operations': '查看运营信息',
    'globalSearch.capability.rmp': '打开 RMP 导入入口',
    'globalSearch.capability.roadMaterials': '打开路牌物料',
    'globalSearch.capability.schedule': '打开班次查询',
    'globalSearch.capability.transitMaterials': '打开公共交通导视',
    'globalSearch.docsFallback': '先按站内资料找到这些',
    'globalSearch.docsFallbackEmpty':
      '站内资料暂时没有直接答案，可以换个说法，或查看帮助与常见问题。',
    'globalSearch.easterEgg.close': '关闭',
    'globalSearch.easterEgg.description':
      '图标里的小人是新光 2019 年 12 月手绘的，后来被照着画成表情包，又被重画成问一问的线描和填充两版。',
    'globalSearch.easterEgg.hint': '想找原帖，可以在 B 站和酷安搜新光和题海散人。',
    'globalSearch.easterEgg.title': '关于问一问',
    'globalSearch.emptyHint': '输入地点、班次、公告，或直接说出你的需求',
    'globalSearch.liveResults': '实时结果',
    'globalSearch.mode.ask': '问一问',
    'globalSearch.mode.search': '搜索',
    'globalSearch.noMatch': '没有找到匹配结果',
    'globalSearch.pageDisabled': '问一问入口已在设置中关闭，可在账号设置里重新开启。',
    'globalSearch.placeholder': '搜索地点、班次、资讯，或直接提问…',
    'globalSearch.placeholderAsk': '描述你的问题，Enter 发送…',
    'globalSearch.resultCount': '共 {count} 条结果',
    'globalSearch.searchAll': '在全站搜索“{query}”',
    'globalSearch.status.askReady': '已切到问一问 · Enter 发送',
    'globalSearch.status.askSoon': '问一问将在接入模型后支持对话，现在先按站内资料回答',
    'globalSearch.status.loadingData': '正在加载站内数据…',
    'globalSearch.status.searching': '正在搜索…',
    'globalSearch.suggestion.account': '乘车码打不开怎么办',
    'globalSearch.suggestion.aiLoading': '正在结合当前页面生成推荐项…',
    'globalSearch.suggestion.aiOff': '当前使用站内数据生成推荐项。',
    'globalSearch.suggestion.aiSettings': '开启 AI 推荐',
    'globalSearch.suggestion.aiUnavailable': 'AI 推荐项暂时不可用，已改用站内数据。',
    'globalSearch.suggestion.highlightLine': '这条线附近的换乘站有哪些？',
    'globalSearch.suggestion.highlightMarker': '{name}附近有什么？',
    'globalSearch.suggestion.highlightStation': '{name}有哪些设施？',
    'globalSearch.suggestion.operations': '台风期间停运通知',
    'globalSearch.suggestion.refresh': '换一批',
    'globalSearch.suggestion.route': '明天去临东港怎么走',
    'globalSearch.suggestion.schedule': '查明天去临东港的船',
    'globalSearch.suggestion.thisPage': '这个页面怎么用？',
    'globalSearch.suggestion.title': '你可以试试',
    'globalSearch.title': '搜索与问一问',
    'globalSearch.unavailable': '部分数据暂不可用',
    'globalSearch.viewAll': '查看全部结果',
    'search.open': '搜索',
    'shortcut.acceptSuggestion': '采纳补全建议',
    'shortcut.adminReview': '后台审核列表',
    'shortcut.close': '关闭快捷键',
    'shortcut.deleteSelected': '删除当前选中的节点或元素',
    'shortcut.dismissLayers': '逐层关闭地图浮层',
    'shortcut.duplicateElement': '复制选中元素',
    'shortcut.editor': '编辑器',
    'shortcut.exportProject': '导出工程文件',
    'shortcut.firstLastSection': '跳到首章节或末章节',
    'shortcut.focusMapSearch': '聚焦地图搜索',
    'shortcut.focusScheduleSearch': '聚焦时刻表搜索',
    'shortcut.global': '全局',
    'shortcut.globalSearch': '打开全局搜索',
    'shortcut.holdCtrl': '长按 Ctrl',
    'shortcut.insertAppend': '追加插入',
    'shortcut.insertNearest': '就近插入',
    'shortcut.insertPrepend': '反向追加插入',
    'shortcut.lineEditor': '线路地图编辑器',
    'shortcut.lineEditor.toolMove': '移动工具',
    'shortcut.lineEditor.toolPan': '拖移工具',
    'shortcut.lineEditor.toolStation': '站点工具',
    'shortcut.lineEditor.toolWaypoint': '途经点工具',
    'shortcut.listBulk': '对所选条目执行批量操作',
    'shortcut.listNavigate': '上下移动列表项',
    'shortcut.listOpen': '打开当前项详情',
    'shortcut.listSelect': '选中或取消当前项',
    'shortcut.map': '地图',
    'shortcut.moveElement': '调整选中元素的行内顺序',
    'shortcut.openMenu': '快捷键提示',
    'shortcut.openTemplateLibrary': '打开模板库或导入工程',
    'shortcut.documentToc': '长文目录',
    'shortcut.planFocusedMarker': '查找前往当前标记点的路线',
    'shortcut.planJourney': '规划行程',
    'shortcut.previewMaterial': '生成或更新预览',
    'shortcut.redo': '重做',
    'shortcut.resetFilters': '清空筛选条件',
    'shortcut.resetMapView': '回到默认地图视图',
    'shortcut.reverseElements': '反转元素顺序',
    'shortcut.save': '保存',
    'shortcut.saveAndBack': '保存并返回',
    'shortcut.searchNearby': '搜索当前地点附近',
    'shortcut.searchResults': '在搜索结果间移动',
    'shortcut.sections': '在章节间跳转',
    'shortcut.swapRouteEndpoints': '交换路线起终点',
    'shortcut.switchDataSource': '切换手输/线路数据源',
    'shortcut.switchRow': '切换选中行（双行版式）',
    'shortcut.switchTemplate': '切换样式模板',
    'shortcut.title': '键盘快捷键',
    'shortcut.toggleFavorite': '收藏或取消收藏当前地点',
    'shortcut.toggleLayers': '打开或关闭图层面板',
    'shortcut.toggleNavigation': '展开或收起侧边导航',
    'shortcut.travel': '旅行与时刻表',
    'shortcut.undo': '撤销',
    'shortcut.wayfinding': '导视与材料工作台',
    'settings.accent.gray': '灰色',
    'settings.accent.green': '青绿',
    'settings.accent.label': '强调色',
    'settings.accent.ldpass': '跟随临东通',
    'settings.accent.red': '红色',
    'settings.appearanceLanguage': '外观与语言',
    'settings.assistant.allPages': '在所有页面显示搜索与问一问入口',
    'settings.assistant.allPagesNote':
      '打开后，二级页面顶栏也会显示入口按钮，方便触屏用户；一级页面始终保留入口。',
    'settings.assistant.aiSuggestions': '使用 AI 生成推荐项',
    'settings.assistant.aiSuggestionsNote':
      '开启后会结合当前页面内容，用你配置的模型生成推荐项；关闭时只用站内数据生成。',
    'settings.assistant.clear': '清除 Key',
    'settings.assistant.enabled': '启用搜索与问一问',
    'settings.assistant.enabledNote': '关闭后会隐藏所有入口并停用快捷键；已保存的 Key 仍会保留。',
    'settings.assistant.encryptionNote': 'Key 会加密保存在本机，仍请勿在公共设备保存。',
    'settings.assistant.group': '搜索与问一问',
    'settings.assistant.configure': '配置模型与 MCP',
    'settings.assistant.configTitle': '搜索与问一问配置',
    'settings.assistant.configDescription': '配置模型 Key 与 MCP 入口。',
    'settings.assistant.key': 'API Key',
    'settings.assistant.keyPlaceholder': '粘贴你的 API Key',
    'settings.assistant.model': '模型',
    'settings.assistant.modelNote': '模型名可能随服务商更新，可直接输入当前可用的模型名。',
    'settings.assistant.notConfigured': '未配置',
    'settings.assistant.provider': '模型提供商',
    'settings.assistant.save': '保存配置',
    'settings.assistant.saved': '已配置',
    'settings.assistant.savedEncrypted': '已加密保存',
    'settings.assistant.savedSession': '仅本次会话',
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
    'settings.material.advanced': '透光',
    'settings.material.balanced': '均衡',
    'settings.material.group': '界面材质',
    'settings.material.label': '材质模式',
    'settings.material.performance': '简约',
    'settings.material.thickness': '透光材质厚度',
    'settings.material.thicknessValue': '{value}%',
    'settings.motion.full': '开启',
    'settings.motion.group': '动态效果',
    'settings.motion.label': '动态',
    'settings.motion.reduced': '关闭',
    'settings.motion.system': '跟随系统',
    'settings.mobileActionRail.disabled': '已关闭',
    'settings.mobileActionRail.enabled': '已开启',
    'settings.mobileActionRail.group': '侧边操作栏',
    'settings.mobileActionRail.label': '侧边操作栏',
    'settings.mobileActionRail.left': '左侧',
    'settings.mobileActionRail.note':
      '仅在移动端（宽度 ≤ 760px）生效。开启后，顶部操作、标题栏按钮、底部导航与地图工具条会收纳到侧边；空间不足时自动收进“更多”菜单。',
    'settings.mobileActionRail.position': '操作栏位置',
    'settings.mobileActionRail.right': '右侧',
    'settings.mobileActionRail.topOffset': '顶端边距',
    'settings.mobileActionRail.topOffsetValue': '{value}px',
    'mobileActionRail.aria': '侧边操作栏',
    'mobileActionRail.more': '更多',
    'mobileActionRail.overflowAria': '更多操作',
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
    'materialStudio.history': '物料历史',
    'materialStudio.preview': '预览',
    'materialStudio.updatePreview': '更新预览',
    'materialStudio.submitReview': '提交审核',
    'materialStudio.submitReviewManualHint': '提交审核；审核通过后可下载无水印图片',
    'materialStudio.exportProject': '导出工程文件',
    'materialStudio.download': '下载图片',
    'materialStudio.downloadWatermarkFree': '下载无水印图片',
    'materialStudio.loginRequired': '登录后可提交审核并下载无水印图片。',
    'materialStudio.serverUnverified': '服务器账号未验证',
    'materialStudio.serverUnverifiedHint': '请在账号设置中验证服务器账号后下载无水印图片',
    'materialStudio.loginRemoveWatermark': '登录去水印',
    'materialStudio.reviewRequired': '去水印需审核',
    'materialStudio.templateReadFailed': '无法读取物料模板。',
    'materialStudio.noTemplates': '当前没有可用模板。',
    'materialStudio.workspaceUnavailable': '物料工作台暂时不可用。',
    'materialStudio.exportOnlyManual': '只有手动编辑的地铁导视牌可以导出工程文件。',
    'materialStudio.offlineBlocked': '当前处于离线状态，该操作需要联网。',
    'materialStudio.noSyncTemplate': '当前没有可同步的模板。',
    'materialStudio.serverSubmitOnlineOnly': '服务器数据模式的草稿只能在线提交。',
    'materialStudio.loginFirst': '请先登录。',
    'materialStudio.localSyncFailed': '本机草稿同步失败。',
    'materialStudio.localSyncedSubmitHint': '本机草稿已同步，仍需联网提交审核。',
    'materialStudio.networkError': '网络错误。',
    'materialStudio.localSyncNetworkError': '本机草稿同步时发生网络错误。',
    'materialStudio.noProjectStations': '导入项目中没有可选择的站点。',
    'materialStudio.selectServerStation': '请先选择服务器公交站。',
    'materialStudio.selectProjectLine': '请先选择至少一条当前图上方向的项目线路。',
    'materialStudio.selectDirectionLine': '请先选择至少一条同方向线路。',
    'materialStudio.selectServerLine': '请先选择服务器线路。',
    'materialStudio.selectServerPlace': '请先选择服务器地点。',
    'materialStudio.selectCoordinate': '请先选择路牌安装坐标。',
    'materialStudio.selectLinkedMode': '请先选择{mode}。',
    'materialStudio.previewFailed': '生成预览失败。',
    'materialStudio.previewNetworkError': '生成预览时发生网络错误。',
    'materialStudio.noSubmittableTemplate': '当前没有可提交的模板。',
    'materialStudio.saveCustomFailed': '无法保存自定义物料。',
    'materialStudio.savedSubmitFailed': '物料已保存，但提交审核失败。',
    'materialStudio.submitNetworkError': '提交审核时发生网络错误。',
    'materialStudio.downloadFailed': '下载物料失败。',
    'materialStudio.downloadNetworkError': '下载物料时发生网络错误。',
    'materialStudio.downloadPreviewNetworkError': '下载带水印预览时发生网络错误。',
    'materialStudio.selectTemplateAndMode': '请先选择模板和{mode}。',
    'materialStudio.serverVerifiedDownloadHint':
      '验证服务器账号后才能下载无水印图片，已改为下载带水印预览。',
    'materialStudio.operationBusy': '当前操作尚未完成，请稍候。',
    'materialStudio.modeNoReviewNeeded': '{mode}模式无需提交审核。',
    'materialStudio.localDraft': '本机草稿',
    'materialStudio.workspaceEyebrow': '物料工作台',
    'materialStudio.syncLocalDraft': '同步本机草稿',
    'materialStudio.templates': '模板',
    'materialStudio.networkData': '线网数据',
    'materialStudio.online': '在线',
    'materialStudio.offline': '离线',
    'materialStudio.dimensions': '尺寸',
    'materialStudio.dataSource': '数据来源',
    'materialStudio.manualInput': '手动输入',
    'materialStudio.roadTitle': '路牌物料生成',
    'materialStudio.transitTitle': '公共交通导视物料生成',
    'materialStudio.serverNetwork': '服务器线网',
    'materialStudio.sampleProject': '示例项目',
    'materialStudio.importedProject': '导入项目',
    'materialStudio.projectStation': '项目站点',
    'materialStudio.projectCurrentStation': '项目当前站',
    'materialStudio.variant': '版式',
    'materialStudio.group.busStop': '公交站牌',
    'materialStudio.group.busStopHorizontal': '公交站牌（横版线路详情）',
    'materialStudio.group.metroLineMap': '地铁横板线路图',
    'materialStudio.group.layout': '版式',
    'materialStudio.group.style': '样式',
    'materialStudio.layout.lineMap': '线路图',
    'materialStudio.layout.stationName': '站名',
    'materialStudio.layout.direction': '方向',
    'materialStudio.layout.busTerminal': '始发终到',
    'materialStudio.layout.busOverview': '线路概览',
    'materialStudio.layout.busDetail': '线路详情',
    'materialStudio.projectLineCount': '{count} 条项目线路',
    'materialStudio.busLineCount': '{count} 条公交线路',
    'materialStudio.stationProjectLines': '当前站点的项目线路',
    'materialStudio.projectLines': '项目线路',
    'materialStudio.mapDrivingDirection': '图上行车方向',
    'materialStudio.roadDrivingDirection': '道路行车方向',
    'materialStudio.stationProperties': '站点属性',
    'materialStudio.originStation': '始发站',
    'materialStudio.terminalStation': '终点站',
    'materialStudio.sameDirectionLines': '同方向线路',
    'materialStudio.singleSelect': '（单选）',
    'materialStudio.maxLines': '（最多 {count} 条）',
    'materialStudio.destinationPending': '终点待维护',
    'materialStudio.directionTo': '往',
    'materialStudio.originAtStation': '当前站始发',
    'materialStudio.terminalAtStation': '当前站终到',
    'materialStudio.noProjectConnection': '当前项目站点在该图上方向没有线路连接。',
    'materialStudio.noDirectionLine': '当前方向没有可用线路。',
    'materialStudio.configureLineName': '配置线路名称',
    'materialStudio.serverLines': '服务器线路',
    'materialStudio.stationsCount': '{count} 站',
    'materialStudio.notOpened': '未开通',
    'materialStudio.serverStations': '服务器站点',
    'materialStudio.searchServerPlace': '搜索服务器地点',
    'materialStudio.serverPlaces': '服务器地点',
    'materialStudio.coordinateX': '安装坐标 X',
    'materialStudio.coordinateZ': '安装坐标 Z',
    'materialStudio.pickCoordinateHint': '在服务器地图预览中点选路牌安装坐标',
    'materialStudio.clickMapCoordinate': '点击地图确定安装坐标 · X {x} / Z {z}',
    'materialStudio.fillCoordinateFirst': '请填写安装坐标后在地图中微调',
    'materialStudio.previewAria': '物料预览',
    'materialStudio.previewAlt': '{title}预览',
    'materialStudio.closePreview': '关闭预览',
    'materialStudio.historyTitle': '我的物料历史',
    'materialStudio.historyHint': '已提交的自定义物料会保留在这里，审核通过后可随时下载。',
    'materialStudio.closeHistory': '关闭物料历史',
    'materialStudio.submittedAt': '提交于 {time}',
    'materialStudio.reviewedAt': '审核于 {time}',
    'materialStudio.noSubmittedYet': '还没有提交过自定义物料。',
    'materialStudio.previewWatermark': '预览含水印',
    'materialStudio.updating': '更新中',
    'materialStudio.noPreviewYet': '尚未生成预览',
    'materialStudio.signHeight': '导视牌高度（128 像素格数）',
    'materialStudio.signLength': '导视牌长度（128 像素格数）',
    'materialStudio.signWidth': '导视牌宽度（128 像素格数）',
    'materialStudio.widthMeters': '宽度（米）',
    'materialStudio.heightMeters': '高度（米）',
    'materialStudio.alignmentUnit': '对齐单位（像素）',
    'materialStudio.alignToMapSize': '对齐到整数地图画尺寸',
    'materialStudio.firstBus': '首班车',
    'materialStudio.lastBus': '末班车',
    'materialStudio.projectNoTimeHint': '项目数据不含运营时间，留空则不显示这一行。',
    'materialStudio.pleaseSelect': '请选择',
    'materialStudio.colorPaletteAria': '{label}色板',
    'materialStudio.colorHexAria': '{label}十六进制颜色',
    'materialStudio.orientationRight': '向图右',
    'materialStudio.orientationLeft': '向图左',
    'materialStudio.orientationUp': '向图上',
    'materialStudio.orientationDown': '向图下',
    'materialStudio.draftStatus.draft': '草稿',
    'materialStudio.draftStatus.pending_review': '待审核',
    'materialStudio.draftStatus.approved': '已通过',
    'materialStudio.draftStatus.rejected': '已驳回',
    'materialStudio.syncStatus.pending': '待同步',
    'materialStudio.syncStatus.syncing': '同步中',
    'materialStudio.syncStatus.synced': '已同步',
    'materialStudio.syncStatus.conflict': '有冲突',
    'materialStudio.syncStatus.failed': '同步失败',
    'materialStudio.emptyFields': '未填写字段内容',
    'materialStudio.watermarkedPreviewSuffix': '-带水印预览',
    'telegraph.stage.header': '填写报头',
    'telegraph.stage.recipient': '填写收报信息',
    'telegraph.stage.code': '打印电码',
    'telegraph.stage.message': '打印电文',
    'telegraph.stage.footer': '打印报尾',
    'telegraph.stage.stamp': '盖电报戳',
    'telegraph.stage.envelope': '装入信封',
    'telegraph.newLetter': '再写一封',
    'telegraph.history': '历史记录',
    'telegraph.startWriting': '开始填写',
    'telegraph.replayAnimation': '重播动画',
    'telegraph.continueScroll': '继续滚动',
    'telegraph.continueScrollStart': '继续滚动，开始填写',
    'telegraph.simulateSend': '模拟拍发',
    'telegraph.skipAnimation': '跳过动画',
    'telegraph.continueConfirm': '继续滚动，进入确认拍发',
    'telegraph.province': '省',
    'telegraph.city': '市',
    'telegraph.county': '县',
    'telegraph.otherLocation': '其他收报地点',
    'telegraph.recipientInfo': '收报信息',
    'telegraph.body': '电报正文',
    'telegraph.senderName': '发报人姓名或游客 IP',
    'telegraph.senderAddress': '发报人地址',
    'telegraph.senderLock': '登录后可修改发报人信息',
    'telegraph.billableGrids': '计费格数',
    'telegraph.amount': '报费详情',
    'telegraph.billingRule': '连续字母/数字每 5 个一格',
    'telegraph.cellRecipient': '收报信息',
    'telegraph.cellBody': '电报正文',
    'telegraph.noCellSelected': '当前格：未选择',
    'telegraph.flipEnvelope': '翻转信封',
    'telegraph.flipToFront': '翻到信封正面',
    'telegraph.flipToBack': '翻到信封背面',
    'telegraph.openEnvelope': '打开信封',
    'telegraph.insertEnvelope': '装入信封',
    'telegraph.envelopeFront': '电报信封正面',
    'telegraph.envelopeBack': '电报信封背面',
    'telegraph.openEnvelopeView': '打开信封查看收报纸',
    'telegraph.insertReceivePaper': '将收报纸装入信封',
    'telegraph.receivePaper': '收报纸',
    'telegraph.sendPaper': '发报纸',
    'telegraph.switchPaper': '切换纸张',
    'telegraph.switchToSend': '切换到发报纸',
    'telegraph.switchToReceive': '切换到收报纸',
    'telegraph.envelopeFlip': '信封翻面',
    'telegraph.code': '电码',
    'telegraph.audio': '音频',
    'telegraph.sendPaperTemplate': '电报发报纸模板',
    'telegraph.sendPaperPreview': '电报发报纸预览',
    'telegraph.enterDestination': '请先填写收报地点。',
    'telegraph.enterRecipient': '请先填写收报人信息。',
    'telegraph.enterBody': '请先填写电报内容。',
    'telegraph.recipientOverflow': '收报信息超过模板可容纳的 {count} 格。',
    'telegraph.bodyOverflow': '电报内容超过模板可容纳的 {count} 格。',
    'telegraph.unsupported': '暂不支持这些字符：{chars}',
    'telegraph.envelopeDone': '电报已打印并装入信封。',
    'telegraph.skippedDone': '已跳过动画，电报已装入信封。',
    'telegraph.imageFailed': '电报图片生成失败。',
    'telegraph.sendPaperFile': '发报纸',
    'telegraph.receivePaperFile': '收报纸',
    'telegraph.imageDownloadFailed': '电报图片下载失败。',
    'telegraph.codeFile': '电报电码',
    'telegraph.filePrefix': '电报',
    'telegraph.welcomeTitle': '趁“慢电报”还未消失，将记忆拍给自己',
    'telegraph.welcomeP1': '一条视频，让人们发现了电报这个尘封已久的通讯业务。',
    'telegraph.welcomeP2':
      '如今，就算发报窗口全中国仅剩一个，人们仍愿为一封还需编发、盖章、封装的慢电报留出时间。',
    'telegraph.welcomeP3':
      '那么现在，就在这里亲手写下你的讯息，让它沿着尘封的路线，延续你的思绪和情感……',
    'telegraph.confirmTitle': '确认发报内容',
    'telegraph.closeConfirm': '关闭确认窗口',
    'telegraph.destination': '收报地点',
    'telegraph.recipient': '收报人',
    'telegraph.notFilled': '未填写',
    'telegraph.confirmBody': '报文内容',
    'telegraph.confirmHint': '确认后将开始填写、打印、折叠并装入信封的模拟动画。',
    'telegraph.backEdit': '返回修改',
    'telegraph.confirmSend': '确认并拍发',
    'telegraph.localHistory': '本机历史',
    'telegraph.deleteHistory': '删除历史记录',
    'telegraph.unnamed': '未命名电报',
    'telegraph.noHistory': '还没有本机历史记录。',
    'telegraph.cellAria': '{label} · 第{count}格',
    'telegraph.toolbarAria': '电报操作',
    'transitLineBrowser.filterAria': '线路筛选',
    'transitLineBrowser.listAria': '线路列表',
    'transitLineBrowser.modeRailway': '地方铁路',
    'transitLineBrowser.summaryAria': '旧线路数据摘要',
    'transitHealth.dimension.topology': '拓扑衔接',
    'transitHealth.dimension.operations': '运营时间',
    'transitHealth.dimension.scale': '空间规模',
    'transitHealth.dimension.places': '地点覆盖',
    'transitHealth.dimension.demand': '需求代理',
    'transitHealth.dimension.data_quality': '数据质量',
    'transitHealth.analysisEyebrow': '线网规划分析',
    'transitHealth.subtitle':
      '综合已发布线路拓扑、运营时间、道路节点与分类地点密度。潜在需求为规划代理值，不能替代真实客流、班次、运能和成本数据。',
    'transitHealth.onlineSnapshot': '在线快照',
    'transitHealth.offlineSnapshot': '离线快照',
    'transitHealth.dataTime': '数据时间',
    'transitHealth.noLines': '尚无已发布的公共交通线路，暂时不能生成网络统计。',
    'transitHealth.filterAria': '按交通方式筛选',
    'transitHealth.modeLegend': '交通方式',
    'transitHealth.scopeCurrent': '当前统计范围：',
    'transitHealth.scopeAll': '全部交通方式',
    'transitHealth.demandWithLines': '需求分析考虑已有线路',
    'transitHealth.demandPotentialOnly': '仅分析地点潜力',
    'transitHealth.mLines': '线路数',
    'transitHealth.mTopologyNote': '{count} 条形成连续站段',
    'transitHealth.mStations': '站点数',
    'transitHealth.mLocatedNote': '{rate} 可定位',
    'transitHealth.mLength': '线网长度',
    'transitHealth.mLocatedSegNote': '{count} 个已定位站段估算',
    'transitHealth.mCoverage': '时刻覆盖',
    'transitHealth.mScheduledNote': '{scheduled}/{total} 条线路',
    'transitHealth.mServiceSpan': '平均运营时长',
    'transitHealth.mLateNote': '{count} 条服务至 22:00 后',
    'transitHealth.mPlaceCoverage': '规划地点覆盖',
    'transitHealth.mPlacesNote': '{covered}/{total} 个地点',
    'transitHealth.mRoadCoverage': '道路节点覆盖',
    'transitHealth.mRoadsNote': '{count} 条道路样本',
    'transitHealth.mDemandAttainment': '需求达成率',
    'transitHealth.mPotentialDemand': '潜在需求总量',
    'transitHealth.mAttainedNote': '{attained}/{total} 加权需求已触达',
    'transitHealth.mPotentialHint': '按真实分类地点密度加权，不考虑线路覆盖',
    'transitHealth.chartEyebrow': '统计图',
    'transitHealth.chartTitle': '规模、运营与覆盖',
    'transitHealth.locatedSampleHint': '地点与距离仅使用已定位站点样本',
    'transitHealth.opEyebrow': '运营方',
    'transitHealth.opTitle': '指标与排行',
    'transitHealth.opCountHint': '共 {count} 个运营方 · 点击列名排序',
    'transitHealth.opTableNote':
      '公交线路由全网统一分配，运营商的连通片区数仅作归属统计，不作为脱网或强制接驳判断依据。',
    'transitHealth.colOperator': '运营方',
    'transitHealth.colStations': '站点',
    'transitHealth.colStationsTitle': '按该运营方线路覆盖的稳定站点 ID 去重',
    'transitHealth.colLines': '线路',
    'transitHealth.colAvgConnectivity': '平均连接度',
    'transitHealth.colConnectivityTitle': '该运营方站点在全网中直接相邻的不同站点数平均值',
    'transitHealth.colConnectivityWeight': '连接度权重',
    'transitHealth.colWeightTitle': '相邻站间路段按承载的不同线路数加权后的平均值',
    'transitHealth.colLinesPerSegment': '同路段线路数',
    'transitHealth.colSharedSegments': '共线路段',
    'transitHealth.colScheduleCoverage': '时刻覆盖',
    'transitHealth.colServiceSpan': '平均运营时长',
    'transitHealth.opComponentsNote': '{count} 个片区 · {transfer} 个跨运营方站点',
    'transitHealth.rankLabel': '第 {rank} 名',
    'transitHealth.methodEyebrow': '口径',
    'transitHealth.methodTitle': '统计项目与分析来源',
    'transitHealth.noMockHint': '不使用模拟客流',
    'transitHealth.dmTopology': '拓扑连接',
    'transitHealth.dmTopologyDetail':
      '按连续站序形成无向边，计算连接度、共线路段、换乘站与连通片区。',
    'transitHealth.dmOperations': '运营时间',
    'transitHealth.dmOperationsDetail':
      '优先读取首末班，缺失时使用发车时刻表边界；跨午夜线路按次日计算。',
    'transitHealth.dmScale': '线网空间规模',
    'transitHealth.dmScaleDetail':
      '以站名和交通方式绑定地图坐标，估算站段直线长度、站间距与覆盖范围。',
    'transitHealth.dmPlaces': '地点覆盖',
    'transitHealth.dmPlacesDetail':
      '统计居住、就业、教育、医疗、生活、文体和对外交通地点进入站点服务圈的比例。',
    'transitHealth.dmDemand': '潜在需求代理',
    'transitHealth.dmDemandDetail':
      '可切换纯地点聚集或已有线路触达口径；需求达成率按分类权重计算，只用于规划复核，不等同于客流预测。',
    'transitHealth.dmRoads': '道路覆盖',
    'transitHealth.dmRoadsDetail':
      '以地图道路节点衡量线网覆盖边界；道路节点不是完整道路几何，不用于精确里程计算。',
    'transitHealth.sugEyebrow': '多维启发式',
    'transitHealth.sugTitle': '线网优化建议',
    'transitHealth.sugMergedHint': '相同建议已跨运营商合并',
    'transitHealth.sugEmpty': '当前切片没有触发预设启发式阈值；这不代表线路服务质量已经得到验证。',
    'transitHealth.targetItem': '命中项目',
    'transitHealth.viewAllTargets': '查看全部 {count} 项',
    'transitHealth.dialogTargetLabel': '命中项目',
    'transitHealth.itemCount': '共 {count} 项',
    'transitHealth.dialogClose': '关闭',
    'transitHealth.dialogCloseAria': '关闭命中项目列表',
    'transitHealth.searchTargets': '搜索命中项目',
    'transitHealth.searchPlaceholder': '搜索线路、站点、路段或地点',
    'transitHealth.noMatchedTargets': '没有匹配的命中项目。',
    'transitHealth.kindOperator': '运营方',
    'transitHealth.kindLine': '线路',
    'transitHealth.kindStation': '站点',
    'transitHealth.kindSegment': '站间路段',
    'transitHealth.kindPlace': '地点',
    'transitHealth.kindCategory': '地点类别',
    'transitHealth.kindRoad': '道路',
    'transitHealth.moreOperators': '等 {count} 家运营方',
    'transitHealth.cModeTitle': '交通方式构成',
    'transitHealth.cModeSubtitle': '线路数量及其全网占比',
    'transitHealth.cTotalLines': '共 {count} 条线路，{details}',
    'transitHealth.cLinesUnit': '条线路',
    'transitHealth.cHoursTitle': '平均运营时长',
    'transitHealth.cHoursSubtitle': '只统计具有可解析首末时刻的线路',
    'transitHealth.cNoSchedule': '缺少时刻',
    'transitHealth.cPlaceTitle': '分类地点覆盖',
    'transitHealth.cPlaceSubtitle': '进入站点服务圈的分类地点比例',
    'transitHealth.cPlaceRate': '地点覆盖率',
    'transitHealth.cPlaceEntered': '个规划地点进入当前交通方式的站点服务圈。',
    'transitHealth.cHotspotTitle1': '沿线需求热点',
    'transitHealth.cHotspotTitle2': '纯地点潜在需求中心',
    'transitHealth.cHotspotSub1': '按现有站点触达的分类地点密度加权',
    'transitHealth.cHotspotSub2': '忽略现有线路，仅按分类地点空间聚集度计算',
    'transitHealth.cDemandRate': '需求达成率',
    'transitHealth.cAttained': '已触达 {attained} / {total} 加权需求代理值。',
    'transitHealth.cNearbyCount': '{value} · {count} 个地点',
    'transitHealth.cAround': '{place}周边',
    'transitHealth.cHotspotEmpty': '当前缺少可计算的需求热点样本。',
    'transitHealth.cOperatorTitle': '运营方覆盖规模',
    'transitHealth.cOperatorSubtitle': '按稳定站点 ID 去重，展示站点数前八名',
    'transitHealth.cOperatorBarLabel': '{stations} 站 · {lines} 线',
    'transitNetworkSource.title': '线网数据',
    'transitNetworkSource.origin.sample': 'RMP 画廊项目',
    'transitNetworkSource.origin.rmp': 'RMP 项目',
    'transitNetworkSource.origin.server': '服务器',
    'transitNetworkSource.import.own': '导入自己的 RMP 项目',
    'transitNetworkSource.import.default': '导入 RMP 项目',
    'transitNetworkSource.import.short': '导入',
    'transitNetworkSource.import.project': '导入项目',
    'transitNetworkSource.sourceAria': '线网数据来源',
    'transitNetworkSource.source.server': '服务器线网',
    'transitNetworkSource.source.loading': '正在加载',
    'transitNetworkSource.source.sample': '示例线网',
    'transitNetworkSource.source.imported': '导入项目',
    'transitNetworkSource.localDraftName': '本机草稿线网',
    'transitNetworkSource.summary.stationCount': '{count} 站',
    'transitNetworkSource.summary.stationsUnnamed': '{count} 站待补名',
    'transitNetworkSource.summary.stationsNamed': '站名完整',
    'transitNetworkSource.summary.lineCount': '{count} 条线路',
    'transitNetworkSource.summary.edgeCount': '{count} 条连接',
    'transitNetworkSource.summary.source': '来源：RMP 画廊 ·',
    'transitNetworkSource.status.persisting': '正在暂存',
    'transitNetworkSource.status.persisted': '已暂存',
    'transitNetworkSource.status.gallerySample': '画廊示例',
    'transitNetworkSource.status.localOnly': '仅本页',
    'transitNetworkSource.palette.aria': '{count} 种线路配色',
    'transitNetworkSource.action.fillStationNamesAria': '补全 {count} 个未命名站点',
    'transitNetworkSource.action.fillStationNames': '补站名 {count}',
    'transitNetworkSource.action.configureLineNames': '配置项目线路名称',
    'transitNetworkSource.action.removeImported': '移除已导入项目',
    'transitNetworkSource.action.cancel': '取消',
    'transitNetworkSource.action.saving': '正在保存',
    'transitNetworkSource.action.close': '关闭',
    'transitNetworkSource.error.fileTooLarge': 'RMP 项目文件不能超过 5 MB。',
    'transitNetworkSource.error.notSignedIn': '未登录，当前导入仅在本页有效。',
    'transitNetworkSource.error.persistFailed': '无法暂存 RMP 项目。',
    'transitNetworkSource.error.persistFailedLocalOnly': '{message} 当前导入仅在本页有效。',
    'transitNetworkSource.error.readFailed': '无法读取 RMP 项目文件。',
    'transitNetworkSource.error.deleteFailed': '无法删除暂存的线网项目。',
    'transitNetworkSource.error.saveLineNamesFailed': '无法保存线路名称。',
    'transitNetworkSource.error.saveStationNamesFailed': '无法保存站点名称。',
    'transitNetworkSource.error.sampleLoadFailed': '默认示例线网暂时无法加载。',
    'transitNetworkSource.error.sampleLoadFailedHint':
      '{message} 仍可使用服务器线网或导入本地项目。',
    'transitNetworkSource.notice.lineNamesSampleLocalOnly': '示例项目的线路名称调整仅在本页有效。',
    'transitNetworkSource.notice.lineNamesPendingPersist':
      '线路名称仅在本页有效；项目尚未成功暂存。',
    'transitNetworkSource.notice.stationNamesSampleLocalOnly':
      '示例项目的站点名称调整仅在本页有效。',
    'transitNetworkSource.notice.stationNamesPendingPersist':
      '站点名称仅在本页有效；项目尚未成功暂存。',
    'transitNetworkSource.lineName.title': '配置项目线路名称',
    'transitNetworkSource.lineName.hintPart1': 'RMP 存档里的线路键（如 ',
    'transitNetworkSource.lineName.hintPart2': '、',
    'transitNetworkSource.lineName.hintPart3':
      '）只是绘图用的颜色命名，不是线路名。此处已按线路键的编号部分预填（',
    'transitNetworkSource.lineName.hintPart4':
      ' → 2号线），请确认或改为正式名称；导视牌的「线路编号」模板以这里填写的名称为准。',
    'transitNetworkSource.lineName.primaryAria': '{key}主名称',
    'transitNetworkSource.lineName.primaryPlaceholder': '主名称',
    'transitNetworkSource.lineName.secondaryAria': '{key}副名称',
    'transitNetworkSource.lineName.secondaryPlaceholder': '副名称',
    'transitNetworkSource.lineName.save': '保存线路名称',
    'transitNetworkSource.stationName.title': '补全未命名站点',
    'transitNetworkSource.stationName.nearby': '相邻：{names}',
    'transitNetworkSource.stationName.nearbyUnavailable': '相邻站名不可用',
    'transitNetworkSource.stationName.primaryAria': '{id}主站名',
    'transitNetworkSource.stationName.primaryPlaceholder': '主站名',
    'transitNetworkSource.stationName.secondaryAria': '{id}副站名',
    'transitNetworkSource.stationName.secondaryPlaceholder': '副站名',
    'transitNetworkSource.stationName.save': '保存已填写站名',
    'transitScreen.legacy': '旧版',
    'transitScreen.summaryAria': '客运大屏数据摘要',
    'transitScreen.upcomingAria': '近期班次',
    'transitScreen.viewTrips': '查看班次',
    'transitScreen.empty.unavailable': '大屏数据暂不可用',
    'transitScreen.empty.noData': '旧客运大屏数据源尚未返回可用数据。',
    'operation.contentTagsAria': '内容标签',
    'operation.legacyBodyDescription':
      '旧系统主要通过外部链接承载详情，新版当前只保留标题、摘要和原始入口。',
    'operation.legacyBodyTitle': '这条旧运营消息没有独立正文',
    'operation.legacyImageSource': '旧图片来源：{url}',
    'operation.openOriginal': '打开原始内容',
    'operation.originalLink': '原始链接',
    'transitServiceNotice.activeCount': '{count} 条当前提醒',
    'transitServiceNotice.history': '历史客运提醒',
    'transitServiceNotice.itemCount': '{count} 条',
    'transitServiceNotice.periodRange': '{start} 至 {end}',
    'transitServiceNotice.title': '客运提醒',
    'admin.edit': '编辑',
    'admin.editLine': '编辑线路',
    'admin.editPoi': '编辑 POI',
    'admin.home.title': '管理后台',
    'admin.home.description': '按业务域进入对应后台，账号页只保留这个统一入口。',
    'admin.editOperation': '编辑运营消息',
    'search.category.all': '全部',
    'search.category.lines': '线路',
    'search.category.operations': '运营',
    'search.category.poi': '地图 POI',
    'search.category.schedules': '班次',
    'search.category.services': '服务',
    'search.category.stations': '站点',
    'search.category.wiki': 'Wiki',
    'search.clear': '清空搜索',
    'search.emptyPrompt': '输入关键词后搜索地图 POI、班次、运营资讯和服务',
    'search.facilityCount': '{count} 项设施',
    'search.loading': '正在搜索',
    'search.noCategoryResults': '当前分类下暂无匹配结果',
    'search.noMatch': '暂无匹配“{query}”的结果',
    'search.placeholder': '搜索地点详情、班次、运营资讯或服务',
    'search.resultCount': '{count} 项结果',
    'search.results': '搜索结果',
    'search.resultFilters': '搜索结果分类',
    'search.resultGroup.lines': '线路',
    'search.resultGroup.operations': '运营信息',
    'search.resultGroup.poi': '地图 POI',
    'search.resultGroup.player': '玩家位置',
    'search.resultGroup.schedules': '班次',
    'search.resultGroup.services': '服务与工具',
    'search.resultGroup.social': '社交与社区',
    'search.resultGroup.stations': '站点',
    'search.resultGroup.wiki': '临东 Wiki',
    'search.social.description': '官方社交与社区入口',
    'search.wiki.loading': '正在检索临东 Wiki…',
    'search.wiki.updatedAt': '最后编辑',
    'search.stationExitCount': '{count} 个出入口',
    'search.stopCount': '{count} 站',
    'search.unavailable': '地图与班次数据暂时均不可用',
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
    'toast.close': '关闭提示',
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
    'travelSchedule.empty.unavailable': '班次数据暂不可用',
    'travelSchedule.empty.noData': '当前没有可用的统一班次数据。',
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
    'travelSchedule.journey.arrival': '到达 {time}',
    'travelSchedule.journey.availableAll': '全程可订',
    'travelSchedule.journey.bookJoint': '联合订票 · {count} 段',
    'travelSchedule.journey.combining': '组合中…',
    'travelSchedule.journey.direct': '直达',
    'travelSchedule.journey.durationHours': '{hours} 小时 {minutes} 分',
    'travelSchedule.journey.durationMinutes': '{minutes} 分钟',
    'travelSchedule.journey.editTrip': '编辑班次',
    'travelSchedule.journey.found': '找到 {count} 个方案',
    'travelSchedule.journey.holding': '正在锁定联合行程的全部座位',
    'travelSchedule.journey.lineGroupAria': '{operator}线路',
    'travelSchedule.journey.locking': '锁定中…',
    'travelSchedule.journey.missingEndpoints': '请先填写起点和终点。',
    'travelSchedule.journey.noneFound': '没有找到可衔接的班次方案。',
    'travelSchedule.journey.orderCreated': '联合订票成功，已创建 {count} 段订单草稿。',
    'travelSchedule.journey.orderFailed': '联合订票失败。',
    'travelSchedule.journey.partial': '部分行程不可售',
    'travelSchedule.journey.passThrough': '通过不停',
    'travelSchedule.journey.period': '{start} 至 {end}',
    'travelSchedule.journey.planCount': '{count} 个方案',
    'travelSchedule.journey.planFailed': '行程方案查询失败。',
    'travelSchedule.journey.planIndex': '方案 {index}',
    'travelSchedule.journey.planning': '正在组合班次方案',
    'travelSchedule.journey.query': '查询行程方案',
    'travelSchedule.journey.queryOnly': '仅供查询',
    'travelSchedule.journey.segmentUnavailable': '该方案存在暂不可售的行程段。',
    'travelSchedule.journey.serviceTrip': '{service}班次',
    'travelSchedule.journey.stopCount': '{count} 站',
    'travelSchedule.journey.stopsAria': '{line} 停靠站',
    'travelSchedule.journey.swapEndpoints': '交换起终点',
    'travelSchedule.journey.tbd': '待定',
    'travelSchedule.journey.title': '行程方案',
    'travelSchedule.journey.transferCount': '{count} 次换乘',
    'travelSchedule.journey.transferDetail':
      '{from} → {to} · 约 {minutes} 分钟（含 {buffer} 分钟缓冲）',
    'travelSchedule.journey.tripCount': '{count} 个班次',
    'travelSchedule.journey.tripLabel': '{line} 班次 {code}',
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
    'travelSchedule.reminder.detailDeparture': '发车 {time}',
    'travelSchedule.reminder.detailFare': '票价 {fare}',
    'travelSchedule.reminder.detailTrip': '班次 {code}',
    'travelSchedule.reminder.titleWithTime': '{line} {time} 班次',
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
    'travelSchedule.trip.dayOffset': '+{count}天',
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
    'travel.screenDetail.empty': '没有匹配的班次',
    'travel.screenDetail.fare': '票价',
    'travel.screenDetail.filterAria': '班次筛选',
    'travel.screenDetail.gate': '检票口',
    'travel.screenDetail.line': '线路',
    'travel.screenDetail.listAria': '班次列表',
    'travel.screenDetail.noticeAria': '大屏公告',
    'travel.screenDetail.operator': '运营',
    'travel.screenDetail.past': '已过',
    'travel.screenDetail.routes': '线路',
    'travel.screenDetail.runtime': '运行',
    'travel.screenDetail.search': '搜索班次、线路、车站或检票口',
    'travel.screenDetail.searchClear': '清空班次搜索',
    'travel.screenDetail.station': '车站',
    'travel.screenDetail.stationCount': '{count} 站',
    'travel.screenDetail.stationFlowAria': '{line} 停靠站',
    'travel.screenDetail.stations': '车站',
    'travel.screenDetail.summaryAria': '客运大屏数据摘要',
    'travel.screenDetail.timeFilterAria': '时间筛选',
    'travel.screenDetail.title': '班次查询',
    'travel.screenDetail.total': '全部',
    'travel.screenDetail.trip': '班次',
    'travel.screenDetail.trips': '{shown} / {total} 个班次',
    'travel.screenDetail.upcoming': '即将',
    'travel.services.subtitle': '班次查询、线路站点、客运展示与后续票务入口',
    'travel.services.title': '出行服务',
    'travel.subtitle': '提醒、班次与后续票务',
    'travel.ticketing.action': '待接入',
    'travel.ticketing.detail': '真实电子票、检票、退票和乘车码后续接入临东通',
    'travel.ticketing.title': '票券与订单',
    'worldCoordinate.axis': '{axis} 坐标',
    'worldCoordinate.footerEmpty': '请先输入 X/Z 或选择参考地点；Y 可在上方独立填写',
    'worldCoordinate.footerPick': '点击地图回填 X/Z · 当前 {coordinate} · Y {y}',
    'worldCoordinate.title': '世界坐标',
    'worldCoordinate.yInherited': '继承默认值',
    'worldCoordinate.yPlaceholder': '留空继承地图默认高度',
  },
  'zh-Hant': {
    'account.offlinePackage.area': '面積 {area} 方塊',
    'account.offlinePackage.bounds': 'X {minX} 至 {maxX}，Z {minZ} 至 {maxZ}',
    'account.offlinePackage.close': '關閉',
    'account.offlinePackage.delete': '刪除',
    'account.offlinePackage.deleteAria': '刪除 {name}',
    'account.offlinePackage.deleteConfirm': '要刪除離線範圍「{name}」嗎？',
    'account.offlinePackage.description': '使用 Minecraft 世界座標記錄一個矩形範圍。',
    'account.offlinePackage.empty': '還沒有自訂離線範圍。',
    'account.offlinePackage.error.emptyArea': '離線範圍需要同時具有寬度和高度。',
    'account.offlinePackage.error.invalidBounds': '請輸入有效的 Minecraft X/Z 矩形座標。',
    'account.offlinePackage.error.missingName': '請給這個離線範圍起一個名稱。',
    'account.offlinePackage.lastRefreshed': '上次重新整理 {time}',
    'account.offlinePackage.listAria': '自訂離線範圍',
    'account.offlinePackage.maxX': '最大 X',
    'account.offlinePackage.maxZ': '最大 Z',
    'account.offlinePackage.minX': '最小 X',
    'account.offlinePackage.minZ': '最小 Z',
    'account.offlinePackage.name': '名稱',
    'account.offlinePackage.namePlaceholder': '例如：大學城周邊',
    'account.offlinePackage.newRange': '新增範圍',
    'account.offlinePackage.refresh': '重新整理範圍',
    'account.offlinePackage.refreshing': '重新整理中',
    'account.offlinePackage.save': '儲存範圍',
    'account.offlinePackage.status.baseCacheRefreshed': '基礎快取已重新整理',
    'account.offlinePackage.status.refreshFailed': '重新整理失敗',
    'account.offlinePackage.status.registered': '待生成',
    'account.offlinePackage.status.requestFailed': '請求失敗',
    'account.offlinePackage.status.serverRequested': '已請求生成',
    'account.offlinePackage.summary.area': '{area} 方塊範圍',
    'account.offlinePackage.summary.refreshed': '{count} 個已重新整理基礎快取',
    'account.offlinePackage.summary.total': '{count} 個自訂範圍',
    'account.offlinePackage.strategyNote':
      '自訂範圍目前記錄邊界並重新整理公開基礎資料，真正的瓦片離線包仍等待體積上限和生成策略確認。',
    'account.offlinePackage.title': '新增離線範圍',
    'account.cache.offlineDeletedAll': '已刪除本機與帳號中的離線範圍請求',
    'account.cache.offlineDeletedLocalOnly': '已刪除本機離線範圍，帳號側請求刪除失敗',
    'account.cache.offlineRefreshFailed': '離線範圍基礎資料重新整理失敗',
    'account.cache.refreshFailed': '重新整理失敗',
    'account.cache.refreshingOfflineBase': '正在重新整理離線範圍基礎資料',
    'account.error.cacheRefreshFailed': '{url} 重新整理失敗',
    'account.error.offlinePackageRequestFailed': '伺服器離線包請求失敗',
    'account.error.offlineScopeDeleteFailed': '帳號離線範圍請求刪除失敗',
    'account.error.offlineScopeUnavailable': '帳號離線範圍暫不可用',
    'account.error.pushPreferenceUnavailable': '通知偏好暫不可用',
    'account.error.tripReminderDeleteFailed': '帳號提醒副本刪除失敗',
    'account.error.tripRemindersUnavailable': '帳號提醒暫不可用',
    'account.push.insecureContext': '目前頁面不是安全上下文，瀏覽器不會開放 Push 訂閱',
    'account.push.loginRequired': '需要先使用臨東通登入。',
    'account.push.missingKeys': '瀏覽器回傳的 Push 訂閱缺少必要金鑰',
    'account.push.missingPublicKey': 'Web Push 公鑰尚未設定，本裝置暫不能訂閱推播',
    'account.push.permissionDenied': '瀏覽器通知權限未開啟',
    'account.push.registerFailed': 'Push 裝置訂閱登記失敗',
    'account.push.revokeFailed': 'Push 裝置訂閱撤銷失敗',
    'account.push.serviceWorkerNotReady': 'Service Worker 尚未就緒，暫不能訂閱 Push',
    'account.push.unknownHost': '未知服務',
    'account.push.unsupported': '目前瀏覽器不支援 Web Push',
    'account.about.currentVersion': '目前版本：{version}',
    'account.about.github': 'GitHub 儲存庫',
    'account.about.mcpCopied': '已複製 MCP 位址',
    'account.about.mcpCopy': '複製 MCP 位址',
    'account.about.mcpDescription':
      '問一問的站內資料能力已封裝成唯讀 MCP Server，可在支援 Streamable HTTP 的 MCP 用戶端直接加入這個位址；介面匿名唯讀，不包含你的模型 Key。',
    'account.about.mcpTitle': 'MCP 開放介面',
    'account.about.title': '關於與更新',
    'account.about.viewChangelog': '查看版本更新',
    'account.auth.adminOperations': '內容後台',
    'account.auth.adminPortal': '管理後台',
    'account.auth.adminPoi': 'POI 後台',
    'account.auth.adminServices': '服務後台',
    'account.auth.adminTransit': '線路後台',
    'account.auth.defaultTitle': '臨東通帳號',
    'account.auth.introConfigured': '使用臨東通帳號登入後可同步歷史、偏好和後續票券狀態。',
    'account.auth.introNotConfigured': '臨東通登入尚未設定。',
    'account.auth.ldpassAccount': '臨東通帳號',
    'account.auth.localAdminLogin': '本機管理員登入',
    'account.auth.localAdminLoginHint': '僅用於本機開發，不會略過後台 API 驗證。',
    'account.auth.login': '使用臨東通登入',
    'account.auth.logout': '登出雨城通',
    'account.auth.readonlyStatus': '帳號狀態：{status}',
    'account.auth.serverUnverified': '伺服器帳號未驗證',
    'account.auth.serverVerified': '伺服器帳號已驗證',
    'account.auth.serverVerifiedWithName': '伺服器帳號已驗證：{name}',
    'account.authStatus.ldpassNotConfigured': '臨東通登入尚未設定。',
    'account.authStatus.loggedOut': '已登出雨城通本機會話。',
    'account.authStatus.loginSuccess': '已完成臨東通登入。',
    'account.authStatus.readonly': '目前帳號只能進入唯讀帳號頁。',
    'account.authStatus.sessionCookieMissing':
      '雨城通沒有收到臨東通共享登入 Cookie。請確認臨東通生產環境已設定 AUTH_COOKIE_DOMAIN=.shangxiaoguan.top，重啟臨東通並重新登入後再試。',
    'account.authStatus.sessionError': '臨東通會話讀取失敗，請稍後再試。',
    'account.authStatus.sessionUnavailable': '未能從臨東通讀取有效帳號資訊。',
    'account.authStatus.sessionUnavailableLocalhost':
      '目前回跳地址是 localhost/127.0.0.1，本機站點無法直接讀取臨東通共享會話。請改用共享網域測試，或將本機服務切到已接入的同域測試環境。',
    'account.authStatus.stateInvalid': '登入狀態校驗失敗，請重新發起登入。',
    'account.history.action.clearLocal': '清空本機',
    'account.history.action.manageTrips': '管理行程',
    'account.history.action.revokeLegacy': '撤銷舊站同步',
    'account.history.action.revokingLegacy': '撤銷中',
    'account.history.action.searchSchedules': '查詢班次',
    'account.history.action.sync': '同步提醒',
    'account.history.action.syncing': '同步中',
    'account.history.action.viewMap': '查看地圖',
    'account.history.clearConfirm':
      '要清空雨城通新版本機行程提醒、歷史記錄、班次查詢記錄和地圖收藏嗎？舊站 orders 原始資料不會被刪除。',
    'account.history.legacyRevokeConfirmLocal':
      '撤銷後，後續同步帳號時會再次詢問是否同步舊站 orders 匯入的記錄。',
    'account.history.legacyRevokeConfirmWithAccount':
      '撤銷後，會刪除帳號中由舊站 orders 同步來的提醒副本，並保留本機舊站記錄。後續同步帳號時會再次詢問。',
    'account.history.legacyRevokeDeleteFailed': '已撤銷本機同意，帳號副本刪除失敗',
    'account.history.legacyRevokeDeleted':
      '已撤銷舊站記錄同步同意，並刪除 {count} 個帳號側舊站提醒副本',
    'account.history.legacyRevokeDeleting': '正在刪除帳號中的舊站提醒副本',
    'account.history.legacyRevokeDone': '已撤銷舊站記錄同步同意',
    'account.history.legacyRevokeNoCopies':
      '已撤銷舊站記錄同步同意，帳號中沒有需要刪除的舊站提醒副本',
    'account.history.legacySyncConfirm':
      '這次同步包含 {count} 條從舊站 orders 唯讀匯入的記錄。同步後它們只會作為帳號側行程提醒快照，不代表新版票務訂單、票券或核銷憑證。是否同意同步這些舊站記錄？',
    'account.history.legacySyncKept': '已保留舊站記錄在本機，未同步到帳號',
    'account.history.loadedFromAccount': '已載入帳號中的 {count} 個提醒',
    'account.history.loading': '讀取中',
    'account.history.mapFavorites': '{count} 個地圖收藏',
    'account.history.noSyncNeeded': '沒有需要同步的提醒',
    'account.history.pendingSync': '{count} 個待同步',
    'account.history.scheduleRecords': '{count} 條班次記錄',
    'account.history.syncDone': '已同步 {count} 個提醒',
    'account.history.syncDoneWithSkipped': '已同步 {count} 個提醒，保留 {skipped} 條舊站記錄在本機',
    'account.history.syncFailed': '行程提醒同步失敗',
    'account.history.syncing': '正在同步提醒',
    'account.history.title': '本機歷史',
    'account.history.total': '{count} 條',
    'account.history.tripHistory': '{count} 個歷史行程',
    'account.history.upcomingTrips': '{count} 個即將進行',
    'account.notification.checkinDescription': '檢票、核銷和乘車碼相關提醒',
    'account.notification.checkinLabel': '檢票提醒',
    'account.notification.disabled': '本裝置推送已關閉',
    'account.notification.enabled': '本裝置推送已開啟',
    'account.notification.gridAria': '允許推送的提醒類型',
    'account.notification.masterLabelDisabled': '本裝置推送通知總開關，目前已關閉',
    'account.notification.masterLabelEnabled': '本裝置推送通知總開關，目前已開啟',
    'account.notification.note':
      '總開關只控制本裝置是否接收 Push；下方分類決定哪些提醒允許推送；免打擾時段不會關閉分類，只會靜默或延後這些提醒。',
    'account.notification.operationsDescription': '公告、線路調整和營運狀態',
    'account.notification.operationsLabel': '營運提醒',
    'account.notification.quietEnd': '免打擾結束時間',
    'account.notification.quietStart': '免打擾開始時間',
    'account.notification.statusDisabledPreference': '已關閉通知偏好',
    'account.notification.statusLoginRequired': '登入後可把本裝置加入服務端 Push 訂閱',
    'account.notification.statusRegistered': '本裝置已加入 Push 訂閱：{host}',
    'account.notification.statusRegistering': '正在登記本裝置 Push 訂閱',
    'account.notification.statusRevoked': '已撤銷本裝置 Push 訂閱',
    'account.notification.statusRevoking': '正在撤銷本裝置 Push 訂閱',
    'account.notification.statusSyncFailed': '本裝置 Push 訂閱同步失敗',
    'account.notification.ticketDescription': '訂票、退票和票券狀態變化',
    'account.notification.ticketLabel': '票務狀態',
    'account.notification.title': '推送通知與免打擾時段',
    'account.notification.tripDescription': '出發、到站、歷史行程相關提醒',
    'account.notification.tripLabel': '行程提醒',
    'account.pwa.action.clearCache': '清理快取',
    'account.pwa.action.install': '安裝雨城通',
    'account.pwa.action.refreshCache': '重新整理快取',
    'account.pwa.cacheChecking': '正在檢查',
    'account.pwa.cacheClearing': '正在清理',
    'account.pwa.cacheEmpty': '暫無快取',
    'account.pwa.cacheItems': '已快取 {count} 項',
    'account.pwa.cacheRefreshing': '正在重新整理',
    'account.pwa.cacheUnavailable': '快取不可用',
    'account.pwa.description':
      '把 YCT 加入主畫面，快速查看營運資訊、線路和站點詳情。支援快取已下載的自訂範圍離線包，並在你允許後接收行程、營運、訂票和檢票提醒。',
    'account.pwa.descriptionPrefix': '安裝雨城通：',
    'account.pwa.status.checking': '檢查中',
    'account.pwa.status.installed': '已安裝',
    'account.pwa.status.installable': '可安裝',
    'account.pwa.status.manual': '可加入',
    'account.pwa.status.unsupported': '不可用',
    'account.pwa.statusDescription.checking': '正在檢查目前瀏覽器是否支援安裝入口。',
    'account.pwa.statusDescription.installed':
      '目前已經以獨立應用方式開啟，後續可繼續在這裡管理離線快取。',
    'account.pwa.statusDescription.installable':
      '目前瀏覽器支援直接安裝，點擊「安裝雨城通」即可開啟安裝確認。',
    'account.pwa.statusDescription.manual':
      '目前瀏覽器需要透過選單加入主畫面或安裝為應用；在 Safari 中可使用分享選單裡的「加入主畫面」。',
    'account.pwa.statusDescription.unsupported':
      '目前瀏覽器不支援安裝入口，仍可繼續使用網頁和近期內容快取。',
    'account.pwa.title': '安裝與離線',
    'account.settings': '帳號設定',
    'account.ticketDraft.count': '{count} 個',
    'account.ticketDraft.readonly': '帳號為唯讀狀態，Active 後可查看訂單草稿。',
    'account.status.anonymous': '未登入',
    'account.status.notConfigured': '臨東通未設定',
    'account.status.readonly': '唯讀帳號',
    'account.status.unavailable': '帳號狀態暫不可用',
    'changelog.category.feat': '新增',
    'changelog.category.fix': '修復',
    'changelog.category.perf': '優化',
    'changelog.category.style': '介面',
    'changelog.changeCount': '{count} 項變更',
    'changelog.empty': '目前還沒有可展示的版本更新。',
    'changelog.title': '版本更新',
    'brand.home': '雨城通首頁',
    'contentPoiBinding.empty': '沒有符合的公開 POI。',
    'contentPoiBinding.hint': '只顯示公開地圖中的 POI；訊息發布後才會在 POI 詳情中生效。',
    'contentPoiBinding.loading': '正在讀取公開 POI',
    'contentPoiBinding.optionsAria': '可關聯 POI',
    'contentPoiBinding.searchAria': '搜尋關聯 POI',
    'contentPoiBinding.searchPlaceholder': '搜尋 POI 名稱、地址或 ID',
    'contentPoiBinding.selectedAria': '已關聯 POI',
    'contentPoiBinding.title': '關聯 POI',
    'contentPoiBinding.unavailable': '公開 POI 暫時無法使用',
    'embeddedMapPicker.empty': '請先輸入座標或選擇一個參考地點。',
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
    'map.categoryName.airport': '機場',
    'map.categoryName.busStop': '公車站',
    'map.categoryName.coachStation': '客運站',
    'map.categoryName.commerce': '商業',
    'map.categoryName.dining': '餐飲',
    'map.categoryName.education': '教育',
    'map.categoryName.facility': '設施',
    'map.categoryName.ferryPort': '輪渡碼頭',
    'map.categoryName.industry': '產業設施',
    'map.categoryName.mapMarker': '地圖標記',
    'map.categoryName.medical': '醫療',
    'map.categoryName.metroEntrance': '地鐵出入口',
    'map.categoryName.metroStation': '地鐵站',
    'map.categoryName.museum': '展館',
    'map.categoryName.park': '公園綠地',
    'map.categoryName.parking': '停車',
    'map.categoryName.player': '玩家',
    'map.categoryName.publicService': '公共服務',
    'map.categoryName.railway': '鐵路',
    'map.categoryName.railwayStation': '鐵路車站',
    'map.categoryName.residence': '居住區',
    'map.categoryName.road': '道路',
    'map.categoryName.scenery': '景點',
    'map.categoryName.sports': '體育',
    'map.categoryName.tramStation': '有軌電車站',
    'map.categoryName.transitLine': '線路',
    'map.categoryName.water': '水域',
    'map.empty.favorites': '暫無收藏地點',
    'map.empty.loading': '正在讀取地圖標記',
    'map.empty.nearby': '周邊暫無可顯示標記',
    'map.empty.noMatch': '暫無符合標記',
    'map.empty.unavailable': '暫無可顯示地圖標記',
    'map.geometry.linearObject': '線性物件端點組，{count} 個端點',
    'map.geometry.lineString': '線性物件，{count} 個節點',
    'map.geometry.pointMarker': '點標記',
    'map.geometry.region': '區域物件，{count} 個邊界節點',
    'map.geometry.roadEndpointCount': '道路端點 {count} 個',
    'map.geometry.transitLineDetail': '站點座標直連 {count} 個點',
    'map.geometry.transitLineObject': '線路物件，{count} 個站點座標直連點',
    'map.geometry.transitLinePending': '待補線路座標',
    'map.hud.aria': '地圖比例尺與座標',
    'map.hud.cursor': '移動游標查看座標',
    'map.hud.scale.blocks': '{value} 格',
    'map.hud.scale.kilometers': '{value} km',
    'map.markerList.count': '{count} 個',
    'map.markerList.default': '地圖標記',
    'map.markerList.fullLength': '全長 {distance}',
    'map.markerList.nearby': '{name}周邊',
    'map.markerList.nearbyLinear': '{name}沿線',
    'map.markerList.playerCount': '{online}/{total} 個',
    'map.markerList.results': '搜尋結果',
    'map.metroInfrastructure.direction.down': '向下',
    'map.metroInfrastructure.direction.here': '本站轉乘',
    'map.metroInfrastructure.direction.up': '向上',
    'map.metroInfrastructure.downwardsTerminus': '下行終點',
    'map.metroInfrastructure.exitGroup.left': '{arrow}{codes}出口',
    'map.metroInfrastructure.exitGroup.right': '{codes}出口{arrow}',
    'map.metroInfrastructure.facing': '朝向 {orientation}',
    'map.metroInfrastructure.facility.elevator': '電梯',
    'map.metroInfrastructure.facility.escalator': '扶梯',
    'map.metroInfrastructure.facility.escalatorAndStairs': '扶梯/樓梯',
    'map.metroInfrastructure.facility.exit': '出口',
    'map.metroInfrastructure.facility.familyRestroom': '家庭洗手間',
    'map.metroInfrastructure.facility.accessibleRestroom': '無障礙洗手間',
    'map.metroInfrastructure.facility.meetingPoint': '會合點',
    'map.metroInfrastructure.facility.mensRestroom': '男洗手間',
    'map.metroInfrastructure.facility.nursingRoom': '母嬰室',
    'map.metroInfrastructure.facility.passengerServiceCenter': '乘客服務中心',
    'map.metroInfrastructure.facility.platformDoor': '屏蔽門',
    'map.metroInfrastructure.facility.police': '警務室',
    'map.metroInfrastructure.facility.stairs': '樓梯',
    'map.metroInfrastructure.facility.stairsTwoWay': '雙向樓梯',
    'map.metroInfrastructure.facility.subway': '地鐵',
    'map.metroInfrastructure.facility.thirdRestroom': '第三洗手間',
    'map.metroInfrastructure.facility.ticketMachine': '自動售票機',
    'map.metroInfrastructure.facility.toilet': '洗手間',
    'map.metroInfrastructure.facility.waitingRoom': '候車室',
    'map.metroInfrastructure.facility.wheelchair': '無障礙設施',
    'map.metroInfrastructure.facility.wheelchairLift': '輪椅升降機',
    'map.metroInfrastructure.facility.womensRestroom': '女洗手間',
    'map.metroInfrastructure.floorEmpty': '暫無站內節點紀錄',
    'map.metroInfrastructure.layer.concourse': '站廳層',
    'map.metroInfrastructure.layer.entrance': '入口層',
    'map.metroInfrastructure.layer.passageway': '通道層',
    'map.metroInfrastructure.layer.platform': '站台層',
    'map.metroInfrastructure.layer.transfer': '轉乘層',
    'map.metroInfrastructure.lineTowards': '{lineName} 開往{terminal}',
    'map.metroInfrastructure.oneWay.both': '雙向通行',
    'map.metroInfrastructure.oneWay.down': '僅下行',
    'map.metroInfrastructure.oneWay.up': '僅上行',
    'map.metroInfrastructure.platformDoors': '{side}開門',
    'map.metroInfrastructure.platformSide.both': '兩側',
    'map.metroInfrastructure.platformSide.left': '左側',
    'map.metroInfrastructure.platformSide.right': '右側',
    'map.metroInfrastructure.platformSide.unknown': '方向未記錄',
    'map.metroInfrastructure.tabsAria': '線路設施資訊',
    'map.metroInfrastructure.title': '站內設施資訊',
    'map.metroInfrastructure.towardsLeft': '← 開往 {station}',
    'map.metroInfrastructure.towardsRight': '開往 {station} →',
    'map.metroInfrastructure.transferAction': '查看{title}站台設施',
    'map.metroInfrastructure.transferDirection.downwards': '下行方向轉乘',
    'map.metroInfrastructure.transferDirection.upwards': '上行方向轉乘',
    'map.metroInfrastructure.upwardsTerminus': '上行終點',
    'map.layer.aria': '圖層與投稿',
    'map.layer.linearFeatures': '線條與標籤',
    'map.layer.linearFeaturesHidden': '已隱藏道路/線路覆蓋',
    'map.layer.linearFeaturesVisible': '顯示道路/線路覆蓋',
    'map.layer.markers': '標記點',
    'map.layer.markersHidden': '已隱藏地點標記',
    'map.layer.markersVisible': '顯示地點標記',
    'map.layer.modeAria': '地圖瀏覽模式',
    'map.layer.mode.roadNetwork': '路網',
    'map.layer.mode.satellite': '衛星',
    'map.layer.mode.traffic': '交通',
    'map.layer.noteRoadNetwork': '關閉瓦片，突出道路網路和道路文字。',
    'map.layer.noteSatellite': '載入{name}，僅疊加關鍵道路。',
    'map.layer.noteTraffic': '關閉瓦片，突出公共交通站點並淡化道路。',
    'map.layer.open': '圖層與投稿',
    'map.layer.players': '玩家位置',
    'map.layer.playersHidden': '已隱藏線上/離線玩家',
    'map.layer.playersVisible': '顯示線上/離線玩家',
    'map.layer.perspective': '俯視 2.5D',
    'map.layer.perspectiveHidden': '按二維區域顯示',
    'map.layer.perspectiveVisible': '顯示立體 POI 體塊',
    'map.layer.submitPoi': '投稿 POI',
    'map.layer.tileProvider': '瓦片源',
    'map.layer.tileProviderAria': '瓦片源',
    'map.lineDetail.fare': '票價',
    'map.lineDetail.stations': '站點',
    'map.lineInfo.openAria': '查看 {name} 線路資訊',
    'map.lineInfo.timezoneNote': '首末車、發車時刻與預計到站時間均為北京時間（UTC+8）。',
    'map.lineInfo.title': '{name} · 線路資訊',
    'map.lineRealtime.allTrips': '全部班次',
    'map.lineRealtime.atStation': '停靠 {station}',
    'map.lineRealtime.beijingTime': '北京時間',
    'map.lineRealtime.boardArrivalAt': '{time} 抵達',
    'map.lineRealtime.boardArriving': '即將到站',
    'map.lineRealtime.boardDepartureAt': '{time} 離開',
    'map.lineRealtime.boardLeaving': '即將離開',
    'map.lineRealtime.boardMinutes': '{minutes} 分鐘',
    'map.lineRealtime.boardWaiting': '等待發車',
    'map.lineRealtime.countBadge': '{active}/{total}',
    'map.lineRealtime.countBadgeAria': '在途 {active} 輛，未離開選中車站 {total} 班',
    'map.lineRealtime.detailArrival': '預計抵達',
    'map.lineRealtime.detailDeparture': '首站發車',
    'map.lineRealtime.detailDepartureAtStation': '預計離開',
    'map.lineRealtime.detailPosition': '目前位置',
    'map.lineRealtime.detailSelectedStation': '選中車站',
    'map.lineRealtime.detailStatus': '到站狀態',
    'map.lineRealtime.detailWaiting': '尚未發車',
    'map.lineRealtime.emptyActive': '目前時段暫無在途車輛',
    'map.lineRealtime.emptySchedule': '該方向尚未錄入發車時刻表',
    'map.lineRealtime.inSegment': '行駛於 {from} → {to} 區間',
    'map.lineRealtime.lastTripPassed': '末班車已過，下一班 {time}',
    'map.lineRealtime.lastTripPassedNextDay': '末班車已過，下一班 {time}（次日）',
    'map.lineRealtime.minutesToNext': '距下一站約 {count} 分鐘',
    'map.lineRealtime.nextDeparture': '下一班 {time}',
    'map.lineRealtime.nextDepartureNextDay': '下一班 {time}（次日）',
    'map.lineRealtime.noMoreTrips': '今日已無後續班次',
    'map.lineRealtime.note':
      '依已錄入的首站發車時刻推算；區間用時優先使用後台設定，缺失時依線路長度與平均速度估算。',
    'map.lineRealtime.selectStationHint': '點擊站點查看該站即時資訊',
    'map.lineRealtime.stationAt': '目前有車停靠',
    'map.lineRealtime.stationEta': '預計 {time} 抵達 · 約 {minutes} 分鐘',
    'map.lineRealtime.stationNextArrival': '最近一班約 {minutes} 分鐘後抵達（預計 {time}）',
    'map.lineRealtime.stationNoData': '該站暫無即時站點資料',
    'map.lineRealtime.stationNoVehicle': '目前沒有前往該站的車輛',
    'map.lineRealtime.stationPassed': '已通過該站',
    'map.lineRealtime.summary': '共 {count} 輛在途',
    'map.lineRealtime.title': '即時公車',
    'map.lineRealtime.trip': '第 {count} 班 · {time} 發車',
    'map.lineRealtime.tripTitlePosition': '第 {current}/{total} 班',
    'map.lineRealtime.updatedAt': '更新於 {time}',
    'map.lineRealtime.vehicleBadge': '第 {count} 班 · {time} 發車',
    'map.lineStation.showPoi': '查看站點',
    'map.nearby.exit': '退出',
    'map.nearby.mileage': '沿線 {distance}',
    'map.nearby.note': '按距離顯示 {name} 周邊標記',
    'map.nearby.noteLinear': '按沿線里程顯示 {name} 沿線標記',
    'map.nearby.rangeAria': '沿線里程範圍',
    'map.nearby.rangeLabel': '沿線範圍',
    'map.nearby.rangeValue': '{from} - {to}',
    'map.nearby.scopeAria': '區域周邊範圍',
    'map.nearby.scopeInside': '區域內',
    'map.nearby.scopeOutside': '區域外附近',
    'map.overlay.aria': '地圖標記示意層',
    'map.overlay.linearPoiTitle': '{name} · {count} 個端點',
    'map.overlay.markerTitle': '{name}（{x}, {z}）',
    'map.overlay.roadTraceTitle': '{name} · 近似線，{count} 個端點',
    'map.overlay.transitTraceTitle': '{name} · {count} 個途經站',
    'map.overlay.viewMarker': '查看 {name}',
    'map.player.lastSeen': '最後上線：{time}',
    'map.player.observed': '最近觀測：{time}',
    'map.player.serverAccount': '伺服器帳號',
    'map.player.status.offline': '離線',
    'map.player.status.online': '線上',
    'map.poi.actions': '地點操作',
    'map.poi.address': '地址',
    'map.poi.close': '關閉地點資訊',
    'map.poi.collapse': '收起地點資訊',
    'map.poi.connections': '接駁線路',
    'map.poi.coordinate': '座標',
    'map.poi.count': '{count} 個',
    'map.poi.copyStatus': '已複製地點連結',
    'map.poi.expand': '展開地點資訊',
    'map.poi.facilities': '設施/出入口',
    'map.poi.favoriteAria': '收藏 {name}',
    'map.poi.favoriteStatus': '已收藏 {name}',
    'map.poi.floor': '樓層',
    'map.poi.filterAll': '全部',
    'map.poi.filterCategory': '子地點分類',
    'map.poi.filterFloor': '樓層',
    'map.poi.filterKeyword': '檢索子地點',
    'map.poi.filterKeywordPlaceholder': '名稱、地址、設施等',
    'map.poi.group.access': '出入口',
    'map.poi.group.building': '樓棟',
    'map.poi.group.facility': '設施',
    'map.poi.group.nearby': '周邊',
    'map.poi.group.scenery': '景點',
    'map.poi.group.transport': '交通',
    'map.poi.imageAlt': '{name} 圖片',
    'map.poi.imageCounter': '{current} / {total}',
    'map.poi.imageNext': '下一張圖片',
    'map.poi.imagePrevious': '上一張圖片',
    'map.poi.nearbyAlongAria': '搜尋 {name} 沿線標記',
    'map.poi.nearbyAria': '搜尋 {name} 周邊',
    'map.poi.noConnections': '暫無已知接駁線路',
    'map.poi.noFacilities': '暫無設施資料',
    'map.poi.objectFallback': '地圖物件',
    'map.poi.openDetail': '開啟詳情',
    'map.poi.openingHours': '營業時間',
    'map.poi.operations': '營運消息',
    'map.poi.operationsEmpty': '目前沒有生效中的營運消息',
    'map.poi.operationsLoading': '正在讀取營運消息',
    'map.poi.parent': '所屬地點',
    'map.poi.boundRegions': '所屬區域',
    'map.poi.parentFallback': '父地點',
    'map.poi.relatedPlaceFallback': '關聯地點',
    'map.poi.relatedPlaces': '關聯地點',
    'map.poi.route': '查看路線',
    'map.poi.shareAria': '分享 {name}',
    'map.poi.shareOpened': '已開啟系統分享面板',
    'map.poi.shareText': '在雨城通地圖中查看 {name}',
    'map.poi.shareTitle': '{name} - 雨城通地圖',
    'map.poi.shareUnavailable': '目前瀏覽器暫不支援分享或複製',
    'map.poi.summary': '簡介',
    'map.poi.tabsAria': '地點資訊分類',
    'map.poi.type': '類型',
    'map.poi.unfavoriteAria': '取消收藏 {name}',
    'map.poi.unfavoriteStatus': '已取消收藏 {name}',
    'map.poiSubmit.category': '分類',
    'map.poiSubmit.address': '文字地址',
    'map.poiSubmit.addressPlaceholder': '例如：青年大街 18 號',
    'map.poiSubmit.addressRoad': '地址道路',
    'map.poiSubmit.floor': '樓層',
    'map.poiSubmit.floorPlaceholder': '例如：B1、3F、站廳層',
    'map.poiSubmit.close': '關閉投稿視窗',
    'map.poiSubmit.description': '地點簡介',
    'map.poiSubmit.descriptionPlaceholder': '可填寫地點用途、開放狀態、出入口說明等',
    'map.poiSubmit.href': '相關連結',
    'map.poiSubmit.hrefPlaceholder': 'https://...',
    'map.poiSubmit.imageFile': '上傳圖片',
    'map.poiSubmit.imageFileCount': '已選擇 {count} 張圖片',
    'map.poiSubmit.imageUploadFailed': '圖片上傳失敗',
    'map.poiSubmit.imageUrl': '圖片連結',
    'map.poiSubmit.imageUrlPlaceholder': 'https://.../photo.png',
    'map.poiSubmit.invalid': '請填寫名稱、分類和有效座標。',
    'map.poiSubmit.invalidFacility': '請填寫每條設施資訊的文字描述。',
    'map.poiSubmit.tooManyImages': '每個 POI 最多可提交 12 張圖片。',
    'map.poiSubmit.name': '地點名稱',
    'map.poiSubmit.namePlaceholder': '地點名稱',
    'map.poiSubmit.noAddressRoad': '不綁定道路',
    'map.poiSubmit.openingHours': '營業時間',
    'map.poiSubmit.openingHoursPlaceholder': '例如：週一至週五 09:00-18:00',
    'map.poiSubmit.pickCancel': '取消',
    'map.poiSubmit.pickDone': '已選擇座標 {point}。',
    'map.poiSubmit.pickHint': '輕點地圖空白處設定投稿座標',
    'map.poiSubmit.pickOnMap': '在地圖上選點',
    'map.poiSubmit.pickPrompt': '請在地圖空白處輕點，選擇投稿 POI 的座標。',
    'map.poiSubmit.submit': '提交審核',
    'map.poiSubmit.submitFailed': '投稿提交失敗',
    'map.poiSubmit.submitting': '提交中',
    'map.poiSubmit.success': '已提交，等待管理員審核。',
    'map.poiSubmit.title': '投稿公開 POI',
    'map.poiSubmit.x': 'X 座標',
    'map.poiSubmit.z': 'Z 座標',
    'map.source.loading': '地圖資料讀取中',
    'map.source.objectCount': '{count} 個物件',
    'map.source.provider.lindongFreshHttp': 'Lindong 較新瓦片',
    'map.source.provider.lindongSafeHttpsStatic': 'Lindong HTTPS 靜態瓦片',
    'map.source.provider.lindongUnminedStatic': 'Lindong uNmINeD 靜態瓦片',
    'map.source.providerNote.lindongFreshHttp':
      '該源較新，已透過 YCT 後端代理同源載入以避免 HTTPS 混合內容風險。',
    'map.source.providerNote.lindongSafeHttpsStatic':
      '該源無混合內容風險，但可能不反映最新地圖狀態。',
    'map.source.providerNote.lindongUnminedStatic':
      '該源來自 map.shangxiaoguan.top 的 HTTPS 靜態地圖，後續需接入 uNmINeD 座標轉換後完整渲染。',
    'map.source.tileFallback': '地圖瓦片',
    'map.source.tileProvider': '目前瓦片源：{name}',
    'map.source.tooltipLoading': '地圖資料正在讀取。',
    'map.source.unavailable': '地圖資料暫不可用',
    'map.location.currentAccount': '目前帳號：{name}',
    'map.search.aria': '搜尋地圖地點',
    'map.search.clear': '清空地圖搜尋',
    'map.search.placeholder': '搜尋地圖地點、道路或路線',
    'map.routingStatus.projecting': '正在準備道路接入點',
    'map.share.actions': '分享方式',
    'map.share.close': '關閉分享面板',
    'map.share.footerDisclaimer': '上述地名、組織名均為虛構',
    'map.share.footerPrefix': '來自',
    'map.share.footerText': '來自雨城通',
    'map.share.image': '分享圖',
    'map.share.imageDownloaded': '分享圖已下載',
    'map.share.imageShared': '已開啟圖片分享面板',
    'map.share.coordinate': '複製座標',
    'map.share.coordinateCopied': '座標已複製',
    'map.share.copy': '複製',
    'map.share.copyKind': '複製內容',
    'map.share.link': '複製連結',
    'map.share.linkCopied': '已複製分享連結',
    'map.share.processing': '處理中',
    'map.share.qrCode': '分享連結二維碼',
    'map.share.text': '複製文字版',
    'map.share.textCopied': '已複製文字版內容',
    'map.share.teleport': '複製傳送指令',
    'map.share.teleportCopied': '傳送指令已複製',
    'map.share.title': '分享',
    'map.share.unavailable': '目前瀏覽器暫不支援此分享方式',
    'map.toolbar.reset': '回到目前位置或預設視圖',
    'map.toolbar.zoomIn': '放大地圖',
    'map.toolbar.zoomOut': '縮小地圖',
    'map.title': '地圖探索',
    'mapStageLoader.aria': '地圖載入中',
    'mapStageLoader.loading': '地圖正在載入',
    'siteLegal.aria': '備案資訊',
    'siteLegal.disclaimer': '本站部分程式碼使用人工智慧技術生成，上述地名、組織名均為虛構。',
    'siteLegal.icp': '遼ICP備2021004959號-1',
    'siteLegal.police': '遼公網安備21100502000117號',
    'siteLegal.version': '版本 {version}',
    'map.route.alight': '{name} 下車',
    'map.route.alightFerry': '{name} 下船',
    'map.route.alightMetro': '{name} 出站',
    'map.route.linearEndpointBlocked': '起點和終點不能同時為線路或道路等線性要素',
    'map.route.aria': '路線規劃',
    'map.route.arrive': '到達 {name}',
    'map.route.badge.fastest': '最快到達',
    'map.route.badge.fewestTransfers': '最少換乘',
    'map.route.badge.leastWalking': '最少步行',
    'map.route.board': '{name} 上車',
    'map.route.boardFerry': '{name} 上船',
    'map.route.boardMetro': '{name} 進站',
    'map.route.close': '關閉路線規劃',
    'map.route.collapse': '收合路線規劃',
    'map.route.currentLocation': '目前地點',
    'map.route.defaultView': '預設視圖',
    'map.route.depart': '{name} 出發',
    'map.route.destination': '終點',
    'map.route.directTitle': '{mode}直達',
    'map.route.taxiDirect': '乘車直達',
    'map.route.taxiAlternativeOne': '乘車備選 1',
    'map.route.taxiAlternativeTwo': '乘車備選 2',
    'map.route.taxiFewestSegments': '少路段乘車',
    'map.route.taxiNote':
      '計程車只沿道路行駛；移動時間按後台預設限速 {speed} km/h 與路口延誤估算，計價規則由後台維護。',
    'map.route.taxiWithDistance': '乘計程車沿道路行駛 {distance} {duration}',
    'map.route.taxiWalkFromDropoff': '下車後步行 {distance} {duration}',
    'map.route.taxiWalkToPickup': '步行到道路上車點 {distance} {duration}',
    'map.route.distance.blocks': '{count} 格',
    'map.route.duration.short': '約 {count} 分',
    'map.route.duration.step': '{count}分鐘',
    'map.route.edit': '修改',
    'map.route.endpointCandidatesAria': '路線端點候選',
    'map.route.expand': '展開路線規劃',
    'map.route.featuresAria': '路線特徵',
    'map.route.fare.estimated': '預計 {amount}',
    'map.route.fare.exact': '{amount}',
    'map.route.fare.partial': '已知 {amount} 起',
    'map.route.fare.unavailable': '票價待確認',
    'map.route.input.destination': '輸入路線終點',
    'map.route.input.origin': '輸入路線起點',
    'map.route.loadingDetail': '首次建立道路圖可能需要幾秒',
    'map.route.loadingNote': '舊道路圖較大時，首次規劃可能需要幾秒。',
    'map.route.loadingTitle': '正在計算路線方案',
    'map.route.marker.destination': '終',
    'map.route.marker.origin': '起',
    'map.route.metroEnterViaAccess': '經 {access} 進站',
    'map.route.metroExitViaAccess': '經 {access} 出站',
    'map.route.mode.all': '全部',
    'map.route.mode.bus': '公交',
    'map.route.mode.coach': '客運',
    'map.route.mode.collapse': '收合',
    'map.route.mode.taxi': '乘車',
    'map.route.mode.ferry': '輪渡',
    'map.route.mode.metro': '地鐵',
    'map.route.mode.more': '更多{count}',
    'map.route.mode.railway': '鐵路',
    'map.route.mode.tram': '有軌',
    'map.route.mode.walk': '步行',
    'map.route.modeAria': '路線交通方式',
    'map.route.noEndpointCandidates': '沒有符合的可定位標記。',
    'map.route.noModes': '請至少啟用一種交通方式。',
    'map.route.noOptions': '暫未找到可用路線方案。',
    'map.route.optionFallback': '路線方案',
    'map.route.optionsAria': '路線方案',
    'map.route.origin': '起點',
    'map.route.planning': '正在根據道路和交通方式規劃候選路線…',
    'map.route.ride': '乘坐 {line}（{direction}方向） {stops}站 {duration}',
    'map.route.road.approach': '接近 {road}',
    'map.route.road.connection': '連接到 {road}',
    'map.route.road.depart': '前往終點',
    'map.route.road.enter': '進入{road}',
    'map.route.selectDestination': '選擇終點',
    'map.route.selectOrigin': '選擇起點',
    'map.route.sort.time': '按時間排序',
    'map.route.sort.fare': '按票價排序',
    'map.route.sort.transfers': '按轉乘次數排序',
    'map.route.sort.walking': '按步行距離排序',
    'map.route.sortAria': '路線排序方式',
    'map.route.copyStatus': '已複製路線連結',
    'map.route.share': '分享路線',
    'map.route.shareOpened': '已開啟系統分享面板',
    'map.route.shareText': '查看 {route} 的路線規劃',
    'map.route.shareTitle': '分享雨城通路線規劃',
    'map.route.shareUnavailable': '分享不可用，請手動複製目前連結。',
    'map.route.stationCount': '{count}站',
    'map.route.stepDetails.collapse': '收起詳細步驟',
    'map.route.stepDetails.expand': '展開詳細步驟',
    'map.route.stepsAria': '選中路線步驟',
    'map.route.summary.directEstimate': '直線估算',
    'map.route.summary.roadEstimate': '沿道路估算',
    'map.route.summary.walking': '步行',
    'map.route.swap': '交換起終點',
    'map.route.traceTitle': '{title} · 初步估算',
    'map.route.transferAction': '{name} 換乘',
    'map.route.transferTitle': '{firstMode}+{secondMode}換乘',
    'map.route.transferWalk': '換乘 步行 {distance} {duration}',
    'map.route.transitNote.default':
      '已按真實線路站序生成候選；站間耗時優先使用舊資料 travelTime，缺失時仍按距離估算。',
    'map.route.transitNote.fallbackRoad':
      '公交/客運站間要求沿道路行駛；目前路網缺失或不連通時不會生成該候選。站間耗時優先使用後台區間用時，其次使用舊資料 travelTime。',
    'map.route.transitNote.road':
      '公交/客運站間只沿舊地圖道路中心線生成，並僅在中心線平面相交處推斷路口；無法連通的候選已排除。站間耗時優先使用後台區間用時，其次使用舊資料 travelTime。',
    'map.route.transitNote.transfer':
      '已按真實線路站序組合一次換乘候選；換乘距離和缺失站間耗時仍為估算。',
    'map.route.turn.left': '左轉',
    'map.route.turn.right': '右轉',
    'map.route.turn.slightLeft': '向左前方',
    'map.route.turn.slightRight': '向右前方',
    'map.route.turn.straight': '直行',
    'map.route.useMapCenter': '使用地圖中心',
    'map.route.walkDirect': '步行直達',
    'map.route.walkAlternativeOne': '步行備選 1',
    'map.route.walkAlternativeTwo': '步行備選 2',
    'map.route.walkFewerTurns': '少轉彎步行',
    'map.route.walkFewestSegments': '少路段步行',
    'map.route.walkFromAccess': '經 {access} 步行至終點 {distance} {duration}',
    'map.route.walkNote.direct': '目前未找到可連通道路圖，步行暫按直線估算。',
    'map.route.walkNote.road':
      '步行預設優先使用舊地圖道路中心線，並只在中心線平面交點換路；無法連通的片段會回退直線估算。',
    'map.route.walkRoadWithDistance': '沿道路步行 {distance} {duration}',
    'map.route.walkStraight': '直線步行',
    'map.route.walkToAccess': '步行至 {access} {distance} {duration}',
    'map.route.walkWithDistance': '步行 {distance} {duration}',
    'map.roadDetail.description': '這是一組從舊地圖道路端點歸併出的線性地點，目前軌跡為近似展示。',
    'map.roadDetail.endpointCount': '端點數量',
    'map.roadDetail.endpointCountValue': '{count} 個',
    'map.roadDetail.traceHighlighted': '已在地圖上高亮近似軌跡',
    'map.roadDetail.traceStatus': '軌跡狀態',
    'metroWayfindingEditor.action.addElement': '新增元素',
    'metroWayfindingEditor.action.cancel': '取消',
    'metroWayfindingEditor.action.clear': '清空',
    'metroWayfindingEditor.action.close': '關閉',
    'metroWayfindingEditor.action.delete': '刪除',
    'metroWayfindingEditor.action.done': '完成',
    'metroWayfindingEditor.action.dragToReorder': '拖曳變更順序',
    'metroWayfindingEditor.action.duplicate': '複製',
    'metroWayfindingEditor.action.duplicateElement': '建立元素副本',
    'metroWayfindingEditor.action.importSign': '匯入導視牌',
    'metroWayfindingEditor.action.moveDown': '下移',
    'metroWayfindingEditor.action.moveLeft': '向左移動',
    'metroWayfindingEditor.action.moveRight': '向右移動',
    'metroWayfindingEditor.action.moveRowDownAria': '下移此行',
    'metroWayfindingEditor.action.moveRowUpAria': '上移此行',
    'metroWayfindingEditor.action.moveUp': '上移',
    'metroWayfindingEditor.action.openProjectLibraryTitle': '版型範本與匯入專案',
    'metroWayfindingEditor.action.openTemplateLibrary': '開啟範本庫',
    'metroWayfindingEditor.action.removeElement': '移除元素',
    'metroWayfindingEditor.action.replaceSign': '取代現有導視牌',
    'metroWayfindingEditor.action.reverse': '反轉',
    'metroWayfindingEditor.action.reverseDisabledVertical': '直式範本不支援反轉順序',
    'metroWayfindingEditor.action.reverseTitle': '反轉導視牌元素順序',
    'metroWayfindingEditor.action.templateLibrary': '範本庫',
    'metroWayfindingEditor.align.center': '置中',
    'metroWayfindingEditor.align.left': '靠左對齊',
    'metroWayfindingEditor.align.right': '靠右對齊',
    'metroWayfindingEditor.aria.addElementToRow': '在{row}新增元素',
    'metroWayfindingEditor.aria.canvas': '地鐵導視牌編排',
    'metroWayfindingEditor.aria.combination': '組合框，{count} 個子元素，縮放 {scale}%',
    'metroWayfindingEditor.aria.defaultLineName': '路線',
    'metroWayfindingEditor.aria.draggableTab': '{label}，可拖曳變更順序',
    'metroWayfindingEditor.aria.emptyState': '開始建立導視牌',
    'metroWayfindingEditor.aria.fixedSpace': '固定空白，{units} 格',
    'metroWayfindingEditor.aria.flexSpace': '彈性空白',
    'metroWayfindingEditor.aria.inlineEditable': '{label}，可內嵌編輯',
    'metroWayfindingEditor.aria.largeTextWithSummary': '大字，{summary}',
    'metroWayfindingEditor.aria.partSuffix': '，{value}',
    'metroWayfindingEditor.aria.removeSegment': '刪除{kind}',
    'metroWayfindingEditor.aria.rowElements': '{row}已新增元素',
    'metroWayfindingEditor.aria.segmentOrdinal': '第 {index} 個{kind}',
    'metroWayfindingEditor.aria.suffixOrdinal': '第 {index} 個下標',
    'metroWayfindingEditor.aria.textElement': '文字，{rows} 列，{alignment}',
    'metroWayfindingEditor.aria.textSegment': '{label}的文字段 {index}',
    'metroWayfindingEditor.color.background': '元素背景色',
    'metroWayfindingEditor.color.custom': '自訂顏色',
    'metroWayfindingEditor.color.customAria': '{label}自訂顏色',
    'metroWayfindingEditor.color.foreground': '元素文字、線條與圖示顏色',
    'metroWayfindingEditor.color.inherit': '跟隨導視牌',
    'metroWayfindingEditor.combination.addAria': '新增組合框子元素',
    'metroWayfindingEditor.combination.addFacility': '設施圖示',
    'metroWayfindingEditor.combination.addSpace': '空格',
    'metroWayfindingEditor.combination.childDuplicateAria': '複製子元素',
    'metroWayfindingEditor.combination.childMoveDownAria': '子元素下移',
    'metroWayfindingEditor.combination.childMoveUpAria': '子元素上移',
    'metroWayfindingEditor.combination.childRemoveAria': '刪除子元素',
    'metroWayfindingEditor.combination.childType': '子元素類型',
    'metroWayfindingEditor.combination.closeAria': '關閉組合框編輯',
    'metroWayfindingEditor.combination.description':
      '支援設施圖示、箭頭、文字、大字和固定或彈性空格，子元素不會超出組合框。',
    'metroWayfindingEditor.combination.editTitle': '編輯組合內容',
    'metroWayfindingEditor.combination.editWithCount': '編輯組合內容（{count}）',
    'metroWayfindingEditor.combination.empty': '組合框尚無子元素。',
    'metroWayfindingEditor.combination.eyebrow': '組合框子元素',
    'metroWayfindingEditor.combination.fill': '組合框填色',
    'metroWayfindingEditor.combination.fillColor': '組合框填色',
    'metroWayfindingEditor.combination.listAria': '組合框子元素清單',
    'metroWayfindingEditor.combination.scale': '組合框縮放倍數',
    'metroWayfindingEditor.combination.stripeColor': '色帶顏色',
    'metroWayfindingEditor.combination.stripePosition': '色帶位置',
    'metroWayfindingEditor.combination.templateHint':
      '「路線編號」內容範本已移至編輯器上方的「插入建議」區域：選取路線後可取代本組合框的子元素，並依顏色填色或色帶樣式套用路線標識色。',
    'metroWayfindingEditor.confirm.clear': '確認清空目前地鐵導視牌的全部元素？',
    'metroWayfindingEditor.direction.down': '向下',
    'metroWayfindingEditor.direction.left': '向左',
    'metroWayfindingEditor.direction.right': '向右',
    'metroWayfindingEditor.direction.up': '向上',
    'metroWayfindingEditor.divider.note': '豎線寬 {width}、高 72，隨導視牌像素單元等比縮放。',
    'metroWayfindingEditor.elementLabel.arrow': '箭頭 · 85 × 85',
    'metroWayfindingEditor.elementLabel.combination': '組合框 · {scale}% · {count} 個子元素',
    'metroWayfindingEditor.elementLabel.divider': '分隔線 · {width} × 72',
    'metroWayfindingEditor.elementLabel.facility': '設施圖示 · 85 × 85',
    'metroWayfindingEditor.elementLabel.largeText': '大字 · 字高 {size}',
    'metroWayfindingEditor.elementLabel.space': '空白元素',
    'metroWayfindingEditor.elementLabel.text': '文字 · {rows} 列',
    'metroWayfindingEditor.elementType.arrow': '箭頭',
    'metroWayfindingEditor.elementType.combination': '組合框',
    'metroWayfindingEditor.elementType.divider': '分隔線',
    'metroWayfindingEditor.elementType.facility': '設施',
    'metroWayfindingEditor.elementType.largeText': '大字',
    'metroWayfindingEditor.elementType.space': '空白',
    'metroWayfindingEditor.elementType.spaceShort': '空格',
    'metroWayfindingEditor.elementType.text': '文字',
    'metroWayfindingEditor.empty.description': '新增第一個元素，或從範本庫載入現成版型。',
    'metroWayfindingEditor.empty.title': '開始建立導視牌',
    'metroWayfindingEditor.error.fileTooLarge': '{name} 超過 {limit} MB，已停止讀取。',
    'metroWayfindingEditor.error.parseFailed': '專案檔案解析失敗。',
    'metroWayfindingEditor.error.tooManyFiles': '一次最多匯入 {count} 個專案檔案。',
    'metroWayfindingEditor.examples.aria': '地鐵導視版型範本',
    'metroWayfindingEditor.examples.categoriesAria': '範本分類',
    'metroWayfindingEditor.examples.categoryEntry': '進站相關',
    'metroWayfindingEditor.examples.categoryExit': '出站相關',
    'metroWayfindingEditor.examples.categoryTransfer': '轉乘相關',
    'metroWayfindingEditor.examples.description': '選擇一個版型開始編輯',
    'metroWayfindingEditor.examples.empty': '目前線網沒有可用的範例範本',
    'metroWayfindingEditor.examples.line': '套用路線',
    'metroWayfindingEditor.examples.loadAria': '載入{remark}，{mode}，{size}',
    'metroWayfindingEditor.examples.station': '套用車站',
    'metroWayfindingEditor.examples.title': '版型範本',
    'metroWayfindingEditor.examples.useTemplate': '使用此範本',
    'metroWayfindingEditor.field.addForegroundStroke': '新增前景色描邊',
    'metroWayfindingEditor.field.addFrame': '新增外框',
    'metroWayfindingEditor.field.alignment': '對齊',
    'metroWayfindingEditor.field.arrow': '箭頭',
    'metroWayfindingEditor.field.backgroundColor': '導視牌底色',
    'metroWayfindingEditor.field.defaultForegroundColor': '預設文字與圖形顏色',
    'metroWayfindingEditor.field.elementType': '元素類型',
    'metroWayfindingEditor.field.exitIconDirection': '出口圖示方向',
    'metroWayfindingEditor.field.facilityIcon': '設施圖示',
    'metroWayfindingEditor.field.iconDirection': '圖示方向',
    'metroWayfindingEditor.field.iconVariant': '圖示變體',
    'metroWayfindingEditor.field.layout': '版型',
    'metroWayfindingEditor.field.rowDivider': '新增列間分隔線',
    'metroWayfindingEditor.field.writingMode': '文字排列',
    'metroWayfindingEditor.fill.color': '顏色填色',
    'metroWayfindingEditor.fill.inverse': '反色填色',
    'metroWayfindingEditor.fill.none': '無填色',
    'metroWayfindingEditor.fill.stripe': '無填色+色帶',
    'metroWayfindingEditor.frame.circle': '圓形',
    'metroWayfindingEditor.frame.fill': '外框填色',
    'metroWayfindingEditor.frame.fillColor': '外框填色',
    'metroWayfindingEditor.frame.none': '無',
    'metroWayfindingEditor.frame.rectangle': '矩形',
    'metroWayfindingEditor.frame.shape': '外框形狀',
    'metroWayfindingEditor.import.description':
      '選擇 JSON 專案檔案，系統會先解析並顯示轉換預覽，確認後再取代目前導視牌。',
    'metroWayfindingEditor.import.dropActive': '放開滑鼠即可匯入專案檔案',
    'metroWayfindingEditor.import.dropHint': '也可以將 JSON 專案檔案拖放到此處',
    'metroWayfindingEditor.import.fileLimits': '檔案限制',
    'metroWayfindingEditor.import.fileLimitsDescription':
      '最多選擇 {count} 個檔案，單一檔案不超過 {size} MB；不同編輯器的專案不能混合匯入。',
    'metroWayfindingEditor.import.selectFiles': '選擇專案檔案',
    'metroWayfindingEditor.import.sourceExternalHint': '外部編輯器',
    'metroWayfindingEditor.import.sourceYct': 'YCT 地鐵導視專案',
    'metroWayfindingEditor.import.sourceYctHint': '本站專案',
    'metroWayfindingEditor.import.supportedSources': '支援來源',
    'metroWayfindingEditor.import.title': '匯入外部導視專案',
    'metroWayfindingEditor.importPreview.closeAria': '關閉匯入預覽',
    'metroWayfindingEditor.importPreview.eyebrow': '專案轉換預覽',
    'metroWayfindingEditor.importPreview.footerSummary': '{count} 個 JSON · 單檔上限 {size} MB',
    'metroWayfindingEditor.importPreview.mode': '轉換方式',
    'metroWayfindingEditor.importPreview.modeSemantic': '僅語意（建議）',
    'metroWayfindingEditor.importPreview.modeSourceStyle': '保留來源樣式',
    'metroWayfindingEditor.importPreview.previewNote':
      '依畫布比例縮小的牌面示意，僅用於確認轉換後的內容與排版',
    'metroWayfindingEditor.importPreview.rowsAria': '待匯入列順序',
    'metroWayfindingEditor.importPreview.source': '來源',
    'metroWayfindingEditor.importPreview.sourceStyle': '來源風格',
    'metroWayfindingEditor.importPreview.targetStyle': '目標風格',
    'metroWayfindingEditor.importPreview.warningCount': '（{count} 處）',
    'metroWayfindingEditor.importPreview.warningsAria': '轉換提醒',
    'metroWayfindingEditor.importPreview.warningsTitle': '轉換提醒',
    'metroWayfindingEditor.largeText.fieldLabel': '大字（字高 {size}）',
    'metroWayfindingEditor.largeText.insertSuffix': '在游標處新增下標',
    'metroWayfindingEditor.option.all': '全部',
    'metroWayfindingEditor.option.doubleRow': '雙列',
    'metroWayfindingEditor.option.entry': '進站',
    'metroWayfindingEditor.option.exit': '出站',
    'metroWayfindingEditor.option.singleRow': '單列',
    'metroWayfindingEditor.option.transfer': '轉乘',
    'metroWayfindingEditor.option.vertical': '直式',
    'metroWayfindingEditor.projectDialog.closeAria': '關閉範本庫與匯入',
    'metroWayfindingEditor.projectDialog.eyebrow': '地鐵導視牌',
    'metroWayfindingEditor.projectDialog.import': '匯入專案',
    'metroWayfindingEditor.projectDialog.source': '專案來源',
    'metroWayfindingEditor.projectDialog.templates': '版型範本',
    'metroWayfindingEditor.projectDialog.title': '範本庫與匯入',
    'metroWayfindingEditor.row.first': '第一列',
    'metroWayfindingEditor.row.second': '第二列',
    'metroWayfindingEditor.segment.boxed': '方框文字',
    'metroWayfindingEditor.segment.boxedShort': '方框',
    'metroWayfindingEditor.segment.chooseLineColor': '選擇路線色（同時填入路線編號）',
    'metroWayfindingEditor.segment.insertBoxed': '在游標處新增方框',
    'metroWayfindingEditor.segment.insertLine': '在游標處新增路線編號',
    'metroWayfindingEditor.segment.line': '路線編號',
    'metroWayfindingEditor.segment.text': '文字段',
    'metroWayfindingEditor.space.fixed': '固定寬度',
    'metroWayfindingEditor.space.flex': '均分剩餘寬度',
    'metroWayfindingEditor.space.flexNote': '所有「均分剩餘寬度」空白元素會均分可用空間。',
    'metroWayfindingEditor.space.mode': '空白方式',
    'metroWayfindingEditor.space.width': '寬度（16 像素間距單位）',
    'metroWayfindingEditor.status.parsing': '解析中',
    'metroWayfindingEditor.status.parsingFiles': '正在解析',
    'metroWayfindingEditor.stripePosition.bottom': '下',
    'metroWayfindingEditor.stripePosition.left': '左',
    'metroWayfindingEditor.stripePosition.right': '右',
    'metroWayfindingEditor.suffix.label': '下標',
    'metroWayfindingEditor.suffix.placeholder': '下標',
    'metroWayfindingEditor.suffix.remove': '刪除此下標',
    'metroWayfindingEditor.suggestion.acceptAria': '採用建議：{suggestion}',
    'metroWayfindingEditor.suggestion.acceptTitle': '採用建議（Tab）',
    'metroWayfindingEditor.tab.childCount': '{count} 個子元素',
    'metroWayfindingEditor.text.addMainRow': '新增主文字列',
    'metroWayfindingEditor.text.addRowAria': '新增文字列',
    'metroWayfindingEditor.text.addSecondaryRow': '新增副文字列',
    'metroWayfindingEditor.text.deleteRow': '刪除文字列',
    'metroWayfindingEditor.text.deleteRowAria': '刪除第 {index} 列',
    'metroWayfindingEditor.text.dynamicFontSize': '動態字高',
    'metroWayfindingEditor.text.main': '主文字',
    'metroWayfindingEditor.text.mainRowLabel': '第 {index} 列主文字內容',
    'metroWayfindingEditor.text.metrics': '主文字 {main} · 副文字 {secondary}',
    'metroWayfindingEditor.text.moveRowDownAria': '第 {index} 列下移',
    'metroWayfindingEditor.text.moveRowUpAria': '第 {index} 列上移',
    'metroWayfindingEditor.text.rowHeader': '第 {index} 列 · {kind}',
    'metroWayfindingEditor.text.rowsAria': '文字列',
    'metroWayfindingEditor.text.secondary': '副文字',
    'metroWayfindingEditor.text.secondaryRowLabel': '第 {index} 列副文字內容',
    'metroWayfindingEditor.toolbar.title': '版型與外觀',
    'metroWayfindingEditor.writing.horizontal': '橫向',
    'metroWayfindingEditor.writing.horizontalText': '橫排',
    'metroWayfindingEditor.writing.vertical': '直式',
    'metroWayfindingEditor.writing.verticalText': '直排',
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
    'operations.featuredNext': '下一條重點資訊',
    'operations.featuredPage': '查看第 {index} 條重點資訊',
    'operations.featuredPages': '重點資訊頁碼',
    'operations.featuredPrevious': '上一條重點資訊',
    'operations.feedAria': '營運資訊列表',
    'operations.itemCount': '{count} 條',
    'operations.latestTitle': '最新資訊',
    'operations.noStrongReminder': '暫無生效的強提醒',
    'operations.noTripReminder': '暫無行程提醒',
    'operations.remindersAria': '強提醒面板',
    'operations.serverStatus.latency': '延遲',
    'operations.serverStatus.offline': '離線',
    'operations.serverStatus.online': '在線',
    'operations.serverStatus.openPlayers': '查看玩家位置',
    'operations.serverStatus.players': '玩家',
    'operations.serverStatus.title': '伺服器狀態',
    'operations.serverStatus.unknown': '狀態未知',
    'operations.serverStatusAria': '伺服器狀態與在線玩家',
    'operations.social.afdian': '愛發電',
    'operations.social.bilibili': 'Bilibili',
    'operations.social.qq': 'QQ 群',
    'operations.social.qqChannel': 'QQ 頻道',
    'operations.social.wechat': '微信',
    'operations.socialAria': '社交與社群連結',
    'operations.startsAt': '開始於 {date}',
    'operations.strongReminder': '強提醒',
    'operations.validUntil': '有效至 {date}',
    'operationRelatedPois.count': '{count} 個 POI',
    'operationRelatedPois.fallback': '地圖地點',
    'operationRelatedPois.title': '相關地點',
    'operationToc.collapse': '收起{title}',
    'operationToc.expand': '展開{title}',
    'operationToc.title': '文章目錄',
    'page.account': '帳號設定',
    'page.ask': '問一問',
    'page.map': '地圖探索',
    'page.offline': '離線',
    'page.operations': '營運資訊',
    'page.scheduleSearch': '班次查詢',
    'page.search': '搜尋',
    'page.services': '更多服務',
    'page.changelog': '版本更新',
    'page.faq': '幫助與常見問題',
    'page.roadMaterials': '路牌物料',
    'page.telegraph': '電報體驗',
    'page.transitMaterials': '公共交通導視',
    'page.transitNetworkHealth': '公共交通網絡健康度',
    'page.ticketOrder': '票務訂單',
    'page.travel': '出行',
    'page.travelScreen': '智運大屏',
    'poiFacility.add': '新增設施',
    'poiFacility.descriptionLabel': '文字描述',
    'poiFacility.descriptionPlaceholder': '例如：一樓東側設有無障礙電梯',
    'poiFacility.hint': '圖示與文字描述',
    'poiFacility.icon.accessible': '無障礙',
    'poiFacility.icon.childCare': '母嬰',
    'poiFacility.icon.elevator': '電梯',
    'poiFacility.icon.escalator': '自動扶梯',
    'poiFacility.icon.info': '資訊',
    'poiFacility.icon.luggage': '行李寄存',
    'poiFacility.icon.medical': '醫療',
    'poiFacility.icon.parking': '停車',
    'poiFacility.icon.pets': '寵物',
    'poiFacility.icon.power': '充電',
    'poiFacility.icon.restaurant': '餐飲',
    'poiFacility.icon.shopping': '購物',
    'poiFacility.icon.smoking': '吸菸區',
    'poiFacility.icon.wc': '衛生間',
    'poiFacility.icon.wifi': '無線網路',
    'poiFacility.iconLabel': '設施圖示',
    'poiFacility.removeAria': '刪除第 {index} 項設施資訊',
    'poiFacility.removeTitle': '刪除設施',
    'poiFacility.title': '設施資訊',
    'quickAction.rideCode': '乘車碼',
    'quickAction.rideCodeLoginRequired': '乘車碼需要登入後使用',
    'quickAction.rideCodeUnavailable': '乘車碼暫不可用，請稍後重試',
    'scheduleStopTable.aria': '各站停站時刻',
    'scheduleStopTable.arrival': '到達',
    'scheduleStopTable.arrivalAria': '{station} 到達時間',
    'scheduleStopTable.departure': '出發',
    'scheduleStopTable.departureAria': '{station} 出發時間',
    'scheduleStopTable.dwell': '停車(分)',
    'scheduleStopTable.dwellAria': '{station} 停車分鐘',
    'scheduleStopTable.empty': '暫無停站時刻',
    'scheduleStopTable.station': '站點',
    'scheduleStopTable.stop': '停站',
    'scheduleStopTable.stopAria': '{station} 是否停站',
    'globalSearch.action.ask': '問一問',
    'globalSearch.action.askThis': '把這個問題交給問一問',
    'globalSearch.action.clearInput': '清空輸入',
    'globalSearch.action.close': '關閉搜尋',
    'globalSearch.action.newConversation': '新對話',
    'globalSearch.actionLabel': '可以直接',
    'globalSearch.action.open': '全站搜尋',
    'globalSearch.action.revert': '改回搜尋',
    'globalSearch.action.search': '搜尋',
    'globalSearch.action.send': '傳送',
    'globalSearch.assistant.answerTitle': '問一問',
    'globalSearch.assistant.clear': '清除 Key',
    'globalSearch.assistant.configure': '設定 Key',
    'globalSearch.assistant.copy': '複製回答',
    'globalSearch.assistant.copied': '已複製',
    'globalSearch.assistant.disclaimer': '回答由你設定的模型產生，請以站內引用為準。',
    'globalSearch.assistant.error': '問一問暫時沒有回傳結果，先給你站內資料。',
    'globalSearch.assistant.followUps': '繼續追問',
    'globalSearch.assistant.followUpsLoading': '正在準備追問建議…',
    'globalSearch.assistant.followUpsUnavailable': 'AI 追問建議暫時不可用。',
    'globalSearch.assistant.key': 'API Key',
    'globalSearch.assistant.keyPlaceholder': '貼上你的 API Key',
    'globalSearch.assistant.model': '模型',
    'globalSearch.assistant.needsKey': '設定模型 Key 後可使用問一問',
    'globalSearch.assistant.networkError': '網路連線失敗，請檢查網路後重試。',
    'globalSearch.assistant.provider': '模型提供商',
    'globalSearch.assistant.references': '引用與入口',
    'globalSearch.assistant.retry': '重新回答',
    'globalSearch.assistant.save': '儲存並提問',
    'globalSearch.assistant.setupDescription':
      'Key 只儲存在目前瀏覽器工作階段，關閉分頁後失效；本站不記錄。',
    'globalSearch.assistant.setupTitle': '設定問一問',
    'globalSearch.assistant.stop': '停止回答',
    'globalSearch.assistant.streaming': '正在回答…',
    'globalSearch.capability.account': '開啟帳號設定',
    'globalSearch.capability.faq': '查看說明與常見問題',
    'globalSearch.capability.map': '開啟地圖',
    'globalSearch.capability.operations': '查看營運資訊',
    'globalSearch.capability.rmp': '開啟 RMP 匯入入口',
    'globalSearch.capability.roadMaterials': '開啟路牌物料',
    'globalSearch.capability.schedule': '開啟班次查詢',
    'globalSearch.capability.transitMaterials': '開啟公共交通導視',
    'globalSearch.docsFallback': '先依站內資料找到這些',
    'globalSearch.docsFallbackEmpty':
      '站內資料暫時沒有直接答案，可以換個說法，或查看說明與常見問題。',
    'globalSearch.easterEgg.close': '關閉',
    'globalSearch.easterEgg.description':
      '圖示裡的小人是新光 2019 年 12 月手繪的，後來被照著畫成表情包，又被重畫成問一問的線描和填充兩版。',
    'globalSearch.easterEgg.hint': '想找原帖，可以在 B 站和酷安搜新光和題海散人。',
    'globalSearch.easterEgg.title': '關於問一問',
    'globalSearch.emptyHint': '輸入地點、班次、公告，或直接說出你的需求',
    'globalSearch.liveResults': '即時結果',
    'globalSearch.mode.ask': '問一問',
    'globalSearch.mode.search': '搜尋',
    'globalSearch.noMatch': '沒有找到符合結果',
    'globalSearch.pageDisabled': '問一問入口已在設定中關閉，可在帳號設定裡重新開啟。',
    'globalSearch.placeholder': '搜尋地點、班次、資訊，或直接提問…',
    'globalSearch.placeholderAsk': '描述你的問題，Enter 傳送…',
    'globalSearch.resultCount': '共 {count} 筆結果',
    'globalSearch.searchAll': '在全站搜尋「{query}」',
    'globalSearch.status.askReady': '已切到問一問 · Enter 傳送',
    'globalSearch.status.askSoon': '問一問將在接入模型後支援對話，現在先依站內資料回答',
    'globalSearch.status.loadingData': '正在載入站內資料…',
    'globalSearch.status.searching': '正在搜尋…',
    'globalSearch.suggestion.account': '乘車碼打不開怎麼辦',
    'globalSearch.suggestion.aiLoading': '正在結合目前頁面產生推薦項…',
    'globalSearch.suggestion.aiOff': '目前使用站內資料產生推薦項。',
    'globalSearch.suggestion.aiSettings': '開啟 AI 推薦',
    'globalSearch.suggestion.aiUnavailable': 'AI 推薦項暫時不可用，已改用站內資料。',
    'globalSearch.suggestion.highlightLine': '這條線附近的轉乘站有哪些？',
    'globalSearch.suggestion.highlightMarker': '{name}附近有什麼？',
    'globalSearch.suggestion.highlightStation': '{name}有哪些設施？',
    'globalSearch.suggestion.operations': '颱風期間停運通知',
    'globalSearch.suggestion.refresh': '換一批',
    'globalSearch.suggestion.route': '明天去臨東港怎麼走',
    'globalSearch.suggestion.schedule': '查明天去臨東港的船',
    'globalSearch.suggestion.thisPage': '這個頁面怎麼用？',
    'globalSearch.suggestion.title': '你可以試試',
    'globalSearch.title': '搜尋與問一問',
    'globalSearch.unavailable': '部分資料暫不可用',
    'globalSearch.viewAll': '查看全部結果',
    'search.open': '搜尋',
    'shortcut.acceptSuggestion': '採納補全建議',
    'shortcut.adminReview': '後台審核清單',
    'shortcut.close': '關閉快捷鍵',
    'shortcut.deleteSelected': '刪除目前選取的節點或元素',
    'shortcut.dismissLayers': '逐層關閉地圖浮層',
    'shortcut.duplicateElement': '複製選取元素',
    'shortcut.editor': '編輯器',
    'shortcut.exportProject': '匯出工程檔案',
    'shortcut.firstLastSection': '跳到首章節或末章節',
    'shortcut.focusMapSearch': '聚焦地圖搜尋',
    'shortcut.focusScheduleSearch': '聚焦時刻表搜尋',
    'shortcut.global': '全域',
    'shortcut.globalSearch': '開啟全域搜尋',
    'shortcut.holdCtrl': '長按 Ctrl',
    'shortcut.insertAppend': '追加插入',
    'shortcut.insertNearest': '就近插入',
    'shortcut.insertPrepend': '反向追加插入',
    'shortcut.lineEditor': '線路地圖編輯器',
    'shortcut.lineEditor.toolMove': '移動工具',
    'shortcut.lineEditor.toolPan': '拖移工具',
    'shortcut.lineEditor.toolStation': '站點工具',
    'shortcut.lineEditor.toolWaypoint': '途經點工具',
    'shortcut.listBulk': '對所選項目執行批次操作',
    'shortcut.listNavigate': '上下移動清單項目',
    'shortcut.listOpen': '開啟目前項目詳情',
    'shortcut.listSelect': '選取或取消目前項目',
    'shortcut.map': '地圖',
    'shortcut.moveElement': '調整選取元素的列內順序',
    'shortcut.openMenu': '快捷鍵提示',
    'shortcut.openTemplateLibrary': '開啟範本庫或匯入專案',
    'shortcut.documentToc': '長文目錄',
    'shortcut.planFocusedMarker': '查找前往目前標記點的路線',
    'shortcut.planJourney': '規劃行程',
    'shortcut.previewMaterial': '產生或更新預覽',
    'shortcut.redo': '重做',
    'shortcut.resetFilters': '清空篩選條件',
    'shortcut.resetMapView': '回到預設地圖視圖',
    'shortcut.reverseElements': '反轉元素順序',
    'shortcut.save': '儲存',
    'shortcut.saveAndBack': '儲存並返回',
    'shortcut.searchNearby': '搜尋目前地點附近',
    'shortcut.searchResults': '在搜尋結果間移動',
    'shortcut.sections': '在章節間跳轉',
    'shortcut.swapRouteEndpoints': '交換路線起終點',
    'shortcut.switchDataSource': '切換手動/線路資料來源',
    'shortcut.switchRow': '切換選取列（雙列版式）',
    'shortcut.switchTemplate': '切換樣式範本',
    'shortcut.title': '鍵盤快捷鍵',
    'shortcut.toggleFavorite': '收藏或取消收藏目前地點',
    'shortcut.toggleLayers': '開啟或關閉圖層面板',
    'shortcut.toggleNavigation': '展開或收合側邊導覽',
    'shortcut.travel': '旅行與時刻表',
    'shortcut.undo': '復原',
    'shortcut.wayfinding': '導視與材料工作台',
    'settings.accent.gray': '灰色',
    'settings.accent.green': '青綠',
    'settings.accent.label': '強調色',
    'settings.accent.ldpass': '跟隨臨東通',
    'settings.accent.red': '紅色',
    'settings.appearanceLanguage': '外觀與語言',
    'settings.assistant.allPages': '在所有頁面顯示搜尋與問一問入口',
    'settings.assistant.allPagesNote':
      '開啟後，二級頁面頂欄也會顯示入口按鈕，方便觸控使用者；一級頁面始終保留入口。',
    'settings.assistant.aiSuggestions': '使用 AI 產生推薦項',
    'settings.assistant.aiSuggestionsNote':
      '開啟後會結合目前頁面內容，用你設定的模型產生推薦項；關閉時只用站內資料產生。',
    'settings.assistant.clear': '清除 Key',
    'settings.assistant.enabled': '啟用搜尋與問一問',
    'settings.assistant.enabledNote': '關閉後會隱藏所有入口並停用快速鍵；已儲存的 Key 仍會保留。',
    'settings.assistant.encryptionNote': 'Key 會加密儲存在本機，仍請勿在公共裝置儲存。',
    'settings.assistant.group': '搜尋與問一問',
    'settings.assistant.configure': '設定模型與 MCP',
    'settings.assistant.configTitle': '搜尋與問一問設定',
    'settings.assistant.configDescription': '設定模型 Key 與 MCP 入口。',
    'settings.assistant.key': 'API Key',
    'settings.assistant.keyPlaceholder': '貼上你的 API Key',
    'settings.assistant.model': '模型',
    'settings.assistant.modelNote': '模型名稱可能隨服務商更新，可直接輸入目前可用的模型名稱。',
    'settings.assistant.notConfigured': '未設定',
    'settings.assistant.provider': '模型提供商',
    'settings.assistant.save': '儲存設定',
    'settings.assistant.saved': '已設定',
    'settings.assistant.savedEncrypted': '已加密儲存',
    'settings.assistant.savedSession': '僅本次工作階段',
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
    'settings.material.advanced': '透光',
    'settings.material.balanced': '均衡',
    'settings.material.group': '介面材質',
    'settings.material.label': '材質模式',
    'settings.material.performance': '簡約',
    'settings.material.thickness': '透光材質厚度',
    'settings.material.thicknessValue': '{value}%',
    'settings.motion.full': '開啟',
    'settings.motion.group': '動態效果',
    'settings.motion.label': '動態',
    'settings.motion.reduced': '關閉',
    'settings.motion.system': '跟隨系統',
    'settings.mobileActionRail.disabled': '已關閉',
    'settings.mobileActionRail.enabled': '已開啟',
    'settings.mobileActionRail.group': '側邊操作欄',
    'settings.mobileActionRail.label': '側邊操作欄',
    'settings.mobileActionRail.left': '左側',
    'settings.mobileActionRail.note':
      '僅在行動端（寬度 ≤ 760px）生效。開啟後，頂部操作、標題列按鈕、底部導覽與地圖工具列會收納到側邊；空間不足時自動收進「更多」選單。',
    'settings.mobileActionRail.position': '操作欄位置',
    'settings.mobileActionRail.right': '右側',
    'settings.mobileActionRail.topOffset': '頂端邊距',
    'settings.mobileActionRail.topOffsetValue': '{value}px',
    'mobileActionRail.aria': '側邊操作欄',
    'mobileActionRail.more': '更多',
    'mobileActionRail.overflowAria': '更多操作',
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
    'materialStudio.history': '物料歷史',
    'materialStudio.preview': '預覽',
    'materialStudio.updatePreview': '更新預覽',
    'materialStudio.submitReview': '提交審核',
    'materialStudio.submitReviewManualHint': '提交審核；審核通過後可下載無水印圖片',
    'materialStudio.exportProject': '匯出工程檔案',
    'materialStudio.download': '下載圖片',
    'materialStudio.downloadWatermarkFree': '下載無水印圖片',
    'materialStudio.loginRequired': '登入後可提交審核並下載無水印圖片。',
    'materialStudio.serverUnverified': '伺服器帳號未驗證',
    'materialStudio.serverUnverifiedHint': '請在帳號設定中驗證伺服器帳號後下載無水印圖片',
    'materialStudio.loginRemoveWatermark': '登入去水印',
    'materialStudio.reviewRequired': '去水印需審核',
    'materialStudio.templateReadFailed': '無法讀取物料範本。',
    'materialStudio.noTemplates': '當前沒有可用範本。',
    'materialStudio.workspaceUnavailable': '物料工作臺暫時不可用。',
    'materialStudio.exportOnlyManual': '只有手動編輯的地鐵導視牌可以匯出工程檔案。',
    'materialStudio.offlineBlocked': '當前處於離線狀態，此操作需要連線。',
    'materialStudio.noSyncTemplate': '當前沒有可同步的範本。',
    'materialStudio.serverSubmitOnlineOnly': '伺服器資料模式的草稿只能在線提交。',
    'materialStudio.loginFirst': '請先登入。',
    'materialStudio.localSyncFailed': '本機草稿同步失敗。',
    'materialStudio.localSyncedSubmitHint': '本機草稿已同步，仍需連線提交審核。',
    'materialStudio.networkError': '網路錯誤。',
    'materialStudio.localSyncNetworkError': '本機草稿同步時發生網路錯誤。',
    'materialStudio.noProjectStations': '匯入專案中沒有可選擇的站點。',
    'materialStudio.selectServerStation': '請先選擇伺服器公車站。',
    'materialStudio.selectProjectLine': '請先選擇至少一條當前圖上方向的專案線路。',
    'materialStudio.selectDirectionLine': '請先選擇至少一條同方向線路。',
    'materialStudio.selectServerLine': '請先選擇伺服器線路。',
    'materialStudio.selectServerPlace': '請先選擇伺服器地點。',
    'materialStudio.selectCoordinate': '請先選擇路牌安裝座標。',
    'materialStudio.selectLinkedMode': '請先選擇{mode}。',
    'materialStudio.previewFailed': '生成預覽失敗。',
    'materialStudio.previewNetworkError': '生成預覽時發生網路錯誤。',
    'materialStudio.noSubmittableTemplate': '當前沒有可提交的範本。',
    'materialStudio.saveCustomFailed': '無法儲存自訂物料。',
    'materialStudio.savedSubmitFailed': '物料已儲存，但提交審核失敗。',
    'materialStudio.submitNetworkError': '提交審核時發生網路錯誤。',
    'materialStudio.downloadFailed': '下載物料失敗。',
    'materialStudio.downloadNetworkError': '下載物料時發生網路錯誤。',
    'materialStudio.downloadPreviewNetworkError': '下載帶水印預覽時發生網路錯誤。',
    'materialStudio.selectTemplateAndMode': '請先選擇範本和{mode}。',
    'materialStudio.serverVerifiedDownloadHint':
      '驗證伺服器帳號後才能下載無水印圖片，已改為下載帶水印預覽。',
    'materialStudio.operationBusy': '當前操作尚未完成，請稍候。',
    'materialStudio.modeNoReviewNeeded': '{mode}模式無需提交審核。',
    'materialStudio.localDraft': '本機草稿',
    'materialStudio.workspaceEyebrow': '物料工作臺',
    'materialStudio.syncLocalDraft': '同步本機草稿',
    'materialStudio.templates': '範本',
    'materialStudio.networkData': '線網資料',
    'materialStudio.online': '在線',
    'materialStudio.offline': '離線',
    'materialStudio.dimensions': '尺寸',
    'materialStudio.dataSource': '資料來源',
    'materialStudio.manualInput': '手動輸入',
    'materialStudio.roadTitle': '路牌物料生成',
    'materialStudio.transitTitle': '公共交通導視物料生成',
    'materialStudio.serverNetwork': '伺服器線網',
    'materialStudio.sampleProject': '示例專案',
    'materialStudio.importedProject': '匯入專案',
    'materialStudio.projectStation': '專案站點',
    'materialStudio.projectCurrentStation': '專案當前站',
    'materialStudio.variant': '版式',
    'materialStudio.group.busStop': '公車站牌',
    'materialStudio.group.busStopHorizontal': '公車站牌（橫版線路詳情）',
    'materialStudio.group.metroLineMap': '地鐵橫式線路圖',
    'materialStudio.group.layout': '版式',
    'materialStudio.group.style': '樣式',
    'materialStudio.layout.lineMap': '線路圖',
    'materialStudio.layout.stationName': '站名',
    'materialStudio.layout.direction': '方向',
    'materialStudio.layout.busTerminal': '始發終到',
    'materialStudio.layout.busOverview': '線路概覽',
    'materialStudio.layout.busDetail': '線路詳情',
    'materialStudio.projectLineCount': '{count} 條專案線路',
    'materialStudio.busLineCount': '{count} 條公車線路',
    'materialStudio.stationProjectLines': '當前站點的專案線路',
    'materialStudio.projectLines': '專案線路',
    'materialStudio.mapDrivingDirection': '圖上行車方向',
    'materialStudio.roadDrivingDirection': '道路行車方向',
    'materialStudio.stationProperties': '站點屬性',
    'materialStudio.originStation': '始發站',
    'materialStudio.terminalStation': '終點站',
    'materialStudio.sameDirectionLines': '同方向線路',
    'materialStudio.singleSelect': '（單選）',
    'materialStudio.maxLines': '（最多 {count} 條）',
    'materialStudio.destinationPending': '終點待維護',
    'materialStudio.directionTo': '往',
    'materialStudio.originAtStation': '當前站始發',
    'materialStudio.terminalAtStation': '當前站終到',
    'materialStudio.noProjectConnection': '當前專案站點在該圖上方向沒有線路連接。',
    'materialStudio.noDirectionLine': '當前方向沒有可用線路。',
    'materialStudio.configureLineName': '配置線路名稱',
    'materialStudio.serverLines': '伺服器線路',
    'materialStudio.stationsCount': '{count} 站',
    'materialStudio.notOpened': '未開通',
    'materialStudio.serverStations': '伺服器站點',
    'materialStudio.searchServerPlace': '搜尋伺服器地點',
    'materialStudio.serverPlaces': '伺服器地點',
    'materialStudio.coordinateX': '安裝座標 X',
    'materialStudio.coordinateZ': '安裝座標 Z',
    'materialStudio.pickCoordinateHint': '在伺服器地圖預覽中點選路牌安裝座標',
    'materialStudio.clickMapCoordinate': '點擊地圖確定安裝座標 · X {x} / Z {z}',
    'materialStudio.fillCoordinateFirst': '請填寫安裝座標後在地圖中微調',
    'materialStudio.previewAria': '物料預覽',
    'materialStudio.previewAlt': '{title}預覽',
    'materialStudio.closePreview': '關閉預覽',
    'materialStudio.historyTitle': '我的物料歷史',
    'materialStudio.historyHint': '已提交的自訂物料會保留在這裡，審核通過後可隨時下載。',
    'materialStudio.closeHistory': '關閉物料歷史',
    'materialStudio.submittedAt': '提交於 {time}',
    'materialStudio.reviewedAt': '審核於 {time}',
    'materialStudio.noSubmittedYet': '還沒有提交過自訂物料。',
    'materialStudio.previewWatermark': '預覽含水印',
    'materialStudio.updating': '更新中',
    'materialStudio.noPreviewYet': '尚未生成預覽',
    'materialStudio.signHeight': '導視牌高度（128 像素格數）',
    'materialStudio.signLength': '導視牌長度（128 像素格數）',
    'materialStudio.signWidth': '導視牌寬度（128 像素格數）',
    'materialStudio.widthMeters': '寬度（米）',
    'materialStudio.heightMeters': '高度（米）',
    'materialStudio.alignmentUnit': '對齊單位（像素）',
    'materialStudio.alignToMapSize': '對齊到整數地圖畫尺寸',
    'materialStudio.firstBus': '首班車',
    'materialStudio.lastBus': '末班車',
    'materialStudio.projectNoTimeHint': '專案資料不含營運時間，留空則不顯示這一行。',
    'materialStudio.pleaseSelect': '請選擇',
    'materialStudio.colorPaletteAria': '{label}色板',
    'materialStudio.colorHexAria': '{label}十六進制顏色',
    'materialStudio.orientationRight': '向圖右',
    'materialStudio.orientationLeft': '向圖左',
    'materialStudio.orientationUp': '向圖上',
    'materialStudio.orientationDown': '向圖下',
    'materialStudio.draftStatus.draft': '草稿',
    'materialStudio.draftStatus.pending_review': '待審核',
    'materialStudio.draftStatus.approved': '已通過',
    'materialStudio.draftStatus.rejected': '已駁回',
    'materialStudio.syncStatus.pending': '待同步',
    'materialStudio.syncStatus.syncing': '同步中',
    'materialStudio.syncStatus.synced': '已同步',
    'materialStudio.syncStatus.conflict': '有衝突',
    'materialStudio.syncStatus.failed': '同步失敗',
    'materialStudio.emptyFields': '未填寫欄位內容',
    'materialStudio.watermarkedPreviewSuffix': '-帶水印預覽',
    'telegraph.stage.header': '填寫報頭',
    'telegraph.stage.recipient': '填寫收報資訊',
    'telegraph.stage.code': '列印電碼',
    'telegraph.stage.message': '列印電文',
    'telegraph.stage.footer': '列印報尾',
    'telegraph.stage.stamp': '蓋電報戳',
    'telegraph.stage.envelope': '裝入信封',
    'telegraph.newLetter': '再寫一封',
    'telegraph.history': '歷史記錄',
    'telegraph.startWriting': '開始填寫',
    'telegraph.replayAnimation': '重播動畫',
    'telegraph.continueScroll': '繼續捲動',
    'telegraph.continueScrollStart': '繼續捲動，開始填寫',
    'telegraph.simulateSend': '模擬拍發',
    'telegraph.skipAnimation': '略過動畫',
    'telegraph.continueConfirm': '繼續捲動，進入確認拍發',
    'telegraph.province': '省',
    'telegraph.city': '市',
    'telegraph.county': '縣',
    'telegraph.otherLocation': '其他收報地點',
    'telegraph.recipientInfo': '收報資訊',
    'telegraph.body': '電報內文',
    'telegraph.senderName': '發報人姓名或訪客 IP',
    'telegraph.senderAddress': '發報人地址',
    'telegraph.senderLock': '登入後可修改發報人資訊',
    'telegraph.billableGrids': '計費格數',
    'telegraph.amount': '報費詳情',
    'telegraph.billingRule': '連續字母/數字每 5 個一格',
    'telegraph.cellRecipient': '收報資訊',
    'telegraph.cellBody': '電報內文',
    'telegraph.noCellSelected': '當前格：未選擇',
    'telegraph.flipEnvelope': '翻轉信封',
    'telegraph.flipToFront': '翻到信封正面',
    'telegraph.flipToBack': '翻到信封背面',
    'telegraph.openEnvelope': '開啟信封',
    'telegraph.insertEnvelope': '裝入信封',
    'telegraph.envelopeFront': '電報信封正面',
    'telegraph.envelopeBack': '電報信封背面',
    'telegraph.openEnvelopeView': '開啟信封檢視收報紙',
    'telegraph.insertReceivePaper': '將收報紙裝入信封',
    'telegraph.receivePaper': '收報紙',
    'telegraph.sendPaper': '發報紙',
    'telegraph.switchPaper': '切換紙張',
    'telegraph.switchToSend': '切換到發報紙',
    'telegraph.switchToReceive': '切換到收報紙',
    'telegraph.envelopeFlip': '信封翻面',
    'telegraph.code': '電碼',
    'telegraph.audio': '音訊',
    'telegraph.sendPaperTemplate': '電報發報紙範本',
    'telegraph.sendPaperPreview': '電報發報紙預覽',
    'telegraph.enterDestination': '請先填寫收報地點。',
    'telegraph.enterRecipient': '請先填寫收報人資訊。',
    'telegraph.enterBody': '請先填寫電報內容。',
    'telegraph.recipientOverflow': '收報資訊超過範本可容納的 {count} 格。',
    'telegraph.bodyOverflow': '電報內容超過範本可容納的 {count} 格。',
    'telegraph.unsupported': '暫不支援這些字元：{chars}',
    'telegraph.envelopeDone': '電報已列印並裝入信封。',
    'telegraph.skippedDone': '已略過動畫，電報已裝入信封。',
    'telegraph.imageFailed': '電報圖片生成失敗。',
    'telegraph.sendPaperFile': '發報紙',
    'telegraph.receivePaperFile': '收報紙',
    'telegraph.imageDownloadFailed': '電報圖片下載失敗。',
    'telegraph.codeFile': '電報電碼',
    'telegraph.filePrefix': '電報',
    'telegraph.welcomeTitle': '趁「慢電報」還未消失，將記憶拍給自己',
    'telegraph.welcomeP1': '一支影片，讓人們發現了電報這個塵封已久的通訊業務。',
    'telegraph.welcomeP2':
      '如今，就算發報視窗全中國僅剩一個，人們仍願為一封還需編發、蓋章、封裝的慢電報留出時間。',
    'telegraph.welcomeP3':
      '那麼現在，就在這裡親手寫下你的訊息，讓它沿著塵封的路線，延續你的思緒和情感……',
    'telegraph.confirmTitle': '確認發報內容',
    'telegraph.closeConfirm': '關閉確認視窗',
    'telegraph.destination': '收報地點',
    'telegraph.recipient': '收報人',
    'telegraph.notFilled': '未填寫',
    'telegraph.confirmBody': '報文內容',
    'telegraph.confirmHint': '確認後將開始填寫、列印、摺疊並裝入信封的模擬動畫。',
    'telegraph.backEdit': '返回修改',
    'telegraph.confirmSend': '確認並拍發',
    'telegraph.localHistory': '本機歷史',
    'telegraph.deleteHistory': '刪除歷史記錄',
    'telegraph.unnamed': '未命名電報',
    'telegraph.noHistory': '還沒有本機歷史記錄。',
    'telegraph.cellAria': '{label} · 第{count}格',
    'telegraph.toolbarAria': '電報操作',
    'transitLineBrowser.filterAria': '線路篩選',
    'transitLineBrowser.listAria': '線路列表',
    'transitLineBrowser.modeRailway': '地方鐵路',
    'transitLineBrowser.summaryAria': '舊線路資料摘要',
    'transitHealth.dimension.topology': '拓撲銜接',
    'transitHealth.dimension.operations': '營運時間',
    'transitHealth.dimension.scale': '空間規模',
    'transitHealth.dimension.places': '地點覆蓋',
    'transitHealth.dimension.demand': '需求代理',
    'transitHealth.dimension.data_quality': '資料品質',
    'transitHealth.analysisEyebrow': '線網規劃分析',
    'transitHealth.subtitle':
      '綜合已發布線路拓撲、營運時間、道路節點與分類地點密度。潛在需求為規劃代理值，不能替代真實客流、班次、運能和成本資料。',
    'transitHealth.onlineSnapshot': '在線快照',
    'transitHealth.offlineSnapshot': '離線快照',
    'transitHealth.dataTime': '資料時間',
    'transitHealth.noLines': '尚無已發布的公共交通線路，暫時不能生成網路統計。',
    'transitHealth.filterAria': '依運輸方式篩選',
    'transitHealth.modeLegend': '運輸方式',
    'transitHealth.scopeCurrent': '當前統計範圍：',
    'transitHealth.scopeAll': '全部運輸方式',
    'transitHealth.demandWithLines': '需求分析納入已有線路',
    'transitHealth.demandPotentialOnly': '僅分析地點潛力',
    'transitHealth.mLines': '線路數',
    'transitHealth.mTopologyNote': '{count} 條形成連續站段',
    'transitHealth.mStations': '站點數',
    'transitHealth.mLocatedNote': '{rate} 可定位',
    'transitHealth.mLength': '線網長度',
    'transitHealth.mLocatedSegNote': '{count} 個已定位站段估算',
    'transitHealth.mCoverage': '時刻覆蓋',
    'transitHealth.mScheduledNote': '{scheduled}/{total} 條線路',
    'transitHealth.mServiceSpan': '平均營運時長',
    'transitHealth.mLateNote': '{count} 條服務至 22:00 後',
    'transitHealth.mPlaceCoverage': '規劃地點覆蓋',
    'transitHealth.mPlacesNote': '{covered}/{total} 個地點',
    'transitHealth.mRoadCoverage': '道路節點覆蓋',
    'transitHealth.mRoadsNote': '{count} 條道路樣本',
    'transitHealth.mDemandAttainment': '需求達成率',
    'transitHealth.mPotentialDemand': '潛在需求總量',
    'transitHealth.mAttainedNote': '{attained}/{total} 加權需求已觸達',
    'transitHealth.mPotentialHint': '依真實分類地點密度加權，不考慮線路覆蓋',
    'transitHealth.chartEyebrow': '統計圖',
    'transitHealth.chartTitle': '規模、營運與覆蓋',
    'transitHealth.locatedSampleHint': '地點與距離僅使用已定位站點樣本',
    'transitHealth.opEyebrow': '營運方',
    'transitHealth.opTitle': '指標與排行',
    'transitHealth.opCountHint': '共 {count} 個營運方 · 點擊欄名排序',
    'transitHealth.opTableNote':
      '公車線路由全網統一分配，營運商的連通片區數僅作歸屬統計，不作為脫網或強制接駁判斷依據。',
    'transitHealth.colOperator': '營運方',
    'transitHealth.colStations': '站點',
    'transitHealth.colStationsTitle': '依該營運方線路覆蓋的穩定站點 ID 去重',
    'transitHealth.colLines': '線路',
    'transitHealth.colAvgConnectivity': '平均連接度',
    'transitHealth.colConnectivityTitle': '該營運方站點在全網中直接相鄰的不同站點數平均值',
    'transitHealth.colConnectivityWeight': '連接度權重',
    'transitHealth.colWeightTitle': '相鄰站間路段依承載的不同線路數加權後的平均值',
    'transitHealth.colLinesPerSegment': '同路段線路數',
    'transitHealth.colSharedSegments': '共線路段',
    'transitHealth.colScheduleCoverage': '時刻覆蓋',
    'transitHealth.colServiceSpan': '平均營運時長',
    'transitHealth.opComponentsNote': '{count} 個片區 · {transfer} 個跨營運方站點',
    'transitHealth.rankLabel': '第 {rank} 名',
    'transitHealth.methodEyebrow': '口徑',
    'transitHealth.methodTitle': '統計項目與分析來源',
    'transitHealth.noMockHint': '不使用模擬客流',
    'transitHealth.dmTopology': '拓撲連接',
    'transitHealth.dmTopologyDetail':
      '依連續站序形成無向邊，計算連接度、共線路段、轉乘站與連通片區。',
    'transitHealth.dmOperations': '營運時間',
    'transitHealth.dmOperationsDetail':
      '優先讀取首末班，缺失時使用發車時刻表邊界；跨午夜線路按次日計算。',
    'transitHealth.dmScale': '線網空間規模',
    'transitHealth.dmScaleDetail':
      '以站名和運輸方式綁定地圖座標，估算站段直線長度、站間距與覆蓋範圍。',
    'transitHealth.dmPlaces': '地點覆蓋',
    'transitHealth.dmPlacesDetail':
      '統計居住、就業、教育、醫療、生活、文體和對外交通地點進入站點服務圈的比例。',
    'transitHealth.dmDemand': '潛在需求代理',
    'transitHealth.dmDemandDetail':
      '可切換純地點聚集或已有線路觸達口徑；需求達成率依分類權重計算，只用於規劃複核，不等同於客流預測。',
    'transitHealth.dmRoads': '道路覆蓋',
    'transitHealth.dmRoadsDetail':
      '以地圖道路節點衡量線網覆蓋邊界；道路節點不是完整道路幾何，不用於精確里程計算。',
    'transitHealth.sugEyebrow': '多維啟發式',
    'transitHealth.sugTitle': '線網優化建議',
    'transitHealth.sugMergedHint': '相同建議已跨營運商合併',
    'transitHealth.sugEmpty': '當前切片沒有觸發預設啟發式閾值；這不代表線路服務品質已經得到驗證。',
    'transitHealth.targetItem': '命中項目',
    'transitHealth.viewAllTargets': '檢視全部 {count} 項',
    'transitHealth.dialogTargetLabel': '命中項目',
    'transitHealth.itemCount': '共 {count} 項',
    'transitHealth.dialogClose': '關閉',
    'transitHealth.dialogCloseAria': '關閉命中項目列表',
    'transitHealth.searchTargets': '搜尋命中項目',
    'transitHealth.searchPlaceholder': '搜尋線路、站點、路段或地點',
    'transitHealth.noMatchedTargets': '沒有匹配的命中項目。',
    'transitHealth.kindOperator': '營運方',
    'transitHealth.kindLine': '線路',
    'transitHealth.kindStation': '站點',
    'transitHealth.kindSegment': '站間路段',
    'transitHealth.kindPlace': '地點',
    'transitHealth.kindCategory': '地點類別',
    'transitHealth.kindRoad': '道路',
    'transitHealth.moreOperators': '等 {count} 家營運方',
    'transitHealth.cModeTitle': '運輸方式構成',
    'transitHealth.cModeSubtitle': '線路數量及其全網占比',
    'transitHealth.cTotalLines': '共 {count} 條線路，{details}',
    'transitHealth.cLinesUnit': '條線路',
    'transitHealth.cHoursTitle': '平均營運時長',
    'transitHealth.cHoursSubtitle': '只統計具有可解析首末時刻的線路',
    'transitHealth.cNoSchedule': '缺少時刻',
    'transitHealth.cPlaceTitle': '分類地點覆蓋',
    'transitHealth.cPlaceSubtitle': '進入站點服務圈的分類地點比例',
    'transitHealth.cPlaceRate': '地點覆蓋率',
    'transitHealth.cPlaceEntered': '個規劃地點進入當前運輸方式的站點服務圈。',
    'transitHealth.cHotspotTitle1': '沿線需求熱點',
    'transitHealth.cHotspotTitle2': '純地點潛在需求中心',
    'transitHealth.cHotspotSub1': '依現有站點觸達的分類地點密度加權',
    'transitHealth.cHotspotSub2': '忽略現有線路，僅依分類地點空間聚集度計算',
    'transitHealth.cDemandRate': '需求達成率',
    'transitHealth.cAttained': '已觸達 {attained} / {total} 加權需求代理值。',
    'transitHealth.cNearbyCount': '{value} · {count} 個地點',
    'transitHealth.cAround': '{place}周邊',
    'transitHealth.cHotspotEmpty': '當前缺少可計算的需求熱點樣本。',
    'transitHealth.cOperatorTitle': '營運方覆蓋規模',
    'transitHealth.cOperatorSubtitle': '依穩定站點 ID 去重，展示站點數前八名',
    'transitHealth.cOperatorBarLabel': '{stations} 站 · {lines} 線',
    'transitNetworkSource.title': '線網資料',
    'transitNetworkSource.origin.sample': 'RMP 畫廊專案',
    'transitNetworkSource.origin.rmp': 'RMP 專案',
    'transitNetworkSource.origin.server': '伺服器',
    'transitNetworkSource.import.own': '匯入自己的 RMP 專案',
    'transitNetworkSource.import.default': '匯入 RMP 專案',
    'transitNetworkSource.import.short': '匯入',
    'transitNetworkSource.import.project': '匯入專案',
    'transitNetworkSource.sourceAria': '線網資料來源',
    'transitNetworkSource.source.server': '伺服器線網',
    'transitNetworkSource.source.loading': '正在載入',
    'transitNetworkSource.source.sample': '範例線網',
    'transitNetworkSource.source.imported': '匯入專案',
    'transitNetworkSource.localDraftName': '本機草稿線網',
    'transitNetworkSource.summary.stationCount': '{count} 站',
    'transitNetworkSource.summary.stationsUnnamed': '{count} 站待補名',
    'transitNetworkSource.summary.stationsNamed': '站名完整',
    'transitNetworkSource.summary.lineCount': '{count} 條線路',
    'transitNetworkSource.summary.edgeCount': '{count} 條連接',
    'transitNetworkSource.summary.source': '來源：RMP 畫廊 ·',
    'transitNetworkSource.status.persisting': '正在暫存',
    'transitNetworkSource.status.persisted': '已暫存',
    'transitNetworkSource.status.gallerySample': '畫廊範例',
    'transitNetworkSource.status.localOnly': '僅本頁',
    'transitNetworkSource.palette.aria': '{count} 種線路配色',
    'transitNetworkSource.action.fillStationNamesAria': '補全 {count} 個未命名站點',
    'transitNetworkSource.action.fillStationNames': '補站名 {count}',
    'transitNetworkSource.action.configureLineNames': '設定專案線路名稱',
    'transitNetworkSource.action.removeImported': '移除已匯入專案',
    'transitNetworkSource.action.cancel': '取消',
    'transitNetworkSource.action.saving': '正在儲存',
    'transitNetworkSource.action.close': '關閉',
    'transitNetworkSource.error.fileTooLarge': 'RMP 專案檔案不能超過 5 MB。',
    'transitNetworkSource.error.notSignedIn': '未登入，目前匯入僅在本頁有效。',
    'transitNetworkSource.error.persistFailed': '無法暫存 RMP 專案。',
    'transitNetworkSource.error.persistFailedLocalOnly': '{message} 目前匯入僅在本頁有效。',
    'transitNetworkSource.error.readFailed': '無法讀取 RMP 專案檔案。',
    'transitNetworkSource.error.deleteFailed': '無法刪除暫存的線網專案。',
    'transitNetworkSource.error.saveLineNamesFailed': '無法儲存線路名稱。',
    'transitNetworkSource.error.saveStationNamesFailed': '無法儲存站點名稱。',
    'transitNetworkSource.error.sampleLoadFailed': '預設範例線網暫時無法載入。',
    'transitNetworkSource.error.sampleLoadFailedHint':
      '{message} 仍可使用伺服器線網或匯入本機專案。',
    'transitNetworkSource.notice.lineNamesSampleLocalOnly': '範例專案的線路名稱調整僅在本頁有效。',
    'transitNetworkSource.notice.lineNamesPendingPersist':
      '線路名稱僅在本頁有效；專案尚未成功暫存。',
    'transitNetworkSource.notice.stationNamesSampleLocalOnly':
      '範例專案的站點名稱調整僅在本頁有效。',
    'transitNetworkSource.notice.stationNamesPendingPersist':
      '站點名稱僅在本頁有效；專案尚未成功暫存。',
    'transitNetworkSource.lineName.title': '設定專案線路名稱',
    'transitNetworkSource.lineName.hintPart1': 'RMP 存檔裡的線路鍵（如 ',
    'transitNetworkSource.lineName.hintPart2': '、',
    'transitNetworkSource.lineName.hintPart3':
      '）只是繪圖用的顏色命名，不是線路名。此處已按線路鍵的編號部分預填（',
    'transitNetworkSource.lineName.hintPart4':
      ' → 2號線），請確認或改為正式名稱；導視牌的「線路編號」範本以這裡填寫的名稱為準。',
    'transitNetworkSource.lineName.primaryAria': '{key}主名稱',
    'transitNetworkSource.lineName.primaryPlaceholder': '主名稱',
    'transitNetworkSource.lineName.secondaryAria': '{key}副名稱',
    'transitNetworkSource.lineName.secondaryPlaceholder': '副名稱',
    'transitNetworkSource.lineName.save': '儲存線路名稱',
    'transitNetworkSource.stationName.title': '補全未命名站點',
    'transitNetworkSource.stationName.nearby': '相鄰：{names}',
    'transitNetworkSource.stationName.nearbyUnavailable': '相鄰站名不可用',
    'transitNetworkSource.stationName.primaryAria': '{id}主站名',
    'transitNetworkSource.stationName.primaryPlaceholder': '主站名',
    'transitNetworkSource.stationName.secondaryAria': '{id}副站名',
    'transitNetworkSource.stationName.secondaryPlaceholder': '副站名',
    'transitNetworkSource.stationName.save': '儲存已填寫站名',
    'transitScreen.legacy': '舊版',
    'transitScreen.summaryAria': '客運大屏資料摘要',
    'transitScreen.upcomingAria': '近期班次',
    'transitScreen.viewTrips': '檢視班次',
    'transitScreen.empty.unavailable': '大屏資料暫不可用',
    'transitScreen.empty.noData': '舊客運大屏資料來源尚未回傳可用資料。',
    'operation.contentTagsAria': '內容標籤',
    'operation.legacyBodyDescription':
      '舊系統主要透過外部連結承載詳情，新版目前只保留標題、摘要和原始入口。',
    'operation.legacyBodyTitle': '這則舊營運訊息沒有獨立正文',
    'operation.legacyImageSource': '舊圖片來源：{url}',
    'operation.openOriginal': '開啟原始內容',
    'operation.originalLink': '原始連結',
    'transitServiceNotice.activeCount': '{count} 則目前提醒',
    'transitServiceNotice.history': '歷史客運提醒',
    'transitServiceNotice.itemCount': '{count} 則',
    'transitServiceNotice.periodRange': '{start} 至 {end}',
    'transitServiceNotice.title': '客運提醒',
    'admin.edit': '編輯',
    'admin.editLine': '編輯線路',
    'admin.editPoi': '編輯 POI',
    'admin.home.title': '管理後台',
    'admin.home.description': '依業務域進入對應後台，帳號頁只保留這個統一入口。',
    'admin.editOperation': '編輯營運訊息',
    'search.category.all': '全部',
    'search.category.lines': '線路',
    'search.category.operations': '營運',
    'search.category.poi': '地圖 POI',
    'search.category.schedules': '班次',
    'search.category.services': '服務',
    'search.category.stations': '站點',
    'search.category.wiki': 'Wiki',
    'search.clear': '清空搜尋',
    'search.emptyPrompt': '輸入關鍵字後搜尋地圖 POI、班次、營運資訊和服務',
    'search.facilityCount': '{count} 項設施',
    'search.loading': '正在搜尋',
    'search.noCategoryResults': '目前分類下暫無符合結果',
    'search.noMatch': '暫無符合「{query}」的結果',
    'search.placeholder': '搜尋地點詳情、班次、營運資訊或服務',
    'search.resultCount': '{count} 項結果',
    'search.results': '搜尋結果',
    'search.resultFilters': '搜尋結果分類',
    'search.resultGroup.lines': '線路',
    'search.resultGroup.operations': '營運資訊',
    'search.resultGroup.poi': '地圖 POI',
    'search.resultGroup.player': '玩家位置',
    'search.resultGroup.schedules': '班次',
    'search.resultGroup.services': '服務與工具',
    'search.resultGroup.social': '社群與社區',
    'search.resultGroup.stations': '站點',
    'search.resultGroup.wiki': '臨東 Wiki',
    'search.social.description': '官方社群與社區入口',
    'search.wiki.loading': '正在檢索臨東 Wiki…',
    'search.wiki.updatedAt': '最後編輯',
    'search.stationExitCount': '{count} 個出入口',
    'search.stopCount': '{count} 站',
    'search.unavailable': '地圖與班次資料暫時均不可用',
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
    'toast.close': '關閉提示',
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
    'travelSchedule.empty.unavailable': '班次資料暫不可用',
    'travelSchedule.empty.noData': '目前沒有可用的統一班次資料。',
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
    'travelSchedule.journey.arrival': '到達 {time}',
    'travelSchedule.journey.availableAll': '全程可訂',
    'travelSchedule.journey.bookJoint': '聯合訂票 · {count} 段',
    'travelSchedule.journey.combining': '組合中…',
    'travelSchedule.journey.direct': '直達',
    'travelSchedule.journey.durationHours': '{hours} 小時 {minutes} 分',
    'travelSchedule.journey.durationMinutes': '{minutes} 分鐘',
    'travelSchedule.journey.editTrip': '編輯班次',
    'travelSchedule.journey.found': '找到 {count} 個方案',
    'travelSchedule.journey.holding': '正在鎖定聯合行程的全部座位',
    'travelSchedule.journey.lineGroupAria': '{operator}線路',
    'travelSchedule.journey.locking': '鎖定中…',
    'travelSchedule.journey.missingEndpoints': '請先填寫起點和終點。',
    'travelSchedule.journey.noneFound': '沒有找到可銜接的班次方案。',
    'travelSchedule.journey.orderCreated': '聯合訂票成功，已建立 {count} 段訂單草稿。',
    'travelSchedule.journey.orderFailed': '聯合訂票失敗。',
    'travelSchedule.journey.partial': '部分行程不可售',
    'travelSchedule.journey.passThrough': '通過不停',
    'travelSchedule.journey.period': '{start} 至 {end}',
    'travelSchedule.journey.planCount': '{count} 個方案',
    'travelSchedule.journey.planFailed': '行程方案查詢失敗。',
    'travelSchedule.journey.planIndex': '方案 {index}',
    'travelSchedule.journey.planning': '正在組合班次方案',
    'travelSchedule.journey.query': '查詢行程方案',
    'travelSchedule.journey.queryOnly': '僅供查詢',
    'travelSchedule.journey.segmentUnavailable': '該方案存在暫不可售的行程段。',
    'travelSchedule.journey.serviceTrip': '{service}班次',
    'travelSchedule.journey.stopCount': '{count} 站',
    'travelSchedule.journey.stopsAria': '{line} 停靠站',
    'travelSchedule.journey.swapEndpoints': '交換起終點',
    'travelSchedule.journey.tbd': '待定',
    'travelSchedule.journey.title': '行程方案',
    'travelSchedule.journey.transferCount': '{count} 次換乘',
    'travelSchedule.journey.transferDetail':
      '{from} → {to} · 約 {minutes} 分鐘（含 {buffer} 分鐘緩衝）',
    'travelSchedule.journey.tripCount': '{count} 個班次',
    'travelSchedule.journey.tripLabel': '{line} 班次 {code}',
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
    'travelSchedule.reminder.detailDeparture': '開車 {time}',
    'travelSchedule.reminder.detailFare': '票價 {fare}',
    'travelSchedule.reminder.detailTrip': '班次 {code}',
    'travelSchedule.reminder.titleWithTime': '{line} {time} 班次',
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
    'travelSchedule.trip.dayOffset': '+{count}天',
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
    'travel.screenDetail.empty': '沒有符合條件的班次',
    'travel.screenDetail.fare': '票價',
    'travel.screenDetail.filterAria': '班次篩選',
    'travel.screenDetail.gate': '檢票口',
    'travel.screenDetail.line': '線路',
    'travel.screenDetail.listAria': '班次列表',
    'travel.screenDetail.noticeAria': '大屏公告',
    'travel.screenDetail.operator': '營運',
    'travel.screenDetail.past': '已過',
    'travel.screenDetail.routes': '線路',
    'travel.screenDetail.runtime': '運行',
    'travel.screenDetail.search': '搜尋班次、線路、車站或檢票口',
    'travel.screenDetail.searchClear': '清空班次搜尋',
    'travel.screenDetail.station': '車站',
    'travel.screenDetail.stationCount': '{count} 站',
    'travel.screenDetail.stationFlowAria': '{line} 停靠站',
    'travel.screenDetail.stations': '車站',
    'travel.screenDetail.summaryAria': '客運大屏資料摘要',
    'travel.screenDetail.timeFilterAria': '時間篩選',
    'travel.screenDetail.title': '班次查詢',
    'travel.screenDetail.total': '全部',
    'travel.screenDetail.trip': '班次',
    'travel.screenDetail.trips': '{shown} / {total} 個班次',
    'travel.screenDetail.upcoming': '即將',
    'travel.services.subtitle': '班次查詢、線路站點、客運展示與後續票務入口',
    'travel.services.title': '出行服務',
    'travel.subtitle': '提醒、班次與後續票務',
    'travel.ticketing.action': '待接入',
    'travel.ticketing.detail': '真實電子票、檢票、退票和乘車碼後續接入臨東通',
    'travel.ticketing.title': '票券與訂單',
    'worldCoordinate.axis': '{axis} 座標',
    'worldCoordinate.footerEmpty': '請先輸入 X/Z 或選擇參考地點；Y 可在上方獨立填寫',
    'worldCoordinate.footerPick': '點擊地圖回填 X/Z · 目前 {coordinate} · Y {y}',
    'worldCoordinate.title': '世界座標',
    'worldCoordinate.yInherited': '繼承預設值',
    'worldCoordinate.yPlaceholder': '留空繼承地圖預設高度',
  },
  en: {
    'account.offlinePackage.area': 'Area {area} blocks',
    'account.offlinePackage.bounds': 'X {minX} to {maxX}, Z {minZ} to {maxZ}',
    'account.offlinePackage.close': 'Close',
    'account.offlinePackage.delete': 'Delete',
    'account.offlinePackage.deleteAria': 'Delete {name}',
    'account.offlinePackage.deleteConfirm': 'Delete offline area "{name}"?',
    'account.offlinePackage.description':
      'Save a rectangular area with Minecraft world coordinates.',
    'account.offlinePackage.empty': 'No custom offline areas yet.',
    'account.offlinePackage.error.emptyArea': 'The offline area needs both width and height.',
    'account.offlinePackage.error.invalidBounds':
      'Enter valid Minecraft X/Z rectangle coordinates.',
    'account.offlinePackage.error.missingName': 'Name this offline area first.',
    'account.offlinePackage.lastRefreshed': 'Last refreshed {time}',
    'account.offlinePackage.listAria': 'Custom offline areas',
    'account.offlinePackage.maxX': 'Max X',
    'account.offlinePackage.maxZ': 'Max Z',
    'account.offlinePackage.minX': 'Min X',
    'account.offlinePackage.minZ': 'Min Z',
    'account.offlinePackage.name': 'Name',
    'account.offlinePackage.namePlaceholder': 'Example: Around University Town',
    'account.offlinePackage.newRange': 'New area',
    'account.offlinePackage.refresh': 'Refresh area',
    'account.offlinePackage.refreshing': 'Refreshing',
    'account.offlinePackage.save': 'Save area',
    'account.offlinePackage.status.baseCacheRefreshed': 'Base cache refreshed',
    'account.offlinePackage.status.refreshFailed': 'Refresh failed',
    'account.offlinePackage.status.registered': 'Queued',
    'account.offlinePackage.status.requestFailed': 'Request failed',
    'account.offlinePackage.status.serverRequested': 'Generation requested',
    'account.offlinePackage.summary.area': '{area} block area',
    'account.offlinePackage.summary.refreshed': '{count} base caches refreshed',
    'account.offlinePackage.summary.total': '{count} custom areas',
    'account.offlinePackage.strategyNote':
      'Custom areas currently store boundaries and refresh public base data. Real tile offline packs still need size limits and generation rules.',
    'account.offlinePackage.title': 'New Offline Area',
    'account.cache.offlineDeletedAll':
      'Deleted the offline area request locally and from your account',
    'account.cache.offlineDeletedLocalOnly':
      'Deleted locally, but the account request could not be deleted',
    'account.cache.offlineRefreshFailed': 'Failed to refresh offline area base data',
    'account.cache.refreshFailed': 'Refresh failed',
    'account.cache.refreshingOfflineBase': 'Refreshing offline area base data',
    'account.error.cacheRefreshFailed': '{url} refresh failed',
    'account.error.offlinePackageRequestFailed': 'Server offline package request failed',
    'account.error.offlineScopeDeleteFailed': 'Failed to delete the account offline area request',
    'account.error.offlineScopeUnavailable': 'Account offline areas are unavailable',
    'account.error.pushPreferenceUnavailable': 'Notification preferences are unavailable',
    'account.error.tripReminderDeleteFailed': 'Failed to delete account reminder copies',
    'account.error.tripRemindersUnavailable': 'Account reminders are unavailable',
    'account.push.insecureContext':
      'This page is not a secure context, so the browser will not allow Push subscriptions',
    'account.push.loginRequired': 'Sign in with Lindongtong first.',
    'account.push.missingKeys': 'The Push subscription returned by the browser is missing keys',
    'account.push.missingPublicKey':
      'Web Push public key is not configured. This device cannot subscribe yet.',
    'account.push.permissionDenied': 'Browser notification permission is not granted',
    'account.push.registerFailed': 'Failed to register the Push device subscription',
    'account.push.revokeFailed': 'Failed to revoke the Push device subscription',
    'account.push.serviceWorkerNotReady':
      'Service Worker is not ready yet. Cannot subscribe to Push.',
    'account.push.unknownHost': 'Unknown service',
    'account.push.unsupported': 'This browser does not support Web Push',
    'account.about.currentVersion': 'Current version: {version}',
    'account.about.github': 'GitHub repository',
    'account.about.mcpCopied': 'MCP endpoint copied',
    'account.about.mcpCopy': 'Copy MCP endpoint',
    'account.about.mcpDescription':
      'The site data behind Ask is also exposed as a read-only MCP server. Add this endpoint in any MCP client that supports Streamable HTTP. The endpoint is anonymous, read-only and never sees your model key.',
    'account.about.mcpTitle': 'MCP endpoint',
    'account.about.title': 'About and Updates',
    'account.about.viewChangelog': 'View version updates',
    'account.auth.adminOperations': 'Content Admin',
    'account.auth.adminPortal': 'Admin Console',
    'account.auth.adminPoi': 'POI Admin',
    'account.auth.adminServices': 'Service Admin',
    'account.auth.adminTransit': 'Transit Admin',
    'account.auth.defaultTitle': 'LDPASS account',
    'account.auth.introConfigured':
      'Sign in with LDPASS to sync history, preferences, and future ticket status.',
    'account.auth.introNotConfigured': 'LDPASS sign-in is not configured.',
    'account.auth.ldpassAccount': 'LDPASS account',
    'account.auth.localAdminLogin': 'Local admin sign-in',
    'account.auth.localAdminLoginHint':
      'Available only for local development and still uses normal API authorization.',
    'account.auth.login': 'Sign in with LDPASS',
    'account.auth.logout': 'Sign out of Yuchengtong',
    'account.auth.readonlyStatus': 'Account status: {status}',
    'account.auth.serverUnverified': 'Server account not verified',
    'account.auth.serverVerified': 'Server account verified',
    'account.auth.serverVerifiedWithName': 'Server account verified: {name}',
    'account.authStatus.ldpassNotConfigured': 'LDPASS sign-in is not configured.',
    'account.authStatus.loggedOut': 'Signed out of the local Yuchengtong session.',
    'account.authStatus.loginSuccess': 'LDPASS sign-in completed.',
    'account.authStatus.readonly': 'This account can only open the read-only account page.',
    'account.authStatus.sessionCookieMissing':
      'Yuchengtong did not receive the shared LDPASS login cookie. Confirm AUTH_COOKIE_DOMAIN=.shangxiaoguan.top is configured in production LDPASS, restart LDPASS, and sign in again.',
    'account.authStatus.sessionError': 'Failed to read the LDPASS session. Try again later.',
    'account.authStatus.sessionUnavailable':
      'Could not read valid account information from LDPASS.',
    'account.authStatus.sessionUnavailableLocalhost':
      'The callback address is localhost/127.0.0.1, so the local site cannot read the shared LDPASS session directly. Use the shared domain for testing, or move the local service to an integrated same-domain test environment.',
    'account.authStatus.stateInvalid': 'Login state validation failed. Start sign-in again.',
    'account.history.action.clearLocal': 'Clear local',
    'account.history.action.manageTrips': 'Manage trips',
    'account.history.action.revokeLegacy': 'Revoke legacy sync',
    'account.history.action.revokingLegacy': 'Revoking',
    'account.history.action.searchSchedules': 'Search schedules',
    'account.history.action.sync': 'Sync reminders',
    'account.history.action.syncing': 'Syncing',
    'account.history.action.viewMap': 'Open map',
    'account.history.clearConfirm':
      'Clear local Yuchengtong v2 trip reminders, history, schedule records, and map favorites? Original legacy orders data will not be deleted.',
    'account.history.legacyRevokeConfirmLocal':
      'After revoking, YCT will ask again before syncing records imported from legacy orders.',
    'account.history.legacyRevokeConfirmWithAccount':
      'After revoking, copies synced from legacy orders will be deleted from the account while local legacy records stay on this device. YCT will ask again before the next account sync.',
    'account.history.legacyRevokeDeleteFailed':
      'Local consent revoked, but account copy deletion failed',
    'account.history.legacyRevokeDeleted':
      'Legacy record sync consent revoked, and {count} account-side legacy reminder copies deleted',
    'account.history.legacyRevokeDeleting': 'Deleting account-side legacy reminder copies',
    'account.history.legacyRevokeDone': 'Legacy record sync consent revoked',
    'account.history.legacyRevokeNoCopies':
      'Legacy record sync consent revoked. No account-side legacy reminder copies needed deletion',
    'account.history.legacySyncConfirm':
      'This sync includes {count} read-only records imported from legacy orders. After syncing, they are account-side trip reminder snapshots only, not v2 ticket orders, tickets, or check-in credentials. Sync these legacy records?',
    'account.history.legacySyncKept': 'Legacy records kept locally and not synced to the account',
    'account.history.loadedFromAccount': 'Loaded {count} reminders from the account',
    'account.history.loading': 'Loading',
    'account.history.mapFavorites': '{count} map favorites',
    'account.history.noSyncNeeded': 'No reminders need syncing',
    'account.history.pendingSync': '{count} pending sync',
    'account.history.scheduleRecords': '{count} schedule records',
    'account.history.syncDone': 'Synced {count} reminders',
    'account.history.syncDoneWithSkipped':
      'Synced {count} reminders and kept {skipped} legacy records local',
    'account.history.syncFailed': 'Failed to sync trip reminders',
    'account.history.syncing': 'Syncing reminders',
    'account.history.title': 'Local History',
    'account.history.total': '{count}',
    'account.history.tripHistory': '{count} history trips',
    'account.history.upcomingTrips': '{count} upcoming',
    'account.notification.checkinDescription': 'Check-in, redemption, and ride code reminders',
    'account.notification.checkinLabel': 'Check-in',
    'account.notification.disabled': 'Device push off',
    'account.notification.enabled': 'Device push on',
    'account.notification.gridAria': 'Allowed push notification types',
    'account.notification.masterLabelDisabled':
      'Device push notification master switch, currently off',
    'account.notification.masterLabelEnabled':
      'Device push notification master switch, currently on',
    'account.notification.note':
      'The master switch only controls whether this device receives Push. Categories below decide which reminder types may push. Quiet hours do not disable categories; they silence or delay those reminders.',
    'account.notification.operationsDescription':
      'Announcements, line changes, and operations status',
    'account.notification.operationsLabel': 'Updates',
    'account.notification.quietEnd': 'Quiet hours end',
    'account.notification.quietStart': 'Quiet hours start',
    'account.notification.statusDisabledPreference': 'Notification preference disabled',
    'account.notification.statusLoginRequired':
      'Sign in to add this device to server Push subscriptions',
    'account.notification.statusRegistered': 'This device joined Push subscriptions: {host}',
    'account.notification.statusRegistering': 'Registering this device for Push',
    'account.notification.statusRevoked': 'This device Push subscription was revoked',
    'account.notification.statusRevoking': 'Revoking this device Push subscription',
    'account.notification.statusSyncFailed': 'Device Push subscription sync failed',
    'account.notification.ticketDescription': 'Booking, refund, and ticket status changes',
    'account.notification.ticketLabel': 'Ticketing',
    'account.notification.title': 'Push Notifications and Quiet Hours',
    'account.notification.tripDescription': 'Departure, arrival, and trip history reminders',
    'account.notification.tripLabel': 'Trip reminders',
    'account.pwa.action.clearCache': 'Clear cache',
    'account.pwa.action.install': 'Install Yuchengtong',
    'account.pwa.action.refreshCache': 'Refresh cache',
    'account.pwa.cacheChecking': 'Checking',
    'account.pwa.cacheClearing': 'Clearing',
    'account.pwa.cacheEmpty': 'No cache yet',
    'account.pwa.cacheItems': '{count} cached items',
    'account.pwa.cacheRefreshing': 'Refreshing',
    'account.pwa.cacheUnavailable': 'Cache unavailable',
    'account.pwa.description':
      'Add YCT to the home screen for quick access to updates, lines, and station details. Downloaded custom offline areas can be cached, and after you allow it, YCT can receive trip, operations, ticketing, and check-in reminders.',
    'account.pwa.descriptionPrefix': 'Install Yuchengtong:',
    'account.pwa.status.checking': 'Checking',
    'account.pwa.status.installed': 'Installed',
    'account.pwa.status.installable': 'Installable',
    'account.pwa.status.manual': 'Add manually',
    'account.pwa.status.unsupported': 'Unavailable',
    'account.pwa.statusDescription.checking':
      'Checking whether this browser supports an install entry.',
    'account.pwa.statusDescription.installed':
      'This site is already open as a standalone app. You can continue managing offline cache here.',
    'account.pwa.statusDescription.installable':
      'This browser supports direct installation. Choose "Install Yuchengtong" to open the install confirmation.',
    'account.pwa.statusDescription.manual':
      'This browser needs the menu to add the site to the home screen or install it as an app. In Safari, use the Share menu and choose "Add to Home Screen".',
    'account.pwa.statusDescription.unsupported':
      'This browser does not support an install entry, but the web page and recent content cache still work.',
    'account.pwa.title': 'Install and Offline',
    'account.settings': 'Account Settings',
    'account.ticketDraft.count': '{count}',
    'account.ticketDraft.readonly':
      'This account is read-only. Order drafts are available after Active status.',
    'account.status.anonymous': 'Not signed in',
    'account.status.notConfigured': 'LDPASS is not configured',
    'account.status.readonly': 'Read-only account',
    'account.status.unavailable': 'Account status unavailable',
    'changelog.category.feat': 'New',
    'changelog.category.fix': 'Fix',
    'changelog.category.perf': 'Improved',
    'changelog.category.style': 'Interface',
    'changelog.changeCount': '{count} changes',
    'changelog.empty': 'There are no user-facing updates to show yet.',
    'changelog.title': 'Version Updates',
    'brand.home': 'Yuchengtong Home',
    'contentPoiBinding.empty': 'No matching public POIs.',
    'contentPoiBinding.hint':
      'Only public map POIs are shown; changes take effect on POI details after publishing.',
    'contentPoiBinding.loading': 'Loading public POIs',
    'contentPoiBinding.optionsAria': 'Available POIs',
    'contentPoiBinding.searchAria': 'Search linked POIs',
    'contentPoiBinding.searchPlaceholder': 'Search POI name, address, or ID',
    'contentPoiBinding.selectedAria': 'Linked POIs',
    'contentPoiBinding.title': 'Linked POIs',
    'contentPoiBinding.unavailable': 'Public POIs are unavailable',
    'embeddedMapPicker.empty': 'Enter coordinates or pick a reference place first.',
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
    'map.categoryName.airport': 'Airport',
    'map.categoryName.busStop': 'Bus Stop',
    'map.categoryName.coachStation': 'Coach Station',
    'map.categoryName.commerce': 'Commerce',
    'map.categoryName.dining': 'Dining',
    'map.categoryName.education': 'Education',
    'map.categoryName.facility': 'Facility',
    'map.categoryName.ferryPort': 'Ferry Port',
    'map.categoryName.industry': 'Industrial Facility',
    'map.categoryName.mapMarker': 'Map Marker',
    'map.categoryName.medical': 'Medical',
    'map.categoryName.metroEntrance': 'Metro Entrance',
    'map.categoryName.metroStation': 'Metro Station',
    'map.categoryName.museum': 'Museum',
    'map.categoryName.park': 'Park',
    'map.categoryName.parking': 'Parking',
    'map.categoryName.player': 'Players',
    'map.categoryName.publicService': 'Public Service',
    'map.categoryName.railway': 'Railway',
    'map.categoryName.railwayStation': 'Railway Station',
    'map.categoryName.residence': 'Residential Area',
    'map.categoryName.road': 'Road',
    'map.categoryName.scenery': 'Scenic Spot',
    'map.categoryName.sports': 'Sports',
    'map.categoryName.tramStation': 'Tram Stop',
    'map.categoryName.transitLine': 'Line',
    'map.categoryName.water': 'Water',
    'map.empty.favorites': 'No favorite places yet',
    'map.empty.loading': 'Loading map markers',
    'map.empty.nearby': 'No nearby markers to show',
    'map.empty.noMatch': 'No matching markers',
    'map.empty.unavailable': 'No map markers to show',
    'map.geometry.linearObject': 'Linear object endpoint group, {count} endpoints',
    'map.geometry.lineString': 'Linear object, {count} nodes',
    'map.geometry.pointMarker': 'Point marker',
    'map.geometry.region': 'Area object, {count} boundary nodes',
    'map.geometry.roadEndpointCount': '{count} road endpoints',
    'map.geometry.transitLineDetail': '{count} stop coordinate points connected directly',
    'map.geometry.transitLineObject': 'Line object, {count} stop coordinate points',
    'map.geometry.transitLinePending': 'Line coordinates pending',
    'map.hud.aria': 'Map scale and coordinates',
    'map.hud.cursor': 'Move the pointer to inspect coordinates',
    'map.hud.scale.blocks': '{value} blocks',
    'map.hud.scale.kilometers': '{value} km',
    'map.markerList.count': '{count} items',
    'map.markerList.default': 'Map Markers',
    'map.markerList.fullLength': 'Total length {distance}',
    'map.markerList.nearby': 'Near {name}',
    'map.markerList.nearbyLinear': 'Along {name}',
    'map.markerList.playerCount': '{online}/{total} online',
    'map.markerList.results': 'Search Results',
    'map.metroInfrastructure.direction.down': 'Downward',
    'map.metroInfrastructure.direction.here': 'Transfer here',
    'map.metroInfrastructure.direction.up': 'Upward',
    'map.metroInfrastructure.downwardsTerminus': 'downbound terminus',
    'map.metroInfrastructure.exitGroup.left': '{arrow}Exit {codes}',
    'map.metroInfrastructure.exitGroup.right': 'Exit {codes}{arrow}',
    'map.metroInfrastructure.facing': 'Facing {orientation}',
    'map.metroInfrastructure.facility.elevator': 'Elevator',
    'map.metroInfrastructure.facility.escalator': 'Escalator',
    'map.metroInfrastructure.facility.escalatorAndStairs': 'Escalator / stairs',
    'map.metroInfrastructure.facility.exit': 'Exit',
    'map.metroInfrastructure.facility.familyRestroom': 'Family restroom',
    'map.metroInfrastructure.facility.accessibleRestroom': 'Accessible restroom',
    'map.metroInfrastructure.facility.meetingPoint': 'Meeting point',
    'map.metroInfrastructure.facility.mensRestroom': "Men's restroom",
    'map.metroInfrastructure.facility.nursingRoom': 'Nursing room',
    'map.metroInfrastructure.facility.passengerServiceCenter': 'Passenger service center',
    'map.metroInfrastructure.facility.platformDoor': 'Platform screen door',
    'map.metroInfrastructure.facility.police': 'Police room',
    'map.metroInfrastructure.facility.stairs': 'Stairs',
    'map.metroInfrastructure.facility.stairsTwoWay': 'Two-way stairs',
    'map.metroInfrastructure.facility.subway': 'Metro',
    'map.metroInfrastructure.facility.thirdRestroom': 'All-gender family restroom',
    'map.metroInfrastructure.facility.ticketMachine': 'Ticket machine',
    'map.metroInfrastructure.facility.toilet': 'Restroom',
    'map.metroInfrastructure.facility.waitingRoom': 'Waiting room',
    'map.metroInfrastructure.facility.wheelchair': 'Accessible facility',
    'map.metroInfrastructure.facility.wheelchairLift': 'Wheelchair lift',
    'map.metroInfrastructure.facility.womensRestroom': "Women's restroom",
    'map.metroInfrastructure.floorEmpty': 'No station facilities recorded on this level',
    'map.metroInfrastructure.layer.concourse': 'Concourse level',
    'map.metroInfrastructure.layer.entrance': 'Entrance level',
    'map.metroInfrastructure.layer.passageway': 'Passageway level',
    'map.metroInfrastructure.layer.platform': 'Platform level',
    'map.metroInfrastructure.layer.transfer': 'Transfer level',
    'map.metroInfrastructure.lineTowards': '{lineName} toward {terminal}',
    'map.metroInfrastructure.oneWay.both': 'Two-way access',
    'map.metroInfrastructure.oneWay.down': 'Downbound only',
    'map.metroInfrastructure.oneWay.up': 'Upbound only',
    'map.metroInfrastructure.platformDoors': '{side} doors',
    'map.metroInfrastructure.platformSide.both': 'Both-side',
    'map.metroInfrastructure.platformSide.left': 'Left-side',
    'map.metroInfrastructure.platformSide.right': 'Right-side',
    'map.metroInfrastructure.platformSide.unknown': 'Unspecified',
    'map.metroInfrastructure.tabsAria': 'Line facility information',
    'map.metroInfrastructure.title': 'Station Facilities',
    'map.metroInfrastructure.towardsLeft': '← Toward {station}',
    'map.metroInfrastructure.towardsRight': 'Toward {station} →',
    'map.metroInfrastructure.transferAction': 'View {title} platform facilities',
    'map.metroInfrastructure.transferDirection.downwards': 'Transfer toward downbound service',
    'map.metroInfrastructure.transferDirection.upwards': 'Transfer toward upbound service',
    'map.metroInfrastructure.upwardsTerminus': 'upbound terminus',
    'map.layer.aria': 'Layers and submissions',
    'map.layer.linearFeatures': 'Lines and labels',
    'map.layer.linearFeaturesHidden': 'Road and line overlays hidden',
    'map.layer.linearFeaturesVisible': 'Road and line overlays visible',
    'map.layer.markers': 'Markers',
    'map.layer.markersHidden': 'Place markers hidden',
    'map.layer.markersVisible': 'Place markers visible',
    'map.layer.modeAria': 'Map browsing mode',
    'map.layer.mode.roadNetwork': 'Roads',
    'map.layer.mode.satellite': 'Satellite',
    'map.layer.mode.traffic': 'Transit',
    'map.layer.noteRoadNetwork': 'Tiles are off. The road network and road labels are emphasized.',
    'map.layer.noteSatellite': 'Loading {name} with key roads overlaid.',
    'map.layer.noteTraffic': 'Tiles are off. Transit stops are emphasized and roads are muted.',
    'map.layer.open': 'Layers and submissions',
    'map.layer.players': 'Player locations',
    'map.layer.playersHidden': 'Online/offline players hidden',
    'map.layer.playersVisible': 'Online/offline players visible',
    'map.layer.perspective': 'Top-down 2.5D',
    'map.layer.perspectiveHidden': 'Showing flat areas',
    'map.layer.perspectiveVisible': 'Showing extruded POI volumes',
    'map.layer.submitPoi': 'Submit POI',
    'map.layer.tileProvider': 'Tile source',
    'map.layer.tileProviderAria': 'Tile source',
    'map.lineDetail.fare': 'Fare',
    'map.lineDetail.stations': 'Stops',
    'map.lineInfo.openAria': 'View {name} line information',
    'map.lineInfo.timezoneNote':
      'First/last bus, departure, and estimated arrival times are all Beijing time (UTC+8).',
    'map.lineInfo.title': '{name} · Line information',
    'map.lineRealtime.allTrips': 'All trips',
    'map.lineRealtime.atStation': 'At {station}',
    'map.lineRealtime.beijingTime': 'Beijing time',
    'map.lineRealtime.boardArrivalAt': 'Arrives {time}',
    'map.lineRealtime.boardArriving': 'Arriving soon',
    'map.lineRealtime.boardDepartureAt': 'Departs {time}',
    'map.lineRealtime.boardLeaving': 'Departing soon',
    'map.lineRealtime.boardMinutes': '{minutes} min',
    'map.lineRealtime.boardWaiting': 'Waiting to depart',
    'map.lineRealtime.countBadge': '{active}/{total}',
    'map.lineRealtime.countBadgeAria':
      '{active} vehicles in service, {total} trips not yet left the selected stop',
    'map.lineRealtime.detailArrival': 'Estimated arrival',
    'map.lineRealtime.detailDeparture': 'Terminal departure',
    'map.lineRealtime.detailDepartureAtStation': 'Estimated departure',
    'map.lineRealtime.detailPosition': 'Current position',
    'map.lineRealtime.detailSelectedStation': 'Selected stop',
    'map.lineRealtime.detailStatus': 'Status',
    'map.lineRealtime.detailWaiting': 'Not departed yet',
    'map.lineRealtime.emptyActive': 'No vehicles in service right now',
    'map.lineRealtime.emptySchedule': 'No departure timetable recorded for this direction',
    'map.lineRealtime.inSegment': 'Between {from} and {to}',
    'map.lineRealtime.lastTripPassed': 'The last trip has already departed. Next trip at {time}',
    'map.lineRealtime.lastTripPassedNextDay':
      'The last trip has already departed. Next trip at {time} (next day)',
    'map.lineRealtime.minutesToNext': 'About {count} min to the next stop',
    'map.lineRealtime.nextDeparture': 'Next departure {time}',
    'map.lineRealtime.nextDepartureNextDay': 'Next departure {time} (next day)',
    'map.lineRealtime.noMoreTrips': 'No further trips today',
    'map.lineRealtime.note':
      'Estimated from the recorded terminal timetable. Segment times use admin settings first, then route length and average speed.',
    'map.lineRealtime.selectStationHint': 'Select a stop to view its live information',
    'map.lineRealtime.stationAt': 'A vehicle is at this stop',
    'map.lineRealtime.stationEta': 'Arrives {time} · about {minutes} min',
    'map.lineRealtime.stationNextArrival': 'Next arrival in about {minutes} min ({time})',
    'map.lineRealtime.stationNoData': 'No live data for this stop',
    'map.lineRealtime.stationNoVehicle': 'No vehicle is heading to this stop',
    'map.lineRealtime.stationPassed': 'Already passed this stop',
    'map.lineRealtime.summary': '{count} vehicles in service',
    'map.lineRealtime.title': 'Live buses',
    'map.lineRealtime.trip': 'Trip {count} · departs {time}',
    'map.lineRealtime.tripTitlePosition': 'Trip {current} of {total}',
    'map.lineRealtime.updatedAt': 'Updated {time}',
    'map.lineRealtime.vehicleBadge': 'Trip {count} · departs {time}',
    'map.lineStation.showPoi': 'Show stop',
    'map.nearby.exit': 'Exit',
    'map.nearby.mileage': '{distance} along the line',
    'map.nearby.note': 'Showing markers near {name} by distance',
    'map.nearby.noteLinear': 'Showing markers along {name} by route mileage',
    'map.nearby.rangeAria': 'Route mileage range',
    'map.nearby.rangeLabel': 'Along-line range',
    'map.nearby.rangeValue': '{from} - {to}',
    'map.nearby.scopeAria': 'Area search scope',
    'map.nearby.scopeInside': 'Inside area',
    'map.nearby.scopeOutside': 'Nearby outside',
    'map.overlay.aria': 'Map marker overlay',
    'map.overlay.linearPoiTitle': '{name} · {count} endpoints',
    'map.overlay.markerTitle': '{name} ({x}, {z})',
    'map.overlay.roadTraceTitle': '{name} · approximate line, {count} endpoints',
    'map.overlay.transitTraceTitle': '{name} · {count} stops',
    'map.overlay.viewMarker': 'View {name}',
    'map.player.lastSeen': 'Last online: {time}',
    'map.player.observed': 'Last observed: {time}',
    'map.player.serverAccount': 'Server account',
    'map.player.status.offline': 'Offline',
    'map.player.status.online': 'Online',
    'map.poi.actions': 'Place actions',
    'map.poi.address': 'Address',
    'map.poi.close': 'Close place details',
    'map.poi.collapse': 'Collapse place details',
    'map.poi.connections': 'Connecting lines',
    'map.poi.coordinate': 'Coordinates',
    'map.poi.count': '{count} items',
    'map.poi.copyStatus': 'Copied place link',
    'map.poi.expand': 'Expand place details',
    'map.poi.facilities': 'Facilities and Exits',
    'map.poi.favoriteAria': 'Favorite {name}',
    'map.poi.favoriteStatus': 'Added {name} to favorites',
    'map.poi.floor': 'Floor',
    'map.poi.filterAll': 'All',
    'map.poi.filterCategory': 'Sub-place category',
    'map.poi.filterFloor': 'Floor',
    'map.poi.filterKeyword': 'Search sub-places',
    'map.poi.filterKeywordPlaceholder': 'Name, address, facilities, etc.',
    'map.poi.group.access': 'Entrances and exits',
    'map.poi.group.building': 'Buildings',
    'map.poi.group.facility': 'Facilities',
    'map.poi.group.nearby': 'Nearby',
    'map.poi.group.scenery': 'Attractions',
    'map.poi.group.transport': 'Transit',
    'map.poi.imageAlt': '{name} image',
    'map.poi.imageCounter': '{current} / {total}',
    'map.poi.imageNext': 'Next image',
    'map.poi.imagePrevious': 'Previous image',
    'map.poi.nearbyAlongAria': 'Search markers along {name}',
    'map.poi.nearbyAria': 'Search near {name}',
    'map.poi.noConnections': 'No known connecting lines',
    'map.poi.noFacilities': 'No facility data',
    'map.poi.objectFallback': 'Map object',
    'map.poi.openDetail': 'Open details',
    'map.poi.openingHours': 'Opening hours',
    'map.poi.operations': 'Service updates',
    'map.poi.operationsEmpty': 'There are no active service updates',
    'map.poi.operationsLoading': 'Loading service updates',
    'map.poi.parent': 'Parent place',
    'map.poi.boundRegions': 'Containing areas',
    'map.poi.parentFallback': 'Parent place',
    'map.poi.relatedPlaceFallback': 'Related place',
    'map.poi.relatedPlaces': 'Related places',
    'map.poi.route': 'Directions',
    'map.poi.shareAria': 'Share {name}',
    'map.poi.shareOpened': 'Opened the system share sheet',
    'map.poi.shareText': 'View {name} on Yuchengtong Map',
    'map.poi.shareTitle': '{name} - Yuchengtong Map',
    'map.poi.shareUnavailable': 'This browser does not support sharing or copying yet',
    'map.poi.summary': 'Overview',
    'map.poi.tabsAria': 'Place detail sections',
    'map.poi.type': 'Type',
    'map.poi.unfavoriteAria': 'Remove {name} from favorites',
    'map.poi.unfavoriteStatus': 'Removed {name} from favorites',
    'map.poiSubmit.category': 'Category',
    'map.poiSubmit.address': 'Address',
    'map.poiSubmit.addressPlaceholder': 'For example: 18 Qingnian Avenue',
    'map.poiSubmit.addressRoad': 'Address road',
    'map.poiSubmit.floor': 'Floor',
    'map.poiSubmit.floorPlaceholder': 'For example: B1, 3F, concourse',
    'map.poiSubmit.close': 'Close submission dialog',
    'map.poiSubmit.description': 'Place description',
    'map.poiSubmit.descriptionPlaceholder':
      'Add use, opening status, entrance notes, and other context',
    'map.poiSubmit.href': 'Related link',
    'map.poiSubmit.hrefPlaceholder': 'https://...',
    'map.poiSubmit.imageFile': 'Upload image',
    'map.poiSubmit.imageFileCount': '{count} images selected',
    'map.poiSubmit.imageUploadFailed': 'Image upload failed',
    'map.poiSubmit.imageUrl': 'Image URL',
    'map.poiSubmit.imageUrlPlaceholder': 'https://.../photo.png',
    'map.poiSubmit.invalid': 'Enter a name, category, and valid coordinates.',
    'map.poiSubmit.invalidFacility': 'Add a description to every facility entry.',
    'map.poiSubmit.tooManyImages': 'Each POI can include up to 12 images.',
    'map.poiSubmit.name': 'Place name',
    'map.poiSubmit.namePlaceholder': 'Place name',
    'map.poiSubmit.noAddressRoad': 'No road binding',
    'map.poiSubmit.openingHours': 'Opening hours',
    'map.poiSubmit.openingHoursPlaceholder': 'For example: Mon-Fri 09:00-18:00',
    'map.poiSubmit.pickCancel': 'Cancel',
    'map.poiSubmit.pickDone': 'Selected coordinates {point}.',
    'map.poiSubmit.pickHint': 'Tap an empty map area to set submission coordinates',
    'map.poiSubmit.pickOnMap': 'Pick on map',
    'map.poiSubmit.pickPrompt':
      'Tap an empty map area to choose coordinates for the POI submission.',
    'map.poiSubmit.submit': 'Submit for review',
    'map.poiSubmit.submitFailed': 'POI submission failed',
    'map.poiSubmit.submitting': 'Submitting',
    'map.poiSubmit.success': 'Submitted. Waiting for admin review.',
    'map.poiSubmit.title': 'Submit Public POI',
    'map.poiSubmit.x': 'X coordinate',
    'map.poiSubmit.z': 'Z coordinate',
    'map.source.loading': 'Loading map data',
    'map.source.objectCount': '{count} objects',
    'map.source.provider.lindongFreshHttp': 'Lindong newer tiles',
    'map.source.provider.lindongSafeHttpsStatic': 'Lindong HTTPS static tiles',
    'map.source.provider.lindongUnminedStatic': 'Lindong uNmINeD static tiles',
    'map.source.providerNote.lindongFreshHttp':
      'This source is newer and is proxied through the YCT backend to avoid HTTPS mixed-content issues.',
    'map.source.providerNote.lindongSafeHttpsStatic':
      'This source avoids mixed-content issues, but may not reflect the latest map state.',
    'map.source.providerNote.lindongUnminedStatic':
      'This source comes from the HTTPS static map on map.shangxiaoguan.top; full uNmINeD coordinate conversion and rendering still need follow-up work.',
    'map.source.tileFallback': 'map tiles',
    'map.source.tileProvider': 'Current tile source: {name}',
    'map.source.tooltipLoading': 'Map data is still loading.',
    'map.source.unavailable': 'Map data is temporarily unavailable',
    'map.location.currentAccount': 'Current account: {name}',
    'map.search.aria': 'Search map places',
    'map.search.clear': 'Clear map search',
    'map.search.placeholder': 'Search map places, roads, or lines',
    'map.routingStatus.projecting': 'Preparing road access points',
    'map.share.actions': 'Share format',
    'map.share.close': 'Close share panel',
    'map.share.footerDisclaimer': 'The place and organization names above are fictional',
    'map.share.footerPrefix': 'From',
    'map.share.footerText': 'From Yuchengtong',
    'map.share.image': 'Share image',
    'map.share.imageDownloaded': 'Share image downloaded',
    'map.share.imageShared': 'Image share panel opened',
    'map.share.coordinate': 'Copy coordinates',
    'map.share.coordinateCopied': 'Coordinates copied',
    'map.share.copy': 'Copy',
    'map.share.copyKind': 'Copy content',
    'map.share.link': 'Copy link',
    'map.share.linkCopied': 'Share link copied',
    'map.share.processing': 'Processing',
    'map.share.qrCode': 'QR code for the share link',
    'map.share.text': 'Copy text',
    'map.share.textCopied': 'Text version copied',
    'map.share.teleport': 'Copy teleport command',
    'map.share.teleportCopied': 'Teleport command copied',
    'map.share.title': 'Share',
    'map.share.unavailable': 'This share format is not supported in the current browser',
    'map.toolbar.reset': 'Return to current location or default view',
    'map.toolbar.zoomIn': 'Zoom in',
    'map.toolbar.zoomOut': 'Zoom out',
    'map.title': 'Map Explore',
    'mapStageLoader.aria': 'Map loading',
    'mapStageLoader.loading': 'Loading map',
    'siteLegal.aria': 'Site filing information',
    'siteLegal.disclaimer':
      'Parts of this site were generated with AI; places and organizations mentioned are fictional.',
    'siteLegal.icp': '辽ICP备2021004959-1号',
    'siteLegal.police': '辽公网安备21100502000117号',
    'siteLegal.version': 'Version {version}',
    'map.route.alight': 'Alight at {name}',
    'map.route.alightFerry': 'Disembark at {name}',
    'map.route.alightMetro': 'Exit at {name}',
    'map.route.linearEndpointBlocked':
      'Origin and destination cannot both be a line or road feature',
    'map.route.aria': 'Route planner',
    'map.route.arrive': 'Arrive at {name}',
    'map.route.badge.fastest': 'Fastest',
    'map.route.badge.fewestTransfers': 'Fewest transfers',
    'map.route.badge.leastWalking': 'Least walking',
    'map.route.board': 'Board at {name}',
    'map.route.boardFerry': 'Board at {name}',
    'map.route.boardMetro': 'Board at {name}',
    'map.route.close': 'Close route planner',
    'map.route.collapse': 'Collapse route planner',
    'map.route.currentLocation': 'Current location',
    'map.route.defaultView': 'Default view',
    'map.route.depart': 'Depart from {name}',
    'map.route.destination': 'Destination',
    'map.route.directTitle': 'Direct {mode}',
    'map.route.taxiDirect': 'Taxi directly',
    'map.route.taxiAlternativeOne': 'Taxi alternative 1',
    'map.route.taxiAlternativeTwo': 'Taxi alternative 2',
    'map.route.taxiFewestSegments': 'Taxi with fewer road segments',
    'map.route.taxiNote':
      'Taxis stay on roads. Travel time uses the admin default speed of {speed} km/h plus junction delay, and fare rules are admin-managed.',
    'map.route.taxiWithDistance': 'Take a taxi along roads for {distance}, {duration}',
    'map.route.taxiWalkFromDropoff': 'Walk {distance} after drop-off, {duration}',
    'map.route.taxiWalkToPickup': 'Walk {distance} to the roadside pickup point, {duration}',
    'map.route.distance.blocks': '{count} blocks',
    'map.route.duration.short': 'about {count} min',
    'map.route.duration.step': '{count} min',
    'map.route.edit': 'Edit',
    'map.route.endpointCandidatesAria': 'Route endpoint candidates',
    'map.route.expand': 'Expand route planner',
    'map.route.featuresAria': 'Route features',
    'map.route.fare.estimated': 'est. {amount}',
    'map.route.fare.exact': '{amount}',
    'map.route.fare.partial': 'from {amount} known',
    'map.route.fare.unavailable': 'Fare to be confirmed',
    'map.route.input.destination': 'Enter route destination',
    'map.route.input.origin': 'Enter route origin',
    'map.route.loadingDetail': 'Building the road graph for the first time may take a few seconds',
    'map.route.loadingNote':
      'The legacy road graph is large, so the first route may take a few seconds.',
    'map.route.loadingTitle': 'Calculating route options',
    'map.route.marker.destination': 'E',
    'map.route.marker.origin': 'S',
    'map.route.metroEnterViaAccess': 'Enter via {access}',
    'map.route.metroExitViaAccess': 'Exit via {access}',
    'map.route.mode.all': 'All',
    'map.route.mode.bus': 'Bus',
    'map.route.mode.coach': 'Coach',
    'map.route.mode.collapse': 'Collapse',
    'map.route.mode.taxi': 'Taxi',
    'map.route.mode.ferry': 'Ferry',
    'map.route.mode.metro': 'Metro',
    'map.route.mode.more': '+{count} more',
    'map.route.mode.railway': 'Rail',
    'map.route.mode.tram': 'Tram',
    'map.route.mode.walk': 'Walk',
    'map.route.modeAria': 'Route transport modes',
    'map.route.noEndpointCandidates': 'No matching locatable markers.',
    'map.route.noModes': 'Enable at least one transport mode.',
    'map.route.noOptions': 'No available route options yet.',
    'map.route.optionFallback': 'Route option',
    'map.route.optionsAria': 'Route options',
    'map.route.origin': 'Origin',
    'map.route.planning': 'Planning candidate routes from roads and transport modes...',
    'map.route.ride': 'Take {line} toward {direction}, {stops} stops, {duration}',
    'map.route.road.approach': 'Approach {road}',
    'map.route.road.connection': 'Connect to {road}',
    'map.route.road.depart': 'Head to destination',
    'map.route.road.enter': 'to {road}',
    'map.route.selectDestination': 'Select destination',
    'map.route.selectOrigin': 'Select origin',
    'map.route.sort.time': 'Sort by time',
    'map.route.sort.fare': 'Sort by fare',
    'map.route.sort.transfers': 'Sort by transfers',
    'map.route.sort.walking': 'Sort by walking',
    'map.route.sortAria': 'Route sorting',
    'map.route.copyStatus': 'Route link copied',
    'map.route.share': 'Share route',
    'map.route.shareOpened': 'System share panel opened',
    'map.route.shareText': 'View the route plan for {route}',
    'map.route.shareTitle': 'Share Yuchengtong route plan',
    'map.route.shareUnavailable': 'Sharing is unavailable. Copy the current link manually.',
    'map.route.stationCount': '{count} stops',
    'map.route.stepDetails.collapse': 'Collapse detailed steps',
    'map.route.stepDetails.expand': 'Expand detailed steps',
    'map.route.stepsAria': 'Selected route steps',
    'map.route.summary.directEstimate': 'straight-line estimate',
    'map.route.summary.roadEstimate': 'road-based estimate',
    'map.route.summary.walking': ' walking',
    'map.route.swap': 'Swap origin and destination',
    'map.route.traceTitle': '{title} · preliminary estimate',
    'map.route.transferAction': 'Transfer at {name}',
    'map.route.transferTitle': '{firstMode} + {secondMode} transfer',
    'map.route.transferWalk': 'Transfer walk {distance} {duration}',
    'map.route.transitNote.default':
      'Candidate routes are generated from real line stop order; travelTime is preferred for inter-stop duration, and missing data is still estimated from distance.',
    'map.route.transitNote.fallbackRoad':
      'Bus and coach inter-stop travel must use roads; a candidate is omitted when the legacy road graph is missing or disconnected. Admin interval time takes priority over legacy travelTime data.',
    'map.route.transitNote.road':
      'Bus and coach inter-stop paths use only legacy road centerlines, with junctions inferred only at planar centerline intersections. Disconnected candidates are omitted. Admin interval time takes priority over legacy travelTime data.',
    'map.route.transitNote.transfer':
      'One-transfer candidates are composed from real line stop order; transfer distance and missing inter-stop duration are still estimated.',
    'map.route.turn.left': 'Turn left',
    'map.route.turn.right': 'Turn right',
    'map.route.turn.slightLeft': 'Bear left',
    'map.route.turn.slightRight': 'Bear right',
    'map.route.turn.straight': 'Continue straight',
    'map.route.useMapCenter': 'Use map center',
    'map.route.walkDirect': 'Walk directly',
    'map.route.walkAlternativeOne': 'Walking alternative 1',
    'map.route.walkAlternativeTwo': 'Walking alternative 2',
    'map.route.walkFewerTurns': 'Fewer-turn walk',
    'map.route.walkFewestSegments': 'Walk with fewer road segments',
    'map.route.walkFromAccess': 'Walk from {access} to destination {distance} {duration}',
    'map.route.walkNote.direct':
      'No connected road graph was found, so walking is estimated as a straight line for now.',
    'map.route.walkNote.road':
      'Walking prefers legacy road centerlines and changes roads only at plan-view centerline intersections; disconnected segments fall back to straight-line estimates.',
    'map.route.walkRoadWithDistance': 'Walk along roads {distance} {duration}',
    'map.route.walkStraight': 'Straight-line walk',
    'map.route.walkToAccess': 'Walk to {access} {distance} {duration}',
    'map.route.walkWithDistance': 'Walk {distance} {duration}',
    'map.roadDetail.description':
      'This linear place is derived from legacy map road endpoints. The visible trace is approximate.',
    'map.roadDetail.endpointCount': 'Endpoint count',
    'map.roadDetail.endpointCountValue': '{count}',
    'map.roadDetail.traceHighlighted': 'Approximate trace highlighted on the map',
    'map.roadDetail.traceStatus': 'Trace status',
    'metroWayfindingEditor.action.addElement': 'Add element',
    'metroWayfindingEditor.action.cancel': 'Cancel',
    'metroWayfindingEditor.action.clear': 'Clear',
    'metroWayfindingEditor.action.close': 'Close',
    'metroWayfindingEditor.action.delete': 'Delete',
    'metroWayfindingEditor.action.done': 'Done',
    'metroWayfindingEditor.action.dragToReorder': 'Drag to reorder',
    'metroWayfindingEditor.action.duplicate': 'Duplicate',
    'metroWayfindingEditor.action.duplicateElement': 'Duplicate element',
    'metroWayfindingEditor.action.importSign': 'Import sign',
    'metroWayfindingEditor.action.moveDown': 'Move down',
    'metroWayfindingEditor.action.moveLeft': 'Move left',
    'metroWayfindingEditor.action.moveRight': 'Move right',
    'metroWayfindingEditor.action.moveRowDownAria': 'Move this row down',
    'metroWayfindingEditor.action.moveRowUpAria': 'Move this row up',
    'metroWayfindingEditor.action.moveUp': 'Move up',
    'metroWayfindingEditor.action.openProjectLibraryTitle': 'Layout templates and project import',
    'metroWayfindingEditor.action.openTemplateLibrary': 'Open template library',
    'metroWayfindingEditor.action.removeElement': 'Remove element',
    'metroWayfindingEditor.action.replaceSign': 'Replace current sign',
    'metroWayfindingEditor.action.reverse': 'Reverse',
    'metroWayfindingEditor.action.reverseDisabledVertical': 'Vertical layouts cannot be reversed',
    'metroWayfindingEditor.action.reverseTitle': 'Reverse sign element order',
    'metroWayfindingEditor.action.templateLibrary': 'Templates',
    'metroWayfindingEditor.align.center': 'Center',
    'metroWayfindingEditor.align.left': 'Align left',
    'metroWayfindingEditor.align.right': 'Align right',
    'metroWayfindingEditor.aria.addElementToRow': 'Add element to {row}',
    'metroWayfindingEditor.aria.canvas': 'Metro wayfinding sign editor',
    'metroWayfindingEditor.aria.combination': 'Combination, {count} children, scale {scale}%',
    'metroWayfindingEditor.aria.defaultLineName': 'Line',
    'metroWayfindingEditor.aria.draggableTab': '{label}, drag to reorder',
    'metroWayfindingEditor.aria.emptyState': 'Start creating a sign',
    'metroWayfindingEditor.aria.fixedSpace': 'Fixed space, {units} units',
    'metroWayfindingEditor.aria.flexSpace': 'Flexible space',
    'metroWayfindingEditor.aria.inlineEditable': '{label}, inline editable',
    'metroWayfindingEditor.aria.largeTextWithSummary': 'Large text, {summary}',
    'metroWayfindingEditor.aria.partSuffix': ', {value}',
    'metroWayfindingEditor.aria.removeSegment': 'Remove {kind}',
    'metroWayfindingEditor.aria.rowElements': 'Elements in {row}',
    'metroWayfindingEditor.aria.segmentOrdinal': '{kind} {index}',
    'metroWayfindingEditor.aria.suffixOrdinal': 'Subscript {index}',
    'metroWayfindingEditor.aria.textElement': 'Text, {rows} rows, {alignment}',
    'metroWayfindingEditor.aria.textSegment': '{label} text segment {index}',
    'metroWayfindingEditor.color.background': 'Element background',
    'metroWayfindingEditor.color.custom': 'Custom color',
    'metroWayfindingEditor.color.customAria': '{label} custom color',
    'metroWayfindingEditor.color.foreground': 'Element text, line, and icon color',
    'metroWayfindingEditor.color.inherit': 'Follow sign',
    'metroWayfindingEditor.combination.addAria': 'Add combination element',
    'metroWayfindingEditor.combination.addFacility': 'Facility icon',
    'metroWayfindingEditor.combination.addSpace': 'Space',
    'metroWayfindingEditor.combination.childDuplicateAria': 'Duplicate child element',
    'metroWayfindingEditor.combination.childMoveDownAria': 'Move child element down',
    'metroWayfindingEditor.combination.childMoveUpAria': 'Move child element up',
    'metroWayfindingEditor.combination.childRemoveAria': 'Remove child element',
    'metroWayfindingEditor.combination.childType': 'Child element type',
    'metroWayfindingEditor.combination.closeAria': 'Close combination editor',
    'metroWayfindingEditor.combination.description':
      'Supports facility icons, arrows, text, large text, and fixed or flexible spaces. Children stay inside the combination box.',
    'metroWayfindingEditor.combination.editTitle': 'Edit combination',
    'metroWayfindingEditor.combination.editWithCount': 'Edit combination ({count})',
    'metroWayfindingEditor.combination.empty': 'This combination has no child elements yet.',
    'metroWayfindingEditor.combination.eyebrow': 'Combination elements',
    'metroWayfindingEditor.combination.fill': 'Combination fill',
    'metroWayfindingEditor.combination.fillColor': 'Combination fill color',
    'metroWayfindingEditor.combination.listAria': 'Combination element list',
    'metroWayfindingEditor.combination.scale': 'Combination scale',
    'metroWayfindingEditor.combination.stripeColor': 'Stripe color',
    'metroWayfindingEditor.combination.stripePosition': 'Stripe position',
    'metroWayfindingEditor.combination.templateHint':
      'The line number content template now lives in the Insert suggestions area above the editor: pick a line to replace the child elements of this combination, and apply the line identity color as a fill or stripe.',
    'metroWayfindingEditor.confirm.clear':
      'Clear all elements from the current metro wayfinding sign?',
    'metroWayfindingEditor.direction.down': 'Down',
    'metroWayfindingEditor.direction.left': 'Left',
    'metroWayfindingEditor.direction.right': 'Right',
    'metroWayfindingEditor.direction.up': 'Up',
    'metroWayfindingEditor.divider.note':
      'The divider is {width} wide and 72 tall, scaling with the sign pixel unit.',
    'metroWayfindingEditor.elementLabel.arrow': 'Arrow · 85 × 85',
    'metroWayfindingEditor.elementLabel.combination': 'Combination · {scale}% · {count} children',
    'metroWayfindingEditor.elementLabel.divider': 'Divider · {width} × 72',
    'metroWayfindingEditor.elementLabel.facility': 'Facility icon · 85 × 85',
    'metroWayfindingEditor.elementLabel.largeText': 'Large text · {size} height',
    'metroWayfindingEditor.elementLabel.space': 'Spacer',
    'metroWayfindingEditor.elementLabel.text': 'Text · {rows} rows',
    'metroWayfindingEditor.elementType.arrow': 'Arrow',
    'metroWayfindingEditor.elementType.combination': 'Combination',
    'metroWayfindingEditor.elementType.divider': 'Divider',
    'metroWayfindingEditor.elementType.facility': 'Facility',
    'metroWayfindingEditor.elementType.largeText': 'Large text',
    'metroWayfindingEditor.elementType.space': 'Space',
    'metroWayfindingEditor.elementType.spaceShort': 'Space',
    'metroWayfindingEditor.elementType.text': 'Text',
    'metroWayfindingEditor.empty.description':
      'Add your first element, or load a ready-made layout from the template library.',
    'metroWayfindingEditor.empty.title': 'Start creating a sign',
    'metroWayfindingEditor.error.fileTooLarge': '{name} exceeds {limit} MB, so reading stopped.',
    'metroWayfindingEditor.error.parseFailed': 'Failed to parse the project file.',
    'metroWayfindingEditor.error.tooManyFiles':
      'You can import up to {count} project files at a time.',
    'metroWayfindingEditor.examples.aria': 'Metro wayfinding layout templates',
    'metroWayfindingEditor.examples.categoriesAria': 'Template categories',
    'metroWayfindingEditor.examples.categoryEntry': 'Entry',
    'metroWayfindingEditor.examples.categoryExit': 'Exit',
    'metroWayfindingEditor.examples.categoryTransfer': 'Transfer',
    'metroWayfindingEditor.examples.description': 'Pick a layout to start editing',
    'metroWayfindingEditor.examples.empty': 'No example templates are available for this network',
    'metroWayfindingEditor.examples.line': 'Apply line',
    'metroWayfindingEditor.examples.loadAria': 'Load {remark}, {mode}, {size}',
    'metroWayfindingEditor.examples.station': 'Apply station',
    'metroWayfindingEditor.examples.title': 'Layout templates',
    'metroWayfindingEditor.examples.useTemplate': 'Use this template',
    'metroWayfindingEditor.field.addForegroundStroke': 'Add foreground stroke',
    'metroWayfindingEditor.field.addFrame': 'Add frame',
    'metroWayfindingEditor.field.alignment': 'Alignment',
    'metroWayfindingEditor.field.arrow': 'Arrow',
    'metroWayfindingEditor.field.backgroundColor': 'Sign background color',
    'metroWayfindingEditor.field.defaultForegroundColor': 'Default text and graphic color',
    'metroWayfindingEditor.field.elementType': 'Element type',
    'metroWayfindingEditor.field.exitIconDirection': 'Exit icon direction',
    'metroWayfindingEditor.field.facilityIcon': 'Facility icon',
    'metroWayfindingEditor.field.iconDirection': 'Icon direction',
    'metroWayfindingEditor.field.iconVariant': 'Icon variant',
    'metroWayfindingEditor.field.layout': 'Layout',
    'metroWayfindingEditor.field.rowDivider': 'Add divider between rows',
    'metroWayfindingEditor.field.writingMode': 'Text orientation',
    'metroWayfindingEditor.fill.color': 'Solid color',
    'metroWayfindingEditor.fill.inverse': 'Inverted',
    'metroWayfindingEditor.fill.none': 'None',
    'metroWayfindingEditor.fill.stripe': 'Stripe only',
    'metroWayfindingEditor.frame.circle': 'Circle',
    'metroWayfindingEditor.frame.fill': 'Frame fill',
    'metroWayfindingEditor.frame.fillColor': 'Frame fill color',
    'metroWayfindingEditor.frame.none': 'None',
    'metroWayfindingEditor.frame.rectangle': 'Rectangle',
    'metroWayfindingEditor.frame.shape': 'Frame shape',
    'metroWayfindingEditor.import.description':
      'Choose a JSON project file. The system parses it and shows a conversion preview before replacing the current sign.',
    'metroWayfindingEditor.import.dropActive': 'Release to import the project file',
    'metroWayfindingEditor.import.dropHint': 'You can also drag a JSON project file here',
    'metroWayfindingEditor.import.fileLimits': 'File limits',
    'metroWayfindingEditor.import.fileLimitsDescription':
      'Up to {count} files, {size} MB each. Projects from different editors cannot be imported together.',
    'metroWayfindingEditor.import.selectFiles': 'Choose project files',
    'metroWayfindingEditor.import.sourceExternalHint': 'External editor',
    'metroWayfindingEditor.import.sourceYct': 'YCT metro wayfinding project',
    'metroWayfindingEditor.import.sourceYctHint': 'Local project',
    'metroWayfindingEditor.import.supportedSources': 'Supported sources',
    'metroWayfindingEditor.import.title': 'Import an external wayfinding project',
    'metroWayfindingEditor.importPreview.closeAria': 'Close import preview',
    'metroWayfindingEditor.importPreview.eyebrow': 'Project conversion preview',
    'metroWayfindingEditor.importPreview.footerSummary': '{count} JSON files · {size} MB each',
    'metroWayfindingEditor.importPreview.mode': 'Conversion mode',
    'metroWayfindingEditor.importPreview.modeSemantic': 'Semantic only (recommended)',
    'metroWayfindingEditor.importPreview.modeSourceStyle': 'Keep source style',
    'metroWayfindingEditor.importPreview.previewNote':
      'Scaled sign preview, only for confirming the converted content and layout',
    'metroWayfindingEditor.importPreview.rowsAria': 'Rows to import',
    'metroWayfindingEditor.importPreview.source': 'Source',
    'metroWayfindingEditor.importPreview.sourceStyle': 'Source style',
    'metroWayfindingEditor.importPreview.targetStyle': 'Target style',
    'metroWayfindingEditor.importPreview.warningCount': '({count} occurrences)',
    'metroWayfindingEditor.importPreview.warningsAria': 'Conversion warnings',
    'metroWayfindingEditor.importPreview.warningsTitle': 'Conversion warnings',
    'metroWayfindingEditor.largeText.fieldLabel': 'Large text ({size} height)',
    'metroWayfindingEditor.largeText.insertSuffix': 'Add subscript at cursor',
    'metroWayfindingEditor.option.all': 'All',
    'metroWayfindingEditor.option.doubleRow': 'Two rows',
    'metroWayfindingEditor.option.entry': 'Entry',
    'metroWayfindingEditor.option.exit': 'Exit',
    'metroWayfindingEditor.option.singleRow': 'One row',
    'metroWayfindingEditor.option.transfer': 'Transfer',
    'metroWayfindingEditor.option.vertical': 'Vertical',
    'metroWayfindingEditor.projectDialog.closeAria': 'Close template library and import',
    'metroWayfindingEditor.projectDialog.eyebrow': 'Metro wayfinding sign',
    'metroWayfindingEditor.projectDialog.import': 'Import project',
    'metroWayfindingEditor.projectDialog.source': 'Project source',
    'metroWayfindingEditor.projectDialog.templates': 'Layout templates',
    'metroWayfindingEditor.projectDialog.title': 'Template library and import',
    'metroWayfindingEditor.row.first': 'First row',
    'metroWayfindingEditor.row.second': 'Second row',
    'metroWayfindingEditor.segment.boxed': 'Boxed text',
    'metroWayfindingEditor.segment.boxedShort': 'Box',
    'metroWayfindingEditor.segment.chooseLineColor':
      'Choose line color (also fills the line number)',
    'metroWayfindingEditor.segment.insertBoxed': 'Add box at cursor',
    'metroWayfindingEditor.segment.insertLine': 'Add line number at cursor',
    'metroWayfindingEditor.segment.line': 'Line number',
    'metroWayfindingEditor.segment.text': 'Text segment',
    'metroWayfindingEditor.space.fixed': 'Fixed width',
    'metroWayfindingEditor.space.flex': 'Share remaining width',
    'metroWayfindingEditor.space.flexNote':
      'All Share remaining width spacers split the available space evenly.',
    'metroWayfindingEditor.space.mode': 'Space mode',
    'metroWayfindingEditor.space.width': 'Width (16 px units)',
    'metroWayfindingEditor.status.parsing': 'Parsing',
    'metroWayfindingEditor.status.parsingFiles': 'Parsing files',
    'metroWayfindingEditor.stripePosition.bottom': 'Bottom',
    'metroWayfindingEditor.stripePosition.left': 'Left',
    'metroWayfindingEditor.stripePosition.right': 'Right',
    'metroWayfindingEditor.suffix.label': 'Subscript',
    'metroWayfindingEditor.suffix.placeholder': 'Sub',
    'metroWayfindingEditor.suffix.remove': 'Remove this subscript',
    'metroWayfindingEditor.suggestion.acceptAria': 'Accept suggestion: {suggestion}',
    'metroWayfindingEditor.suggestion.acceptTitle': 'Accept suggestion (Tab)',
    'metroWayfindingEditor.tab.childCount': '{count} children',
    'metroWayfindingEditor.text.addMainRow': 'Add main text row',
    'metroWayfindingEditor.text.addRowAria': 'Add text row',
    'metroWayfindingEditor.text.addSecondaryRow': 'Add secondary text row',
    'metroWayfindingEditor.text.deleteRow': 'Delete text row',
    'metroWayfindingEditor.text.deleteRowAria': 'Delete row {index}',
    'metroWayfindingEditor.text.dynamicFontSize': 'Dynamic font size',
    'metroWayfindingEditor.text.main': 'Main text',
    'metroWayfindingEditor.text.mainRowLabel': 'Row {index} main text',
    'metroWayfindingEditor.text.metrics': 'Main {main} · Secondary {secondary}',
    'metroWayfindingEditor.text.moveRowDownAria': 'Move row {index} down',
    'metroWayfindingEditor.text.moveRowUpAria': 'Move row {index} up',
    'metroWayfindingEditor.text.rowHeader': 'Row {index} · {kind}',
    'metroWayfindingEditor.text.rowsAria': 'Text rows',
    'metroWayfindingEditor.text.secondary': 'Secondary text',
    'metroWayfindingEditor.text.secondaryRowLabel': 'Row {index} secondary text',
    'metroWayfindingEditor.toolbar.title': 'Layout and appearance',
    'metroWayfindingEditor.writing.horizontal': 'Horizontal',
    'metroWayfindingEditor.writing.horizontalText': 'Horizontal',
    'metroWayfindingEditor.writing.vertical': 'Vertical',
    'metroWayfindingEditor.writing.verticalText': 'Vertical',
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
    'operations.featuredNext': 'Next featured update',
    'operations.featuredPage': 'View featured update {index}',
    'operations.featuredPages': 'Featured update pages',
    'operations.featuredPrevious': 'Previous featured update',
    'operations.feedAria': 'Updates list',
    'operations.itemCount': '{count} items',
    'operations.latestTitle': 'Latest Updates',
    'operations.noStrongReminder': 'No active reminders',
    'operations.noTripReminder': 'No trip reminders',
    'operations.remindersAria': 'Important reminders',
    'operations.serverStatus.latency': 'Latency',
    'operations.serverStatus.offline': 'Offline',
    'operations.serverStatus.online': 'Online',
    'operations.serverStatus.openPlayers': 'View player locations',
    'operations.serverStatus.players': 'Players',
    'operations.serverStatus.title': 'Server Status',
    'operations.serverStatus.unknown': 'Unknown',
    'operations.serverStatusAria': 'Server status and online players',
    'operations.social.afdian': 'Afdian',
    'operations.social.bilibili': 'Bilibili',
    'operations.social.qq': 'QQ Group',
    'operations.social.qqChannel': 'QQ Channel',
    'operations.social.wechat': 'WeChat',
    'operations.socialAria': 'Social and community links',
    'operations.startsAt': 'Starts at {date}',
    'operations.strongReminder': 'Important reminders',
    'operations.validUntil': 'Valid until {date}',
    'operationRelatedPois.count': '{count} POIs',
    'operationRelatedPois.fallback': 'Map place',
    'operationRelatedPois.title': 'Related places',
    'operationToc.collapse': 'Collapse {title}',
    'operationToc.expand': 'Expand {title}',
    'operationToc.title': 'Contents',
    'page.account': 'Account Settings',
    'page.ask': 'Ask',
    'page.map': 'Map Explore',
    'page.offline': 'Offline',
    'page.operations': 'Updates',
    'page.scheduleSearch': 'Schedule Search',
    'page.search': 'Search',
    'page.services': 'More Services',
    'page.changelog': 'Version Updates',
    'page.faq': 'Help & FAQ',
    'page.roadMaterials': 'Road Sign Materials',
    'page.telegraph': 'Telegraph Experience',
    'page.transitMaterials': 'Transit Signage',
    'page.transitNetworkHealth': 'Transit Network Health',
    'page.ticketOrder': 'Ticket Order',
    'page.travel': 'Travel',
    'page.travelScreen': 'Operations Board',
    'poiFacility.add': 'Add facility',
    'poiFacility.descriptionLabel': 'Description',
    'poiFacility.descriptionPlaceholder': 'e.g. Accessible elevator on the east side of level 1',
    'poiFacility.hint': 'Icon and description',
    'poiFacility.icon.accessible': 'Accessible',
    'poiFacility.icon.childCare': 'Baby care',
    'poiFacility.icon.elevator': 'Elevator',
    'poiFacility.icon.escalator': 'Escalator',
    'poiFacility.icon.info': 'Info',
    'poiFacility.icon.luggage': 'Luggage storage',
    'poiFacility.icon.medical': 'Medical',
    'poiFacility.icon.parking': 'Parking',
    'poiFacility.icon.pets': 'Pets',
    'poiFacility.icon.power': 'Charging',
    'poiFacility.icon.restaurant': 'Dining',
    'poiFacility.icon.shopping': 'Shopping',
    'poiFacility.icon.smoking': 'Smoking area',
    'poiFacility.icon.wc': 'Restroom',
    'poiFacility.icon.wifi': 'Wi-Fi',
    'poiFacility.iconLabel': 'Facility icon',
    'poiFacility.removeAria': 'Remove facility {index}',
    'poiFacility.removeTitle': 'Remove facility',
    'poiFacility.title': 'Facilities',
    'quickAction.rideCode': 'Ride Code',
    'quickAction.rideCodeLoginRequired': 'Sign in to use the ride code',
    'quickAction.rideCodeUnavailable': 'Ride code is temporarily unavailable',
    'scheduleStopTable.aria': 'Stop times by station',
    'scheduleStopTable.arrival': 'Arrival',
    'scheduleStopTable.arrivalAria': 'Arrival time at {station}',
    'scheduleStopTable.departure': 'Departure',
    'scheduleStopTable.departureAria': 'Departure time at {station}',
    'scheduleStopTable.dwell': 'Dwell (min)',
    'scheduleStopTable.dwellAria': 'Dwell minutes at {station}',
    'scheduleStopTable.empty': 'No stop times yet',
    'scheduleStopTable.station': 'Station',
    'scheduleStopTable.stop': 'Stop',
    'scheduleStopTable.stopAria': 'Whether service stops at {station}',
    'globalSearch.action.ask': 'Ask',
    'globalSearch.action.askThis': 'Hand this to Ask',
    'globalSearch.action.clearInput': 'Clear input',
    'globalSearch.action.close': 'Close search',
    'globalSearch.action.newConversation': 'New conversation',
    'globalSearch.actionLabel': 'You can go straight to',
    'globalSearch.action.open': 'Search everything',
    'globalSearch.action.revert': 'Back to search',
    'globalSearch.action.search': 'Search',
    'globalSearch.action.send': 'Send',
    'globalSearch.assistant.answerTitle': 'Ask',
    'globalSearch.assistant.clear': 'Clear key',
    'globalSearch.assistant.configure': 'Configure key',
    'globalSearch.assistant.copy': 'Copy answer',
    'globalSearch.assistant.copied': 'Copied',
    'globalSearch.assistant.disclaimer':
      'Answers are generated by the model you configured. Check the site references.',
    'globalSearch.assistant.error': 'Ask returned no result. Showing site documentation instead.',
    'globalSearch.assistant.followUps': 'Follow-up questions',
    'globalSearch.assistant.followUpsLoading': 'Preparing follow-up suggestions…',
    'globalSearch.assistant.followUpsUnavailable': 'AI follow-up suggestions are unavailable.',
    'globalSearch.assistant.key': 'API key',
    'globalSearch.assistant.keyPlaceholder': 'Paste your API key',
    'globalSearch.assistant.model': 'Model',
    'globalSearch.assistant.needsKey': 'Configure a model key to use Ask',
    'globalSearch.assistant.networkError':
      'Network request failed. Check your connection and retry.',
    'globalSearch.assistant.provider': 'Provider',
    'globalSearch.assistant.references': 'References and links',
    'globalSearch.assistant.retry': 'Regenerate answer',
    'globalSearch.assistant.save': 'Save and ask',
    'globalSearch.assistant.setupDescription':
      'The key is stored only in this browser session and is cleared when the tab closes. This site does not record it.',
    'globalSearch.assistant.setupTitle': 'Configure Ask',
    'globalSearch.assistant.stop': 'Stop answering',
    'globalSearch.assistant.streaming': 'Answering…',
    'globalSearch.capability.account': 'Open account settings',
    'globalSearch.capability.faq': 'View help and FAQ',
    'globalSearch.capability.map': 'Open map',
    'globalSearch.capability.operations': 'View updates',
    'globalSearch.capability.rmp': 'Open RMP import',
    'globalSearch.capability.roadMaterials': 'Open road sign materials',
    'globalSearch.capability.schedule': 'Open schedule search',
    'globalSearch.capability.transitMaterials': 'Open transit signage',
    'globalSearch.docsFallback': 'Here is what the site documentation found',
    'globalSearch.docsFallbackEmpty':
      'The site documentation has no direct answer yet. Try different wording or view the help and FAQ.',
    'globalSearch.easterEgg.close': 'Close',
    'globalSearch.easterEgg.description':
      'The little figure in the icon was hand-drawn by Xinguang in December 2019, later redrawn as stickers, and then redrawn again as the outline and filled versions used by Ask.',
    'globalSearch.easterEgg.hint':
      'The original posts are still on Bilibili and Coolapk if you search for Xinguang and Tihai Sanren.',
    'globalSearch.easterEgg.title': 'About Ask',
    'globalSearch.emptyHint': 'Enter a place, schedule, update, or describe what you need',
    'globalSearch.liveResults': 'Live results',
    'globalSearch.mode.ask': 'Ask',
    'globalSearch.mode.search': 'Search',
    'globalSearch.noMatch': 'No matching results',
    'globalSearch.pageDisabled':
      'Ask is turned off in settings. You can re-enable it in account settings.',
    'globalSearch.placeholder': 'Search places, schedules, updates, or ask directly…',
    'globalSearch.placeholderAsk': 'Describe your question, press Enter to send…',
    'globalSearch.resultCount': '{count} results',
    'globalSearch.searchAll': 'Search everything for “{query}”',
    'globalSearch.status.askReady': 'Switched to Ask · press Enter to send',
    'globalSearch.status.askSoon':
      'Ask will support conversation after the model is connected. For now it uses site documentation.',
    'globalSearch.status.loadingData': 'Loading site data…',
    'globalSearch.status.searching': 'Searching…',
    'globalSearch.suggestion.account': 'Ride code will not open',
    'globalSearch.suggestion.aiLoading': 'Generating suggestions from this page…',
    'globalSearch.suggestion.aiOff': 'Suggestions currently come from site data.',
    'globalSearch.suggestion.aiSettings': 'Enable AI suggestions',
    'globalSearch.suggestion.aiUnavailable':
      'AI suggestions are unavailable; using site data instead.',
    'globalSearch.suggestion.highlightLine': 'Which interchanges are near this line?',
    'globalSearch.suggestion.highlightMarker': 'What is near {name}?',
    'globalSearch.suggestion.highlightStation': 'What facilities does {name} have?',
    'globalSearch.suggestion.operations': 'Typhoon service suspension notice',
    'globalSearch.suggestion.refresh': 'Refresh',
    'globalSearch.suggestion.route': 'How do I get to Lindong Port tomorrow?',
    'globalSearch.suggestion.schedule': 'Ferries to Lindong Port tomorrow',
    'globalSearch.suggestion.thisPage': 'How do I use this page?',
    'globalSearch.suggestion.title': 'Try one of these',
    'globalSearch.title': 'Search and Ask',
    'globalSearch.unavailable': 'Some data is unavailable',
    'globalSearch.viewAll': 'View all results',
    'search.open': 'Search',
    'shortcut.acceptSuggestion': 'Accept the completion suggestion',
    'shortcut.adminReview': 'Admin review list',
    'shortcut.close': 'Close shortcuts',
    'shortcut.deleteSelected': 'Delete the selected node or element',
    'shortcut.dismissLayers': 'Dismiss map overlays one layer at a time',
    'shortcut.duplicateElement': 'Duplicate the selected element',
    'shortcut.editor': 'Editor',
    'shortcut.exportProject': 'Export project files',
    'shortcut.firstLastSection': 'Jump to the first or last section',
    'shortcut.focusMapSearch': 'Focus map search',
    'shortcut.focusScheduleSearch': 'Focus timetable search',
    'shortcut.global': 'Global',
    'shortcut.globalSearch': 'Open global search',
    'shortcut.holdCtrl': 'Hold Ctrl',
    'shortcut.insertAppend': 'Append insertion',
    'shortcut.insertNearest': 'Insert at the nearest point',
    'shortcut.insertPrepend': 'Prepend insertion',
    'shortcut.lineEditor': 'Line map editor',
    'shortcut.lineEditor.toolMove': 'Move tool',
    'shortcut.lineEditor.toolPan': 'Pan tool',
    'shortcut.lineEditor.toolStation': 'Station tool',
    'shortcut.lineEditor.toolWaypoint': 'Waypoint tool',
    'shortcut.listBulk': 'Run the bulk action on selected items',
    'shortcut.listNavigate': 'Move between list items',
    'shortcut.listOpen': 'Open the current item',
    'shortcut.listSelect': 'Select or deselect the current item',
    'shortcut.map': 'Map',
    'shortcut.moveElement': 'Reorder the selected element',
    'shortcut.openMenu': 'Shortcut guide',
    'shortcut.openTemplateLibrary': 'Open the template library or import',
    'shortcut.documentToc': 'Document outline',
    'shortcut.planFocusedMarker': 'Plan a route to this marker',
    'shortcut.planJourney': 'Plan a journey',
    'shortcut.previewMaterial': 'Generate or refresh the preview',
    'shortcut.redo': 'Redo',
    'shortcut.resetFilters': 'Clear all filters',
    'shortcut.resetMapView': 'Reset the map view',
    'shortcut.reverseElements': 'Reverse element order',
    'shortcut.save': 'Save',
    'shortcut.saveAndBack': 'Save and go back',
    'shortcut.searchNearby': 'Search near the current place',
    'shortcut.searchResults': 'Move between search results',
    'shortcut.sections': 'Jump between sections',
    'shortcut.swapRouteEndpoints': 'Swap route endpoints',
    'shortcut.switchDataSource': 'Switch between manual and line data',
    'shortcut.switchRow': 'Switch the active row (two-row layout)',
    'shortcut.switchTemplate': 'Switch style template',
    'shortcut.title': 'Keyboard Shortcuts',
    'shortcut.toggleFavorite': 'Favorite or unfavorite the current place',
    'shortcut.toggleLayers': 'Open or close the layer panel',
    'shortcut.toggleNavigation': 'Expand or collapse navigation',
    'shortcut.travel': 'Travel and timetables',
    'shortcut.undo': 'Undo',
    'shortcut.wayfinding': 'Wayfinding and material studio',
    'settings.accent.gray': 'Gray',
    'settings.accent.green': 'Teal',
    'settings.accent.label': 'Accent',
    'settings.accent.ldpass': 'Follow LDPASS',
    'settings.accent.red': 'Red',
    'settings.appearanceLanguage': 'Appearance and Language',
    'settings.assistant.allPages': 'Show the search and Ask entry on all pages',
    'settings.assistant.allPagesNote':
      'When enabled, secondary page headers also show the entry button for touch users. Primary pages always keep the entry.',
    'settings.assistant.aiSuggestions': 'Generate suggestions with AI',
    'settings.assistant.aiSuggestionsNote':
      'Uses your configured model to suggest items from the current page. When off, suggestions come from site data only.',
    'settings.assistant.clear': 'Clear key',
    'settings.assistant.enabled': 'Enable search and Ask',
    'settings.assistant.enabledNote':
      'Turning this off hides all entries and disables the shortcut. The saved key is kept.',
    'settings.assistant.encryptionNote':
      'The key is encrypted and stored on this device. Avoid saving it on shared devices.',
    'settings.assistant.group': 'Search and Ask',
    'settings.assistant.configure': 'Configure model & MCP',
    'settings.assistant.configTitle': 'Search and Ask settings',
    'settings.assistant.configDescription': 'Configure the model key and MCP endpoint.',
    'settings.assistant.key': 'API key',
    'settings.assistant.keyPlaceholder': 'Paste your API key',
    'settings.assistant.model': 'Model',
    'settings.assistant.modelNote':
      'Model names may change. You can enter the currently available model name directly.',
    'settings.assistant.notConfigured': 'Not configured',
    'settings.assistant.provider': 'Provider',
    'settings.assistant.save': 'Save configuration',
    'settings.assistant.saved': 'Configured',
    'settings.assistant.savedEncrypted': 'Saved encrypted',
    'settings.assistant.savedSession': 'This session only',
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
    'settings.material.advanced': 'Translucent',
    'settings.material.balanced': 'Balanced',
    'settings.material.group': 'Interface Material',
    'settings.material.label': 'Material Mode',
    'settings.material.performance': 'Simple',
    'settings.material.thickness': 'Translucent Material Thickness',
    'settings.material.thicknessValue': '{value}%',
    'settings.motion.full': 'On',
    'settings.motion.group': 'Motion',
    'settings.motion.label': 'Motion',
    'settings.motion.reduced': 'Off',
    'settings.motion.system': 'Follow system',
    'settings.mobileActionRail.disabled': 'Off',
    'settings.mobileActionRail.enabled': 'On',
    'settings.mobileActionRail.group': 'Side Action Bar',
    'settings.mobileActionRail.label': 'Side action bar',
    'settings.mobileActionRail.left': 'Left',
    'settings.mobileActionRail.note':
      'Mobile only (width ≤ 760px). When enabled, top actions, title-bar buttons, bottom navigation, and the map toolbar move into the side rail; buttons collapse into “More” when space runs out.',
    'settings.mobileActionRail.position': 'Rail position',
    'settings.mobileActionRail.right': 'Right',
    'settings.mobileActionRail.topOffset': 'Top margin',
    'settings.mobileActionRail.topOffsetValue': '{value}px',
    'mobileActionRail.aria': 'Side action bar',
    'mobileActionRail.more': 'More',
    'mobileActionRail.overflowAria': 'More actions',
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
    'materialStudio.history': 'Material history',
    'materialStudio.preview': 'Preview',
    'materialStudio.updatePreview': 'Update preview',
    'materialStudio.submitReview': 'Submit for review',
    'materialStudio.submitReviewManualHint':
      'Submit for review; download images without watermark once approved',
    'materialStudio.exportProject': 'Export project files',
    'materialStudio.download': 'Download image',
    'materialStudio.downloadWatermarkFree': 'Download without watermark',
    'materialStudio.loginRequired':
      'Sign in to submit for review and download images without watermark.',
    'materialStudio.serverUnverified': 'Server account not verified',
    'materialStudio.serverUnverifiedHint':
      'Verify your server account in account settings to download images without watermark',
    'materialStudio.loginRemoveWatermark': 'Sign in to remove watermark',
    'materialStudio.reviewRequired': 'Review required to remove watermark',
    'materialStudio.templateReadFailed': 'Unable to load material templates.',
    'materialStudio.noTemplates': 'No templates available.',
    'materialStudio.workspaceUnavailable': 'The material studio is temporarily unavailable.',
    'materialStudio.exportOnlyManual':
      'Only manually edited metro wayfinding signs can be exported as project files.',
    'materialStudio.offlineBlocked':
      'You are offline. This action requires an internet connection.',
    'materialStudio.noSyncTemplate': 'No templates available to sync.',
    'materialStudio.serverSubmitOnlineOnly':
      'Drafts in server data mode can only be submitted online.',
    'materialStudio.loginFirst': 'Please sign in first.',
    'materialStudio.localSyncFailed': 'Failed to sync local draft.',
    'materialStudio.localSyncedSubmitHint':
      'Local draft synced. An internet connection is still required to submit for review.',
    'materialStudio.networkError': 'Network error.',
    'materialStudio.localSyncNetworkError':
      'A network error occurred while syncing the local draft.',
    'materialStudio.noProjectStations': 'No stations available in the imported project.',
    'materialStudio.selectServerStation': 'Please select a server bus station first.',
    'materialStudio.selectProjectLine':
      'Please select at least one project line in the current map direction.',
    'materialStudio.selectDirectionLine': 'Please select at least one line in the same direction.',
    'materialStudio.selectServerLine': 'Please select a server line first.',
    'materialStudio.selectServerPlace': 'Please select a server place first.',
    'materialStudio.selectCoordinate': 'Please select the sign installation coordinates.',
    'materialStudio.selectLinkedMode': 'Please select {mode} first.',
    'materialStudio.previewFailed': 'Failed to generate preview.',
    'materialStudio.previewNetworkError': 'A network error occurred while generating the preview.',
    'materialStudio.noSubmittableTemplate': 'No template available to submit.',
    'materialStudio.saveCustomFailed': 'Unable to save the custom material.',
    'materialStudio.savedSubmitFailed': 'Material saved, but submitting for review failed.',
    'materialStudio.submitNetworkError': 'A network error occurred while submitting for review.',
    'materialStudio.downloadFailed': 'Failed to download material.',
    'materialStudio.downloadNetworkError':
      'A network error occurred while downloading the material.',
    'materialStudio.downloadPreviewNetworkError':
      'A network error occurred while downloading the watermarked preview.',
    'materialStudio.selectTemplateAndMode': 'Please select a template and {mode} first.',
    'materialStudio.serverVerifiedDownloadHint':
      'Verify your server account to download images without watermark. The watermarked preview has been downloaded instead.',
    'materialStudio.operationBusy': 'The current operation has not finished yet. Please wait.',
    'materialStudio.modeNoReviewNeeded': 'No review is required in {mode} mode.',
    'materialStudio.localDraft': 'Local draft',
    'materialStudio.workspaceEyebrow': 'Material Studio',
    'materialStudio.syncLocalDraft': 'Sync local draft',
    'materialStudio.templates': 'Templates',
    'materialStudio.networkData': 'Network data',
    'materialStudio.online': 'Online',
    'materialStudio.offline': 'Offline',
    'materialStudio.dimensions': 'Dimensions',
    'materialStudio.dataSource': 'Data source',
    'materialStudio.manualInput': 'Manual input',
    'materialStudio.roadTitle': 'Road sign generation',
    'materialStudio.transitTitle': 'Transit sign generation',
    'materialStudio.serverNetwork': 'Server network',
    'materialStudio.sampleProject': 'Sample project',
    'materialStudio.importedProject': 'Imported project',
    'materialStudio.projectStation': 'Project station',
    'materialStudio.projectCurrentStation': 'Current project station',
    'materialStudio.variant': 'Variant',
    'materialStudio.group.busStop': 'Bus stop sign',
    'materialStudio.group.busStopHorizontal': 'Bus stop sign (horizontal route details)',
    'materialStudio.group.metroLineMap': 'Metro line map (horizontal)',
    'materialStudio.group.layout': 'Layout',
    'materialStudio.group.style': 'Style',
    'materialStudio.layout.lineMap': 'Line map',
    'materialStudio.layout.stationName': 'Station name',
    'materialStudio.layout.direction': 'Direction',
    'materialStudio.layout.busTerminal': 'Origin & terminal',
    'materialStudio.layout.busOverview': 'Route overview',
    'materialStudio.layout.busDetail': 'Route details',
    'materialStudio.projectLineCount': '{count} project lines',
    'materialStudio.busLineCount': '{count} bus lines',
    'materialStudio.stationProjectLines': 'Project lines at current station',
    'materialStudio.projectLines': 'Project lines',
    'materialStudio.mapDrivingDirection': 'Map driving direction',
    'materialStudio.roadDrivingDirection': 'Road driving direction',
    'materialStudio.stationProperties': 'Station properties',
    'materialStudio.originStation': 'Origin station',
    'materialStudio.terminalStation': 'Terminal station',
    'materialStudio.sameDirectionLines': 'Lines in the same direction',
    'materialStudio.singleSelect': '(Single select)',
    'materialStudio.maxLines': '(Up to {count})',
    'materialStudio.destinationPending': 'Destination to be maintained',
    'materialStudio.directionTo': 'To',
    'materialStudio.originAtStation': 'Originates at this station',
    'materialStudio.terminalAtStation': 'Terminates at this station',
    'materialStudio.noProjectConnection':
      'The current project station has no line connection in this map direction.',
    'materialStudio.noDirectionLine': 'No lines available in the current direction.',
    'materialStudio.configureLineName': 'Configure line name',
    'materialStudio.serverLines': 'Server lines',
    'materialStudio.stationsCount': '{count} stations',
    'materialStudio.notOpened': 'Not opened',
    'materialStudio.serverStations': 'Server stations',
    'materialStudio.searchServerPlace': 'Search server places',
    'materialStudio.serverPlaces': 'Server places',
    'materialStudio.coordinateX': 'Installation coordinate X',
    'materialStudio.coordinateZ': 'Installation coordinate Z',
    'materialStudio.pickCoordinateHint':
      'Pick the sign installation coordinates in the server map preview',
    'materialStudio.clickMapCoordinate':
      'Click the map to set installation coordinates · X {x} / Z {z}',
    'materialStudio.fillCoordinateFirst':
      'Fill in the installation coordinates, then fine-tune on the map',
    'materialStudio.previewAria': 'Material preview',
    'materialStudio.previewAlt': '{title} preview',
    'materialStudio.closePreview': 'Close preview',
    'materialStudio.historyTitle': 'My Material History',
    'materialStudio.historyHint':
      'Submitted custom materials are kept here and available for download once approved.',
    'materialStudio.closeHistory': 'Close material history',
    'materialStudio.submittedAt': 'Submitted at {time}',
    'materialStudio.reviewedAt': 'Reviewed at {time}',
    'materialStudio.noSubmittedYet': 'You have not submitted any custom material yet.',
    'materialStudio.previewWatermark': 'Preview contains watermark',
    'materialStudio.updating': 'Updating',
    'materialStudio.noPreviewYet': 'No preview generated yet',
    'materialStudio.signHeight': 'Sign height (in 128-pixel cells)',
    'materialStudio.signLength': 'Sign length (in 128-pixel cells)',
    'materialStudio.signWidth': 'Sign width (in 128-pixel cells)',
    'materialStudio.widthMeters': 'Width (meters)',
    'materialStudio.heightMeters': 'Height (meters)',
    'materialStudio.alignmentUnit': 'Alignment unit (pixels)',
    'materialStudio.alignToMapSize': 'Align to whole map-pixel size',
    'materialStudio.firstBus': 'First bus',
    'materialStudio.lastBus': 'Last bus',
    'materialStudio.projectNoTimeHint':
      'Project data does not include service hours. Leave blank to hide this row.',
    'materialStudio.pleaseSelect': 'Please select',
    'materialStudio.colorPaletteAria': 'Color palette for {label}',
    'materialStudio.colorHexAria': 'Hex color for {label}',
    'materialStudio.orientationRight': 'Right on map',
    'materialStudio.orientationLeft': 'Left on map',
    'materialStudio.orientationUp': 'Up on map',
    'materialStudio.orientationDown': 'Down on map',
    'materialStudio.draftStatus.draft': 'Draft',
    'materialStudio.draftStatus.pending_review': 'Pending review',
    'materialStudio.draftStatus.approved': 'Approved',
    'materialStudio.draftStatus.rejected': 'Rejected',
    'materialStudio.syncStatus.pending': 'Pending sync',
    'materialStudio.syncStatus.syncing': 'Syncing',
    'materialStudio.syncStatus.synced': 'Synced',
    'materialStudio.syncStatus.conflict': 'Conflict',
    'materialStudio.syncStatus.failed': 'Sync failed',
    'materialStudio.emptyFields': 'No field content filled in',
    'materialStudio.watermarkedPreviewSuffix': '-watermarked preview',
    'telegraph.stage.header': 'Fill header',
    'telegraph.stage.recipient': 'Fill recipient info',
    'telegraph.stage.code': 'Print code',
    'telegraph.stage.message': 'Print message',
    'telegraph.stage.footer': 'Print footer',
    'telegraph.stage.stamp': 'Apply telegraph stamp',
    'telegraph.stage.envelope': 'Insert into envelope',
    'telegraph.newLetter': 'Write another',
    'telegraph.history': 'History',
    'telegraph.startWriting': 'Start writing',
    'telegraph.replayAnimation': 'Replay animation',
    'telegraph.continueScroll': 'Continue scrolling',
    'telegraph.continueScrollStart': 'Continue scrolling to start writing',
    'telegraph.simulateSend': 'Simulate sending',
    'telegraph.skipAnimation': 'Skip animation',
    'telegraph.continueConfirm': 'Continue scrolling to confirm',
    'telegraph.province': 'Province',
    'telegraph.city': 'City',
    'telegraph.county': 'County',
    'telegraph.otherLocation': 'Other destination',
    'telegraph.recipientInfo': 'Recipient info',
    'telegraph.body': 'Telegraph body',
    'telegraph.senderName': 'Sender name or visitor IP',
    'telegraph.senderAddress': 'Sender address',
    'telegraph.senderLock': 'Sign in to edit sender info',
    'telegraph.billableGrids': 'Billable grids',
    'telegraph.amount': 'Amount',
    'telegraph.billingRule': '5 consecutive letters/numbers per grid',
    'telegraph.cellRecipient': 'Recipient info',
    'telegraph.cellBody': 'Telegraph body',
    'telegraph.noCellSelected': 'Current grid: none selected',
    'telegraph.flipEnvelope': 'Flip envelope',
    'telegraph.flipToFront': 'Flip to envelope front',
    'telegraph.flipToBack': 'Flip to envelope back',
    'telegraph.openEnvelope': 'Open envelope',
    'telegraph.insertEnvelope': 'Insert into envelope',
    'telegraph.envelopeFront': 'Telegraph envelope front',
    'telegraph.envelopeBack': 'Telegraph envelope back',
    'telegraph.openEnvelopeView': 'Open envelope to view receive paper',
    'telegraph.insertReceivePaper': 'Insert receive paper into envelope',
    'telegraph.receivePaper': 'Receive paper',
    'telegraph.sendPaper': 'Send paper',
    'telegraph.switchPaper': 'Switch paper',
    'telegraph.switchToSend': 'Switch to send paper',
    'telegraph.switchToReceive': 'Switch to receive paper',
    'telegraph.envelopeFlip': 'Flip envelope',
    'telegraph.code': 'Code',
    'telegraph.audio': 'Audio',
    'telegraph.sendPaperTemplate': 'Telegraph send paper template',
    'telegraph.sendPaperPreview': 'Telegraph send paper preview',
    'telegraph.enterDestination': 'Please fill in the destination first.',
    'telegraph.enterRecipient': 'Please fill in recipient info first.',
    'telegraph.enterBody': 'Please fill in the telegraph body first.',
    'telegraph.recipientOverflow': 'Recipient info exceeds the {count} available grids.',
    'telegraph.bodyOverflow': 'Telegraph body exceeds the {count} available grids.',
    'telegraph.unsupported': 'These characters are not supported: {chars}',
    'telegraph.envelopeDone': 'Telegraph printed and inserted into envelope.',
    'telegraph.skippedDone': 'Animation skipped. Telegraph inserted into envelope.',
    'telegraph.imageFailed': 'Failed to generate telegraph image.',
    'telegraph.sendPaperFile': 'Send paper',
    'telegraph.receivePaperFile': 'Receive paper',
    'telegraph.imageDownloadFailed': 'Failed to download telegraph image.',
    'telegraph.codeFile': 'Telegraph code',
    'telegraph.filePrefix': 'Telegraph',
    'telegraph.welcomeTitle': 'While the “slow telegram” is still here, send a memory to yourself',
    'telegraph.welcomeP1': 'A video made people rediscover the long-forgotten telegram service.',
    'telegraph.welcomeP2':
      'Today, even if only one telegram counter remains in all of China, people still make time for a slow telegram that must be encoded, stamped, and sealed.',
    'telegraph.welcomeP3':
      'So write your message right here, and let it carry your thoughts and feelings along the long-silent route...',
    'telegraph.confirmTitle': 'Confirm telegram content',
    'telegraph.closeConfirm': 'Close confirmation window',
    'telegraph.destination': 'Destination',
    'telegraph.recipient': 'Recipient',
    'telegraph.notFilled': 'Not filled',
    'telegraph.confirmBody': 'Message',
    'telegraph.confirmHint':
      'After confirming, a simulated animation of filling, printing, folding, and inserting into the envelope will begin.',
    'telegraph.backEdit': 'Back to edit',
    'telegraph.confirmSend': 'Confirm and send',
    'telegraph.localHistory': 'Local history',
    'telegraph.deleteHistory': 'Delete history record',
    'telegraph.unnamed': 'Untitled telegram',
    'telegraph.noHistory': 'No local history yet.',
    'telegraph.cellAria': 'Grid {count} of {label}',
    'telegraph.toolbarAria': 'Telegraph actions',
    'transitLineBrowser.filterAria': 'Line filters',
    'transitLineBrowser.listAria': 'Line list',
    'transitLineBrowser.modeRailway': 'Regional rail',
    'transitLineBrowser.summaryAria': 'Legacy line data summary',
    'transitHealth.dimension.topology': 'Topology',
    'transitHealth.dimension.operations': 'Operations',
    'transitHealth.dimension.scale': 'Scale',
    'transitHealth.dimension.places': 'Place coverage',
    'transitHealth.dimension.demand': 'Demand proxy',
    'transitHealth.dimension.data_quality': 'Data quality',
    'transitHealth.analysisEyebrow': 'Network Planning Analysis',
    'transitHealth.subtitle':
      'Combines published line topology, service hours, road nodes, and categorized place density. Planning proxies cannot replace real ridership, headways, capacity, or cost data.',
    'transitHealth.onlineSnapshot': 'Online snapshot',
    'transitHealth.offlineSnapshot': 'Offline snapshot',
    'transitHealth.dataTime': 'Data as of',
    'transitHealth.noLines':
      'No published transit lines yet. Network statistics cannot be generated.',
    'transitHealth.filterAria': 'Filter by transit mode',
    'transitHealth.modeLegend': 'Transit mode',
    'transitHealth.scopeCurrent': 'Current scope: ',
    'transitHealth.scopeAll': 'All transit modes',
    'transitHealth.demandWithLines': 'Demand analysis includes existing lines',
    'transitHealth.demandPotentialOnly': 'Analyze place potential only',
    'transitHealth.mLines': 'Lines',
    'transitHealth.mTopologyNote': '{count} form continuous segments',
    'transitHealth.mStations': 'Stations',
    'transitHealth.mLocatedNote': '{rate} locatable',
    'transitHealth.mLength': 'Network length',
    'transitHealth.mLocatedSegNote': 'Estimated from {count} located segments',
    'transitHealth.mCoverage': 'Schedule coverage',
    'transitHealth.mScheduledNote': '{scheduled}/{total} lines',
    'transitHealth.mServiceSpan': 'Average service span',
    'transitHealth.mLateNote': '{count} lines run after 22:00',
    'transitHealth.mPlaceCoverage': 'Planning place coverage',
    'transitHealth.mPlacesNote': '{covered}/{total} places',
    'transitHealth.mRoadCoverage': 'Road node coverage',
    'transitHealth.mRoadsNote': '{count} road samples',
    'transitHealth.mDemandAttainment': 'Demand attainment',
    'transitHealth.mPotentialDemand': 'Total potential demand',
    'transitHealth.mAttainedNote': '{attained}/{total} weighted demand reached',
    'transitHealth.mPotentialHint':
      'Weighted by real categorized place density; line coverage ignored',
    'transitHealth.chartEyebrow': 'Charts',
    'transitHealth.chartTitle': 'Scale, Operations & Coverage',
    'transitHealth.locatedSampleHint': 'Places and distances use located stations only',
    'transitHealth.opEyebrow': 'Operators',
    'transitHealth.opTitle': 'Metrics & Ranking',
    'transitHealth.opCountHint': '{count} operators · Click a column header to sort',
    'transitHealth.opTableNote':
      'Bus lines are assigned network-wide. Component counts by operator are attribution-only and do not indicate disconnection or forced transfers.',
    'transitHealth.colOperator': 'Operator',
    'transitHealth.colStations': 'Stations',
    'transitHealth.colStationsTitle': 'Deduplicated by stable station IDs covered by the operator',
    'transitHealth.colLines': 'Lines',
    'transitHealth.colAvgConnectivity': 'Avg connectivity',
    'transitHealth.colConnectivityTitle':
      'Average number of distinct directly adjacent stations across the network',
    'transitHealth.colConnectivityWeight': 'Connectivity weight',
    'transitHealth.colWeightTitle': 'Average number of distinct lines carried by adjacent segments',
    'transitHealth.colLinesPerSegment': 'Lines per segment',
    'transitHealth.colSharedSegments': 'Shared segments',
    'transitHealth.colScheduleCoverage': 'Schedule coverage',
    'transitHealth.colServiceSpan': 'Avg service span',
    'transitHealth.opComponentsNote': '{count} components · {transfer} cross-operator stations',
    'transitHealth.rankLabel': 'Rank {rank}',
    'transitHealth.methodEyebrow': 'Methodology',
    'transitHealth.methodTitle': 'Metrics & Analysis Sources',
    'transitHealth.noMockHint': 'No simulated ridership',
    'transitHealth.dmTopology': 'Topology',
    'transitHealth.dmTopologyDetail':
      'Continuous station sequences form undirected edges; connectivity, shared segments, transfer stations, and connected components are computed.',
    'transitHealth.dmOperations': 'Service hours',
    'transitHealth.dmOperationsDetail':
      'First/last trips are preferred; schedule boundaries are used as fallback. Overnight lines roll to the next day.',
    'transitHealth.dmScale': 'Spatial scale',
    'transitHealth.dmScaleDetail':
      'Station names and modes are bound to map coordinates; straight segment lengths, spacing, and coverage are estimated.',
    'transitHealth.dmPlaces': 'Place coverage',
    'transitHealth.dmPlacesDetail':
      'Share of residential, employment, education, medical, daily-life, culture/sports, and external-transport places within station catchments.',
    'transitHealth.dmDemand': 'Demand proxy',
    'transitHealth.dmDemandDetail':
      'Toggle between place clustering and existing-line reach. Demand attainment uses category weights for planning review only; it is not a ridership forecast.',
    'transitHealth.dmRoads': 'Road coverage',
    'transitHealth.dmRoadsDetail':
      'Map road nodes define the coverage boundary. Nodes are not full road geometry and are not used for precise mileage.',
    'transitHealth.sugEyebrow': 'Heuristics',
    'transitHealth.sugTitle': 'Network Suggestions',
    'transitHealth.sugMergedHint': 'Identical suggestions are merged across operators',
    'transitHealth.sugEmpty':
      'No preset heuristic thresholds were triggered in this slice. This does not verify service quality.',
    'transitHealth.targetItem': 'Matched items',
    'transitHealth.viewAllTargets': 'View all {count}',
    'transitHealth.dialogTargetLabel': 'Matched items',
    'transitHealth.itemCount': '{count} items',
    'transitHealth.dialogClose': 'Close',
    'transitHealth.dialogCloseAria': 'Close matched items list',
    'transitHealth.searchTargets': 'Search matched items',
    'transitHealth.searchPlaceholder': 'Search lines, stations, segments, or places',
    'transitHealth.noMatchedTargets': 'No matched items.',
    'transitHealth.kindOperator': 'Operator',
    'transitHealth.kindLine': 'Line',
    'transitHealth.kindStation': 'Station',
    'transitHealth.kindSegment': 'Segment',
    'transitHealth.kindPlace': 'Place',
    'transitHealth.kindCategory': 'Place category',
    'transitHealth.kindRoad': 'Road',
    'transitHealth.moreOperators': 'and {remaining} more',
    'transitHealth.cModeTitle': 'Mode composition',
    'transitHealth.cModeSubtitle': 'Line counts and network share',
    'transitHealth.cTotalLines': '{count} lines total: {details}',
    'transitHealth.cLinesUnit': 'lines',
    'transitHealth.cHoursTitle': 'Average service span',
    'transitHealth.cHoursSubtitle': 'Lines with parsable first/last times only',
    'transitHealth.cNoSchedule': 'No schedule',
    'transitHealth.cPlaceTitle': 'Categorized place coverage',
    'transitHealth.cPlaceSubtitle': 'Share of categorized places within station catchments',
    'transitHealth.cPlaceRate': 'Place coverage rate',
    'transitHealth.cPlaceEntered':
      'planning places are within the current mode’s station catchments.',
    'transitHealth.cHotspotTitle1': 'Line demand hotspots',
    'transitHealth.cHotspotTitle2': 'Place potential centers',
    'transitHealth.cHotspotSub1':
      'Weighted by categorized place density reached by existing stations',
    'transitHealth.cHotspotSub2': 'Existing lines ignored; based on categorized place clustering',
    'transitHealth.cDemandRate': 'Demand attainment',
    'transitHealth.cAttained': '{attained} / {total} weighted demand proxy reached.',
    'transitHealth.cNearbyCount': '{value} · {count} places',
    'transitHealth.cAround': 'Around {place}',
    'transitHealth.cHotspotEmpty': 'No demand hotspot samples available.',
    'transitHealth.cOperatorTitle': 'Operator coverage',
    'transitHealth.cOperatorSubtitle':
      'Top eight by station count, deduplicated by stable station ID',
    'transitHealth.cOperatorBarLabel': '{stations} stations · {lines} lines',
    'transitNetworkSource.title': 'Network data',
    'transitNetworkSource.origin.sample': 'RMP gallery project',
    'transitNetworkSource.origin.rmp': 'RMP project',
    'transitNetworkSource.origin.server': 'Server',
    'transitNetworkSource.import.own': 'Import your own RMP project',
    'transitNetworkSource.import.default': 'Import RMP project',
    'transitNetworkSource.import.short': 'Import',
    'transitNetworkSource.import.project': 'Import project',
    'transitNetworkSource.sourceAria': 'Network data source',
    'transitNetworkSource.source.server': 'Server network',
    'transitNetworkSource.source.loading': 'Loading',
    'transitNetworkSource.source.sample': 'Sample network',
    'transitNetworkSource.source.imported': 'Imported project',
    'transitNetworkSource.localDraftName': 'Local draft network',
    'transitNetworkSource.summary.stationCount': '{count} stations',
    'transitNetworkSource.summary.stationsUnnamed': '{count} stations unnamed',
    'transitNetworkSource.summary.stationsNamed': 'All stations named',
    'transitNetworkSource.summary.lineCount': '{count} lines',
    'transitNetworkSource.summary.edgeCount': '{count} links',
    'transitNetworkSource.summary.source': 'Source: RMP gallery ·',
    'transitNetworkSource.status.persisting': 'Saving',
    'transitNetworkSource.status.persisted': 'Saved',
    'transitNetworkSource.status.gallerySample': 'Gallery sample',
    'transitNetworkSource.status.localOnly': 'This page only',
    'transitNetworkSource.palette.aria': '{count} line colors',
    'transitNetworkSource.action.fillStationNamesAria': 'Fill in {count} unnamed stations',
    'transitNetworkSource.action.fillStationNames': 'Name {count} stations',
    'transitNetworkSource.action.configureLineNames': 'Configure project line names',
    'transitNetworkSource.action.removeImported': 'Remove imported project',
    'transitNetworkSource.action.cancel': 'Cancel',
    'transitNetworkSource.action.saving': 'Saving',
    'transitNetworkSource.action.close': 'Close',
    'transitNetworkSource.error.fileTooLarge': 'RMP project files must be 5 MB or smaller.',
    'transitNetworkSource.error.notSignedIn':
      'Not signed in. This import only applies to the current page.',
    'transitNetworkSource.error.persistFailed': 'Failed to save the RMP project.',
    'transitNetworkSource.error.persistFailedLocalOnly':
      '{message} This import only applies to the current page.',
    'transitNetworkSource.error.readFailed': 'Failed to read the RMP project file.',
    'transitNetworkSource.error.deleteFailed': 'Failed to delete the saved network project.',
    'transitNetworkSource.error.saveLineNamesFailed': 'Failed to save line names.',
    'transitNetworkSource.error.saveStationNamesFailed': 'Failed to save station names.',
    'transitNetworkSource.error.sampleLoadFailed': 'The default sample network is unavailable.',
    'transitNetworkSource.error.sampleLoadFailedHint':
      '{message} You can still use the server network or import a local project.',
    'transitNetworkSource.notice.lineNamesSampleLocalOnly':
      'Line name changes for the sample project only apply to this page.',
    'transitNetworkSource.notice.lineNamesPendingPersist':
      'Line names only apply to this page; the project has not been saved yet.',
    'transitNetworkSource.notice.stationNamesSampleLocalOnly':
      'Station name changes for the sample project only apply to this page.',
    'transitNetworkSource.notice.stationNamesPendingPersist':
      'Station names only apply to this page; the project has not been saved yet.',
    'transitNetworkSource.lineName.title': 'Configure project line names',
    'transitNetworkSource.lineName.hintPart1': 'Line keys in RMP archives (e.g. ',
    'transitNetworkSource.lineName.hintPart2': ', ',
    'transitNetworkSource.lineName.hintPart3':
      ') are color names used for drawing only, not line names. They are prefilled from the numeric part of each key (',
    'transitNetworkSource.lineName.hintPart4':
      ' → Line 2). Confirm or replace them with official names; the wayfinding "line number" template uses the names entered here.',
    'transitNetworkSource.lineName.primaryAria': '{key} primary name',
    'transitNetworkSource.lineName.primaryPlaceholder': 'Primary name',
    'transitNetworkSource.lineName.secondaryAria': '{key} secondary name',
    'transitNetworkSource.lineName.secondaryPlaceholder': 'Secondary name',
    'transitNetworkSource.lineName.save': 'Save line names',
    'transitNetworkSource.stationName.title': 'Fill in unnamed stations',
    'transitNetworkSource.stationName.nearby': 'Nearby: {names}',
    'transitNetworkSource.stationName.nearbyUnavailable': 'Nearby station names unavailable',
    'transitNetworkSource.stationName.primaryAria': '{id} primary station name',
    'transitNetworkSource.stationName.primaryPlaceholder': 'Primary station name',
    'transitNetworkSource.stationName.secondaryAria': '{id} secondary station name',
    'transitNetworkSource.stationName.secondaryPlaceholder': 'Secondary station name',
    'transitNetworkSource.stationName.save': 'Save filled station names',
    'transitScreen.legacy': 'Legacy',
    'transitScreen.summaryAria': 'Coach board data summary',
    'transitScreen.upcomingAria': 'Upcoming trips',
    'transitScreen.viewTrips': 'View trips',
    'transitScreen.empty.unavailable': 'Screen data unavailable',
    'transitScreen.empty.noData': 'The legacy coach screen data source has no usable data yet.',
    'operation.contentTagsAria': 'Content tags',
    'operation.legacyBodyDescription':
      'The legacy system hosted details on external links. The new version keeps only the title, excerpt, and original entry.',
    'operation.legacyBodyTitle': 'This legacy operation post has no body content',
    'operation.legacyImageSource': 'Legacy image source: {url}',
    'operation.openOriginal': 'Open original content',
    'operation.originalLink': 'Original link',
    'transitServiceNotice.activeCount': '{count} active alerts',
    'transitServiceNotice.history': 'Past coach alerts',
    'transitServiceNotice.itemCount': '{count} alerts',
    'transitServiceNotice.periodRange': '{start} – {end}',
    'transitServiceNotice.title': 'Coach service alerts',
    'admin.edit': 'Edit',
    'admin.editLine': 'Edit line',
    'admin.editPoi': 'Edit POI',
    'admin.home.title': 'Admin console',
    'admin.home.description':
      'Enter a console by business domain. The account page only keeps this single entry.',
    'admin.editOperation': 'Edit operation post',
    'search.category.all': 'All',
    'search.category.lines': 'Lines',
    'search.category.operations': 'Updates',
    'search.category.poi': 'Map POI',
    'search.category.schedules': 'Schedules',
    'search.category.services': 'Services',
    'search.category.stations': 'Stations',
    'search.category.wiki': 'Wiki',
    'search.clear': 'Clear search',
    'search.emptyPrompt': 'Enter a keyword to search map POIs, schedules, updates, and services.',
    'search.facilityCount': '{count} facilities',
    'search.loading': 'Searching',
    'search.noCategoryResults': 'No matches in this category',
    'search.noMatch': 'No results matching "{query}"',
    'search.placeholder': 'Search place details, schedules, updates, or services',
    'search.resultCount': '{count} results',
    'search.results': 'Search Results',
    'search.resultFilters': 'Search result categories',
    'search.resultGroup.lines': 'Lines',
    'search.resultGroup.operations': 'Updates',
    'search.resultGroup.poi': 'Map POI',
    'search.resultGroup.player': 'Player location',
    'search.resultGroup.schedules': 'Schedules',
    'search.resultGroup.services': 'Services and Tools',
    'search.resultGroup.social': 'Community and social',
    'search.resultGroup.stations': 'Stations',
    'search.resultGroup.wiki': 'Lindong Wiki',
    'search.social.description': 'Official community and social links',
    'search.wiki.loading': 'Searching Lindong Wiki…',
    'search.wiki.updatedAt': 'Last edited',
    'search.stationExitCount': '{count} exits',
    'search.stopCount': '{count} stops',
    'search.unavailable': 'Map and schedule data are both unavailable',
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
    'toast.close': 'Dismiss notification',
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
    'travelSchedule.empty.unavailable': 'Schedule data unavailable',
    'travelSchedule.empty.noData': 'No unified schedule data is available right now.',
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
    'travelSchedule.journey.arrival': 'Arrive {time}',
    'travelSchedule.journey.availableAll': 'Fully bookable',
    'travelSchedule.journey.bookJoint': 'Joint booking · {count} legs',
    'travelSchedule.journey.combining': 'Combining…',
    'travelSchedule.journey.direct': 'Direct',
    'travelSchedule.journey.durationHours': '{hours} hr {minutes} min',
    'travelSchedule.journey.durationMinutes': '{minutes} min',
    'travelSchedule.journey.editTrip': 'Edit trip',
    'travelSchedule.journey.found': '{count} options found',
    'travelSchedule.journey.holding': 'Holding seats for all legs',
    'travelSchedule.journey.lineGroupAria': '{operator} line',
    'travelSchedule.journey.locking': 'Locking…',
    'travelSchedule.journey.missingEndpoints': 'Enter both origin and destination first.',
    'travelSchedule.journey.noneFound': 'No connectable trip options found.',
    'travelSchedule.journey.orderCreated': 'Joint booking succeeded. {count} order drafts created.',
    'travelSchedule.journey.orderFailed': 'Joint booking failed.',
    'travelSchedule.journey.partial': 'Some legs unavailable',
    'travelSchedule.journey.passThrough': 'Pass without stopping',
    'travelSchedule.journey.period': '{start} to {end}',
    'travelSchedule.journey.planCount': '{count} options',
    'travelSchedule.journey.planFailed': 'Failed to query journey options.',
    'travelSchedule.journey.planIndex': 'Option {index}',
    'travelSchedule.journey.planning': 'Combining trip options',
    'travelSchedule.journey.query': 'Find journey options',
    'travelSchedule.journey.queryOnly': 'Query only',
    'travelSchedule.journey.segmentUnavailable':
      'This option contains legs that are not currently on sale.',
    'travelSchedule.journey.serviceTrip': '{service} trip',
    'travelSchedule.journey.stopCount': '{count} stops',
    'travelSchedule.journey.stopsAria': '{line} stops',
    'travelSchedule.journey.swapEndpoints': 'Swap origin and destination',
    'travelSchedule.journey.tbd': 'TBD',
    'travelSchedule.journey.title': 'Journey Options',
    'travelSchedule.journey.transferCount': '{count} transfers',
    'travelSchedule.journey.transferDetail':
      '{from} → {to} · about {minutes} min (incl. {buffer} min buffer)',
    'travelSchedule.journey.tripCount': '{count} trips',
    'travelSchedule.journey.tripLabel': '{line} trip {code}',
    'travelSchedule.notice.aria': 'Schedule notice',
    'travelSchedule.notice.count': '{count} items',
    'travelSchedule.notice.title': 'Coach Notices',
    'travelSchedule.order.cancelConfirm': 'Cancel this order draft and release the held inventory?',
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
    'travelSchedule.reminder.detailDeparture': 'Departs {time}',
    'travelSchedule.reminder.detailFare': 'Fare {fare}',
    'travelSchedule.reminder.detailTrip': 'Trip {code}',
    'travelSchedule.reminder.titleWithTime': '{line} trip at {time}',
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
    'travelSchedule.trip.dayOffset': '+{count}d',
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
    'travel.screenDetail.empty': 'No matching trips',
    'travel.screenDetail.fare': 'Fare',
    'travel.screenDetail.filterAria': 'Trip filters',
    'travel.screenDetail.gate': 'Gate',
    'travel.screenDetail.line': 'Line',
    'travel.screenDetail.listAria': 'Trip list',
    'travel.screenDetail.noticeAria': 'Board notice',
    'travel.screenDetail.operator': 'Operator',
    'travel.screenDetail.past': 'Past',
    'travel.screenDetail.routes': 'Lines',
    'travel.screenDetail.runtime': 'Runtime',
    'travel.screenDetail.search': 'Search trips, lines, stations, or gates',
    'travel.screenDetail.searchClear': 'Clear trip search',
    'travel.screenDetail.station': 'Station',
    'travel.screenDetail.stationCount': '{count} stops',
    'travel.screenDetail.stationFlowAria': '{line} stops',
    'travel.screenDetail.stations': 'Stations',
    'travel.screenDetail.summaryAria': 'Operations board data summary',
    'travel.screenDetail.timeFilterAria': 'Time filter',
    'travel.screenDetail.title': 'Schedule Search',
    'travel.screenDetail.total': 'All',
    'travel.screenDetail.trip': 'Trips',
    'travel.screenDetail.trips': '{shown} / {total} trips',
    'travel.screenDetail.upcoming': 'Upcoming',
    'travel.services.subtitle':
      'Schedule search, line and station map, coach board, and future ticketing entry points',
    'travel.services.title': 'Travel Services',
    'travel.subtitle': 'Reminders, schedules, and future ticketing',
    'travel.ticketing.action': 'Planned',
    'travel.ticketing.detail':
      'Real e-tickets, check-in, refunds, and ride code integration will connect to LDPASS later.',
    'travel.ticketing.title': 'Tickets and Orders',
    'worldCoordinate.axis': '{axis} coordinate',
    'worldCoordinate.footerEmpty':
      'Enter X/Z or pick a reference place first; you can fill in Y above',
    'worldCoordinate.footerPick': 'Click the map to fill X/Z · Current {coordinate} · Y {y}',
    'worldCoordinate.title': 'World coordinates',
    'worldCoordinate.yInherited': 'Inherit default',
    'worldCoordinate.yPlaceholder': 'Leave blank to inherit the map default height',
  },
};

export function useI18n() {
  // 首帧必须与服务端保持稳定，挂载后再读取浏览器本地偏好以避免 hydration mismatch。
  const [locale, setLocale] = useState<LocaleCode>('zh-CN');

  useEffect(() => {
    const syncLocale = () => setLocale(readLocalLocalePreference().resolvedLocale);
    syncLocale();
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
        formatMessage(commonCatalogs[locale]?.[key] ?? commonCatalogs['zh-CN'][key] ?? key, values),
    }),
    [locale],
  );
}

function formatMessage(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
