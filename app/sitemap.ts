import type { MetadataRoute } from "next";
import { getSiteOrigin, isIndexable } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only the public landing page belongs in search. No synthetic lastmod dates.
  return isIndexable() ? [{ url: `${getSiteOrigin()}/` }] : [];
}
