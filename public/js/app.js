/* global storeApi */

let selectedProduct = null;
let config = null;
let catalog = null;

const CURRENCY_ID_LABELS = {
  ethereum: "ETH",
  "xdce-crowd-sale": "XDC",
  tether: "USDT",
  "usd-coin": "USDC",
  storx: "SRX",
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function toast(message, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4500);
}

function formatPrice(amount, currency) {
  const symbols = { inr: "₹", usd: "$", eur: "€", aed: "AED ", gbp: "£", jpy: "¥" };
  return `${symbols[currency] || currency.toUpperCase() + " "}${amount}`;
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "rates") renderRatesTab();
    if (btn.dataset.tab === "orders") loadOrders();
    if (btn.dataset.tab === "apis") renderApiExplorer();
    if (btn.dataset.tab === "webhooks") loadWebhooksTab();
    if (btn.dataset.tab === "integration") loadIntegrationLog();
  });
});

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  try {
    config = await storeApi.getConfig();
    document.getElementById("store-name").textContent = config.storeName;
    if (document.getElementById("webhook-url-display")) {
      document.getElementById("webhook-url-display").textContent = config.webhook?.url || `${config.storeUrl}/webhooks/payment`;
    }
    if (config.swaggerUrl) {
      document.getElementById("swagger-link").href = config.swaggerUrl;
    }

    const badge = document.getElementById("gateway-badge");
    if (config.gatewayConfigured) {
      badge.textContent = `Gateway: ${config.gatewayBaseUrl}`;
      badge.className = "badge badge-ok";
      await loadCatalog();
    } else {
      badge.textContent = "Gateway: not configured";
      badge.className = "badge badge-warn";
      showCatalogBanner("Configure .env with API credentials to load Networks & Rates.", "warn");
    }
  } catch (e) {
    console.error(e);
  }

  await loadProducts();
  handlePaymentReturn();
  renderApiExplorer();
}

async function loadCatalog() {
  try {
    const res = await storeApi.getCatalog();
    if (res.success) {
      catalog = res.data;
      applyCatalogToSelects(catalog.networkWithCurrency?.data || catalog.networkWithCurrency);
      showCatalogBanner("Loaded Networks, Network With Currency, and Rates from gateway.", "ok");
    }
  } catch (e) {
    showCatalogBanner(`Failed to load catalog: ${e.message}`, "error");
  }
}

function showCatalogBanner(msg, type) {
  const el = document.getElementById("catalog-status");
  el.textContent = msg;
  el.className = `catalog-banner banner-${type}`;
  el.classList.remove("hidden");
}

function applyCatalogToSelects(networkData) {
  const list = networkData?.data || networkData;
  if (!Array.isArray(list) || !list.length) return;

  const networkOptions = list.map((n) => `<option value="${esc(n.network)}">${esc(n.network)}</option>`).join("");

  ["checkout-network", "wallet-network"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = networkOptions;
  });

  updateCurrencySelectForNetwork(list[0]?.network, list);
}

