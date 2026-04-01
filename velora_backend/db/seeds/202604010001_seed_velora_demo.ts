import type { Knex } from "knex";
import { randomUUID } from "node:crypto";

type SeedProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string;
  category_id: string;
  price: string;
  original_price: string | null;
  stock_quantity: number;
  availability_status: string;
  warranty_duration: string;
  return_window_days: number;
  is_promotion_eligible: boolean;
  specifications: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type OrderDefinition = {
  order_number: string;
  customer: string;
  status: string;
  delivery_status: string;
  tracking_number: string | null;
  estimated_delivery_date: string | null;
  actual_delivery_date: string | null;
  created_at: string;
  items: Array<[string, number]>;
};

type LoyaltySeedRow = [string, string | null, string, number, string, string];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function money(value: number) {
  return Number(value).toFixed(2);
}

function splitParagraphs(content: string) {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/**
 * Test credentials seeded below:
 * 1. maya.percy / velora-demo-001
 * 2. jason.hanley / velora-demo-002
 * 3. alina.fernand / velora-demo-003
 * 4. dev.ramchurn / velora-demo-004
 * 5. nora.bisset / velora-demo-005
 */
export async function seed(knex: Knex): Promise<void> {
  await knex("policy_chunks").del();
  await knex("policy_documents").del();
  await knex("loyalty_transactions").del();
  await knex("support_tickets").del();
  await knex("returns").del();
  await knex("order_items").del();
  await knex("orders").del();
  await knex("credentials").del();
  await knex("products").del();
  await knex("product_categories").del();
  await knex("customers").del();

  const categories = [
    { id: randomUUID(), name: "Audio", description: "Headphones, speakers, earbuds, and home audio." },
    { id: randomUUID(), name: "Computing", description: "Laptops, desktops, and performance accessories." },
    { id: randomUUID(), name: "Mobile & Tablets", description: "Smartphones, tablets, and mobile essentials." },
    { id: randomUUID(), name: "Smart Home", description: "Connected devices for comfort, security, and automation." },
    { id: randomUUID(), name: "Wearables", description: "Smartwatches, fitness trackers, and wellness tech." },
    { id: randomUUID(), name: "Lifestyle & Accessories", description: "Daily-carry gear, travel tech, and premium add-ons." },
  ].map((category) => ({
    ...category,
    slug: slugify(category.name),
    created_at: "2026-04-01T08:00:00.000Z",
  }));

  await knex("product_categories").insert(categories);
  const categoryByName = Object.fromEntries(categories.map((category) => [category.name, category.id]));

  const products: SeedProductRow[] = [
    {
      sku: "AUD-HMX-100",
      name: "Premium Wireless Headphones Model X",
      category: "Audio",
      description: "Velora's flagship over-ear headphones with immersive sound, adaptive ANC, multipoint pairing, and premium comfort for travel or work.",
      price: 299.0,
      original_price: 349.0,
      stock_quantity: 84,
      availability_status: "in_stock",
      warranty_duration: "2 Years",
      return_window_days: 30,
      is_promotion_eligible: true,
      specifications: {
        "Battery Life": "40 Hours",
        Bluetooth: "5.2 (LE Audio)",
        Weight: "254g",
      },
    },
    {
      sku: "AUD-SPH-210",
      name: "Aura Smart Speaker Mini",
      category: "Audio",
      description: "Compact room-filling smart speaker with voice assistant integration, stereo pairing, and crisp podcast vocals.",
      price: 89.0,
      original_price: 109.0,
      stock_quantity: 142,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: true,
      specifications: {
        Drivers: "2 x 10W",
        Connectivity: "Wi-Fi / Bluetooth 5.1",
        Finish: "Soft-touch matte",
      },
    },
    {
      sku: "AUD-BUD-330",
      name: "Pulse ANC Earbuds",
      category: "Audio",
      description: "Pocket-sized true wireless earbuds with transparency mode, wireless charging, and balanced everyday tuning.",
      price: 149.0,
      original_price: null,
      stock_quantity: 51,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: false,
      specifications: {
        "Battery Life": "8 Hours + 24 Hours Case",
        WaterResistance: "IPX4",
        "Noise Control": "Hybrid ANC",
      },
    },
    {
      sku: "CMP-LAP-410",
      name: "NovaBook 14 Air",
      category: "Computing",
      description: "Slim productivity laptop with bright 14-inch display, fast SSD storage, and all-day battery for students and professionals.",
      price: 999.0,
      original_price: 1099.0,
      stock_quantity: 27,
      availability_status: "low_stock",
      warranty_duration: "2 Years",
      return_window_days: 14,
      is_promotion_eligible: true,
      specifications: {
        Processor: "Intel Core Ultra 5",
        Memory: "16GB",
        Storage: "512GB SSD",
      },
    },
    {
      sku: "CMP-MON-255",
      name: "ViewEdge 27 QHD Monitor",
      category: "Computing",
      description: "27-inch QHD monitor with USB-C connectivity, ergonomic stand, and color-accurate panel for hybrid work setups.",
      price: 329.0,
      original_price: null,
      stock_quantity: 64,
      availability_status: "in_stock",
      warranty_duration: "2 Years",
      return_window_days: 14,
      is_promotion_eligible: false,
      specifications: {
        Resolution: "2560 x 1440",
        RefreshRate: "75Hz",
        Ports: "USB-C / HDMI / DisplayPort",
      },
    },
    {
      sku: "CMP-KEY-710",
      name: "TypeFlow Mechanical Keyboard",
      category: "Computing",
      description: "Hot-swappable wireless mechanical keyboard with low-noise tactile switches and tri-mode connectivity.",
      price: 129.0,
      original_price: 149.0,
      stock_quantity: 93,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: true,
      specifications: {
        Layout: "75%",
        Switches: "Quiet tactile",
        Connectivity: "USB-C / Bluetooth / 2.4GHz",
      },
    },
    {
      sku: "MOB-PHN-520",
      name: "Velora One Smartphone",
      category: "Mobile & Tablets",
      description: "Premium 5G smartphone with vivid OLED display, fast charging, and pro-grade imaging for everyday creators.",
      price: 799.0,
      original_price: 849.0,
      stock_quantity: 38,
      availability_status: "in_stock",
      warranty_duration: "2 Years",
      return_window_days: 14,
      is_promotion_eligible: true,
      specifications: {
        Display: "6.4-inch OLED",
        Storage: "256GB",
        Camera: "50MP main sensor",
      },
    },
    {
      sku: "MOB-TAB-610",
      name: "SlateTab 11 Plus",
      category: "Mobile & Tablets",
      description: "Portable 11-inch tablet with bundled folio cover support and smooth performance for streaming, sketching, and notes.",
      price: 549.0,
      original_price: null,
      stock_quantity: 44,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 14,
      is_promotion_eligible: false,
      specifications: {
        Display: "11-inch IPS",
        Battery: "10,000mAh",
        Compatibility: "Active stylus ready",
      },
    },
    {
      sku: "MOB-POW-115",
      name: "SnapCharge 20K Power Bank",
      category: "Mobile & Tablets",
      description: "High-capacity power bank with USB-C PD fast charging and dual-device output for travel days.",
      price: 69.0,
      original_price: null,
      stock_quantity: 118,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: false,
      specifications: {
        Capacity: "20,000mAh",
        Output: "45W USB-C PD",
        Weight: "392g",
      },
    },
    {
      sku: "SMH-CAM-140",
      name: "HomeGuard Indoor Cam Pro",
      category: "Smart Home",
      description: "Indoor security camera with 2K video, privacy shutter, intelligent motion zones, and two-way audio.",
      price: 119.0,
      original_price: 139.0,
      stock_quantity: 73,
      availability_status: "in_stock",
      warranty_duration: "2 Years",
      return_window_days: 30,
      is_promotion_eligible: true,
      specifications: {
        Video: "2K HDR",
        Audio: "Two-way talk",
        Storage: "Cloud or local microSD",
      },
    },
    {
      sku: "SMH-LGT-220",
      name: "GlowSync Starter Kit",
      category: "Smart Home",
      description: "Smart lighting starter bundle with color scenes, schedules, and voice control for up to three rooms.",
      price: 159.0,
      original_price: null,
      stock_quantity: 46,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: false,
      specifications: {
        Bulbs: "4 multicolor bulbs",
        Hub: "Included",
        Compatibility: "Matter / HomeKit / Alexa",
      },
    },
    {
      sku: "SMH-THM-305",
      name: "ClimateSense Thermostat",
      category: "Smart Home",
      description: "Adaptive thermostat with energy reports, room comfort profiles, and seamless mobile scheduling.",
      price: 219.0,
      original_price: 249.0,
      stock_quantity: 19,
      availability_status: "low_stock",
      warranty_duration: "2 Years",
      return_window_days: 30,
      is_promotion_eligible: true,
      specifications: {
        Sensors: "Humidity + occupancy",
        Control: "App / voice / dial",
        Finish: "Brushed silver",
      },
    },
    {
      sku: "WRB-WTC-410",
      name: "MoveTrack Watch S",
      category: "Wearables",
      description: "Fitness-focused smartwatch with bright AMOLED screen, GPS, sleep tracking, and multi-day battery life.",
      price: 249.0,
      original_price: null,
      stock_quantity: 57,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: false,
      specifications: {
        Display: "1.9-inch AMOLED",
        Battery: "7 Days",
        Sensors: "Heart rate / SpO2 / GPS",
      },
    },
    {
      sku: "WRB-RNG-150",
      name: "VitalRing Lite",
      category: "Wearables",
      description: "Minimal wellness ring that tracks recovery, sleep consistency, and daily readiness with subtle styling.",
      price: 199.0,
      original_price: 229.0,
      stock_quantity: 34,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: true,
      specifications: {
        Material: "Titanium",
        Battery: "5 Days",
        Metrics: "Sleep / recovery / activity",
      },
    },
    {
      sku: "WRB-BND-205",
      name: "ActiveLoop Fitness Band",
      category: "Wearables",
      description: "Lightweight everyday tracker with guided workouts, hydration reminders, and wrist-based heart rate.",
      price: 79.0,
      original_price: null,
      stock_quantity: 0,
      availability_status: "out_of_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: false,
      specifications: {
        Battery: "10 Days",
        WaterResistance: "5ATM",
        Display: "Color OLED strip",
      },
    },
    {
      sku: "LIF-SNK-901",
      name: "Velocity Pro Sneakers",
      category: "Lifestyle & Accessories",
      description: "Performance-inspired lifestyle sneakers with breathable knit upper, cushioned sole, and versatile streetwear styling.",
      price: 129.0,
      original_price: null,
      stock_quantity: 62,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: false,
      specifications: {
        Material: "Breathable knit",
        Sole: "Cushioned EVA",
        Sizes: "EU 39-46",
      },
    },
    {
      sku: "LIF-BAG-305",
      name: "MetroPack Commuter Backpack",
      category: "Lifestyle & Accessories",
      description: "Weather-resistant commuter backpack with structured laptop sleeve, quick-access pockets, and luggage strap.",
      price: 99.0,
      original_price: 119.0,
      stock_quantity: 81,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: true,
      specifications: {
        Capacity: "22L",
        LaptopFit: "Up to 15-inch",
        Material: "Water-resistant recycled fabric",
      },
    },
    {
      sku: "LIF-MUG-110",
      name: "Nomad Thermal Bottle",
      category: "Lifestyle & Accessories",
      description: "Double-wall thermal bottle designed for office commutes, road trips, and desk hydration with a premium matte finish.",
      price: 39.0,
      original_price: null,
      stock_quantity: 150,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: false,
      specifications: {
        Capacity: "750ml",
        Material: "Stainless steel",
        Retention: "12h hot / 24h cold",
      },
    },
    {
      sku: "LIF-DSK-420",
      name: "FlexStand Desk Lamp",
      category: "Lifestyle & Accessories",
      description: "Adjustable LED desk lamp with USB charging base, warm-to-cool temperature control, and glare-free diffuser.",
      price: 59.0,
      original_price: null,
      stock_quantity: 67,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: false,
      specifications: {
        Brightness: "5 levels",
        Charging: "10W USB-C",
        Finish: "Arctic white",
      },
    },
    {
      sku: "CMP-MSE-530",
      name: "Precision Wireless Mouse",
      category: "Computing",
      description: "Ergonomic wireless mouse with quiet clicks, programmable side buttons, and smooth glass-tracking sensor.",
      price: 79.0,
      original_price: null,
      stock_quantity: 97,
      availability_status: "in_stock",
      warranty_duration: "1 Year",
      return_window_days: 30,
      is_promotion_eligible: false,
      specifications: {
        Sensor: "8,000 DPI",
        Battery: "70 Days",
        Connectivity: "Bluetooth / 2.4GHz",
      },
    },
  ].map((product) => ({
    id: randomUUID(),
    sku: product.sku,
    name: product.name,
    description: product.description,
    category_id: categoryByName[product.category],
    price: money(product.price),
    original_price: product.original_price === null ? null : money(product.original_price),
    stock_quantity: product.stock_quantity,
    availability_status: product.availability_status,
    warranty_duration: product.warranty_duration,
    return_window_days: product.return_window_days,
    is_promotion_eligible: product.is_promotion_eligible,
    specifications: product.specifications,
    created_at: "2026-04-01T08:10:00.000Z",
    updated_at: "2026-04-01T08:10:00.000Z",
  }));

  await knex("products").insert(products);
  const productBySku = Object.fromEntries(products.map((product) => [product.sku, product]));

  const customers = [
    ["CUST-0001", "Maya", "Percy", "maya.percy@velora.demo", "+230 5250 1101", "14 Palm Grove", "Curepipe", "Mauritius", 1480, "active"],
    ["CUST-0002", "Jason", "Hanley", "jason.hanley@velora.demo", "+230 5250 1102", "8 Willow Avenue", "Vacoas", "Mauritius", 620, "active"],
    ["CUST-0003", "Alina", "Fernand", "alina.fernand@velora.demo", "+230 5250 1103", "22 Ocean View", "Flic en Flac", "Mauritius", 2450, "active"],
    ["CUST-0004", "Dev", "Ramchurn", "dev.ramchurn@velora.demo", "+230 5250 1104", "5 Montagne Lane", "Quatre Bornes", "Mauritius", 120, "active"],
    ["CUST-0005", "Nora", "Bisset", "nora.bisset@velora.demo", "+230 5250 1105", "61 Tamarin Heights", "Tamarin", "Mauritius", 3410, "active"],
    ["CUST-0006", "Ethan", "Rault", "ethan.rault@velora.demo", "+230 5250 1106", "4 Grand Bay Road", "Grand Baie", "Mauritius", 0, "active"],
    ["CUST-0007", "Sana", "Ismael", "sana.ismael@velora.demo", "+230 5250 1107", "19 Riverside Park", "Rose Hill", "Mauritius", 4500, "active"],
    ["CUST-0008", "Kieran", "Appadoo", "kieran.appadoo@velora.demo", "+230 5250 1108", "103 Coral Residences", "Ebene", "Mauritius", 880, "active"],
    ["CUST-0009", "Leah", "Goolam", "leah.goolam@velora.demo", "+230 5250 1109", "3 Lotus Close", "Phoenix", "Mauritius", 230, "active"],
    ["CUST-0010", "Owen", "Mungroo", "owen.mungroo@velora.demo", "+230 5250 1110", "47 Belle Rose Drive", "Belle Rose", "Mauritius", 1710, "active"],
    ["CUST-0011", "Priya", "Marday", "priya.marday@velora.demo", "+230 5250 1111", "17 Coastal View", "Mahébourg", "Mauritius", 96, "active"],
    ["CUST-0012", "Noah", "Essoo", "noah.essoo@velora.demo", "+230 5250 1112", "12 Midtown Square", "Port Louis", "Mauritius", 1320, "active"],
    ["CUST-0013", "Kiara", "Bhugaloo", "kiara.bhugaloo@velora.demo", "+230 5250 1113", "9 Jardin Lane", "Moka", "Mauritius", 540, "active"],
    ["CUST-0014", "Ruben", "Bholah", "ruben.bholah@velora.demo", "+230 5250 1114", "2 Indigo Court", "Beau Bassin", "Mauritius", 0, "suspended"],
    ["CUST-0015", "Talia", "Fokeerbux", "talia.fokeerbux@velora.demo", "+230 5250 1115", "88 Horizon Park", "Floreal", "Mauritius", 310, "closed"],
  ].map(([customer_number, first_name, last_name, email, phone, address, city, country, loyalty_points, account_status]) => ({
    id: randomUUID(),
    customer_number,
    first_name,
    last_name,
    email,
    phone,
    address,
    city,
    country,
    loyalty_points,
    account_status,
    created_at: "2026-04-01T08:20:00.000Z",
    updated_at: "2026-04-01T08:20:00.000Z",
  }));

  await knex("customers").insert(customers);
  const customerByNumber = Object.fromEntries(customers.map((customer) => [customer.customer_number, customer]));

  const credentials = [
    ["maya.percy", "CUST-0001", "$2y$10$HE6AVhMW4kMyp1d8Jnpz4eeIuNJmky.KZbvNoNGdzEbcR7vJBzXim"],
    ["jason.hanley", "CUST-0002", "$2y$10$2KvF7jChBJ5tA8rR1sUjAevHI7Lo90aFSQkgnXIscbKo9o/oEHf12"],
    ["alina.fernand", "CUST-0003", "$2y$10$C..M7mSBee5EA5vrYLLiAOt.s/MHOiTf0F5iEbejkxDzilVibSeEO"],
    ["dev.ramchurn", "CUST-0004", "$2y$10$PjcV.R9NkQAivn5yKPYbReGtDuF3QPsy8vPgARoI6df2Vu5BbwN42"],
    ["nora.bisset", "CUST-0005", "$2y$10$xVgX35n0.kMQkrwHPijNOeP2YN9yCJU5AFGbSAglmE65ygm5b7bHK"],
  ].map(([username, customer_number, password_hash]) => ({
    id: randomUUID(),
    customer_id: customerByNumber[customer_number].id,
    username,
    password_hash,
    created_at: "2026-04-01T08:25:00.000Z",
  }));

  await knex("credentials").insert(credentials);

  const orderDefinitions: OrderDefinition[] = [
    { order_number: "ORD-10001", customer: "CUST-0001", status: "delivered", delivery_status: "delivered", tracking_number: "TRK10001", estimated_delivery_date: "2026-02-05", actual_delivery_date: "2026-02-04", created_at: "2026-01-31T10:15:00.000Z", items: [["AUD-HMX-100", 1], ["LIF-BAG-305", 1]] },
    { order_number: "ORD-10002", customer: "CUST-0002", status: "delivered", delivery_status: "delivered", tracking_number: "TRK10002", estimated_delivery_date: "2026-01-28", actual_delivery_date: "2026-01-27", created_at: "2026-01-23T09:10:00.000Z", items: [["CMP-KEY-710", 1]] },
    { order_number: "ORD-10003", customer: "CUST-0003", status: "delivered", delivery_status: "delivered", tracking_number: "TRK10003", estimated_delivery_date: "2025-12-12", actual_delivery_date: "2025-12-11", created_at: "2025-12-06T13:40:00.000Z", items: [["WRB-WTC-410", 1], ["MOB-POW-115", 1]] },
    { order_number: "ORD-10004", customer: "CUST-0004", status: "delivered", delivery_status: "delivered", tracking_number: "TRK10004", estimated_delivery_date: "2025-10-15", actual_delivery_date: "2025-10-14", created_at: "2025-10-09T16:30:00.000Z", items: [["SMH-CAM-140", 1]] },
    { order_number: "ORD-10005", customer: "CUST-0005", status: "delivered", delivery_status: "delivered", tracking_number: "TRK10005", estimated_delivery_date: "2025-08-19", actual_delivery_date: "2025-08-18", created_at: "2025-08-13T08:00:00.000Z", items: [["CMP-MON-255", 1], ["CMP-MSE-530", 1]] },
    { order_number: "ZX123456789", customer: "CUST-0006", status: "shipped", delivery_status: "in_transit", tracking_number: "ZX123456789", estimated_delivery_date: "2023-10-28", actual_delivery_date: null, created_at: "2023-10-24T10:26:00.000Z", items: [["CMP-KEY-710", 1], ["MOB-POW-115", 1]] },
    { order_number: "ORD-10007", customer: "CUST-0007", status: "shipped", delivery_status: "processing", tracking_number: "TRK10007", estimated_delivery_date: "2026-04-06", actual_delivery_date: null, created_at: "2026-04-01T09:15:00.000Z", items: [["MOB-PHN-520", 1]] },
    { order_number: "ORD-10008", customer: "CUST-0008", status: "shipped", delivery_status: "in_transit", tracking_number: "TRK10008", estimated_delivery_date: "2026-04-07", actual_delivery_date: null, created_at: "2026-04-01T09:40:00.000Z", items: [["SMH-THM-305", 1]] },
    { order_number: "ORD-10009", customer: "CUST-0009", status: "shipped", delivery_status: "out_for_delivery", tracking_number: "TRK10009", estimated_delivery_date: "2026-04-02", actual_delivery_date: null, created_at: "2026-03-29T12:20:00.000Z", items: [["AUD-BUD-330", 1], ["LIF-MUG-110", 1]] },
    { order_number: "RT-99283", customer: "CUST-0010", status: "delivered", delivery_status: "failed", tracking_number: "RT99283-FDX", estimated_delivery_date: "2023-10-12", actual_delivery_date: null, created_at: "2023-10-08T11:45:00.000Z", items: [["LIF-SNK-901", 1]] },
    { order_number: "ORD-10011", customer: "CUST-0011", status: "confirmed", delivery_status: "processing", tracking_number: null, estimated_delivery_date: "2026-04-09", actual_delivery_date: null, created_at: "2026-04-01T08:55:00.000Z", items: [["LIF-BAG-305", 1], ["LIF-DSK-420", 1]] },
    { order_number: "ORD-10012", customer: "CUST-0012", status: "pending", delivery_status: "processing", tracking_number: null, estimated_delivery_date: null, actual_delivery_date: null, created_at: "2026-04-01T07:45:00.000Z", items: [["WRB-RNG-150", 1]] },
    { order_number: "ORD-10013", customer: "CUST-0013", status: "confirmed", delivery_status: "processing", tracking_number: null, estimated_delivery_date: "2026-04-08", actual_delivery_date: null, created_at: "2026-03-31T17:10:00.000Z", items: [["SMH-LGT-220", 1]] },
    { order_number: "ORD-10014", customer: "CUST-0014", status: "cancelled", delivery_status: "failed", tracking_number: null, estimated_delivery_date: null, actual_delivery_date: null, created_at: "2026-03-19T13:00:00.000Z", items: [["CMP-LAP-410", 1]] },
    { order_number: "ORD-10015", customer: "CUST-0015", status: "cancelled", delivery_status: "failed", tracking_number: null, estimated_delivery_date: null, actual_delivery_date: null, created_at: "2026-02-22T09:25:00.000Z", items: [["WRB-BND-205", 1]] },
    { order_number: "ORD-10016", customer: "CUST-0001", status: "shipped", delivery_status: "in_transit", tracking_number: "TRK10016", estimated_delivery_date: "2026-04-05", actual_delivery_date: null, created_at: "2026-04-01T10:05:00.000Z", items: [["CMP-MSE-530", 1], ["CMP-KEY-710", 1]] },
    { order_number: "ORD-10017", customer: "CUST-0002", status: "pending", delivery_status: "processing", tracking_number: null, estimated_delivery_date: null, actual_delivery_date: null, created_at: "2026-04-01T06:50:00.000Z", items: [["SMH-CAM-140", 1]] },
    { order_number: "ORD-10018", customer: "CUST-0003", status: "delivered", delivery_status: "delivered", tracking_number: "TRK10018", estimated_delivery_date: "2026-03-04", actual_delivery_date: "2026-03-03", created_at: "2026-02-27T14:15:00.000Z", items: [["MOB-TAB-610", 1]] },
    { order_number: "ORD-10019", customer: "CUST-0004", status: "shipped", delivery_status: "processing", tracking_number: "TRK10019", estimated_delivery_date: "2026-04-10", actual_delivery_date: null, created_at: "2026-04-01T10:30:00.000Z", items: [["AUD-SPH-210", 1], ["LIF-MUG-110", 2]] },
    { order_number: "ORD-10020", customer: "CUST-0005", status: "delivered", delivery_status: "delivered", tracking_number: "TRK10020", estimated_delivery_date: "2026-01-18", actual_delivery_date: "2026-01-17", created_at: "2026-01-12T12:55:00.000Z", items: [["LIF-SNK-901", 1], ["LIF-BAG-305", 1]] },
    { order_number: "ORD-10021", customer: "CUST-0006", status: "shipped", delivery_status: "in_transit", tracking_number: "TRK10021", estimated_delivery_date: "2026-04-06", actual_delivery_date: null, created_at: "2026-04-01T10:45:00.000Z", items: [["WRB-WTC-410", 1]] },
    { order_number: "ORD-10022", customer: "CUST-0007", status: "delivered", delivery_status: "delivered", tracking_number: "TRK10022", estimated_delivery_date: "2025-11-20", actual_delivery_date: "2025-11-19", created_at: "2025-11-14T09:35:00.000Z", items: [["SMH-THM-305", 1], ["SMH-LGT-220", 1]] },
    { order_number: "ORD-10023", customer: "CUST-0008", status: "confirmed", delivery_status: "processing", tracking_number: null, estimated_delivery_date: "2026-04-11", actual_delivery_date: null, created_at: "2026-04-01T11:05:00.000Z", items: [["MOB-PHN-520", 1], ["MOB-POW-115", 1]] },
    { order_number: "ORD-882910", customer: "CUST-0009", status: "delivered", delivery_status: "delivered", tracking_number: "TRK882910", estimated_delivery_date: "2023-09-13", actual_delivery_date: "2023-09-12", created_at: "2023-09-07T15:10:00.000Z", items: [["LIF-SNK-901", 1]] },
    { order_number: "ORD-10025", customer: "CUST-0010", status: "shipped", delivery_status: "out_for_delivery", tracking_number: "TRK10025", estimated_delivery_date: "2026-04-03", actual_delivery_date: null, created_at: "2026-03-30T09:15:00.000Z", items: [["AUD-HMX-100", 1]] },
  ];

  const orders: Array<Record<string, unknown>> = [];
  const orderItems: Array<Record<string, unknown>> = [];
  const orderByNumber: Record<string, Record<string, unknown>> = {};

  for (const definition of orderDefinitions) {
    const orderId = randomUUID();
    const customer = customerByNumber[definition.customer];
    const shippingAddress = `${customer.address}, ${customer.city}, ${customer.country}`;
    let total = 0;

    for (const [sku, quantity] of definition.items) {
      const product = productBySku[sku];
      const subtotal = Number(product.price) * quantity;
      total += subtotal;
      orderItems.push({
        id: randomUUID(),
        order_id: orderId,
        product_id: product.id,
        quantity,
        unit_price: money(Number(product.price)),
        subtotal: money(subtotal),
      });
    }

    const order = {
      id: orderId,
      order_number: definition.order_number,
      customer_id: customer.id,
      status: definition.status,
      delivery_status: definition.delivery_status,
      tracking_number: definition.tracking_number,
      total_amount: money(total),
      shipping_address: shippingAddress,
      estimated_delivery_date: definition.estimated_delivery_date,
      actual_delivery_date: definition.actual_delivery_date,
      created_at: definition.created_at,
      updated_at: definition.created_at,
    };

    orders.push(order);
    orderByNumber[definition.order_number] = order;
  }

  await knex("orders").insert(orders);
  await knex("order_items").insert(orderItems);

  const returns = [
    {
      id: randomUUID(),
      return_number: "RET-0001",
      order_id: orderByNumber["ORD-10001"].id,
      customer_id: customerByNumber["CUST-0001"].id,
      status: "approved",
      reason: "Headphones arrived with damaged outer packaging and customer preferred an exchange refund.",
      refund_amount: money(299),
      refund_status: "pending",
      requested_at: "2026-02-06T09:15:00.000Z",
      resolved_at: "2026-02-07T15:30:00.000Z",
    },
    {
      id: randomUUID(),
      return_number: "RET-0002",
      order_id: orderByNumber["ORD-10003"].id,
      customer_id: customerByNumber["CUST-0003"].id,
      status: "approved",
      reason: "Smartwatch strap fit issue reported within policy window.",
      refund_amount: money(249),
      refund_status: "processed",
      requested_at: "2025-12-13T11:20:00.000Z",
      resolved_at: "2025-12-15T10:00:00.000Z",
    },
    {
      id: randomUUID(),
      return_number: "RET-0003",
      order_id: orderByNumber["ORD-882910"].id,
      customer_id: customerByNumber["CUST-0009"].id,
      status: "rejected",
      reason: "Refund declined because the customer requested the return after the 30-day return window expired.",
      refund_amount: null,
      refund_status: "not_applicable",
      requested_at: "2023-10-20T14:10:00.000Z",
      resolved_at: "2023-10-20T16:30:00.000Z",
    },
    {
      id: randomUUID(),
      return_number: "RET-0004",
      order_id: orderByNumber["ORD-10020"].id,
      customer_id: customerByNumber["CUST-0005"].id,
      status: "requested",
      reason: "Sneakers were too small and customer requested a refund.",
      refund_amount: money(129),
      refund_status: "pending",
      requested_at: "2026-01-20T08:45:00.000Z",
      resolved_at: null,
    },
    {
      id: randomUUID(),
      return_number: "RET-0005",
      order_id: orderByNumber["ORD-10005"].id,
      customer_id: customerByNumber["CUST-0005"].id,
      status: "completed",
      reason: "Monitor developed dead pixels and refund was completed after warehouse inspection.",
      refund_amount: money(329),
      refund_status: "processed",
      requested_at: "2025-08-21T09:00:00.000Z",
      resolved_at: "2025-08-26T13:20:00.000Z",
    },
  ];

  await knex("returns").insert(returns);

  const supportTickets = [
    {
      id: randomUUID(),
      ticket_number: "TKT-0001",
      customer_id: customerByNumber["CUST-0010"].id,
      order_id: orderByNumber["RT-99283"].id,
      subject: "Delayed delivery marked as delivered",
      description: "Customer states they were home at the time of delivery but no package was found. Checked with neighbors and side entrances. Requested a formal delivery dispute.",
      status: "escalated",
      priority: "urgent",
      assigned_to: "Shipping Escalation Desk",
      queue_position: 2,
      estimated_wait_minutes: 2,
      resolution_notes: null,
      created_at: "2023-10-12T10:10:00.000Z",
      updated_at: "2023-10-12T10:24:00.000Z",
    },
    {
      id: randomUUID(),
      ticket_number: "TKT-0002",
      customer_id: customerByNumber["CUST-0001"].id,
      order_id: orderByNumber["ORD-10001"].id,
      subject: "Refund follow-up",
      description: "Customer wants confirmation that refund for the returned headphones will be issued to the original payment method.",
      status: "in_progress",
      priority: "medium",
      assigned_to: "Arielle M.",
      queue_position: 5,
      estimated_wait_minutes: 18,
      resolution_notes: null,
      created_at: "2026-02-07T09:00:00.000Z",
      updated_at: "2026-02-07T09:15:00.000Z",
    },
    {
      id: randomUUID(),
      ticket_number: "TKT-0003",
      customer_id: customerByNumber["CUST-0003"].id,
      order_id: orderByNumber["ORD-10018"].id,
      subject: "Tablet accessory compatibility question",
      description: "Customer wants to confirm whether a third-party stylus is covered under the Velora warranty policy.",
      status: "open",
      priority: "low",
      assigned_to: null,
      queue_position: 14,
      estimated_wait_minutes: 42,
      resolution_notes: null,
      created_at: "2026-03-04T12:05:00.000Z",
      updated_at: "2026-03-04T12:05:00.000Z",
    },
    {
      id: randomUUID(),
      ticket_number: "TKT-0004",
      customer_id: customerByNumber["CUST-0005"].id,
      order_id: orderByNumber["ORD-10020"].id,
      subject: "Return pickup scheduling",
      description: "Customer requested help arranging courier pickup for a shoe return.",
      status: "resolved",
      priority: "medium",
      assigned_to: "Noah P.",
      queue_position: null,
      estimated_wait_minutes: null,
      resolution_notes: "Pickup arranged for next business day and return label emailed.",
      created_at: "2026-01-20T10:00:00.000Z",
      updated_at: "2026-01-20T16:50:00.000Z",
    },
    {
      id: randomUUID(),
      ticket_number: "TKT-0005",
      customer_id: customerByNumber["CUST-0007"].id,
      order_id: orderByNumber["ORD-10022"].id,
      subject: "Thermostat installation support",
      description: "Customer needs assistance pairing a new thermostat to the mobile app.",
      status: "closed",
      priority: "low",
      assigned_to: "Support Bot Follow-up",
      queue_position: null,
      estimated_wait_minutes: null,
      resolution_notes: "Issue resolved after customer reconnected to 2.4GHz Wi-Fi network.",
      created_at: "2025-11-20T09:30:00.000Z",
      updated_at: "2025-11-20T11:10:00.000Z",
    },
    {
      id: randomUUID(),
      ticket_number: "TKT-0006",
      customer_id: customerByNumber["CUST-0008"].id,
      order_id: orderByNumber["ORD-10023"].id,
      subject: "Address correction request",
      description: "Customer entered an apartment number incorrectly and needs the shipping address updated before dispatch.",
      status: "open",
      priority: "high",
      assigned_to: null,
      queue_position: 4,
      estimated_wait_minutes: 12,
      resolution_notes: null,
      created_at: "2026-04-01T11:12:00.000Z",
      updated_at: "2026-04-01T11:12:00.000Z",
    },
    {
      id: randomUUID(),
      ticket_number: "TKT-0007",
      customer_id: customerByNumber["CUST-0011"].id,
      order_id: orderByNumber["ORD-10011"].id,
      subject: "Promo code not applied",
      description: "Customer believes a seasonal promotion should have reduced the order total for the commuter backpack.",
      status: "in_progress",
      priority: "medium",
      assigned_to: "Finance Support Queue",
      queue_position: 7,
      estimated_wait_minutes: 24,
      resolution_notes: null,
      created_at: "2026-04-01T09:30:00.000Z",
      updated_at: "2026-04-01T09:44:00.000Z",
    },
    {
      id: randomUUID(),
      ticket_number: "TKT-0008",
      customer_id: customerByNumber["CUST-0014"].id,
      order_id: null,
      subject: "Account access review",
      description: "Suspended customer requested clarification on account restrictions and pending verification checks.",
      status: "resolved",
      priority: "high",
      assigned_to: "Trust & Safety",
      queue_position: null,
      estimated_wait_minutes: null,
      resolution_notes: "Customer instructed to submit identity verification documents before account review can continue.",
      created_at: "2026-03-27T15:10:00.000Z",
      updated_at: "2026-03-27T17:40:00.000Z",
    },
  ];

  await knex("support_tickets").insert(supportTickets);

  const loyaltyTransactions = ([
    ["CUST-0001", "ORD-10001", "earned", 299, "Points earned from Premium Wireless Headphones purchase", "2026-02-04T18:00:00.000Z"],
    ["CUST-0001", null, "redeemed", -150, "Applied loyalty points to accessories order", "2026-03-15T10:00:00.000Z"],
    ["CUST-0002", "ORD-10002", "earned", 129, "Points earned from keyboard purchase", "2026-01-27T18:00:00.000Z"],
    ["CUST-0003", "ORD-10018", "earned", 549, "Points earned from tablet purchase", "2026-03-03T18:15:00.000Z"],
    ["CUST-0005", "ORD-10020", "earned", 228, "Points earned from sneakers and backpack order", "2026-01-17T18:00:00.000Z"],
    ["CUST-0005", null, "adjusted", 250, "Goodwill loyalty adjustment after delayed refund communication", "2026-01-21T09:00:00.000Z"],
    ["CUST-0007", "ORD-10022", "earned", 378, "Points earned from smart home bundle", "2025-11-19T18:00:00.000Z"],
    ["CUST-0007", null, "redeemed", -500, "Redeemed points for Black Friday voucher", "2025-11-25T12:30:00.000Z"],
    ["CUST-0008", null, "expired", -120, "Annual loyalty balance expiry adjustment", "2026-01-01T00:00:00.000Z"],
    ["CUST-0010", "ORD-10025", "earned", 299, "Points earned from headphones order", "2026-03-30T19:00:00.000Z"],
    ["CUST-0011", null, "adjusted", 75, "Welcome bonus after first support-assisted order", "2026-04-01T10:00:00.000Z"],
    ["CUST-0012", null, "redeemed", -200, "Points redeemed toward wearable purchase", "2026-03-28T13:20:00.000Z"],
  ] as LoyaltySeedRow[]).map(([customerNumber, orderNumber, transaction_type, points, description, created_at]) => ({
    id: randomUUID(),
    customer_id: customerByNumber[customerNumber].id,
    order_id: orderNumber ? orderByNumber[orderNumber].id : null,
    transaction_type,
    points,
    description,
    created_at,
  }));

  await knex("loyalty_transactions").insert(loyaltyTransactions);

  const policyDocuments = [
    {
      policy_key: "returns_policy",
      title: "Returns & Refunds Policy",
      version: "2026.1",
      effective_date: "2026-01-01",
      content: `Velora wants every purchase to feel straightforward, including the moments when a customer needs to send something back. We accept returns for eligible products when the return is initiated within 30 days of the delivery date shown on the original order. The item must be returned in its original packaging, with included accessories, manuals, safety materials, and any free promotional items that formed part of the purchase. If the item shows signs of misuse, deliberate damage, or missing components, Velora may decline the request or apply a partial refund where permitted by law.

Certain categories may have more limited return rights because of hygiene, safety, or activation concerns. Items that have been personalized, gift cards, opened software, intimate wearables, or products marked as final sale are not eligible for standard change-of-mind returns unless they are faulty. For electronics, customers should carefully keep serial-number labels, charging equipment, and protective inserts until they are satisfied with the purchase. Velora may request clear photographs or a short description of the issue before issuing a prepaid label or approving an in-store handoff.

Refunds are processed to the original payment method used at checkout once the returned item has been inspected and approved. If the original payment method is no longer available, Velora will contact the customer to arrange an alternative refund method only where local payment rules allow it. Shipping fees are generally non-refundable unless the return results from a fulfilment error, wrong item, damaged delivery, or confirmed product fault. Promotional discounts will be recalculated if a return causes the remaining order to fall below the original offer threshold.

Customers who believe they have a special circumstance, such as a delivery dispute, product defect, or medical or accessibility-related concern, should contact Velora Support before sending the product back. Our support team can open a ticket, review courier scans, and advise whether a manual exception review is appropriate. The final outcome of an exception review depends on order history, inspection results, and the applicable product restrictions communicated at checkout.`,
    },
    {
      policy_key: "shipping_policy",
      title: "Shipping & Delivery Policy",
      version: "2026.1",
      effective_date: "2026-01-01",
      content: `Velora ships throughout Mauritius and selected regional destinations using a mix of standard, priority, and specialist courier services. Delivery estimates shown at checkout are calculated from stock location, cut-off times, payment confirmation, and the shipping method selected by the customer. Orders placed after the daily cut-off, on public holidays, or during major promotional events may require additional processing time before dispatch. Once an order leaves the warehouse, tracking updates depend on the courier's scan frequency and may not refresh continuously in real time.

Customers are responsible for providing a complete and accurate shipping address, including apartment numbers, building access details, and contact phone numbers. If an address issue is identified before dispatch, Velora Support may be able to submit a correction request to the fulfilment team or courier. Address changes cannot always be guaranteed once the parcel has been packed or handed over to the carrier. In some cases, an undeliverable parcel may be returned to sender, at which point the customer will be contacted with redelivery or refund options.

If a tracking record shows a parcel as delivered but the customer has not received it, Velora recommends checking secure mail areas, reception desks, neighbours, and delivery notes first. Customers should then contact Support promptly so a courier trace can be opened while records remain fresh. Investigations may require confirmation of the delivery address, photo evidence where available, and a signed non-receipt statement. Velora will keep the customer updated during the review and may escalate to a specialist queue for high-value shipments or suspected carrier error.

Shipping fees, regional surcharges, and signature requirements are displayed before payment is completed. Velora reserves the right to split deliveries when items are sourced from multiple fulfilment centres, though customers will not be charged extra shipping purely because of an internal split. Some bulky, fragile, or high-risk items may require an adult signature or scheduled delivery window. Customers should review the order confirmation email carefully for shipment-specific instructions and delivery expectations.`,
    },
    {
      policy_key: "warranty_policy",
      title: "Warranty & Product Guarantee Policy",
      version: "2026.1",
      effective_date: "2026-01-01",
      content: `Velora sells products supplied either directly by brand partners or through authorized distribution channels. Where a product listing states a manufacturer warranty, the customer is entitled to request support for eligible manufacturing defects during the stated warranty duration, provided the product was used as intended and has not been altered by unauthorized repair work. Warranty periods begin on the original order delivery date unless a longer commencement rule is required by local law. Proof of purchase, product serial numbers, and a concise description of the issue may be required before a warranty claim can proceed.

The warranty covers defects in materials or workmanship that arise under normal consumer use. It does not cover accidental damage, liquid exposure where the product is not rated for it, misuse, cosmetic wear from ordinary handling, damage caused by incompatible accessories, or issues created by unsupported software modifications. Consumable items such as replaceable straps, batteries that naturally degrade over time, and aesthetic finishes may be subject to limited coverage depending on the brand's own warranty rules. Velora will communicate any category-specific exclusions on the product page when they apply.

Customers who believe an item is faulty should contact Velora Support before arranging third-party repair. Our support team may provide troubleshooting steps, request photographs or video, or direct the customer to an authorized service partner. If a claim is approved, Velora may offer a repair, replacement, store credit, or refund depending on stock availability, product age, and the recommendation from the manufacturer or service centre. Equivalent replacement models may be issued if the original item is discontinued and no direct substitute remains in stock.

Warranty outcomes are recorded against the customer's order history for continuity and quality review. Repeated fault reports for the same model may trigger supplier escalation, batch investigation, or temporary listing review. Velora aims to process straightforward warranty assessments quickly, but timelines can vary when supplier parts, technical diagnostics, or international service approvals are involved. Customers will receive updates by email or through their active support ticket as the case progresses.`,
    },
    {
      policy_key: "loyalty_policy",
      title: "Loyalty Programme Terms & Conditions",
      version: "2026.1",
      effective_date: "2026-01-01",
      content: `The Velora loyalty programme rewards eligible customers with points that can be earned on qualifying purchases and redeemed on future orders when the account is in good standing. Loyalty points are typically awarded after an order has been delivered or completed, rather than at the moment payment is captured, so that cancellations, fraud checks, or returns can be reflected accurately. Promotional campaigns may offer bonus points on selected categories or products, and the applicable earn rate will be displayed on the campaign page or product listing where relevant.

Points have no cash value and cannot be transferred, sold, or combined across separate customer accounts. If a customer redeems points on an order that is later cancelled or refunded, Velora may reinstate or deduct those points depending on the final resolution and the portion of the order that remained valid. Velora may also adjust a points balance where duplicate credits, fulfilment issues, fraud investigations, or customer-service goodwill actions require a manual correction. The transaction history visible in the account area is the official record for loyalty balance changes.

Points may expire after a period of account inactivity or in accordance with promotional campaign rules. Where expiry applies, Velora will aim to provide notice in the account area or by email before a significant balance is removed. Closed or suspended accounts may lose access to points redemption while the account is under review, and fraudulent use of the programme may lead to immediate forfeiture. Velora reserves the right to change earn rates, redemption thresholds, and bonus structures with reasonable notice.

Customers should review checkout summaries carefully before confirming a redemption. Some products, payment methods, and regional offers may not be eligible for points redemption even if they remain eligible for earning. If a customer believes their balance is incorrect, they should contact Support with the relevant order number or transaction reference so the account can be reviewed. Velora's decision on disputed loyalty adjustments will take into account order status, returns activity, and any applicable promotional terms.`,
    },
    {
      policy_key: "privacy_policy",
      title: "Privacy & Data Protection Policy",
      version: "2026.1",
      effective_date: "2026-01-01",
      content: `Velora collects customer information in order to process orders, deliver products, provide support, improve platform performance, and meet legal or fraud-prevention obligations. The information we process may include account details, shipping addresses, contact information, loyalty activity, device signals, support history, and interactions with Lena or our customer-service team. We limit access to personal data to staff, service providers, and systems that need it to perform their role, and we expect our partners to apply comparable security and confidentiality standards.

We use customer information to confirm identity, fulfil purchases, send service notifications, investigate delivery issues, manage returns, and personalize account experiences such as loyalty balances or saved preferences. We may also analyze aggregated trends to understand product demand, policy friction points, and support quality. Where marketing communications are offered, customers can manage preferences through account settings or unsubscribe links in email campaigns. Essential service messages related to orders, refunds, or security may still be sent even if promotional messages are disabled.

Velora retains information only for as long as necessary to provide the service, comply with legal obligations, resolve disputes, and protect the integrity of the platform. Some records, such as invoices, fraud checks, and support logs, may need to be retained for statutory or audit reasons after an account becomes inactive. Customers may request access to certain information held about them, subject to verification and any legal exceptions that apply. Requests to correct or delete data will be considered in line with consumer protection, tax, anti-fraud, and payment-record obligations.

We use administrative, technical, and operational safeguards to reduce the risk of unauthorized access, loss, or misuse. No online system can promise absolute security, so customers should also protect their passwords, review account activity regularly, and contact Velora promptly if they suspect unauthorized access. Where cross-border service providers are used, Velora will take reasonable steps to ensure appropriate contractual or technical protections are in place. Continued use of the platform after policy updates means the customer accepts the revised privacy terms to the extent permitted by law.`,
    },
    {
      policy_key: "payment_policy",
      title: "Payment & Pricing Policy",
      version: "2026.1",
      effective_date: "2026-01-01",
      content: `Velora displays product pricing as clearly as possible, including current sale prices, struck-through original prices where relevant, and any applicable delivery charges or checkout adjustments before payment is finalized. Prices may change over time due to supplier updates, currency shifts, limited-time campaigns, or corrections to listing errors. The price confirmed at checkout is the price that applies to the completed order unless the order is later cancelled because payment authorization failed, stock was unavailable, or a clear listing error materially affected the transaction.

Accepted payment methods may include debit cards, credit cards, digital wallets, and other regionally supported checkout options. All payment transactions are subject to verification, fraud screening, and issuer approval. Velora may place an authorization hold before capturing payment, especially for orders requiring stock confirmation or manual review. If an order is cancelled before capture, the release timeline depends on the customer's bank or payment provider rather than Velora's internal systems. Customers should contact their provider if an authorization hold remains visible longer than expected.

Promotions, vouchers, and loyalty redemptions are applied according to their published terms. Offers cannot be combined unless explicitly stated, and some categories may be excluded from price-based promotions. If a return, cancellation, or partial shipment affects the original order value, Velora may recalculate discounts or loyalty benefits to reflect the final qualifying basket. Customers are encouraged to review checkout totals, shipping surcharges, and tax information carefully before confirming payment.

Velora reserves the right to reject or cancel transactions associated with suspected fraud, repeated payment failures, misuse of promotional mechanics, or technical pricing errors. If a payment dispute or chargeback is raised, Velora may temporarily restrict certain account actions while the case is reviewed. Refunds approved under the returns or warranty policies are normally sent back to the original payment method, subject to payment-network limitations. Customers who need invoicing support or pricing clarification should contact Support with the relevant order number and billing details.`,
    },
    {
      policy_key: "prohibited_items_policy",
      title: "Restricted & Prohibited Items Policy",
      version: "2026.1",
      effective_date: "2026-01-01",
      content: `Velora curates its catalogue to comply with applicable safety, consumer, and transport rules. Some items may be restricted from sale, shipment, or return based on destination, age-related rules, battery transport controls, hygiene considerations, or supplier authorizations. Where a product has shipping or handling constraints, Velora will aim to communicate those restrictions on the product page, during checkout, or in post-purchase service messages. Customers should review these notices carefully, especially when ordering gifts, travel-related accessories, or devices containing large batteries.

Velora does not permit the resale of dangerous goods, counterfeit products, hacked devices, illegally imported goods, or merchandise that infringes the rights of other brands or creators. We may remove listings, cancel orders, or restrict accounts where misuse, unsafe behavior, or suspicious purchase patterns are detected. Some categories may also require enhanced delivery checks, identity verification, or signature on receipt. If a product cannot legally or safely be shipped to the address provided, Velora may cancel the order and refund the payment rather than attempt a restricted fulfilment.

Customers may not use Velora services to obtain items on behalf of sanctioned parties, for unlawful export, or for any activity that breaches payment, customs, or consumer-protection rules. Where a return or support request involves a restricted item, Velora may require additional documentation or route the case to a specialist queue before confirming the next step. Safety recalls, transport advisories, and manufacturer notices may also temporarily affect whether a product can be shipped, collected, or serviced.

If a customer is unsure whether a product is subject to special restrictions, they should contact Support before purchase. Velora's team can clarify availability, shipping constraints, and any compliance-related limitations that apply to a product or region. Continued misuse of the platform to procure prohibited items may lead to order cancellation, permanent account closure, and referral to relevant authorities where required by law or contract. These restrictions are designed to protect customers, carriers, and the broader marketplace ecosystem.`,
    },
  ].map((document) => ({
    id: randomUUID(),
    ...document,
    created_at: "2026-04-01T11:30:00.000Z",
    updated_at: "2026-04-01T11:30:00.000Z",
  }));

  await knex("policy_documents").insert(policyDocuments);

  const policyChunks: Array<Record<string, unknown>> = [];
  for (const document of policyDocuments) {
    const paragraphs = splitParagraphs(document.content);
    paragraphs.forEach((paragraph, index) => {
      policyChunks.push({
        id: randomUUID(),
        policy_document_id: document.id,
        chunk_index: index,
        chunk_text: paragraph,
        embedding: null,
        created_at: "2026-04-01T11:35:00.000Z",
      });
    });
  }

  await knex("policy_chunks").insert(policyChunks);
}
