import Button from "./Button.jsx";

export default {
  title: "UI/Button",
  component: Button,
  args: { children: "Save changes" },
};

export const Primary = { args: { variant: "primary" } };
export const Secondary = { args: { variant: "secondary" } };
export const Danger = { args: { variant: "danger", children: "Delete" } };
export const Ghost = { args: { variant: "ghost", children: "Cancel" } };
export const Small = { args: { variant: "primary", size: "sm" } };
export const WithIcon = { args: { variant: "primary", icon: "plus", children: "New User" } };
export const Loading = { args: { variant: "primary", loading: true } };
export const Disabled = { args: { variant: "primary", disabled: true } };
export const NoVariantCustomStyled = {
  args: {
    variant: null,
    children: "Custom color",
    style: { background: "#dc2626", color: "#fff" },
  },
};
