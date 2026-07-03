import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

interface OauthVerifierConfig {
  jwksUrl: string;
  issuer: string;
  resourceUrl: string;
}

export class OauthVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly resourceUrl: string;

  constructor(config: OauthVerifierConfig) {
    this.jwks = createRemoteJWKSet(new URL(config.jwksUrl));
    this.issuer = config.issuer;
    this.resourceUrl = config.resourceUrl;
  }

  /**
   * Verifies an OAuth access token against the AS JWKS. Throws on bad
   * signature, wrong audience/issuer, expiry, or a non-ES256 algorithm.
   * Returns the granted scopes parsed from the `scope`/`scopes` claim.
   */
  async verify(jwt: string): Promise<{ scopes: string[] }> {
    const { payload } = await jwtVerify(jwt, this.jwks, {
      issuer: this.issuer,
      audience: this.resourceUrl,
      algorithms: ['ES256'],
      requiredClaims: ['exp'],
    });
    return { scopes: extractScopes(payload) };
  }
}

function extractScopes(payload: JWTPayload): string[] {
  const { scope, scopes } = payload;
  if (typeof scope === 'string') {
    return scope.split(' ').filter(Boolean);
  }
  if (typeof scopes === 'string') {
    return scopes.split(',').filter(Boolean);
  }
  return [];
}
