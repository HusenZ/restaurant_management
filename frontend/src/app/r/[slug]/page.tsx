"use client";

import { Bike, CalendarCheck, ChevronRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { BrandScope, PoweredBy, RestaurantHero } from "@/components/guest";
import { CartBar, MenuBrowser } from "@/components/menu";
import { PageLoader, Segmented } from "@/components/ui";
import { publicFetcher } from "@/lib/api";
import { money } from "@/lib/format";
import type { Menu, PublicRestaurant } from "@/lib/types";
import { useWebMode } from "@/lib/webmode";

export default function Storefront() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { data: r, error } = useSWR<PublicRestaurant>(`/public/restaurants/${slug}`, publicFetcher);
  const { data: menu } = useSWR<Menu>(`/public/restaurants/${slug}/menu`, publicFetcher);
  const [mode, setMode] = useWebMode(slug, r);

  if (error) return <div className="p-10 text-center text-sm text-muted">{(error as Error).message}</div>;
  if (!r) return <PageLoader />;
  const s = r.settings;
  const canOrder = s.takeaway_enabled || s.delivery_enabled;

  return (
    <BrandScope color={s.theme_color} className="min-h-dvh bg-surface">
      <div className="mx-auto max-w-xl">
        <RestaurantHero r={r} />
        <div className="space-y-3 px-4 pt-4">
          {canOrder && (
            <div className="flex items-center justify-between gap-3">
              <Segmented
                value={mode}
                onChange={setMode}
                className="w-full"
                options={[
                  ...(s.takeaway_enabled ? [{ value: "takeaway" as const, label: <span className="inline-flex items-center gap-1.5"><ShoppingBag className="size-4" /> Takeaway</span> }] : []),
                  ...(s.delivery_enabled ? [{ value: "delivery" as const, label: <span className="inline-flex items-center gap-1.5"><Bike className="size-4" /> Delivery</span> }] : []),
                ]}
              />
            </div>
          )}
          {mode === "delivery" && s.delivery_enabled && (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
              Delivery fee {money(s.delivery_fee)} · Minimum order {money(s.min_delivery_order)}
            </p>
          )}
          {s.reservations_enabled && (
            <Link href={`/r/${slug}/book`} className="flex items-center gap-3 rounded-2xl border border-line p-3.5 transition hover:border-brand/40">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand"><CalendarCheck className="size-5" /></span>
              <span className="flex-1">
                <span className="block font-bold text-fg">Book a table</span>
                <span className="block text-xs text-muted">{s.preorder_enabled ? "Pre-order so your food is ready when you arrive" : "Reserve in seconds"}</span>
              </span>
              <ChevronRight className="size-5 text-subtle" />
            </Link>
          )}
        </div>
        <div className="px-4">
          {menu ? (
            <MenuBrowser menu={menu} scope={`web:${slug}`} canOrder={canOrder} />
          ) : (
            <PageLoader label="Loading menu…" />
          )}
        </div>
        <PoweredBy />
      </div>
      <CartBar scope={`web:${slug}`} onOpen={() => router.push(`/r/${slug}/checkout`)} label="Checkout" hint={mode === "delivery" ? "Delivery" : "Takeaway"} />
    </BrandScope>
  );
}
