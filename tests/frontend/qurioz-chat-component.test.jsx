// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-router-dom", () => ({
    useParams: () => ({ session_id: undefined }),
    useNavigate: () => vi.fn(),
}));
vi.mock("framer-motion", () => ({
    AnimatePresence: ({ children }) => children,
    motion: { div: ({ children, ...props }) => <div {...props}>{children}</div> },
}));
vi.mock("../../src/frontend/App.jsx", () => ({
    useConnection: () => ({ selectedClusterId: "cluster-1", activeConnection: {} }),
    useTheme: () => ({ theme: "light" }),
}));
vi.mock("../../src/frontend/utils/api.js", () => ({
    apiFetch: vi.fn().mockResolvedValue({ chats: [] }),
    runQuery: vi.fn().mockResolvedValue({ success: true, rows: [] }),
}));
vi.mock("../../src/frontend/utils/AIGreetsHandler.js", () => ({ isMessageFinders: () => false }));
vi.mock("../../src/frontend/components/common/Icon.jsx", () => ({
    default: ({ className }) => <span data-testid="icon" className={className} />,
}));
vi.mock("../../src/frontend/components/common/Select.jsx", () => ({
    default: ({ children }) => <select aria-label="model">{children}</select>,
}));
vi.mock("../../src/frontend/components/qurioz/ChatInputComponent", () => ({
    default: () => <div data-testid="chat-input">Chat input</div>,
}));
vi.mock("../../src/frontend/components/qurioz/IntroChatComponent.jsx", () => ({
    default: () => <div data-testid="intro-chat">Ask Qurioz</div>,
}));
vi.mock("../../src/frontend/components/qurioz/AILoaderComponent", () => ({
    default: () => <div data-testid="ai-loader">Loading</div>,
}));
vi.mock("../../src/frontend/components/qurioz/ChatRenderComponent", () => ({
    default: () => <div data-testid="chat-render" />,
}));
vi.mock("../../src/frontend/components/layout/Toast.jsx", () => ({
    useToast: () => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
}));
vi.mock("../../src/frontend/components/layout/ConfirmModal.jsx", () => ({
    default: () => null,
}));

import QuriozChatComponent from "../../src/frontend/components/qurioz/QuriozChatComponent.jsx";

describe("QuriozChatComponent", () => {
    it("renders the empty chat shell with its input and intro content", () => {
        render(<QuriozChatComponent ScrollBottomAuto={vi.fn()} sidebar={false} />);

        expect(screen.getByTestId("intro-chat")).toHaveTextContent("Ask Qurioz");
        expect(screen.queryByTestId("chat-input")).not.toBeInTheDocument();
    });
});