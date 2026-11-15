"use client";

import { useActionState, useState } from "react";
import { sendSignInLink, type SignInState } from "./actions";
import styles from "./sign-in.module.css";
import ui from "../ui.module.css";

const initial: SignInState = { status: "idle" };

export default function SignInForm({ linkProblem }: { linkProblem: boolean }) {
  const [state, action, pending] = useActionState(sendSignInLink, initial);
  const [dismissed, setDismissed] = useState<SignInState | null>(null);

  if (state.status === "sent" && dismissed !== state) {
    return (
      <div className={styles.sent} role="status">
        <div className={styles.sentIcon}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
            <path d="M4 7l8 6 8-6" strokeLinecap="round" />
          </svg>
        </div>
        <div className={styles.sentTitle}>Check your inbox</div>
        <div className={styles.sentText}>
          We sent a sign-in link to <strong>{state.email}</strong>. It comes from login@dupedupe.studio.
        </div>
        <button className={ui.btnSmall} type="button" onClick={() => setDismissed(state)}>
          Use a different email
        </button>
      </div>
    );
  }

  const email = state.status === "error" ? state.email : "";

  return (
    <form action={action} className={styles.form}>
      {linkProblem && state.status === "idle" && (
        <p className={ui.error}>That sign-in link expired or was already used. Send a new one.</p>
      )}
      <label htmlFor="email" className={ui.eyebrow}>
        Your email
      </label>
      <input
        id="email"
        className={styles.input}
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={email}
        placeholder="you@example.com"
      />
      <button className={ui.btn} type="submit" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state.status === "error" && (
        <p className={ui.error} role="alert">
          {state.message}
        </p>
      )}
      <p className={styles.fine}>Invite only. The link works on any device.</p>
    </form>
  );
}
