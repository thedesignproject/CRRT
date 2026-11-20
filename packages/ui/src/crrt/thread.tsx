import { useId, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "../lib/utils";
import { Initials } from "./initials";

export type ThreadMessage = {
  id: string;
  author: string;
  body: string;
  time: string;
  agent?: boolean;
};

type ThreadProps = {
  messages: ThreadMessage[];
  /**
   * Called with the trimmed reply. Return a promise to keep the draft until it resolves;
   * a rejection keeps the draft and shows an error. Omit to render the thread read-only.
   */
  onReply?: (body: string) => void | Promise<unknown>;
  className?: string;
};

/** Comment thread. Agent replies are marked violet and carry their tool calls in mono. */
export function Thread({ messages, onReply, className }: ThreadProps) {
  return (
    <section
      aria-label="Thread"
      className={cn("flex flex-col gap-4", className)}
    >
      <ol className="flex flex-col gap-4">
        {messages.map((m) => (
          <li key={m.id} className="flex gap-3">
            {m.agent ? (
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-status-agent-bg ring-1 ring-border"
              >
                <span className="size-2 rounded-full bg-agent-working" />
              </span>
            ) : (
              <Initials name={m.author} />
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "font-medium",
                    m.agent ? "text-status-agent-fg" : "text-text-strong",
                  )}
                >
                  {m.author}
                </span>
                <span className="text-xs text-text-subtle">{m.time}</span>
              </p>
              <p className="text-text-body">{m.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {onReply && <ReplyForm onReply={onReply} />}
    </section>
  );
}

/** Reply box under a thread. Sends the trimmed text and clears once sent; empty replies are ignored. */
function ReplyForm({ onReply }: { onReply: (body: string) => void | Promise<unknown> }) {
  const replyId = useId();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setFailed(false);
    try {
      await onReply(body);
      setDraft("");
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <form
        className="flex items-end gap-2 rounded-lg bg-surface-1 p-2 ring-1 ring-border focus-within:ring-ring"
        onSubmit={submit}
      >
        <label className="sr-only" htmlFor={replyId}>
          Reply
        </label>
        <textarea
          id={replyId}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Reply, or @agent to hand it off…"
          className="min-h-7 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm text-text-strong outline-none placeholder:text-text-subtle"
        />
        <button
          type="submit"
          aria-label="Send reply"
          disabled={sending}
          className="flex size-7 items-center justify-center rounded-md bg-surface-4 text-text-body hover:text-text-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          <ArrowUp className="size-4" />
        </button>
      </form>
      {failed && (
        <p role="alert" className="text-xs text-destructive">
          Couldn’t send your reply. It’s still in the box, so try again.
        </p>
      )}
    </>
  );
}
