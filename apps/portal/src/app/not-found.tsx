import Link from "next/link";
import { MinimalShell } from "@/components/MinimalShell";

export default function NotFound() {
  return (
    <MinimalShell>
      <p className="type-eyebrow">404</p>
      <h1 className="type-h1 mt-2">This page doesn’t exist.</h1>
      <p className="type-body mt-3">
        The link may be out of date.{" "}
        <Link href="/" prefetch={false} className="font-medium text-accent-ink hover:text-accent-ink-hover">
          Go to the community home
        </Link>
        .
      </p>
    </MinimalShell>
  );
}
