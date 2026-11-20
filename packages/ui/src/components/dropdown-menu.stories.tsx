import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./dropdown-menu";
import { Button } from "./button";

const meta = {
  title: "Components/DropdownMenu",
  component: DropdownMenu,
  tags: ["autodocs"],
  argTypes: {
    defaultOpen: { control: "boolean" },
    modal: { control: "boolean" },
  },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger render={<Button variant="outline">More actions</Button>} />
      <DropdownMenuContent>
        <DropdownMenuItem>Mark done</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Send to</DropdownMenuLabel>
          <DropdownMenuItem>GitHub</DropdownMenuItem>
          <DropdownMenuItem>Linear</DropdownMenuItem>
          <DropdownMenuItem disabled>Jira</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const Open: Story = { ...Default, args: { defaultOpen: true } };
