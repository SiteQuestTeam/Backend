import { Module } from '@nestjs/common';
import { AdminAccessGuard } from './admin-access.guard';

@Module({
  providers: [AdminAccessGuard],
  exports: [AdminAccessGuard],
})
export class AdminModule {}
