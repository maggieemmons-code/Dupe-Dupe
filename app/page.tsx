import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.wrap}>
      <header className={styles.header}>
        <span className={styles.brand}>DUPE DUPE</span>
      </header>
      <section className={styles.tag}>
        <p className={styles.eyebrow}>Phase 0 · Setup</p>
        <h1 className={styles.title}>
          Hello <em>Dupe Dupe</em>
        </h1>
        <p className={styles.lede}>
          The app is live. Sign-in and search arrive in the next phases.
        </p>
      </section>
    </main>
  );
}
