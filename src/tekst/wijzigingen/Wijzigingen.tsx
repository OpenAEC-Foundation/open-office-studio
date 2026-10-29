/**
 * Wijzigingen-werkstroom (#28): alles accepteren of weigeren (ook in de
 * selectie of alleen voor getoonde auteurs), accepteren en naar de volgende,
 * markeringsweergave (alle / eenvoudig / geen / origineel), filter per auteur
 * en een deelvenster met de lijst van wijzigingen.
 */
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCheck, Eye, FileDiff, ListChecks, Users, X } from "lucide-react";
import { DocxEditor, useDocxCommand, useDocxCommands, type DocxEditorRef } from "@betteroffice/docx-react";
import { Trans, useTranslation } from "react-i18next";
import i18next from "../../i18n/config";
import { useEngineVertaling } from "../../i18n/engine";
import { Actie, Groep, RibbonFout } from "../../Ribbon";
import { useEditorApi, zichtbaarElement } from "../../lint/editorApi";
import { Keuzemenu, useEditorTik, useUitvoeren } from "../gedeeld/ui";
import { fout } from "../gedeeld/engine";
import { maakWinkel } from "../gedeeld/winkel";
import { TEKST_PLUGINS, zetMarkeringen, type Markering } from "../gedeeld/markering";
import { zetPaneel } from "../zoeken/paneelstaat";
import { besluit, lijst, voorbeeld, type Besluit } from "./opdrachten";
import { WEERGAVEN, auteurs, getoond, samenvatting, soortNaam, toonDatum, weergaveNaam, weergaveUitleg, type Weergave } from "./logica";

export const wijzigingenWinkel = maakWinkel({
  paneel: false,
  vergelijken: false,
  weergave: "alle" as Weergave,
  verborgen: new Set<string>() as ReadonlySet<string>,
});

