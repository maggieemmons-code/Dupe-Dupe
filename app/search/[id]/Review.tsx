"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CATEGORIES, type Anchor, type ItemField } from "@/lib/fields";
import { SIZES, searchName, type SearchRow } from "@/lib/searches";
import { buildBrief, retryBrief, saveAnchors, saveChoices, saveFields, confirmSearch } from "./actions";
import styles from "./review.module.css";
import ui from "../../ui.module.css";

/* ---------- field rows ---------- */

type Row = { field: ItemField; label: string; missingNote: string };

const ROWS: Row[] = [
  { field: "brand", label: "Brand", missingNote: "Add it to find this exact piece" },
  { field: "style_name", label: "Item", missingNote: "Add the style name if you know it" },
  { field: "category", label: "Category", missingNote: "Pick one to narrow the search" },
  { field: "color", label: "Color", missingNote: "Add it for closer matches" },
  { field: "composition", label: "Fabric", missingNote: "Add it so we can match fabric" },
  { field: "fit_notes", label: "Fit", missingNote: "Add how it fits if you know" },
  { field: "stretch", label: "Stretch", missingNote: "Add it for a closer fit match" },
  { field: "neckline", label: "Neckline", missingNote: "Add it for closer matches" },
  { field: "sleeve", label: "Sleeves", missingNote: "Add it for closer matches" },
  { field: "hem", label: "Length", missingNote: "Add it for closer matches" },
  { field: "closure", label: "Closure", missingNote: "Optional" },
  { field: "features", label: "Details", missingNote: "Optional" },
  { field: "retail_price", label: "Retail price", missingNote: "Add it to compare savings" },
];

const TAGS: Record<string, { tag: string; note: string; kind: "plain" | "guess" }> = {
  link: { tag: "Link", note: "Read from the product page", kind: "plain" },
  photo: { tag: "Photo", note: "Seen in your photo", kind: "plain" },
  typed: { tag: "Typed", note: "From what you typed", kind: "plain" },
  profile: { tag: "Profile", note: "From your profile", kind: "plain" },
  edited: { tag: "Edited", note: "You changed this", kind: "plain" },
  guess: { tag: "Guess", note: "Please check", kind: "guess" },
};

function displayValue(s: SearchRow, field: ItemField): string {
  switch (field) {
    case "composition": {
      const extra = s.fabrics.filter((f) => !s.composition.toLowerCase().includes(f.toLowerCase()));
      return [s.composition, extra.join(", ")].filter(Boolean).join(" · ");
    }
    case "fit_notes":
      return s.fit_notes || s.fit_style.join(", ");
    case "stretch":
      return s.stretch.length ? (s.stretch.join(", ") === "None" ? "No stretch" : s.stretch.join(", ")) : "";
    case "retail_price":
      return s.retail_price != null ? `$${s.retail_price}` : "";
    default: {
      const v = s[field];
      return Array.isArray(v) ? v.join(", ") : String(v ?? "");
    }
  }
}

function editValue(s: SearchRow, field: ItemField): string {
  const v = s[field];
  if (Array.isArray(v)) return v.join(", ");
  return v == null ? "" : String(v);
}

function sourceFor(s: SearchRow, field: ItemField) {
  if (field === "composition") return s.field_sources.composition ?? s.field_sources.fabrics;
  if (field === "fit_notes") return s.field_sources.fit_notes ?? s.field_sources.fit_style;
  return s.field_sources[field];
}

/* ---------- small pieces ---------- */

const Pencil = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </svg>
);

const GownIcon = ({ size = 60 }: { size?: number }) => (
  <svg width={size} height={size * 1.2} viewBox="0 0 120 140" fill="#FFFFFF" stroke="#0A0A0A" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
    <path d="M30 32 C45 26 75 26 90 32 L82 62 L106 130 H14 L38 62 Z" />
    <path d="M30 32 C45 40 75 40 90 32 M38 62 H82" fill="none" />
  </svg>
);

function Original({ search, photoUrl, subtitle }: { search: SearchRow; photoUrl: string | null; subtitle: string }) {
  return (
    <div className={styles.original}>
      <div className={styles.originalTile}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="Your original" />
        ) : (
          <GownIcon />
        )}
      </div>
      <div className={styles.originalText}>
        <span className={styles.eyebrowSmall}>Your original</span>
        <span className={styles.originalName}>{searchName(search)}</span>
        <span className={styles.meta}>{subtitle}</span>
        {search.color && <span className={styles.meta}>{search.color}</span>}
      </div>
    </div>
  );
}

