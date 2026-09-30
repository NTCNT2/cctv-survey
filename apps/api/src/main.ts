import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { assertLoopbackHost } from './common/loopback.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  configureApp(app);
  app.enableShutdownHooks();

  // Bind to localhost only; the reverse proxy is the only public entry point.
  const host = config.get<string>('API_HOST', '127.0.0.1');
  assertLoopbackHost(host);
  await app.listen(config.get<number>('API_PORT', 4000), host);
}
await bootstrap();
