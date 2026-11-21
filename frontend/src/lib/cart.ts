"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Diet } from "./types";

export interface CartLine {
  key: string;
  menu_item_id: string;
  name: string;
  diet: Diet;
  unit_price: number;
  quantity: number;
  option_ids: string[];
  option_labels: string[];
  notes?: string;
}

interface CartState {
  carts: Record<string, CartLine[]>;
  notes: Record<string, string>;
  add: (scope: string, line: Omit<CartLine, "key">) => void;
  setQty: (scope: string, key: string, qty: number) => void;
  clear: (scope: string) => void;
  setNotes: (scope: string, notes: string) => void;
}

export function lineKey(menuItemId: string, optionIds: string[], notes?: string): string {
  return [menuItemId, [...optionIds].sort().join(","), (notes ?? "").trim()].join("|");
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      carts: {},
      notes: {},
      add: (scope, line) =>
        set((s) => {
          const key = lineKey(line.menu_item_id, line.option_ids, line.notes);
          const lines = [...(s.carts[scope] ?? [])];
          const idx = lines.findIndex((l) => l.key === key);
          if (idx >= 0) lines[idx] = { ...lines[idx], quantity: Math.min(50, lines[idx].quantity + line.quantity) };
          else lines.push({ ...line, key });
          return { carts: { ...s.carts, [scope]: lines } };
        }),
      setQty: (scope, key, qty) =>
        set((s) => {
          const lines = (s.carts[scope] ?? [])
            .map((l) => (l.key === key ? { ...l, quantity: Math.min(50, qty) } : l))
            .filter((l) => l.quantity > 0);
          return { carts: { ...s.carts, [scope]: lines } };
        }),
      clear: (scope) =>
        set((s) => ({ carts: { ...s.carts, [scope]: [] }, notes: { ...s.notes, [scope]: "" } })),
      setNotes: (scope, notes) => set((s) => ({ notes: { ...s.notes, [scope]: notes } })),
    }),
    { name: "dineos-cart", storage: createJSONStorage(() => localStorage) },
  ),
);

const EMPTY: CartLine[] = [];

export function useCartLines(scope: string): CartLine[] {
  return useCart((s) => s.carts[scope] ?? EMPTY);
}

export function cartTotals(lines: CartLine[]) {
  return {
    count: lines.reduce((a, l) => a + l.quantity, 0),
    subtotal: lines.reduce((a, l) => a + l.quantity * l.unit_price, 0),
  };
}

export function qtyForItem(lines: CartLine[], menuItemId: string): number {
  return lines.filter((l) => l.menu_item_id === menuItemId).reduce((a, l) => a + l.quantity, 0);
}

export function toCartPayload(lines: CartLine[]) {
  return lines.map((l) => ({
    menu_item_id: l.menu_item_id,
    quantity: l.quantity,
    option_ids: l.option_ids,
    notes: l.notes || undefined,
  }));
}
