import { expect, test } from "@playwright/test";

test("public HTML exposes complete social metadata and structured data", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Make room for");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /Budget/,
  );
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    "content",
    "Budget",
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "website",
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    /^https:\/\/budget\.nigel-smith\.dev\/?$/,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /^https:\/\/budget\.nigel-smith\.dev\/?$/,
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "sizes",
    "180x180",
  );
  const data = JSON.parse(
    await page.locator('script[type="application/ld+json"]').innerText(),
  );
  expect(
    data["@graph"].map((entry: { "@type": string }) => entry["@type"]),
  ).toEqual(["WebSite", "WebApplication"]);

  for (const selector of [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
  ]) {
    const url = new URL(
      (await page.locator(selector).getAttribute("content"))!,
    );
    const response = await page.request.get(url.pathname + url.search);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    const png = await response.body();
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  }
});

test("generated discovery files and icon routes return usable assets", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain(
    "Sitemap: https://budget.nigel-smith.dev/sitemap.xml",
  );
  const sitemap = await request.get("/sitemap.xml");
  const xml = await sitemap.text();
  expect(xml).toContain("<loc>https://budget.nigel-smith.dev/</loc>");
  expect(xml).not.toMatch(/\/(budget|admin|pending|api)[<\/]/);
  const manifestResponse = await request.get("/manifest.webmanifest");
  const manifest = await manifestResponse.json();
  for (const icon of [
    ...manifest.icons,
    { src: "/apple-icon", sizes: "180x180" },
  ]) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    const png = await response.body();
    const size = Number(icon.sizes.split("x")[0]);
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
  const favicon = await request.get("/favicon.ico");
  expect(favicon.ok()).toBe(true);
  const ico = await favicon.body();
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(1);
  expect(ico.readUInt32LE(18)).toBe(22);
  expect(ico.subarray(22, 30).toString("hex")).toBe("89504e470d0a1a0a");
});
