import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { I18nValidationExceptionFilter, I18nValidationPipe } from 'nestjs-i18n';

import { SocketIoAdapter } from './adapters';
import { AppModule } from './app/app.module';
import { buildAllowedOrigins } from './config/cors-origins';
import { GlobalExceptionFilter, LoggingInterceptor } from './core';
import { createOauthRateLimit } from './modules/oauth/oauth-rate-limit.middleware';
import {
  applyBodyParsersExcludingOauth,
  createOidcMount,
} from './modules/oauth/oidc-mount.middleware';

async function bootstrap() {
  // bodyParser off app-wide: oidc-provider reads the raw request stream, so
  // parsers are re-applied below for every non-oauth path instead.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  // Railway terminates TLS at a proxy; without this, req.ip is the proxy and
  // per-IP rate limits become global.
  app.set('trust proxy', 1);
  app.use(createOauthRateLimit());
  app.use(createOidcMount(app));
  applyBodyParsersExcludingOauth(app);
  const configService = app.get(ConfigService);
  const isDevelopment = configService.get('NODE_ENV') === 'development';

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });

  if (isDevelopment) {
    app.use(helmet({ contentSecurityPolicy: false }));
  } else {
    app.use(helmet());
  }

  app.use(cookieParser());

  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
  const allowedOrigins = buildAllowedOrigins(
    configService.get<string>('NODE_ENV') ?? 'development',
    frontendUrl,
    configService.get<string>('BACKOFFICE_URL')
  );
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useWebSocketAdapter(new SocketIoAdapter(app, allowedOrigins));

  app.useGlobalFilters(
    new GlobalExceptionFilter(),
    new I18nValidationExceptionFilter({
      detailedErrors: false,
    })
  );

  if (isDevelopment) {
    app.useGlobalInterceptors(new LoggingInterceptor());
  }

  app.useGlobalPipes(
    new I18nValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  if (isDevelopment) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Knowtis API')
      .setDescription('Collaborative Notes Application API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  app.enableShutdownHooks();

  const port = configService.get<number>('PORT') || 3333;
  await app.listen(port);

  Logger.log(
    `🚀 API is running on: http://localhost:${port}/${globalPrefix}`,
    'Bootstrap'
  );
  Logger.log(
    `🔌 WebSocket available at: ws://localhost:${port}/collaboration`,
    'Bootstrap'
  );
  if (isDevelopment) {
    Logger.log(
      `📚 Swagger docs at: http://localhost:${port}/api/docs`,
      'Bootstrap'
    );
  }
}

bootstrap().catch((error: unknown) => {
  Logger.error(
    'API bootstrap failed',
    error instanceof Error ? error.stack : String(error),
    'Bootstrap'
  );
  process.exit(1);
});
