import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Inbox } from "lucide-react";
import {
  CommentRow,
  EmptyState,
  FilterTabs,
  PinnedPreview,
  ShortcutBar,
  StatusChip,
  Thread,
  type Comment,
} from ".";

const meta = { title: "CRRT Patterns/Inbox", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="max-w-170 bg-surface-2 p-6 font-sans text-sm text-text-strong">{children}</div>
);

const COMMENTS: Comment[] = [
  { id: "1", pin: 1, author: "Ana Pérez", body: "The CTA sits below the fold on laptops.", page: "/pricing", selector: "button.cta", status: "open", createdAt: "4m" },
  { id: "2", pin: 2, author: "Leo Park", body: "Use the brand orange on the badge.", page: "/pricing", selector: ".plan-badge", status: "agent", createdAt: "12m" },
  { id: "3", pin: 3, author: "Ana Pérez", body: "Header overlaps the logo at 375px.", page: "/", selector: "header nav", status: "testing", createdAt: "1h" },
  { id: "4", pin: 4, author: "Mia Chen", body: "Typo in the FAQ title.", page: "/faq", selector: "h2", status: "fixed", createdAt: "2d" },
];

export const Rows: Story = {
  render: function Render() {
    const [selected, setSelected] = useState("2");
    return (
      <Frame>
        <div className="overflow-hidden rounded-lg ring-1 ring-border">
          {COMMENTS.map((c) => (
            <CommentRow key={c.id} comment={c} selected={c.id === selected} onSelect={setSelected} />
          ))}
        </div>
      </Frame>
    );
  },
};

export const Statuses: Story = {
  render: () => (
    <Frame>
      <div className="flex gap-2">
        {(["open", "agent", "testing", "fixed"] as const).map((s) => (
          <StatusChip key={s} status={s} />
        ))}
      </div>
    </Frame>
  ),
};

export const Filters: Story = {
  render: function Render() {
    const [v, setV] = useState<"all" | "open" | "agent" | "testing" | "fixed">("all");
    return (
      <Frame>
        <FilterTabs
          label="Status"
          value={v}
          onChange={setV}
          options={[
            { id: "all", label: "All", count: 4 },
            { id: "open", label: "Open", count: 1 },
            { id: "agent", label: "Agent", count: 1 },
            { id: "testing", label: "Testing", count: 1 },
            { id: "fixed", label: "Done", count: 0 },
          ]}
        />
      </Frame>
    );
  },
};

export const Preview: Story = { render: () => <Frame><PinnedPreview url="app.acme.com/pricing" pin={2} /></Frame> };

export const Conversation: Story = {
  render: () => (
    <Frame>
      <Thread
        onReply={() => {}}
        messages={[
          { id: "1", author: "Leo Park", body: "Use the brand orange on the badge.", time: "12m" },
          { id: "2", author: "Claude Code", body: "Swapped .plan-badge to the carrot token. Ready to test.", time: "3m", agent: true },
        ]}
      />
    </Frame>
  ),
};

export const Empty: Story = {
  render: () => (
    <Frame>
      <EmptyState icon={<Inbox />} title="No pins yet">
        Pins land here when someone comments on your app with the widget.
      </EmptyState>
    </Frame>
  ),
};

export const Shortcuts: Story = {
  render: () => (
    <Frame>
      <ShortcutBar shortcuts={[{ keys: ["J", "K"], label: "Move" }, { keys: ["E"], label: "Done" }, { keys: ["R"], label: "Reply" }]} />
    </Frame>
  ),
};
