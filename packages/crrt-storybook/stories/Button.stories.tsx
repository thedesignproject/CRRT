import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

// The crrt.rules parameter mirrors the design system's *.meta.yaml: rule id +
// one-line essence. In a real DS these come from the component's metadata.
const meta = {
  title: "Components/Button",
  component: Button,
  args: { children: "Button" },
  parameters: {
    crrt: {
      rules: [
        {
          id: "design/one-primary-button",
          essence: "Only one primary button per view/section.",
          href: "https://github.com/thedesignproject",
        },
        {
          id: "design/interactive-states",
          essence:
            "Focus, disabled and pending states follow the shared interactive-states pattern.",
        },
        {
          id: "a11y/accessible-label",
          essence:
            "Must have an accessible label — icon-only buttons always require an aria-label.",
        },
      ],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: "primary" },
};

export const Secondary: Story = {
  args: { variant: "secondary" },
};

// Deliberately missing its aria-label: the built-in accessible-name check
// should fail here. No fake green checkmarks.
export const IconOnlyBroken: Story = {
  args: {
    variant: "secondary",
    children: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" />
        <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
};
