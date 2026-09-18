import { test, expect } from "@playwright/test";

// The table of contents in a real browser: jsdom lays nothing out, so "it
// sits beside the text" and "clicking an entry scrolls" are only answerable
// here.
test.describe("table of contents", () => {
  test("toggles, lists the headings, and scrolls to one", async ({ page }) => {
    await page.goto("/mermaid-diagrams-test.md");
    await expect(page.locator("h1").first()).toBeVisible();

    const toggle = page.getByRole("button", { name: "Show contents" });
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId("table-of-contents")).toHaveCount(0);

    await toggle.click();
    const toc = page.getByTestId("table-of-contents");
    await expect(toc).toBeVisible();

    const entries = toc.locator("nav a");
    expect(await entries.count()).toBeGreaterThan(1);

    // The entry text has to match the heading it points at, with no "#" from
    // the hover anchor that lives inside every rendered heading.
    const secondText = (await entries.nth(1).innerText()).trim();
    expect(secondText.startsWith("#")).toBe(false);

    const scroller = page.locator("[data-content-scroll]");
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);

    await entries.nth(1).click();
    await expect
      .poll(async () => scroller.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await expect(page).toHaveURL(/#.+/);

    // And the choice survives a reload, like the sidebar's collapse does.
    await page.reload();
    await expect(page.getByTestId("table-of-contents")).toBeVisible();

    await page.getByRole("button", { name: "Hide contents" }).click();
    await expect(page.getByTestId("table-of-contents")).toHaveCount(0);
  });

  test("entries are real links: a labeled nav, an href, and a new-tab open", async ({
    page,
    context,
  }) => {
    await page.goto("/mermaid-diagrams-test.md");
    await page.getByRole("button", { name: "Show contents" }).click();
    const toc = page.getByTestId("table-of-contents");

    // A second, unnamed navigation landmark (the breadcrumb has its own) is
    // indistinguishable to a screen reader without this.
    await expect(toc.getByRole("navigation")).toHaveAccessibleName(
      "Table of contents",
    );

    const entry = toc.locator("nav a").nth(1);
    await expect(entry).toHaveAttribute("href", /^#.+/);

    // Middle-click and Cmd/Ctrl-click open the section in a new tab, exactly
    // as the heading's own `#` anchor does — a `<button>` could not do this
    // regardless of its click handler, since the browser only offers it for
    // a real link.
    const href = await entry.getAttribute("href");
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      entry.click({ button: "middle" }),
    ]);
    // A same-document anchor navigation loads no new resource, so
    // `waitForLoadState` never has a network event to settle on — wait for
    // the URL itself instead.
    await popup.waitForURL((url) => url.hash === href);
    await popup.close();
  });

  test("sits beside the document rather than over it", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/mermaid-diagrams-test.md");
    await page.getByRole("button", { name: "Show contents" }).click();

    const toc = page.getByTestId("table-of-contents");
    const heading = page.locator("h1").first();
    const tocBox = (await toc.boundingBox())!;
    const headingBox = (await heading.boundingBox())!;

    expect(tocBox.x + tocBox.width).toBeLessThanOrEqual(headingBox.x);

    // And it stays put while the document scrolls under it.
    await page
      .locator("[data-content-scroll]")
      .evaluate((el) => el.scrollTo({ top: 1200 }));
    await expect
      .poll(async () => (await toc.boundingBox())!.y)
      .toBeLessThan(tocBox.y + 40);
  });
});
