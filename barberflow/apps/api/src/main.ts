import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { createApp } from './app.factory';
import { APP_CONFIG, AppConfig } from './config';

async function bootstrap() {
  const app = await createApp();
  const config = app.get<AppConfig>(APP_CONFIG);

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('BARBERFLOW API')
      .setDescription('Booking platform for barbers in Uzbekistan. Auth: HttpOnly session cookie `bf_session`.')
      .setVersion('0.1.0')
      .addCookieAuth('bf_session')
      .build(),
  );
  SwaggerModule.setup('docs', app, cleanupOpenApiDoc(doc), { jsonDocumentUrl: 'docs/openapi.json' });

  await app.listen(config.PORT);
  new Logger('Bootstrap').log(`API on http://localhost:${config.PORT} (docs: /docs)`);
  if (config.OTP_DEV_MODE) new Logger('Bootstrap').warn('OTP_DEV_MODE is ON: one-time codes are returned in API responses. Development only.');
}

bootstrap();
