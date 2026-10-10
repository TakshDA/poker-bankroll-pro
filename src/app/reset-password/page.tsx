import { requireUser } from "@/lib/auth";
import { AuthShell } from "../login/auth-shell";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const user = await requireUser();
  return (
    <AuthShell subtitle={`Choose a new password for ${user.email}`}>
      <ResetForm />
    </AuthShell>
  );
}
