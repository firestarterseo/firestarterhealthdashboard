import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import NewAccountForm from "../../../../components/NewAccountForm";

export const dynamic = "force-dynamic";

export default async function EditAccountPage({ params }) {
  const supabase = createClient();
  const { data: account, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !account) {
    notFound();
  }

  return (
    <div className="page">
      <Link href={`/account/${account.id}`} className="back-btn">
        ← {account.name}
      </Link>
      <h1>Edit account</h1>
      <p className="subtitle">
        Update integration mappings for <strong>{account.name}</strong>. Leave any field blank to
        remove that source; the account keeps showing up on the dashboard either way.
      </p>
      <NewAccountForm initialAccount={account} />
    </div>
  );
}
