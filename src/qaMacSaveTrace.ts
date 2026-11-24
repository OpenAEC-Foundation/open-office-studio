// DERIVED P5 test observer; two explicit gates and a native synthetic-file bind.
import { invoke } from "@tauri-apps/api/core";
const compiled = import.meta.env.VITE_OOS_QA_SAVE_TRACE === "DERIVED_P5_SYNTHETIC_ONLY";
let session: string | null = null, generation = 0, seq = 0, bufferId = 0, lost = 0;
const pending = new Set<Promise<unknown>>();
type Event = { point: number; seq: number; atUs: number; values: number[]; digest: string | null };
function send(bound: string, event: Event) {
  return invoke<boolean>("qa_save_trace_push", { session: bound, event })
    .then(ok => { if (!ok) lost++; });
}
function track(promise: Promise<unknown>, bound: string) {
  pending.add(promise);
  void promise.catch(() => { lost++; }).finally(() => {
    pending.delete(promise);
    if (!pending.size && session === bound) {
      // Untracked terminal coverage marker: never recursively schedules itself.
      try { void send(bound, { point: 99, seq, atUs: Math.trunc(performance.now()*1000),
        values: [seq, lost, 0], digest: null }).catch(() => { lost++; }); } catch { lost++; }
    }
  }).catch(() => { lost++; });
}
export async function qaBind(token: string | undefined) {
  const ownGeneration = ++generation;
  session = null;
  if (!compiled) return;
  try {
    const bound = await invoke<string | null>("qa_save_trace_bind", { token: token ?? null });
    if (ownGeneration === generation && bound && /^[a-f0-9]{32}$/.test(bound)) {
      session = bound;
      qaTrace(91, []);
    }
  } catch { lost++; } // Trace failure never replaces a product error or action.
}
export function qaTrace(point: number, values: number[] = [], digest: string | null = null) {
  try {
    if (!compiled || !session) return;
    const bound = session;
    const event = { point, seq: ++seq, atUs: Math.trunc(performance.now()*1000), values, digest };
    track(send(bound, event), bound); // No product await, retry or input replay.
  } catch { lost++; }
}
export function qaBytes(point: number, input: Uint8Array | ArrayBuffer) {
  try {
  if (!compiled || !session) return;
  const ownGeneration = generation, bound = session, id = ++bufferId;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  qaTrace(point, [id, bytes.byteLength]);
  if (bytes.byteLength > 1024*1024 || !globalThis.crypto?.subtle) {
    lost++; qaTrace(point+2, [id, bytes.byteLength]); return;
  }
  // Snapshot the actual result without reserializing, flushing or logging content.
  const snapshot = new Uint8Array(bytes);
  const hash = crypto.subtle.digest("SHA-256", snapshot.buffer).then(value => {
    if (ownGeneration !== generation || bound !== session) { lost++; return; }
    const digest = Array.from(new Uint8Array(value), x => x.toString(16).padStart(2, "0")).join("");
    qaTrace(point+1, [id, snapshot.byteLength], digest);
  });
  track(hash, bound);
  } catch { lost++; }
}
const statuses = ["bezig", "verouderd", "afgerond", "mislukt", "opgeslagen", "opslaan-als",
  "geannuleerd", "geëxporteerd", "download", "extern-gewijzigd", "ontbreekt", "alleen-lezen", "ander-formaat"];
export function qaStatus(value: { status: string }) {
  try { return compiled && session ? statuses.indexOf(value.status)+1 : 0; } catch { lost++; return 0; }
}
export function qaKey(e: KeyboardEvent, uit: boolean, id: number | undefined) {
  try {
  if (!compiled || !session) return;
  qaTrace(10, [e.key.toLowerCase()==="s" ? 1 : e.key.toLowerCase()==="q" ? 2 : 0,
    +(e.code==="KeyS"), +e.ctrlKey, +e.metaKey, +e.shiftKey, +e.altKey,
    +e.repeat, +e.defaultPrevented, +uit, id ?? 0]);
  } catch { lost++; }
}
