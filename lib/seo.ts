import type { Metadata } from "next";

export const site = {
  name: "Budget",
  title: "Budget — a little more breathing room",
  description:
    "Plan your spending, track your progress, and pay down debt in a private budget planner. Give every dollar a purpose and make room for what matters.",
  background: "#fcfbf8",
  accent: "#95601e",
  foreground: "#25251f",
};

// Never derive canonical URLs from a request Host header or a preview hostname.
export function getSiteOrigin(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): string {
  const url = new URL(env.SITE_URL || "https://budget.nigel-smith.dev");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "SITE_URL must be an absolute HTTP(S) URL without credentials",
    );
  }
  return url.origin;
}

export function isIndexable(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  const url = new URL(getSiteOrigin(env));
  return (
    env.NODE_ENV === "production" &&
    (!env.VERCEL_ENV || env.VERCEL_ENV === "production") &&
    url.protocol === "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}

export const privateRobots: Metadata["robots"] = {
  index: false,
  follow: false,
  noarchive: true,
};

export function landingMetadata(): Metadata {
  return {
    alternates: { canonical: "/" },
    robots: isIndexable()
      ? {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        }
      : privateRobots,
  };
}

export function structuredData() {
  const origin = getSiteOrigin();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: `${origin}/`,
        name: site.name,
        description: site.description,
        inLanguage: "en",
      },
      {
        "@type": "WebApplication",
        "@id": `${origin}/#application`,
        url: `${origin}/`,
        name: site.name,
        description: site.description,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript and a modern web browser",
        featureList: [
          "Monthly budget planning",
          "Spending tracking",
          "Debt payoff forecasts",
          "Private accounts",
        ],
        isPartOf: { "@id": `${origin}/#website` },
      },
    ],
  };
}
