/*
 * The progress bar on Results while a search runs (Maggie, Nov 15). Plain module:
 * the search job writes counts on the search (migration 0010), and this turns the
 * status plus those counts into how full the bar is and one line of real numbers.
 */

export type Progress = {
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

/** "0:45", "1:12". */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
