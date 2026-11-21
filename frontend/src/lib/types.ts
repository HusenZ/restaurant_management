// Mirrors backend Pydantic schemas (backend/app/schemas). Money is always integer paise.

export type Diet = "veg" | "non_veg" | "egg" | "vegan";
export type Role = "owner" | "manager" | "cashier" | "waiter" | "kitchen";
export type OrderType = "dine_in" | "takeaway" | "delivery";
export type OrderStatus =
  | "pending_payment"
  | "scheduled"
  | "placed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "served"
  | "completed"
  | "cancelled";

export interface TaxRule {
  name: string;
  rate: number;
}

export interface RestaurantSettings {
  dine_in_enabled: boolean;
  takeaway_enabled: boolean;
  delivery_enabled: boolean;
  reservations_enabled: boolean;
  preorder_enabled: boolean;
  online_payment_enabled: boolean;
  pay_at_counter_enabled: boolean;
  auto_accept_orders: boolean;
  avg_prep_minutes: number;
  taxes: TaxRule[];
  prices_include_tax: boolean;
  service_charge_percent: number;
  round_off: boolean;
  delivery_fee: number;
  min_delivery_order: number;
  delivery_radius_km: number;
  opening_time: string;
  closing_time: string;
  closed_weekdays: number[];
  reservation_slot_minutes: number;
  reservation_duration_minutes: number;
  max_party_size: number;
  preorder_fire_minutes_before: number;
  auto_confirm_reservations: boolean;
  counter_directions: string;
  invoice_prefix: string;
  invoice_footer: string;
  theme_color: string;
}

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  cuisines: string[];
  logo_url: string | null;
  cover_url: string | null;
  phone: string | null;
  email: string | null;
  whatsapp_number: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  currency: string;
  timezone: string;
  gstin: string | null;
  fssai_number: string | null;
  plan: string;
  plan_status: string;
  trial_ends_at: string | null;
  created_at: string;
  settings: RestaurantSettings;
}

