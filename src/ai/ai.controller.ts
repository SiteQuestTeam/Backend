import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { APIError } from 'openai';
import { AiBlad, DaneKck, DaneKrok1, DaneKrok2, kck, krok1, krok2, przygotujZdjecie } from './ai-core';

interface Zadanie<D> {
  /** Zdjęcie jako base64 (z prefiksem data:image/...;base64, albo bez). */
  zdjecie: string;
  dane: D;
}

@Controller('ai')
export class AiController {
  @Post('krok-1')
  async krok1(@Body() body: Zadanie<DaneKrok1>) {
    const zdjecie = await this.zdjecie(body);
    return this.bezpiecznie(() => krok1(zdjecie, body.dane));
  }

  @Post('krok-2')
  async krok2(@Body() body: Zadanie<DaneKrok2>) {
    const zdjecie = await this.zdjecie(body);
    return this.bezpiecznie(() => krok2(zdjecie, body.dane));
  }

  /** Usterka: zdjęcie → pola KCK albo RETAKE. Moduł KCK może też wołać przygotujUsterkeKck bezpośrednio. */
  @Post('kck')
  async kck(@Body() body: Zadanie<DaneKck>) {
    const zdjecie = await this.zdjecie(body);
    return this.bezpiecznie(() => kck(zdjecie, body.dane));
  }

  private async zdjecie(body: Zadanie<unknown>): Promise<string> {
    if (typeof body?.zdjecie !== 'string' || typeof body.dane !== 'object' || body.dane === null) {
      throw new BadRequestException('Wymagane pola: zdjecie (base64) i dane.');
    }
    const base64 = body.zdjecie.replace(/^data:image\/[a-z]+;base64,/, '');
    try {
      return await przygotujZdjecie(Buffer.from(base64, 'base64'));
    } catch {
      throw new BadRequestException('Nie da się odczytać zdjęcia.');
    }
  }

  private async bezpiecznie<T>(wywolanie: () => Promise<T>): Promise<T> {
    try {
      return await wywolanie();
    } catch (blad) {
      if (blad instanceof AiBlad) throw new UnprocessableEntityException(blad.message);
      if (blad instanceof APIError) throw new BadGatewayException(`OpenAI: ${blad.message}`);
      throw blad;
    }
  }
}
