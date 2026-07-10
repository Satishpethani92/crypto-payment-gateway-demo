const API_BASE = "";

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const storeApi = {
  getConfig: () => api("/api/config").then((r) => r.data),
  getProducts: () => api("/api/products").then((r) => r.data),

  // Catalog — Networks + Network With Currency + all Rates
  getCatalog: () => api("/api/gateway/catalog").then((r) => r.data),
  getQuote: (params) => {
    const q = new URLSearchParams(params).toString();
    return api(`/api/quote?${q}`).then((r) => r.data);
  },

  checkout: (body) => api("/api/checkout", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),

  getOrders: () => api("/api/orders").then((r) => r.data),
  getOrder: (id) => api(`/api/orders/${id}`).then((r) => r.data),
  checkOrderStatus: (id) => api(`/api/orders/${id}/status`, { method: "POST" }).then((r) => r.data),
  refundOrder: (id, body) => api(`/api/orders/${id}/refund`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),

  createWallet: (body) => api("/api/wallets", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  getWalletBalance: (body) => api("/api/wallets/balance", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),

  // Individual Swagger API proxies
  getNetworks: () => api("/api/gateway/networks").then((r) => r.data),
  getNetworkWithCurrency: () => api("/api/gateway/network-with-currency").then((r) => r.data),
  getRates: (currencyId, fiat) => {
    const q = fiat ? `?rate=${fiat}` : "";
    return api(`/api/gateway/rates/${currencyId}${q}`).then((r) => r.data);
  },
  gatewayPayment: (body) => api("/api/gateway/payment", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),

  gatewayPaymentStatus: (body) => api("/api/gateway/payment-status", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  gatewayRefund: (body) => api("/api/gateway/refund", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  gatewayCreateWallet: (body) => api("/api/gateway/create-wallet", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  gatewayWalletBalance: (body) => api("/api/gateway/wallet-balance", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  gatewayTransactionHistory: (body) => api("/api/gateway/transaction-history", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  gatewayUser2FAStatus: (body) => api("/api/gateway/user-2fa-status", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  gatewayUserOTPGenerate: (body) => api("/api/gateway/user-otp/generate", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  gatewayUserOTPVerify: (body) => api("/api/gateway/user-otp/verify", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),

  getApiLog: () => api("/api/api-log").then((r) => r.data),
  getWebhooks: () => api("/api/webhooks").then((r) => r.data),
  getWebhookConfig: () => api("/api/webhooks/config").then((r) => r.data),
};

window.storeApi = storeApi;