export interface PublicRestaurant {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  cuisines: string[];
  logo_url: string | null;
  cover_url: string | null;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  currency: string;
  timezone: string;
  is_open_now: boolean;
  settings: Pick<
    RestaurantSettings,
    | "dine_in_enabled"
    | "takeaway_enabled"
    | "delivery_enabled"
    | "reservations_enabled"
    | "preorder_enabled"
    | "online_payment_enabled"
    | "pay_at_counter_enabled"
    | "avg_prep_minutes"
    | "prices_include_tax"
    | "service_charge_percent"
    | "taxes"
    | "delivery_fee"
    | "min_delivery_order"
    | "opening_time"
    | "closing_time"
    | "closed_weekdays"
    | "max_party_size"
    | "counter_directions"
    | "theme_color"
  >;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface ModifierOption {
  id: string;
  name: string;
  price_delta: number;
  is_available: boolean;
  is_default: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  diet: Diet;
  tags: string[];
  spice_level: number;
  prep_minutes: number;
  is_available: boolean;
  is_active: boolean;
  sort_order: number;
  modifier_groups: ModifierGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  items: MenuItem[];
}

export interface Menu {
  version: number;
  categories: MenuCategory[];
}

export interface OrderItem {
  id: string;
  menu_item_id: string | null;
  name: string;
  diet: Diet;
  unit_price: number;
  quantity: number;
  modifiers: { group: string; name: string; price_delta: number }[];
  notes: string | null;
  line_total: number;
  is_done: boolean;
}

export interface Order {
  id: string;
  number: number;
  order_type: OrderType;
  status: OrderStatus;
  source: string;
  session_id: string | null;
  reservation_id: string | null;
  table_id: string | null;
  table_label: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  delivery_address: { line1: string; landmark?: string; city?: string; pincode?: string } | null;
  scheduled_for: string | null;
  subtotal: number;
  item_count: number;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  fired_at: string | null;
  items: OrderItem[];
}

export interface Payment {
  id: string;
  method: string;
  provider: string;
  status: string;
  amount: number;
  tendered: number | null;
  change_due: number | null;
  provider_payment_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface BillLine {
  name: string;
  diet: Diet;
  quantity: number;
  unit_price: number;
  line_total: number;
  modifiers: string[];
}

export interface Bill {
  id: string;
  session_id: string | null;
  order_id: string | null;
  order_type: OrderType;
  table_label: string | null;
  invoice_number: string | null;
  status: "open" | "paid" | "void";
  subtotal: number;
  discount: number;
  discount_reason: string | null;
  service_charge: number;
  taxes: { name: string; rate: number; amount: number }[];
  tax_total: number;
  delivery_fee: number;
  round_off: number;
  total: number;
  amount_paid: number;
  customer_name: string | null;
  customer_phone: string | null;
  pay_preference: "online" | "counter" | null;
  counter_requested_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  created_at: string;
  payments: Payment[];
  lines?: BillLine[];
  invoice_url?: string | null;
  has_feedback?: boolean;
}

export interface Checkout {
  mode: "online" | "counter";
  bill: Bill;
  payment_id: string | null;
  provider: string | null;
  provider_order_id: string | null;
  key_id: string | null;
  amount: number | null;
  currency: string | null;
  restaurant_name: string | null;
}

export interface Table {
  id: string;
  label: string;
  area: string;
  capacity: number;
  qr_token: string;
  is_active: boolean;
  sort_order: number;
}

export interface DiningSession {
  id: string;
  table_id: string;
  reservation_id: string | null;
  status: "open" | "bill_requested" | "closed";
  guest_name: string | null;
  guest_count: number;
  customer_phone: string | null;
  opened_by: string;
  opened_at: string;
  closed_at: string | null;
}

export interface ServiceRequest {
  id: string;
  table_id: string;
  session_id: string | null;
  kind: "waiter" | "water" | "cutlery" | "cleaning" | "bill" | "payment_help";
  note: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  table_label: string | null;
}

export interface SessionDetail {
  session: DiningSession;
  table: Table;
  orders: Order[];
  bill: Bill | null;
  running_total: number;
  requests: ServiceRequest[];
}

export type TableState = "free" | "occupied" | "bill_requested" | "awaiting_counter" | "attention";

export interface LiveTable {
  table: Table;
  state: TableState;
  session: DiningSession | null;
  orders_count: number;
  active_orders: number;
  running_total: number;
  open_requests: ServiceRequest[];
  bill_id: string | null;
  upcoming_reservation: { id: string; name: string; party_size: number; reserved_for: string } | null;
}

export interface Reservation {
  id: string;
  code: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  party_size: number;
  reserved_for: string;
  duration_minutes: number;
  status: "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show";
  occasion: string | null;
  notes: string | null;
  table_id: string | null;
  session_id: string | null;
  preorder_order_id: string | null;
  guest_on_way_at: string | null;
  source: string;
  created_at: string;
}

export interface ReservationDetail {
  reservation: Reservation;
  preorder: Order | null;
  table_label: string | null;
  restaurant_name: string;
  restaurant_slug: string;
  restaurant_address: string | null;
  token?: string;
}

export interface Slot {
  time: string;
  label: string;
  available: boolean;
}

export interface OnboardingStep {
  key: string;
  title: string;
  done: boolean;
  href: string;
}

export interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  tagline: string;
  highlight: boolean;
  features: string[];
  limits: Record<string, number | null>;
}

export interface AnalyticsSummary {
  range: { days: number; from: string; to: string };
  kpis: {
    revenue: number;
    revenue_change: number | null;
    orders: number;
    orders_change: number | null;
    aov: number;
    aov_change: number | null;
    bills: number;
    avg_prep_minutes: number | null;
    rating: number | null;
    ratings_count: number;
  };
  live: { occupied_tables: number; kitchen_orders: number; counter_queue: number; open_requests: number };
  daily: { date: string; label: string; revenue: number; orders: number }[];
  hourly: { hour: number; label: string; orders: number }[];
  top_items: { name: string; quantity: number; revenue: number }[];
  by_type: { type: OrderType; orders: number; revenue: number }[];
  payment_methods: { method: string; amount: number }[];
}

export interface Feedback {
  id: string;
  bill_id: string;
  rating: number;
  comment: string | null;
  customer_name: string | null;
  created_at: string;
}

export interface RealtimeEvent {
  type: string;
  data: Record<string, unknown>;
  ts?: string;
}
