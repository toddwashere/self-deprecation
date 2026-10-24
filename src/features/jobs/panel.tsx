import { useCallback, useEffect, useRef, useState } from "react";
import type { Bridge } from "../../../web/src/bridge";
import { Button, Card, Chip, Empty, ErrorBanner, Loading } from "../../../web/src/ui";
import { JOBS_COPY as copy } from "./copy";
import type { JobCard, JobOutput, JobsOutput } from "./tools";

type Filters = {
  query: string;
  status: string;
  employmentType: string;
  remoteOnly: boolean;
  hideUnlistedSalary: boolean;
};
const defaults: Filters = {
  query: "",
  status: "",
  employmentType: "",
  remoteOnly: false,
  hideUnlistedSalary: false,
};
const fieldStyle = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "CanvasText",
  background: "transparent",
  font: "inherit",
  minWidth: 0,
} as const;
const controlsStyle = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 } as const;

function searchArgs(filters: Filters) {
  return {
    query: filters.query || undefined,
    status: filters.status || undefined,
    employmentType: filters.employmentType || undefined,
    remoteOnly: filters.remoteOnly,
    hideUnlistedSalary: filters.hideUnlistedSalary,
  };
}
function isSearch(value: unknown): value is JobsOutput {
  return Boolean(
    value &&
      typeof value === "object" &&
      "jobs" in value &&
      Array.isArray(value.jobs) &&
      "progress" in value &&
      "sources" in value,
  );
}
function compensation(job: JobCard) {
  if (job.salaryMin === null && job.salaryMax === null) return copy.salaryUnknown;
  const money = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: job.currency || "USD",
      maximumFractionDigits: 0,
    }).format(n);
  if (job.salaryMin !== null && job.salaryMax !== null)
    return `${money(job.salaryMin)}–${money(job.salaryMax)}`;
  return job.salaryMin !== null
    ? `${money(job.salaryMin)}+`
    : `Up to ${money(job.salaryMax as number)}`;
}
function age(timestamp: number | null) {
  if (timestamp === null) return "No successful fetch recorded";
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3600000));
  return hours < 1 ? "Updated less than an hour ago" : `Updated ${hours}h ago`;
}

