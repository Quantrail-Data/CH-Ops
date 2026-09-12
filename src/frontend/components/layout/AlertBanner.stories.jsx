import { useState } from "react";
import AlertBanner from "./AlertBanner.jsx";
import Button from "../ui/Button.jsx";

export default {
  title: "Existing/AlertBanner",
  component: AlertBanner,
};

export const Success = {
  render: () => {
    const [result, setResult] = useState({ ok: true, msg: "Settings saved." });
    return (
      <>
        <AlertBanner result={result} setResult={setResult} />
        {!result && (
          <Button variant="secondary" onClick={() => setResult({ ok: true, msg: "Settings saved." })}>
            Show again
          </Button>
        )}
      </>
    );
  },
};

export const Error = {
  render: () => {
    const [result, setResult] = useState({ ok: false, msg: "Failed to connect to the cluster." });
    return (
      <>
        <AlertBanner result={result} setResult={setResult} />
        {!result && (
          <Button
            variant="secondary"
            onClick={() => setResult({ ok: false, msg: "Failed to connect to the cluster." })}
          >
            Show again
          </Button>
        )}
      </>
    );
  },
};
