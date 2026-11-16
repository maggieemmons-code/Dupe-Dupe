/*
 * The progress bar on Results while a search runs (Maggie, Nov 15). Plain module:
 * the search job writes counts on the search (migration 0010), and this turns the
 * status plus those counts into how full the bar is and one line of real numbers.
 */

export type Progress = {
  /** Reading the piece (brief builder): 1 opening the page, 2 the photos, 3 writing the search details. */
  brief_step?: number;
  sources?: number;
  sources_done?: number;
  found?: number;
  to_screen?: number;
  screened?: number;
  picked?: number;
  to_judge?: number;
  judged?: number;
};

/** Each stage owns a stretch of the bar; the counts move it within that stretch. */
const STRETCH: Record<string, [number, number]> = {
  // Edit details: the brief is rebuilt from the friend's edits first.
  new: [0, 2],
  briefing: [0, 2],
  review: [2, 3],
  queued: [0, 3],
  gathering: [3, 30],
  screening: [30, 62],
  enriching: [62, 72],
  judging: [72, 99],
};

const part = (done = 0, total = 0) => (total > 0 ? Math.min(1, done / total) : 0);

export function progressOf(status: string, p: Progress = {}): { percent: number; line: string } {
  const [from, to] = STRETCH[status] ?? [0, 0];
  const n = (x: number | undefined) => (x ?? 0).toLocaleString("en-US");
  switch (status) {
    case "new":
    case "briefing":
    case "review":
      return { percent: from + 1, line: p.brief_step ? `Updating with your details · ${READING[p.brief_step] ?? ""}`.replace(/ · $/, "") : "Updating with your details" };
    case "queued":
      return { percent: from, line: "Starting your search" };
    case "gathering":
      return {
        percent: from + (to - from) * part(p.sources_done, p.sources),
        line: p.sources ? `Searching ${p.sources} places · ${n(p.found)} pieces found` : "Searching stores",
      };
    case "screening":
      return {
        percent: from + (to - from) * part(p.screened, p.to_screen),
        line: p.to_screen ? `Looking over ${n(p.to_screen)} pieces · ${n(p.screened)} done` : "Looking over what we found",
      };
    case "enriching":
      return { percent: from + (to - from) * 0.5, line: p.picked ? `Reading ${p.picked} listings for fabric, price and stock` : "Reading the listings" };
    case "judging":
      return {
        percent: from + (to - from) * part(p.judged, p.to_judge),
        line: p.to_judge ? `Checking each match · ${n(p.judged)} of ${n(p.to_judge)}` : "Checking each match",
      };
    default:
      return { percent: 0, line: "Searching" };
  }
}

const READING: Record<number, string> = {
  1: "Opening the product page",
  2: "Looking at the photos",
  3: "Writing what to search for",
};

/**
 * The bar while a new piece is read (Review, "Reading your piece"). Steps come from the
 * brief builder; the last one is the long one (the AI reading everything), so the bar keeps
 * moving slowly through it rather than sitting still.
 */
export function readingProgress(p: Progress = {}, secondsInStep = 0): { percent: number; line: string } {
  const step = p.brief_step ?? 0;
  if (step >= 3) return { percent: Math.min(92, 40 + secondsInStep * 1.6), line: READING[3] };
  if (step === 2) return { percent: 25, line: READING[2] };
  if (step === 1) return { percent: 10, line: READING[1] };
  return { percent: 3, line: "Starting" };
}
