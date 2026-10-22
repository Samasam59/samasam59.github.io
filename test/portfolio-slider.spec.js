// Start ./init.sh, then run:
// npx playwright test test/portfolio-slider.spec.js --workers=2 --output=/tmp/portfolio-slider-results
const { test, expect } = require("@playwright/test");

const baseURL = process.env.PREVIEW_URL || "http://127.0.0.1:4000";
const originals = {
  formation: ["logo-gb.png", "GB-vu-den-haut.png", "CDI-GB.png", "Cour-GB-.png", "Entree-GB.png"],
  alternance: ["biotope_2.jpg", "Biotope.jpg", "biotope_ronchin.jpg", "melmap.jpg", "logo-MEL.png"],
};
const current = (page) => page.locator("swiper-container").evaluate((el) => el.swiper.realIndex);
const running = (page) => page.locator("swiper-container").evaluate((el) => el.swiper.autoplay.running);

async function open(page, name) {
  await page.goto(`${baseURL}/${name}/`);
  await page.waitForFunction(() => document.querySelector("swiper-container")?.swiper?.initialized);
}

test.describe.configure({ mode: "parallel" });

for (const name of Object.keys(originals)) {
  for (const mobile of [false, true]) {
    for (const theme of ["light", "dark"]) {
      test(`${name}: ${mobile ? "mobile" : "desktop"}, ${theme}, images and pagination`, async ({ browser }, testInfo) => {
        const context = await browser.newContext({
          viewport: mobile ? { width: 375, height: 812 } : { width: 1440, height: 1000 },
          isMobile: mobile,
          hasTouch: mobile,
          colorScheme: theme,
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
        await open(page, name);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const root = page.locator("[data-slider]");
        await root.scrollIntoViewIfNeeded();
        const frame = page.locator("swiper-container");
        const initialSize = await frame.boundingBox();
        const dots = root.locator("[data-slider-slide]");
        await expect(dots).toHaveCount(5);

        for (let index = 0; index < 5; index++) {
          await dots.nth(index).click();
          await expect.poll(() => current(page)).toBe(index);
          await expect.poll(() => frame.evaluate((el) => el.swiper.animating)).toBe(false);
          await expect(dots.nth(index)).toHaveAttribute("aria-current", "true");
          const image = root.locator('swiper-slide[aria-hidden="false"] img');
          await expect(image).toHaveCount(1);
          await expect(image).toHaveAttribute("src", new RegExp(`/${originals[name][index]}$`));
          await expect.poll(() => image.evaluate((img) => img.complete && img.naturalWidth === 1600 && img.naturalHeight === 900)).toBe(true);
          await expect(image).toHaveCSS("object-fit", "contain");
          const size = await frame.boundingBox();
          expect(size.width).toBe(initialSize.width);
          expect(size.height).toBe(initialSize.height);
          expect(Math.abs(size.width / size.height - 16 / 9)).toBeLessThan(0.01);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          const buttonSize = await dots.nth(index).boundingBox();
          expect(buttonSize.width).toBeGreaterThanOrEqual(44);
          expect(buttonSize.height).toBeGreaterThanOrEqual(44);
          await root.screenshot({ path: testInfo.outputPath(`image-${index + 1}.png`) });
        }
        await page.screenshot({ path: testInfo.outputPath("page.png"), fullPage: true });
        expect(errors).toEqual([]);
        await context.close();
      });
    }
  }

  test(`${name}: autoplay, hover and manual pause`, async ({ page }) => {
    test.setTimeout(45000);
    await open(page, name);
    const frame = page.locator("swiper-container");
    expect(await frame.evaluate((el) => [el.swiper.params.autoplay.delay, el.swiper.params.speed, el.swiper.params.loop])).toEqual([5000, 500, true]);
    expect(await running(page)).toBe(true);
    await expect.poll(() => current(page), { timeout: 6500 }).toBe(1);
    await frame.hover();
    await expect.poll(() => running(page)).toBe(false);
    const hoverIndex = await current(page);
    await page.waitForTimeout(5500);
    expect(await current(page)).toBe(hoverIndex);
    await page.mouse.move(0, 0);
    await expect.poll(() => running(page)).toBe(true);

    await page.locator('[data-slider-slide="4"]').click();
    await page.mouse.move(0, 0);
    await expect.poll(() => current(page)).toBe(4);
    expect(await running(page)).toBe(false);
    await page.waitForTimeout(5500);
    expect(await current(page)).toBe(4);
  });

  test(`${name}: keyboard and reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, name);
    expect(await running(page)).toBe(false);
    expect(await page.locator("swiper-container").evaluate((el) => el.swiper.params.speed)).toBe(0);
    await expect(page.locator("[data-slider-motion-note]")).toBeVisible();
    await expect(page.locator("[data-slider-toggle]")).toHaveCount(0);
    const firstDot = page.locator('[data-slider-slide="0"]');
    await firstDot.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => current(page)).toBe(4);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => current(page)).toBe(0);
    await page.keyboard.press("End");
    await expect.poll(() => current(page)).toBe(4);
    await page.keyboard.press("Home");
    await expect.poll(() => current(page)).toBe(0);
    await page.keyboard.press("Tab");
    await expect(page.locator('[data-slider-slide="1"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => current(page)).toBe(1);
    const focusStyle = await page.locator(":focus").evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(focusStyle).not.toBe("none");
    await page.waitForTimeout(5500);
    expect(await current(page)).toBe(1);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(await running(page)).toBe(false);
  });

  test(`${name}: touch swipe pauses playback`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await open(page, name);
    await page.locator("swiper-container").scrollIntoViewIfNeeded();
    const box = await page.locator("swiper-container").boundingBox();
    const client = await context.newCDPSession(page);
    const y = box.y + box.height / 2;
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width * 0.85, y }] });
    for (const fraction of [0.7, 0.5, 0.3, 0.15]) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + box.width * fraction, y }] });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => current(page)).toBe(1);
    expect(await running(page)).toBe(false);
    await page.waitForTimeout(5500);
    expect(await current(page)).toBe(1);
    await context.close();
  });

  test(`${name}: fallback without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 640 } });
    const page = await context.newPage();
    await page.goto(`${baseURL}/${name}/`);
    await expect(page.locator("swiper-slide").first()).toBeVisible();
    await expect(page.locator("swiper-slide").nth(1)).toBeHidden();
    await expect(page.locator("[data-slider-toggle]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
  });
}

test("slider assets stay scoped to the two pages", async ({ page }) => {
  for (const path of ["/", "/e5/"]) {
    await page.goto(`${baseURL}${path}`);
    await expect(page.locator('script[src*="swiper"], script[src*="portfolio-slider"], link[href*="portfolio-slider"]')).toHaveCount(0);
  }
});
