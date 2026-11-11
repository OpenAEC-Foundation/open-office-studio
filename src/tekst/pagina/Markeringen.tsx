import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Pilcrow } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  defineDocxPlugin,
  useDocxCommand,
  type DocxEditorRef,
  type DocxPluginContext,
  type DocxPluginGeometry,
} from "@betteroffice/docx-react";
import type { YrsSession } from "@betteroffice/docx/yrs";
import { Actie } from "../../Ribbon";
import { useEditorApi } from "../../lint/editorApi";
import "./markeringen.css";

const standen = new WeakMap<object, boolean>();
const luisteraars = new Set<() => void>();
const abonneer = (l: () => void) => {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
};
function useMarkeringen(eigenaar: object | null | undefined) {
  const aan = useSyncExternalStore(
    abonneer,
    () => !!eigenaar && !!standen.get(eigenaar),
    () => false,
  );
  return [
    aan,
    () => {
      if (eigenaar) {
        standen.set(eigenaar, !aan);
        luisteraars.forEach((l) => l());
      }
    },
  ] as const;
}

/** Het laatste sectPr is de documentafsluiting, geen zichtbare sectiegrens. */
export function sectieMarkeringen(s: Pick<YrsSession, "listSections">) {
  const secties = s.listSections();
  return new Map(
    secties
      .slice(0, -1)
      .filter((x) => x.closingParagraphId !== "final")
      .map((x, i) => [
        x.closingParagraphId,
        secties[i + 1].resolved.sectionStart ?? "nextPage",
      ]),
  );
}

/** Conversies kunnen een sectPr in een niet geschilderde lege alinea plaatsen. */
export function plaatsSectieMarkeringen(
  alineas: { paraId: string; length: number }[],
  secties: Map<string, string>,
  geschilderd: Set<string>,
) {
  const uit = new Map<string, string[]>();
  let vorige: string | undefined;
  for (const p of alineas) {
    if (geschilderd.has(p.paraId) && (p.length > 0 || !vorige))
      vorige = p.paraId;
    const soort = secties.get(p.paraId);
    if (soort && vorige) {
      const waarden = uit.get(vorige) ?? [];
      uit.set(vorige, [...waarden, soort]);
    }
  }
  return uit;
}

export function OpmaakmarkeringenKnop() {
  const api = useEditorApi();
  useDocxCommand("zoom");
  const { t } = useTranslation("writer");
  const [aan, wijzig] = useMarkeringen(api.herlaad ?? api.tekst());
  return (
    <Actie
      icoon={Pilcrow}
      naam={t("structure.marks")}
      groot
      actief={aan}
      title={t("structure.marksTip")}
      disabled={!api.tekst()}
      onClick={wijzig}
    />
  );
}

