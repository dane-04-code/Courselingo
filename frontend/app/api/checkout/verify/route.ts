import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-03-31.basil",
});

const CREDITS_MAP: Record<string, number> = {
  single:      1,
  starter:     3,
  course_pack: 7,
  full_bundle: 15,
};

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }

  const plan    = session.metadata?.plan ?? "";
  const credits = CREDITS_MAP[plan];
  if (!credits) {
    return NextResponse.json({ error: "Unknown plan in session metadata" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  const { data: existing } = await serviceClient
    .from("stripe_payments")
    .select("id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (!existing) {
    await serviceClient.rpc("admin_grant_credits", {
      p_user_id: user.id,
      p_amount:  credits,
      p_plan:    plan,
    });

    await serviceClient.from("stripe_payments").insert({
      stripe_session_id: sessionId,
      user_id:           user.id,
      plan,
      credits_granted:   credits,
    });
  }

  const { data: creditRow } = await supabase
    .from("user_credits")
    .select("credits_remaining")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({
    plan,
    credits_granted:   credits,
    credits_remaining: creditRow?.credits_remaining ?? null,
  });
}
