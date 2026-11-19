import { useEffect, useState } from "react";
import { Toaster as Sonner } from "sonner";
import { IconCircleCheck, IconInfoCircle, IconAlertTriangle, IconAlertOctagon, IconLoader } from "@tabler/icons-react"

// CHOps sets data-theme="light" on <html> for the light theme. Dark is the default.
function readAppTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

// Follow theme changes, so the toasts switch with the app.
function useAppTheme() {
  const [theme, setTheme] = useState(readAppTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readAppTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

const Toaster = ({
  ...props
}) => {
  const theme = useAppTheme()

  return (
    <Sonner
      theme={theme}
      className="tw:toaster tw:group"
      icons={{
        success: (
          <IconCircleCheck className="tw:size-4" />
        ),
        info: (
          <IconInfoCircle className="tw:size-4" />
        ),
        warning: (
          <IconAlertTriangle className="tw:size-4" />
        ),
        error: (
          <IconAlertOctagon className="tw:size-4" />
        ),
        loading: (
          <IconLoader className="tw:size-4 tw:animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)"
        }
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
}

export { Toaster }
