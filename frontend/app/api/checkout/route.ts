import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

const PLAN_MAP: Record<string, { priceId: string; credits: number }> = {
  single:      { priceId: process.env.STRIPE_PRICE_SINGLE!,      credits: 1  },
  starter:     { priceId: process.env.STRIPE_PRICE_STARTER!,     credits: 3  },
  course_pack: { priceId: process.env.STRIPE_PRICE_COURSE_PACK!, credits: 7  },
  full_bundle: { priceId: process.env.STRIPE_PRICE_FULL_BUNDLE!, credits: 15 },
};

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan } = await req.json() as { plan?: string };
  if (!plan || !PLAN_MAP[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const { priceId, credits } = PLAN_MAP[plan];
  const origin = req.headers.get("origin") ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/payment/cancel`,
    metadata: {
      user_id: user.id,
      plan,
      credits: String(credits),
    },
  });

  return NextResponse.json({ url: session.url });
}
