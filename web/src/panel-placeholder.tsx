import { Empty } from "./ui";

export function PanelPlaceholder({ title }: { title: string; enabled?: boolean }) {
  return <Empty title={`${title} isn't available yet`}>Try again after the next update.</Empty>;
}