function updateCurrencySelectForNetwork(networkName, list) {
  const data = list || catalog?.networkWithCurrency?.data || [];
  const net = data.find((n) => n.network === networkName) || data[0];
  if (!net) return;

  const currencies = net.currency.map((c) => c.name.toUpperCase());
  const opts = currencies.map((c) => `<option value="${c}">${c}</option>`).join("");

  ["checkout-currency", "wallet-currency", "balance-currency"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

// ─── Rates & Networks tab ────────────────────────────────────────────────────

async function renderRatesTab() {
  if (!catalog) await loadCatalog();
  if (!catalog) return;

  const networks = catalog.networks?.data || catalog.networks;
  const netCurrency = catalog.networkWithCurrency?.data || catalog.networkWithCurrency;
  const rates = catalog.rates || {};

  // Networks panel
  const netList = networks?.data || networks;
  document.getElementById("networks-panel").innerHTML = Array.isArray(netList)
    ? `<table class="data-table"><thead><tr><th>Network</th><th>Currencies</th></tr></thead><tbody>${netList
        .map(
          (n) =>
            `<tr><td>${esc(n.name)}</td><td>${(n.networkCurrency || n.networkCurrancy || [])
              .map((c) => esc(c.currency))
              .join(", ")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<pre class="code-block">${esc(JSON.stringify(networks, null, 2))}</pre>`;

  // Network with currency panel
  document.getElementById("network-currency-panel").innerHTML = Array.isArray(netCurrency)
    ? netCurrency
        .map(
          (n) => `
      <div class="net-currency-group">
        <strong>${esc(n.network)}</strong>
        <div class="chip-row">${n.currency.map((c) => `<span class="chip">${esc(c.name.toUpperCase())} · ${c.decimal} decimals</span>`).join("")}</div>
      </div>`,
        )
        .join("")
    : `<pre class="code-block">${esc(JSON.stringify(netCurrency, null, 2))}</pre>`;

  renderRatesGrid(rates);
}

function renderRatesGrid(rates) {
  const fiatFilter = document.getElementById("rate-fiat-filter")?.value;
  const panel = document.getElementById("rates-panel");

  panel.innerHTML = Object.entries(rates)
    .map(([currencyId, rateRes]) => {
      const d = rateRes?.data || rateRes;
      const symbol = d?.symbol || CURRENCY_ID_LABELS[currencyId] || currencyId;
      const rateEntries = d?.rates ? Object.entries(d.rates) : [];
      const filtered = fiatFilter ? rateEntries.filter(([k]) => k === fiatFilter) : rateEntries;

      return `
      <div class="rate-card">
        <div class="rate-card-header">
          <span class="rate-symbol">${esc(symbol)}</span>
          <span class="api-tag-sm">/${currencyId}</span>
        </div>
        <div class="rate-card-body">
          ${
            filtered.length
              ? filtered
                  .map(([fiat, val]) => `<div class="rate-row"><span>${fiat.toUpperCase()}</span><strong>${Number(val).toLocaleString()}</strong></div>`)
                  .join("")
              : `<span class="hint">${rateRes?.success === false ? esc(rateRes.message) : "No rate data"}</span>`
          }
        </div>
      </div>`;
    })
    .join("");
}

document.getElementById("refresh-catalog")?.addEventListener("click", async () => {
  await loadCatalog();
  renderRatesTab();
  toast("Catalog refreshed from gateway");
});

document.getElementById("rate-fiat-filter")?.addEventListener("change", () => {
  if (catalog?.rates) renderRatesGrid(catalog.rates);
});

// ─── Store & Checkout ────────────────────────────────────────────────────────

async function loadProducts() {
  const { products } = await storeApi.getProducts();
  document.getElementById("products-grid").innerHTML = products
    .map(
      (p) => `
    <div class="product-card">
      <h3>${esc(p.name)}</h3>
      <div class="product-price">${formatPrice(p.price, p.currency)}</div>
      <p class="product-desc">${esc(p.description)}</p>
      <button class="btn btn-primary" onclick="openCheckout('${p.id}')">Buy Now</button>
    </div>`,
    )
    .join("");
}

window.openCheckout = async function (productId) {
  const { products } = await storeApi.getProducts();
  selectedProduct = products.find((p) => p.id === productId);
  if (!selectedProduct) return;

  if (!catalog) await loadCatalog();

  const form = document.getElementById("checkout-form");
  document.getElementById("checkout-product").innerHTML = `<strong>${esc(selectedProduct.name)}</strong> — ${formatPrice(selectedProduct.price, selectedProduct.currency)}`;
  form.amount.value = selectedProduct.price;
  form.fiatCurrency.value = selectedProduct.currency;

  const list = catalog?.networkWithCurrency?.data || [];
  if (list.length) {
    form.network.value = list[0].network;
    updateCurrencySelectForNetwork(list[0].network, list);
  }

  await updateRatePreview();
  document.getElementById("checkout-modal").showModal();
};

document.getElementById("home-wallet-refresh")?.addEventListener("click", async () => {
  const email = document.getElementById("home-wallet-email").value;
  const statusDiv = document.getElementById("home-wallet-status");
  if (!email) return toast("Please enter customer email", "error");

  statusDiv.innerHTML = "Checking/Creating wallet...";
  try {
    const balRes = await storeApi.gatewayWalletBalance({ email, currency: "XDC", fiatCurrency: "usd", network: "Xinfin" });
    if (balRes.success === false || balRes.status === false) {
      statusDiv.innerHTML = `Error: ${balRes.message}`;
    } else {
      statusDiv.innerHTML = `Balance: <strong>${balRes.data?.balance || 0} XDC</strong><br/>Address: <code>${balRes.data?.walletAddress || 'N/A'}</code>`;
    }
  } catch (err) {
    statusDiv.innerHTML = `Error: ${err.message}`;
  }
});

document.getElementById("home-wallet-2fa-status")?.addEventListener("click", async () => {
  const email = document.getElementById("home-wallet-email").value;
  const statusMsg = document.getElementById("home-2fa-status-msg");
  if (!email) return toast("Please enter customer email", "error");

  statusMsg.innerHTML = "Checking 2FA status...";
  
  try {
    const res = await storeApi.gatewayUser2FAStatus({ email });
    if (res.data?.otp_enabled) {
      statusMsg.innerHTML = "<span style='color: green;'>User is verified</span>";
      document.getElementById("products-section").classList.remove("hidden");
    } else {
      statusMsg.innerHTML = `<div style='color: red; margin-top: 0.5rem; line-height: 1.5;'>
        User's 2FA is not enabled. Please follow these steps to enable it:<br/>
        1. Click the "Wallets" tab from the navbar.<br/>
        2. Scroll down to "Enable 2FA for Wallet".<br/>
        3. Enter your email and click "Generate 2FA".<br/>
        4. Scan the QR code using Google Authenticator.<br/>
        5. Enter the OTP and click "Verify & Enable".
      </div>`;
      document.getElementById("products-section").classList.add("hidden");
    }
  } catch (err) {
    statusMsg.innerHTML = `<span style='color: red;'>Error: ${err.message}</span>`;
  }
});

async function updateRatePreview() {
  const form = document.getElementById("checkout-form");
  const preview = document.getElementById("rate-preview");
  const amount = form.amount.value;
  const fiatCurrency = form.fiatCurrency.value;
  const currency = form.currency.value;

  if (!amount || !config?.gatewayConfigured) {
    preview.classList.add("hidden");
    return;
  }

  preview.classList.remove("hidden");
  preview.innerHTML = "Fetching rate via <code>GET /api/rates/{currencyId}</code>…";

  try {
    const quote = await storeApi.getQuote({ amount, fiatCurrency, currency });
    if (quote.success) {
      preview.innerHTML = `
        <strong>Rate quote</strong> (1 ${currency} = ${Number(quote.data.rate).toLocaleString()} ${fiatCurrency.toUpperCase()})
        <br/>Customer pays ≈ <strong>${quote.data.cryptoAmount} ${currency}</strong> for ${formatPrice(amount, fiatCurrency)}
      `;
    } else {
      preview.innerHTML = `<span class="hint">${esc(quote.message || "Rate unavailable")}</span>`;
    }
  } catch (e) {
    preview.innerHTML = `<span class="hint">Rate error: ${esc(e.message)}</span>`;
  }
}

document.getElementById("checkout-network")?.addEventListener("change", (e) => {
  const list = catalog?.networkWithCurrency?.data || [];
  updateCurrencySelectForNetwork(e.target.value, list);
  updateRatePreview();
});

["checkout-currency", "checkout-fiat", "checkout-form amount"].forEach((sel) => {
  const el = sel.includes(" ") ? document.querySelector(`#checkout-form [name="${sel.split(" ")[1]}"]`) : document.getElementById(sel);
  el?.addEventListener("change", updateRatePreview);
  el?.addEventListener("input", updateRatePreview);
});

document.getElementById("close-checkout").addEventListener("click", () => {
  document.getElementById("checkout-modal").close();
});

document.getElementById("checkout-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const payBtn = document.getElementById("pay-btn");
  
  payBtn.disabled = true;
  payBtn.textContent = "Creating payment…";

  try {
    const result = await storeApi.checkout({
      email: form.email.value,
      amount: form.amount.value,
      currency: form.currency.value,
      fiatCurrency: form.fiatCurrency.value,
      network: form.network.value,
      transactionType: form.transactionType.value,
      productId: selectedProduct?.id,
      description: selectedProduct?.name,
    });

    if (result.success || result.status) {
      document.getElementById("checkout-modal").close();
      
      if (form.transactionType.value === "internal" && result.data?.tokenId) {
        // Open OTP modal for internal payment
        document.getElementById("otp-email").value = form.email.value;
        document.getElementById("otp-tokenId").value = result.data.tokenId;
        document.getElementById("otp-modal").showModal();
      } else if (result.data?.redirectUrl) {
        // External payment, fallback redirect
        toast("Redirecting to payment gateway…");
        window.location.href = result.data.redirectUrl;
      }
    } else {
      toast(result.message || "Payment failed", "error");
    }
  } catch (err) {
    toast(err.message, "error");
  } finally {
    payBtn.disabled = false;
    payBtn.textContent = "Pay with Crypto Gateway";
  }
});

document.getElementById("close-otp")?.addEventListener("click", () => {
  document.getElementById("otp-modal").close();
});

document.getElementById("otp-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById("otp-confirm-btn");
  
  btn.disabled = true;
  btn.textContent = "Verifying...";
  
  const email = form.email.value;
  const token = form.otp.value;
  const tokenId = form.tokenId.value;

  try {
    const verifyRes = await storeApi.gatewayUserOTPVerify({ email, token });
    if (verifyRes.success || verifyRes.status) {
      btn.textContent = "Confirming Payment...";
      const confirmRes = await storeApi.gatewayConfirmInternalPayment({ tokenId });
      
      if (confirmRes.success || confirmRes.status) {
        toast("Internal payment confirmed successfully!");
        document.getElementById("otp-modal").close();
        // Option to refresh data if necessary, e.g., loadOrders() if implemented.
      } else {
        toast(confirmRes.message || "Failed to confirm internal payment", "error");
      }
    } else {
      toast(verifyRes.message || "Invalid OTP", "error");
    }
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Payment";
  }
});

