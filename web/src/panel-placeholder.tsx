import { Empty } from "./ui";

export function PanelPlaceholder({ title, enabled = true }: { title: string; enabled?: boolean }) {
  return (
    <Empty title={enabled ? `${title} is warming up` : `${title} arrives after Foundation`}>
      {enabled
        ? "The tab is wired. Its feature tools are the next migration step."
        : "This surface is predeclared so feature work can land without changing the shell."}
    </Empty>
  );
}
