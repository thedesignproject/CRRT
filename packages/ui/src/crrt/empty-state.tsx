import type { ReactNode } from "react";
import { cn } from "../lib/utils";

type EmptyStateProps = { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string };

/** Empty states explain *why* it's empty and offer the next move, never just "Nothing here". */
export function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-16 text-center", className)}>
      {icon && (
        <span aria-hidden="true" className="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-3 text-text-subtle ring-1 ring-border [&_svg]:size-5">
          {icon}
        </span>
      )}
      <p className="font-medium text-text-strong">{title}</p>
      {children && <p className="max-w-72 text-[13px] text-text-subtle">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
