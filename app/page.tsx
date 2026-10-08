import {
  getSiteOrigin,
  landingMetadata,
  structuredData,
  site,
} from "@/lib/seo";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  LockKeyhole,
  ArrowDownRight,
  ChartNoAxesCombined,
  SlidersHorizontal,
} from "lucide-react";
import { getUser } from "@/lib/dal";
import { googleEnabled } from "@/lib/auth";
import { isLocalTestMode } from "@/lib/access";
import { Brand } from "@/components/Icon";
import SignIn from "@/components/SignIn";
import Loading from "@/components/Loading";
export const metadata = {
  ...landingMetadata(),
  openGraph: {
    type: "website" as const,
    locale: "en_US",
    siteName: site.name,
    title: site.title,
    description: site.description,
    url: `${getSiteOrigin()}/`,
  },
};

async function Landing() {
  const u = await getUser();
  if (u) redirect(u.disabled ? "/pending" : "/budget");
  return (
    <>
      <header className="landing-nav">
        <Brand />
        <span className="small muted privacy">
          <LockKeyhole size={14} />A private space for your money
        </span>
      </header>
      <main id="main" className="landing">
        <div className="landing-copy">
          <p className="eyebrow">A little clarity goes a long way</p>
          <h1>
            Make room for
            <br />
            <span className="accent">what matters.</span>
          </h1>
          <p className="landing-description">
            Know where your money goes.
            <br />
            Give every dollar a purpose.
            <br />
            Find your way out of debt, one month at a time.
          </p>
          <SignIn google={googleEnabled} testMode={isLocalTestMode()} />
          <p className="small muted access-note">
            <LockKeyhole size={13} />
            Private by default. New accounts need admin approval.
          </p>
        </div>
        <div className="landing-art" aria-hidden="true">
          <div className="art-glow" />
          <div className="preview-card">
            <div className="preview-top">
              <span className="eyebrow">Your next chapter</span>
              <span className="status-pill">Looking ahead</span>
            </div>
            <div className="preview-balance">
              Less debt.
              <br />
              <span className="accent">More possibility.</span>
            </div>
            <svg viewBox="0 0 400 190" className="preview-chart">
              <defs>
                <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0"
                    stopColor="var(--accent)"
                    stopOpacity=".12"
                  />
                  <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[40, 90, 140].map((y) => (
                <path
                  key={y}
                  d={`M0 ${y}H400`}
                  stroke="var(--border)"
                  strokeDasharray="3 5"
                />
              ))}
              <path
                d="M0 25C50 25 65 55 100 65S155 90 200 110S260 133 300 150S350 166 400 170V190H0Z"
                fill="url(#fade)"
              />
              <path
                d="M0 25C50 25 65 55 100 65S155 90 200 110S260 133 300 150S350 166 400 170"
                stroke="var(--accent)"
                strokeWidth="3"
                fill="none"
              />
              <circle cx="399" cy="170" r="5" fill="var(--accent)" />
            </svg>
            <div className="preview-bottom">
              <span>Today</span>
              <span>
                A brighter tomorrow
                <ArrowDownRight size={15} />
              </span>
            </div>
          </div>
          <div className="art-caption">
            <span className="tiny-dot" />
            Small steps. A clear direction.
          </div>
        </div>
      </main>
      <footer className="landing-footer">
        <span>
          <SlidersHorizontal size={16} />A plan that adjusts with you
        </span>
        <span>
          <ChartNoAxesCombined size={16} />
          Progress you can see
        </span>
        <span>
          <LockKeyhole size={16} />
          Only your eyes, only your budget
        </span>
      </footer>
    </>
  );
}
export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData()).replace(/</g, "\\u003c"),
        }}
      />
      <Suspense fallback={<Loading label="Opening your space…" />}>
        <Landing />
      </Suspense>
    </>
  );
}