function sourcesLine(s: SearchRow) {
  const bits = [];
  if (s.source_links.length) bits.push("your link");
  if (s.photo_paths.length) bits.push(s.photo_paths.length > 1 ? "your photos" : "your photo");
  if (s.pasted_text) bits.push("what you typed");
  return bits.length ? `Read from ${bits.join(", ").replace(/, ([^,]*)$/, " and $1")}` : "";
}

/* ---------- the screen ---------- */

export default function Review({ search, photoUrl }: { search: SearchRow; photoUrl: string | null }) {
  const router = useRouter();
  const [briefError, setBriefError] = useState("");
  const started = useRef(false);

  const reading = search.status === "new" || search.status === "briefing";

  // Run the brief builder once when a new search opens; poll while another tab runs it.
  useEffect(() => {
    if (search.status === "new" && !started.current) {
      started.current = true;
      buildBrief(search.id).then((r) => {
        if (!r.ok) setBriefError(r.error);
        router.refresh();
      });
    }
    if (search.status === "briefing") {
      const t = setInterval(() => router.refresh(), 2500);
      return () => clearInterval(t);
    }
  }, [search.status, search.id, router]);

  const header = (
    <header className={ui.topbar}>
      <Link href="/" className={ui.iconBtn} aria-label="Back to Find">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
      </Link>
      <div className={ui.screenTitle}>Review</div>
      <div style={{ width: 44 }} aria-hidden="true" />
    </header>
  );

  if (reading) {
    return (
      <main className={`${ui.page} ${styles.page}`}>
        {header}
        <div>
          <h1 className={styles.title}>Reading your piece…</h1>
          <p className={styles.lede}>
            We&apos;re reading the fabric, fit and details{search.source_links.length ? " from your link" : ""}. This
            usually takes 15 to 30 seconds.
          </p>
        </div>
        <Original search={search} photoUrl={photoUrl} subtitle="Reading now" />
        <div className={styles.bar} role="progressbar" aria-label="Reading your piece" />
      </main>
    );
  }

  if (search.status === "failed") {
    return (
      <main className={`${ui.page} ${styles.page}`}>
        {header}
        <h1 className={styles.title}>We couldn&apos;t read this one.</h1>
        <p className={ui.error} role="alert">
          {briefError || "Something went wrong reading this piece. Try again, or start over with a photo or a few words."}
        </p>
        <div className={styles.rowBtns}>
          <button
            className={ui.btn}
            onClick={async () => {
              await retryBrief(search.id);
              router.refresh();
            }}
          >
            Try again
          </button>
          <Link href="/" className={ui.btnSecondary}>
            Start over
          </Link>
        </div>
      </main>
    );
  }

  return <ReviewForm key={search.id} search={search} photoUrl={photoUrl} header={header} />;
}

