"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string; email: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendSignInLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!EMAIL.test(email)) {
    return { status: "error", email, message: "Enter your full email address." };
  }

  const h = await headers();
  const origin =
    h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm`, shouldCreateUser: true },
  });

  if (!error) return { status: "sent", email };

  // The gatekeeper in the database turns away emails that aren't on the invite list.
  if (error.status === 403 || /invite-only/i.test(error.message)) {
    return {
      status: "error",
      email,
      message:
        "Dupe Dupe is invite-only for now. If you think you were invited, check the email address with Maggie.",
    };
  }

  if (error.status === 429) {
    return {
      status: "error",
      email,
      message: "Too many sign-in emails just now. Wait a minute, then try again.",
    };
  }

  console.error("Sign-in link failed", error.status, error.message);
  return {
    status: "error",
    email,
    message: "We couldn't send your link. Try again in a moment.",
  };
}
