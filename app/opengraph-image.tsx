import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getSiteOrigin, site } from "@/lib/seo";

export const alt =
  "Budget — Make room for what matters. Less debt. More possibility.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // Render through a route at request time, with no static image or remote assets.
  await connection();
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: site.background,
        color: site.foreground,
        padding: "60px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: "62%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 36,
            fontWeight: 700,
            marginBottom: 62,
          }}
        >
          <svg
            width="42"
            height="42"
            viewBox="0 0 24 24"
            fill="none"
            stroke={site.accent}
            strokeWidth="1.7"
            style={{ marginRight: 14 }}
          >
            <rect x="3" y="5" width="18" height="15" rx="2" />
            <path d="M3 9h18M7 5V3h10v2M16 13h5v4h-5a2 2 0 0 1 0-4Z" />
          </svg>
          budget.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 17,
            letterSpacing: 3,
            color: site.accent,
            marginBottom: 20,
          }}
        >
          A LITTLE CLARITY GOES A LONG WAY
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 68,
            lineHeight: 1.08,
            letterSpacing: -3,
            fontWeight: 700,
          }}
        >
          <span>Make room for</span>
          <span style={{ color: site.accent }}>what matters.</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 23,
            color: "#66645c",
            marginTop: 25,
          }}
        >
          Plan spending. Track progress. Pay down debt.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 17,
            color: "#66645c",
            marginTop: "auto",
          }}
        >
          {new URL(getSiteOrigin()).host}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "38%",
          justifyContent: "center",
          paddingLeft: 15,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "#fff",
            border: "1px solid #e8e6df",
            borderRadius: 24,
            padding: 30,
            boxShadow: "0 18px 60px rgba(44,37,19,0.07)",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 15,
              color: "#66645c",
              letterSpacing: 2,
              marginBottom: 25,
            }}
          >
            YOUR NEXT CHAPTER
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 37,
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            <span>Less debt.</span>
            <span style={{ color: site.accent }}>More possibility.</span>
          </div>
          <svg
            width="300"
            height="155"
            viewBox="0 0 300 155"
            style={{ marginTop: 30 }}
          >
            <path
              d="M0 35H300M0 80H300M0 125H300"
              stroke="#e8e6df"
              strokeDasharray="3 5"
            />
            <path
              d="M0 20C50 20 55 50 90 62S140 85 165 98S220 125 250 132S275 140 295 143"
              fill="none"
              stroke={site.accent}
              strokeWidth="4"
            />
            <circle cx="295" cy="143" r="5" fill={site.accent} />
          </svg>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 14,
              color: "#66645c",
              marginTop: 15,
            }}
          >
            <span>Today</span>
            <span>A brighter tomorrow</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            fontSize: 16,
            color: "#66645c",
            marginTop: 25,
          }}
        >
          Small steps. A clear direction.
        </div>
      </div>
    </div>,
    size,
  );
}
