import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

export function stripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getPriceIdForPlan(planKey: string): string | null {
  switch (planKey) {
    case "basic":
      return process.env.STRIPE_PRICE_ID_BASIC || null;
    case "pro":
      return process.env.STRIPE_PRICE_ID_PRO || null;
    case "enterprise":
      return process.env.STRIPE_PRICE_ID_ENTERPRISE || null;
    default:
      return null;
  }
}

export function getPlanKeyForPriceId(priceId: string): string | null {
  if (process.env.STRIPE_PRICE_ID_ENTERPRISE === priceId) return "enterprise";
  if (process.env.STRIPE_PRICE_ID_PRO === priceId) return "pro";
  if (process.env.STRIPE_PRICE_ID_BASIC === priceId) return "basic";
  return null;
}
