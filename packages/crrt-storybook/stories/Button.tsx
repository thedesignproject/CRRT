import React from "react";

export interface ButtonProps {
  variant?: "primary" | "secondary";
  children?: React.ReactNode;
  "aria-label"?: string;
  onClick?: () => void;
}

const palette = {
  primary: { background: "#F26419", color: "white", border: "none" },
  secondary: {
    background: "transparent",
    color: "#1a1a1a",
    border: "1px solid rgba(0,0,0,0.25)",
  },
} as const;

export const Button = ({
  variant = "primary",
  children,
  onClick,
  ...rest
}: ButtonProps) => (
  <button
    onClick={onClick}
    style={{
      ...palette[variant],
      padding: "8px 16px",
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
    }}
    {...rest}
  >
    {children}
  </button>
);
