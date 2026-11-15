"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  CATEGORIES,
  COLORS,
  COLOR_NAMES,
  FIBERS,
  WEAVES,
  STRETCH,
  SIZING,
  FIT_STYLES,
  NECKLINES,
  SLEEVES,
  LENGTHS,
  CLOSURES,
  CARE,
  DETAILS,
  type Anchor,
  type ItemField,
} from "@/lib/fields";
import { SIZES, searchName, type SearchRow } from "@/lib/searches";
import { buildBrief, retryBrief, saveAnchors, saveChoices, saveFields, confirmSearch } from "./actions";
import styles from "./review.module.css";
import ui from "../../ui.module.css";

/* ---------- field rows: every changeable field is a pick from a list ---------- */

type Row =
  | { field: ItemField; label: string; kind: "single"; list: readonly string[]; missing: string }
  | { field: ItemField; label: string; kind: "multi"; list: readonly string[]; missing: string }
  | { field: ItemField; label: string; kind: "text" | "price" | "readonly"; missing: string };

const ROWS: Row[] = [
  { field: "brand", label: "Brand", kind: "text", missing: "Add it to find this exact piece" },
  { field: "style_name", label: "Item", kind: "text", missing: "Add the style name if you know it" },
  { field: "category", label: "Category", kind: "single", list: CATEGORIES, missing: "Pick one to narrow the search" },
  { field: "color", label: "Color", kind: "single", list: COLOR_NAMES, missing: "Pick one for closer matches" },
  { field: "fabrics", label: "Fibers", kind: "multi", list: FIBERS, missing: "Pick them so we can match fabric" },
  { field: "weave", label: "Weave", kind: "single", list: WEAVES, missing: "Pick one so we can match fabric" },
  { field: "composition", label: "Fabric tag", kind: "readonly", missing: "Not on the listing" },
  { field: "stretch", label: "Stretch", kind: "single", list: STRETCH, missing: "Pick one for a closer fit match" },
  { field: "sizing", label: "Sizing", kind: "single", list: SIZING, missing: "Pick one if you know it" },
  { field: "fit_style", label: "Fit", kind: "multi", list: FIT_STYLES, missing: "Pick how it sits on the body" },
  { field: "neckline", label: "Neckline", kind: "single", list: NECKLINES, missing: "Pick one for closer matches" },
  { field: "sleeve", label: "Sleeves", kind: "single", list: SLEEVES, missing: "Pick one for closer matches" },
  { field: "hem", label: "Length", kind: "single", list: LENGTHS, missing: "Pick one for closer matches" },
  { field: "closure", label: "Closure", kind: "single", list: CLOSURES, missing: "Optional" },
  { field: "details", label: "Details", kind: "multi", list: DETAILS, missing: "Optional" },
  { field: "care", label: "Care", kind: "multi", list: CARE, missing: "Optional" },
  { field: "retail_price", label: "Retail price", kind: "price", missing: "Add it to compare savings" },
];

const TAGS: Record<string, { tag: string; note: string; kind: "plain" | "guess" }> = {
  link: { tag: "Link", note: "Read from the product page", kind: "plain" },
  photo: { tag: "Photo", note: "Seen in a photo", kind: "plain" },
  typed: { tag: "Typed", note: "From what you typed", kind: "plain" },
  profile: { tag: "Profile", note: "From your profile", kind: "plain" },
  edited: { tag: "Edited", note: "You changed this", kind: "plain" },
  guess: { tag: "Guess", note: "Please check", kind: "guess" },
};

type Values = Record<ItemField, string | string[] | number | null>;

function initialValues(s: SearchRow): Values {
  return {
    brand: s.brand,
    style_name: s.style_name,
    category: s.category,
    color: s.color,
    color_name: s.color_name,
    composition: s.composition,
    fabrics: s.fabrics,
    weave: s.weave,
    care: s.care,
    fit_style: s.fit_style,
    stretch: s.stretch[0] ?? "",
    sizing: s.sizing,
    neckline: s.neckline,
    sleeve: s.sleeve,
    hem: s.hem,
    closure: s.closure,
    details: s.details,
    retail_price: s.retail_price,
    fit_notes: s.fit_notes,
  };
}

function shown(row: Row, v: Values): string {
  const value = v[row.field];
  if (row.field === "stretch") return value === "None" ? "No stretch" : String(value ?? "");
  if (row.field === "retail_price") return value != null && value !== "" ? `$${value}` : "";
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

const colorHex = (name: string) => COLORS.find((c) => c.name === name)?.hex;

/* ---------- small pieces ---------- */

const Pencil = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </svg>
);