export function WijzigingenGroepen() {
  useEditorTik();
  const api = useEditorApi().tekst;
  const meld = useContext(RibbonFout);
  const { t } = useTranslation("writer");
  const uitvoeren = useUitvoeren();
  const opdrachten = useDocxCommands();
  const staat = wijzigingenWinkel.gebruik(api);
  const invoegen = useDocxCommand("insertPageBreak").state.enabled;
  const modus = useDocxCommand("editingMode").state.value;
  const bewerkbaar = invoegen || modus === "suggesting";
  const alle = lijst(api());
  const zichtbaar = getoond(alle, staat.verborgen);
  const geen = !zichtbaar.length;
  const filter = staat.verborgen.size > 0;

  function doe(wat: Besluit, reikwijdte: Parameters<typeof besluit>[2]) {
    uitvoeren((ref) => {
      const aantal = besluit(ref, wat, { verborgen: staat.verborgen, ...reikwijdte });
      if (!aantal)
        meld(
          i18next.t(
            `writer:changes.none.${wat === "accepteren" ? "accept" : "reject"}${reikwijdte?.selectie ? "Selection" : "Document"}`,
          ),
        );
    });
  }
  function enVolgende(wat: Besluit) {
    void opdrachten.execute(wat === "accepteren" ? "reviewAccept" : "reviewReject", null).then((r) => {
      if (!r.ok) return meld(r.failure.message);
      void opdrachten.execute("reviewNext", null);
    });
  }
  const menu = (wat: Besluit) => {
    const a = wat === "accepteren";
    return [
      { naam: t(a ? "changes.menu.acceptNext" : "changes.menu.rejectNext"), kies: () => enVolgende(wat), disabled: geen },
      "scheiding" as const,
      {
        naam: filter
          ? t(a ? "changes.menu.acceptAllShown" : "changes.menu.rejectAllShown")
          : t(a ? "changes.menu.acceptAll" : "changes.menu.rejectAll"),
        kies: () => doe(wat, {}),
        disabled: geen,
      },
      {
        naam: t(a ? "changes.menu.acceptSelection" : "changes.menu.rejectSelection"),
        kies: () => doe(wat, { selectie: true }),
        disabled: geen,
      },
      ...(a
        ? [
            {
              naam: t("changes.menu.acceptAllStop"),
              kies: () => (doe(wat, {}), void opdrachten.execute("editingMode", { mode: "editing" })),
              disabled: geen,
            },
          ]
        : []),
    ];
  };
  return (
    <>
      <Groep naam={t("changes.groups.all")}>
        <Keuzemenu naam={t("changes.accept")} icoon={CheckCheck} groot disabled={!bewerkbaar} items={menu("accepteren")} uitleg={t("changes.acceptRejectTip")} />
        <Keuzemenu naam={t("changes.reject")} icoon={X} groot disabled={!bewerkbaar} items={menu("weigeren")} uitleg={t("changes.acceptRejectTip")} />
      </Groep>
      <Groep naam={t("changes.groups.view")}>
        <Keuzemenu
          naam={WEERGAVEN.includes(staat.weergave) ? weergaveNaam(staat.weergave) : t("changes.markup")}
          icoon={Eye}
          groot
          uitleg={t("changes.markupTip")}
          items={WEERGAVEN.map((w) => ({
            naam: weergaveNaam(w),
            uitleg: weergaveUitleg(w),
            gekozen: staat.weergave === w,
            kies: () => wijzigingenWinkel.zet(api, { weergave: w }),
          }))}
        />
        <div className="ribbon-stapel">
          <Keuzemenu
            naam={filter ? t("changes.authorsFiltered") : t("changes.authors")}
            icoon={Users}
            uitleg={t("changes.authorsTip")}
            items={[
              { naam: t("changes.allAuthors"), gekozen: !filter, kies: () => wijzigingenWinkel.zet(api, { verborgen: new Set() }) },
              "scheiding",
              ...auteurs(alle).map((a) => ({
                naam: t("changes.authorWithCount", { name: a.naam || t("changes.unknownAuthor"), number: a.aantal }),
                gekozen: !staat.verborgen.has(a.naam),
                kies: () =>
                  wijzigingenWinkel.zet(api, (oud) => {
                    const verborgen = new Set(oud.verborgen);
                    if (verborgen.has(a.naam)) verborgen.delete(a.naam);
                    else verborgen.add(a.naam);
                    return { verborgen };
                  }),
              })),
            ]}
          />
          <Actieknop
            naam={t("changes.pane")}
            uitleg={t("changes.paneTip")}
            actief={staat.paneel}
            onClick={() => {
              const open = !staat.paneel;
              if (open) zetPaneel(api, { zoeken: false });
              wijzigingenWinkel.zet(api, { paneel: open });
            }}
          />
        </div>
      </Groep>
      <Groep naam={t("changes.groups.compare")}>
        <Actie
          naam={t("changes.compare.compare")}
          icoon={FileDiff}
          groot
          title={t("changes.compareTip")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wijzigingenWinkel.zet(api, { vergelijken: true })}
        />
      </Groep>
    </>
  );
}

function Actieknop({ naam, uitleg, actief, onClick }: { naam: string; uitleg: string; actief: boolean; onClick: () => void }) {
  return (
    <button type="button" className="ribbon-actie" aria-pressed={actief} aria-label={naam} title={uitleg} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <ListChecks size={17} strokeWidth={1.65} />
      <span>{naam}</span>
    </button>
  );
}

