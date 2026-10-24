import { type CSSProperties, type FormEvent, useEffect, useId, useRef, useState } from "react";
import "./panel.css";
import type { Bridge } from "../../../web/src/bridge";
import { Button, Card, Chip, Empty, ErrorBanner, Loading } from "../../../web/src/ui";
import { learningCopy as copy } from "./copy";
import type {
  LearningEntry,
  LearningEntryInput,
  LearningEntryOutput,
  LearningListOutput,
} from "./tools";

const kinds = ["reference", "talk", "course", "article", "experiment", "reflection"] as const;
const stack: CSSProperties = { display: "grid", gap: 14 };
const row: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" };
const control: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  font: "inherit",
  fontWeight: 400,
  background: "Canvas",
  color: "CanvasText",
};
const labelStyle: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 };
const preserved: CSSProperties = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" };
type Mode = "browse" | "detail" | "create" | "edit";
interface Draft {
  title: string;
  kind: LearningEntry["kind"];
  body: string;
  sourceTitle: string;
  sourceUrl: string;
  author: string;
  occurredAt: string;
  tags: string;
  takeaways: string;
  followUpQuestions: string;
  nextActions: string;
  pinned: boolean;
  archived: boolean;
}
function localDate(time: number | null) {
  if (time === null) return "";
  const date = new Date(time);
  return new Date(time - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function draftFor(entry?: LearningEntry): Draft {
  return {
    title: entry?.title ?? "",
    kind: entry?.kind ?? "reference",
    body: entry?.body ?? "",
    sourceTitle: entry?.sourceTitle ?? "",
    sourceUrl: entry?.sourceUrl ?? "",
    author: entry?.author ?? "",
    occurredAt: localDate(entry?.occurredAt ?? null),
    tags: entry?.tags.join("\n") ?? "",
    takeaways: entry?.takeaways.join("\n") ?? "",
    followUpQuestions: entry?.followUpQuestions.join("\n") ?? "",
    nextActions: entry?.nextActions.join("\n") ?? "",
    pinned: entry?.pinned ?? false,
    archived: entry?.archived ?? false,
  };
}
function lines(value: string) {
  return value.split("\n").filter((line) => line.trim().length > 0);
}
function inputFor(draft: Draft): LearningEntryInput {
  return {
    title: draft.title,
    kind: draft.kind,
    body: draft.body || null,
    sourceTitle: draft.sourceTitle || null,
    sourceUrl: draft.sourceUrl || null,
    author: draft.author || null,
    occurredAt: draft.occurredAt ? new Date(draft.occurredAt).getTime() : null,
    tags: lines(draft.tags),
    takeaways: lines(draft.takeaways),
    followUpQuestions: lines(draft.followUpQuestions),
    nextActions: lines(draft.nextActions),
    pinned: draft.pinned,
    archived: draft.archived,
  };
}
function safeSource(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function EntryEditor({
  draft,
  setDraft,
  saving,
  editing,
  error,
  onSave,
  onCancel,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  saving: boolean;
  editing: boolean;
  error: string;
  onSave: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const text = (
    field: "title" | "sourceTitle" | "sourceUrl" | "author" | "occurredAt",
    label: string,
    type = "text",
    maxLength = 500,
  ) => (
    <label style={labelStyle}>
      {label}
      <input
        style={control}
        value={draft[field]}
        type={type}
        maxLength={maxLength}
        required={field === "title"}
        onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
      />
    </label>
  );
  const area = (
    field: "body" | "tags" | "takeaways" | "followUpQuestions" | "nextActions",
    label: string,
  ) => (
    <label style={labelStyle}>
      {label}
      <textarea
        style={control}
        rows={field === "body" ? 9 : 3}
        maxLength={field === "body" ? 50_000 : undefined}
        value={draft[field]}
        onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
      />
    </label>
  );
  return (
    <Card>
      <form onSubmit={onSave} style={stack}>
        <h2>{editing ? copy.edit : copy.create}</h2>
        <p className="muted">{copy.draftHint}</p>
        <fieldset disabled={saving} style={{ ...stack, border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">{editing ? copy.edit : copy.create}</legend>
          {text("title", copy.titleLabel, "text", 300)}
          <label style={labelStyle}>
            {copy.kindLabel}
            <select
              value={draft.kind}
              style={control}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as Draft["kind"] })
              }
            >
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          {text("sourceTitle", copy.sourceTitleLabel)}
          {text("sourceUrl", copy.sourceUrlLabel, "url", 2048)}
          {text("author", copy.authorLabel, "text", 300)}
          {text("occurredAt", copy.occurredLabel, "datetime-local")}
          {area("body", copy.bodyLabel)}
          {area("takeaways", copy.takeawaysLabel)}
          {area("followUpQuestions", copy.questionsLabel)}
          {area("nextActions", copy.actionsLabel)}
          {area("tags", copy.tagsLabel)}
          <div style={row}>
            <label htmlFor={`${id}-pin`}>
              <input
                id={`${id}-pin`}
                type="checkbox"
                checked={draft.pinned}
                onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })}
              />{" "}
              {copy.pinLabel}
            </label>
            <label htmlFor={`${id}-archive`}>
              <input
                id={`${id}-archive`}
                type="checkbox"
                checked={draft.archived}
                onChange={(event) => setDraft({ ...draft, archived: event.target.checked })}
              />{" "}
              {copy.archivedLabel}
            </label>
          </div>
        </fieldset>
        {error && <ErrorBanner message={error} />}
        <div style={row}>
          <Button type="submit" disabled={saving}>
            {saving ? copy.saving : copy.save}
          </Button>
          <Button type="button" disabled={saving} onClick={onCancel}>
            {copy.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
function EntryDetail({
  entry,
  bridge,
  onEdit,
}: {
  entry: LearningEntry;
  bridge: Bridge;
  onEdit: () => void;
}) {
  return (
    <Card>
      <article style={stack}>
        <div style={row}>
          <Chip>{entry.kind}</Chip>
          {entry.pinned && <Chip>{copy.pinned}</Chip>}
          {entry.archived && <Chip>{copy.archived}</Chip>}
        </div>
        <h2 style={preserved}>{entry.title}</h2>
        <p className="muted" style={preserved}>
          {entry.sourceTitle ?? copy.unknownSource}
          {entry.author ? ` · ${entry.author}` : ""}
          <br />
          {entry.occurredAt === null
            ? copy.unknownDate
            : new Date(entry.occurredAt).toLocaleString()}
        </p>
        {safeSource(entry.sourceUrl) && (
          <div>
            <Button onClick={() => bridge.openExternal(entry.sourceUrl ?? "")}>
              {copy.openSource}
            </Button>
            <p className="muted" style={preserved}>
              {entry.sourceUrl}
            </p>
          </div>
        )}
        <div style={row}>
          {[...new Set(entry.tags)].map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </div>
        <section>
          <h3>{copy.takeaways}</h3>
          <p style={preserved}>{entry.takeaways.join("\n\n") || copy.none}</p>
        </section>
        <section>
          <h3>{copy.questions}</h3>
          <p style={preserved}>{entry.followUpQuestions.join("\n\n") || copy.none}</p>
        </section>
        <section>
          <h3>{copy.actions}</h3>
          <p style={preserved}>{entry.nextActions.join("\n\n") || copy.none}</p>
        </section>
        <section>
          <h3>{copy.notes}</h3>
          <p style={preserved}>{entry.body || copy.noNotes}</p>
        </section>
        <div>
          <Button onClick={onEdit}>{copy.edit}</Button>
        </div>
      </article>
    </Card>
  );
}

export function LearningPanel({ bridge }: { bridge: Bridge }) {
  const initial = useRef(
    bridge.initialToolOutput<LearningListOutput | LearningEntryOutput>(),
  ).current;
  const initialEntry = initial?.tab === "learning" && "entry" in initial ? initial.entry : null;
  const [mode, setMode] = useState<Mode>(initialEntry ? "detail" : "browse");
  const [selected, setSelected] = useState<LearningEntry | null>(initialEntry);
  const [draft, setDraft] = useState<Draft>(() => draftFor());
  const initialFilters =
    initial?.tab === "learning" && "filters" in initial ? initial.filters : null;
  const [queryInput, setQueryInput] = useState(initialFilters?.query ?? "");
  const [filters, setFilters] = useState({
    query: initialFilters?.query ?? "",
    kind: initialFilters?.kind ?? "",
    tag: initialFilters?.tag ?? "",
    archived: initialFilters?.archived ?? false,
    offset: initialFilters?.offset ?? 0,
    limit: initialFilters?.limit ?? 30,
  });
  const [listing, setListing] = useState<LearningListOutput | null>(
    initial?.tab === "learning" && "entries" in initial ? initial : null,
  );
  const [loading, setLoading] = useState(!listing);
  const [error, setError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const detailRequest = useRef(0);
  const detailId = useRef(initialEntry?.id ?? "");
  const pageSize = filters.limit;

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is the explicit retry/invalidation token.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const { query, kind, tag, ...rest } = filters;
    const args = {
      ...rest,
      limit: pageSize,
      ...(query ? { query } : {}),
      ...(kind ? { kind } : {}),
      ...(tag.trim() ? { tag: tag.trim() } : {}),
    };
    bridge.saveViewState({ tab: "learning", learning: filters });
    void bridge
      .callTool<LearningListOutput>(
        query ? "search_learning_entries" : "list_learning_entries",
        args,
      )
      .then((result) => {
        if (cancelled) return;
        if (result.error || !result.data) setError(result.error?.message ?? copy.error);
        else setListing(result.data);
      })
      .catch(() => {
        if (!cancelled) setError(copy.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, filters, refresh]);

  useEffect(
    () =>
      bridge.onToolOutput((output) => {
        if (
          !output ||
          typeof output !== "object" ||
          !("tab" in output) ||
          output.tab !== "learning"
        )
          return;
        if ("entries" in output && "filters" in output) {
          if (mode === "create" || mode === "edit" || saving) return;
          const result = output as LearningListOutput;
          const next = {
            query: result.filters.query,
            kind: result.filters.kind ?? "",
            tag: result.filters.tag,
            archived: result.filters.archived,
            offset: result.filters.offset,
            limit: result.filters.limit,
          };
          setListing(result);
          setQueryInput(next.query);
          if (JSON.stringify(filters) !== JSON.stringify(next)) {
            setFilters(next);
            setMode("browse");
          }
          return;
        }
        if (!("entry" in output)) return;
        setRefresh((value) => value + 1);
        if (mode === "create" || mode === "edit" || saving) return;
        if ("entry" in output && output.entry) {
          detailRequest.current += 1;
          setDetailLoading(false);
          setDetailError("");
          setSelected(output.entry as LearningEntry);
          setMode("detail");
        }
      }),
    [bridge, mode, saving, filters],
  );

  async function openEntry(entryId: string) {
    detailId.current = entryId;
    const request = ++detailRequest.current;
    setMode("detail");
    setDetailLoading(true);
    setDetailError("");
    setMessage("");
    setSelected(null);
    try {
      const result = await bridge.callTool<LearningEntryOutput>("get_learning_entry", { entryId });
      if (request !== detailRequest.current) return;
      if (result.error || !result.data) setDetailError(result.error?.message ?? copy.error);
      else setSelected(result.data.entry);
    } catch {
      if (request === detailRequest.current) setDetailError(copy.error);
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }
  function browse() {
    detailRequest.current += 1;
    setDetailLoading(false);
    setMode("browse");
    setSelected(null);
    setMessage("");
    setSaveError("");
  }
  function create() {
    detailRequest.current += 1;
    setDraft(draftFor());
    setMode("create");
    setSaveError("");
    setMessage("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaveError("");
    setMessage("");
    const editing = mode === "edit" && selected;
    const payload = inputFor(draft);
    const previous = editing ? draftFor(selected) : null;
    // Send only changed fields: untouched multiline items and timestamp precision stay intact.
    const changes = previous
      ? Object.fromEntries(
          Object.entries(payload).filter(
            ([key]) => draft[key as keyof Draft] !== previous[key as keyof Draft],
          ),
        )
      : payload;
    if (editing && Object.keys(changes).length === 0) {
      setMode("detail");
      setMessage(copy.unchanged);
      return;
    }
    setSaving(true);
    try {
      const result = await bridge.callTool<LearningEntryOutput>(
        editing ? "update_learning_entry" : "save_learning_entry",
        editing ? { entryId: selected.id, ...changes } : payload,
      );
      if (result.error || !result.data) setSaveError(result.error?.message ?? copy.saveError);
      else {
        setSelected(result.data.entry);
        setMode("detail");
        setMessage(copy.saved);
        setRefresh((value) => value + 1);
      }
    } catch {
      setSaveError(copy.saveError);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="learning-panel" aria-label={copy.title} style={stack}>
      <div style={row}>
        <div style={{ flex: 1 }}>
          <h2>{copy.title}</h2>
          <p className="muted">{copy.subtitle}</p>
        </div>
        {mode !== "browse" && (
          <Button disabled={saving} onClick={browse}>
            {copy.browse}
          </Button>
        )}
        <Button disabled={saving} onClick={create}>
          {copy.newEntry}
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
      {mode === "create" || mode === "edit" ? (
        <EntryEditor
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          error={saveError}
          editing={mode === "edit"}
          onSave={save}
          onCancel={() => {
            setSaveError("");
            setMode(selected ? "detail" : "browse");
          }}
        />
      ) : mode === "detail" ? (
        <>
          {detailLoading && <Loading line={copy.loading} />}
          {detailError && (
            <ErrorBanner message={detailError} retry={() => void openEntry(detailId.current)} />
          )}
          {!detailLoading && !detailError && selected && (
            <EntryDetail
              entry={selected}
              bridge={bridge}
              onEdit={() => {
                setDraft(draftFor(selected));
                setMode("edit");
                setMessage("");
                setSaveError("");
              }}
            />
          )}
        </>
      ) : (
        <>
          <form
            style={stack}
            onSubmit={(event) => {
              event.preventDefault();
              setFilters({ ...filters, query: queryInput.trim(), offset: 0 });
            }}
          >
            <div style={row}>
              <label style={{ ...labelStyle, flex: "1 1 220px" }}>
                {copy.search}
                <input
                  style={control}
                  type="search"
                  placeholder={copy.searchHint}
                  maxLength={300}
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                />
              </label>
              <Button type="submit">{copy.searchButton}</Button>
            </div>
            <div style={row}>
              <label style={labelStyle}>
                {copy.kindFilter}
                <select
                  style={control}
                  value={filters.kind}
                  onChange={(event) =>
                    setFilters({ ...filters, kind: event.target.value, offset: 0 })
                  }
                >
                  <option value="">{copy.allKinds}</option>
                  {kinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                {copy.tagFilter}
                <input
                  style={control}
                  value={filters.tag}
                  maxLength={80}
                  onChange={(event) =>
                    setFilters({ ...filters, tag: event.target.value, offset: 0 })
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={filters.archived}
                  onChange={(event) =>
                    setFilters({ ...filters, archived: event.target.checked, offset: 0 })
                  }
                />{" "}
                {copy.archiveFilter}
              </label>
            </div>
          </form>
          {loading ? (
            <Loading line={copy.loading} />
          ) : error ? (
            <ErrorBanner message={error} retry={() => setRefresh((value) => value + 1)} />
          ) : listing?.entries.length ? (
            listing.entries.map((entry) => (
              <Card key={entry.id}>
                <div style={stack}>
                  <div style={row}>
                    <Chip>{entry.kind}</Chip>
                    {entry.pinned && <Chip>{copy.pinned}</Chip>}
                    {entry.archived && <Chip>{copy.archived}</Chip>}
                  </div>
                  <h3 style={{ margin: 0 }}>
                    <Button onClick={() => void openEntry(entry.id)}>{entry.title}</Button>
                  </h3>
                  <p className="muted" style={preserved}>
                    {entry.sourceTitle ?? copy.unknownSource} ·{" "}
                    {entry.occurredAt === null
                      ? copy.unknownDate
                      : new Date(entry.occurredAt).toLocaleDateString()}
                  </p>
                  {entry.takeaways[0] && <p style={preserved}>{entry.takeaways[0]}</p>}
                  <div style={row}>
                    {[...new Set(entry.tags)].map((tag) => (
                      <Chip key={tag}>{tag}</Chip>
                    ))}
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Empty
              title={
                filters.query || filters.kind || filters.tag || filters.archived
                  ? copy.noMatches
                  : copy.empty
              }
            >
              {filters.query || filters.kind || filters.tag || filters.archived
                ? copy.noMatchesBody
                : copy.emptyBody}
            </Empty>
          )}
          <div style={row}>
            <Button
              disabled={loading || filters.offset === 0}
              onClick={() =>
                setFilters({ ...filters, offset: Math.max(0, filters.offset - pageSize) })
              }
            >
              {copy.previous}
            </Button>
            <Button
              disabled={loading || !!error || !listing?.hasMore}
              onClick={() => setFilters({ ...filters, offset: filters.offset + pageSize })}
            >
              {copy.next}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
