import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Strona do testowania czatu AI w przeglądarce. Tylko lokalnie: w obrazie Dockera (NODE_ENV=production) jej nie ma.
@Controller('test')
export class TestPageController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  strona(): string {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    // Czytamy przy każdym wejściu, żeby poprawka w pliku działała bez restartu.
    return readFileSync(join(process.cwd(), 'test-page', 'index.html'), 'utf8');
  }
}
