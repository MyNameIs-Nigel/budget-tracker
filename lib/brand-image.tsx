import { ImageResponse } from "next/og";
import { site } from "./seo";

// The same wallet motif is used at every size, including the legacy favicon.
export function brandIcon(size: number) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: site.accent,
      }}
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="15" rx="2" />
        <path d="M3 9h18M7 5V3h10v2" />
        <path d="M16 13h5v4h-5a2 2 0 0 1 0-4Z" />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
