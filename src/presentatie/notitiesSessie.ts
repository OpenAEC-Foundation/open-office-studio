import type {
  DeckSnapshot,
  PresentationHandle,
  SlideSnapshot,
} from "@betteroffice/pptx";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { Pakket } from "../grafieken/pakket";
import {
  leesRijkeNotities,
  notitieDiaPaden,
  NotitieFout,
  schrijfRijkeNotities,
} from "./notitiesPakket";
import {
  legeNotities,
  notitieTekst,
  valideerNotities,
  type NotitieDocument,
} from "./notitiesModel";
interface Entry {
  doc: NotitieDocument;
  initial: string;
  plain: string;
  fingerprint: string;
  changed: boolean;
  display: string;
  past: { doc: NotitieDocument; time: number; bytes: number }[];
  future: NotitieDocument[];
  last: number;
  kind: string;
  error?: NotitieFout;
}
const key = (s: SlideSnapshot) => s.sourcePartPath || s.id;
const plain = (d: NotitieDocument) =>
  notitieTekst(d).replaceAll("\u2028", "\n");
export class RijkeNotitieSessie {
  private source: Pakket | null = null;
  private paths: string[] = [];
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private revision = 0;
  constructor(
    private handle: PresentationHandle,
    bytes: Uint8Array,
    private changed: () => void,
    private writable: () => boolean = () => true,
  ) {
    try {
      this.source = new Pakket(bytes);
      this.paths = notitieDiaPaden(this.source);
    } catch {
      // Unsupported package structures must not prevent opening the slides.
      this.source = null;
    }
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  version = () => this.revision;
  huidig(id: string) {
    const e = this.entries.get(id);
    if (!e) throw new NotitieFout("changed");
    return {
      doc: e.doc,
      plain: e.plain,
      error: e.error,
      changed: this.modified(e),
      undo: !!e.past.length,
      redo: !!e.future.length,
    };
  }
  private notify() {
    this.revision++;
    this.listeners.forEach((l) => l());
  }
  private modified(e: Entry) {
    return e.changed;
  }
  private replace(e: Entry, doc: NotitieDocument) {
    e.doc = doc;
    e.fingerprint = JSON.stringify(doc);
    e.changed = e.fingerprint !== e.initial;
    e.display = plain(doc);
  }
  private load(index: number, slide: SlideSnapshot, actual = false): Entry {
    let doc = legeNotities(),
      error: NotitieFout | undefined;
    try {
      const p = actual ? new Pakket(this.handle.save()) : this.source;
      if (!p) throw new NotitieFout("unsupported");
      const path = actual
        ? notitieDiaPaden(p)[index]
        : this.paths.find((path) => path === slide.sourcePartPath);
      if (path) doc = leesRijkeNotities(p, path);
      else if (slide.notes) {
        const p = new Pakket(this.handle.save()),
          path = notitieDiaPaden(p)[index];
        if (path) doc = leesRijkeNotities(p, path);
      }
    } catch (e) {
      error = e instanceof NotitieFout ? e : new NotitieFout("invalid");
    }
    return {
      doc,
      initial: JSON.stringify(doc),
      plain: slide.notes ?? "",
      fingerprint: JSON.stringify(doc),
      changed: false,
      display: plain(doc),
      past: [],
      future: [],
      last: 0,
      kind: "",
      error,
    };
  }
  lees(index: number) {
    const slide = this.handle.snapshot().slides[index];
    if (!slide) throw new NotitieFout("changed");
    const id = key(slide);
    let e = this.entries.get(id);
    if (!e) {
      e = this.load(index, slide);
      this.entries.set(id, e);
    } else if (!this.modified(e) && e.plain !== (slide.notes ?? "")) {
      e = this.load(index, slide, true);
      this.entries.set(id, e);
    }
    const conflict = this.modified(e) && e.plain !== (slide.notes ?? "");
    if (conflict) e.error = new NotitieFout("changed");
    else if (e.error?.code === "changed") e.error = undefined;
    return {
      id,
      doc: e.doc,
      error: conflict ? new NotitieFout("changed") : e.error,
      changed: this.modified(e),
      undo: !!e.past.length,
      redo: !!e.future.length,
    };
  }
  schrijf(id: string, doc: NotitieDocument, kind = "format") {
    if (!this.writable()) throw new NotitieFout("changed");
    const e = this.entries.get(id);
    if (!e || e.error) throw new NotitieFout("changed");
    try {
      valideerNotities(doc);
    } catch (error) {
      throw new NotitieFout(
        error instanceof Error && error.message === "tooLarge"
          ? "tooLarge"
          : "invalid",
      );
    }
    if (JSON.stringify(doc) === e.fingerprint) return;
    const now = Date.now();
    if (kind !== "typing" || e.kind !== kind || now - e.last > 800)
      e.past.push({ doc: e.doc, time: now, bytes: e.fingerprint.length });
    this.replace(e, doc);
    e.future = [];
    e.last = now;
    e.kind = kind;
    // One shared budget across slide histories, rather than a full deck per key.
    let history = [...this.entries.values()]
        .flatMap((e) => e.past.map((p) => ({ e, p })))
        .sort((a, b) => a.p.time - b.p.time),
      size = history.reduce((n, h) => n + h.p.bytes, 0);
    while (history.length > 100 || size > 4 * 1024 * 1024) {
      const oldest = history.shift()!;
      oldest.e.past.shift();
      size -= oldest.p.bytes;
    }
    this.changed();
    this.notify();
  }
  undo(id: string) {
    if (!this.writable()) return;
    const e = this.entries.get(id),
      last = e?.past.pop();
    if (!e || !last) return;
    e.future.push(e.doc);
    this.replace(e, last.doc);
    e.kind = "";
    this.changed();
    this.notify();
  }
  redo(id: string) {
    if (!this.writable()) return;
    const e = this.entries.get(id),
      next = e?.future.pop();
    if (!e || !next) return;
    e.past.push({ doc: e.doc, time: Date.now(), bytes: e.fingerprint.length });
    this.replace(e, next);
    e.kind = "";
    this.changed();
    this.notify();
  }
  reset(index: number) {
    if (!this.writable()) return;
    const s = this.handle.snapshot().slides[index];
    if (!s) return;
    this.entries.set(key(s), this.load(index, s, true));
    this.changed();
    this.notify();
  }
  snapshot(raw: DeckSnapshot): DeckSnapshot {
    if (![...this.entries.values()].some((e) => this.modified(e))) return raw;
    return {
      ...raw,
      slides: raw.slides.map((s) => {
        const e = this.entries.get(key(s));
        return e && this.modified(e) ? { ...s, notes: e.display } : s;
      }),
    };
  }
  serialiseer(bytes: Uint8Array) {
    if (![...this.entries.values()].some((e) => this.modified(e))) return bytes;
    const updates = new Map<number, NotitieDocument>();
    this.handle.snapshot().slides.forEach((s, i) => {
      const e = this.entries.get(key(s));
      if (e && this.modified(e)) {
        if ((s.notes ?? "") !== e.plain) throw new NotitieFout("changed");
        updates.set(i, e.doc);
      }
    });
    return schrijfRijkeNotities(bytes, updates);
  }
}
const sessies = new WeakMap<object, RijkeNotitieSessie>();
export const rijkeNotitieSessie = (api: PptxEditorApi) =>
  sessies.get(api.handle);
/** Public API facade: every application save/copy/export sees pending notes. */
export function metRijkeNotities(
  api: PptxEditorApi,
  bytes: Uint8Array,
  changed: () => void,
): PptxEditorApi {
  const native = api.handle,
    session = new RijkeNotitieSessie(
      native,
      bytes,
      changed,
      () => api.commands.getState("insertSlide").enabled,
    ),
    methods = new Map<PropertyKey, unknown>();
  const handle = new Proxy(native, {
    get(target, p) {
      if (p === "save") return () => session.serialiseer(target.save());
      if (p === "snapshot") return () => session.snapshot(target.snapshot());
      const value = Reflect.get(target, p, target);
      if (typeof value !== "function") return value;
      if (!methods.has(p)) methods.set(p, value.bind(target));
      return methods.get(p);
    },
  });
  sessies.set(handle, session);
  const facade = new Proxy(api, {
    get(target, p) {
      if (p === "handle") return handle;
      if (p === "save") return () => session.serialiseer(target.save());
      const value = Reflect.get(target, p, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return facade;
}
