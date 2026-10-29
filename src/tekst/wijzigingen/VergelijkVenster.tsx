/**
 * Venster ‘Versies vergelijken’ (#57): twee documenten kiezen (dit document
 * en een ander bestand, of twee andere bestanden), vergelijken met de engine
 * en het resultaat met revisiemarkeringen in een nieuw tabblad openen. Daar
 * gaat het deelvenster Wijzigingen meteen open met de verschillen.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "../../i18n/config";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import { openNieuwDocument } from "../../werkruimte/gebeurtenissen";
import { useEditorApi } from "../../lint/editorApi";
import { eigenAuteur, fout } from "../gedeeld/engine";
import { heeftWijzigingen, meldingen, resultaatNaam, verschilTekst, vergelijk, type Vergelijking } from "./vergelijken";

/** Het volgende tekst-tabblad dat opent (het resultaat) krijgt het deelvenster. */
let paneelVoorVolgende = 0;
export function paneelBijVolgendTabblad() {
  paneelVoorVolgende = Date.now();
}
export function neemPaneelVerzoek() {
  const ja = Date.now() - paneelVoorVolgende < 20000;
  paneelVoorVolgende = 0;
  return ja;
}

interface Keuze {
  bron: "dit" | "bestand";
  bestand: { naam: string; bytes: Uint8Array } | null;
}

