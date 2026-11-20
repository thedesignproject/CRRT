import type { Meta, StoryObj } from "@storybook/react-vite";
import { Kbd, KbdGroup } from "./kbd";

const meta = {
  title: "Components/Kbd",
  component: Kbd,
  tags: ["autodocs"],
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: (args) => <Kbd {...args}>Esc</Kbd> };

export const Combo: Story = {
  render: () => (
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  ),
};
