import Link from "next/link";
import NewAccountForm from "../../../components/NewAccountForm";

export default function NewAccountPage() {
  return (
    <div className="page">
      <Link href="/" className="back-btn">
        ← All accounts
      </Link>
      <h1>Add a new account</h1>
      <p className="subtitle">
        Fill in whatever IDs you already have — GA4, Search Console, CallRail, GBP, Ads. Blank
        fields are fine; the account shows up on the dashboard immediately either way.
      </p>
      <NewAccountForm />
    </div>
  );
}
