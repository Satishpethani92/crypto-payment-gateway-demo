/** Maps payment currency symbols to gateway currencyId (for GET /api/rates/{currencyId}) */
const SYMBOL_TO_CURRENCY_ID = {
  XDC: "xdce-crowd-sale",
  ETH: "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
  SRX: "storx",
};

const CURRENCY_ID_TO_SYMBOL = Object.fromEntries(
  Object.entries(SYMBOL_TO_CURRENCY_ID).map(([k, v]) => [v, k]),
);

const SUPPORTED_CURRENCY_IDS = Object.values(SYMBOL_TO_CURRENCY_ID);

function symbolToCurrencyId(symbol) {
  return SYMBOL_TO_CURRENCY_ID[String(symbol).toUpperCase()] || null;
}

function currencyIdToSymbol(currencyId) {
  return CURRENCY_ID_TO_SYMBOL[currencyId] || currencyId?.toUpperCase();
}

/** Normalize network-with-currency item name (xdc) to payment API symbol (XDC) */
function normalizeCurrencyName(name) {
  return String(name).toUpperCase();
}

module.exports = {
  SYMBOL_TO_CURRENCY_ID,
  SUPPORTED_CURRENCY_IDS,
  symbolToCurrencyId,
  currencyIdToSymbol,
  normalizeCurrencyName,
};
