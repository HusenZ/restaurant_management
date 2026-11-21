"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme";
import { Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Restaurant, User } from "@/lib/types";

export default function SignupPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const [f, setF] = useState({ restaurant_name: "", owner_name: "", email: "", phone: "", password: "", city: "", with_sample_data: true });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ access_token: string; refresh_token: string; user: User; restaurant: Restaurant }>("/auth/signup", {
        body: { ...f, phone: f.phone || undefined, city: f.city || undefined },
        auth: false,
      });
      setSession(data);
      toast.success(`Welcome to DineOS, ${data.user.name.split(" ")[0]}!`, { description: "Your 14-day trial has started." });
      router.replace("/dashboard");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <ThemeToggle className="absolute right-4 top-4 z-10" />
      <div className="hero-glow hidden flex-col justify-center p-12 lg:flex">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand font-black text-white">D</span>
          <span className="text-xl font-extrabold">DineOS</span>
        </Link>
        <h2 className="mt-12 text-4xl font-black leading-tight tracking-tight">Live in 10 minutes.</h2>
        <ol className="mt-8 space-y-5">
          {[
            ["Create your account", "We set up a sample menu and 12 tables you can edit."],
            ["Make the menu yours", "Prices, photos, variants, veg/non-veg, taxes."],
            ["Print table QR codes", "One click gives you a print-ready PDF of table tents."],
            ["Take your first order", "Scan a QR yourself and watch it hit the kitchen."],
          ].map(([t, b], i) => (
            <li key={t} className="flex gap-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-black text-white">{i + 1}</span>
              <span><span className="block font-bold">{t}</span><span className="text-sm text-muted">{b}</span></span>
            </li>
          ))}
        </ol>
        <ul className="mt-10 space-y-2 text-sm font-semibold text-fg-2">
          {["14-day free trial, no card", "0% commission on every order", "Cancel anytime"].map((t) => <li key={t} className="flex items-center gap-2"><Check className="size-4 text-emerald-600" /> {t}</li>)}
        </ul>
      </div>
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <form onSubmit={submit} className="mx-auto w-full max-w-md space-y-4">
          <div className="mb-6">
            <h1 className="text-3xl font-black tracking-tight">Start your free trial</h1>
            <p className="mt-1 text-muted">Already have an account? <Link href="/login" className="font-semibold text-brand-700">Sign in</Link></p>
          </div>
          <Field label="Restaurant name"><Input value={f.restaurant_name} onChange={set("restaurant_name")} required minLength={2} placeholder="Spice Garden" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name"><Input value={f.owner_name} onChange={set("owner_name")} required minLength={2} autoComplete="name" /></Field>
            <Field label="City"><Input value={f.city} onChange={set("city")} placeholder="Pune" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Work email"><Input type="email" value={f.email} onChange={set("email")} required autoComplete="email" /></Field>
            <Field label="Phone"><Input type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" /></Field>
          </div>
          <Field label="Password" hint="At least 8 characters"><Input type="password" value={f.password} onChange={set("password")} required minLength={8} autoComplete="new-password" /></Field>
          <label className="flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-sm">
            <input type="checkbox" checked={f.with_sample_data} onChange={(e) => setF({ ...f, with_sample_data: e.target.checked })} className="mt-0.5 size-4 accent-[var(--brand)]" />
            <span><b>Start with a sample menu &amp; 12 tables</b><span className="block text-muted">Recommended — edit or delete anything later.</span></span>
          </label>
          <Button block size="lg" loading={busy} type="submit">Create my restaurant</Button>
          <p className="text-center text-xs text-subtle">By continuing you agree to the Terms and Privacy Policy.</p>
        </form>
      </div>
    </div>
  );
}
