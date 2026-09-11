import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

const PLACEHOLDER_SECRETS = ['change-me-to-a-long-random-string', 'dev-secret-change-me-1234567890'];

// Refuse to boot with a missing/placeholder/weak JWT secret. Every
// deployment guide says "change this" — this makes it enforced, not just
// documented, so a copy-pasted .env.example never silently ships live.
function assertJwtSecretIsSafe() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Generate one with: openssl rand -base64 48');
  }
  if (PLACEHOLDER_SECRETS.includes(secret)) {
    throw new Error('JWT_SECRET is still the placeholder value — generate a real one: openssl rand -base64 48');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET is too short (need 32+ chars). Generate one with: openssl rand -base64 48');
  }
}

function corsOrigins(): string[] | boolean {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) {
    // eslint-disable-next-line no-console
    console.warn('ALLOWED_ORIGINS is not set — allowing all origins. Set it before exposing this beyond localhost.');
    return true;
  }
  return raw.split(',').map((o) => o.trim());
}

async function bootstrap() {
  assertJwtSecretIsSafe();

  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors({ origin: corsOrigins() });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Orantix Ledger API listening on :${port}`);
}
bootstrap();
