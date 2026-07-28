import type {
  AccentTone,
  AccentPreferenceMode,
  ColorSchemePreference,
  ISODateTimeString,
} from './domain';

export interface LdpassClientApplicationConfig {
  clientId: string;
  name: 'Yuchengtong';
  redirectUris: string[];
  allowedOrigins: string[];
  enabled: boolean;
}

export interface LdpassClientSessionResponse {
  authenticated: boolean;
  clientApplication?: {
    clientId: string;
    name: string;
  };
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
    status: 'Active';
    reviewInfo?: string | null;
    reviewRejectedReason?: string | null;
    serverAccountName?: string | null;
    serverAccountVerified: boolean;
    avatarUrl?: string | null;
    avatarFallbackUrl?: string | null;
    expirationReminderDays?: number;
  };
  readonlyUser?: {
    id: string;
    username: string;
    status: string;
    avatarUrl?: string | null;
    avatarFallbackUrl?: string | null;
  };
}

export interface LdpassThemePlan {
  id: string;
  name: string;
  startsAt: ISODateTimeString;
  endsAt?: ISODateTimeString;
  accentTone: AccentTone;
  accentColor?: string;
  surfaceMode?: ColorSchemePreference;
  priority: number;
  source: 'ldpass';
}

export interface YctThemePreference {
  userId: string;
  colorScheme: ColorSchemePreference;
  accentMode: AccentPreferenceMode;
  customAccentColor?: string;
  updatedAt: ISODateTimeString;
}

export interface YctUserLink {
  id: string;
  ldpassUserId: string;
  usernameSnapshot: string;
  emailSnapshot?: string;
  serverAccountNameSnapshot?: string;
  serverAccountVerifiedSnapshot: boolean;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  lastLoginAt?: ISODateTimeString;
}

export interface YctAccountSessionSnapshot {
  authenticated: boolean;
  linkedAt: ISODateTimeString;
  user?: {
    ldpassUserId: string;
    username: string;
    status: 'Active';
    serverAccountName?: string | null;
    serverAccountVerified: boolean;
    avatarUrl?: string | null;
    avatarFallbackUrl?: string | null;
  };
  readonlyUser?: {
    ldpassUserId: string;
    username: string;
    status: string;
    avatarUrl?: string | null;
    avatarFallbackUrl?: string | null;
  };
}

export interface LdpassTicketReference {
  ldpassPassId?: string;
  actionLinkId?: string;
  redemptionRequestId?: string;
  claimUrl?: string;
}

export interface LdpassCreateActionLinkInput {
  kind: 'use' | 'ride_authorization';
  targetPassId?: string;
  selectionScope?: 'same_provider' | 'top_up_sources' | 'all_authorized';
  clientId?: string;
  requestedValue: string;
  verificationMethod: 'server_account' | 'pin';
  expiresInSeconds?: number;
  authorizationExpiresInSeconds?: number;
  externalReferenceId?: string;
  note?: string;
  idempotencyKey: string;
}

export interface LdpassProviderActionLink {
  id: string;
  kind: 'use' | 'ride_authorization';
  status: 'Active';
  targetPassId?: string | null;
  selectionScope?: 'same_provider' | 'top_up_sources' | 'all_authorized' | null;
  requestedValue: string;
  verificationMethod: 'server_account' | 'pin';
  expiresAt: ISODateTimeString;
  authorizationExpiresAt?: ISODateTimeString | null;
  token: string;
  actionPath: string;
}

export interface LdpassCreateActionLinkResponse {
  actionLink: LdpassProviderActionLink;
}

export type RideAuthorizationStatus =
  'Authorized' | 'Entered' | 'Captured' | 'Released' | 'Expired';

export interface LdpassRideAuthorization {
  id: string;
  providerId: string;
  userId: string;
  passId: string;
  actionLinkId: string;
  externalReferenceId: string;
  status: RideAuthorizationStatus;
  maximumFareValue: string;
  reservedValue: string;
  capturedValue: string | null;
  entryEventId: string | null;
  enteredAt: ISODateTimeString | null;
  capturedAt: ISODateTimeString | null;
  releasedAt: ISODateTimeString | null;
  expiresAt: ISODateTimeString;
  createdAt: ISODateTimeString;
}

export interface LdpassRideAuthorizationResponse {
  rideAuthorization: LdpassRideAuthorization;
}

export type RideGateOperation = 'entry' | 'exit';

export type RideCodeSessionStatus =
  | 'link_pending'
  | 'awaiting_authorization'
  | 'authorized'
  | 'entered'
  | 'captured'
  | 'released'
  | 'expired'
  | 'failed';

export interface RideCodeSession {
  id: string;
  ldpassUserId: string;
  playerName: string;
  status: RideCodeSessionStatus;
  maximumFareValue: string;
  actionLinkId?: string;
  actionUrl?: string;
  actionLinkExpiresAt?: ISODateTimeString;
  authorizationId?: string;
  authorizationExpiresAt?: ISODateTimeString;
  selectedPassId?: string;
  entryDeviceId?: string;
  entryStationId?: string;
  entryFareProfileId?: string;
  entryEventId?: string;
  enteredAt?: ISODateTimeString;
  exitDeviceId?: string;
  exitStationId?: string;
  exitEventId?: string;
  fareValue?: string;
  capturedAt?: ISODateTimeString;
  releasedAt?: ISODateTimeString;
  failureCode?: string;
  failureMessage?: string;
  processedDeviceEventIds: string[];
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface RideGateDeviceConfig {
  id: string;
  operation: RideGateOperation;
  stationId: string;
  fareProfileId: string;
  enabled: boolean;
}

export interface RideFareRule {
  fareProfileId: string;
  entryStationId: string;
  exitStationId: string;
  fareValue: string;
}

export type YctAdminRole = 'admin' | 'super_admin';

export interface YctAdminMembership {
  id: string;
  yctUserId: string;
  ldpassUserId: string;
  role: YctAdminRole;
  status: 'active' | 'suspended';
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}