function ReviewForm({ search, photoUrl, header }: { search: SearchRow; photoUrl: string | null; header: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  /* field editing */
  const [editing, setEditing] = useState<Set<ItemField>>(new Set());
  const [drafts, setDrafts] = useState<Partial<Record<ItemField, string>>>({});
  const detailsRef = useRef<HTMLDivElement>(null);

  function openEdit(fields: ItemField[]) {
    setEditing((prev) => new Set([...prev, ...fields]));
    setDrafts((prev) => {
      const next = { ...prev };
      for (const f of fields) if (next[f] === undefined) next[f] = editValue(search, f);
      return next;
    });
  }
  function cancelEdit() {
    setEditing(new Set());
    setDrafts({});
  }
  function saveEdits() {
    const changed: Partial<Record<ItemField, string>> = {};
    for (const f of editing) if ((drafts[f] ?? "") !== editValue(search, f)) changed[f] = drafts[f] ?? "";
    if (!Object.keys(changed).length) return cancelEdit();
    startTransition(async () => {
      const r = await saveFields(search.id, changed);
      if (!r.ok) return setError(r.error);
      setError("");
      cancelEdit();
      router.refresh();
    });
  }

  /* signature details */
  const [anchors, setAnchors] = useState<Anchor[]>(search.visual_brief?.anchors ?? []);
  const [sigOpen, setSigOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function updateAnchors(next: Anchor[]) {
    setAnchors(next);
    startTransition(async () => {
      const r = await saveAnchors(search.id, next);
      if (!r.ok) setError(r.error);
    });
  }
  function commitDraft() {
    const v = draft.trim();
    if (v && !anchors.some((a) => a.label.toLowerCase() === v.toLowerCase())) {
      updateAnchors([...anchors, { id: `custom-${Date.now()}`, label: v, dealbreaker: false }]);
    }
    setAdding(false);
    setDraft("");
  }
  const mustCount = anchors.filter((a) => a.dealbreaker).length;
  const sigSummary = anchors.length
    ? `${anchors.length} found · ${mustCount} must match · ${anchors.map((a) => a.label).join(", ")}`
    : "None yet · Add one if something matters";

  /* choices */
  const [view, setView] = useState(search.view);
  const [budget, setBudget] = useState(search.budget != null ? String(search.budget) : "");
  const [sizes, setSizes] = useState<string[]>(search.sizes);
  const [sizesOpen, setSizesOpen] = useState(false);

  function save(choices: Parameters<typeof saveChoices>[1]) {
    startTransition(async () => {
      const r = await saveChoices(search.id, choices);
      if (!r.ok) setError(r.error);
    });
  }

  /* confirm */
  const [confirmed, setConfirmed] = useState(search.status === "queued");

  const guesses = ROWS.filter((r) => sourceFor(search, r.field)?.from === "guess" && displayValue(search, r.field)).length;

  return (
    <main className={`${ui.page} ${styles.page} ${styles.withBar}`}>
      {header}

      <div>
        <h1 className={styles.title}>Here&apos;s what we found.</h1>
        <p className={styles.lede}>
          We filled in everything we could from your {search.source_links.length ? "link, " : ""}
          {search.photo_paths.length ? "photos, " : ""}notes and profile.{" "}
          {guesses ? `Check the ${guesses === 1 ? "one" : guesses} marked Guess.` : "Nothing is a guess."}
        </p>
      </div>

      <Original search={search} photoUrl={photoUrl} subtitle={sourcesLine(search)} />

      {search.brief_stale && (
        <p className={ui.error}>You changed details since we read this piece. We&apos;ll update the search brief when it runs.</p>
      )}

      {/* The details */}
      <section ref={detailsRef} className={styles.details} aria-labelledby="details-h">
        <div className={styles.sectionHead}>
          <h2 id="details-h" className={ui.eyebrow}>
            The details
          </h2>
          {editing.size < ROWS.length && (
            <button className={styles.textBtn} onClick={() => openEdit(ROWS.map((r) => r.field))}>
              Edit all
            </button>
          )}
        </div>

        {ROWS.map((row) => {
          const value = displayValue(search, row.field);
          const src = sourceFor(search, row.field);
          const tag = value ? TAGS[src?.from ?? ""] : undefined;
          const isEditing = editing.has(row.field);
          return (
            <div key={row.field} className={styles.fieldRow}>
              <span className={styles.fieldLabel}>{row.label}</span>
              {isEditing ? (
                <span className={styles.fieldEdit}>
                  {row.field === "category" ? (
                    <select
                      aria-label={row.label}
                      value={drafts[row.field] ?? ""}
                      onChange={(e) => setDrafts({ ...drafts, [row.field]: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label={row.label}
                      inputMode={row.field === "retail_price" ? "decimal" : undefined}
                      value={drafts[row.field] ?? ""}
                      placeholder={row.field === "retail_price" ? "e.g. 750" : ""}
                      onChange={(e) => setDrafts({ ...drafts, [row.field]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdits();
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                  )}
                </span>
              ) : (
                <span className={styles.fieldValue}>
                  <span className={value ? styles.value : styles.valueMissing}>{value || "Not found"}</span>
                  <span className={styles.tagLine}>
                    {tag ? (
                      <>
                        <span className={tag.kind === "guess" ? styles.tagGuess : styles.tag}>{tag.tag}</span>
                        {src?.note || tag.note}
                      </>
                    ) : (
                      <>
                        <span className={styles.tagMissing}>Missing</span>
                        {row.missingNote}
                      </>
                    )}
                  </span>
                </span>
              )}
              {!isEditing && (
                <button className={styles.pencil} aria-label={`Edit ${row.label.toLowerCase()}`} onClick={() => openEdit([row.field])}>
                  <Pencil />
                </button>
              )}
            </div>
          );
        })}

        {editing.size > 0 && (
          <div className={styles.editBar}>
            <button className={ui.btnSmall} onClick={cancelEdit} disabled={pending}>
              Cancel
            </button>
            <button className={`${ui.btnSmall} ${styles.saveBtn}`} onClick={saveEdits} disabled={pending}>
              {pending ? "Saving…" : "Save details"}
            </button>
          </div>
        )}
      </section>

      {/* Signature details */}
      <section className={styles.sig}>
        <button className={styles.sigHead} aria-expanded={sigOpen} onClick={() => setSigOpen(!sigOpen)}>
          <span className={styles.sigText}>
            <span className={styles.sigTitleRow}>
              <span className={styles.sigTitle}>Signature details</span>
              <span className={styles.optional}>Optional</span>
            </span>
            <span className={styles.sigSummary}>{sigSummary}</span>
          </span>
          <svg className={sigOpen ? styles.chevOpen : styles.chev} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {sigOpen && (
          <div className={styles.sigBody}>
            <p className={styles.sigNote}>
              We already picked these, so you can skip this. Turn on Must match and we reject anything without that detail.
            </p>
            {anchors.map((a, i) => (
              <div key={a.id} className={a.dealbreaker ? styles.anchorOn : styles.anchor}>
                <span className={styles.anchorLabel}>{a.label}</span>
                <span className={styles.mustLabel}>Must match</span>
                <button
                  role="switch"
                  aria-checked={a.dealbreaker}
                  aria-label={`Must match: ${a.label}`}
                  className={a.dealbreaker ? styles.switchOn : styles.switch}
                  onClick={() => updateAnchors(anchors.map((x, j) => (j === i ? { ...x, dealbreaker: !x.dealbreaker } : x)))}
                >
                  <span />
                </button>
                <button className={styles.remove} aria-label={`Remove ${a.label}`} onClick={() => updateAnchors(anchors.filter((_, j) => j !== i))}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
            {adding ? (
              <input
                className={styles.addInput}
                aria-label="Add a signature detail"
                placeholder="e.g. Corset lacing at the back"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitDraft();
                  }
                  if (e.key === "Escape") {
                    setAdding(false);
                    setDraft("");
                  }
                }}
                onBlur={commitDraft}
              />
            ) : (
              <button className={styles.addBtn} onClick={() => setAdding(true)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add a detail
              </button>
            )}
          </div>
        )}
      </section>

      {/* Search for */}
      <section className={styles.choices}>
        <h2 className={ui.eyebrow}>Search for</h2>
        <div className={styles.segmented}>
          {(
            [
              ["all", "All by price"],
              ["new", "New only"],
              ["used", "Secondhand"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              aria-pressed={view === v}
              className={view === v ? styles.segOn : styles.seg}
              onClick={() => {
                setView(v);
                save({ view: v });
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles.tiles}>
          <button className={styles.tile} onClick={() => setSizesOpen(!sizesOpen)} aria-expanded={sizesOpen}>
            <span className={styles.tileLabel}>Your sizes{sizes.length ? " · for this search" : ""}</span>
            <span className={sizes.length ? styles.tileValue : styles.tileValueMissing}>{sizes.length ? sizes.join(" · ") : "Missing"}</span>
            <span className={styles.tileAction}>{sizes.length ? "Change" : "Add your size"}</span>
          </button>
          <div className={styles.tile}>
            <label htmlFor="budget" className={styles.tileLabel}>
              Most you&apos;d spend · new dupes
            </label>
            <span className={styles.budget}>
              $
              <input
                id="budget"
                type="text"
                inputMode="numeric"
                placeholder="—"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={() => save({ budget })}
              />
            </span>
            <span className={styles.tileHint}>{search.budget != null ? "Your last budget" : "Leave blank for no cap"}</span>
          </div>
        </div>

        {sizesOpen && (
          <div className={styles.sizePicker}>
            <div className={styles.sizeChips}>
              {SIZES.map((sz) => {
                const on = sizes.includes(sz);
                return (
                  <button
                    key={sz}
                    aria-pressed={on}
                    className={on ? styles.sizeOn : styles.size}
                    onClick={() => setSizes(on ? sizes.filter((x) => x !== sz) : [...sizes, sz])}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
            <button
              className={`${ui.btnSmall} ${styles.saveBtn}`}
              onClick={() => {
                save({ sizes });
                setSizesOpen(false);
              }}
            >
              Save sizes
            </button>
          </div>
        )}
      </section>

      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}

      {/* Sticky bottom bar */}
      <div className={styles.bottomBar}>
        {confirmed ? (
          <p className={styles.confirmed} role="status">
            Saved. Searching arrives in the next phase.
          </p>
        ) : (
          <>
            <button
              className={ui.btnSecondary}
              style={{ flex: 1 }}
              onClick={() => {
                openEdit(ROWS.map((r) => r.field));
                detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              Fix details
            </button>
            <button
              className={ui.btn}
              style={{ flex: 1.6 }}
              disabled={pending || editing.size > 0}
              onClick={() =>
                startTransition(async () => {
                  const r = await confirmSearch(search.id);
                  if (!r.ok) return setError(r.error);
                  setConfirmed(true);
                })
              }
            >
              Looks right, search
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </>
        )}
      </div>
    </main>
  );
}
