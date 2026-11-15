import "server-only";
import sharp from "sharp";
import type { Session } from "./session";

export const MAX_PHOTOS = 4;
const MAX_SIDE = 1024;

/**
 * Shrinks a photo to 1,024 pixels on its longest side, turns it upright and
 * strips its metadata (including any GPS location), then saves it to the
 * friend's private folder: photos/<user_id>/<search_id>/<n>.jpg
 */
export async function savePhoto(session: Session, searchId: string, name: string, file: Blob | Buffer) {
  const input = Buffer.isBuffer(file) ? file : Buffer.from(await file.arrayBuffer());
  const jpeg = await sharp(input)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  const path = `${session.userId}/${searchId}/${name}.jpg`;
  const { error } = await session.supabase.storage
    .from("photos")
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return path;
}

/** Reads saved photos back as base64 for Claude. */
export async function loadPhotosBase64(session: Session, paths: string[]) {
  const out: { data: string; mediaType: "image/jpeg" }[] = [];
  for (const path of paths.slice(0, MAX_PHOTOS)) {
    const { data, error } = await session.supabase.storage.from("photos").download(path);
    if (error || !data) continue;
    out.push({ data: Buffer.from(await data.arrayBuffer()).toString("base64"), mediaType: "image/jpeg" });
  }
  return out;
}

/** Short-lived links so the friend's own browser can show their photos. */
export async function signedPhotoUrls(session: Session, paths: string[], seconds = 3600) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await session.supabase.storage.from("photos").createSignedUrls(paths, seconds);
  const map: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  return map;
}
