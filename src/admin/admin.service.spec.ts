import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminService } from './admin.service';

test('an admin point correction updates the balance and keeps earned points monotonic', async () => {
  const calls: unknown[] = [];
  const prisma = {
    $transaction: async (work: (tx: any) => Promise<void>) =>
      work({
        player: { update: async (args: unknown) => calls.push(args) },
        pointTransaction: { create: async (args: unknown) => calls.push(args) },
      }),
  };
  const service = new AdminService(prisma as any, {
    createOrGetByNickname: async () => undefined,
    getById: async () => ({ pointsBalance: 10 }),
    toPublicPlayer: (player: unknown) => player,
  } as any);

  await service.adjustPoints('player-1', -5, 'Presentation correction');

  assert.deepEqual(calls[0], {
    where: { id: 'player-1' },
    data: { pointsBalance: { decrement: 5 } },
  });
  assert.deepEqual(calls[1], {
    data: {
      playerId: 'player-1',
      amount: -5,
      type: 'ADMIN_ADJUSTMENT',
      reference: 'Presentation correction',
    },
  });
});

test('cannot delete a reward after somebody redeemed it', async () => {
  const prisma = {
    reward: {
      findUnique: async () => ({ id: 'coffee' }),
      delete: async () => assert.fail('delete must not run'),
    },
    rewardRedemption: { count: async () => 1 },
  };
  const service = new AdminService(prisma as any, {} as any);

  await assert.rejects(() => service.deleteReward('coffee'), { status: 409 });
});

test('admin may mark an initiative as passed without changing its votes', async () => {
  const calls: unknown[] = [];
  const prisma = {
    initiative: {
      findUnique: async () => ({ id: 'initiative-1', votesCount: 4 }),
      update: async (args: unknown) => calls.push(args),
    },
  };
  const service = new AdminService(prisma as any, {} as any);

  await service.updateInitiative('initiative-1', { status: 'passed' });

  assert.deepEqual(calls, [
    { where: { id: 'initiative-1' }, data: { status: 'passed' } },
  ]);
});

test('admin accepts only operational KCK statuses', async () => {
  const service = new AdminService({} as any, {} as any);

  await assert.rejects(
    () => service.updateCityIncident('incident-1', { status: 'invented' }),
    { status: 400 },
  );
});
