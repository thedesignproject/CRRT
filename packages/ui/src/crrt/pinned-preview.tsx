import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { Pin } from "./pin";

type PinnedPreviewProps = {
  url: string;
  pin: number;
  /** Mock or screenshot of the page; the pinned element should carry `data-pinned`. */
  children?: ReactNode;
  className?: string;
};

/** Browser frame around the reviewed page. The product is the brightest thing on screen. */
export function PinnedPreview({ url, pin, children, className }: PinnedPreviewProps) {
  return (
    <figure className={cn("overflow-hidden rounded-xl bg-surface-0 ring-1 ring-border", className)}>
      <div className="flex h-7 items-center gap-1.5 border-b border-border bg-surface-1 px-3">
        <span className="size-2 rounded-full bg-agent-idle" />
        <span className="size-2 rounded-full bg-agent-idle" />
        <span className="size-2 rounded-full bg-agent-idle" />
        <figcaption className="ml-3 truncate font-mono text-[11px] text-text-subtle">{url}</figcaption>
      </div>
      <div className="relative">
        {children ?? <SkeletonPage pin={pin} />}
      </div>
    </figure>
  );
}

/** Placeholder page with one pinned element, for stories and empty previews. */
export function SkeletonPage({ pin, align = "left" }: { pin: number; align?: "left" | "right" }) {
  return (
    <div className={cn("flex flex-col gap-3 p-8", align === "right" && "items-end")}>
      <span className="h-3 w-40 rounded bg-surface-3" />
      <span className="h-20 w-72 max-w-full rounded-lg bg-surface-2 ring-1 ring-border" />
      <span className="h-3 w-56 rounded bg-surface-3" />
      <span data-pinned className="relative mt-5 h-9 w-32 rounded-md ring-2 ring-pin ring-offset-4 ring-offset-surface-0">
        <span className="absolute inset-0 rounded-md bg-surface-4" />
        <Pin n={pin} className="absolute -top-3 -right-3" />
      </span>
    </div>
  );
}