function Markeringen({
  lees,
  context,
  geometry,
}: {
  lees: () => DocxEditorRef | null;
  context: DocxPluginContext<Record<string, never>>;
  geometry: DocxPluginGeometry;
}) {
  const api = useEditorApi(),
    ref = lees(),
    ed = ref?.getEditorRef(),
    s = ed?.getYrsSession();
  const [aan] = useMarkeringen(api.herlaad ?? ref);
  const { t } = useTranslation("writer");
  const laag = useRef<HTMLDivElement>(null);
  const [tik, verhoog] = useState(0);
  useEffect(() => {
    if (!aan) return;
    const vlak = laag.current?.closest<HTMLElement>(
      ".docx-editor__scroll-container, .docx-editor__viewport",
    );
    let frame = 0;
    const plan = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          verhoog((n) => n + 1);
        });
    };
    vlak?.addEventListener("scroll", plan, { passive: true });
    window.addEventListener("resize", plan);
    plan();
    return () => {
      cancelAnimationFrame(frame);
      vlak?.removeEventListener("scroll", plan);
      window.removeEventListener("resize", plan);
    };
  }, [aan]);
  const alineas = useMemo(() => {
    if (!aan || !s) return [];
    try {
      return s.paragraphSpans("body");
    } catch {
      return [];
    }
  }, [aan, s, context.snapshot.version]);
  const secties = useMemo(() => {
    try {
      return aan && s ? sectieMarkeringen(s) : new Map<string, string>();
    } catch {
      return new Map<string, string>();
    }
  }, [aan, s, context.snapshot.version]);
  const sectieAnkers = useMemo(() => {
    const geschilderd = new Set<string>();
    if (aan)
      for (const p of ed?.getLayout()?.pages ?? [])
        for (const f of p.fragments as { kind?: string; blockId?: string }[])
          if (f.kind === "paragraph" && f.blockId) geschilderd.add(f.blockId);
    return plaatsSectieMarkeringen(alineas, secties, geschilderd);
  }, [
    aan,
    ed,
    context.snapshot.layout,
    context.snapshot.version,
    alineas,
    secties,
  ]);
  const marks = useMemo(() => {
    if (!aan || !s || !ed || !context.snapshot.layout || !laag.current)
      return [];
    const vlak = laag.current.closest<HTMLElement>(
      ".docx-editor__scroll-container, .docx-editor__viewport",
    );
    if (!vlak) return [];
    const venster = vlak.getBoundingClientRect(),
      paginaEls = vlak.querySelectorAll<HTMLElement>(
        ".canvas-page[data-page-index]",
      );
    const paginas = ed.getLayout()?.pages ?? [];
    const zichtbaar = new Set<string>();
    let van = Infinity,
      tot = -Infinity;
    paginaEls.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < venster.top - 100 || r.top > venster.bottom + 100) return;
      for (const f of (paginas[Number(el.dataset.pageIndex ?? i)]?.fragments ??
        []) as {
        blockId?: string;
        kind?: string;
        pmStart?: number;
        pmEnd?: number;
      }[]) {
        if (f.kind === "paragraph" && typeof f.blockId === "string")
          zichtbaar.add(f.blockId);
        if (f.pmStart !== undefined) van = Math.min(van, f.pmStart);
        if (f.pmEnd !== undefined) tot = Math.max(tot, f.pmEnd);
      }
    });
    const uit: {
      id: string;
      x: number;
      y: number;
      width: number;
      sectie?: string[];
    }[] = [];
    const pageRects = Array.from(
      { length: geometry.layout.pageCount },
      (_, i) => geometry.getPageRect(i),
    );
    for (const p of alineas) {
      if (zichtbaar.size && !zichtbaar.has(p.paraId)) continue;
      const loc = { story: "body", paraId: p.paraId, offset: p.length };
      const pos = ed.yrsLocToDisplayPosition(loc);
      if (pos === null || pos < van || pos > tot) continue;
      const coords = geometry.dom.getCoordinatesForPosition(pos);
      const g = coords && geometry.toOverlayRect({ ...coords, width: 0 });
      if (!g) continue;
      const page = pageRects.find(
        (r) => r && g.y >= r.y && g.y < r.y + r.height,
      );
      uit.push({
        id: p.paraId,
        x: g.x + 2,
        y: g.y,
        width: Math.max(20, page ? page.x + page.width - g.x - 16 : 250),
        sectie: sectieAnkers.get(p.paraId),
      });
    }
    return uit;
  }, [
    aan,
    s,
    ed,
    context.snapshot.layout,
    context.snapshot.version,
    geometry,
    alineas,
    sectieAnkers,
    tik,
  ]);
  return (
    <div
      ref={laag}
      className="writer-structuurmarkeringen"
      aria-hidden="true"
      data-marks={aan ? "on" : "off"}
    >
      {marks.map((m) => (
        <span
          key={m.id}
          className={
            m.sectie ? "writer-sectiemarkering" : "writer-alineamarkering"
          }
          style={{
            left: m.x,
            top: m.y,
            maxWidth: m.width,
            fontSize: Math.max(7, 11 * geometry.layout.zoom),
          }}
        >
          {m.sectie
            ? `¶ ··· ${m.sectie.map((soort) => `${t("structure.section")} (${t(`structure.${soort}`)})`).join(" · ")} ···`
            : "¶"}
        </span>
      ))}
    </div>
  );
}

export function maakMarkeringenPlugin(lees: () => DocxEditorRef | null) {
  return defineDocxPlugin<Record<string, never>>({
    id: "openaec-structuurmarkeringen",
    createState: () => ({}),
    overlay: ({ context, geometry }) => (
      <Markeringen lees={lees} context={context} geometry={geometry} />
    ),
  });
}
