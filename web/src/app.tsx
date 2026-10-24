import { useEffect, useMemo, useState } from "react";
import type { Bridge } from "./bridge";
import { COPY } from "./copy";
import { TABS, type TabId } from "./tabs";
import { Chip } from "./ui";

function initialTab(bridge: Bridge): TabId {
  const output = bridge.initialToolOutput<{ tab?: TabId }>();
  return output?.tab && TABS.some((tab) => tab.id === output.tab && tab.enabled)
    ? output.tab
    : "today";
}

export function App({ bridge }: { bridge: Bridge }) {
  const [activeId, setActiveId] = useState<TabId>(() => initialTab(bridge));
  const active = useMemo(() => TABS.find((tab) => tab.id === activeId) ?? TABS[0], [activeId]);
  const Panel = active.component;

  useEffect(
    () =>
      bridge.onToolOutput((output) => {
        const tab = (output as { tab?: TabId } | undefined)?.tab;
        if (tab && TABS.some((candidate) => candidate.id === tab && candidate.enabled)) {
          setActiveId(tab);
        }
      }),
    [bridge],
  );

  const chooseTab = (tab: (typeof TABS)[number]) => {
    if (!tab.enabled) return;
    setActiveId(tab.id);
    bridge.saveViewState({ tab: tab.id });
  };

  return (
    <div className="shell" data-theme={bridge.theme()}>
      <header>
        <div>
          <div className="brand-row">
            <p className="brand">SELF-DEPRECATION</p>
            <Chip tone="good">{COPY.status}</Chip>
          </div>
          <h1>Career dashboard</h1>
        </div>
      </header>

      <nav aria-label="Workspace tabs">
        {TABS.filter((tab) => tab.nav !== false).map((tab) => (
          <button
            className={tab.id === active.id ? "tab active" : "tab"}
            key={tab.id}
            onClick={() => chooseTab(tab)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main>
        <Panel bridge={bridge} />
      </main>
    </div>
  );
}
