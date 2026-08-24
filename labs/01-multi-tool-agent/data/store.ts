/**
 * Synthetic support backend. No network, no database — the point of the lab is
 * the agent's decision-making, not the data layer.
 *
 * The data is shaped to force specific decisions:
 *  - Two customers share the surname "Okafor", so an identity lookup by name
 *    alone returns multiple matches (Task 5.2: ask for another identifier,
 *    don't pick heuristically).
 *  - ORD-5150 fails transiently on its first lookup (Task 2.2: retry).
 *  - ORD-4417 is a $780 order, above the $500 refund ceiling (Task 1.5:
 *    interception and redirect to escalation).
 *  - ORD-3902 is outside the return window, a *business* error rather than a
 *    transient one (Task 2.2: explain, don't retry).
 */

export interface Customer {
  customerId: string;
  name: string;
  email: string;
  tier: "standard" | "priority";
}

export interface Order {
  orderId: string;
  customerId: string;
  item: string;
  totalUsd: number;
  placedAt: string;
  status: "delivered" | "in_transit" | "cancelled";
  deliveredAt: string | null;
  returnWindowDays: number;
  /** Deliberately verbose — 12 more fields the agent almost never needs. */
  metadata: Record<string, string | number | boolean>;
}

export const REFUND_CEILING_USD = 500;

const CUSTOMERS: Customer[] = [
  { customerId: "CUS-1001", name: "Ada Okafor", email: "ada@example.com", tier: "priority" },
  { customerId: "CUS-1002", name: "Ben Okafor", email: "ben@example.com", tier: "standard" },
  { customerId: "CUS-1003", name: "Chidi Mensah", email: "chidi@example.com", tier: "standard" },
];

function verboseMetadata(extra: Record<string, string | number | boolean> = {}) {
  return {
    warehouse: "EU-WEST-2",
    carrier: "Trellis Logistics",
    trackingNumber: "TRL-88213-XQ",
    packagingType: "recycled-box-m",
    weightGrams: 840,
    giftWrapped: false,
    insured: true,
    channel: "web",
    promoCode: "",
    taxRegion: "IE",
    fulfilmentAttempts: 1,
    lastScanUnix: 1_772_486_400,
    ...extra,
  };
}

const ORDERS: Order[] = [
  {
    orderId: "ORD-4417",
    customerId: "CUS-1001",
    item: "Aurora 27-inch monitor",
    totalUsd: 780,
    placedAt: "2026-07-02",
    status: "delivered",
    deliveredAt: "2026-07-06",
    returnWindowDays: 30,
    metadata: verboseMetadata({ weightGrams: 6200, insured: true }),
  },
  {
    orderId: "ORD-5150",
    customerId: "CUS-1001",
    item: "Meridian mechanical keyboard",
    totalUsd: 149,
    placedAt: "2026-07-28",
    status: "delivered",
    deliveredAt: "2026-07-31",
    returnWindowDays: 30,
    metadata: verboseMetadata(),
  },
  {
    orderId: "ORD-3902",
    customerId: "CUS-1002",
    item: "Halcyon desk lamp",
    totalUsd: 89,
    placedAt: "2026-02-11",
    status: "delivered",
    deliveredAt: "2026-02-15",
    returnWindowDays: 30,
    metadata: verboseMetadata(),
  },
  {
    orderId: "ORD-6001",
    customerId: "CUS-1003",
    item: "Ridgeline backpack",
    totalUsd: 120,
    placedAt: "2026-08-14",
    status: "in_transit",
    deliveredAt: null,
    returnWindowDays: 30,
    metadata: verboseMetadata({ fulfilmentAttempts: 2 }),
  },
];

/** "Today" for the lab, so return-window arithmetic is deterministic. */
export const TODAY = new Date("2026-08-20T00:00:00Z");

export function findCustomers(identifier: string): Customer[] {
  const needle = identifier.trim().toLowerCase();
  if (!needle) return [];
  return CUSTOMERS.filter(
    (c) =>
      c.customerId.toLowerCase() === needle ||
      c.email.toLowerCase() === needle ||
      c.name.toLowerCase().includes(needle),
  );
}

export function findOrder(orderId: string): Order | undefined {
  return ORDERS.find((o) => o.orderId.toLowerCase() === orderId.trim().toLowerCase());
}

/**
 * Fields worth showing the agent, out of the 20 an order carries.
 *
 * Task 5.1: tool results accumulate in context in proportion to their size, not
 * their relevance. A 40-field order lookup where five fields matter is the
 * canonical example. Trim at the source when you own the tool; use a
 * `PostToolUse` hook when you don't (see lab 4).
 */
export function returnRelevantView(order: Order) {
  return {
    orderId: order.orderId,
    customerId: order.customerId,
    item: order.item,
    totalUsd: order.totalUsd,
    status: order.status,
    deliveredAt: order.deliveredAt,
    daysSinceDelivery: daysSinceDelivery(order),
    withinReturnWindow: isWithinReturnWindow(order),
  };
}

export function daysSinceDelivery(order: Order, now: Date = TODAY): number | null {
  if (!order.deliveredAt) return null;
  const delivered = new Date(`${order.deliveredAt}T00:00:00Z`);
  return Math.floor((now.getTime() - delivered.getTime()) / 86_400_000);
}

export function isWithinReturnWindow(order: Order, now: Date = TODAY): boolean {
  const days = daysSinceDelivery(order, now);
  if (days === null) return false;
  return days <= order.returnWindowDays;
}

/**
 * Transient-failure simulation.
 *
 * ORD-5150 fails the first time it is looked up in a given process and
 * succeeds afterwards, so a run can demonstrate that the agent reads
 * `isRetryable: true` and retries instead of giving up or escalating.
 */
const transientFailuresServed = new Set<string>();

export function shouldFailTransiently(orderId: string): boolean {
  if (orderId.toUpperCase() !== "ORD-5150") return false;
  if (transientFailuresServed.has(orderId)) return false;
  transientFailuresServed.add(orderId);
  return true;
}

export function resetTransientFailures(): void {
  transientFailuresServed.clear();
}
