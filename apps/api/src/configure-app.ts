import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Environment } from './config/environment';

/** HTTP-level setup shared by `main.ts` and tests. */
export function configureApp(app: NestExpressApplication, env: Environment): void {
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '2mb' });
  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-oneohm-csrf'],
  });
  app.enableShutdownHooks();
}
