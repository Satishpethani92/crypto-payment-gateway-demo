require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const express = require("express");
const cors = require("cors");
const path = require("path");
const { PaymentGatewayClient } = require("./lib/paymentGatewayClient");
const { orderStore } = require("./lib/orderStore");
const { SUPPORTED_CURRENCY_IDS, symbolToCurrencyId } = require("./lib/currencyMap");

const PORT = process.env.DEMO_PORT || 4000;
const STORE_URL = process.env.DEMO_STORE_URL || `http://localhost:${PORT}`;
const WEBHOOK_URL = `${STORE_URL}/webhooks/payment`;

function getGatewayClient() {
  const { GATEWAY_BASE_URL, GATEWAY_API_KEY, GATEWAY_API_SECRET, MERCHANT_ID } = process.env;

  if (!GATEWAY_BASE_URL || !GATEWAY_API_KEY || !GATEWAY_API_SECRET) {
    return null;
  }

  return new PaymentGatewayClient({
    baseUrl: GATEWAY_BASE_URL,
    apiKey: GATEWAY_API_KEY,
    apiSecret: GATEWAY_API_SECRET,
    merchantId: MERCHANT_ID,
  });
}

function logGatewayCall(label, result) {
  orderStore.logApiCall({
    label,
    request: result.request,
    status: result.status,
    success: result.data?.success,
    message: result.data?.message,
    response: result.data,
  });
}

