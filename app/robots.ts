import type { MetadataRoute } from "next";
import { getSiteOrigin, isIndexable } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/budget", "/admin", "/pending"],
    },
    sitemap: `${getSiteOrigin()}/sitemap.xml`,
  };
}
