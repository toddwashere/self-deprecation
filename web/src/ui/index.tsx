import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from "react";

export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Chip({
  children,
  tone = "neutral",
}: PropsWithChildren<{ tone?: "neutral" | "good" }>) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function Button({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props}>{children}</button>;
}

export function Empty({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <Card className="state-card">
      <h2>{title}</h2>
      <p>{children}</p>
    </Card>
  );
}

export function ErrorBanner({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error" role="alert">
      <span>{message}</span>
      {retry ? <Button onClick={retry}>Retry</Button> : null}
    </div>
  );
}

export function Loading({ line }: { line: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {line}
    </div>
  );
}

export function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="form-row">
      <span>{label}</span>
      {children}
    </div>
  );
}