export function VergelijkVenster({ sluit }: { sluit: () => void }) {
  const { herlaad } = useEditorApi();
  const { t } = useTranslation("writer");
  const [origineel, setOrigineel] = useState<Keuze>({ bron: "bestand", bestand: null });
  const [gewijzigd, setGewijzigd] = useState<Keuze>({ bron: "dit", bestand: null });
  const [naam, setNaam] = useState(() => eigenAuteur() || i18next.t("writer:changes.compare.defaultAuthor"));
  const [korrel, setKorrel] = useState<"word" | "char">("word");
  const [accepteren, setAccepteren] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [uitkomst, setUitkomst] = useState<Vergelijking | null>(null);
  const [fouttekst, setFouttekst] = useState("");
  const invoer = useRef<HTMLInputElement>(null);
  const kiesVoor = useRef<"origineel" | "gewijzigd">("origineel");

  // Een andere keuze maakt de vorige uitkomst (of foutmelding) ongeldig.
  useEffect(() => {
    setUitkomst(null);
    setFouttekst("");
  }, [origineel, gewijzigd, korrel, accepteren]);

  const klaar = (k: Keuze) => k.bron === "dit" || !!k.bestand;
  const geldig = klaar(origineel) && klaar(gewijzigd) && !(origineel.bron === "dit" && gewijzigd.bron === "dit");

  async function bytesVan(k: Keuze) {
    if (k.bron === "bestand") return k.bestand!.bytes;
    if (!herlaad) throw new Error(i18next.t("writer:general.documentNotReady"));
    return herlaad.bytes();
  }
  async function start() {
    setBezig(true);
    setFouttekst("");
    setUitkomst(null);
    try {
      const [a, b] = [await bytesVan(origineel), await bytesVan(gewijzigd)];
      const uit = await vergelijk(a, b, { auteur: naam, korrel, eerstAccepteren: accepteren });
      setUitkomst(uit);
      if (uit.ok && uit.verschillen > 0) {
        const ditDocument = i18next.t("writer:changes.compare.thisDocumentName");
        const naamA = origineel.bron === "dit" ? ditDocument : origineel.bestand!.naam;
        const naamB = gewijzigd.bron === "dit" ? ditDocument : gewijzigd.bestand!.naam;
        paneelBijVolgendTabblad();
        openNieuwDocument({ naam: resultaatNaam(naamA, naamB), bytes: uit.bytes });
        sluit();
      }
    } catch (e) {
      setFouttekst(fout(e));
    } finally {
      setBezig(false);
    }
  }
  const keuze = (titel: string, k: Keuze, zet: (k: Keuze) => void, soort: "origineel" | "gewijzigd") => (
    <fieldset>
      <legend>{titel}</legend>
      <div className="werkruimte-keuzes" role="radiogroup" aria-label={titel}>
        <label>
          <input type="radio" checked={k.bron === "dit"} onChange={() => zet({ ...k, bron: "dit" })} /> {t("changes.compare.thisDocument")}
        </label>
        <label>
          <input type="radio" checked={k.bron === "bestand"} onChange={() => zet({ ...k, bron: "bestand" })} /> {t("changes.compare.otherFile")}
        </label>
        <button
          type="button"
          className="werkruimte-knop"
          onClick={() => {
            kiesVoor.current = soort;
            invoer.current?.click();
          }}
        >
          {k.bestand ? t("changes.compare.chooseOtherFile") : t("changes.compare.chooseFile")}
        </button>
      </div>
      {k.bestand && (
        <p className="werkruimte-uitleg">
          {heeftWijzigingen(k.bestand.bytes)
            ? t("changes.compare.fileWithRevisions", { name: k.bestand.naam })
            : k.bestand.naam}
        </p>
      )}
    </fieldset>
  );
  const fout1 = uitkomst && !uitkomst.ok ? meldingen(uitkomst.meldingen) : [];
  return (
    <Dialoog
      titel={t("changes.compare.title")}
      sluit={sluit}
      className="tw-venster is-breed"
      acties={
        <>
          <span className="werkruimte-melding" role="status">
            {bezig
              ? t("changes.compare.comparing")
              : uitkomst?.ok && uitkomst.verschillen === 0
                ? t("changes.compare.noDifferences")
                : ""}
          </span>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:close")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={!geldig || bezig} onClick={() => void start()}>
            {t("changes.compare.compare")}
          </button>
        </>
      }
    >
      <p className="werkruimte-uitleg">{t("changes.compare.intro")}</p>
      {keuze(t("changes.compare.original"), origineel, setOrigineel, "origineel")}
      {keuze(t("changes.compare.revised"), gewijzigd, setGewijzigd, "gewijzigd")}
      <div className="tw-raster2">
        <label className="werkruimte-veld">
          <span>{t("changes.compare.attributeTo")}</span>
          <input type="text" value={naam} onChange={(e) => setNaam(e.target.value)} />
        </label>
        <label className="werkruimte-veld">
          <span>{t("changes.compare.compareBy")}</span>
          <select value={korrel} onChange={(e) => setKorrel(e.target.value as "word" | "char")}>
            <option value="word">{t("changes.compare.words")}</option>
            <option value="char">{t("changes.compare.characters")}</option>
          </select>
        </label>
      </div>
      <label className="werkruimte-vink">
        <input type="checkbox" checked={accepteren} onChange={(e) => setAccepteren(e.target.checked)} />
        {t("changes.compare.acceptFirst")}
      </label>
      {fouttekst && <p className="werkruimte-fout">{fouttekst}</p>}
      {fout1.length > 0 && (
        <div className="werkruimte-fout" role="alert">
          <p>{t("changes.compare.failed")}</p>
          <ul>
            {fout1.map((m) => (
              <li key={m.tekst}>
                {m.tekst}
                {m.aantal > 1 ? ` ${t("changes.compare.times", { number: m.aantal })}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {uitkomst?.ok && uitkomst.verschillen > 0 && (
        <ul className="tw-verschillen">
          {uitkomst.wijzigingen.slice(0, 20).map((w) => {
            const v = verschilTekst(w);
            return (
              <li key={w.id}>
                {t("changes.compare.difference", { kind: v.soort })} {v.oud && <del>{v.oud}</del>} {v.nieuw && <ins>{v.nieuw}</ins>}
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={invoer}
        type="file"
        hidden
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          void file.arrayBuffer().then((buffer) => {
            const bestand = { naam: file.name, bytes: new Uint8Array(buffer) };
            if (kiesVoor.current === "origineel") setOrigineel({ bron: "bestand", bestand });
            else setGewijzigd({ bron: "bestand", bestand });
          });
        }}
      />
    </Dialoog>
  );
}
