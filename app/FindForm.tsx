"use client";

import { useActionState, useRef, useState, startTransition } from "react";
import { startSearch, type StartState } from "./actions";
import styles from "./find.module.css";

const MAX_PHOTOS = 4;
const SHRINK_TO = 1600; // the server shrinks again to 1,024

/** Shrinks a photo in the browser so uploads stay small (and iPhone HEIC becomes JPEG). */
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const k = Math.min(1, SHRINK_TO / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("shrink failed"))), "image/jpeg", 0.85),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const Or = () => (
  <div className={styles.or} aria-hidden="true">
    <span />
    OR
    <span />
  </div>
);

export default function FindForm() {
  const [state, action, pending] = useActionState<StartState, FormData>(startSearch, {});
  const [localError, setLocalError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const busy = pending || preparing;

  async function onPhotos(files: FileList | null) {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!list.length) return;
    setLocalError("");
    setPreparing(true);
    try {
      const fd = new FormData();
      for (const [i, f] of list.slice(0, MAX_PHOTOS).entries()) {
        fd.append("photos", await shrink(f), `photo-${i + 1}.jpg`);
      }
      startTransition(() => action(fd));
    } catch {
      setLocalError("That photo couldn't be opened. Try a screenshot instead.");
    } finally {
      setPreparing(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  const error = localError || state.error;

  return (
    <div className={styles.starts} aria-busy={busy}>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.cardIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <path d="M3.5 8h3.5l2-3h6l2 3h3.5v11h-17z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </div>
          <div className={styles.cardText}>
            <h2 className={styles.cardTitle}>Photo or screenshot</h2>
            <span className={styles.cardHint}>Snap it, or upload up to 4 from your camera roll</span>
          </div>
        </div>
        <div className={styles.photoBtns}>
          <button type="button" className={styles.pillDark} disabled={busy} onClick={() => cameraRef.current?.click()}>
            Take photo
          </button>
          <button type="button" className={styles.pillLight} disabled={busy} onClick={() => uploadRef.current?.click()}>
            Upload
          </button>
        </div>
        <input
          ref={cameraRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => onPhotos(e.target.files)}
        />
        <input
          ref={uploadRef}
          className="visually-hidden"
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => onPhotos(e.target.files)}
        />
      </section>

      <Or />

      <form className={styles.card} action={action}>
        <div className={styles.cardHead}>
          <div className={styles.cardIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
              <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
            </svg>
          </div>
          <div className={styles.cardText}>
            <label htmlFor="link" className={styles.cardTitle}>
              Product link
            </label>
            <span className={styles.cardHint}>Paste from any store or resale site</span>
          </div>
        </div>
        <div className={styles.field}>
          <input id="link" name="link" type="url" inputMode="url" placeholder="https://" required autoComplete="off" />
          <button type="submit" className={styles.go} aria-label="Search this link" disabled={busy}>
            <Arrow />
          </button>
        </div>
      </form>

      <Or />

      <form className={styles.card} action={action}>
        <div className={styles.cardHead}>
          <div className={styles.cardIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16z" />
              <path d="M13.5 6.5l4 4" />
            </svg>
          </div>
          <div className={styles.cardText}>
            <label htmlFor="describe" className={styles.cardTitle}>
              Describe it
            </label>
            <span className={styles.cardHint}>Brand, item, color, anything you know</span>
          </div>
        </div>
        <div className={styles.field}>
          <input id="describe" name="describe" type="text" placeholder="e.g. Sau Lee red off-shoulder gown" required autoComplete="off" />
          <button type="submit" className={styles.go} aria-label="Search this description" disabled={busy}>
            <Arrow />
          </button>
        </div>
      </form>

      {busy && (
        <p className={styles.status} role="status">
          {preparing ? "Preparing your photos…" : "Starting your search…"}
        </p>
      )}
      {error && !busy && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
