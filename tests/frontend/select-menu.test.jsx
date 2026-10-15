// @vitest-environment jsdom

import React, { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SelectMenu from "../../src/frontend/components/common/SelectMenu.jsx";

function renderMenu({ rect, onRequestClose = vi.fn(), listRef = createRef() } = {}) {
    const anchorRef = createRef();
    const view = render(
        <>
            <button ref={anchorRef}>Anchor</button>
            <SelectMenu anchorRef={anchorRef} open={false} onRequestClose={onRequestClose} listRef={listRef}>
                <li>Option</li>
            </SelectMenu>
        </>,
    );
    anchorRef.current.getBoundingClientRect = () => rect ?? {
        left: 20,
        right: 120,
        top: 40,
        bottom: 70,
        width: 100,
    };
    view.rerender(
        <>
            <button ref={anchorRef}>Anchor</button>
            <SelectMenu anchorRef={anchorRef} open onRequestClose={onRequestClose} listRef={listRef}>
                <li>Option</li>
            </SelectMenu>
        </>,
    );
    return { onRequestClose, listRef };
}

describe("SelectMenu", () => {
    it("portals an open menu and positions it below its anchor", () => {
        const { listRef } = renderMenu();

        const menu = screen.getByRole("list");
        expect(menu.parentElement).toBe(document.body);
        expect(menu.style.position).toBe("fixed");
        expect(menu.style.left).toBe("20px");
        expect(menu.style.top).toBe("74px");
        expect(listRef.current).toBe(menu);
    });

    it("flips above the anchor when there is more room above", () => {
        renderMenu({ rect: { left: 10, right: 90, top: 500, bottom: 530, width: 80 } });

        const menu = screen.getByRole("list");
        expect(menu.style.bottom).toBe(`${window.innerHeight - 500 + 4}px`);
        expect(menu.style.top).toBe("");
    });

    it("closes on page scroll and resize but ignores menu scroll", () => {
        const onRequestClose = vi.fn();
        renderMenu({ onRequestClose });
        const menu = screen.getByRole("list");

        fireEvent.scroll(menu);
        expect(onRequestClose).not.toHaveBeenCalled();
        fireEvent.scroll(window);
        fireEvent(window, new Event("resize"));

        expect(onRequestClose).toHaveBeenCalledTimes(2);
    });

    it("renders nothing when closed", () => {
        const anchorRef = createRef();
        const { container } = render(
            <SelectMenu anchorRef={anchorRef} open={false}>
                <li>Hidden</li>
            </SelectMenu>,
        );

        expect(container).toBeEmptyDOMElement();
    });
});