import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteOrigin, isIndexable, structuredData } from "../lib/seo";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import manifest from "../app/manifest";

afterEach(() => vi.unstubAllEnvs());

describe("SEO discovery and privacy", () => {
  it("normalizes the configured canonical origin and rejects non-web URLs", () => {
    expect(getSiteOrigin({ SITE_URL: "https://example.com/path?q=1" })).toBe(
      "https://example.com",
    );
    expect(getSiteOrigin({})).toBe("https://budget.nigel-smith.dev");
    for (const url of [
      "file:///tmp/test",
      "javascript:alert(1)",
      "https://user:password@example.com",
    ]) {
      expect(() => getSiteOrigin({ SITE_URL: url })).toThrow();
    }
  });

  it("never indexes previews, development, or loopback deployments", () => {
    expect(isIndexable({ NODE_ENV: "production", VERCEL_ENV: "preview" })).toBe(
      false,
    );
    expect(isIndexable({ NODE_ENV: "development" })).toBe(false);
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(
        isIndexable({ NODE_ENV: "production", SITE_URL: `https://${host}` }),
      ).toBe(false);
    }
    expect(
      isIndexable({ NODE_ENV: "production", SITE_URL: "http://example.com" }),
    ).toBe(false);
  });

  it("publishes only the landing page and blocks private routes in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SITE_URL", "https://example.com");
    expect(sitemap()).toEqual([{ url: "https://example.com/" }]);
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/budget", "/admin", "/pending"],
      },
      sitemap: "https://example.com/sitemap.xml",
    });
    expect(structuredData()["@graph"].map((entry) => entry.url)).toEqual([
      "https://example.com/",
      "https://example.com/",
    ]);
  });

  it("removes sitemap entries and disallows crawling on previews", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(sitemap()).toEqual([]);
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("uses generated home-screen icons at the required dimensions", () => {
    expect(manifest().icons).toEqual(
      [192, 512].map((size) => ({
        src: `/icon/${size}`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose: "any",
      })),
    );
  });
});
