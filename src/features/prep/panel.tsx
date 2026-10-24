import { useCallback, useEffect, useState } from "react";
import type { Bridge } from "../../../web/src/bridge";
import { Button, Card, Chip, Empty, ErrorBanner, Loading } from "../../../web/src/ui";
import { prepCopy } from "./copy";
import { createPrepRequestGuard } from "./request-guard";
import type { IntelRecord, PrepContextOutput } from "./tools";

function IntelCard({
  intel,
  bridge,
  research,
}: {
  intel: IntelRecord;
  bridge: Bridge;
  research: (prompt: string) => void;
}) {
  const report = intel.report;
  const stale = Date.now() - report.lastResearchedAt > 180 * 86_400_000;
  const practiceLink = (link: { title: string; url: string }) => (
    <Button key={link.url} className="secondary" onClick={() => bridge.openExternal(link.url)}>
      {link.title} ↗
    </Button>
  );
  return (
    <Card>
      <div className="card-heading">
        <div>
          <p className="eyebrow">Interview loop</p>
          <h2>{report.company}</h2>
          <p className="muted">{report.role ?? "General engineering"}</p>
        </div>
        <Chip>{report.confidence} confidence</Chip>
      </div>
      <p className="muted">
        Last researched {new Date(report.lastResearchedAt).toLocaleDateString()} · Reported
        patterns; confirm the current loop with your recruiter.
      </p>
      {stale ? <p role="status">{prepCopy.staleIntel}</p> : null}
      <h3>Stages</h3>
      {report.stages.length ? (
        <ol>
          {report.stages.map((stage) => (
            <li key={stage.name}>
              <strong>{stage.name}</strong>
              {stage.durationMinutes ? ` · ${stage.durationMinutes} min` : ""}
              <p>{stage.description}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Stages not verified.</p>
      )}
      <h3>Coding patterns</h3>
      <p>
        {report.coding.format} ·{" "}
        {report.coding.languages.length
          ? report.coding.languages.join(", ")
          : "Allowed languages not verified"}
      </p>
      {report.coding.patterns.length ? (
        report.coding.patterns.map((pattern) => (
          <div key={pattern.name}>
            <p>
              <strong>{pattern.name}</strong> · {pattern.difficulty}
            </p>
            <div className="actions">{pattern.practiceLinks.map(practiceLink)}</div>
          </div>
        ))
      ) : (
        <p className="muted">Coding patterns not verified.</p>
      )}
      <h3>System design</h3>
      <p>{report.systemDesign.expectedDepth}</p>
      {report.systemDesign.prompts.length ? (
        <ul>
          {report.systemDesign.prompts.map((prompt) => (
            <li key={prompt}>{prompt}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No verified design themes.</p>
      )}
      <h3>Behavioral themes</h3>
      {report.behavioral.themes.length ? (
        <ul>
          {report.behavioral.themes.map((theme) => (
            <li key={theme}>{theme}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">Behavioral themes not verified.</p>
      )}
      {report.tips.length ? (
        <>
          <h3>Tips</h3>
          <ul>
            {report.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </>
      ) : null}
      {report.redFlags.length ? (
        <>
          <h3>Red flags reported</h3>
          <ul>
            {report.redFlags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </>
      ) : null}
      <details>
        <summary>Sources ({report.sources.length})</summary>
        <ul>
          {report.sources.map((source) => (
            <li key={source.url}>
              <div className="actions">
                {practiceLink({ title: source.title, url: source.url })}
              </div>
              <span className="muted">{source.date ?? "Publication date unknown"}</span>
            </li>
          ))}
        </ul>
      </details>
      <div className="actions">
        <Button
          className="secondary"
          onClick={() =>
            research(
              `Use $interview-intel to refresh the saved interview research for ${report.company}${report.role ? `, ${report.role}` : ""}. Search public sources, cite dates, and save the updated report.`,
            )
          }
        >
          Refresh company intel
        </Button>
      </div>
    </Card>
  );
}

export function PrepPanel({ bridge }: { bridge: Bridge }) {
  const initial = bridge.initialToolOutput<Partial<PrepContextOutput>>();
  const [selectedId, setSelectedId] = useState<string | undefined>(initial?.job?.id);
  const [requests] = useState(() => createPrepRequestGuard(initial?.job?.id));
  function selectJob(jobId?: string) {
    requests.select(jobId);
    setSelectedId(jobId);
    void load();
  }
  const [data, setData] = useState<PrepContextOutput | undefined>(
    initial?.savedJobs ? (initial as PrepContextOutput) : undefined,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const load = useCallback(async () => {
    const request = requests.begin();
    setLoading(true);
    setError(undefined);
    try {
      const result = await bridge.callTool<PrepContextOutput>(
        "get_prep_context",
        request.jobId ? { jobId: request.jobId } : {},
      );
      if (!requests.accepts(request)) return;
      if (result.error || !result.data)
        setError(result.error?.message ?? "Prep context is unavailable. Try again.");
      else setData(result.data);
    } catch {
      if (requests.accepts(request)) setError("Prep context is unavailable. Try again.");
    } finally {
      if (requests.accepts(request)) {
        setLoading(false);
        setPending(false);
      }
    }
  }, [bridge, requests]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(
    () =>
      bridge.onToolOutput((output) => {
        if (!output || typeof output !== "object" || !("tab" in output) || output.tab !== "prep")
          return;
        if ("savedJobs" in output) {
          const context = output as PrepContextOutput;
          if (!requests.acceptsNotification(context.job?.id)) return;
          setData(context);
          setPending(false);
          setLoading(false);
        } else {
          void load();
        }
      }),
    [bridge, load, requests],
  );

  async function ask(prompt: string) {
    setError(undefined);
    setPending(true);
    try {
      await bridge.sendPrompt(prompt);
    } catch {
      setError("ChatGPT could not receive the request. Try again.");
      setPending(false);
    }
  }
  function prepPrompt(jobId: string) {
    return `Use $interview-prep for my saved job ${jobId}. Load its prep context and saved interview intel, then build and save a study plan around the reported patterns. Ask about my interview date if needed.`;
  }
  function mockPrompt(jobId: string) {
    return `Use $mock-interview for my saved job ${jobId}. Load its actual saved interview intel, then ask one question at a time based on its coding, design, and behavioral patterns. Offer voice mode.`;
  }

  return (
    <div className="stack" aria-busy={loading}>
      <div className="card-heading">
        <div>
          <h2>Prep</h2>
          <p className="subtitle">{prepCopy.subtitle}</p>
        </div>
        <div className="actions">
          <Button
            className="secondary"
            onClick={() => {
              void load();
            }}
          >
            Refresh saved prep
          </Button>
        </div>
      </div>
      {error ? (
        <ErrorBanner
          message={error}
          retry={() => {
            void load();
          }}
        />
      ) : null}
      {loading ? <Loading line={prepCopy.loading} /> : null}
      {pending ? (
        <Card>
          <div role="status">
            <strong>In progress in ChatGPT</strong>
            <p>{prepCopy.handoff}</p>
            <p className="muted">Continue in the chat, then refresh saved prep if needed.</p>
          </div>
        </Card>
      ) : null}
      {!loading && data && data.savedJobs.length === 0 && data.intel.length === 0 ? (
        <Empty title={prepCopy.empty}>
          {prepCopy.emptyHint}
          <span className="actions">
            <Button
              onClick={() => {
                void ask(
                  "Find jobs for my saved criteria, then help me choose one to save and prepare for.",
                );
              }}
            >
              Find a job to prepare for
            </Button>
            <Button
              className="secondary"
              onClick={() => {
                void ask(
                  "Use $interview-intel to research a company's interview loop. Ask which company and role I am considering.",
                );
              }}
            >
              Research a company
            </Button>
          </span>
        </Empty>
      ) : null}
      {data?.savedJobs.length ? (
        <Card>
          <h2>Saved jobs</h2>
          <div className="stack">
            {data.savedJobs.map((job) => (
              <div key={job.id}>
                <div className="card-heading">
                  <div>
                    <h3>{job.title}</h3>
                    <p className="muted">
                      {job.company} · {job.status}
                    </p>
                  </div>
                  <Chip tone={job.prepStatus === "ready" ? "good" : "neutral"}>
                    {job.prepStatus === "ready" ? "Prep saved" : "Prep not started"}
                  </Chip>
                </div>
                <div className="actions">
                  <Button
                    className="secondary"
                    aria-pressed={selectedId === job.id}
                    onClick={() => {
                      bridge.saveViewState({ tab: "prep", jobId: job.id });
                      selectJob(job.id);
                    }}
                  >
                    Open prep
                  </Button>
                  <Button
                    disabled={pending}
                    onClick={() => {
                      void ask(prepPrompt(job.id));
                    }}
                  >
                    Build study plan
                  </Button>
                  <Button
                    className="secondary"
                    disabled={pending}
                    onClick={() => {
                      void ask(mockPrompt(job.id));
                    }}
                  >
                    Mock interview
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      {data?.job ? (
        <Card>
          <div className="card-heading">
            <div>
              <p className="eyebrow">Preparing for</p>
              <h2>{data.job.title}</h2>
              <p className="muted">{data.job.company}</p>
            </div>
            <div className="actions">
              <Button className="secondary" onClick={() => selectJob(undefined)}>
                Show all companies
              </Button>
            </div>
          </div>
          {!data.intel.length ? (
            <>
              <p>{prepCopy.missingIntel}</p>
              <div className="actions">
                <Button
                  disabled={pending}
                  onClick={() => {
                    void ask(
                      `Use $interview-intel for my saved job ${data.job?.id} at ${data.job?.company}. Research and cite public sources, then save the company and role report.`,
                    );
                  }}
                >
                  Research interview loop
                </Button>
              </div>
            </>
          ) : null}
          {data.prep.length ? (
            data.prep.map((prep) => (
              <details key={prep.id} open>
                <summary>
                  {prep.title} · {new Date(prep.updatedAt).toLocaleDateString()}
                </summary>
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{prep.body}</p>
              </details>
            ))
          ) : (
            <p className="muted">
              No study plan saved for this job yet. Build one from the company intel and your
              experience.
            </p>
          )}
        </Card>
      ) : null}
      {data?.intel.map((intel) => (
        <IntelCard
          key={intel.id}
          intel={intel}
          bridge={bridge}
          research={(prompt) => {
            void ask(prompt);
          }}
        />
      ))}
    </div>
  );
}
