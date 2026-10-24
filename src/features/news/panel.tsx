import { useCallback, useEffect, useRef, useState } from "react";
import type { Bridge } from "../../../web/src/bridge";
import { Button, Card, Chip, Empty, ErrorBanner, Loading } from "../../../web/src/ui";
import { newsCopy } from "./copy";
import type { NewsOutput } from "./tools";

function ageLabel(hours: number | null): string {
  if (hours === null) return "Date unknown";
  if (hours < 1) return "Less than an hour ago";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NewsContent({
  data,
  loading,
  error,
  topic,
  onRefresh,
  onTopic,
  onDigest,
  onOpen,
}: {
  data?: NewsOutput;
  loading: boolean;
  error?: string;
  topic: string;
  onRefresh: () => void;
  onTopic: (topic: string) => void;
  onDigest: () => void;
  onOpen: (url: string) => void;
}) {
  const topics = [...new Set([topic, ...(data?.items.flatMap((item) => item.tags) ?? [])])]
    .filter(Boolean)
    .sort();
  return (
    <div>
      <h1>AI news</h1>
      <p>{newsCopy.subtitle}</p>
      <div className="actions">
        <Button disabled={loading} onClick={onRefresh}>
          {newsCopy.refresh}
        </Button>
        <Button disabled={loading || !data?.items.length} onClick={onDigest}>
          {newsCopy.digest}
        </Button>
        <label>
          Topic{" "}
          <select
            value={topic}
            disabled={loading}
            onChange={(event) => onTopic(event.target.value)}
          >
            <option value="">All topics</option>
            {topics.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <ErrorBanner message={error} retry={onRefresh} /> : null}
      {loading ? <Loading line={newsCopy.loading} /> : null}
      {data?.progress.stage === "fetching" ? (
        <div role="status">
          <p>
            Updating sources: {data.progress.done} of {data.progress.total} complete
          </p>
          <progress value={data.progress.done} max={Math.max(1, data.progress.total)} />
        </div>
      ) : null}
      {data ? (
        <p role="status">
          {data.updatedAt === null
            ? newsCopy.noUpdate
            : `Catalog updated ${new Date(data.updatedAt).toLocaleString()}`}
          {data.stale ? ` ${newsCopy.stale}` : ""}
        </p>
      ) : null}
      {!loading && data && data.items.length === 0 ? (
        <Empty title={newsCopy.empty}>{newsCopy.emptyDetail}</Empty>
      ) : null}
      <div className="stack" aria-busy={loading}>
        {data?.items.map((item) => (
          <Card key={item.id}>
            <h2>
              <a
                href={item.url}
                onClick={(event) => {
                  event.preventDefault();
                  onOpen(item.url);
                }}
              >
                {item.title}
              </a>
            </h2>
            <p>
              {data.sources.find((source) => source.id === item.source)?.label ?? item.source}
              {" · "}
              {item.publishedAt === null ? (
                "Date unknown"
              ) : (
                <time
                  dateTime={new Date(item.publishedAt).toISOString()}
                  title={new Date(item.publishedAt).toLocaleString()}
                >
                  {ageLabel(item.ageHours)}
                </time>
              )}
              {item.author ? ` · ${item.author}` : ""}
            </p>
            {item.snippet ? <p>{item.snippet}</p> : null}
            <div>
              {item.tags.map((tag) => (
                <Chip key={tag}>{tag}</Chip>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {data ? (
        <Card>
          <h2>Sources</h2>
          {data.sources.map((source) => (
            <p key={source.id}>
              <strong>{source.label}</strong>
              {" · "}
              {source.status === "error"
                ? "Unavailable; showing stored headlines"
                : source.status === "never"
                  ? "Awaiting first update"
                  : source.status === "running"
                    ? "Updating"
                    : source.status === "partial"
                      ? "Partly updated"
                      : "Available"}
              {source.lastSuccessAt !== null
                ? ` · Last success ${new Date(source.lastSuccessAt).toLocaleString()}`
                : ""}
            </p>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

export function NewsPanel({ bridge }: { bridge: Bridge }) {
  const initial = bridge.initialToolOutput<NewsOutput>();
  const [data, setData] = useState<NewsOutput | undefined>(
    initial?.tab === "news" &&
      Array.isArray(initial.items) &&
      Array.isArray(initial.sources) &&
      initial.progress
      ? initial
      : undefined,
  );
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string>();
  const [topic, setTopic] = useState("");
  const request = useRef(0);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await bridge.callTool<NewsOutput>("get_ai_news", {
        limit: 30,
        ...(topic ? { topics: [topic] } : {}),
      });
      if (!mounted.current || request.current !== current) return;
      if (result.error) setError(result.error.message);
      else if (result.data?.tab === "news") setData(result.data);
      else setError(newsCopy.error);
    } catch {
      if (mounted.current && request.current === current) setError(newsCopy.error);
    } finally {
      if (mounted.current && request.current === current) setLoading(false);
    }
  }, [bridge, topic]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, [load]);
  useEffect(() => {
    if (data?.progress.stage !== "fetching" || error || loading) return;
    const timer = setTimeout(() => void load(), 3000);
    return () => clearTimeout(timer);
  }, [data, error, loading, load]);
  return (
    <NewsContent
      data={data}
      loading={loading}
      error={error}
      topic={topic}
      onRefresh={() => void load()}
      onTopic={(value) => {
        setTopic(value);
        bridge.saveViewState({ tab: "news", newsTopic: value });
      }}
      onDigest={() => {
        void bridge.sendPrompt(
          "Use weekly-ai-news to summarize the past seven days of stored AI news in at most 250 words with source links and one practical learning action.",
        );
      }}
      onOpen={(url) => {
        if (/^https?:\/\//i.test(url)) bridge.openExternal(url);
      }}
    />
  );
}
