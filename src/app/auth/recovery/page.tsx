import { AuthShell } from "../../login/auth-shell";
import { RecoveryLanding } from "./recovery-landing";

export const metadata = { title: "Reset password" };

export default function RecoveryPage() {
  return (
    <AuthShell subtitle="Reset your password">
      <RecoveryLanding />
    </AuthShell>
  );
}
