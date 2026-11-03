// Finished terrain chunks are handed to the GPU off the main thread (createImageBitmap) instead of putImageData into
// a canvas: Chrome defers that transfer to the first drawImage, which then took 20-40 ms in the frame the chunk came
// on screen (v1.2.0; the cause of the occasional dropped frames on the phone). A chunk that must be shown right away
// (nothing on screen for it yet) still goes through a canvas synchronously.
import { makeCanvas, ctx2d } from './sprite';

export type ChunkImage = HTMLCanvasElement | ImageBitmap;

export interface ChunkEntry {
  c: ChunkImage | null;
  ver: number;
  used: number;
  job: Generator<void, ImageData, void> | null;
  jobVer: number;
  /** version whose bitmap is being created (-1 = none) */
  pending: number;
}

export function newEntry(frame: number): ChunkEntry {
  return { c: null, ver: -1, used: frame, job: null, jobVer: -1, pending: -1 };
}

const canBitmap = typeof createImageBitmap === 'function';

function release(c: ChunkImage | null): void {
  if (c && 'close' in c) c.close();
}

function installCanvas(e: ChunkEntry, img: ImageData, ver: number): void {
  const c = makeCanvas(img.width, img.height);
  ctx2d(c).putImageData(img, 0, 0);
  release(e.c);
  e.c = c; e.ver = ver; e.pending = -1;
}

/** Install a finished chunk image: asynchronously if possible, synchronously when `now` (or unsupported). */
export function finishChunk(e: ChunkEntry, img: ImageData, now: boolean): void {
  const ver = e.jobVer;
  e.job = null;
  if (now || !canBitmap) { installCanvas(e, img, ver); return; }
  e.pending = ver;
  createImageBitmap(img).then((bm) => {
    if (e.pending !== ver) { bm.close(); return; }
    release(e.c);
    e.c = bm; e.ver = ver; e.pending = -1;
  }, () => {
    if (e.pending === ver) installCanvas(e, img, ver);
  });
}

/** Does the entry need a (new) paint job for terrain version `ver`? */
export function needsJob(e: ChunkEntry, ver: number): boolean {
  return e.ver !== ver && e.pending !== ver && (!e.job || e.jobVer !== ver);
}

export function dropEntry(e: ChunkEntry): void {
  release(e.c);
  e.c = null; e.pending = -1;
}
