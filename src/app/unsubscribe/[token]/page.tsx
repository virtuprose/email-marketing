import { CheckCircle2, ShieldAlert } from "lucide-react";
import { unsubscribeByToken } from "@/lib/sending";

export const dynamic = "force-dynamic";

type UnsubscribePageProps = {
  params: Promise<{ token: string }>;
};

export default async function UnsubscribePage({ params }: UnsubscribePageProps) {
  const { token } = await params;
  const result = await unsubscribeByToken(token);
  const success = result.status === "unsubscribed" || result.status === "already_used";

  return (
    <section className="panel public-panel">
      <div className="panel-body stack" style={{ textAlign: "center" }}>
        {success ? (
          <CheckCircle2 size={42} color="var(--state-success)" aria-hidden="true" />
        ) : (
          <ShieldAlert size={42} color="var(--state-danger)" aria-hidden="true" />
        )}
        <h1>{success ? "You are unsubscribed" : "Unsubscribe link not found"}</h1>
        <p className="page-description" style={{ marginInline: "auto" }}>
          {success
            ? `${result.email ?? "This email"} has been added to the Virtuprose suppression list and will not receive follow-up campaign emails.`
            : "This unsubscribe link is no longer valid. You can still reply to the original email and ask not to be contacted."}
        </p>
      </div>
    </section>
  );
}
