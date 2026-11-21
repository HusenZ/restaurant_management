import type { PublicRestaurant } from "./types";

/** Client-side estimate mirroring backend services/pricing.compute_totals (server is the source of truth). */
export function estimateTotals(subtotal: number, s: PublicRestaurant["settings"], deliveryFee = 0) {
  const sc = Math.round((subtotal * s.service_charge_percent) / 100);
  const rate = s.taxes.reduce((a, t) => a + t.rate, 0);
  let tax: number;
  let pre: number;
  if (s.prices_include_tax && rate) {
    const gross = subtotal + sc;
    tax = gross - Math.round((gross * 100) / (100 + rate));
    pre = gross + deliveryFee;
  } else {
    tax = s.taxes.reduce((a, t) => a + Math.round(((subtotal + sc) * t.rate) / 100), 0);
    pre = subtotal + sc + tax + deliveryFee;
  }
  const total = Math.round(pre / 100) * 100;
  return { serviceCharge: sc, tax, deliveryFee, total, roundOff: total - pre };
}
