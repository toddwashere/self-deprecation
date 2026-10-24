import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name"),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const authIdentities = sqliteTable(
  "auth_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    username: text("username"),
    createdAt: integer("created_at").notNull(),
    lastLoginAt: integer("last_login_at").notNull(),
  },
  (table) => [
    uniqueIndex("auth_identities_provider_subject_idx").on(table.provider, table.providerUserId),
    index("auth_identities_user_id_idx").on(table.userId),
  ],
);

export const profiles = sqliteTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  headline: text("headline"),
  summary: text("summary"),
  targetTitles: text("target_titles", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  seniority: text("seniority"),
  locations: text("locations", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  remotePref: text("remote_pref"),
  salaryMin: integer("salary_min"),
  hourlyMin: integer("hourly_min"),
  employmentTypes: text("employment_types", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  skills: text("skills", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  avoid: text("avoid", { mode: "json" })
    .$type<{ companies: string[]; industries: string[]; keywords: string[] }>()
    .notNull()
    .default(sql`'{"companies":[],"industries":[],"keywords":[]}'`),
  bridgeMode: integer("bridge_mode", { mode: "boolean" }).notNull().default(false),
  timezone: text("timezone").notNull().default("America/Denver"),
  resumeText: text("resume_text"),
  resumeUpdatedAt: integer("resume_updated_at"),
  criteriaVersion: integer("criteria_version").notNull().default(1),
  extra: text("extra", { mode: "json" }).$type<Record<string, unknown>>(),
  updatedAt: integer("updated_at").notNull(),
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    sourceJobId: text("source_job_id").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    remote: integer("remote", { mode: "boolean" }),
    employmentType: text("employment_type").notNull().default("unknown"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    currency: text("currency"),
    url: text("url").notNull(),
    descriptionText: text("description_text"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    postedAt: integer("posted_at"),
    fetchedAt: integer("fetched_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    contentHash: text("content_hash"),
  },
  (table) => [
    uniqueIndex("jobs_source_job_idx").on(table.source, table.sourceJobId),
    index("jobs_fetched_at_idx").on(table.fetchedAt),
    index("jobs_employment_type_idx").on(table.employmentType),
  ],
);

export const newsItems = sqliteTable(
  "news_items",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    snippet: text("snippet"),
    author: text("author"),
    publishedAt: integer("published_at"),
    fetchedAt: integer("fetched_at").notNull(),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    score: integer("score"),
  },
  (table) => [uniqueIndex("news_items_url_idx").on(table.url)],
);

export const fetchRuns = sqliteTable("fetch_runs", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  kind: text("kind").notNull(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  status: text("status").notNull(),
  itemsUpserted: integer("items_upserted").notNull().default(0),
  error: text("error"),
});

export const jobMatches = sqliteTable(
  "job_matches",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    fitScore: integer("fit_score"),
    scoreSource: text("score_source"),
    scoreDetail: text("score_detail", { mode: "json" }).$type<Record<string, unknown>>(),
    reasons: text("reasons", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    criteriaVersion: integer("criteria_version").notNull(),
    status: text("status").notNull().default("new"),
    scoredAt: integer("scored_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("job_matches_user_job_idx").on(table.userId, table.jobId),
    index("job_matches_user_score_idx").on(table.userId, table.fitScore),
  ],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    company: text("company"),
    title: text("title"),
    email: text("email"),
    linkedinUrl: text("linkedin_url"),
    whereMet: text("where_met"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    lastContactedAt: integer("last_contacted_at"),
    followUpAt: integer("follow_up_at"),
    extra: text("extra", { mode: "json" }).$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [index("contacts_user_id_idx").on(table.userId)],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id"),
    subjectLabel: text("subject_label"),
    kind: text("kind").notNull().default("note"),
    title: text("title"),
    body: text("body"),
    ...timestamps,
  },
  (table) => [index("notes_user_subject_idx").on(table.userId, table.subjectType, table.subjectId)],
);

export const savedEvents = sqliteTable(
  "saved_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url"),
    startsAt: integer("starts_at"),
    endsAt: integer("ends_at"),
    venue: text("venue"),
    city: text("city"),
    source: text("source").notNull(),
    status: text("status").notNull().default("interested"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [index("saved_events_user_start_idx").on(table.userId, table.startsAt)],
);

export const learningEntries = sqliteTable(
  "learning_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("reference"),
    title: text("title").notNull(),
    body: text("body"),
    sourceUrl: text("source_url"),
    sourceTitle: text("source_title"),
    author: text("author"),
    eventId: text("event_id").references(() => savedEvents.id, { onDelete: "set null" }),
    occurredAt: integer("occurred_at"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    takeaways: text("takeaways", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    followUpQuestions: text("follow_up_questions", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    nextActions: text("next_actions", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("learning_entries_user_occurred_idx").on(table.userId, table.occurredAt),
    index("learning_entries_user_kind_idx").on(table.userId, table.kind),
    index("learning_entries_user_pinned_idx").on(table.userId, table.pinned),
  ],
);

export const userState = sqliteTable(
  "user_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).$type<unknown>().notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);

export const ladderAssessments = sqliteTable(
  "ladder_assessments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    levelP: text("level_p", { mode: "json" }).$type<number[]>().notNull(),
    dimensionScores: text("dimension_scores", { mode: "json" })
      .$type<Record<string, number>>()
      .notNull(),
    answers: text("answers", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    source: text("source").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("ladder_assessments_user_created_idx").on(table.userId, table.createdAt)],
);

export const ladderQuests = sqliteTable(
  "ladder_quests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questId: text("quest_id").notNull(),
    level: integer("level").notNull(),
    status: text("status").notNull().default("todo"),
    evidence: text("evidence"),
    completedAt: integer("completed_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("ladder_quests_user_quest_idx").on(table.userId, table.questId)],
);

export const apiUsage = sqliteTable(
  "api_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    api: text("api").notNull(),
    units: integer("units").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("api_usage_user_api_created_idx").on(table.userId, table.api, table.createdAt)],
);

export const schema = {
  users,
  authIdentities,
  profiles,
  jobs,
  newsItems,
  fetchRuns,
  jobMatches,
  contacts,
  notes,
  savedEvents,
  learningEntries,
  userState,
  ladderAssessments,
  ladderQuests,
  apiUsage,
};

export const schemaTableNames = [
  "users",
  "auth_identities",
  "profiles",
  "jobs",
  "news_items",
  "fetch_runs",
  "job_matches",
  "contacts",
  "notes",
  "saved_events",
  "learning_entries",
  "user_state",
  "ladder_assessments",
  "ladder_quests",
  "api_usage",
] as const;
