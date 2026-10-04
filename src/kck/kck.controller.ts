import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseFloatPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { KategoriaKck } from '../ai/ai-core';
import { KckService } from './kck.service';

@Controller('kck')
export class KckController {
  constructor(private readonly kck: KckService) {}

  @Post('prepare')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 7 * 1024 * 1024, files: 1 },
  }))
  prepare(
    @UploadedFile() file: Express.Multer.File,
    @Body('latitude', ParseFloatPipe) latitude: number,
    @Body('longitude', ParseFloatPipe) longitude: number,
    @Body('playerId') playerId?: string,
    @Body('line') line?: string,
    @Body('categoryHint') categoryHint?: KategoriaKck,
  ) {
    return this.kck.prepare({ latitude, longitude, playerId, line, categoryHint: categoryHint ?? null }, file);
  }

  @Post('submit')
  submit(@Body() body: Record<string, unknown>) {
    const required = ['draftId', 'submissionId', 'category', 'summary', 'description', 'streetName', 'buildingNumber', 'zipCode'];
    for (const key of required) {
      if (typeof body[key] !== 'string') throw new BadRequestException(`Pole ${key} musi być stringiem.`);
    }
    return this.kck.submit({
      draftId: body.draftId as string,
      submissionId: body.submissionId as string,
      category: body.category as KategoriaKck,
      summary: body.summary as string,
      description: body.description as string,
      streetName: body.streetName as string,
      buildingNumber: body.buildingNumber as string,
      zipCode: body.zipCode as string,
    });
  }

  @Get('incidents/:id')
  getIncident(@Param('id') id: string) {
    return this.kck.getIncident(id);
  }

  @Get('incidents/:id/photo')
  async getPhoto(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const photo = await this.kck.getPhoto(id);
    response.type(photo.mimeType).send(photo.buffer);
  }
}
