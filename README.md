# Demo Merchant Store — Payment Gateway Integration

## Demo Videos

### Internal Payment Flow
https://github.com/user-attachments/assets/ecc3d754-aa69-4ddf-959b-cfbe08c7fd34

### External Payment Flow
https://github.com/user-attachments/assets/49b627d6-c522-4e06-a3db-cc1b720186c1

A standalone demo project that prototypes a **real merchant integration** with the Crypto Payment Gateway. It simulates how an external e-commerce store would call your gateway APIs from a **server-side backend** (never exposing API secrets in the browser).

## What this demonstrates

All **8 APIs** from [Swagger docs](https://betapg.icotokens.net/api-docs/):

| # | API | Tag | Used in demo |
|---|-----|-----|--------------|
| 1 | `GET /api/networks` | Networks | Rates & Networks tab, catalog on load |
| 2 | `GET /api/network-with-currency` | Network With Currency | Checkout dropdowns, Wallets, Rates tab |
| 3 | `GET /api/rates/{currencyId}` | Rates | Checkout rate preview, Rates tab, quote API |
| 4 | `POST /api/payment` | Payment Request | Store checkout |
| 5 | `POST /api/payment-status` | Payment Status | Orders tab |
| 6 | `POST /api/refund` | Payment Refund | Orders → Refund button |
| 7 | `POST /api/create-wallet` | Generate User Wallet | Wallets tab, API Explorer |
| 8 | `POST /api/wallet-balance` | Retrieve User Wallet | Wallets tab, API Explorer |

## Architecture

```
┌─────────────────────┐         ┌──────────────────────────────┐
│  Demo Store UI      │         │  Crypto Payment Gateway       │
│  (browser)          │         │  http://localhost:3006        │
│  localhost:4000     │         │                               │
└─────────┬───────────┘         │  /api/payment                 │
          │                     │  /api/create-wallet           │
          │  /api/checkout      │  /api/wallet-balance          │
          ▼                     │  /api/payment-status          │
┌─────────────────────┐  HMAC   │  /api/network-with-currency   │
│  Demo Merchant      │────────▶│                               │
│  Backend (Express)  │ signed  └──────────────────────────────┘
│  paymentGatewayClient│                │
└─────────────────────┘                │ redirectUrl
                                       ▼
                              ┌─────────────────────┐
                              │  Payment Page       │
                              │  localhost:3000     │
                              └─────────────────────┘
```

**Key principle:** API key and secret live only in the demo server's `.env`. The browser talks to `/api/checkout`, not directly to the gateway.

## Prerequisites

1. **Crypto Payment Gateway** running locally:
   ```bash
   # From project root
   npm run start
   # Gateway API: http://localhost:3006
   # Payment UI: http://localhost:3000
   ```

2. **Merchant account** with:
   - Email verified
   - OTP / 2FA enabled
   - Service API key generated (Admin → Settings → Service API)
   - Merchant wallet addresses configured (for ERC20/XRC20)

3. **Node.js 18+**

## Quick start

```bash
cd demo-integration

# Install dependencies
npm install

# Configure credentials
cp .env.example .env
# Edit .env with your GATEWAY_API_KEY, GATEWAY_API_SECRET, MERCHANT_ID

# Start demo store
npm start
```

Open **http://localhost:4000**

## Configuration

| Variable | Description |
|----------|-------------|
| `GATEWAY_BASE_URL` | Gateway server (`https://betapg.icotokens.net` or `http://localhost:3006`) |
| `SWAGGER_URL` | Swagger docs URL (default `https://betapg.icotokens.net/api-docs/`) |
| `GATEWAY_API_KEY` | Merchant API key from gateway admin |
| `GATEWAY_API_SECRET` | Plain API secret for HMAC signing |
| `MERCHANT_ID` | Merchant UUID |
| `DEMO_PORT` | Demo store port (default `4000`) |
| `DEMO_STORE_URL` | Public URL of demo store (for success/failure redirects) |
| `PAYMENT_PAGE_URL` | Gateway payment UI URL |

## How signing works (real integration)

The demo uses the same HMAC-SHA256 flow as production:

```javascript
const payload = { ...body, requestURL: "/api/payment", nonce: Date.now() };
const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
const signature = crypto.createHmac("sha256", apiSecret).update(base64Payload).digest("hex");

// Headers sent to gateway:
// wlc-apikey, wlc-signature, wlc-payload
```

See `server/lib/paymentGatewayClient.js` for the full client implementation.

## Demo store tabs

### Store
- Product catalog with **Buy Now**
- Checkout loads **Network With Currency** for network/crypto dropdowns
- Live **rate quote** via `GET /api/rates/{currencyId}` before payment
- Creates payment via `POST /api/payment` → redirects to gateway

### Rates & Networks
- **GET /api/networks** — network list table
- **GET /api/network-with-currency** — networks with currencies & decimals
- **GET /api/rates/{currencyId}** — live rates for ETH, XDC, USDT, USDC, SRX
- Filter by fiat currency (INR, USD, EUR)

### Orders
- Local order history
- **Payment Status** → `POST /api/payment-status`
- **Refund** → `POST /api/refund`

### Wallets
- Create wallet → `POST /api/create-wallet`
- Check balance → `POST /api/wallet-balance`
- Dropdowns from Network With Currency API

### API Explorer
- Interactive forms for **every Swagger endpoint**

### Webhooks (Payment Confirmation)
- Register webhook URL in gateway admin
- Receives `POST /webhooks/payment` when payment is **COMPLETED**
- Automatically marks demo order as **PAID**

### Integration Log
- All server-side signed API calls + raw webhook log

## Webhook setup (payment confirmation)

Register this URL in **gateway admin → Settings → Webhooks**:

```
http://localhost:4000/webhooks/payment
```

When a payment reaches **COMPLETED**, the gateway POSTs to that URL and the demo marks the order as **PAID**.

For local testing use [ngrok](https://ngrok.com): `ngrok http 4000` → register `https://xxxx.ngrok.io/webhooks/payment`.

## API endpoints (demo server)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | Store + gateway config status |
| GET | `/api/products` | Demo product catalog |
| POST | `/api/checkout` | Create payment (calls gateway) |
| GET | `/api/orders` | List local orders |
| POST | `/api/orders/:id/status` | Poll payment status |
| POST | `/api/wallets` | Create user wallet |
| POST | `/api/wallets/balance` | Get wallet balance |
| GET | `/api/gateway/catalog` | Networks + Network With Currency + all Rates |
| GET | `/api/quote` | Fiat→crypto quote using Rates API |
| POST | `/api/orders/:id/refund` | Refund via `POST /api/refund` |
| POST | `/api/gateway/payment` | Direct payment API proxy |
| POST | `/api/gateway/payment-status` | Direct status API proxy |
| POST | `/api/gateway/refund` | Direct refund API proxy |
| POST | `/api/gateway/create-wallet` | Direct create-wallet proxy |
| POST | `/api/gateway/wallet-balance` | Direct wallet-balance proxy |
| GET | `/api/api-log` | Integration debug log |
| POST | `/webhooks/payment` | **Payment confirmation webhook receiver** |
| GET | `/api/webhooks` | List received webhook events |
| GET | `/api/webhooks/config` | Webhook setup info |
| POST | `/webhooks/payment` | Webhook receiver |

## Testing internal payments

1. Create a wallet for a customer (Wallets tab)
2. Fund the wallet on-chain (or use existing balance)
3. Checkout with **Transaction Type: Internal**
4. Gateway validates balance before creating payment

## Related documentation

- [Phase 2 Functionality](../docs/PHASE-2-FUNCTIONALITY.md)
- Gateway Swagger: `http://localhost:3006/api-docs`

## Project structure

```
demo-integration/
├── package.json
├── .env.example
├── README.md
├── server/
│   ├── index.js                  # Merchant backend
│   ├── lib/
│   │   ├── paymentGatewayClient.js  # Signed API client
│   │   └── orderStore.js            # Local order persistence
│   └── data/                     # orders.json, api-log.json (gitignored)
└── public/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── api.js                # Calls demo server only
        └── app.js                # Store UI logic
```
