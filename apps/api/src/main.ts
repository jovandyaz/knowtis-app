import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { I18nValidationExceptionFilter, I18nValidationPipe } from 'nestjs-i18n';

import { SocketIoAdapter } from './adapters';
import { AppModule } from './app/app.module';
import { GlobalExceptionFilter, LoggingInterceptor } from './core';
import { HocuspocusService } from './modules/collaboration/hocuspocus.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
  const allowedOrigins = [
    frontendUrl,
    'http://localhost:4200',
    'http://localhost:4040',
  ];
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useWebSocketAdapter(new SocketIoAdapter(app, allowedOrigins[0]));

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

  await app.init();

  const hocuspocusService = app.get(HocuspocusService);
  const httpServer = app.getHttpAdapter().getHttpServer();
  hocuspocusService.attachToHttpServer(httpServer);

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

bootstrap();
