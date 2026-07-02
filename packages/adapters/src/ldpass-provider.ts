import type {
  ClientSessionInput,
  IdentityProvider,
  LdpassClientSessionResponse,
  LoginRedirectInput,
} from '@yct/contracts';

export interface LdpassIdentityProviderConfig {
  baseUrl: string;
  clientId: string;
}

export class LdpassIdentityProvider implements IdentityProvider {
  readonly id = 'ldpass';
  readonly name = '临东通';

  constructor(private readonly config: LdpassIdentityProviderConfig) {}

  async buildLoginUrl(input: LoginRedirectInput): Promise<string> {
    const url = new URL('/login', this.config.baseUrl);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('state', input.state);
    return url.toString();
  }

  async readClientSession(input: ClientSessionInput): Promise<LdpassClientSessionResponse> {
    const url = new URL('/api/auth/client-session', this.config.baseUrl);
    url.searchParams.set('client_id', input.clientId);

    const response = await fetch(url, {
      headers: input.cookieHeader ? { cookie: input.cookieHeader } : undefined,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`ldpass client-session failed: ${response.status}`);
    }

    return (await response.json()) as LdpassClientSessionResponse;
  }
}