const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const GownIcon = ({ size = 60 }: { size?: number }) => (
  <svg width={size} height={size * 1.2} viewBox="0 0 120 140" fill="#FFFFFF" stroke="#0A0A0A" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
    <path d="M30 32 C45 26 75 26 90 32 L82 62 L106 130 H14 L38 62 Z" />
    <path d="M30 32 C45 40 75 40 90 32 M38 62 H82" fill="none" />
  </svg>
);

function ColorDot({ name }: { name: string }) {
  const hex = colorHex(name);
  if (!hex) return null;
  return <span className={styles.dot} style={{ background: hex }} aria-hidden="true" />;
}

function Original({ search, photoUrl, subtitle, color }: { search: SearchRow; photoUrl: string | null; subtitle: string; color?: string }) {
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
        {color && (
          <span className={styles.colorLine}>
            <ColorDot name={color} />
            {search.color_name || color}
          </span>
        )}
      </div>
    </div>
  );
}

function sourcesLine(s: SearchRow) {
  const bits = [];
  if (s.source_links.length) bits.push("your link");
  if (s.photo_paths.length) bits.push(s.photo_paths.some((p) => p.includes("/link-")) ? "the product photos" : "your photos");
  if (s.pasted_text) bits.push("what you typed");
  return bits.length ? `Read from ${bits.join(", ").replace(/, ([^,]*)$/, " and $1")}` : "";
}

