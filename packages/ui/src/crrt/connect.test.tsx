import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";

import {
  AppShell,
  CarrotMark,
  CommandBlock,
  ConnectionStatus,
  InlineCode,
  NavList,
  PromptBlock,
  QuotaMeter,
  SegmentedTabs,
  SetupChecklist,
  StepList,
  TopBar,
  UploadDropzone,
  type NavItem,
} from ".";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stubClipboard(writeText?: (text: string) => Promise<void>) {
  vi.stubGlobal("navigator", { clipboard: writeText ? { writeText } : undefined });
}

describe("AppShell", () => {
  const nav: NavItem[] = [
    { id: "inbox", label: "Inbox", href: "#/inbox", count: 3 },
    { id: "settings", label: "Settings", href: "#/settings" },
  ];
  const projects: NavItem[] = [
    { id: "acme", label: "Acme", href: "#/p/acme", live: true, count: 2 },
    { id: "beta", label: "Beta", href: "#/p/beta", live: true },
    { id: "new", label: "New one", href: "#/p/new", pending: true },
    { id: "pend-active", label: "Pending active", href: "#/p/pa", pending: true, count: 9 },
  ];

  it("renders nav, projects, footer, top bar and marks the active item", () => {
    const onNewProject = vi.fn();
    render(
      <AppShell
        workspace="Acme"
        nav={nav}
        projects={projects}
        activeId="pend-active"
        onNewProject={onNewProject}
        sidebarFooter={<p>Footer</p>}
        topBar={<TopBar crumbs={["Acme", "Inbox"]}>quota</TopBar>}
        className="extra"
      >
        <p>Body</p>
      </AppShell>
    );

    expect(screen.getByRole("link", { name: /Pending active/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Inbox/ }).getAttribute("aria-current")).toBeNull();
    // Pending items show the waiting dot and hide count/live.
    expect(screen.getAllByText("Waiting for first pin")).toHaveLength(2);
    expect(screen.queryByText("9")).toBeNull();
    // Live items show the dot, with or without a count.
    expect(screen.getAllByLabelText("Agent working")).toHaveLength(2);
    expect(within(screen.getByRole("link", { name: /Acme/ })).getByText("2")).toBeTruthy();
    expect(within(screen.getByRole("link", { name: /Inbox/ })).getByText("3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    expect(onNewProject).toHaveBeenCalledOnce();
    expect(screen.getByText("Footer")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
    expect(screen.getByText("quota")).toBeTruthy();
  });

  it("renders without projects, footer or new-project button", () => {
    render(
      <AppShell workspace="Acme" nav={nav} activeId="inbox">
        <p>Body</p>
      </AppShell>
    );
    expect(screen.queryByText("Projects")).toBeNull();
    expect(screen.queryByRole("button", { name: "New project" })).toBeNull();
  });

  it("shows the projects header without an add button when onNewProject is missing", () => {
    render(
      <AppShell workspace="Acme" nav={nav} projects={projects} activeId="inbox">
        <p>Body</p>
      </AppShell>
    );
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New project" })).toBeNull();
  });
});

describe("TopBar", () => {
  it("marks only the last crumb as the current page", () => {
    render(<TopBar crumbs={["Acme", "Settings"]} />);
    expect(screen.getByText("Settings").getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Acme").getAttribute("aria-current")).toBeNull();
  });
});

describe("CarrotMark", () => {
  it("defaults to 22px and accepts a size", () => {
    const { container, rerender } = render(<CarrotMark />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("22");
    rerender(<CarrotMark size={16} />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("16");
  });
});

describe("CommandBlock", () => {
  beforeEach(() => vi.useFakeTimers());

  it("copies, reports it, then resets the label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const onCopy = vi.fn();
    render(<CommandBlock command="npx crrt" steps={["Run it.", "Restart."]} onCopy={onCopy} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy command" })));
    expect(writeText).toHaveBeenCalledWith("npx crrt");
    expect(onCopy).toHaveBeenCalledWith("npx crrt");
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByText("Restart.")).toBeTruthy();

    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByRole("button", { name: "Copy command" })).toBeTruthy();
  });

  it("still confirms when the clipboard is blocked or missing", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    const { unmount } = render(<CommandBlock command="a" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy command" })));
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    unmount();

    stubClipboard();
    render(<CommandBlock command="b" steps={[]} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy command" })));
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("exports InlineCode and a standalone StepList", () => {
    render(
      <>
        <InlineCode>list_projects</InlineCode>
        <StepList steps={["One"]} />
      </>
    );
    expect(screen.getByText("list_projects").tagName).toBe("CODE");
    expect(screen.getByRole("listitem").textContent).toBe("One");
  });
});

describe("PromptBlock", () => {
  beforeEach(() => vi.useFakeTimers());

  it("highlights the project's values and copies the exact prompt", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const onCopy = vi.fn();
    const prompt = "Use project acme.io (id acme.io) with code K7F-29Q.";
    render(<PromptBlock header="Paste this" prompt={prompt} highlight={["acme.io", "K7F-29Q"]} onCopy={onCopy} />);

    const marks = document.querySelectorAll("mark");
    expect([...marks].map((m) => m.textContent)).toEqual(["acme.io", "acme.io", "K7F-29Q"]);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy prompt" })));
    expect(writeText).toHaveBeenCalledWith(prompt);
    expect(onCopy).toHaveBeenCalledOnce();
    expect(screen.getByText("Copied")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByText("Copy prompt")).toBeTruthy();
  });

  it("can block copying until the prompt is ready", () => {
    const onCopy = vi.fn();
    render(<PromptBlock header="Paste this" prompt="Wait" disabled onCopy={onCopy} />);
    const button = screen.getByRole("button", { name: "Copy prompt" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it("renders plain text without highlights and survives a blocked clipboard", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    render(<PromptBlock header="Plain" prompt="Hello" />);
    expect(document.querySelector("mark")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy prompt" })));
    expect(screen.getByText("Copied")).toBeTruthy();
  });
});

describe("ConnectionStatus", () => {
  it("waits for list_projects by default with the restart hint", () => {
    render(<ConnectionStatus state="waiting" />);
    expect(screen.getByRole("status").textContent).toContain("Waiting for your agent to call list_projects…");
    expect(screen.getByText("Not seeing it? Restart the agent session.")).toBeTruthy();
  });

  it("accepts a custom wait and no hint", () => {
    render(<ConnectionStatus state="waiting" waitingFor="Waiting for Storybook" hint={null} />);
    expect(screen.getByRole("status").textContent).toBe("Waiting for Storybook…");
  });

  it("names the client once connected, or falls back", () => {
    const { rerender } = render(<ConnectionStatus state="connected" client="Codex" />);
    expect(screen.getByRole("status").textContent).toContain("Codex is connected.");
    rerender(<ConnectionStatus state="connected" />);
    expect(screen.getByRole("status").textContent).toContain("Your agent is connected.");
    rerender(<ConnectionStatus state="connected" message="Storybook connected." />);
    expect(screen.getByRole("status").textContent).toBe("Storybook connected.");
  });

  it("explains a failure, with an optional custom message", () => {
    const { rerender } = render(<ConnectionStatus state="failed" className="x" />);
    expect(screen.getByRole("status").textContent).toContain("We couldn’t reach your agent.");
    rerender(<ConnectionStatus state="failed" message="The code expired." />);
    expect(screen.getByRole("status").textContent).toBe("The code expired.");
  });
});

describe("QuotaMeter", () => {
  it("shows calls left and an upgrade link", () => {
    render(<QuotaMeter plan="Free" used={18} limit={25} upgradeHref="#/billing" />);
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("18");
    expect(screen.getByText("7 of 25 agent calls left this week")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Upgrade" }).getAttribute("href")).toBe("#/billing");
  });

  it("clamps when over the limit and hides upgrade without a link", () => {
    render(<QuotaMeter plan="Free" used={30} limit={25} />);
    expect(screen.getByText("0 of 25 agent calls left this week")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("SegmentedTabs", () => {
  function Harness({ size }: { size?: "sm" | "md" }) {
    const [value, setValue] = useState<"A" | "B" | "C">("A");
    return <SegmentedTabs label="Pick" options={["A", "B", "C"] as const} value={value} onChange={setValue} size={size} />;
  }

  it("moves with arrow keys, wraps, and ignores other keys", () => {
    render(<Harness />);
    const list = screen.getByRole("tablist", { name: "Pick" });
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "C" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "C" }));
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "A" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "Enter" });
    expect(screen.getByRole("tab", { name: "A" }).getAttribute("aria-selected")).toBe("true");
  });

  it("selects on click in the small size", () => {
    render(<Harness size="sm" />);
    fireEvent.click(screen.getByRole("tab", { name: "B" }));
    expect(screen.getByRole("tab", { name: "B" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "B" }).className).toContain("h-6");
  });
});

describe("SetupChecklist", () => {
  const steps = [
    { id: "agent", label: "Connect your agent", done: true, href: "#/connect" },
    { id: "widget", label: "Install the widget", href: "#/new" },
    { id: "storybook", label: "Connect Storybook", optional: true, href: "#/settings/storybook" },
    { id: "team", label: "Invite your team" },
  ];

  it("counts required steps and points at the first required one not done", () => {
    render(<SetupChecklist steps={steps} />);
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByText("Install the widget").closest("li")?.getAttribute("aria-current")).toBe("step");
    // Done steps are not links even with an href; open ones are.
    expect(screen.queryByRole("link", { name: "Connect your agent" })).toBeNull();
    expect(screen.getByRole("link", { name: "Connect Storybook" })).toBeTruthy();
    expect(screen.getByText("Optional")).toBeTruthy();
  });

  it("runs in-app steps as buttons", () => {
    const onSelect = vi.fn();
    render(<SetupChecklist steps={[{ id: "pin", label: "Leave the first pin", done: true, onSelect }, { id: "storybook", label: "Connect Storybook", optional: true, onSelect }]} />);
    expect(screen.queryByRole("button", { name: "Leave the first pin" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connect Storybook" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("honours an explicit current step", () => {
    render(<SetupChecklist steps={steps} currentId="team" />);
    expect(screen.getByText("Invite your team").closest("li")?.getAttribute("aria-current")).toBe("step");
  });
});

describe("UploadDropzone", () => {
  const file = new File(["<p>hi</p>"], "page.html", { type: "text/html" });

  it("highlights on drag and hands over dropped or picked files", () => {
    const onFile = vi.fn();
    const { container } = render(<UploadDropzone onFile={onFile} />);
    const zone = container.querySelector("label")!;
    const input = container.querySelector("input")!;

    fireEvent.dragOver(zone);
    expect(zone.className).toContain("border-carrot");
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain("border-carrot");

    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    fireEvent.drop(zone, { dataTransfer: { files: [] } });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [] } });
    expect(onFile).toHaveBeenCalledTimes(2);
  });

  it("works without a handler", () => {
    const { container } = render(<UploadDropzone />);
    fireEvent.drop(container.querySelector("label")!, { dataTransfer: { files: [file] } });
    fireEvent.change(container.querySelector("input")!, { target: { files: [file] } });
    expect(screen.getByText("Drop an HTML file")).toBeTruthy();
  });
});

describe("AppShell views without a URL", () => {
  it("renders href-less items as buttons that call onSelect, and hides an empty workspace", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <AppShell nav={[{ id: "inbox", label: "Inbox", onSelect }]} activeId="inbox">
        <p>Body</p>
      </AppShell>
    );
    const item = screen.getByRole("button", { name: "Inbox" });
    expect(item.getAttribute("type")).toBe("button");
    expect(item.getAttribute("aria-current")).toBe("page");
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(container.querySelector(".ml-auto.truncate")).toBeNull();
  });
});

describe("QuotaMeter units", () => {
  it("meters any unit and period", () => {
    render(<QuotaMeter plan="Starter" used={120} limit={500} unit="comments" period="this month" />);
    expect(screen.getByRole("meter", { name: "comments used this month" })).toBeTruthy();
    expect(screen.getByText("380 of 500 comments left this month")).toBeTruthy();
  });
});

describe("AppShell empty projects", () => {
  it("shows the empty state only when there are no projects", () => {
    const { rerender } = render(
      <AppShell nav={[]} projects={[]} projectsEmpty="Loading projects…" activeId="">
        <p>Body</p>
      </AppShell>
    );
    expect(screen.getByText("Loading projects…")).toBeTruthy();
    rerender(
      <AppShell nav={[]} projects={[{ id: "a", label: "Acme", href: "#a" }]} projectsEmpty="Loading projects…" activeId="">
        <p>Body</p>
      </AppShell>
    );
    expect(screen.queryByText("Loading projects…")).toBeNull();
    expect(screen.getByRole("link", { name: "Acme" })).toBeTruthy();
  });

  it("exports NavList for sidebar footers", () => {
    render(<NavList items={[{ id: "docs", label: "Documents", href: "#/docs" }]} activeId="docs" />);
    expect(screen.getByRole("link", { name: "Documents" }).getAttribute("aria-current")).toBe("page");
  });
});
