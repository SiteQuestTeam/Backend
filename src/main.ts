import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // Lokalnie klucz OpenAI leży w .env. Na serwerze przychodzi ze zmiennych środowiska.
  try {
    process.loadEnvFile();
  } catch {
    // Brak pliku .env to nie błąd.
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Zdjęcie w base64 jest większe niż domyślny limit 100 kB.
  app.useBodyParser('json', { limit: '15mb' });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
