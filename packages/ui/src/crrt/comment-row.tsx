import { cn } from "../lib/utils";
import { Initials } from "./initials";
import { Pin } from "./pin";
import { StatusChip, type CommentStatus } from "./status-chip";

export type Comment = {
  id: string;
  pin: number;
  author: string;
  body: string;
  page: string;
  selector: string;
  status: CommentStatus;
  createdAt: string;
};

type CommentRowProps = {
  comment: Comment;
  selected?: boolean;
  onSelect?: (id: string) => void;
};

/** Inbox row: who, what they said, where (mono), status. The label is the comment, never the selector. */
export function CommentRow({ comment, selected, onSelect }: CommentRowProps) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect?.(comment.id)}
      className={cn(
        "flex w-full items-start gap-3 border-b border-sidebar-border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        selected ? "bg-surface-4 shadow-[inset_2px_0_0_var(--carrot)]" : "hover:bg-surface-3"
      )}
    >
      <Initials name={comment.author} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline gap-2">
          <span className="font-medium text-text-strong">{comment.author}</span>
          <span className="text-xs text-text-subtle">{comment.createdAt}</span>
          <StatusChip status={comment.status} className="ml-auto" />
        </span>
        <span className="line-clamp-2 text-text-body">{comment.body}</span>
        <span className="flex items-center gap-1.5 font-mono text-xs text-text-subtle">
          <Pin n={comment.pin} className="size-4 text-[10px]" />
          <span className="truncate">
            {comment.page} · {comment.selector}
          </span>
        </span>
      </span>
    </button>
  );
}
