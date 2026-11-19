// Finds layout problems on the open page: text cut off, text that overlaps
// other text, elements outside the window, and a page that scrolls sideways.
export async function scanLayout(page) {
  return page.evaluate(() => {
    const problems = [];
    const describe = (element) => {
      const id = element.id ? `#${element.id}` : "";
      const className = typeof element.className === "string" && element.className ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
      const text = (element.innerText || "").trim().slice(0, 40);
      return `${element.tagName.toLowerCase()}${id}${className} "${text}"`;
    };
    const isShown = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
    };

    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      problems.push({ kind: "page-scrolls-sideways", detail: `${document.documentElement.scrollWidth}px wide` });
    }

    // Elements that hold text directly.
    const textElements = [...document.querySelectorAll("body *")].filter((element) => {
      if (!isShown(element)) return false;
      if (element.closest("[_echarts_instance_], .cm-editor, .react-flow, svg")) return false;
      return [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    });

    for (const element of textElements) {
      const style = getComputedStyle(element);
      const cutsOff = style.overflow === "hidden" || style.overflowX === "hidden" || style.textOverflow === "ellipsis";
      if (!cutsOff && element.scrollWidth > element.clientWidth + 2 && element.clientWidth > 0) {
        problems.push({ kind: "text-overflows", detail: describe(element) });
      }
      const box = element.getBoundingClientRect();
      if (box.right > window.innerWidth + 1 || box.left < -1) {
        problems.push({ kind: "outside-window", detail: describe(element) });
      }
    }

    // Text boxes that overlap and are not inside each other. Limited, so the
    // scan stays fast on big tables.
    const boxes = textElements.slice(0, 1500).map((element) => ({ element, box: element.getBoundingClientRect() }));
    for (let first = 0; first < boxes.length; first++) {
      for (let second = first + 1; second < boxes.length; second++) {
        const a = boxes[first];
        const b = boxes[second];
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const width = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
        const height = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
        if (width <= 2 || height <= 2) continue;
        const smaller = Math.min(a.box.width * a.box.height, b.box.width * b.box.height);
        if (width * height > smaller * 0.2) {
          problems.push({ kind: "text-overlaps", detail: `${describe(a.element)} and ${describe(b.element)}` });
        }
      }
    }
    return problems;
  });
}