/** Bottom sheet with checkable rows, for pick-any fields. */
function PickSheet({
  title,
  list,
  value,
  onDone,
  onClose,
}: {
  title: string;
  list: readonly string[];
  value: string[];
  onDone: (v: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(value);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sheetHandle} aria-hidden="true" />
        <div className={styles.sheetHead}>
          <span className={styles.sheetTitle}>{title}</span>
          <span className={styles.sheetHint}>Pick any</span>
        </div>
        <div className={styles.sheetList}>
          {list.map((opt) => {
            const on = picked.includes(opt);
            return (
              <label key={opt} className={styles.sheetRow}>
                <span>{opt}</span>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setPicked(on ? picked.filter((x) => x !== opt) : [...picked, opt])}
                />
                <span className={on ? styles.checkOn : styles.check} aria-hidden="true">
                  {on && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        <button className={ui.btn} onClick={() => onDone(list.filter((x) => picked.includes(x)))}>
          Done
        </button>
      </div>
    </div>
  );
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
            We&apos;re reading the fabric, fit and details{search.source_links.length ? " from your link and its photos" : ""}. This
            usually takes 20 to 40 seconds.
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  /* field values and their sources (kept locally so saves show at once) */
  const [values, setValues] = useState<Values>(() => initialValues(search));
  const [sources, setSources] = useState(search.field_sources as Record<string, { from: string; note?: string }>);
  const [stale, setStale] = useState(search.brief_stale);
  const [textEdit, setTextEdit] = useState<{ field: ItemField; draft: string } | null>(null);
  const [sheet, setSheet] = useState<Extract<Row, { kind: "multi" }> | null>(null);
  const detailsRef = useRef<HTMLElement>(null);

  function saveField(field: ItemField, value: string | string[] | number | null) {
    setValues((v) => ({ ...v, [field]: value }));
    const filled = Array.isArray(value) ? value.length > 0 : value !== null && value !== "";
    setSources((s) => {
      const next = { ...s };
      if (filled) next[field] = { from: "edited" };
      else delete next[field];
      return next;
    });
    if (search.brief_built_at) setStale(true);
    startTransition(async () => {
      const r = await saveFields(search.id, { [field]: value });
      if (!r.ok) setError(r.error);
      else setError("");
    });
  }

  /* signature details */
  const [anchors, setAnchors] = useState<Anchor[]>(search.visual_brief?.anchors ?? []);
  const [sigOpen, setSigOpen] = useState(false);
  const [custom, setCustom] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);

  function renameAnchor() {
    if (!renaming) return;
    const label = renaming.draft.trim().slice(0, 60);
    if (label) updateAnchors(anchors.map((a) => (a.id === renaming.id ? { ...a, label } : a)));
    setRenaming(null);
  }

  function updateAnchors(next: Anchor[]) {
    setAnchors(next);
    startTransition(async () => {
      const r = await saveAnchors(search.id, next);
      if (!r.ok) setError(r.error);
    });
  }
  function addAnchor(label: string) {
    const v = label.trim();
    if (v && !anchors.some((a) => a.label.toLowerCase() === v.toLowerCase())) {
      updateAnchors([...anchors, { id: `custom-${v.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`, label: v, dealbreaker: false }]);
    }
  }
  const mustCount = anchors.filter((a) => a.dealbreaker).length;
  const sigSummary = anchors.length
    ? `${anchors.length} found · ${mustCount} must match · ${anchors.map((a) => a.label).join(", ")}`
    : "None yet · Add one if something matters";
  const addable = DETAILS.filter((d) => !anchors.some((a) => a.label.toLowerCase() === d.toLowerCase()));

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

  const router = useRouter();
  const [confirmed, setConfirmed] = useState(search.status === "queued");
  const guesses = ROWS.filter((r) => sources[r.field]?.from === "guess" && shown(r, values)).length;

  return (
    <main className={`${ui.page} ${styles.page} ${styles.withBar}`}>
      {header}

      <div>
        <h1 className={styles.title}>Here&apos;s what we found.</h1>
        <p className={styles.lede}>
          We filled in everything we could. Tap any detail to change it.{" "}
          {guesses ? `Check the ${guesses === 1 ? "one" : guesses} marked Guess.` : "Nothing is a guess."}
        </p>
      </div>

      <Original search={search} photoUrl={photoUrl} subtitle={sourcesLine(search)} color={String(values.color || "")} />

      {/* Search for: view, size and budget */}
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
                pattern="[0-9]*"
                placeholder="—"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
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

      {search.error && search.status !== "failed" && (
        <p className={ui.error} role="status">
          {search.error}
        </p>
      )}

      {stale && (
        <p className={ui.error}>You changed details since we read this piece. We&apos;ll update the search brief when it runs.</p>
      )}

      {/* The details */}
      <section ref={detailsRef} className={styles.details} aria-labelledby="details-h">
        <div className={styles.sectionHead}>
          <h2 id="details-h" className={ui.eyebrow}>
            The details
          </h2>
        </div>

        {/* Signature details: the first item in The details */}
        <div className={styles.sig}>
        <button className={styles.sigHead} aria-expanded={sigOpen} onClick={() => setSigOpen(!sigOpen)}>
          <span className={styles.sigText}>
            <span className={styles.sigTitleRow}>
              <span className={styles.sigTitle}>Signature details</span>
              <span className={styles.optional}>Optional</span>
            </span>
            <span className={styles.sigSummary}>{sigSummary}</span>
          </span>
          <span className={sigOpen ? styles.chevOpen : styles.chev}>
            <Chevron />
          </span>
        </button>

        {sigOpen && (
          <div className={styles.sigBody}>
            <p className={styles.sigNote}>
              We already picked these, so you can skip this. Tap a detail to reword it. Turn on Must match and we reject anything without that detail.
            </p>
            {anchors.map((a, i) => (
              <div key={a.id} className={a.dealbreaker ? styles.anchorOn : styles.anchor}>
                {renaming?.id === a.id ? (
                  <input
                    className={styles.renameInput}
                    aria-label={`Reword ${a.label}`}
                    value={renaming.draft}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    maxLength={60}
                    onChange={(e) => setRenaming({ id: a.id, draft: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        renameAnchor();
                      }
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onBlur={renameAnchor}
                  />
                ) : (
                  <button
                    className={styles.anchorLabel}
                    aria-label={`Reword ${a.label}`}
                    onClick={() => setRenaming({ id: a.id, draft: a.label })}
                  >
                    {a.label}
                    <Pencil />
                  </button>
                )}
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
            {custom !== null ? (
              <input
                className={styles.addInput}
                aria-label="Describe the detail"
                placeholder="e.g. Fold-over off-shoulder band"
                value={custom}
                autoFocus
                maxLength={60}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAnchor(custom);
                    setCustom(null);
                  }
                  if (e.key === "Escape") setCustom(null);
                }}
                onBlur={() => {
                  addAnchor(custom);
                  setCustom(null);
                }}
              />
            ) : (
              <label className={styles.addBtn}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add a detail
                <select
                  className={styles.overlaySelect}
                  aria-label="Add a signature detail"
                  value=""
                  onChange={(e) => {
                    if (e.target.value === "__other") setCustom("");
                    else addAnchor(e.target.value);
                  }}
                >
                  <option value="" disabled>
                    Add a detail
                  </option>
                  {addable.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value="__other">Something else…</option>
                </select>
              </label>
            )}
          </div>
        )}
        </div>



        {ROWS.map((row) => {
          const text = shown(row, values);
          const src = sources[row.field];
          const tag = text ? TAGS[src?.from ?? ""] : undefined;
          const editingText = textEdit?.field === row.field;

          const valueBlock = (
            <span className={styles.fieldValue}>
              <span className={text ? styles.value : styles.valueMissing}>
                {row.field === "color" && text && <ColorDot name={text} />}
                {text || (row.kind === "readonly" ? row.missing : "Not found")}
              </span>
              {row.field === "color" && values.color_name && <span className={styles.subNote}>Store calls it “{String(values.color_name)}”</span>}
              {row.field === "sizing" && values.fit_notes && <span className={styles.subNote}>{String(values.fit_notes)}</span>}
              {row.kind !== "readonly" || text ? (
                <span className={styles.tagLine}>
                  {tag ? (
                    <>
                      <span className={tag.kind === "guess" ? styles.tagGuess : styles.tagPlain}>{tag.tag}</span>
                      {src?.note || tag.note}
                    </>
                  ) : row.kind === "readonly" ? null : (
                    <>
                      <span className={styles.tagMissing}>Missing</span>
                      {row.missing}
                    </>
                  )}
                </span>
              ) : null}
            </span>
          );

          if (editingText && textEdit) {
            return (
              <div key={row.field} className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{row.label}</span>
                <span className={styles.fieldEdit}>
                  <input
                    aria-label={row.label}
                    autoFocus
                    inputMode={row.kind === "price" ? "numeric" : undefined}
                    pattern={row.kind === "price" ? "[0-9]*" : undefined}
                    maxLength={row.kind === "price" ? 6 : 80}
                    value={textEdit.draft}
                    placeholder={row.kind === "price" ? "e.g. 750" : ""}
                    onChange={(e) =>
                      setTextEdit({ field: row.field, draft: row.kind === "price" ? e.target.value.replace(/[^0-9]/g, "") : e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setTextEdit(null);
                      if (e.key === "Enter") {
                        saveField(row.field, row.kind === "price" ? (textEdit.draft ? Number(textEdit.draft) : null) : textEdit.draft.trim());
                        setTextEdit(null);
                      }
                    }}
                  />
                  <span className={styles.editBtns}>
                    <button className={ui.btnSmall} onClick={() => setTextEdit(null)}>
                      Cancel
                    </button>
                    <button
                      className={`${ui.btnSmall} ${styles.saveBtn}`}
                      onClick={() => {
                        saveField(row.field, row.kind === "price" ? (textEdit.draft ? Number(textEdit.draft) : null) : textEdit.draft.trim());
                        setTextEdit(null);
                      }}
                    >
                      Save
                    </button>
                  </span>
                </span>
              </div>
            );
          }

          return (
            <div key={row.field} className={styles.fieldRow}>
              <span className={styles.fieldLabel}>{row.label}</span>
              {valueBlock}
              {row.kind === "single" && (
                <>
                  <span className={styles.pencil} aria-hidden="true">
                    <Chevron />
                  </span>
                  {/* An invisible picker over the row: tapping anywhere opens the phone's scroll wheel. */}
                  <select
                    className={styles.overlaySelect}
                    aria-label={`Change ${row.label.toLowerCase()}`}
                    value={String(values[row.field] ?? "")}
                    onChange={(e) => saveField(row.field, e.target.value)}
                  >
                    <option value="">Not sure</option>
                    {row.list.map((opt) => (
                      <option key={opt} value={opt}>
                        {row.field === "stretch" && opt === "None" ? "No stretch" : opt}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {row.kind === "multi" && (
                <button className={styles.rowButton} aria-label={`Change ${row.label.toLowerCase()}`} onClick={() => setSheet(row)}>
                  <span className={styles.pencil} aria-hidden="true">
                    <Chevron />
                  </span>
                </button>
              )}
              {(row.kind === "text" || row.kind === "price") && (
                <button
                  className={styles.pencilBtn}
                  aria-label={`Edit ${row.label.toLowerCase()}`}
                  onClick={() => setTextEdit({ field: row.field, draft: values[row.field] == null ? "" : String(values[row.field]) })}
                >
                  <Pencil />
                </button>
              )}
              {row.kind === "readonly" && <span aria-hidden="true" />}
            </div>
          );
        })}
      </section>

      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}

      {sheet && (
        <PickSheet
          title={sheet.label}
          list={sheet.list}
          value={(values[sheet.field] as string[]) ?? []}
          onClose={() => setSheet(null)}
          onDone={(v) => {
            saveField(sheet.field, v);
            setSheet(null);
          }}
        />
      )}

      {/* Sticky bottom bar */}
      <div className={styles.bottomBar}>
        {confirmed ? (
          <p className={styles.confirmed} role="status">
            Starting the search…
          </p>
        ) : (
          <>
            <button
              className={ui.btnSecondary}
              style={{ flex: 1 }}
              onClick={() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              Fix details
            </button>
            <button
              className={ui.btn}
              style={{ flex: 1.6 }}
              disabled={pending || textEdit !== null}
              onClick={() =>
                startTransition(async () => {
                  const r = await confirmSearch(search.id);
                  if (!r.ok) return setError(r.error);
                  setConfirmed(true);
                  router.refresh(); // the page turns into Results
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
