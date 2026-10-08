import type { MetadataRoute } from "next";
import { site } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: site.name,
    short_name: site.name,
    description: site.description,
    lang: "en",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: site.background,
    theme_color: site.accent,
    categories: ["finance", "productivity"],
    icons: [192, 512].map((size) => ({
      src: `/icon/${size}`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    })),
  };
}