document.getElementById("wallet-2fa-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("wallet-2fa-email").value;
  try {
    const res = await storeApi.gatewayUserOTPGenerate({ email });
    if (res.success || res.status) {
      document.getElementById("wallet-2fa-setup").classList.remove("hidden");
      document.getElementById("wallet-2fa-secret").textContent = res.data.base32;
      document.getElementById("wallet-2fa-qr").src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(res.data.otpauth_url)}`;
      document.getElementById("wallet-2fa-verify-email").value = email;
      toast("2FA Secret generated!");
    } else {
      toast(res.message || "Failed to generate 2FA", "error");
    }
  } catch (err) {
    toast(err.message, "error");
  }
});

document.getElementById("wallet-2fa-verify-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("wallet-2fa-verify-email").value;
  const token = document.getElementById("wallet-2fa-otp").value;
  try {
    const res = await storeApi.gatewayUserOTPVerify({ email, token });
    if (res.success || res.status) {
      toast("2FA enabled successfully!");
      document.getElementById("wallet-2fa-setup").classList.add("hidden");
    } else {
      toast(res.message || "Invalid OTP", "error");
    }
  } catch (err) {
    toast(err.message, "error");
  }
});

function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("payment") === "success") {
    toast("Returned from gateway. Order will update to PAID when webhook is received.");
    document.querySelector('[data-tab="webhooks"]').click();
    window.history.replaceState({}, "", "/");
  } else if (params.get("payment") === "failure") {
    toast("Payment failed or cancelled.", "error");
    window.history.replaceState({}, "", "/");
  }
}

// ─── Orders ──────────────────────────────────────────────────────────────────

async function loadOrders() {
  const container = document.getElementById("orders-list");
  try {
    const { data: orders } = await storeApi.getOrders();
    if (!orders?.length) {
      container.innerHTML = '<div class="empty-state">No orders yet.</div>';
      return;
    }

    container.innerHTML = orders
      .map(
        (o) => `
      <div class="order-card">
        <div>
          <strong>${esc(o.productName || "Order")}</strong>
          <div class="meta">${esc(o.email)} · ${o.amount} ${o.fiatCurrency?.toUpperCase()} → ${o.currency} · ${o.transactionType}</div>
          <div class="meta">Order: ${esc(o.clientOrderId)}</div>
          ${o.paymentId ? `<div class="meta">Payment ID: <code>${esc(o.paymentId)}</code></div>` : ""}
          ${o.redirectUrl ? `<div class="meta"><a href="${esc(o.redirectUrl)}" target="_blank">Open payment page</a></div>` : ""}
        </div>
        <div class="order-actions">
          <span class="order-status status-${o.paymentStatus || o.status}">${o.paymentStatus || o.status}</span>
          <button class="btn btn-secondary btn-sm" onclick="checkStatus('${o.id}')">Payment Status</button>
          ${o.paymentId ? `<button class="btn btn-secondary btn-sm" onclick="openRefund('${o.id}', '${o.amount}')">Refund</button>` : ""}
        </div>
      </div>`,
      )
      .join("");
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error: ${esc(e.message)}</div>`;
  }
}

