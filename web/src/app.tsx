import { useMemo, useState } from "react";
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
          <h1>Your career migration guide</h1>
          <p className="subtitle">Less panic. Better queries. A path forward.</p>
        </div>
        <span className="version">{COPY.version}</span>
      </header>

      <nav aria-label="Workspace tabs">
        {TABS.map((tab) => (
          <button
            className={tab.id === active.id ? "tab active" : "tab"}
            disabled={!tab.enabled}
            key={tab.id}
            onClick={() => chooseTab(tab)}
            type="button"
          >
            {tab.label}
            {!tab.enabled ? <span className="soon">soon</span> : null}
          </button>
        ))}
      </nav>

      <main>
        <Panel bridge={bridge} />
      </main>

      <footer>{COPY.hope}</footer>
    </div>
  );
}
