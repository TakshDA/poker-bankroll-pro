import { AuthShell } from "../login/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell subtitle="We'll email you a link to choose a new password">
      <ForgotForm />
    </AuthShell>
  );
}
