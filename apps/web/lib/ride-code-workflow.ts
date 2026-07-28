import { randomUUID } from 'node:crypto';
import { LdpassActionLinkProvider } from '@yct/adapters';
import type { RideCodeSession, RideGateOperation } from '@yct/contracts';
import { getAppEventBus, publishDomainEvent } from './app-event-bus';
import { calculateRideFare, findEnabledRideGateDevice } from './ride-gate-config-store';
import {
  createRideCodeSession,
  findActiveRideCodeSessionByPlayerName,
  findRideCodeSessionByDeviceEventId,
  findRideCodeSessionById,
  normalizePlayerName,
  updateRideCodeSession,
} from './ride-code-session-store';
import { readRuntimeConfig } from './runtime-config';

export type RideCodeLinkResult =
  | {
      ok: true;
      sessionId: string;
      actionUrl: string;
      expiresAt: string;
    }
  | {
      ok: false;
      reason: 'not_configured' | 'account_not_bound' | 'session_active' | 'upstream_unavailable';
      message: string;
    };

export type RideGateEventResult =
  | {
      ok: true;
      sessionId: string;
      status: RideCodeSession['status'];
      message: string;
    }
  | {
      ok: false;
      reason:
        | 'device_not_configured'
        | 'operation_mismatch'
        | 'session_not_found'
        | 'session_not_ready'
        | 'fare_not_configured'
        | 'upstream_unavailable';
      message: string;
    };

let listenersRegistered = false;

export function ensureRideCodeListenersRegistered(): void {
  if (listenersRegistered) {
    return;
  }

  listenersRegistered = true;
  const eventBus = getAppEventBus();
  eventBus.subscribe('RideCodeSessionCreated', async (event) => {
    await createRideAuthorizationActionLink(event.payload.sessionId);
  });
  eventBus.subscribe('RideCodeGateEventReceived', async (event) => {
    await processRideGateEvent(event.payload);
  });
  eventBus.subscribe('RideCodeAuthorizationSynchronized', async (event) => {
    await synchronizeRideAuthorization(event.payload);
  });
}

export async function createRideCodeRedemptionLink(input: {
  ldpassUserId: string;
  serverAccountName?: string | null;
  serverAccountVerified: boolean;
}): Promise<RideCodeLinkResult> {
  ensureRideCodeListenersRegistered();
  const config = readRuntimeConfig();
  if (
    !config.ldpassBaseUrl ||
    !config.ldpassYctProviderApiKey ||
    !config.ldpassRideCodeMaximumFareValue
  ) {
    return {
      ok: false,
      reason: 'not_configured',
      message: '乘车码预授权服务尚未完成配置。',
    };
  }

  const playerName = input.serverAccountName?.trim();
  if (!input.serverAccountVerified || !playerName) {
    return {
      ok: false,
      reason: 'account_not_bound',
      message: '乘车码需要已验证并绑定的服务器账号。',
    };
  }

  let activeSession = await findActiveRideCodeSessionByPlayerName(playerName);
  if (
    activeSession &&
    (activeSession.status === 'link_pending' ||
      activeSession.status === 'awaiting_authorization') &&
    activeSession.actionLinkExpiresAt &&
    Date.parse(activeSession.actionLinkExpiresAt) <= Date.now()
  ) {
    await updateRideCodeSession(activeSession.id, (current) => ({
      ...current,
      status: 'expired',
      updatedAt: new Date().toISOString(),
    }));
    activeSession = undefined;
  }
  if (activeSession?.actionUrl && activeSession.actionLinkExpiresAt) {
    return {
      ok: true,
      sessionId: activeSession.id,
      actionUrl: activeSession.actionUrl,
      expiresAt: activeSession.actionLinkExpiresAt,
    };
  }
  if (activeSession) {
    return {
      ok: false,
      reason: 'session_active',
      message: '该服务器账号已有正在创建或进行中的乘车码会话。',
    };
  }

  const createdAt = new Date().toISOString();
  const session = await createRideCodeSession({
    id: `ride_${randomUUID()}`,
    ldpassUserId: input.ldpassUserId,
    playerName,
    maximumFareValue: config.ldpassRideCodeMaximumFareValue,
    createdAt,
  });

  try {
    await publishDomainEvent({
      eventId: `event_${randomUUID()}`,
      type: 'RideCodeSessionCreated',
      occurredAt: createdAt,
      actor: {
        type: 'user',
        id: input.ldpassUserId,
      },
      payload: {
        sessionId: session.id,
        ldpassUserId: session.ldpassUserId,
        playerName: session.playerName,
        maximumFareValue: session.maximumFareValue,
      },
    });
  } catch {
    const failedSession = await findRideCodeSessionById(session.id);
    return {
      ok: false,
      reason: 'upstream_unavailable',
      message: failedSession?.failureMessage ?? '暂时无法生成乘车码，请稍后重试。',
    };
  }

  const readySession = await findRideCodeSessionById(session.id);
  if (!readySession?.actionUrl || !readySession.actionLinkExpiresAt) {
    return {
      ok: false,
      reason: 'upstream_unavailable',
      message: '乘车码链接创建未完成，请稍后重试。',
    };
  }

  return {
    ok: true,
    sessionId: readySession.id,
    actionUrl: readySession.actionUrl,
    expiresAt: readySession.actionLinkExpiresAt,
  };
}

