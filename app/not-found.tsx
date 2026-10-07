import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="pending-page">
      <h1>This page isn’t here.</h1>
      <Link className="btn primary" href="/budget">
        Back to your budget
      </Link>
    </main>
  );
}
