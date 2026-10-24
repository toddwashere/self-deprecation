import { useCallback, useEffect, useState } from "react";
import type { Bridge } from "../../../web/src/bridge";
import { Button, Card, Chip, Empty, ErrorBanner, Loading } from "../../../web/src/ui";
import { eventsCopy } from "./copy";
import type { EventOutput, ListEventsOutput, SavedEvent } from "./tools";

type Period = "all" | "upcoming" | "past" | "undated";
const statuses = ["interested", "going", "attended", "skipped"] as const;
const statusLabels = eventsCopy.statuses;

export function EventsPanel({ bridge }: { bridge: Bridge }) {
  const initial = bridge.initialToolOutput<ListEventsOutput>();
  const [events, setEvents] = useState<SavedEvent[]>(
    Array.isArray(initial?.events) ? initial.events : [],
  );
  const [asOf, setAsOf] = useState(initial?.asOf ?? Date.now());
  const [loading, setLoading] = useState(!Array.isArray(initial?.events));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await bridge.callTool<ListEventsOutput>("list_events", { limit: 100 });
      if (result.error || !result.data) setError(result.error?.message ?? eventsCopy.error);
      else {
        setEvents(result.data.events);
        setAsOf(result.data.asOf);
      }
    } catch {
      setError(eventsCopy.error);
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    void load();
    return bridge.onToolOutput((output) => {
      const data = output as Partial<ListEventsOutput & EventOutput> | undefined;
      if (data?.tab !== "events") return;
      if (Array.isArray(data.events)) {
        setEvents(data.events);
        setAsOf(data.asOf ?? Date.now());
        setLoading(false);
      } else if (data.event) {
        const event = data.event;
        setEvents((current) => [event, ...current.filter((item) => item.id !== event.id)]);
      }
    });
  }, [bridge, load]);

  async function changeStatus(event: SavedEvent, next: SavedEvent["status"]) {
    setSavingId(event.id);
    setError("");
    setNotice("");
    setEvents((current) =>
      current.map((item) => (item.id === event.id ? { ...item, status: next } : item)),
    );
    try {
      const result = await bridge.callTool<EventOutput>("update_event", {
        eventId: event.id,
        status: next,
      });
      if (result.error || !result.data)
        throw new Error(result.error?.message ?? eventsCopy.saveError);
      const updated = result.data.event;
      setEvents((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(eventsCopy.saved);
    } catch {
      setEvents((current) => current.map((item) => (item.id === event.id ? event : item)));
      setError(eventsCopy.saveError);
    } finally {
      setSavingId(null);
    }
  }

  function selectPeriod(value: Period) {
    setPeriod(value);
    bridge.saveViewState({ tab: "events", eventPeriod: value, eventStatus: status });
  }
  function eventPeriod(event: SavedEvent): Exclude<Period, "all"> {
    return event.startsAt == null ? "undated" : event.startsAt >= asOf ? "upcoming" : "past";
  }
  const visible = events.filter(
    (event) =>
      (period === "all" || eventPeriod(event) === period) &&
      (status === "all" || event.status === status),
  );

  return (
    <div className="events-panel stack">
      <style>{`.events-panel select{font:inherit;color:CanvasText;background:Canvas;border:1px solid var(--border);border-radius:8px;padding:7px;max-width:100%}.events-panel .event-filters{display:flex;gap:12px;flex-wrap:wrap}.events-panel label{display:grid;gap:6px;font-size:13px}.events-panel .event-title{overflow-wrap:anywhere}.events-panel .event-notes{white-space:pre-wrap;overflow-wrap:anywhere}.events-panel .event-status{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.events-panel .event-group{display:grid;gap:12px}.events-panel .event-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}`}</style>
      <div className="event-heading">
        <div>
          <h2>{eventsCopy.title}</h2>
          <p className="muted">{eventsCopy.subtitle}</p>
        </div>
        <div className="actions">
          <Button
            onClick={() => {
              void bridge.sendPrompt(eventsCopy.prompt).catch(() => setError(eventsCopy.error));
            }}
          >
            {eventsCopy.find}
          </Button>
          <Button
            className="secondary"
            disabled={loading || savingId !== null}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>
      </div>
      {error ? <ErrorBanner message={error} retry={() => void load()} /> : null}
      {notice ? (
        <p role="status" className="muted">
          {notice}
        </p>
      ) : null}
      {loading ? <Loading line={eventsCopy.loading} /> : null}
      {!loading && events.length === 0 && !error ? (
        <Empty title={eventsCopy.emptyTitle}>{eventsCopy.empty}</Empty>
      ) : null}
      {events.length > 0 ? (
        <>
          <div className="event-filters">
            <label>
              {eventsCopy.time}
              <select
                value={period}
                onChange={(event) => selectPeriod(event.target.value as Period)}
              >
                <option value="all">{eventsCopy.allEvents}</option>
                <option value="upcoming">{eventsCopy.groups.upcoming}</option>
                <option value="past">{eventsCopy.groups.past}</option>
                <option value="undated">{eventsCopy.dateUnknown}</option>
              </select>
            </label>
            <label>
              {eventsCopy.status}
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  bridge.saveViewState({
                    tab: "events",
                    eventPeriod: period,
                    eventStatus: event.target.value,
                  });
                }}
              >
                <option value="all">{eventsCopy.allStatuses}</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {visible.length === 0 ? <p className="muted">{eventsCopy.emptyFilter}</p> : null}
          {(["upcoming", "undated", "past"] as const).map((group) => {
            const items = visible
              .filter((event) => eventPeriod(event) === group)
              .sort((a, b) =>
                group === "past"
                  ? (b.startsAt ?? 0) - (a.startsAt ?? 0)
                  : (a.startsAt ?? 0) - (b.startsAt ?? 0),
              );
            if (!items.length) return null;
            return (
              <section className="event-group" key={group} aria-label={eventsCopy.groups[group]}>
                <h2>{eventsCopy.groups[group]}</h2>
                {items.map((event) => (
                  <Card key={event.id}>
                    <div className="event-heading">
                      <h2 className="event-title">{event.title}</h2>
                      <Chip tone={event.status === "going" ? "good" : "neutral"}>
                        {statusLabels[event.status]}
                      </Chip>
                    </div>
                    <p className="muted">
                      {event.startsAt == null
                        ? eventsCopy.dateUnknown
                        : new Date(event.startsAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                      {event.endsAt == null
                        ? ""
                        : ` – ${new Date(event.endsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
                    </p>
                    {event.city || event.venue ? (
                      <p>{[event.venue, event.city].filter(Boolean).join(" · ")}</p>
                    ) : null}
                    {event.notes ? <p className="event-notes">{event.notes}</p> : null}
                    <div className="event-status">
                      <label>
                        {eventsCopy.eventStatus}
                        <select
                          aria-label={`${eventsCopy.statusFor} ${event.title}`}
                          disabled={savingId !== null}
                          value={event.status}
                          onChange={(change) =>
                            void changeStatus(event, change.target.value as SavedEvent["status"])
                          }
                        >
                          {statuses.map((value) => (
                            <option key={value} value={value}>
                              {statusLabels[value]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {savingId === event.id ? (
                        <span role="status">{eventsCopy.saving}</span>
                      ) : null}
                    </div>
                    {event.url ? (
                      <div className="actions">
                        <Button
                          className="secondary"
                          onClick={() => bridge.openExternal(event.url ?? "")}
                        >
                          {eventsCopy.open}
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                ))}
              </section>
            );
          })}
        </>
      ) : null}
    </div>
  );
}