window.checkStatus = async function (orderId) {
  try {
    const result = await storeApi.checkOrderStatus(orderId);
    toast(result.success ? `Status: ${result.data?.status}` : result.message, result.success ? "success" : "error");
    loadOrders();
  } catch (e) {
    toast(e.message, "error");
  }
};

window.openRefund = function (orderId, amount) {
  document.getElementById("refund-order-id").value = orderId;
  document.getElementById("refund-amount").value = amount;
  document.getElementById("refund-modal").showModal();
};

document.getElementById("close-refund").addEventListener("click", () => {
  document.getElementById("refund-modal").close();
});

document.getElementById("refund-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const orderId = fd.get("orderId");
  try {
    const result = await storeApi.refundOrder(orderId, {
      userRefundAddress: fd.get("userRefundAddress"),
      refundAmount: fd.get("refundAmount"),
      amount: fd.get("amount"),
    });
    toast(result.success ? "Refund requested" : result.message, result.success ? "success" : "error");
    document.getElementById("refund-modal").close();
    loadOrders();
  } catch (err) {
    toast(err.message, "error");
  }
});

document.getElementById("refresh-orders").addEventListener("click", loadOrders);

// ─── Wallets ─────────────────────────────────────────────────────────────────

document.getElementById("wallet-network")?.addEventListener("change", (e) => {
  const list = catalog?.networkWithCurrency?.data || [];
  updateCurrencySelectForNetwork(e.target.value, list);
});

