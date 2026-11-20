import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import {
  CommentRow,
  EmptyState,
  FilterTabs,
  Initials,
  Pin,
  PinnedPreview,
  ShortcutBar,
  SkeletonPage,
  StatusChip,
  STATUS_LABEL,
  Thread,
  type Comment,
} from ".";

afterEach(cleanup);

const comment: Comment = {
  id: "c1",
  pin: 4,
  author: "Ana Pérez",
  body: "The CTA is too low",
  page: "/pricing",
  selector: "button.cta",
  status: "agent",
  createdAt: "2m",
};

describe("CommentRow", () => {
  it("leads with the comment and reports selection", () => {
    const onSelect = vi.fn();
    render(<CommentRow comment={comment} selected onSelect={onSelect} />);
    const row = screen.getByRole("button", { name: /The CTA is too low/ });
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("/pricing · button.cta")).toBeTruthy();
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith("c1");
  });

  it("is clickable without a handler and unselected by default", () => {
    render(<CommentRow comment={{ ...comment, status: "open" }} />);
    const row = screen.getByRole("button", { name: /The CTA is too low/ });
    expect(row.getAttribute("aria-current")).toBeNull();
    fireEvent.click(row);
  });
});

describe("StatusChip", () => {
  it("labels every status and pulses only for the agent", () => {
    const { container, rerender } = render(<StatusChip status="agent" />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    for (const status of ["open", "testing", "fixed"] as const) {
      rerender(<StatusChip status={status} />);
      expect(screen.getByText(STATUS_LABEL[status])).toBeTruthy();
      expect(container.querySelector(".animate-pulse")).toBeNull();
    }
  });
});

describe("FilterTabs", () => {
  function Harness() {
    const [value, setValue] = useState<"all" | "open" | "done">("all");
    return (
      <FilterTabs
        label="Status"
        value={value}
        onChange={setValue}
        options={[
          { id: "all", label: "All", count: 3 },
          { id: "open", label: "Open", count: 3 },
          { id: "done", label: "Done", count: 0 },
        ]}
      />
    );
  }

  it("moves with arrows, wraps, ignores other keys and selects on click", () => {
    render(<Harness />);
    const list = screen.getByRole("tablist", { name: "Status" });
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: /Done/ }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Done/ }));
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /All/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "Tab" });
    fireEvent.click(screen.getByRole("tab", { name: /Open/ }));
    expect(screen.getByRole("tab", { name: /Open/ }).getAttribute("aria-selected")).toBe("true");
    // Zero counts are dimmed.
    expect(screen.getByText("0").className).toContain("text-agent-idle");
    fireEvent.keyDown(list, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Done/ }));
    fireEvent.keyDown(list, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /All/ }));
  });

  it("keeps the first tab reachable when the value matches no option", () => {
    render(<FilterTabs label="Status" value={"gone" as "all"} onChange={() => {}} options={[{ id: "all", label: "All", count: 1 }, { id: "open", label: "Open", count: 0 }]} />);
    expect(screen.getByRole("tab", { name: /All/ }).tabIndex).toBe(0);
    expect(screen.getByRole("tab", { name: /Open/ }).tabIndex).toBe(-1);
  });
});

describe("EmptyState", () => {
  it("renders icon, reason and next move", () => {
    render(
      <EmptyState icon={<svg />} title="No pins yet" action={<a href="#/new">Install the widget</a>}>
        Pins show up here once someone comments.
      </EmptyState>
    );
    expect(screen.getByText("Pins show up here once someone comments.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Install the widget" })).toBeTruthy();
  });

  it("renders the title alone", () => {
    const { container } = render(<EmptyState title="Nothing to review" />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelector("a")).toBeNull();
  });
});

describe("Initials", () => {
  it("abbreviates to two letters and keeps the full name for screen readers", () => {
    const { rerender } = render(<Initials name="ana maría pérez" />);
    expect(screen.getByText("AM")).toBeTruthy();
    expect(screen.getByText("ana maría pérez").className).toContain("sr-only");
    rerender(<Initials name="Bo" size="sm" />);
    expect(screen.getByTitle("Bo").className).toContain("size-5");
  });
});

describe("PinnedPreview", () => {
  it("frames custom content", () => {
    render(
      <PinnedPreview url="app.acme.com/pricing" pin={2}>
        <p>Page</p>
      </PinnedPreview>
    );
    expect(screen.getByText("app.acme.com/pricing")).toBeTruthy();
    expect(screen.getByText("Page")).toBeTruthy();
  });

  it("falls back to a skeleton page with the pin", () => {
    const { container } = render(<PinnedPreview url="x" pin={7} />);
    expect(container.querySelector("[data-pinned]")).not.toBeNull();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("can right-align the skeleton", () => {
    const { container } = render(<SkeletonPage pin={1} align="right" />);
    expect((container.firstChild as HTMLElement).className).toContain("items-end");
  });

  it("renders a standalone pin", () => {
    render(<Pin n={12} className="x" />);
    expect(screen.getByText("12").className).toContain("x");
  });
});

describe("ShortcutBar", () => {
  it("lists keys with their labels", () => {
    render(<ShortcutBar shortcuts={[{ keys: ["J", "K"], label: "Move" }, { keys: ["E"], label: "Done" }]} />);
    expect(screen.getByRole("contentinfo", { name: "Keyboard shortcuts" }).textContent).toBe("JKMoveEDone");
  });
});

describe("Thread", () => {
  const messages = [
    { id: "1", author: "Ana Pérez", body: "Too low", time: "2m" },
    { id: "2", author: "Claude Code", body: "Moved it up", time: "1m", agent: true },
  ];

  it("is read-only without onReply", () => {
    render(<Thread messages={messages} />);
    expect(screen.getByText("Moved it up")).toBeTruthy();
    expect(screen.getByText("Claude Code").className).toContain("text-status-agent-fg");
    expect(screen.getByText("Ana Pérez", { selector: "span.font-medium" }).className).toContain("text-text-strong");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("sends trimmed replies, clears, and ignores empty ones", async () => {
    const onReply = vi.fn();
    render(<Thread messages={messages} onReply={onReply} />);
    const box = screen.getByRole("textbox", { name: "Reply" });
    const send = screen.getByRole("button", { name: "Send reply" });

    fireEvent.change(box, { target: { value: "   " } });
    await act(async () => fireEvent.click(send));
    expect(onReply).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: "  Looks good  " } });
    await act(async () => fireEvent.click(send));
    expect(onReply).toHaveBeenCalledWith("Looks good");
    expect((box as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps the draft until an async send lands, and after a failed one", async () => {
    let settle!: { resolve: () => void; reject: (e: Error) => void };
    const onReply = vi.fn(() => new Promise<void>((resolve, reject) => { settle = { resolve, reject }; }));
    render(<Thread messages={messages} onReply={onReply} />);
    const box = screen.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement;
    const send = screen.getByRole("button", { name: "Send reply" }) as HTMLButtonElement;

    fireEvent.change(box, { target: { value: "First" } });
    fireEvent.click(send);
    expect(send.disabled).toBe(true);
    fireEvent.submit(box.closest("form")!);
    expect(onReply).toHaveBeenCalledOnce();
    await act(async () => settle.reject(new Error("offline")));
    expect(box.value).toBe("First");
    expect(screen.getByRole("alert").textContent).toContain("Couldn’t send your reply");

    fireEvent.click(send);
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => settle.resolve());
    expect(box.value).toBe("");
    expect(send.disabled).toBe(false);
  });
});
