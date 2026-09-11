import { defineRailway, preserve, project, service } from 'railway/iac';

// No watchPatterns on either service: CI gates `railway up` on Nx affected,
// and patterns made Railway record SKIPPED for snapshots CI had approved.
// restartPolicyType is Railway's default (ON_FAILURE) and is left implicit:
// `railway config plan` normalizes the default to null and would report a
// permanent diff if it were declared.

export default defineRailway(() => {
  const knowtisApp = service('knowtis_app', {
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'apps/api/Dockerfile',
    },
    deploy: {
      startCommand: 'node dist/apps/api/main.js',
      // Nothing else migrates production: CI only migrates its own throwaway
      // database, so dropping this line would ship code against an old schema.
      preDeployCommand: ['node apps/api/src/database/migrate.cjs'],
      healthcheckPath: '/api/v1/health/ping',
      healthcheckTimeout: 120,
      restartPolicyMaxRetries: 3,
    },
    replicas: { 'us-west2': 1 },
    domains: ['api.knowtis.app'],
    networking: { privateNetworkEndpoint: 'knowtisapp' },
    env: {
      AI_AGENT_MAX_MS: preserve(),
      AI_AGENT_MAX_OUTPUT_TOKENS: preserve(),
      AI_DAILY_COST_LIMIT_USD: preserve(),
      AI_DAILY_TOKEN_LIMIT: preserve(),
      ANTHROPIC_API_KEY: preserve(),
      BACKOFFICE_URL: preserve(),
      BYOK_ENCRYPTION_KEY: preserve(),
      DATABASE_URL: preserve(),
      EMAIL_FROM: preserve(),
      EMAIL_PROVIDER: preserve(),
      FRONTEND_URL: preserve(),
      GOOGLE_GENERATIVE_AI_API_KEY: preserve(),
      JWT_EXPIRES_IN: preserve(),
      JWT_REFRESH_EXPIRES_IN: preserve(),
      JWT_REFRESH_SECRET: preserve(),
      JWT_SECRET: preserve(),
      LANGFUSE_BASE_URL: preserve(),
      LANGFUSE_PUBLIC_KEY: preserve(),
      LANGFUSE_SECRET_KEY: preserve(),
      MCP_RESOURCE_URL: preserve(),
      NODE_ENV: 'production',
      OAUTH_COOKIE_KEYS: preserve(),
      OAUTH_ISSUER: preserve(),
      OAUTH_JWKS: preserve(),
      OPENAI_API_KEY: preserve(),
      OPENROUTER_API_KEY: preserve(),
      POSTHOG_HOST: preserve(),
      POSTHOG_PROJECT_TOKEN: preserve(),
      PORT: '3333',
      REDIS_URL: preserve(),
      RESEND_API_KEY: preserve(),
      TAVILY_API_KEY: preserve(),
      TOKEN_HASH_KEY: preserve(),
      VERCEL_BLOB_READ_WRITE_TOKEN: preserve(),
      VOYAGE_API_KEY: preserve(),
    },
  });

  const knowtisMcp = service('knowtis-mcp', {
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'apps/mcp/Dockerfile',
    },
    deploy: {
      startCommand: 'node dist/apps/mcp/index.js',
      healthcheckPath: '/health',
      healthcheckTimeout: 60,
      restartPolicyMaxRetries: 3,
    },
    replicas: { 'us-west2': 1 },
    domains: ['mcp.knowtis.app'],
    env: {
      API_INTERNAL_URL: preserve(),
      MCP_ALLOWED_HOSTS: 'mcp.knowtis.app',
      MCP_OAUTH_ISSUER: preserve(),
      MCP_RESOURCE_URL: preserve(),
      NODE_ENV: 'production',
      PORT: '3334',
      VOICE_NOTES_ENABLED: preserve(),
    },
  });

  return project('resilient-miracle', {
    resources: [knowtisApp, knowtisMcp],
  });
});