document.getElementById("wallet-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const result = await storeApi.createWallet(Object.fromEntries(fd));
    toast(result.success ? "Wallet created" : result.message, result.success ? "success" : "error");
    if (result.success) e.target.reset();
  } catch (err) {
    toast(err.message, "error");
  }
});

document.getElementById("balance-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const result = await storeApi.getWalletBalance(Object.fromEntries(fd));
    const pre = document.getElementById("balance-result");
    pre.classList.remove("hidden");
    pre.textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    toast(err.message, "error");
  }
});

// ─── API Explorer (all 8 Swagger endpoints) ──────────────────────────────────

function renderApiExplorer() {
  const container = document.getElementById("api-explorer");
  if (!config?.swaggerApis) return;

  container.innerHTML = config.swaggerApis
    .map(
      (api) => `
    <div class="card api-card" data-api="${esc(api.path)}">
      <div class="api-card-head">
        <span class="method method-${api.method.toLowerCase()}">${api.method}</span>
        <code>${esc(api.path)}</code>
        <span class="api-tag">${esc(api.tag)}</span>
        ${api.auth ? '<span class="auth-badge">Signed</span>' : '<span class="auth-badge public">Public</span>'}
      </div>
      <div class="api-card-body" id="explorer-${api.method}-${api.path.replace(/[^a-z0-9]/gi, "-")}">
        ${getExplorerForm(api)}
      </div>
      <pre class="code-block explorer-result hidden" id="result-${api.method}-${api.path.replace(/[^a-z0-9]/gi, "-")}"></pre>
    </div>`,
    )
    .join("");

  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => runExplorerAction(btn));
  });
}

