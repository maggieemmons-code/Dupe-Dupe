import { Suspense } from "react";
import SignInForm from "./SignInForm";
import styles from "./sign-in.module.css";

export const metadata = { title: "Sign in · Dupe Dupe" };

async function FormFromLink({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const { error } = await searchParams;
  return <SignInForm linkProblem={error === "link"} />;
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className={styles.wrap}>
      <header className={styles.header}>
        <span className={styles.brand}>DUPE DUPE</span>
      </header>
      <section className={styles.tag}>
        <p className={styles.eyebrow}>Invite only</p>
        <h1 className={styles.title}>
          Find the look.
          <br />
          <em>New or secondhand.</em>
        </h1>
        <p className={styles.lede}>
          Enter the email you were invited with and we&apos;ll send you a link. No password
          needed.
        </p>
        <Suspense fallback={<SignInForm linkProblem={false} />}>
          <FormFromLink searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}
