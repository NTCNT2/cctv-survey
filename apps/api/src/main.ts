import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { assertListenHost } from './common/loopback.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  configureApp(app);
  app.enableShutdownHooks();

  // Loopback by default; 0.0.0.0 only inside a container on an internal
  // network. Caddy (TLS) is the only entry point from outside.
  const host = config.get<string>('API_HOST', '127.0.0.1');
  assertListenHost(host, config.get<string>('API_CONTAINER_NETWORK'));
  await app.listen(config.get<number>('API_PORT', 4000), host);
}
await bootstrap();
