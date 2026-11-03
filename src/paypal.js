// Sandbox only. This adapter cannot route requests to production PayPal.
import { amountText } from "./terms.js";
const base = "https://api-m.sandbox.paypal.com";
export class ProviderError extends Error {
  constructor(message, uncertain = false) {
    super(message);
    this.uncertain = uncertain;
  }
}
export function paypal(env = process.env, fetcher = fetch) {
  let token,
    expiry = 0;
  async function access() {
    if (token && Date.now() < expiry) return token;
    const r = await fetcher(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw new ProviderError(
        "PayPal authentication failed. Check server credentials.",
      );
    const j = await r.json();
    token = j.access_token;
    expiry = Date.now() + (j.expires_in - 60) * 1000;
    return token;
  }
  async function request(path, method = "GET", body, id) {
    const t = await access();
    let r;
    try {
      r = await fetcher(base + path, {
        method,
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
          ...(id ? { "PayPal-Request-Id": id } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ProviderError(
        "PayPal response is uncertain. Reconcile before taking further action.",
        true,
      );
    }
    if (!r.ok) {
      throw new ProviderError(
        `PayPal request returned ${r.status}. ${r.status >= 500 ? "Reconciliation required." : "Review the operation before retrying."}`,
        r.status >= 500,
      );
    }
    return r.status === 204 ? {} : r.json();
  }
  return {
    create: (id, amount = 4000, title = "Saturday Clay Club") =>
      request(
        "/v2/checkout/orders",
        "POST",
        {
          intent: "AUTHORIZE",
          purchase_units: [
            {
              reference_id: id,
              custom_id: id,
              description: `Greenlight · ${title.slice(0, 100)} · conditional commitment`,
              amount: { currency_code: "USD", value: amountText(amount) },
            },
          ],
        },
        id,
      ),
    authorize: (id, key) =>
      request(`/v2/checkout/orders/${id}/authorize`, "POST", {}, key),
    capture: (id, key, amount = 4000) =>
      request(
        `/v2/payments/authorizations/${id}/capture`,
        "POST",
        {
          amount: { currency_code: "USD", value: amountText(amount) },
          final_capture: true,
        },
        key,
      ),
    void: (id) => request(`/v2/payments/authorizations/${id}/void`, "POST", {}),
    refund: (id, key) =>
      request(`/v2/payments/captures/${id}/refund`, "POST", {}, key),
    order: (id) => request(`/v2/checkout/orders/${id}`),
    authorization: (id) => request(`/v2/payments/authorizations/${id}`),
    captureDetails: (id) => request(`/v2/payments/captures/${id}`),
    refundDetails: (id) => request(`/v2/payments/refunds/${id}`),
    verify: (body, headers) =>
      request("/v1/notifications/verify-webhook-signature", "POST", {
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: env.PAYPAL_WEBHOOK_ID,
        webhook_event: body,
      }),
  };
}