function getExplorerForm(api) {
  switch (api.path) {
    case "/api/networks":
      return `<button class="btn btn-primary btn-sm" data-action="networks">Call GET /api/networks</button>`;
    case "/api/network-with-currency":
      return `<button class="btn btn-primary btn-sm" data-action="network-with-currency">Call GET /api/network-with-currency</button>`;
    case "/api/rates/{currencyId}":
      return `
        <div class="form inline-form">
          <select id="explorer-currency-id" class="select-inline">
            ${(config.supportedCurrencyIds || []).map((id) => `<option value="${id}">${CURRENCY_ID_LABELS[id] || id}</option>`).join("")}
          </select>
          <select id="explorer-rate-fiat" class="select-inline">
            <option value="">All fiats</option>
            <option value="inr">INR</option>
            <option value="usd">USD</option>
          </select>
          <button class="btn btn-primary btn-sm" data-action="rates">Call GET /api/rates/{currencyId}</button>
        </div>`;
    case "/api/payment-status":
      return `
        <div class="form inline-form">
          <input type="text" id="explorer-payment-id" placeholder="paymentId" />
          <input type="text" id="explorer-client-order-id" placeholder="clientOrderId" />
          <button class="btn btn-primary btn-sm" data-action="payment-status">Call POST /api/payment-status</button>
        </div>`;
    case "/api/refund":
      return `
        <div class="form">
          <input type="text" id="exp-refund-payment-id" placeholder="paymentId" />
          <input type="text" id="exp-refund-address" placeholder="userRefundAddress" />
          <input type="text" id="exp-refund-amount" placeholder="refundAmount" />
          <input type="text" id="exp-refund-currency" placeholder="currency (XDC)" value="XDC" />
          <input type="text" id="exp-refund-network" placeholder="network" value="Xinfin" />
          <input type="text" id="exp-refund-fiat" placeholder="fiatCurrency" value="inr" />
          <input type="text" id="exp-refund-orig-amount" placeholder="amount" />
          <button class="btn btn-primary btn-sm" data-action="refund">Call POST /api/refund</button>
        </div>`;
    case "/api/wallet-balance":
      return `
        <div class="form inline-form">
          <input type="email" id="explorer-balance-email" placeholder="email" />
          <input type="text" id="explorer-balance-currency" placeholder="currency" value="XDC" />
          <button class="btn btn-primary btn-sm" data-action="wallet-balance">Call POST /api/wallet-balance</button>
        </div>`;
    case "/api/create-wallet":
      return `
        <div class="form">
          <input type="email" id="exp-wallet-email" placeholder="email" />
          <input type="text" id="exp-wallet-currency" placeholder="currency" value="XDC" />
          <input type="text" id="exp-wallet-network" placeholder="network" value="Xinfin" />
          <input type="text" id="exp-wallet-fiat" placeholder="fiatCurrency" value="inr" />
          <button class="btn btn-primary btn-sm" data-action="create-wallet">Call POST /api/create-wallet</button>
        </div>`;
    case "/api/payment":
      return `<p class="hint">Use the <strong>Store</strong> tab checkout, or Orders tab for status/refund.</p>
        <button class="btn btn-secondary btn-sm" onclick="document.querySelector('[data-tab=store]').click()">Go to Store</button>`;
    default:
      return "";
  }
}

