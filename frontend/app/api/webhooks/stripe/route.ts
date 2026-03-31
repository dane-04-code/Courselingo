import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

const CREDITS_MAP: Record<string, number> = {
  single:      1,
  starter:     3,
  course_pack: 7,
  full_bundle: 15,
};

export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  const plan    = session.metadata?.plan ?? "";
  const userId  = session.metadata?.user_id ?? "";
  const credits = CREDITS_MAP[plan];

  if (!credits || !userId) {
    console.error("[webhook] missing metadata", session.metadata);
    return NextResponse.json({ received: true });
  }

  const serviceClient = createServiceClient();

  const { data: existing } = await serviceClient
    .from("stripe_payments")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (!existing) {
    await serviceClient.rpc("admin_grant_credits", {
      p_user_id: userId,
      p_amount:  credits,
      p_plan:    plan,
    });

    await serviceClient.from("stripe_payments").insert({
      stripe_session_id: session.id,
      user_id:           userId,
      plan,
      credits_granted:   credits,
    });
  }

  return NextResponse.json({ received: true });
}