/** Deelvenster links met de lijst van wijzigingen. */
export function WijzigingenPaneel() {
  const tik = useEditorTik();
  const api = useEditorApi().tekst;
  const meld = useContext(RibbonFout);
  const { t } = useTranslation("writer");
  const staat = wijzigingenWinkel.gebruik(api);
  const [plek, setPlek] = useState<{ left: number; top: number; height: number } | null>(null);
  const alle = useMemo(() => lijst(api()), [tik, api]);
  const zichtbaar = getoond(alle, staat.verborgen);
  const telling = samenvatting(zichtbaar);
  useLayoutEffect(() => {
    const vlak = zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__dock-area");
    const meet = () => {
      const r = vlak?.getBoundingClientRect();
      if (r) setPlek({ left: r.left + 8, top: r.top + 8, height: Math.max(240, r.height - 16) });
    };
    meet();
    vlak?.classList.add("tw-met-zoekpaneel");
    const waarnemer = new ResizeObserver(meet);
    if (vlak) waarnemer.observe(vlak);
    window.addEventListener("resize", meet);
    return () => {
      vlak?.classList.remove("tw-met-zoekpaneel");
      waarnemer.disconnect();
      window.removeEventListener("resize", meet);
    };
  }, []);
  function kies(id: string) {
    const ref = api();
    if (ref && !ref.scrollToChangeId(Number(id))) meld(i18next.t("writer:changes.panel.notFound"));
  }
  function een(id: string, wat: Besluit) {
    try {
      besluit(api(), wat, { ids: [id] });
    } catch (e) {
      meld(fout(e));
    }
  }
  const sluit = () => {
    wijzigingenWinkel.zet(api, { paneel: false });
    requestAnimationFrame(() => api()?.focus());
  };
  if (!plek) return null;
  return createPortal(
    <aside
      className="tw-zoekpaneel tw-wijzigingenpaneel"
      aria-label={t("changes.panel.title")}
      style={{ left: plek.left, top: plek.top, maxHeight: plek.height }}
      onKeyDown={(e) => e.key === "Escape" && sluit()}
    >
      <header>
        <h2>{t("changes.panel.title")}</h2>
        <button type="button" className="tw-zoek-sluit" aria-label={t("common:close")} title={t("common:closeEsc")} onClick={sluit}>
          <X size={15} />
        </button>
      </header>
      <p className="tw-zoek-telling" role="status">
        {telling.totaal
          ? t(telling.opmaak ? "changes.panel.summaryWithFormatting" : "changes.panel.summary", {
              count: telling.totaal,
              inserted: telling.ingevoegd,
              deleted: telling.verwijderd,
              formatting: telling.opmaak,
            })
          : t("changes.panel.none")}
        {staat.verborgen.size > 0 && ` ${t("changes.panel.hiddenAuthors", { number: alle.length - zichtbaar.length })}`}
      </p>
      <ol className="tw-zoek-resultaten tw-wijzigingen">
        {zichtbaar.map((r) => (
          <li key={r.revisionId}>
            <div className="tw-wijziging">
              <button type="button" className="tw-wijziging-tekst" onClick={() => kies(r.revisionId)}>
                <span className="tw-zoek-plek">
                  <strong>{r.author || t("changes.unknownAuthor")}</strong> · {soortNaam(r.kind)} · {toonDatum(r.date)}
                </span>
                <span className={`tw-wijziging-${/del/i.test(r.kind) ? "weg" : "erbij"}`}>{r.preview || "—"}</span>
              </button>
              <span className="tw-wijziging-knoppen">
                <button type="button" aria-label={t("changes.panel.acceptItem", { preview: r.preview })} title={t("changes.panel.accept")} onClick={() => een(r.revisionId, "accepteren")}>
                  <Check size={14} />
                </button>
                <button type="button" aria-label={t("changes.panel.rejectItem", { preview: r.preview })} title={t("changes.panel.reject")} onClick={() => een(r.revisionId, "weigeren")}>
                  <X size={14} />
                </button>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </aside>,
    document.body,
  );
}

/**
 * Alleen-lezen voorbeeld voor de weergaven ‘eenvoudig’, ‘geen markeringen’ en
 * ‘origineel’. De engine kan bijgehouden wijzigingen in het document zelf
 * niet verbergen; daarom tonen we een kopie waarin ze zijn afgehandeld.
 */
export function MarkeringVoorbeeld() {
  const { tekst: api, herlaad } = useEditorApi();
  const staat = wijzigingenWinkel.gebruik(api);
  const { t } = useTranslation("writer");
  const engineVertaling = useEngineVertaling();
  const [inhoud, setInhoud] = useState<{ bytes: Uint8Array; gewijzigd: string[]; aantal: number } | null>(null);
  const [fouttekst, setFouttekst] = useState("");
  const [plek, setPlek] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const voorbeeldRef = useRef<DocxEditorRef>(null);
  const weergave = staat.weergave;
  useEffect(() => {
    if (weergave === "alle") {
      setInhoud(null);
      return;
    }
    let actief = true;
    setFouttekst("");
    void (async () => {
      // Via de opslagkoppeling van de editor: ref.save() zou ‘Opslaan als’ openen.
      if (!herlaad) throw new Error(i18next.t("writer:general.documentNotReady"));
      const uit = await voorbeeld(await herlaad.bytes(), weergave === "origineel" ? "weigeren" : "accepteren");
      if (actief) setInhoud(uit);
    })().catch((e) => actief && setFouttekst(fout(e)));
    return () => {
      actief = false;
      zetMarkeringen("wijzigingen", []);
    };
  }, [weergave, api, herlaad]);
  useLayoutEffect(() => {
    if (weergave === "alle") return;
    const vlak = zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__dock-area");
    const meet = () => {
      const r = vlak?.getBoundingClientRect();
      if (r) setPlek({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    meet();
    const waarnemer = new ResizeObserver(meet);
    if (vlak) waarnemer.observe(vlak);
    return () => waarnemer.disconnect();
  }, [weergave]);
  async function strepen() {
    const ref = voorbeeldRef.current;
    if (!ref || weergave !== "eenvoudig" || !inhoud?.gewijzigd.length) return;
    const gelezen = await ref.readParagraphs({ view: "accepted", paraIds: inhoud.gewijzigd });
    if (!gelezen.ok) return;
    const markeringen: Markering[] = gelezen.paragraphs.map((p) => ({
      soort: "balk",
      doel: { kind: "range", version: gelezen.version, range: { story: p.story, start: { paraId: p.paraId, offset: 0 }, end: { paraId: p.paraId, offset: p.text.length }, view: "accepted" } },
    }));
    zetMarkeringen("wijzigingen", markeringen);
  }
  if (weergave === "alle" || !plek) return null;
  const naam = weergaveNaam(weergave);
  return createPortal(
    <div className="tw-voorbeeld" style={plek} role="region" aria-label={t("changes.preview.region", { name: naam })}>
      <div className="tw-voorbeeld-balk">
        <Eye size={15} aria-hidden="true" />
        <span>
          {inhoud ? (
            <Trans
              t={t}
              i18nKey={weergave === "origineel" ? "changes.preview.readOnlyRejected" : "changes.preview.readOnlyAccepted"}
              count={inhoud.aantal}
              values={{ name: naam }}
              components={{ strong: <strong /> }}
            />
          ) : (
            <Trans t={t} i18nKey="changes.preview.readOnly" values={{ name: naam }} components={{ strong: <strong /> }} />
          )}
        </span>
        <button type="button" onClick={() => wijzigingenWinkel.zet(api, { weergave: "alle" })}>
          {t("changes.preview.back")}
        </button>
      </div>
      {fouttekst ? (
        <p className="tw-voorbeeld-melding">{fouttekst}</p>
      ) : !inhoud ? (
        <p className="tw-voorbeeld-melding">{t("changes.preview.making")}</p>
      ) : (
        <DocxEditor
          key={`${weergave}-${inhoud.bytes.byteLength}`}
          ref={voorbeeldRef}
          documentBuffer={inhoud.bytes}
          readOnly
          showToolbar={false}
          showRuler={false}
          showFileOpen={false}
          showHelpMenu={false}
          plugins={TEKST_PLUGINS}
          colorMode="light"
          i18n={engineVertaling.tekst}
          className="tw-voorbeeld-editor"
          onFirstPagePainted={() => void strepen()}
          loadingIndicator={<p className="tw-voorbeeld-melding">{t("changes.preview.loading")}</p>}
        />
      )}
    </div>,
    document.body,
  );
}
