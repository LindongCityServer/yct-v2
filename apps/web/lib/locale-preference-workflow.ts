import { randomUUID } from 'node:crypto';
import type {
  LocalePreference,
  UserLocalePreference,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  createDefaultLocalePreference,
  findLocalePreferenceByUserId,
  resolveLocalePreference,
  upsertLocalePreference,
} from './locale-preference-store';

export async function readUserLocalePreference(input: {
  userId: string;
  ldpassUserId: string;
  acceptLanguage?: string | null;
}): Promise<UserLocalePreference> {
  const existing = await findLocalePreferenceByUserId(input.userId);
  if (existing) {
    return {
      ...existing,
      resolvedLocale: resolveLocalePreference(existing.locale, input.acceptLanguage),
    };
  }

  return createDefaultLocalePreference({
    userId: input.userId,
    ldpassUserId: input.ldpassUserId,
    resolvedLocale: resolveLocalePreference('system', input.acceptLanguage),
  });
}

export async function updateUserLocalePreference(input: {
  userId: string;
  ldpassUserId: string;
  locale: LocalePreference;
  acceptLanguage?: string | null;
}): Promise<UserLocalePreference> {
  const existing = await findLocalePreferenceByUserId(input.userId);
  const resolvedLocale = resolveLocalePreference(input.locale, input.acceptLanguage);
  const updatedAt = new Date().toISOString();
  const preference = await upsertLocalePreference({
    userId: input.userId,
    ldpassUserId: input.ldpassUserId,
    locale: input.locale,
    resolvedLocale,
    updatedAt,
  });

  await emitEvent('LocalePreferenceUpdated', input.userId, {
    userId: input.userId,
    locale: preference.locale,
    resolvedLocale: preference.resolvedLocale,
    previousLocale: existing?.locale,
    updatedAt,
    source: 'account_settings',
  });

  return preference;
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
      type: 'user',
      id: actorId,
    },
    payload,
  });
}
