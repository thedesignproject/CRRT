import React from "react";
import { addons, types } from "storybook/manager-api";
import { CarrotPanel } from "./CarrotPanel";

const ADDON_ID = "crrt";
const PANEL_ID = `${ADDON_ID}/panel`;

// Register the custom "crrt" panel (Carrot feedback loop entry point).
// Storybook auto-loads .storybook/manager.tsx — no main.ts change needed.
addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: "🥕 CRRT",
    render: ({ active }) => <CarrotPanel active={!!active} />,
  });
});