function gatewayNotConfigured(res) {
  return res.status(503).json({
    success: false,
    message: "Gateway not configured. Copy .env.example to .env and set API credentials.",
  });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const PRODUCTS = [
  { id: "prod-1", name: "Premium Subscription", price: 1500, currency: "inr", description: "1 year access" },
  { id: "prod-2", name: "API Credits Pack", price: 50, currency: "usd", description: "10,000 API calls" },
  { id: "prod-3", name: "NFT Mint Pass", price: 0.05, currency: "usd", description: "Single mint entitlement" },
  { id: "prod-4", name: "Enterprise License", price: 5000, currency: "inr", description: "Annual enterprise plan" },
];

/** All Swagger APIs — https://betapg.icotokens.net/api-docs/ */
const SWAGGER_APIS = [
  { method: "GET", path: "/api/networks", tag: "Networks", auth: false },
  { method: "GET", path: "/api/network-with-currency", tag: "Network With Currency", auth: true },
  { method: "GET", path: "/api/rates/{currencyId}", tag: "Rates", auth: true },
  { method: "POST", path: "/api/payment", tag: "Payment Request", auth: true },
  { method: "POST", path: "/api/payment-status", tag: "Payment Status", auth: true },
  { method: "POST", path: "/api/refund", tag: "Payment Refund", auth: true },
  { method: "POST", path: "/api/create-wallet", tag: "Generate User Wallet", auth: true },
  { method: "POST", path: "/api/wallet-balance", tag: "Retrieve User Wallet", auth: true },
];

// ─── Config ──────────────────────────────────────────────────────────────────

app.get("/api/config", (req, res) => {
  const client = getGatewayClient();
  res.json({
    storeName: process.env.DEMO_STORE_NAME || "Demo Merchant Store",
    storeUrl: STORE_URL,
    gatewayConfigured: Boolean(client),
    gatewayBaseUrl: process.env.GATEWAY_BASE_URL || null,
    swaggerUrl: process.env.SWAGGER_URL || "https://betapg.icotokens.net/api-docs/",
    merchantId: process.env.MERCHANT_ID || null,
    paymentPageUrl: process.env.PAYMENT_PAGE_URL || "http://localhost:3000",
    swaggerApis: SWAGGER_APIS,
    supportedCurrencyIds: SUPPORTED_CURRENCY_IDS,
    webhook: {
      url: WEBHOOK_URL,
    },
  });
});

app.get("/api/products", (req, res) => {
  res.json({ products: PRODUCTS });
});

// ─── Gateway catalog (Networks + Network With Currency + Rates) ──────────────

app.get("/api/gateway/catalog", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);

  try {
    const [networks, networkWithCurrency] = await Promise.all([
      client.getNetworks(),
      client.getNetworkWithCurrency(),
    ]);

    logGatewayCall("GET /api/networks", networks);
    logGatewayCall("GET /api/network-with-currency", networkWithCurrency);

    const rates = {};
    for (const currencyId of SUPPORTED_CURRENCY_IDS) {
      const rateResult = await client.getCurrencyRate(currencyId);
      logGatewayCall(`GET /api/rates/${currencyId}`, rateResult);
      rates[currencyId] = rateResult.data;
    }

    res.json({
      success: true,
      data: {
        networks: networks.data,
        networkWithCurrency: networkWithCurrency.data,
        rates,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Individual gateway proxies (all Swagger endpoints) ──────────────────────

app.get("/api/gateway/networks", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);
  try {
    const result = await client.getNetworks();
    logGatewayCall("GET /api/networks", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/gateway/network-with-currency", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);
  try {
    const result = await client.getNetworkWithCurrency();
    logGatewayCall("GET /api/network-with-currency", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/gateway/rates/:currencyId", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);
  const fiatFilter = [req.query.rate].flat().filter(Boolean);
  try {
    const result = await client.getCurrencyRate(req.params.currencyId, fiatFilter);
    logGatewayCall(`GET /api/rates/${req.params.currencyId}`, result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/gateway/payment", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);
  try {
    const result = await client.createPayment(req.body);
    logGatewayCall("POST /api/payment", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});



app.post("/api/gateway/payment-status", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);
  try {
    const result = await client.getPaymentStatus(req.body);
    logGatewayCall("POST /api/payment-status", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/gateway/refund", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);
  try {
    const result = await client.createRefund(req.body);
    logGatewayCall("POST /api/refund", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/gateway/create-wallet", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);
  try {
    const result = await client.createWallet({ ...req.body, merchantId: req.body.merchantId || process.env.MERCHANT_ID });
    logGatewayCall("POST /api/create-wallet", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/gateway/wallet-balance", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);
  try {
    const result = await client.getWalletBalance(req.body);
    logGatewayCall("POST /api/wallet-balance", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/gateway/transaction-history", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);
  try {
    const result = await client.getUserTransactionHistory(req.body);
    logGatewayCall("POST /api/transaction-history", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/gateway/user-2fa-status", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);
  try {
    const result = await client.getUser2FAStatus(req.body);
    logGatewayCall("POST /api/user-2fa-status", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/gateway/user-otp/generate", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);
  try {
    const result = await client.generateUserOTP(req.body);
    logGatewayCall("POST /api/user-otp/generate", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/gateway/user-otp/verify", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);
  try {
    const result = await client.verifyUserOTP(req.body);
    logGatewayCall("POST /api/user-otp/verify", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Rate quote for checkout (uses GET /api/rates/{currencyId}) ──────────────

app.get("/api/quote", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);

  const { amount, fiatCurrency, currency } = req.query;
  if (!amount || !fiatCurrency || !currency) {
    return res.status(400).json({ success: false, message: "amount, fiatCurrency, currency required" });
  }

  const currencyId = symbolToCurrencyId(currency);
  if (!currencyId) {
    return res.status(400).json({ success: false, message: `Unknown currency: ${currency}` });
  }

  try {
    const result = await client.getCurrencyRate(currencyId, [fiatCurrency]);
    logGatewayCall(`GET /api/rates/${currencyId}?rate=${fiatCurrency}`, result);

    if (!result.data?.success || !result.data?.data?.rates) {
      return res.status(result.status).json(result.data);
    }

    const rate = Number(result.data.data.rates[fiatCurrency]);
    const cryptoAmount = rate > 0 ? (Number(amount) / rate).toFixed(8) : null;

    res.json({
      success: true,
      data: {
        fiatAmount: amount,
        fiatCurrency,
        currency,
        currencyId,
        rate,
        cryptoAmount,
        rateData: result.data.data,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Checkout (POST /api/payment) ────────────────────────────────────────────

app.post("/api/checkout", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);

  const {
    email,
    amount,
    currency = "XDC",
    fiatCurrency = "inr",
    network = "Xinfin",
    transactionType = "external",
    productId,
    description,
    otp,
  } = req.body;

  if (!email || !amount) {
    return res.status(400).json({ success: false, message: "email and amount are required" });
  }

  const product = PRODUCTS.find((p) => p.id === productId);
  const clientOrderId = `DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const order = orderStore.create({
    email,
    amount: String(amount),
    currency,
    fiatCurrency,
    network,
    transactionType,
    productId,
    productName: product?.name || description || "Demo purchase",
    clientOrderId,
    status: "PENDING_PAYMENT",
  });

  try {
    const result = await client.createPayment({
      email,
      amount: String(amount),
      currency,
      fiatCurrency,
      network,
      transactionType,
      clientOrderId,
      successUrl: `${STORE_URL}/?payment=success&orderId=${order.id}`,
      failureUrl: `${STORE_URL}/?payment=failure&orderId=${order.id}`,
      description: description || product?.name || "Demo store purchase",
      metadata: { demoOrderId: order.id, productId: productId || null },
      ...(otp ? { otp } : {}),
    });

    logGatewayCall("POST /api/payment", result);

    if (!result.ok || !result.data?.success) {
      orderStore.update(order.id, {
        status: "PAYMENT_FAILED",
        gatewayError: result.data?.message || "Payment creation failed",
      });
      return res.status(result.status || 400).json(result.data);
    }

    const { redirectUrl, paymentId } = result.data.data || {};

    orderStore.update(order.id, {
      status: "AWAITING_PAYMENT",
      paymentId,
      redirectUrl,
      gatewayResponse: result.data.data,
    });

    res.json({
      success: true,
      message: "Payment created — redirect customer to gateway",
      data: { orderId: order.id, clientOrderId, paymentId, redirectUrl },
    });
  } catch (err) {
    orderStore.update(order.id, { status: "PAYMENT_FAILED", gatewayError: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Orders ──────────────────────────────────────────────────────────────────

app.get("/api/orders", (req, res) => {
  res.json({ success: true, data: orderStore.list() });
});

app.get("/api/orders/:id", (req, res) => {
  const order = orderStore.get(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: "Order not found" });
  res.json({ success: true, data: order });
});

app.post("/api/orders/:id/status", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);

  const order = orderStore.get(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: "Order not found" });

  try {
    const result = await client.getPaymentStatus({
      paymentId: order.paymentId,
      clientOrderId: order.clientOrderId,
    });

    logGatewayCall("POST /api/payment-status", result);

    if (result.data?.success && result.data?.data) {
      const pgStatus = result.data.data.status;
      orderStore.update(order.id, {
        paymentStatus: pgStatus,
        status: pgStatus === "COMPLETED" ? "PAID" : order.status,
        lastStatusCheck: new Date().toISOString(),
        gatewayStatus: result.data.data,
      });
    }

    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/orders/:id/refund", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);

  const order = orderStore.get(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: "Order not found" });

  const { userRefundAddress, refundAmount, amount } = req.body;
  if (!userRefundAddress || !refundAmount) {
    return res.status(400).json({ success: false, message: "userRefundAddress and refundAmount required" });
  }

  try {
    const result = await client.createRefund({
      paymentId: order.paymentId,
      currency: order.currency,
      fiatCurrency: order.fiatCurrency,
      network: order.network,
      userRefundAddress,
      refundAmount: String(refundAmount),
      amount: String(amount || order.amount),
    });

    logGatewayCall("POST /api/refund", result);

    if (result.data?.success) {
      orderStore.update(order.id, { status: "REFUND_REQUESTED", refundResponse: result.data.data });
    }

    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Wallet shortcuts ─────────────────────────────────────────────────────────

app.post("/api/wallets", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);

  const { email, currency, fiatCurrency, network } = req.body;
  if (!email || !currency || !fiatCurrency || !network) {
    return res.status(400).json({ success: false, message: "email, currency, fiatCurrency, network required" });
  }

  try {
    const result = await client.createWallet({ email, currency, fiatCurrency, network });
    logGatewayCall("POST /api/create-wallet", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/wallets/balance", async (req, res) => {
  const client = getGatewayClient();
  if (!client) return gatewayNotConfigured(res);

  const { email, currency } = req.body;
  if (!email || !currency) {
    return res.status(400).json({ success: false, message: "email and currency required" });
  }

  try {
    const result = await client.getWalletBalance({ email, currency });
    logGatewayCall("POST /api/wallet-balance", result);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Webhooks — payment confirmation (register this URL in gateway admin) ─────

app.post("/webhooks/payment", (req, res) => {
  const payload = req.body;
  const status = payload.status;
  const isCompleted = status === "COMPLETED";
  const paymentId = payload.id;
  const metadata = payload.metadata || {};

  let updatedOrder = null;

  if (paymentId) {
    updatedOrder = orderStore.updateByPaymentId(paymentId, {
      status: isCompleted ? "PAID" : status === "EXPIRED" ? "EXPIRED" : "AWAITING_PAYMENT",
      paymentStatus: status,
      transactionHash: payload.transactionHash,
      webhookReceivedAt: new Date().toISOString(),
      paymentConfirmedAt: isCompleted ? payload.completedOn || new Date().toISOString() : null,
      webhookPayload: payload,
    });
  }

  if (!updatedOrder && metadata.demoOrderId) {
    updatedOrder = orderStore.updateByDemoOrderId(metadata.demoOrderId, {
      status: isCompleted ? "PAID" : "AWAITING_PAYMENT",
      paymentStatus: status,
      paymentId,
      transactionHash: payload.transactionHash,
      webhookReceivedAt: new Date().toISOString(),
      paymentConfirmedAt: isCompleted ? payload.completedOn || new Date().toISOString() : null,
      webhookPayload: payload,
    });
  }

  const logEntry = orderStore.logWebhook({
    type: "PAYMENT_CONFIRMATION",
    status,
    paymentId,
    body: payload,
    orderUpdated: Boolean(updatedOrder),
    orderId: updatedOrder?.id || null,
  });

  console.log(`[webhook] status=${status} paymentId=${paymentId} orderUpdated=${Boolean(updatedOrder)}`);

  res.status(200).json({
    success: true,
    message: isCompleted ? "Payment confirmation received" : "Webhook received",
    data: { eventId: logEntry.id, status, orderUpdated: Boolean(updatedOrder) },
  });
});

app.get("/api/webhooks", (req, res) => {
  res.json({ success: true, data: orderStore.listWebhooks() });
});

app.get("/api/webhooks/config", (req, res) => {
  res.json({
    success: true,
    data: {
      url: WEBHOOK_URL,
      instructions: [
        "Log in to Crypto Payment Gateway admin",
        "Go to Settings → Webhooks",
        `Add this webhook URL: ${WEBHOOK_URL}`,
        "Complete a payment — gateway POSTs here when status is COMPLETED",
        "For local dev use ngrok: ngrok http 4000, then register https://xxxx.ngrok.io/webhooks/payment",
      ],
    },
  });
});

app.get("/api/api-log", (req, res) => {
  res.json({ success: true, data: orderStore.listApiLogs() });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("");
  console.log("  Demo Merchant Store — Full API Integration");
  console.log("  Swagger: https://betapg.icotokens.net/api-docs/");
  console.log("  ─────────────────────────────────────────");
  console.log(`  Store UI:     ${STORE_URL}`);
  console.log(`  Webhook URL:  ${WEBHOOK_URL}`);
  console.log(`  Gateway:      ${process.env.GATEWAY_BASE_URL || "(not configured — copy .env.example)"}`);
  console.log("");
});
