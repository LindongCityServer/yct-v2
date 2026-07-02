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