async function runExplorerAction(btn) {
  const card = btn.closest(".api-card");
  const path = card.dataset.api;
  const method = card.querySelector(".method").textContent;
  const resultId = `result-${method}-${path.replace(/[^a-z0-9]/gi, "-")}`;
  const resultEl = document.getElementById(resultId);
  resultEl.classList.remove("hidden");
  resultEl.textContent = "Calling…";

  try {
    let result;
    const action = btn.dataset.action;

    switch (action) {
      case "networks":
        result = await storeApi.getNetworks();
        break;
      case "network-with-currency":
        result = await storeApi.getNetworkWithCurrency();
        break;
      case "rates":
        result = await storeApi.getRates(
          document.getElementById("explorer-currency-id").value,
          document.getElementById("explorer-rate-fiat").value || undefined,
        );
        break;
      case "payment-status":
        result = await storeApi.gatewayPaymentStatus({
          paymentId: document.getElementById("explorer-payment-id").value || undefined,
          clientOrderId: document.getElementById("explorer-client-order-id").value || undefined,
        });
        break;
      case "refund":
        result = await storeApi.gatewayRefund({
          paymentId: document.getElementById("exp-refund-payment-id").value,
          userRefundAddress: document.getElementById("exp-refund-address").value,
          refundAmount: document.getElementById("exp-refund-amount").value,
          currency: document.getElementById("exp-refund-currency").value,
          network: document.getElementById("exp-refund-network").value,
          fiatCurrency: document.getElementById("exp-refund-fiat").value,
          amount: document.getElementById("exp-refund-orig-amount").value,
        });
        break;
      case "wallet-balance":
        result = await storeApi.gatewayWalletBalance({
          email: document.getElementById("explorer-balance-email").value,
          currency: document.getElementById("explorer-balance-currency").value,
        });
        break;
      case "create-wallet":
        result = await storeApi.gatewayCreateWallet({
          email: document.getElementById("exp-wallet-email").value,
          currency: document.getElementById("exp-wallet-currency").value,
          network: document.getElementById("exp-wallet-network").value,
          fiatCurrency: document.getElementById("exp-wallet-fiat").value,
        });
        break;
      default:
        result = { message: "Unknown action" };
    }

    resultEl.textContent = JSON.stringify(result, null, 2);
    toast(result.success !== false ? "API call complete" : result.message || "Request failed", result.success !== false ? "success" : "error");
  } catch (e) {
    resultEl.textContent = e.message;
    toast(e.message, "error");
  }
}

// ─── Integration log ─────────────────────────────────────────────────────────

async function loadIntegrationLog() {
  try {
    const [{ data: logs }, { data: webhooks }] = await Promise.all([storeApi.getApiLog(), storeApi.getWebhooks()]);

    document.getElementById("api-log").innerHTML = logs?.length
      ? logs
          .map(
            (l) => `
        <div class="log-entry">
          <div class="log-label">${esc(l.label)}</div>
          <div class="log-meta">${l.at} · HTTP ${l.status} · ${l.success ? "✓" : "✗"} ${esc(l.message || "")}</div>
          <div class="code-block">${esc(JSON.stringify({ request: l.request, response: l.response }, null, 2))}</div>
        </div>`,
          )
          .join("")
      : '<div class="empty-state">No API calls yet.</div>';

    document.getElementById("webhook-log").innerHTML = webhooks?.length
      ? webhooks
          .map(
            (w) => `
        <div class="log-entry">
          <div class="log-label">Webhook</div>
          <div class="log-meta">${w.receivedAt}</div>
          <div class="code-block">${esc(JSON.stringify(w.body, null, 2))}</div>
        </div>`,
          )
          .join("")
      : '<div class="empty-state">No webhooks yet.</div>';
  } catch (e) {
    console.error(e);
  }
}

document.getElementById("refresh-log").addEventListener("click", loadIntegrationLog);

// ─── Webhooks tab ────────────────────────────────────────────────────────────