export async function acceptRideGateEvent(input: {
  deviceEventId: string;
  deviceId: string;
  operation: RideGateOperation;
  playerName: string;
  occurredAt: string;
}): Promise<RideGateEventResult> {
  ensureRideCodeListenersRegistered();
  const device = await findEnabledRideGateDevice(input.deviceId);
  if (!device) {
    return {
      ok: false,
      reason: 'device_not_configured',
      message: '乘车设备未登记或已停用。',
    };
  }
  if (device.operation !== input.operation) {
    return {
      ok: false,
      reason: 'operation_mismatch',
      message: '乘车设备类型与本次事件不匹配。',
    };
  }

  const repeatedSession = await findRideCodeSessionByDeviceEventId(input.deviceEventId);
  if (repeatedSession) {
    if (normalizePlayerName(repeatedSession.playerName) !== normalizePlayerName(input.playerName)) {
      return {
        ok: false,
        reason: 'session_not_found',
        message: '设备事件与已有乘车会话的玩家身份不一致。',
      };
    }
    return {
      ok: true,
      sessionId: repeatedSession.id,
      status: repeatedSession.status,
      message: '该乘车设备事件已处理。',
    };
  }

  const session = await findActiveRideCodeSessionByPlayerName(input.playerName);
  if (!session) {
    return {
      ok: false,
      reason: 'session_not_found',
      message: '该玩家没有进行中的乘车码会话。',
    };
  }
  if (
    (input.operation === 'entry' && session.status !== 'authorized') ||
    (input.operation === 'exit' && session.status !== 'entered')
  ) {
    return {
      ok: false,
      reason: 'session_not_ready',
      message: '当前乘车码会话尚未达到本设备要求的状态。',
    };
  }
  if (input.operation === 'exit' && session.entryFareProfileId !== device.fareProfileId) {
    return {
      ok: false,
      reason: 'fare_not_configured',
      message: '进出站设备未配置同一票价方案。',
    };
  }
  if (input.operation === 'exit') {
    const fareValue = await calculateRideFare({
      fareProfileId: device.fareProfileId,
      entryStationId: session.entryStationId ?? '',
      exitStationId: device.stationId,
    });
    if (fareValue === undefined || compareDecimalStrings(fareValue, session.maximumFareValue) > 0) {
      return {
        ok: false,
        reason: 'fare_not_configured',
        message: '未配置该进出站区间的有效票价。',
      };
    }
  }

  try {
    await publishDomainEvent({
      eventId: `event_${input.deviceEventId}`,
      type: 'RideCodeGateEventReceived',
      occurredAt: input.occurredAt,
      actor: {
        type: 'adapter',
        id: input.deviceId,
      },
      payload: {
        sessionId: session.id,
        deviceEventId: input.deviceEventId,
        deviceId: input.deviceId,
        operation: input.operation,
        playerName: input.playerName,
        stationId: device.stationId,
        fareProfileId: device.fareProfileId,
        occurredAt: input.occurredAt,
      },
    });
  } catch {
    return {
      ok: false,
      reason: 'upstream_unavailable',
      message: '乘车码结算服务暂时不可用。',
    };
  }

  const updatedSession = await findRideCodeSessionById(session.id);
  return {
    ok: true,
    sessionId: session.id,
    status: updatedSession?.status ?? session.status,
    message: input.operation === 'entry' ? '已冻结最高票价。' : '已按实际票价完成结算。',
  };
}

