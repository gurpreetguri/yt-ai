import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

import { AppModule } from './app.module';

/**
 * Origins allowed to call this API cross-origin (e.g. the dev observability
 * UI running on its own port). Configured via `CORS_ORIGIN` — a
 * comma-separated allowlist — never a wildcard, so credentials/cookies (if
 * ever added) can't be silently exposed to an arbitrary origin. Defaults to
 * the UI's own documented default dev port only.
 */
function resolveCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (raw === undefined || raw.trim().length === 0) {
    return ['http://localhost:3001'];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableCors({ origin: resolveCorsOrigins() });
  app.enableShutdownHooks();

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  Logger.log(`YTV platform runtime listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
