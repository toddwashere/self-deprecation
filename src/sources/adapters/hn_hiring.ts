import { createHnContractAdapter, type HnAdapterOptions, includesContractWork } from "./hn_common";

export function createHnHiringAdapter(options: HnAdapterOptions = {}) {
  return createHnContractAdapter({
    id: "hn_hiring",
    query: "Ask HN: Who is hiring?",
    tags: "story,author_whoishiring",
    title: /^Ask HN: Who is hiring\?/i,
    include: includesContractWork,
    options,
  });
}

export const hnHiringAdapter = createHnHiringAdapter();
