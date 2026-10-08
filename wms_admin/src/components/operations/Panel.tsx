import type { ReactNode } from 'react';

interface PanelProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function Panel({ children, className = '' }: PanelProps) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-[18px] shadow-panel ${className}`}>
      {children}
    </section>
  );
}
