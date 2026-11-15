import { Suspense } from "react";
import SignInForm from "./SignInForm";
import styles from "./sign-in.module.css";
import ui from "../ui.module.css";

export const metadata = { title: "Sign in · Dupe Dupe" };

async function FormFromLink({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const { error } = await searchParams;
  return <SignInForm linkProblem={error === "link"} />;
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className={styles.page}>
      <div className={`${ui.wordmark} ${styles.mark}`}>DUPE DUPE</div>
      <div className={styles.hero}>
        <h1 className={styles.title}>Replicate the look.</h1>
        <p className={styles.lede}>
          Drop in a piece you love. Get new dupes under budget and secondhand matches, judged on
          look and fit.
        </p>
      </div>
      <Suspense fallback={<SignInForm linkProblem={false} />}>
        <FormFromLink searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
