import { adzunaAdapter } from "./adapters/adzuna";
import { arbeitnowAdapter } from "./adapters/arbeitnow";
import { ashbyAdapter } from "./adapters/ashby";
import { anthropicGreenhouseAdapter } from "./adapters/greenhouse";
import { hnFreelanceAdapter } from "./adapters/hn_freelance";
import { hnHiringAdapter } from "./adapters/hn_hiring";
import { leverAdapter } from "./adapters/lever";
import { anthropicNewsAdapter } from "./adapters/news_anthropic";
import { arxivAiAdapter } from "./adapters/news_arxiv";
import { deepMindNewsAdapter } from "./adapters/news_deepmind";
import { hackerNewsAiAdapter } from "./adapters/news_hn";
import { huggingFaceNewsAdapter } from "./adapters/news_huggingface";
import { importAiNewsAdapter } from "./adapters/news_import_ai";
import { latentSpaceNewsAdapter } from "./adapters/news_latent_space";
import { openAiNewsAdapter } from "./adapters/news_openai";
import { simonWillisonNewsAdapter } from "./adapters/news_simon";
import { remoteOkAdapter } from "./adapters/remoteok";
import { remotiveAdapter } from "./adapters/remotive";
import { seedJobsAdapter } from "./adapters/seed";
import type { AnySourceAdapter } from "./types";

export const SOURCES: readonly AnySourceAdapter[] = [
  anthropicGreenhouseAdapter,
  leverAdapter,
  ashbyAdapter,
  remoteOkAdapter,
  remotiveAdapter,
  hnHiringAdapter,
  hnFreelanceAdapter,
  arbeitnowAdapter,
  adzunaAdapter,
  seedJobsAdapter,
  openAiNewsAdapter,
  anthropicNewsAdapter,
  deepMindNewsAdapter,
  huggingFaceNewsAdapter,
  simonWillisonNewsAdapter,
  latentSpaceNewsAdapter,
  importAiNewsAdapter,
  hackerNewsAiAdapter,
  arxivAiAdapter,
];
