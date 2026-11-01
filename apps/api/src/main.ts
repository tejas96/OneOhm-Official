import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadEnvironment } from './config/environment';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const env = loadEnvironment();
  // Raw bodies are kept so gateway webhooks can check their signatures.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  configureApp(app, env);
  await app.listen(env.API_PORT, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
