import { useEffect, useRef, useState } from "react";
import type {
  KantoorVoorbeeldProps,
  VoorbeeldStatus,
  VoorbeeldTeksten,
} from "./types";
import {
  frameAdres,
  PROTOCOL,
  type NaarFrame,
  type VanFrame,
} from "./protocol";
export type {
  KantoorVoorbeeldProps,
  VoorbeeldBron,
  VoorbeeldStatus,
  VoorbeeldTeksten,
  Kantoorformaat,
} from "./types";

const STANDAARD: VoorbeeldTeksten = {
  laden: "Voorbeeld laden…",
  fout: "Het voorbeeld kon niet worden weergegeven.",
  conversie: "Dit bestand moet eerst naar DOCX, XLSX of PPTX worden omgezet.",
  onbekend: "Voor dit bestandstype is geen Office-voorbeeld beschikbaar.",
  teGroot: "Dit bestand is groter dan de ingestelde grens voor voorvertoning.",
  titel: (naam) => `Voorbeeld van ${naam}`,
};

type Geladen = {
  bron: KantoorVoorbeeldProps["bron"];
  bytes: Uint8Array;
  sessie: string;
  adres: string;
};

/** Alleen-lezen weergave; geen opslag- of authenticatiecode en geen documentinhoud in HTML. */
export function KantoorVoorbeeld(props: KantoorVoorbeeldProps) {
  const maxBytes = props.maxBytes ?? 64 * 1024 * 1024;
  const laadTimeoutMs = props.laadTimeoutMs ?? 90_000;
  const tekst = { ...STANDAARD, ...props.teksten };
  const [geladen, zetGeladen] = useState<Geladen | null>(null);
  const [toestand, zetToestand] = useState<{
    bron: KantoorVoorbeeldProps["bron"];
    status: VoorbeeldStatus;
  }>({ bron: props.bron, status: { soort: "laden" } });
  const frame = useRef<HTMLIFrameElement>(null);
  const aansluiting = useRef<MessagePort | null>(null);
  const wachttijd = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recent = useRef(props);
  recent.current = props;

  useEffect(() => {
    const controller = new AbortController();
    zetGeladen(null);
    const meld = (s: VoorbeeldStatus) => {
      if (recent.current.bron !== props.bron) return;
      zetToestand({ bron: props.bron, status: s });
      recent.current.onStatus?.(s);
    };
    meld({ soort: "laden" });
    if (!Number.isFinite(laadTimeoutMs) || laadTimeoutMs <= 0) {
      meld({ soort: "fout", fout: new Error("Ongeldige laadtijdgrens.") });
      return () => controller.abort();
    }
    wachttijd.current = setTimeout(() => {
      controller.abort();
      aansluiting.current?.close();
      aansluiting.current = null;
      zetGeladen(null);
      meld({
        soort: "fout",
        fout: new Error(
          "Het kantoorvoorbeeld is niet binnen de ingestelde tijd geladen.",
        ),
      });
    }, laadTimeoutMs);
    const afronden = (s: VoorbeeldStatus) => {
      if (wachttijd.current) clearTimeout(wachttijd.current);
      wachttijd.current = null;
      meld(s);
    };
    void (async () => {
      try {
        if (!Number.isFinite(maxBytes) || maxBytes <= 0)
          throw new Error("Ongeldige voorbeeldgrens.");
        if (props.bron.grootte !== undefined && props.bron.grootte > maxBytes) {
          afronden({ soort: "teGroot" });
          return;
        }
        const bytes = await props.bron.laad(controller.signal);
        if (controller.signal.aborted || recent.current.bron !== props.bron)
          return;
        if (!(bytes instanceof Uint8Array))
          throw new Error("De voorbeeldbron leverde geen bestandsbytes.");
        if (bytes.byteLength > maxBytes) {
          afronden({ soort: "teGroot" });
          return;
        }
        const sessie = crypto.randomUUID();
        const adres = frameAdres(
          props.assetBasis,
          window.location.href,
          sessie,
        ).href;
        // Eigen kopie: overdragen aan het frame mag de bron van de aanroeper niet losmaken.
        zetGeladen({ bron: props.bron, bytes: bytes.slice(), sessie, adres });
      } catch (fout) {
        if (!controller.signal.aborted)
          afronden({
            soort: "fout",
            fout: fout instanceof Error ? fout : new Error(String(fout)),
          });
      }
    })();
    return () => {
      controller.abort();
      if (wachttijd.current) clearTimeout(wachttijd.current);
      wachttijd.current = null;
      aansluiting.current?.close();
      aansluiting.current = null;
    };
  }, [props.bron, String(props.assetBasis), maxBytes, laadTimeoutMs]);

  const verbind = () => {
    if (
      !geladen ||
      geladen.bron !== props.bron ||
      !frame.current?.contentWindow
    )
      return;
    // Ook een HTTP-omleiding mag de bytes niet naar een andere pagina voeren.
    try {
      if (frame.current.contentWindow.location.href !== geladen.adres) return;
    } catch {
      return;
    }
    aansluiting.current?.close();
    const kanaal = new MessageChannel();
    aansluiting.current = kanaal.port1;
    let geopend = false;
    kanaal.port1.onmessage = ({ data }: MessageEvent<VanFrame>) => {
      if (
        aansluiting.current !== kanaal.port1 ||
        recent.current.bron !== geladen.bron
      )
        return;
      if (data?.soort === "aansluiting") {
        // Alleen het verwachte frame kent het onvoorspelbare fragment; dat staat niet in dit bericht.
        if (geopend || data.sessie !== geladen.sessie) return;
        geopend = true;
        const bytes = geladen.bytes.slice();
        const opdracht: NaarFrame = {
          soort: "open",
          bytes,
          naam: props.bron.bestandsnaam,
          maxBytes,
        };
        kanaal.port1.postMessage(opdracht, [bytes.buffer]);
      } else if (geopend) {
        let volgende: VoorbeeldStatus;
        if (
          data?.soort === "gereed" &&
          ["docx", "xlsx", "pptx"].includes(data.formaat)
        )
          volgende = { soort: "gereed", formaat: data.formaat };
        else if (data?.soort === "conversie" || data?.soort === "onbekend")
          volgende = { soort: data.soort };
        else if (data?.soort === "fout")
          volgende = { soort: "fout", fout: new Error(data.bericht) };
        else return;
        if (wachttijd.current) clearTimeout(wachttijd.current);
        wachttijd.current = null;
        if (volgende.soort !== "gereed") {
          kanaal.port1.close();
          aansluiting.current = null;
          zetGeladen(null);
        }
        zetToestand({ bron: geladen.bron, status: volgende });
        recent.current.onStatus?.(volgende);
      }
    };
    // De bytes gaan uitsluitend over de aan dit frame gebonden poort, na de fragmentcontrole.
    // '*' is nodig voor de eigen Tauri-oorsprong; het initbericht bevat geen bron of sessiegeheim.
    frame.current.contentWindow.postMessage({ soort: PROTOCOL }, "*", [
      kanaal.port2,
    ]);
  };

  const actueel = geladen?.bron === props.bron;
  const zichtbaar =
    toestand.bron === props.bron
      ? toestand.status
      : { soort: "laden" as const };
  const melding =
    zichtbaar.soort === "conversie"
      ? tekst.conversie
      : zichtbaar.soort === "onbekend"
        ? tekst.onbekend
        : zichtbaar.soort === "teGroot"
          ? tekst.teGroot
          : zichtbaar.soort === "fout"
            ? tekst.fout
            : tekst.laden;
  return (
    <section
      className={props.className}
      style={{ height: 600, ...props.style, position: "relative" }}
      aria-busy={zichtbaar.soort === "laden"}
    >
      {zichtbaar.soort !== "gereed" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            background: "Canvas",
            color: "CanvasText",
            display: "grid",
            placeItems: "center",
          }}
        >
          <p role={zichtbaar.soort === "fout" ? "alert" : "status"}>
            {melding}
          </p>
        </div>
      )}
      {actueel && geladen && (
        <iframe
          key={geladen.sessie}
          ref={frame}
          src={geladen.adres}
          title={tekst.titel(props.bron.bestandsnaam)}
          sandbox="allow-scripts allow-same-origin"
          onLoad={verbind}
          aria-hidden={zichtbaar.soort !== "gereed"}
          tabIndex={zichtbaar.soort === "gereed" ? 0 : -1}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: 0,
          }}
        />
      )}
    </section>
  );
}
