interface PrepRequest {
  jobId?: string;
  generation: number;
}

/** Owns async results independently of React render timing. */
export function createPrepRequestGuard(initialJobId?: string) {
  let jobId = initialJobId;
  let generation = 0;
  return {
    select(nextJobId?: string) {
      jobId = nextJobId;
      generation += 1;
    },
    begin(): PrepRequest {
      return { jobId, generation: ++generation };
    },
    accepts(request: PrepRequest) {
      return request.generation === generation && request.jobId === jobId;
    },
    acceptsNotification(notificationJobId?: string) {
      if (notificationJobId !== jobId) return false;
      // A current host result supersedes responses from earlier pending reads.
      generation += 1;
      return true;
    },
  };
}
