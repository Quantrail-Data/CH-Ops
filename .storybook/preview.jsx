// Storybook preview - Copyright (C) 2026 Quantrail™ Data Private Limited
//
// Every component in components/ui/ (and the existing components documented
// alongside them) is a thin wrapper over global.css classes driven by
// [data-theme] custom properties, so stories need the real stylesheet loaded
// and a way to flip themes - not an isolated CSS-in-JS sandbox.
import "../src/frontend/styles/global.css";

/** @type {import('@storybook/react-vite').Preview} */
export default {
  parameters: {
    controls: { expanded: true },
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      description: "Light / dark theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "dark",
  },
  decorators: [
    (Story, context) => {
      document.documentElement.setAttribute("data-theme", context.globals.theme);
      return (
        <div style={{ background: "var(--bg-page)", color: "var(--text-primary)", padding: 24 }}>
          <Story />
        </div>
      );
    },
  ],
};
