"use client";

import { useActionState } from "react";
import { sendSignInLink, type SignInState } from "./actions";
import styles from "./sign-in.module.css";

const initial: SignInState = { status: "idle" };

export default function SignInForm({ linkProblem }: { linkProblem: boolean }) {
  const [state, action, pending] = useActionState(sendSignInLink, initial);

  if (state.status === "sent") {
    return (
      <div className={styles.found} role="status">
        <b>Check your email</b>
        We sent a sign-in link to <strong>{state.email}</strong>. Tap it on this device or any
        other. It can take a minute to arrive; check spam if you don&apos;t see it.
      </div>
    );
  }

  const email = state.status === "error" ? state.email : "";

  return (
    <form action={action} className={styles.form}>
      {linkProblem && state.status === "idle" && (
        <p className={styles.err}>That sign-in link expired or was already used. Send a new one.</p>
      )}
      <label className={styles.field}>
        <span>Your email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={email}
          placeholder="you@example.com"
        />
      </label>
      <div className={styles.row}>
        <button className={styles.btn} type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send my link"}
        </button>
      </div>
      {state.status === "error" && (
        <p className={styles.err} role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
