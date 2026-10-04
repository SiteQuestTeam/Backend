import assert from 'node:assert/strict';
import test from 'node:test';
import { submittedKckResponse } from './kck-response';

test('returns the complete submit contract for a previously submitted incident', () => {
  assert.deepEqual(
    submittedKckResponse({
      incidentId: 'KCK-42',
      photoUrl: '/kck/incidents/draft-1/photo',
      pointsGranted: 0,
      pointsGrantedAt: new Date('2026-10-04T10:00:00.000Z'),
    }),
    {
      status: 'SUBMITTED',
      incidentId: 'KCK-42',
      photoUrl: '/kck/incidents/draft-1/photo',
      pointsGranted: 0,
      pointsGrantedAt: new Date('2026-10-04T10:00:00.000Z'),
    },
  );
});
