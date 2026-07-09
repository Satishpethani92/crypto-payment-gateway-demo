const crypto = require("crypto");

/**
 * Client for Crypto Payment Gateway merchant APIs.
 * Mirrors real server-side integration: HMAC-SHA256 signed requests.
 *
 * @see docs/PHASE-2-FUNCTIONALITY.md
 * @see server/middleware/ServiceMiddleware/auth.middleware.ts
 */
class PaymentGatewayClient {
  constructor({ baseUrl, apiKey, apiSecret, merchantId }) {
    if (!baseUrl || !apiKey || !apiSecret) {
      throw new Error("baseUrl, apiKey, and apiSecret are required");
    }
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.merchantId = merchantId;
  }

  /**
   * Build signed headers for authenticated gateway requests.
   */
  signRequest(requestURL, body = {}) {
    const payload = {
      ...body,
      requestURL,
      nonce: Date.now(),
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
    const signature = crypto.createHmac("sha256", this.apiSecret).update(base64Payload).digest("hex");

    return {
      payload,
      base64Payload,
      signature,
      headers: {
        "Content-Type": "application/json",
        "wlc-apikey": this.apiKey,
        "wlc-signature": signature,
        "wlc-payload": base64Payload,
      },
    };
  }

  async request(method, path, body = {}) {
    const signed =
      method === "GET" ? this.signRequest(path, { requestURL: path, nonce: Date.now() }) : this.signRequest(path, body);

    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: signed.headers,
    };

    if (method !== "GET") {
      options.body = JSON.stringify(signed.payload);
    }

    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    return {
      ok: response.ok,
      status: response.status,
      data,
      request: {
        method,
        url,
        path,
        body: signed.payload,
      },
    };
  }

  /** Public — no auth required */
  async getNetworks() {
    const url = `${this.baseUrl}/api/networks`;
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data, request: { method: "GET", url, path: "/api/networks" } };
  }

  async getNetworkWithCurrency() {
    return this.request("GET", "/api/network-with-currency");
  }

  async getCurrencyRate(currencyId, fiatFilter = []) {
    const path = `/api/rates/${currencyId}`;
    const query =
      fiatFilter.length > 0 ? `?${fiatFilter.map((f) => `rate=${encodeURIComponent(f)}`).join("&")}` : "";
    const signed = this.signRequest(path);

    const url = `${this.baseUrl}${path}${query}`;
    const response = await fetch(url, { method: "GET", headers: signed.headers });
    const data = await response.json().catch(() => ({}));

    return {
      ok: response.ok,
      status: response.status,
      data,
      request: { method: "GET", url, path, body: signed.payload },
    };
  }

  async createPayment({
    email,
    amount,
    currency,
    fiatCurrency,
    network,
    transactionType,
    clientOrderId,
    successUrl,
    failureUrl,
    description,
    metadata = {},
    otp,
  }) {
    return this.request("POST", "/api/payment", {
      email,
      amount: String(amount),
      currency,
      fiatCurrency,
      network,
      transactionType,
      clientOrderId,
      successUrl,
      failureUrl,
      description,
      metadata,
      ...(otp ? { otp } : {}),
    });
  }

  async confirmInternalPayment({ tokenId, otp }) {
    return this.request("POST", "/api/payment/confirm-internal", {
      tokenId,
      ...(otp ? { otp } : {}),
    });
  }

  async getPaymentStatus({ paymentId, clientOrderId }) {
    return this.request("POST", "/api/payment-status", {
      ...(paymentId ? { paymentId } : {}),
      ...(clientOrderId ? { clientOrderId } : {}),
    });
  }

  async createWallet({ email, currency, fiatCurrency, network, otp }) {
    return this.request("POST", "/api/create-wallet", {
      merchantId: this.merchantId,
      email,
      currency,
      fiatCurrency,
      network,
      ...(otp ? { otp } : {}),
    });
  }

  async getWalletBalance({ email, currency }) {
    return this.request("POST", "/api/wallet-balance", {
      email,
      currency,
    });
  }

  async getUserTransactionHistory({ email }) {
    return this.request("POST", "/api/transaction-history", {
      email,
    });
  }

  async createRefund({
    paymentId,
    currency,
    fiatCurrency,
    network,
    userRefundAddress,
    refundAmount,
    amount,
  }) {
    return this.request("POST", "/api/refund", {
      paymentId,
      currency,
      fiatCurrency,
      network,
      userRefundAddress,
      refundAmount: String(refundAmount),
      amount: String(amount),
    });
  }

  async getUser2FAStatus({ email }) {
    return this.request("POST", "/api/user-2fa-status", { email });
  }

  async generateUserOTP({ email }) {
    return this.request("POST", "/api/user-otp/generate", { email });
  }

  async verifyUserOTP({ email, token }) {
    return this.request("POST", "/api/user-otp/verify", { email, token });
  }

  /**
   * Helper used by demo store — sign via gateway's create-payload endpoint.
   * Useful when you only have api secret and want to verify signing locally.
   */
  static signPayloadLocally(apiSecret, body, requestURL) {
    const payload = { ...body, requestURL, nonce: Date.now() };
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
    const signature = crypto.createHmac("sha256", apiSecret).update(base64Payload).digest("hex");
    return { payload, base64Payload, signature };
  }
}

module.exports = { PaymentGatewayClient };
