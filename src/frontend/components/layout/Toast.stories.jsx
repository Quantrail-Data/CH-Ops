import { ToastProvider, useToast } from "./Toast.jsx";
import Button from "../ui/Button.jsx";

export default {
  title: "Existing/Toast",
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
};

function Demo() {
  const toast = useToast();
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Button variant="secondary" onClick={() => toast.success("Saved successfully.")}>
        Success
      </Button>
      <Button variant="secondary" onClick={() => toast.error("Something went wrong.")}>
        Error
      </Button>
      <Button variant="secondary" onClick={() => toast.warning("Running low on disk space.")}>
        Warning
      </Button>
      <Button variant="secondary" onClick={() => toast.info("A new version is available.")}>
        Info
      </Button>
    </div>
  );
}

export const AllTypes = {
  render: () => <Demo />,
};
