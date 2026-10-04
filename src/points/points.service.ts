import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

// Jeden portfel: saldo Gracza i wpis w historii Punktów zawsze razem.
@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  async award(
    playerId: string,
    amount: number,
    type: string,
    reference: string | null,
    tx?: Tx,
  ): Promise<void> {
    const run = async (db: Tx) => {
      await db.player.update({
        where: { id: playerId },
        data: {
          pointsBalance: { increment: amount },
          totalPointsEarned: { increment: amount },
        },
      });
      await db.pointTransaction.create({
        data: { playerId, amount, type, reference },
      });
    };
    if (tx) return run(tx);
    await this.prisma.$transaction(run);
  }
}
