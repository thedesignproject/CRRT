import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  CommandBlock,
  ConnectionStatus,
  QuotaMeter,
  SegmentedTabs,
  SetupChecklist,
  UploadDropzone,
} from ".";

const meta = { title: "CRRT Patterns/Connect", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="max-w-170 bg-surface-2 p-6 font-sans text-sm text-text-strong">{children}</div>
);

export const Command: Story = {
  render: () => (
    <Frame>
      <CommandBlock
        command="claude mcp add --scope user --transport http crrt https://crrt.ai/mcp"
        steps={["Run it once per machine.", "Restart your agent."]}
      />
    </Frame>
  ),
};

export const ClientTabs: Story = {
  render: function Render() {
    const [v, setV] = useState("Claude Code");
    return (
      <Frame>
        <SegmentedTabs label="Agent client" options={["Claude Code", "Codex", "Cursor", "Claude", "Other"]} value={v} onChange={setV} />
      </Frame>
    );
  },
};

export const Connection: Story = {
  render: () => (
    <Frame>
      <div className="flex flex-col gap-3">
        <ConnectionStatus state="waiting" />
        <ConnectionStatus state="connected" client="Claude Code" />
        <ConnectionStatus state="failed" />
      </div>
    </Frame>
  ),
};

export const Quota: Story = {
  render: () => (
    <Frame>
      <div className="flex flex-col gap-4">
        <QuotaMeter plan="Free" used={2} limit={25} />
        <QuotaMeter plan="Free" used={18} limit={25} upgradeHref="#" />
      </div>
    </Frame>
  ),
};

export const Checklist: Story = {
  render: () => (
    <Frame>
      <SetupChecklist
        className="w-56"
        steps={[
          { id: "a", label: "Connect your agent", done: true },
          { id: "w", label: "Install the widget" },
          { id: "t", label: "Invite your team" },
          { id: "s", label: "Connect Storybook", optional: true, href: "#" },
        ]}
      />
    </Frame>
  ),
};

export const Dropzone: Story = { render: () => <Frame><UploadDropzone /></Frame> };
