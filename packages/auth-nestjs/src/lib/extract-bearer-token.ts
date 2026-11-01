import { ExtractJwt } from 'passport-jwt';

/**
 * Reads the token `JwtAuthGuard` authenticates a request by. Any guard that inspects the token must
 * read it through this: a header form only one of them parses lets a token pass one guard unseen.
 */
export const extractBearerToken = ExtractJwt.fromAuthHeaderAsBearerToken();
