import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { AgentRunCard, NextStepRow, type AgentState, type NextStep } from ".";

afterEach(cleanup);

const step: NextStep = { id: "s1", title: "Shorten the hero headline", requesters: ["Ana Pérez", "Bo Li"], comments: 2 };

describe("NextStepRow", () => {
  it("shows the step, who asked and how many comments", () => {
    render(<ul><NextStepRow step={step} /></ul>);
    expect(screen.getByText("Shorten the hero headline")).toBeTruthy();
    expect(screen.getByText("2 comments")).toBeTruthy();
    expect(screen.getByText("Ana Pérez")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("toggles selection and opens the source comment", () => {
    const onToggle = vi.fn();
    const onOpen = vi.fn();
    const view = render(<ul><NextStepRow step={{ ...step, comments: 1 }} onToggle={onToggle} onOpen={onOpen} /></ul>);
    const box = screen.getByRole("checkbox", { name: "Select: Shorten the hero headline" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(box);
    expect(onToggle).toHaveBeenCalledWith("s1");
    fireEvent.click(screen.getByRole("button", { name: "Shorten the hero headline" }));
    expect(onOpen).toHaveBeenCalledWith("s1");
    expect(screen.getByText("1 comment")).toBeTruthy();
    view.rerender(<ul><NextStepRow step={step} checked onToggle={onToggle} /></ul>);
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
  });

  it("marks done and active steps", () => {
    const view = render(<ul><NextStepRow step={{ ...step, doneBy: "Claude Code" }} onToggle={vi.fn()} /></ul>);
    expect(screen.getByRole("checkbox")).toHaveProperty("disabled", true);
    expect(screen.getByText("· completed by Claude Code")).toBeTruthy();
    view.rerender(<ul><NextStepRow step={{ ...step, active: true }} /></ul>);
    expect(screen.getByText("· agent working")).toBeTruthy();
    expect(view.container.querySelector("li")!.className).toContain("bg-surface-3");
  });

  it("shows a delivery status in place of the default", () => {
    const view = render(<ul><NextStepRow step={{ ...step, status: "Agent working", active: true }} /></ul>);
    expect(screen.getByText("· Agent working").className).toContain("text-agent-working");
    expect(screen.queryByText("· agent working")).toBeNull();
    view.rerender(<ul><NextStepRow step={{ ...step, status: "Queued" }} /></ul>);
    expect(screen.getByText("· Queued").className).toBe("");
  });

  it("shows the tag, the rules it follows and extra content", () => {
    render(<ul><NextStepRow step={{ ...step, tag: "copy", rules: ["Short headlines", "Plain words"] }}><p>Paused</p></NextStepRow></ul>);
    expect(screen.getByText("copy")).toBeTruthy();
    expect(screen.getByText("· Follows: Short headlines")).toBeTruthy();
    expect(screen.getByText("· Follows: Plain words")).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();
  });
});

describe("AgentRunCard", () => {
  it.each<[AgentState, string]>([
    ["working", "Working"],
    ["paused", "Paused · needs you"],
    ["done", "Done"],
    ["idle", "Waiting"],
  ])("labels the %s state", (state, label) => {
    render(<AgentRunCard agent="Codex" state={state} title="Run" steps={[]} />);
    const card = screen.getByRole("region", { name: "Codex run" });
    expect(within(card).getByText(label)).toBeTruthy();
    expect(within(card).queryByRole("list", { name: "Agent steps" })).toBeNull();
    expect(card.className.includes("ring-carrot-line")).toBe(state === "working");
  });

  it("logs steps and marks the running one", () => {
    render(
      <AgentRunCard
        agent="Claude Code"
        state="working"
        title="Working through 2 next steps."
        steps={[
          { t: "0:00", tool: "get_comment", detail: "#1 h1", state: "done" },
          { t: "0:04", tool: "edit", state: "running" },
        ]}
      >
        <p>Queue</p>
      </AgentRunCard>
    );
    const log = screen.getByRole("list", { name: "Agent steps" });
    expect(within(log).getAllByRole("listitem")).toHaveLength(2);
    expect(within(log).getByText("#1 h1")).toBeTruthy();
    expect(within(log).getAllByLabelText("running")).toHaveLength(1);
    expect(screen.getByText("Queue")).toBeTruthy();
  });
});
