import { TAB_SELECTOR } from "./settings.js";

// Opens each tab of a page in turn. Returns how many tabs it found.
export async function clickEachTab(page, waitUntilQuiet, onTabOpen) {
  const tabs = page.locator(TAB_SELECTOR);
  const count = await tabs.count();
  // The first tab is already open.
  for (let index = 1; index < count; index++) {
    const tab = tabs.nth(index);
    if (!(await tab.isVisible())) continue;
    const label = ((await tab.innerText()) || `tab-${index}`).trim();
    await tab.click();
    await waitUntilQuiet();
    if (onTabOpen) await onTabOpen(label, index);
  }
  return count;
}
