import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { Bridge } from "../../../web/src/bridge";
import { Button, Card, Chip, Empty, ErrorBanner, Loading } from "../../../web/src/ui";
import { briefCopy as copy } from "./copy";
import type { BriefOutput, SeenOutput } from "./tools";

function dateLabel(value: number, timezone?: string) {
  try {
    return new Date(value).toLocaleString(undefined, {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return new Date(value).toLocaleString();
  }
}
function isBrief(value: unknown): value is BriefOutput {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<BriefOutput>;
  return (
    data.tab === "today" &&
    typeof data.asOf === "number" &&
    Array.isArray(data.matches) &&
    Array.isArray(data.contractLeads) &&
    Array.isArray(data.events) &&
    Array.isArray(data.followUps) &&
    Array.isArray(data.headlines) &&
    Array.isArray(data.unavailable) &&
    Boolean(data.progress)
  );
}
function Section({
  title,
  empty,
  unavailable,
  children,
}: {
  title: string;
  empty?: string;
  unavailable: boolean;
  children?: ReactNode;
}) {
  return (
    <Card>
      <h2>{title}</h2>
      {unavailable ? (
        <p role="status">{copy.unavailable}</p>
      ) : empty ? (
        <p className="muted">{empty}</p>
      ) : (
        children
      )}
    </Card>
  );
}
export function TodayContent({
  data,
  loading,
  error,
  marking = false,
  running = false,
  scoring = false,
  onContinueScoring,
  onRefresh,
  onRun,
  onMark,
  onOpen,
  onFollowUp,
}: {
  data?: BriefOutput;
  loading: boolean;
  error?: string;
  marking?: boolean;
  running?: boolean;
  scoring?: boolean;
  onContinueScoring: () => void;
  onRefresh: () => void;
  onRun: () => void;
  onMark: () => void;
  onOpen: (url: string) => void;
  onFollowUp: (id: string) => void;
}) {
  const unavailable = (section: BriefOutput["unavailable"][number]) =>
    data?.unavailable.includes(section) ?? false;
  const allEmpty =
    data &&
    !data.matches.length &&
    !data.contractLeads.length &&
    !data.events.length &&
    !data.followUps.length &&
    !data.headlines.length &&
    !data.unavailable.length;
  const jobRows = (items: BriefOutput["matches"]) => (
    <ul>
      {items.map((job) => (
        <li key={job.id}>
          <a
            href={job.url}
            onClick={(event) => {
              event.preventDefault();
              onOpen(job.url);
            }}
          >
            {job.title}
          </a>
          <p>
            {job.company}
            {job.location ? ` · ${job.location}` : ""}{" "}
            <Chip>{job.fitScore === null ? copy.unscored : `${job.fitScore}% fit`}</Chip>
          </p>
          {job.reasons.length ? <p className="muted">{job.reasons.join(" · ")}</p> : null}
        </li>
      ))}
    </ul>
  );
  return (
    <div>
      <h1>{copy.title}</h1>
      <p>{copy.subtitle}</p>
      <div className="actions">
        <Button onClick={onRun} disabled={running}>
          {copy.run}
        </Button>
        <Button className="secondary" onClick={onRefresh} disabled={loading || scoring}>
          {copy.refresh}
        </Button>
        <Button
          className="secondary"
          onClick={onMark}
          disabled={
            !data ||
            loading ||
            marking ||
            scoring ||
            Boolean(data.unavailable.length) ||
            (data.lastSeenAt !== null && data.lastSeenAt >= data.asOf)
          }
        >
          {marking ? copy.marking : copy.mark}
        </Button>
      </div>
      {error ? <ErrorBanner message={error} retry={onRefresh} /> : null}
      {loading ? <Loading line={copy.loading} /> : null}
      {scoring ? <Loading line={copy.scoringLoading} /> : null}
      {data ? (
        <>
          <p className="muted">
            {copy.snapshot} {dateLabel(data.asOf, data.timezone)} ·{" "}
            {data.lastSeenAt === null
              ? copy.neverSeen
              : `${copy.lastRead} ${dateLabel(data.lastSeenAt, data.timezone)}`}
          </p>
          {data.progress.stage === "awaiting_scoring" ? (
            <div role="status">
              <p>
                {copy.scoring}: {data.progress.done} of {data.progress.total}. {copy.ready}
              </p>
              <p>{copy.continuation}</p>
              <Button onClick={onContinueScoring} disabled={scoring || loading}>
                {copy.continueScoring}
              </Button>
              <progress
                aria-label={copy.scoring}
                value={data.progress.done}
                max={Math.max(1, data.progress.total)}
              />
            </div>
          ) : null}
          {data.unavailable.length ? (
            <div role="status">
              <p>{copy.partial}</p>
              <p className="muted">{copy.partialRead}</p>
            </div>
          ) : null}
          {data.needsCriteria ? <p>{copy.criteria}</p> : null}
          {allEmpty && !loading ? <Empty title={copy.empty}>{copy.emptyDetail}</Empty> : null}
          <div className="stack" aria-busy={loading}>
            <Section
              title={copy.matches}
              unavailable={unavailable("matches")}
              empty={!data.matches.length ? copy.noMatches : undefined}
            >
              {jobRows(data.matches)}
            </Section>
            <Section
              title={copy.contractLeads}
              unavailable={unavailable("contractLeads")}
              empty={!data.contractLeads.length ? copy.noContracts : undefined}
            >
              {jobRows(data.contractLeads)}
            </Section>
            <Section
              title={copy.events}
              unavailable={unavailable("events")}
              empty={!data.events.length ? copy.noEvents : undefined}
            >
              <ul>
                {data.events.map((event) => (
                  <li key={event.id}>
                    {event.url ? (
                      <a
                        href={event.url}
                        onClick={(click) => {
                          click.preventDefault();
                          onOpen(event.url ?? "");
                        }}
                      >
                        {event.title}
                      </a>
                    ) : (
                      <strong>{event.title}</strong>
                    )}
                    <p>
                      {event.startsAt === null
                        ? copy.datePending
                        : dateLabel(event.startsAt, data.timezone)}
                      {event.city ? ` · ${event.city}` : ""}
                      {event.venue ? ` · ${event.venue}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
            <Section
              title={copy.followUps}
              unavailable={unavailable("followUps")}
              empty={!data.followUps.length ? copy.noFollowUps : undefined}
            >
              <ul>
                {data.followUps.map((contact) => (
                  <li key={contact.id}>
                    <strong>{contact.name}</strong>
                    {contact.company ? ` · ${contact.company}` : ""}
                    <p>
                      {contact.followUpAt === null
                        ? copy.dateUnknown
                        : `${copy.due} ${dateLabel(contact.followUpAt, data.timezone)}`}
                    </p>
                    <Button className="secondary" onClick={() => onFollowUp(contact.id)}>
                      {copy.draftFollowUp}
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
            <Section
              title={copy.headlines}
              unavailable={unavailable("headlines")}
              empty={!data.headlines.length ? copy.noHeadlines : undefined}
            >
              <ul>
                {data.headlines.map((item) => (
                  <li key={item.id}>
                    <a
                      href={item.url}
                      onClick={(event) => {
                        event.preventDefault();
                        onOpen(item.url);
                      }}
                    >
                      {item.title}
                    </a>
                    <p className="muted">
                      {item.source} ·{" "}
                      {item.publishedAt === null
                        ? `${copy.publicationUnknown} ${dateLabel(item.fetchedAt, data.timezone)}`
                        : dateLabel(item.publishedAt, data.timezone)}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </>
      ) : null}
      <p className="muted">{copy.scheduling}</p>
      <p>{copy.hope}</p>
    </div>
  );
}

export function TodayPanel({ bridge }: { bridge: Bridge }) {
  const initial = bridge.initialToolOutput<unknown>();
  const [data, setData] = useState<BriefOutput | undefined>(isBrief(initial) ? initial : undefined);
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string>();
  const [marking, setMarking] = useState(false);
  const [running, setRunning] = useState(false);
  const [scoring, setScoring] = useState(false);
  const request = useRef(0);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await bridge.callTool<BriefOutput>("get_brief_data", {});
      if (!mounted.current || current !== request.current) return;
      if (result.error) setError(result.error.message);
      else if (isBrief(result.data)) setData(result.data);
      else setError(copy.error);
    } catch {
      if (mounted.current && current === request.current) setError(copy.error);
    } finally {
      if (mounted.current && current === request.current) setLoading(false);
    }
  }, [bridge]);
  useEffect(() => {
    mounted.current = true;
    void load();
    const unsubscribe = bridge.onToolOutput((output) => {
      if (isBrief(output)) {
        request.current += 1;
        setData(output);
        setLoading(false);
        setError(undefined);
      } else if (
        output &&
        typeof output === "object" &&
        "tab" in output &&
        output.tab === "today" &&
        "lastSeenAt" in output &&
        typeof output.lastSeenAt === "number"
      ) {
        const lastSeenAt = output.lastSeenAt;
        setData((current) =>
          current
            ? { ...current, lastSeenAt: Math.max(current.lastSeenAt ?? 0, lastSeenAt) }
            : current,
        );
      }
    });
    return () => {
      mounted.current = false;
      request.current += 1;
      unsubscribe();
    };
  }, [bridge, load]);
  const continueScoring = async () => {
    if (scoring || loading || data?.progress.stage !== "awaiting_scoring") return;
    setScoring(true);
    setError(undefined);
    try {
      const result = await bridge.callTool("score_jobs", {});
      if (!mounted.current) return;
      if (result.error) setError(result.error.message);
      else await load();
    } catch {
      if (mounted.current) setError(copy.scoringError);
    } finally {
      if (mounted.current) setScoring(false);
    }
  };
  const prompt = async (text: string) => {
    setRunning(true);
    setError(undefined);
    try {
      await bridge.sendPrompt(text);
    } catch {
      if (mounted.current) setError(copy.promptError);
    } finally {
      if (mounted.current) setRunning(false);
    }
  };
  const mark = async () => {
    if (!data || data.unavailable.length) return;
    setMarking(true);
    setError(undefined);
    try {
      const result = await bridge.callTool<SeenOutput>("mark_brief_seen", { asOf: data.asOf });
      if (!mounted.current) return;
      if (result.error) setError(result.error.message);
      else if (typeof result.data?.lastSeenAt === "number")
        setData((current) =>
          current
            ? { ...current, lastSeenAt: result.data?.lastSeenAt ?? current.lastSeenAt }
            : current,
        );
      else setError(copy.markError);
    } catch {
      if (mounted.current) setError(copy.markError);
    } finally {
      if (mounted.current) setMarking(false);
    }
  };
  return (
    <TodayContent
      data={data}
      loading={loading}
      error={error}
      marking={marking}
      running={running}
      scoring={scoring}
      onContinueScoring={() => void continueScoring()}
      onRefresh={() => void load()}
      onRun={() => void prompt(copy.runPrompt)}
      onMark={() => void mark()}
      onOpen={(url) => {
        if (/^https?:\/\//i.test(url)) bridge.openExternal(url);
      }}
      onFollowUp={(id) =>
        void prompt(
          `Use my saved contact with ID ${JSON.stringify(id)} to draft a short follow-up. Read their notes first; show a draft for review.`,
        )
      }
    />
  );
}