async function loadWebhooksTab() {
  try {
    const [webhookConfig, webhooksRes] = await Promise.all([
      storeApi.getWebhookConfig(),
      storeApi.getWebhooks(),
    ]);

    const cfg = webhookConfig.data;
    const events = webhooksRes.data || [];

    document.getElementById("webhook-url-display").textContent = cfg.url;
    document.getElementById("webhook-setup-steps").innerHTML = cfg.instructions
      .map((step) => `<li>${esc(step)}</li>`)
      .join("");

    const container = document.getElementById("webhook-events");
    if (!events.length) {
      container.innerHTML =
        '<div class="empty-state">No payment confirmation events yet. Complete a payment on the gateway to receive a webhook.</div>';
      return;
    }

    container.innerHTML = events
      .map((w) => {
        const status = w.status || w.body?.status || "UNKNOWN";
        const isCompleted = status === "COMPLETED";
        const paymentId = w.paymentId || w.body?.id;
        return `
      <div class="webhook-event ${isCompleted ? "webhook-event-completed" : ""}">
        <div class="webhook-event-head">
          <span class="order-status status-${status}">${esc(status)}</span>
          ${w.orderUpdated ? '<span class="badge badge-ok">Order updated</span>' : '<span class="badge badge-warn">Order not matched</span>'}
          <span class="hint">${w.receivedAt}</span>
        </div>
        <div class="webhook-event-body">
          ${paymentId ? `<div><strong>Payment ID:</strong> <code>${esc(paymentId)}</code></div>` : ""}
          ${w.body?.amount ? `<div><strong>Amount:</strong> ${esc(w.body.amount)} ${esc(w.body.fiatCurrency?.toUpperCase())} → ${esc(w.body.currency)}</div>` : ""}
          ${w.body?.transactionHash ? `<div><strong>Tx Hash:</strong> <code>${esc(w.body.transactionHash)}</code></div>` : ""}
          ${w.orderId ? `<div><strong>Demo Order:</strong> <code>${esc(w.orderId)}</code></div>` : ""}
        </div>
        <details class="webhook-details">
          <summary>Raw payload</summary>
          <pre class="code-block">${esc(JSON.stringify(w.body, null, 2))}</pre>
        </details>
      </div>`;
      })
      .join("");
  } catch (e) {
    console.error(e);
    document.getElementById("webhook-events").innerHTML = `<div class="empty-state">Error: ${esc(e.message)}</div>`;
  }
}

document.getElementById("refresh-webhooks")?.addEventListener("click", loadWebhooksTab);

document.getElementById("copy-webhook-url")?.addEventListener("click", async () => {
  const url = document.getElementById("webhook-url-display").textContent;
  try {
    await navigator.clipboard.writeText(url);
    toast("Webhook URL copied");
  } catch {
    toast("Copy failed", "error");
  }
});

// ─── Transaction History tab ─────────────────────────────────────────────────

document.getElementById("history-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("history-email").value;
  const resultDiv = document.getElementById("history-result");
  const tbody = document.getElementById("history-table-body");

  tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1rem;">Loading...</td></tr>';
  resultDiv.classList.remove("hidden");

  try {
    const res = await storeApi.gatewayTransactionHistory({ email });
    if (res.success || res.status) {
      const txs = res.transactions || res.data?.transactions || [];
      if (!txs.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1rem;">No transactions found.</td></tr>';
        return;
      }
      tbody.innerHTML = txs.map((t) => {
        const amount = Number(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
        const fiatAmount = Number(t.fiatAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 0.5rem;">${new Date(t.createdAt).toLocaleString()}</td>
            <td style="padding: 0.5rem;"><span class="badge ${t.transactionType === 'DEPOSIT' ? 'badge-ok' : 'badge-warn'}">${esc(t.transactionType)}</span></td>
            <td style="padding: 0.5rem;"><span class="order-status status-${t.status}">${esc(t.status)}</span></td>
            <td style="padding: 0.5rem;">${amount} ${esc(t.currency)}</td>
            <td style="padding: 0.5rem;">${fiatAmount} ${esc(t.fiatCurrency || 'USD')}</td>
            <td style="padding: 0.5rem;"><code>${esc(t.transactionHash || t.paymentId || '-')}</code></td>
          </tr>
        `;
      }).join('');
      toast("History fetched successfully");
    } else {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 1rem; color: red;">${esc(res.message || "Failed to fetch history")}</td></tr>`;
      toast(res.message || "Failed to fetch history", "error");
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 1rem; color: red;">Error: ${esc(err.message)}</td></tr>`;
    toast(err.message, "error");
  }
});

init();