async function createRideAuthorizationActionLink(sessionId: string): Promise<void> {
  const config = readRuntimeConfig();
  const session = await findRideCodeSessionById(sessionId);
  if (!session || session.status !== 'link_pending') {
    return;
  }
  if (!config.ldpassBaseUrl || !config.ldpassYctProviderApiKey) {
    await markRideCodeSessionFailed(session.id, 'not_configured', '乘车码预授权服务尚未配置。');
    throw new Error('乘车码预授权服务尚未配置。');
  }

  const provider = createLdpassProvider();
  try {
    const response = await provider.createActionLink({
      kind: 'ride_authorization',
      selectionScope: 'same_provider',
      clientId: config.ldpassClientId,
      requestedValue: session.maximumFareValue,
      verificationMethod: 'pin',
      expiresInSeconds: config.ldpassRideCodeExpiresInSeconds,
      authorizationExpiresInSeconds: config.ldpassRideCodeAuthorizationExpiresInSeconds,
      externalReferenceId: session.id,
      note: '雨城通乘车码预授权',
      idempotencyKey: `yct-ride-link:${session.id}`,
    });
    const actionUrl = resolveTrustedActionUrl(response.actionLink.actionPath, config.ldpassBaseUrl);
    const updatedAt = new Date().toISOString();
    await updateRideCodeSession(session.id, (current) => ({
      ...current,
      status: 'awaiting_authorization',
      actionLinkId: response.actionLink.id,
      actionUrl,
      actionLinkExpiresAt: response.actionLink.expiresAt,
      updatedAt,
    }));
    try {
      await publishDomainEvent({
        eventId: `event_${randomUUID()}`,
        type: 'RideCodeActionLinkCreated',
        occurredAt: updatedAt,
        actor: {
          type: 'system',
          id: 'ride-code-link-listener',
        },
        payload: {
          sessionId: session.id,
          actionLinkId: response.actionLink.id,
          actionUrl,
          expiresAt: response.actionLink.expiresAt,
        },
      });
    } catch {
      // 链接已写入会话；审计事件投递失败不能让用户失去可用授权链接。
    }
  } catch {
    await markRideCodeSessionFailed(session.id, 'action_link_failed', '暂时无法生成乘车码。');
    throw new Error('暂时无法生成乘车码。');
  }
}

async function processRideGateEvent(input: {
  sessionId: string;
  deviceEventId: string;
  deviceId: string;
  operation: RideGateOperation;
  playerName: string;
  stationId: string;
  fareProfileId: string;
  occurredAt: string;
}): Promise<void> {
  const session = await findRideCodeSessionById(input.sessionId);
  if (!session || session.processedDeviceEventIds.includes(input.deviceEventId)) {
    return;
  }
  if (!session.authorizationId) {
    throw new Error('乘车授权尚未确认。');
  }

  if (input.operation === 'entry') {
    if (session.status !== 'authorized') {
      throw new Error('当前乘车授权不能进站冻结。');
    }
    await freezeMaximumRideFare(session, input);
    return;
  }

  if (session.status !== 'entered' || !session.entryStationId) {
    throw new Error('当前乘车授权尚未进站。');
  }
  if (session.entryFareProfileId !== input.fareProfileId) {
    throw new Error('进出站设备未配置同一票价方案。');
  }
  await captureRideFare(session, input);
}

async function freezeMaximumRideFare(
  session: RideCodeSession,
  input: {
    deviceEventId: string;
    deviceId: string;
    stationId: string;
    fareProfileId: string;
  },
): Promise<void> {
  const provider = createLdpassProvider();
  const response = await provider.enterRideAuthorization({
    authorizationId: session.authorizationId!,
    deviceEventId: input.deviceEventId,
    idempotencyKey: `yct-ride-entry:${input.deviceEventId}`,
  });
  const authorization = response.rideAuthorization;
  const enteredAt = authorization.enteredAt ?? new Date().toISOString();
  await updateRideCodeSession(session.id, (current) => ({
    ...current,
    status: 'entered',
    selectedPassId: authorization.passId,
    entryDeviceId: input.deviceId,
    entryStationId: input.stationId,
    entryFareProfileId: input.fareProfileId,
    entryEventId: input.deviceEventId,
    enteredAt,
    processedDeviceEventIds: appendEventId(current.processedDeviceEventIds, input.deviceEventId),
    updatedAt: new Date().toISOString(),
  }));
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type: 'RideCodeEntryFrozen',
    actor: { type: 'adapter', id: input.deviceId },
    payload: {
      sessionId: session.id,
      authorizationId: authorization.id,
      passId: authorization.passId,
      deviceEventId: input.deviceEventId,
      stationId: input.stationId,
      reservedValue: authorization.reservedValue,
      enteredAt,
    },
  });
}

