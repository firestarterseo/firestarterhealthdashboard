import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page">
      <div className="banner">Account not found.</div>
      <Link href="/" className="back-btn">
        ← All accounts
      </Link>
    </div>
  );
}
