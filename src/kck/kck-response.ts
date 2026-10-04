export interface SubmittedKckResponseInput {
  incidentId: string | null;
  photoUrl: string;
  pointsGranted: number;
  pointsGrantedAt: Date | null;
}

/** Public response shared by the first submit and an idempotent repeat. */
export function submittedKckResponse(input: SubmittedKckResponseInput) {
  return {
    status: 'SUBMITTED' as const,
    incidentId: input.incidentId,
    photoUrl: input.photoUrl,
    pointsGranted: input.pointsGranted,
    pointsGrantedAt: input.pointsGrantedAt,
  };
}
