import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Button, buttonVariants } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Input } from "./input";
import { Kbd, KbdGroup } from "./kbd";

afterEach(cleanup);

describe("Button", () => {
  it("renders a native button with the variant and size slots", () => {
    render(
      <Button variant="outline" size="sm" className="extra">
        Save
      </Button>
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.dataset.slot).toBe("button");
    expect(button.className).toContain("extra");
  });

  it("falls back to the default variant and size", () => {
    expect(buttonVariants()).toContain("bg-primary");
  });
});

describe("Input", () => {
  it("forwards type and className", () => {
    render(<Input type="email" aria-label="Email" className="extra" />);
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input.getAttribute("type")).toBe("email");
    expect(input.className).toContain("extra");
  });
});

describe("Kbd", () => {
  it("renders single keys and groups", () => {
    render(
      <KbdGroup className="group-extra">
        <Kbd className="key-extra">⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    );
    expect(screen.getByText("⌘").className).toContain("key-extra");
    expect(screen.getByText("⌘").parentElement?.className).toContain("group-extra");
  });
});

describe("DropdownMenu", () => {
  it("renders labelled groups, separators and item variants when open", () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>More</DropdownMenuTrigger>
        <DropdownMenuContent className="content-extra" align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="label-extra">Send to</DropdownMenuLabel>
            <DropdownMenuItem className="item-extra">GitHub</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="sep-extra" />
          <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(screen.getByRole("menu").className).toContain("content-extra");
    expect(screen.getByText("Send to").className).toContain("label-extra");
    expect(screen.getByRole("menuitem", { name: "GitHub" }).dataset.variant).toBe("default");
    expect(screen.getByRole("menuitem", { name: "GitHub" }).className).toContain("item-extra");
    expect(screen.getByRole("menuitem", { name: "Delete" }).dataset.variant).toBe("destructive");
    expect(screen.getByRole("separator").className).toContain("sep-extra");
  });
});
