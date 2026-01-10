
import type { Group } from './types.ts';

// Configuration
export const FRESHDESK_DOMAIN = 'ecomplete.freshdesk.com';

// --- DIRECT ACCESS BYPASS (PAUSES SERVER PROXY) ---
// Set USE_PROXY to false to call Freshdesk directly from the browser
// ENABLED FOR CLOUD/LOCAL PROXY COMPATIBILITY
export const USE_PROXY = true; 
// Put your Freshdesk API Key here when USE_PROXY is false
export const DIRECT_API_KEY = 'ZpmwR0SRdLvfXDiIqaf2'; 

// Authentication Configuration for Proxy Mode (managed server-side)
export const API_KEY = '';
export const FALLBACK_API_KEY = ''; 

// The backend (server.js) serves the app and handles /api calls relative to itself.
export const DEFAULT_PROXY_URL = ''; 

// Group IDs for consolidation
export const BOUNTY_APPAREL_GROUP_IDS = [
  24000009010, // Diesel
  24000009052, // Hurley
  24000009038, // Jeep
  24000009035, // Reebok
  24000009051  // Superdry
];

export const CONSOLIDATED_GROUP_ID = 999999999;

export const ECOMPLETE_GROUPS: Group[] = [
  { id: 24000008969, name: "Levi's South Africa Online", description: "" },
  { id: 24000005392, name: "Pick n Pay Clothing Online", description: "" },
  { id: CONSOLIDATED_GROUP_ID, name: "Bounty Apparel_Consolidated", description: "" },
  { id: 24000009010, name: "Diesel Online South Africa", description: "" },
  { id: 24000009052, name: "Hurley Online South Africa", description: "" },
  { id: 24000009038, name: "Jeep Apparel Online South Africa", description: "" },
  { id: 24000009035, name: "Reebok Online South Africa", description: "" },
  { id: 24000009051, name: "Superdry Online South Africa", description: "" }
];

export const TICKET_STATUS_MAP: { [key: number]: string } = {
  2: "Open",
  3: "Pending",
  4: "Resolved",
  5: "Closed",
  6: "Waiting on Customer",
  7: "Waiting on Third Party",
  8: "Pending_2",
  9: "Reopened",
  12: "Waiting on Collection",
  13: "Waiting on Delivery",
  14: "Waiting on Feedback",
  15: "Waiting on Refund",
  17: "Waiting on Warehouse",
  18: "Custom Status 18", 
};

// Status IDs considered "Active" (not closed or resolved)
export const ACTIVE_TICKET_STATUSES = [2, 3, 6, 7, 8, 9, 12, 13, 14, 15, 17, 18];

export const CATEGORIES = [
  "Shipments", "Returns", "Refunds", "Exchanges", "Incorrect items",
  "Damages/defects", "Discount/Voucher", "Stock/product", "Spam", "Other"
] as const;

export const WITTY_ONE_LINERS = [
  "I'm not arguing, I'm just explaining why I'm right.",
  "I put the 'pro' in procrastinate.",
  "Loading... please hold your breath.",
  "Why do Java developers wear glasses? Because they don't C#.",
  "I told my computer I needed a break, and now it won't stop sending me Kit-Kats.",
  "Artificial Intelligence is no match for natural stupidity.",
  "I plan to live forever. So far, so good."
];

export const CATEGORY_COLORS: {[key: string]: string} = {
  'Shipments': '#3B82F6', // blue-500
  'Returns': '#10B981', // green-500
  'Refunds': '#EF4444', // red-500
  'Exchanges': '#EAB308', // yellow-500
  'Incorrect items': '#F97316', // orange-500
  'Damages/defects': '#EC4899', // pink-500
  'Discount/Voucher': '#6366F1', // indigo-500
  'Stock/product': '#A855F7', // purple-500
  'Spam': '#6B7280', // gray-500
  'Other': '#14B8A6' // teal-500
};