async function captureRideFare(
  session: RideCodeSession,
  input: {
    deviceEventId: string;
    deviceId: string;
    stationId: string;
    fareProfileId: string;
  },
): Promise<void> {
  const fareValue = await calculateRideFare({
    fareProfileId: input.fareProfileId,
    entryStationId: session.entryStationId!,
    exitStationId: input.stationId,
  });
  if (fareValue === undefined) {
    throw new Error('未配置该进出站区间的票价。');
  }
  if (compareDecimalStrings(fareValue, session.maximumFareValue) > 0) {
    throw new Error('计算票价超过本次已冻结的最高票价。');
  }

  const provider = createLdpassProvider();
  const response = await provider.captureRideAuthorization({
    authorizationId: session.authorizationId!,
    fareValue,
    idempotencyKey: `yct-ride-capture:${input.deviceEventId}`,
  });
  const authorization = response.rideAuthorization;
  const capturedAt = authorization.capturedAt ?? new Date().toISOString();
  await updateRideCodeSession(session.id, (current) => ({
    ...current,
    status: 'captured',
    selectedPassId: authorization.passId,
    exitDeviceId: input.deviceId,
    exitStationId: input.stationId,
    exitEventId: input.deviceEventId,
    fareValue,
    capturedAt,
    processedDeviceEventIds: appendEventId(current.processedDeviceEventIds, input.deviceEventId),
    updatedAt: new Date().toISOString(),
  }));
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type: 'RideCodeFareCaptured',
    actor: { type: 'adapter', id: input.deviceId },
    payload: {
      sessionId: session.id,
      authorizationId: authorization.id,
      passId: authorization.passId,
      deviceEventId: input.deviceEventId,
      entryStationId: session.entryStationId!,
      exitStationId: input.stationId,
      fareValue,
      capturedAt,
    },
  });
}

async function synchronizeRideAuthorization(input: {
  sessionId: string;
  authorizationId: string;
  actionLinkId?: string;
  passId: string;
  status: 'Authorized' | 'Entered' | 'Captured' | 'Released' | 'Expired';
  maximumFareValue: string;
  reservedValue: string;
  capturedValue?: string | null;
  authorizationExpiresAt: string;
  occurredAt: string;
}): Promise<void> {
  const statusMap: Record<typeof input.status, RideCodeSession['status']> = {
    Authorized: 'authorized',
    Entered: 'entered',
    Captured: 'captured',
    Released: 'released',
    Expired: 'expired',
  };
  await updateRideCodeSession(input.sessionId, (current) => ({
    ...current,
    status: shouldKeepRideCodeSessionStatus(current.status, statusMap[input.status])
      ? current.status
      : statusMap[input.status],
    actionLinkId: input.actionLinkId ?? current.actionLinkId,
    authorizationId: input.authorizationId,
    selectedPassId: input.passId,
    maximumFareValue: input.maximumFareValue,
    authorizationExpiresAt: input.authorizationExpiresAt,
    fareValue:
      input.status === 'Captured' && input.capturedValue !== undefined
        ? (input.capturedValue ?? undefined)
        : current.fareValue,
    capturedAt: input.status === 'Captured' ? input.occurredAt : current.capturedAt,
    releasedAt:
      input.status === 'Released' || input.status === 'Expired'
        ? input.occurredAt
        : current.releasedAt,
    updatedAt: input.occurredAt,
  }));
}

async function markRideCodeSessionFailed(
  sessionId: string,
  failureCode: string,
  failureMessage: string,
): Promise<void> {
  await updateRideCodeSession(sessionId, (current) => ({
    ...current,
    status: 'failed',
    failureCode,
    failureMessage,
    updatedAt: new Date().toISOString(),
  }));
}

function createLdpassProvider(): LdpassActionLinkProvider {
  const config = readRuntimeConfig();
  if (!config.ldpassBaseUrl || !config.ldpassYctProviderApiKey) {
    throw new Error('乘车码预授权服务尚未配置。');
  }
  return new LdpassActionLinkProvider({
    baseUrl: config.ldpassBaseUrl,
    providerApiKey: config.ldpassYctProviderApiKey,
  });
}

function resolveTrustedActionUrl(actionPath: string, baseUrl: string): string {
  const base = new URL(baseUrl);
  const actionUrl = new URL(actionPath, base);
  if (actionUrl.origin !== base.origin || actionUrl.pathname !== '/action') {
    throw new Error('临东通返回了无效的乘车授权链接。');
  }
  return actionUrl.toString();
}

function appendEventId(eventIds: string[], eventId: string): string[] {
  return eventIds.includes(eventId) ? eventIds : [...eventIds, eventId].slice(-100);
}

function shouldKeepRideCodeSessionStatus(
  current: RideCodeSession['status'],
  incoming: RideCodeSession['status'],
): boolean {
  if (current === 'captured' || current === 'released' || current === 'expired') {
    return incoming !== current;
  }
  return current === 'entered' && incoming === 'authorized';
}

function compareDecimalStrings(left: string, right: string): number {
  const scale = 1_000_000n;
  const toScaledInteger = (value: string): bigint => {
    const [integerPart, fractionPart = ''] = value.split('.', 2);
    return BigInt(integerPart) * scale + BigInt(`${fractionPart}000000`.slice(0, 6));
  };
  const difference = toScaledInteger(left) - toScaledInteger(right);
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}
