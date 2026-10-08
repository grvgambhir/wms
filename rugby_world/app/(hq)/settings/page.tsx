"use client";

import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DEMO_PASSWORD, DEMO_USER } from "@/lib/seed";

export default function SettingsPage() {
  const { session, logout, resetDemo } = useStore();
  const router = useRouter();
  return (
    <div>
      <PageHeader
        eyebrow="HQ"
        title="Settings"
        description="Prototype session and demo data controls."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Signed-in profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium text-navy">{session?.name}</p>
            <p>{session?.title}</p>
            <p className="text-muted-foreground">{session?.email}</p>
            <p className="text-muted-foreground">{session?.role}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              Demo login: {DEMO_USER.email} / {DEMO_PASSWORD}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                logout();
                router.push("/login");
              }}
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Demo data</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Match results, HIA updates, CMS publishes and affiliation decisions persist in this browser. Reset to restore the original walkthrough.
            </p>
            <Button
              className="mt-4"
              variant="destructive"
              onClick={() => {
                resetDemo();
                toast.success("Demo data restored.");
              }}
            >
              Reset demo
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
