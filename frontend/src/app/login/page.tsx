"use client";

import { ChefHat, Receipt, Store, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme";
import { Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { homeFor, useAuth } from "@/lib/auth";
import type { Restaurant, User } from "@/lib/types";

const DEMO = [
  { role: "owner", label: "Owner", icon: Store },
  { role: "kitchen", label: "Kitchen", icon: ChefHat },
  { role: "cashier", label: "Cashier", icon: Receipt },
  { role: "waiter", label: "Waiter", icon: UserRound },
];

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const token = useAuth((s) => s.accessToken);
  const user = useAuth((s) => s.user);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token && user) router.replace(homeFor(user.role));
  }, [token, user, router]);

  const login = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ access_token: string; refresh_token: string; user: User; restaurant: Restaurant }>("/auth/login", {
        body: creds ?? { email, password },
        auth: false,
      });
      setSession(data);
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/dashboard") ? next : homeFor(data.user.role));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      <ThemeToggle className="absolute right-4 top-4 z-10" />
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand font-black text-white">D</span>
            <span className="text-xl font-extrabold">DineOS</span>
          </Link>
          <h1 className="mt-10 text-3xl font-black tracking-tight">Welcome back</h1>
          <p className="mt-1 text-muted">Sign in to your restaurant dashboard.</p>
          <form onSubmit={login} className="mt-8 space-y-4">
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
            <Button block size="lg" loading={busy} type="submit">Sign in</Button>
          </form>
          <p className="mt-6 text-sm text-muted">New restaurant? <Link href="/signup" className="font-semibold text-brand-700">Start a free trial</Link></p>

          <div className="mt-10 rounded-2xl border border-dashed border-line-strong p-4">
            <p className="text-sm font-bold">Explore the demo restaurant</p>
            <p className="text-xs text-muted">“Spice Garden” — see each role&apos;s view.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.role}
                  disabled={busy}
                  onClick={() => login(undefined, { email: `${d.role}@demo.dineos.example`, password: "demo1234" })}
                  className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-semibold hover:border-brand hover:bg-brand-50"
                >
                  <d.icon className="size-4 text-brand" /> {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="hero-glow hidden items-center justify-center p-12 lg:flex">
        <div className="max-w-md">
          <p className="text-4xl font-black leading-tight tracking-tight">“Table 4 is paying at the counter.”</p>
          <p className="mt-4 text-lg text-muted">Every order, bill and request, live on every screen — kitchen, floor and counter.</p>
          <div className="mt-8 space-y-3">
            {["New order #042 · Table T4", "Riya (party of 4) is on the way · pre-order fired", "Paid ₹1,240 via UPI · invoice sent"].map((t, i) => (
              <div key={t} className="animate-float rounded-2xl bg-surface px-4 py-3 text-sm font-semibold shadow-card" style={{ animationDelay: `${i * 0.6}s` }}>{t}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
