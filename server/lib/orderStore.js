const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const WEBHOOKS_FILE = path.join(DATA_DIR, "webhooks.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson(file, fallback) {
  ensureDataDir();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const orderStore = {
  list() {
    const orders = readJson(ORDERS_FILE, []);
    return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  get(id) {
    return this.list().find((o) => o.id === id);
  },

  create(order) {
    const orders = this.list();
    const record = {
      id: randomUUID(),
      clientOrderId: order.clientOrderId || `DEMO-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: "CREATED",
      ...order,
    };
    orders.unshift(record);
    writeJson(ORDERS_FILE, orders);
    return record;
  },

  update(id, patch) {
    const orders = this.list();
    const index = orders.findIndex((o) => o.id === id);
    if (index === -1) return null;
    orders[index] = { ...orders[index], ...patch, updatedAt: new Date().toISOString() };
    writeJson(ORDERS_FILE, orders);
    return orders[index];
  },

  updateByClientOrderId(clientOrderId, patch) {
    const orders = this.list();
    const index = orders.findIndex((o) => o.clientOrderId === clientOrderId);
    if (index === -1) return null;
    orders[index] = { ...orders[index], ...patch, updatedAt: new Date().toISOString() };
    writeJson(ORDERS_FILE, orders);
    return orders[index];
  },

  updateByPaymentId(paymentId, patch) {
    const orders = this.list();
    const index = orders.findIndex((o) => o.paymentId === paymentId);
    if (index === -1) return null;
    orders[index] = { ...orders[index], ...patch, updatedAt: new Date().toISOString() };
    writeJson(ORDERS_FILE, orders);
    return orders[index];
  },

  updateByDemoOrderId(demoOrderId, patch) {
    const orders = this.list();
    const index = orders.findIndex((o) => o.id === demoOrderId);
    if (index === -1) return null;
    orders[index] = { ...orders[index], ...patch, updatedAt: new Date().toISOString() };
    writeJson(ORDERS_FILE, orders);
    return orders[index];
  },

  logWebhook(event) {
    const webhooks = readJson(WEBHOOKS_FILE, []);
    webhooks.unshift({
      id: randomUUID(),
      receivedAt: new Date().toISOString(),
      ...event,
    });
    writeJson(WEBHOOKS_FILE, webhooks.slice(0, 100));
    return webhooks[0];
  },

  listWebhooks() {
    return readJson(WEBHOOKS_FILE, []);
  },

  logApiCall(entry) {
    const file = path.join(DATA_DIR, "api-log.json");
    const logs = readJson(file, []);
    logs.unshift({
      id: randomUUID(),
      at: new Date().toISOString(),
      ...entry,
    });
    writeJson(file, logs.slice(0, 50));
  },

  listApiLogs() {
    return readJson(path.join(DATA_DIR, "api-log.json"), []);
  },
};

module.exports = { orderStore };
