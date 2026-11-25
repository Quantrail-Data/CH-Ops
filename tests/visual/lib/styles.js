// Saves the computed style of key UI elements: the first visible one of each kind.
const KEY_ELEMENTS = {
  "primary button": ".btn-primary",
  "secondary button": ".btn-secondary",
  "danger button": ".btn-danger",
  "small button": ".btn-sm",
  input: ".form-input, input[type=text], input:not([type])",
  label: ".form-label, label",
  card: ".card",
  "table header": "th",
  "table cell": "td",
  badge: ".badge",
  tab: ".tab-item",
  "active tab": ".tab-item.active",
  "sidebar item": ".sidebar-item",
  navbar: ".navbar, nav",
  heading: "h1, h2",
  dialog: ".modal, [role=dialog]",
  toast: ".toast",
  alert: ".alert-banner",
};

const PROPERTIES = [
  "color", "background-color", "font-family", "font-size", "font-weight", "line-height",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-top-style", "border-top-color", "border-radius", "box-shadow", "height",
];

export async function readKeyStyles(page) {
  return page.evaluate(({ elements, properties }) => {
    const result = {};
    for (const [name, selector] of Object.entries(elements)) {
      const element = [...document.querySelectorAll(selector)].find((item) => {
        const box = item.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
      if (!element) continue;
      const style = getComputedStyle(element);
      result[name] = Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
    }
    return result;
  }, { elements: KEY_ELEMENTS, properties: PROPERTIES });
}