export function JobsPanel({ bridge }: { bridge: Bridge }) {
  const [data, setData] = useState<JobsOutput | undefined>(() => {
    const output = bridge.initialToolOutput<unknown>();
    return isSearch(output) ? output : undefined;
  });
  const [filters, setFilters] = useState<Filters>(defaults);
  const [draft, setDraft] = useState<Filters>(defaults);
  const [error, setError] = useState<string>();
  const [needsCriteria, setNeedsCriteria] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [detail, setDetail] = useState<JobCard | undefined>(
    () => bridge.initialToolOutput<Partial<JobOutput>>()?.job,
  );
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setBusy(true);
    setError(undefined);
    setNeedsCriteria(false);
    const result = await bridge.callTool<JobsOutput>("search_jobs", searchArgs(filters));
    if (current !== generation.current) return;
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      setNeedsCriteria(result.error.code === "NEEDS_CRITERIA");
    } else if (result.data && isSearch(result.data)) setData(result.data);
    else setError(copy.error);
  }, [bridge, filters]);

  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  useEffect(
    () =>
      bridge.onToolOutput((output) => {
        if (isSearch(output)) {
          setData(output);
          setError(undefined);
        } else if (output && typeof output === "object" && "job" in output)
          setDetail((output as JobOutput).job);
      }),
    [bridge],
  );

  useEffect(() => {
    if (!data || data.progress.stage === "done" || busy || error) return;
    const current = generation.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const status = await bridge.callTool<{ status: string }>("get_task_status", {
        taskId: data.taskId,
      });
      if (cancelled || current !== generation.current) return;
      if (status.error) {
        setError(status.error.message);
        return;
      }
      const next = await bridge.callTool<JobsOutput>("score_jobs", searchArgs(filters));
      if (cancelled || current !== generation.current) return;
      if (next.error) setError(next.error.message);
      else if (next.data && isSearch(next.data)) setData(next.data);
      else setError(copy.error);
    }, 650);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bridge, data, busy, error, filters]);

  const update = async (job: JobCard, status: JobCard["status"]) => {
    setPending(job.id);
    setNotice(undefined);
    setError(undefined);
    const previous = data;
    setData((current) =>
      current
        ? {
            ...current,
            jobs: current.jobs.flatMap((item) =>
              item.id !== job.id
                ? [item]
                : status === "dismissed" && filters.status !== "dismissed"
                  ? []
                  : [{ ...item, status }],
            ),
          }
        : current,
    );
    const result = await bridge.callTool<JobOutput>("update_job_status", { jobId: job.id, status });
    setPending(undefined);
    if (result.error || !result.data) {
      setData(previous);
      setError(result.error?.message ?? copy.error);
      return;
    }
    const updated = result.data.job;
    setData((current) =>
      current
        ? {
            ...current,
            jobs: current.jobs
              .filter((item) => item.id !== job.id || !filters.status || filters.status === status)
              .map((item) => (item.id === job.id ? updated : item)),
          }
        : current,
    );
    if (detail?.id === job.id) setDetail(updated);
    setNotice(status === "dismissed" ? copy.dismissed : copy.saved);
  };
  const prep = async (job: JobCard) => {
    setPending(job.id);
    setError(undefined);
    try {
      await bridge.sendPrompt(
        `Prep me for ${job.title} at ${job.company}. Use get_job with jobId ${JSON.stringify(job.id)} for the posting and my fit evidence, then help me prepare for the interview.`,
      );
      setNotice(copy.prepSent);
    } catch {
      setError("Interview prep could not be started. Try again.");
    } finally {
      setPending(undefined);
    }
  };
  const openDetail = async (job: JobCard) => {
    setPending(job.id);
    const result = await bridge.callTool<JobOutput>("get_job", { jobId: job.id });
    setPending(undefined);
    if (result.error || !result.data) setError(result.error?.message ?? copy.error);
    else setDetail(result.data.job);
  };
  const renderJob = (job: JobCard, expanded = false) => (
    <Card key={job.id}>
      <div className="card-heading">
        <div>
          <p className="eyebrow">{job.company}</p>
          <h2>{job.title}</h2>
          <p className="muted">
            {job.location || copy.locationUnknown} · {compensation(job)}
          </p>
        </div>
        <Chip tone={job.fitScore !== null && job.fitScore >= 70 ? "good" : "neutral"}>
          {job.fitScore === null ? copy.scorePending : `${job.fitScore}% ${copy.fit.toLowerCase()}`}
        </Chip>
      </div>
      <div style={controlsStyle}>
        {job.reasons.map((reason) => (
          <Chip key={reason}>{reason}</Chip>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        {job.source} · {job.status} ·{" "}
        {job.postedAt ? `Posted ${new Date(job.postedAt).toLocaleDateString()}` : copy.dateUnknown}
        {job.scoreSource === "heuristic" ? " · Keyword score" : ""}
      </p>
      {expanded ? (
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {job.descriptionText || "No description provided."}
        </p>
      ) : null}
      <div className="actions">
        <Button
          disabled={pending === job.id || job.status === "saved"}
          onClick={() => void update(job, "saved")}
        >
          {job.status === "saved" ? "Saved" : copy.save}
        </Button>
        <Button className="secondary" disabled={pending === job.id} onClick={() => void prep(job)}>
          {copy.prep}
        </Button>
        <Button className="secondary" onClick={() => bridge.openExternal(job.url)}>
          {copy.view}
        </Button>
        {expanded ? (
          <Button className="secondary" onClick={() => setDetail(undefined)}>
            {copy.close}
          </Button>
        ) : (
          <Button
            className="secondary"
            disabled={pending === job.id}
            onClick={() => void openDetail(job)}
          >
            {copy.detail}
          </Button>
        )}
        <Button
          className="secondary"
          disabled={pending === job.id || job.status === "dismissed"}
          onClick={() => void update(job, "dismissed")}
        >
          {copy.dismiss}
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="stack">
      <div>
        <h2>{copy.title}</h2>
        <p className="muted">{data?.fallback ? "Ranked for your criteria" : copy.subtitle}</p>
      </div>
      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            bridge.saveViewState({ tab: "jobs", filters: draft });
            setFilters({ ...draft });
          }}
          className="stack"
        >
          <div style={controlsStyle}>
            <input
              aria-label={copy.query}
              placeholder={copy.query}
              maxLength={200}
              value={draft.query}
              onChange={(e) => setDraft({ ...draft, query: e.target.value })}
              style={{ ...fieldStyle, flex: "1 1 230px" }}
            />
            <label>
              {copy.status}{" "}
              <select
                aria-label={copy.status}
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                style={fieldStyle}
              >
                <option value="">Active jobs</option>
                {["new", "saved", "applied", "interviewing", "offer", "rejected", "dismissed"].map(
                  (status) => (
                    <option key={status} value={status}>
                      {status[0].toUpperCase() + status.slice(1)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              {copy.employment}{" "}
              <select
                aria-label={copy.employment}
                value={draft.employmentType}
                onChange={(e) => setDraft({ ...draft, employmentType: e.target.value })}
                style={fieldStyle}
              >
                <option value="">All types</option>
                <option value="full_time">Full time</option>
                <option value="contract">Contract</option>
                <option value="part_time">Part time</option>
              </select>
            </label>
          </div>
          <div style={controlsStyle}>
            <label>
              <input
                type="checkbox"
                checked={draft.remoteOnly}
                onChange={(e) => setDraft({ ...draft, remoteOnly: e.target.checked })}
              />{" "}
              {copy.remote}
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.hideUnlistedSalary}
                onChange={(e) => setDraft({ ...draft, hideUnlistedSalary: e.target.checked })}
              />{" "}
              {copy.salary}
            </label>
            <div className="actions" style={{ margin: 0 }}>
              <Button type="submit" disabled={busy}>
                {copy.search}
              </Button>
            </div>
          </div>
        </form>
      </Card>
      {error ? <ErrorBanner message={error} retry={() => void load()} /> : null}
      {needsCriteria ? (
        <div className="actions">
          <Button onClick={() => void bridge.sendPrompt(copy.setupPrompt)}>{copy.setup}</Button>
        </div>
      ) : null}
      {busy || (!data && !error) ? <Loading line={copy.loading} /> : null}
      {notice ? (
        <p role="status" className="success">
          {notice}
        </p>
      ) : null}
      {data?.fallback ? (
        <div role="status" className="card">
          {copy.fallback}
        </div>
      ) : null}
      {data && data.progress.stage !== "done" ? (
        <Card>
          <p role="status">
            Fetch ✓ → Filter ✓ → Score {data.progress.done} of {data.progress.total} → Rank
          </p>
          <progress
            aria-label="Job scoring progress"
            value={data.progress.done}
            max={data.progress.total}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
        </Card>
      ) : null}
      {detail ? renderJob(detail, true) : null}
      {data?.jobs.length === 0 && !busy && !needsCriteria ? (
        <Empty title={copy.empty}>
          <span>Try broader filters or update your criteria.</span>
          <span className="actions">
            <Button onClick={() => void bridge.sendPrompt(copy.setupPrompt)}>{copy.setup}</Button>
          </span>
        </Empty>
      ) : null}
      {data?.jobs.map((job) => renderJob(job))}
      {data ? (
        <footer>
          <strong>Job sources</strong>
          {data.sources.length ? (
            data.sources.map((source) => (
              <p key={source.source}>
                {source.source} ·{" "}
                {source.status === "ok"
                  ? "Available"
                  : source.status === "partial"
                    ? "Partial results"
                    : source.status === "running"
                      ? "Refreshing"
                      : "Unavailable"}{" "}
                · {age(source.lastSuccessAt)}
              </p>
            ))
          ) : (
            <p>{copy.sourceUnknown}</p>
          )}
        </footer>
      ) : null}
    </div>
  );
}
