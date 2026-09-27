"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseClient, getSupabaseConfigurationError } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabaseClient = getSupabaseClient();

  if (getSupabaseConfigurationError()) {
    return (
      <div className="min-h-screen bg-[#0b0b0c] px-4 py-6 text-slate-100">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-2xl font-black text-white">Supabase configuration needed</h1>
          <p className="mt-3 text-sm leading-6 text-red-100">
            {getSupabaseConfigurationError()}
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabaseClient || !email.trim()) {
      setMessage("Please enter your email address.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setIsSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Password reset email sent. Check your inbox and follow the link to set a new password.");
  }

  return (
    <div className="min-h-screen bg-[#0b0b0c] px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-[#111214] p-6 shadow-xl shadow-black/20">
        <p className="text-xs uppercase tracking-[0.38em] text-amber-300">Skate Mastery</p>
        <h1 className="mt-3 text-3xl font-black text-white">Reset your password</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Enter the email address for your account and we&apos;ll send a reset link.
        </p>

        <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-amber-400 px-5 py-3 font-bold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-400/60"
          >
            {isSubmitting ? "Sending..." : "Send reset link"}
          </button>
        </form>

        {message && <p className="mt-4 text-sm text-amber-100">{message}</p>}

        <Link
          href="/"
          className="mt-5 inline-block text-sm font-medium text-slate-300 underline decoration-white/20 underline-offset-4 hover:text-white"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
