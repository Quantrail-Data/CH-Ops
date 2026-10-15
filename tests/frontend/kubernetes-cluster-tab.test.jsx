import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, toast } = vi.hoisted(() => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  apiFetch: vi.fn((url) => {
    if (url === "/api/k8s/connections") return Promise.resolve([]);
    if (url === "/api/k8s/operators") return Promise.resolve({ operators: [] });
    return Promise.resolve({});
  }),
}));

vi.mock("../../src/frontend/utils/api.js", () => ({
  apiFetch,
}));

vi.mock("../../src/frontend/components/layout/Toast.jsx", () => ({
  useToast: () => toast,
}));

import KubernetesClusterTab from "../../src/frontend/components/admin/KubernetesClusterTab.jsx";

describe("KubernetesClusterTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockImplementation((url) => {
      if (url === "/api/k8s/connections") return Promise.resolve([]);
      if (url === "/api/k8s/operators") return Promise.resolve({ operators: [] });
      return Promise.resolve({});
    });
  });

  it("reads the address, token and certificate from a pasted setup block", async () => {
    render(<KubernetesClusterTab onImported={vi.fn()} />);

    const block = `API address:\n  https://10.0.0.5:6443\nToken:\n  chops-token-123\n-----BEGIN CERTIFICATE-----\nMIIBTEST\n-----END CERTIFICATE-----`;

    fireEvent.change(
      screen.getByPlaceholderText(/Paste the whole block/i),
      { target: { value: block } },
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://10.0.0.5:6443")).toHaveValue("https://10.0.0.5:6443");
      expect(screen.getByDisplayValue("chops-token-123")).toBeInTheDocument();
      expect(screen.getAllByDisplayValue(/MIIBTEST/).length).toBeGreaterThan(0);
    });
  });
});
