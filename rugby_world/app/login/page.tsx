"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { DEMO_PASSWORD, DEMO_USER } from "@/lib/seed";
import wrugbyLogo from "@/Assets/wrugby.png";

export default function LoginPage() {
  const { hydrated, session, login } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState(DEMO_USER.email);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState("");

  useEffect(() => {
    if (hydrated && session) router.replace("/dashboard");
  }, [hydrated, session, router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = login(email, password);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <div className="grid h-dvh bg-white lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex items-center justify-center bg-white px-8 py-16">
        <Image
          src={wrugbyLogo}
          alt="World Rugby"
          priority
          className="h-auto w-full max-w-[520px] border-0 object-contain shadow-none outline-none ring-0"
        />
      </div>

      <div className="wr-gradient flex items-center justify-center px-8 py-16 sm:px-16 lg:px-24">
        <div className="w-full max-w-[480px]">
          <p className="text-[11px] font-medium tracking-[0.22em] text-white/45 uppercase">
            Headquarters
          </p>
          <h1 className="mt-3 font-heading text-5xl leading-none font-semibold tracking-tight text-white">
            Sign in
          </h1>
          <p className="mt-4 text-base text-white/60">
            World Rugby HQ Admin. Staff access only.
          </p>

          <form onSubmit={onSubmit} className="mt-12 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/70">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="h-12 rounded-md border-white/15 bg-white/5 text-white placeholder:text-white/30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/70">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-12 rounded-md border-white/15 bg-white/5 text-white placeholder:text-white/30"
              />
            </div>
            {error && <p className="text-sm text-red-300">{error}</p>}
            <Button
              type="submit"
              className="h-12 w-full rounded-md bg-white text-navy hover:bg-white/90"
            >
              Enter HQ
            </Button>
          </form>

          <p className="mt-10 text-sm text-white/40">
            Demo: {DEMO_USER.email} / {DEMO_PASSWORD}
          </p>
        </div>
      </div>
    </div>
  );
}
