import { createHnContractAdapter, type HnAdapterOptions } from "./hn_common";

export function createHnFreelanceAdapter(options: HnAdapterOptions = {}) {
  return createHnContractAdapter({
    id: "hn_freelance",
    query: "Freelancer? Seeking freelancer?",
    title: /^Ask HN: Freelancer\? Seeking freelancer\?/i,
    include: (text) => /^SEEKING FREELANCER\b/i.test(text),
    options,
  });
}

export const hnFreelanceAdapter = createHnFreelanceAdapter();
