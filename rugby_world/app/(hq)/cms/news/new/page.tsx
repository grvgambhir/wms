"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function NewArticleRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/cms/news/news-${Date.now()}`);
  }, [router]);
  return <p className="text-sm text-muted-foreground">Opening editor…</p>;
}
