import { randomUUID } from 'node:crypto';
import type {
  TicketableServiceKind,
  TravelTripInstance,
  TravelScheduleQueryResult,
  TravelScheduleRevision,
  TravelScheduleRevisionStatus,
  TravelScheduleValidationIssue,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import {
  canPublishTravelScheduleRevision,
  canRestoreTravelScheduleRevision,
  transitionTravelScheduleRevisionStatus,
} from '@yct/domain';
import { publishDomainEvent } from './app-event-bus';
import { clearTravelScheduleQueryCache, readTravelScheduleQuery } from './travel-schedules';
import {
  createTravelScheduleRevision,
  findTravelScheduleRevision,
  listTravelScheduleRevisions,
  publishTravelScheduleRevisionAtomically,
  updateTravelScheduleRevision,
  withTravelScheduleRevisionStatus,
} from './travel-schedule-revision-store';

export interface TravelScheduleRevisionActionResult {
  ok: boolean;
  revision?: TravelScheduleRevision;
  status?: number;
  error?: string;
  message?: string;
}

export type TravelScheduleTripEditableField =
  | 'tripCode'
  | 'serviceKind'
  | 'departureTime'
  | 'arrivalTime'
  | 'arrivalDayOffset'
  | 'lineName'
  | 'routeNote'
  | 'stationNames'
  | 'originStationName'
  | 'destinationStationName'
  | 'fareText'
  | 'operator'
  | 'bookingUrl'
  | 'runtimeText'
  | 'gateText'
  | 'vehicleTypeText'
  | 'vehicleModelText'
  | 'operatingDays'
  | 'availability'
  | 'sourcePath';

export type TravelScheduleTripUpdatePatch = Partial<
  Pick<TravelTripInstance, TravelScheduleTripEditableField>
>;

export async function listAdminTravelScheduleRevisions(): Promise<TravelScheduleRevision[]> {
  return listTravelScheduleRevisions();
}

export async function importCurrentTravelScheduleRevision(input: {
  actorId: string;
  sourceProviderId: string;
}): Promise<TravelScheduleRevisionActionResult> {
  const result = await readTravelScheduleQuery({ timeScope: 'all' }, { source: 'live' });
  if (!result.item) {
    return {
      ok: false,
      status: result.meta.sourceStatus === 'not_configured' ? 503 : 502,
      error: 'travel_schedule_unavailable',
      message: result.meta.message ?? '统一班次数据不可用。',
    };
  }

  const revision = await createTravelScheduleRevision({
    actorId: input.actorId,
    sourceProviderId: input.sourceProviderId,
    snapshot: result.item,
    validation: validateTravelScheduleSnapshot(result.item),
  });

  await emitEvent('TravelScheduleRevisionImported', input.actorId, {
    scheduleServiceId: revision.scheduleServiceId,
    revisionId: revision.revisionId,
    sourceProviderId: revision.sourceProviderId,
    sourceFiles: revision.sourceFiles,
    summary: countTravelScheduleItems(revision),
  });

  return { ok: true, revision };
}

export async function submitTravelScheduleRevision(input: {
  revisionId: string;
  actorId: string;
}): Promise<TravelScheduleRevisionActionResult> {
  const revision = await findTravelScheduleRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  if (revision.validation.errorCount > 0) {
    return invalidTransition('班次数据仍存在校验错误，不能提交审核。');
  }

  const transition = transitionTravelScheduleRevisionStatus(revision.status, 'pending_review');
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const now = new Date().toISOString();
  const updated = await updateTravelScheduleRevision(input.revisionId, (current) =>
    withTravelScheduleRevisionStatus(current, 'pending_review', {
      submittedBy: input.actorId,
      submittedAt: now,
    }),
  );

  if (updated) {
    await emitEvent('TravelScheduleRevisionSubmitted', input.actorId, {
      scheduleServiceId: updated.scheduleServiceId,
      revisionId: updated.revisionId,
      sourceProviderId: updated.sourceProviderId,
      summary: countTravelScheduleItems(updated),
    });
  }

  return { ok: true, revision: updated };
}

export async function reviewTravelScheduleRevision(input: {
  revisionId: string;
  actorId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}): Promise<TravelScheduleRevisionActionResult> {
  const revision = await findTravelScheduleRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  const nextStatus = input.decision === 'approved' ? 'approved' : 'rejected';
  const transition = transitionTravelScheduleRevisionStatus(revision.status, nextStatus);
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const now = new Date().toISOString();
  const updated = await updateTravelScheduleRevision(input.revisionId, (current) =>
    withTravelScheduleRevisionStatus(current, nextStatus, {
      reviewedBy: input.actorId,
      reviewedAt: now,
      reviewReason: input.reason,
    }),
  );

  if (updated) {
    await emitEvent('TravelScheduleRevisionReviewed', input.actorId, {
      scheduleServiceId: updated.scheduleServiceId,
      revisionId: updated.revisionId,
      decision: input.decision,
      reviewerId: input.actorId,
      reason: input.reason,
      nextStatus,
    });
  }

  return { ok: true, revision: updated };
}

export async function publishTravelScheduleRevision(input: {
  revisionId: string;
  actorId: string;
}): Promise<TravelScheduleRevisionActionResult> {
  const revision = await findTravelScheduleRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  const publishCheck = canPublishTravelScheduleRevision({
    revisionStatus: revision.status,
    validationErrorCount: revision.validation.errorCount,
  });
  if (!publishCheck.ok) {
    return invalidTransition(publishCheck.reason);
  }

  const transition = transitionTravelScheduleRevisionStatus(revision.status, 'published');
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const publishedAt = new Date().toISOString();
  const updated = await publishTravelScheduleRevisionAtomically(input.revisionId, (current) =>
    withTravelScheduleRevisionStatus(current, 'published', { publishedAt }),
  );

  if (updated) {
    const serviceKinds = getTravelScheduleServiceKinds(updated);
    clearTravelScheduleQueryCache();
    await emitEvent('TravelSchedulePublished', input.actorId, {
      scheduleServiceId: updated.scheduleServiceId,
      serviceKind: serviceKinds.length === 1 ? serviceKinds[0] : 'custom',
      serviceKinds,
      revisionId: updated.revisionId,
      publishedAt,
      tripInstanceCount: updated.trips.length,
    });
  }

  return { ok: true, revision: updated };
}

export async function restoreTravelScheduleRevision(input: {
  revisionId: string;
  actorId: string;
}): Promise<TravelScheduleRevisionActionResult> {
  const revision = await findTravelScheduleRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  const restoreCheck = canRestoreTravelScheduleRevision({
    revisionStatus: revision.status,
    validationErrorCount: revision.validation.errorCount,
  });
  if (!restoreCheck.ok) {
    return invalidTransition(restoreCheck.reason);
  }

  const publishedAt = new Date().toISOString();
  const updated = await publishTravelScheduleRevisionAtomically(input.revisionId, (current) =>
    withTravelScheduleRevisionStatus(current, 'published', { publishedAt }),
  );

  if (updated) {
    const serviceKinds = getTravelScheduleServiceKinds(updated);
    clearTravelScheduleQueryCache();
    await emitEvent('TravelSchedulePublished', input.actorId, {
      scheduleServiceId: updated.scheduleServiceId,
      serviceKind: serviceKinds.length === 1 ? serviceKinds[0] : 'custom',
      serviceKinds,
      revisionId: updated.revisionId,
      publishedAt,
      tripInstanceCount: updated.trips.length,
      restoredFromStatus: 'superseded',
    });
  }

  return { ok: true, revision: updated };
}

export async function archiveTravelScheduleRevision(input: {
  revisionId: string;
  actorId: string;
}): Promise<TravelScheduleRevisionActionResult> {
  const revision = await findTravelScheduleRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  if (revision.status === 'published') {
    return invalidTransition('当前发布中的班次数据版本不能直接归档，请先恢复或发布另一个版本。');
  }

  const transition = transitionTravelScheduleRevisionStatus(revision.status, 'archived');
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const archivedAt = new Date().toISOString();
  const previousStatus = revision.status;
  const updated = await updateTravelScheduleRevision(input.revisionId, (current) =>
    withTravelScheduleRevisionStatus(current, 'archived'),
  );

  if (updated) {
    await emitEvent('TravelScheduleRevisionArchived', input.actorId, {
      scheduleServiceId: updated.scheduleServiceId,
      revisionId: updated.revisionId,
      archivedBy: input.actorId,
      archivedAt,
      previousStatus: previousStatus as Exclude<TravelScheduleRevisionStatus, 'archived'>,
    });
  }

  return { ok: true, revision: updated };
}

export async function updateTravelScheduleTrip(input: {
  revisionId: string;
  tripInstanceId: string;
  actorId: string;
  patch: TravelScheduleTripUpdatePatch;
}): Promise<TravelScheduleRevisionActionResult> {
  const revision = await findTravelScheduleRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  if (!canEditTravelScheduleRevisionTripStatus(revision.status)) {
    return invalidTransition('当前班次版本状态不允许人工修正。');
  }

  const trip = revision.trips.find((item) => item.tripInstanceId === input.tripInstanceId);
  if (!trip) {
    return {
      ok: false,
      status: 404,
      error: 'travel_schedule_trip_not_found',
      message: '班次不存在。',
    };
  }

  const nextTrip = normalizeTravelScheduleTripPatch(trip, input.patch, revision.services);
  const changedFields = getChangedTravelScheduleTripFields(trip, nextTrip);
  if (changedFields.length === 0) {
    return { ok: true, revision };
  }

  const now = new Date().toISOString();
  const nextTrips = revision.trips.map((item) =>
    item.tripInstanceId === input.tripInstanceId ? nextTrip : item,
  );
  const publishedValidationError = getPublishedTravelScheduleMutationError(revision, nextTrips);
  if (publishedValidationError) {
    return invalidTransition(publishedValidationError);
  }
  const updated = await updateTravelScheduleRevision(input.revisionId, (current) =>
    applyTravelScheduleTripMutation(current, nextTrips),
  );

  if (updated) {
    if (updated.status === 'published') {
      clearTravelScheduleQueryCache();
    }
    await emitEvent('TravelScheduleTripEdited', input.actorId, {
      scheduleServiceId: updated.scheduleServiceId,
      revisionId: updated.revisionId,
      tripInstanceId: input.tripInstanceId,
      updatedBy: input.actorId,
      updatedAt: now,
      changedFields,
    });
  }

  return { ok: true, revision: updated };
}

export async function createTravelScheduleTrip(input: {
  revisionId: string;
  actorId: string;
  trip: TravelScheduleTripUpdatePatch &
    Pick<TravelTripInstance, 'serviceKind' | 'departureTime' | 'lineName' | 'stationNames'> & {
      availability: TravelTripInstance['availability'];
    };
}): Promise<TravelScheduleRevisionActionResult> {
  const revision = await findTravelScheduleRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  if (!canEditTravelScheduleRevisionTripStatus(revision.status)) {
    return invalidTransition('当前班次版本状态不允许新增班次。');
  }

  const createdAt = new Date().toISOString();
  const trip = buildCreatedTravelScheduleTrip(input.trip, revision.services);
  const nextTrips = [...revision.trips, trip];
  const publishedValidationError = getPublishedTravelScheduleMutationError(revision, nextTrips);
  if (publishedValidationError) {
    return invalidTransition(publishedValidationError);
  }
  const updated = await updateTravelScheduleRevision(input.revisionId, (current) =>
    applyTravelScheduleTripMutation(current, nextTrips),
  );

  if (updated) {
    if (updated.status === 'published') {
      clearTravelScheduleQueryCache();
    }
    await emitEvent('TravelScheduleTripCreated', input.actorId, {
      scheduleServiceId: updated.scheduleServiceId,
      revisionId: updated.revisionId,
      tripInstanceId: trip.tripInstanceId,
      serviceKind: trip.serviceKind,
      lineName: trip.lineName,
      createdBy: input.actorId,
      createdAt,
    });
  }

  return { ok: true, revision: updated };
}

export async function deleteTravelScheduleTrip(input: {
  revisionId: string;
  actorId: string;
  tripInstanceId: string;
}): Promise<TravelScheduleRevisionActionResult> {
  const revision = await findTravelScheduleRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  if (!canEditTravelScheduleRevisionTripStatus(revision.status)) {
    return invalidTransition('当前班次版本状态不允许删除班次。');
  }

  const trip = revision.trips.find((item) => item.tripInstanceId === input.tripInstanceId);
  if (!trip) {
    return {
      ok: false,
      status: 404,
      error: 'travel_schedule_trip_not_found',
      message: '班次不存在。',
    };
  }

  const deletedAt = new Date().toISOString();
  const nextTrips = revision.trips.filter((item) => item.tripInstanceId !== input.tripInstanceId);
  const publishedValidationError = getPublishedTravelScheduleMutationError(revision, nextTrips);
  if (publishedValidationError) {
    return invalidTransition(publishedValidationError);
  }
  const updated = await updateTravelScheduleRevision(input.revisionId, (current) =>
    applyTravelScheduleTripMutation(current, nextTrips),
  );

  if (updated) {
    if (updated.status === 'published') {
      clearTravelScheduleQueryCache();
    }
    await emitEvent('TravelScheduleTripDeleted', input.actorId, {
      scheduleServiceId: updated.scheduleServiceId,
      revisionId: updated.revisionId,
      tripInstanceId: trip.tripInstanceId,
      serviceKind: trip.serviceKind,
      lineName: trip.lineName,
      deletedBy: input.actorId,
      deletedAt,
    });
  }

  return { ok: true, revision: updated };
}

function normalizeTravelScheduleTripPatch(
  trip: TravelTripInstance,
  patch: TravelScheduleTripUpdatePatch,
  services: TravelScheduleRevision['services'],
): TravelTripInstance {
  const nextStationNames = normalizeStringList(patch.stationNames ?? trip.stationNames);
  const nextServiceKind = patch.serviceKind ?? trip.serviceKind;
  const nextServiceSummary =
    services.find((service) => service.kind === nextServiceKind) ??
    services.find((service) => service.kind === trip.serviceKind) ??
    null;
  const nextTrip: TravelTripInstance = {
    ...trip,
    tripCode: patch.tripCode === undefined ? trip.tripCode : optionalTrimmedString(patch.tripCode),
    serviceKind: nextServiceKind,
    serviceId: nextServiceSummary?.serviceId ?? trip.serviceId,
    serviceLabel: nextServiceSummary?.label ?? trip.serviceLabel,
    departureTime: patch.departureTime?.trim() || trip.departureTime,
    arrivalTime:
      patch.arrivalTime === undefined ? trip.arrivalTime : optionalTrimmedString(patch.arrivalTime),
    arrivalDayOffset: patch.arrivalDayOffset ?? trip.arrivalDayOffset,
    lineName: patch.lineName?.trim() || trip.lineName,
    routeNote:
      patch.routeNote === undefined ? trip.routeNote : optionalTrimmedString(patch.routeNote),
    stationNames: nextStationNames,
    originStationName:
      patch.originStationName === undefined
        ? patch.stationNames
          ? nextStationNames[0]
          : trip.originStationName
        : optionalTrimmedString(patch.originStationName),
    destinationStationName:
      patch.destinationStationName === undefined
        ? patch.stationNames
          ? nextStationNames.at(-1)
          : trip.destinationStationName
        : optionalTrimmedString(patch.destinationStationName),
    fareText: patch.fareText === undefined ? trip.fareText : optionalTrimmedString(patch.fareText),
    operator: patch.operator === undefined ? trip.operator : optionalTrimmedString(patch.operator),
    bookingUrl:
      patch.bookingUrl === undefined ? trip.bookingUrl : optionalTrimmedString(patch.bookingUrl),
    runtimeText:
      patch.runtimeText === undefined ? trip.runtimeText : optionalTrimmedString(patch.runtimeText),
    gateText: patch.gateText === undefined ? trip.gateText : optionalTrimmedString(patch.gateText),
    vehicleTypeText:
      patch.vehicleTypeText === undefined
        ? trip.vehicleTypeText
        : optionalTrimmedString(patch.vehicleTypeText),
    vehicleModelText:
      patch.vehicleModelText === undefined
        ? trip.vehicleModelText
        : optionalTrimmedString(patch.vehicleModelText),
    operatingDays:
      patch.operatingDays === undefined
        ? trip.operatingDays
        : normalizeStringList(patch.operatingDays),
    availability: patch.availability ?? trip.availability,
    sourcePath:
      patch.sourcePath === undefined ? trip.sourcePath : optionalTrimmedString(patch.sourcePath),
  };

  if (nextTrip.operatingDays?.length === 0) {
    nextTrip.operatingDays = undefined;
  }

  return nextTrip;
}

function getChangedTravelScheduleTripFields(
  previous: TravelTripInstance,
  next: TravelTripInstance,
): TravelScheduleTripEditableField[] {
  const fields: TravelScheduleTripEditableField[] = [
    'tripCode',
    'serviceKind',
    'departureTime',
    'arrivalTime',
    'arrivalDayOffset',
    'lineName',
    'routeNote',
    'stationNames',
    'originStationName',
    'destinationStationName',
    'fareText',
    'operator',
    'bookingUrl',
    'runtimeText',
    'gateText',
    'vehicleTypeText',
    'vehicleModelText',
    'operatingDays',
    'availability',
    'sourcePath',
  ];

  return fields.filter((field) => {
    const previousValue = previous[field];
    const nextValue = next[field];
    if (Array.isArray(previousValue) || Array.isArray(nextValue)) {
      return JSON.stringify(previousValue ?? []) !== JSON.stringify(nextValue ?? []);
    }

    return (previousValue ?? '') !== (nextValue ?? '');
  });
}

function buildCreatedTravelScheduleTrip(
  patch: TravelScheduleTripUpdatePatch &
    Pick<TravelTripInstance, 'serviceKind' | 'departureTime' | 'lineName' | 'stationNames'> & {
      availability: TravelTripInstance['availability'];
    },
  services: TravelScheduleRevision['services'],
): TravelTripInstance {
  const stationNames = normalizeStringList(patch.stationNames);
  const service =
    services.find((item) => item.kind === patch.serviceKind) ??
    services.find((item) => item.kind === 'custom') ??
    null;

  return {
    tripInstanceId: `manual_trip_${randomUUID()}`,
    tripCode: optionalTrimmedString(patch.tripCode),
    serviceId: service?.serviceId,
    serviceKind: patch.serviceKind,
    serviceLabel: service?.label ?? patch.serviceKind,
    departureTime: patch.departureTime.trim(),
    arrivalTime: optionalTrimmedString(patch.arrivalTime),
    arrivalDayOffset: patch.arrivalDayOffset,
    lineName: patch.lineName.trim(),
    routeNote: optionalTrimmedString(patch.routeNote),
    stationNames,
    originStationName: optionalTrimmedString(patch.originStationName) ?? stationNames[0],
    destinationStationName:
      optionalTrimmedString(patch.destinationStationName) ?? stationNames.at(-1),
    fareText: optionalTrimmedString(patch.fareText),
    operator: optionalTrimmedString(patch.operator),
    bookingUrl: optionalTrimmedString(patch.bookingUrl),
    runtimeText: optionalTrimmedString(patch.runtimeText),
    gateText: optionalTrimmedString(patch.gateText),
    vehicleTypeText: optionalTrimmedString(patch.vehicleTypeText),
    vehicleModelText: optionalTrimmedString(patch.vehicleModelText),
    operatingDays: normalizeOptionalStringList(patch.operatingDays),
    availability: patch.availability,
    sourcePath: optionalTrimmedString(patch.sourcePath),
  };
}

function applyTravelScheduleTripMutation(
  revision: TravelScheduleRevision,
  trips: TravelTripInstance[],
): TravelScheduleRevision {
  const nextServices = rebuildTravelScheduleServiceSummaries(revision.services, trips);
  const snapshot = buildTravelScheduleSnapshotForValidation(revision, trips, nextServices);
  const validation = validateTravelScheduleSnapshot(snapshot);
  const nextStatus = getTravelScheduleRevisionEditableStatus(
    revision.status,
    validation.errorCount,
  );
  const shouldResetReviewTrail =
    revision.status === 'pending_review' || revision.status === 'approved';

  return {
    ...revision,
    trips,
    services: nextServices,
    stationOptions: buildTravelScheduleStationOptions(trips),
    validation,
    status: nextStatus,
    submittedAt: shouldResetReviewTrail ? undefined : revision.submittedAt,
    submittedBy: shouldResetReviewTrail ? undefined : revision.submittedBy,
    reviewedAt: shouldResetReviewTrail ? undefined : revision.reviewedAt,
    reviewedBy: shouldResetReviewTrail ? undefined : revision.reviewedBy,
    reviewReason: shouldResetReviewTrail ? undefined : revision.reviewReason,
  };
}

function canEditTravelScheduleRevisionTripStatus(status: TravelScheduleRevisionStatus): boolean {
  return (
    status === 'imported' ||
    status === 'validation_failed' ||
    status === 'pending_review' ||
    status === 'approved' ||
    status === 'published' ||
    status === 'rejected'
  );
}

function getPublishedTravelScheduleMutationError(
  revision: TravelScheduleRevision,
  nextTrips: TravelTripInstance[],
): string | null {
  if (revision.status !== 'published') {
    return null;
  }

  const candidate = applyTravelScheduleTripMutation(revision, nextTrips);
  if (candidate.validation.errorCount === 0) {
    return null;
  }

  return '当前发布中的班次版本不能保存会产生校验错误的改动。';
}

function getTravelScheduleRevisionEditableStatus(
  status: TravelScheduleRevisionStatus,
  errorCount: number,
): TravelScheduleRevisionStatus {
  if (
    status === 'imported' ||
    status === 'validation_failed' ||
    status === 'pending_review' ||
    status === 'approved'
  ) {
    return errorCount > 0 ? 'validation_failed' : 'imported';
  }

  return status;
}

function normalizeOptionalStringList(values: string[] | undefined): string[] | undefined {
  const normalized = normalizeStringList(values);
  return normalized.length > 0 ? normalized : undefined;
}

function buildTravelScheduleSnapshotForValidation(
  revision: TravelScheduleRevision,
  trips: TravelTripInstance[],
  services = rebuildTravelScheduleServiceSummaries(revision.services, trips),
): TravelScheduleQueryResult {
  return {
    services,
    trips,
    serviceNotices: revision.serviceNotices,
    stationOptions: buildTravelScheduleStationOptions(trips),
    sourceFiles: revision.sourceFiles,
    notice: revision.notice,
  };
}

function rebuildTravelScheduleServiceSummaries(
  services: TravelScheduleRevision['services'],
  trips: TravelTripInstance[],
): TravelScheduleRevision['services'] {
  return services.map((service) => {
    const serviceTrips = trips.filter((trip) => trip.serviceKind === service.kind);
    const stations = new Set(serviceTrips.flatMap((trip) => trip.stationNames));
    return {
      ...service,
      tripCount: serviceTrips.length,
      stationCount: stations.size,
    };
  });
}

function buildTravelScheduleStationOptions(trips: TravelTripInstance[]): string[] {
  return Array.from(new Set(trips.flatMap((trip) => trip.stationNames))).sort((left, right) =>
    left.localeCompare(right, 'zh-Hans-CN'),
  );
}

function optionalTrimmedString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeStringList(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
}

function validateTravelScheduleSnapshot(
  snapshot: TravelScheduleQueryResult,
): TravelScheduleRevision['validation'] {
  const issues: TravelScheduleValidationIssue[] = [];
  const activeServices = snapshot.services.filter((service) => service.status === 'active');

  if (activeServices.length === 0) {
    issues.push(
      createTravelScheduleValidationIssue({
        count: 1,
        examples: snapshot.services
          .map((service) => `${service.label}：${service.status}`)
          .slice(0, 6),
        kind: 'no_active_service',
        message: '没有读取到已接入的可排班服务。',
        severity: 'error',
      }),
    );
  }

  if (snapshot.trips.length === 0) {
    issues.push(
      createTravelScheduleValidationIssue({
        count: 1,
        examples: snapshot.sourceFiles,
        kind: 'no_trips',
        message: '没有读取到任何真实班次。',
        severity: 'error',
      }),
    );
  }

  if (snapshot.sourceFiles.length === 0) {
    issues.push(
      createTravelScheduleValidationIssue({
        count: 1,
        examples: [],
        kind: 'source_unavailable',
        message: '班次快照没有记录来源文件，后续难以追踪数据来源。',
        severity: 'warning',
      }),
    );
  }

  const activeServicesWithoutTrips = activeServices.filter((service) => service.tripCount === 0);
  if (activeServicesWithoutTrips.length > 0) {
    issues.push(
      createTravelScheduleValidationIssue({
        count: activeServicesWithoutTrips.length,
        examples: activeServicesWithoutTrips.slice(0, 6).map((service) => service.label),
        kind: 'service_without_trips',
        message: `${activeServicesWithoutTrips.length} 个已接入服务当前没有班次。`,
        severity: 'warning',
      }),
    );
  }

  const tripsWithoutStations = snapshot.trips.filter((trip) => trip.stationNames.length < 2);
  if (tripsWithoutStations.length > 0) {
    issues.push(
      createTravelScheduleValidationIssue({
        count: tripsWithoutStations.length,
        examples: tripsWithoutStations
          .slice(0, 6)
          .map((trip) => trip.tripCode ?? trip.tripInstanceId),
        kind: 'trip_without_station',
        message: `${tripsWithoutStations.length} 个班次缺少完整起终点或经停站点。`,
        severity: 'warning',
      }),
    );
  }

  const errors = issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
  const warnings = issues
    .filter((issue) => issue.severity === 'warning')
    .map((issue) => issue.message);

  return {
    checkedAt: new Date().toISOString(),
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    issues,
    warnings,
  };
}

function countTravelScheduleItems(revision: TravelScheduleRevision): {
  serviceCount: number;
  tripInstanceCount: number;
  stationOptionCount: number;
} {
  return {
    serviceCount: revision.services.length,
    stationOptionCount: revision.stationOptions.length,
    tripInstanceCount: revision.trips.length,
  };
}

function getTravelScheduleServiceKinds(revision: TravelScheduleRevision): TicketableServiceKind[] {
  return Array.from(new Set(revision.trips.map((trip) => trip.serviceKind))).sort();
}

function createTravelScheduleValidationIssue(
  input: TravelScheduleValidationIssue,
): TravelScheduleValidationIssue {
  return {
    ...input,
    examples: input.examples.filter(Boolean),
  };
}

function notFound(): TravelScheduleRevisionActionResult {
  return {
    ok: false,
    status: 404,
    error: 'travel_schedule_revision_not_found',
    message: '班次数据版本不存在。',
  };
}

function invalidTransition(reason?: string): TravelScheduleRevisionActionResult {
  return {
    ok: false,
    status: 409,
    error: 'invalid_travel_schedule_revision_state',
    message: reason ?? '当前班次数据版本状态不允许执行该操作。',
  };
}

async function emitEvent<TType extends YctEventType>(
  type: TType,
  actorId: string,
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    actor: {
      type: 'admin',
      id: actorId,
    },
    payload,
  });
}
