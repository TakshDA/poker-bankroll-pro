import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { RestoreForm } from "./restore-form";

export const metadata = { title: "Backup & restore" };

export default function BackupPage() {
  return (
    <>
      <PageHeader title="Backup & restore" description="A backup is one JSON file with every record in your account, including trashed ones, exactly as stored." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-col gap-1">
            <CardTitle>Download a backup</CardTitle>
            <CardDescription>Keep it somewhere safe. Attachment files (photos of receipts) are not inside the file; only their names are.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/api/export?entity=backup&format=json" download>
                <Download /> Download backup
              </a>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-col gap-1">
            <CardTitle>Restore from a backup</CardTitle>
            <CardDescription>Replaces all data in this account with the backup&apos;s. Works with a backup from this account or from another one. If anything fails, nothing changes.</CardDescription>
          </CardHeader>
          <CardContent>
            <RestoreForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
