import { Fragment, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Shapes, SquarePen } from "lucide-react";
import { useDocxCommand } from "@betteroffice/docx-react";
import { Groep } from "../../Ribbon";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { zichtbaarElement, useEditorApi } from "../../lint/editorApi";
import { Dialoog } from "../../werkruimte/Dialoog";
import { begin, engine, klaar, sluitStap, fout } from "../gedeeld/engine";
import { useUitvoeren } from "../gedeeld/ui";
import {
  VORMEN,
  STANDAARD_VORM,
  vormenLijst,
  optiesVanVorm,
  vormUitOpties,
  voegVormInSessie,
  wijzigVormInSessie,
  verwijderVormInSessie,
  groepeerVormen,
  hefGroepOp,
  zetVormLaag,
  maakSchema,
  type VormKader,
  type VormOpties,
  type VormPlek,
} from "./model";
import { vormBewerkbaar } from "./groep";
import { getekendeVormKaders } from "./kaders";
import { geometrieVan } from "../liniaal/geometriePlugin";
import "./vormen.css";

export function VormenGroep() {
  const { t } = useTranslation("writer"),
    api = useEditorApi(),
    uitvoeren = useUitvoeren();
  const invoegen = useDocxCommand("insertImage"),
    modus = useDocxCommand("editingMode");
  const [open, setOpen] = useState<"nieuw" | "bewerken" | null>(null);
  const disabled =
    !invoegen.state.enabled || modus.state.value === "suggesting";
  const toon = (soort: "nieuw" | "bewerken") =>
    uitvoeren(async (ref) => {
      await ref?.flushPendingInput();
      setOpen(soort);
    }, false);
  return (
    <>
      <Groep naam={t("shapes.group")}>
        <EigenKnop
          naam={t("shapes.insert")}
          icoon={Shapes}
          groot
          disabled={disabled}
          onClick={() => toon("nieuw")}
        />
        <EigenKnop
          naam={t("shapes.edit")}
          icoon={SquarePen}
          disabled={disabled}
          onClick={() => toon("bewerken")}
        />
      </Groep>
      {open && api.tekst() && (
        <VormenVenster nieuw={open === "nieuw"} sluit={() => setOpen(null)} />
      )}
    </>
  );
}

function VormenVenster({
  nieuw,
  sluit,
}: {
  nieuw: boolean;
  sluit: () => void;
}) {
  const { t } = useTranslation("writer"),
    { t: common } = useTranslation("common"),
    api = useEditorApi(),
    id = useId();
  const [e] = useState(() => engine(api.tekst()));
  // Dialoog maakt de achtergrond inert; houd het eigen documentvlak vooraf vast.
  const [vlak] = useState(() => zichtbaarElement(".docx-editor__viewport"));
  const [versie, setVersie] = useState(() => e.sessie.version());
  const [loc] = useState(() => e.sessie.selection()?.head ?? null);
  const [lijst, setLijst] = useState(() => vormenLijst(e.sessie));
  const [gekozen, setGekozen] = useState<string | null>(() =>
    nieuw ? null : (lijst[0]?.sleutel ?? null),
  );
  const [kind, setKind] = useState<number[] | null>(null);
  const [selectie, setSelectie] = useState<string[]>([]);
  const [opties, setOpties] = useState<VormOpties>(() =>
    !nieuw && lijst[0] ? optiesVanVorm(lijst[0].vorm) : STANDAARD_VORM,
  );
  const [bericht, setBericht] = useState("");
  const plek = lijst.find((v) => v.sleutel === gekozen);
  const doel =
    kind !== null
      ? kind.reduce<NonNullable<typeof plek>["vorm"] | undefined>(
          (v, i) => v?.children?.[i],
          plek?.vorm,
        )
      : plek?.vorm;
  const zet = (extra: Partial<VormOpties>) =>
    setOpties((o) => ({ ...o, ...extra }));
  function kies(v: VormPlek | null, child: number[] | null = null) {
    setGekozen(v?.sleutel ?? null);
    setKind(child);
    setBericht("");
    setOpties(
      v
        ? optiesVanVorm(
            child === null
              ? v.vorm
              : child.reduce((v, i) => v.children![i], v.vorm),
          )
        : STANDAARD_VORM,
    );
  }
  const bewerkbaar = !doel || vormBewerkbaar(doel),
    groepDoel = !!doel?.children?.length;
  async function leesKaders(keuze: VormPlek[]) {
    await api.tekst()?.whenLayoutComplete({ timeoutMs: 5000 });
    const g = geometrieVan(vlak);
    if (!g) throw new Error(t("shapes.errors.layout"));
    const versie = e.sessie.version();
    const ed = api.tekst()?.getEditorRef();
    const getekend = ed && getekendeVormKaders(g, ed, keuze, versie);
    if (getekend) return getekend;
    const antwoorden = await g.readAnchorGeometries(
      keuze.map((v) => ({
        kind: "range" as const,
        version: versie,
        range: {
          story: v.story,
          start: { paraId: v.loc.paraId, offset: v.loc.offset },
          end: { paraId: v.loc.paraId, offset: v.loc.offset + 1 },
          view: "accepted" as const,
        },
      })),
    );
    if (versie !== e.sessie.version()) throw new Error(t("shapes.changed"));
    const uit = new Map<string, VormKader>();
    antwoorden.forEach((a, i) => {
      if (!a.ok || a.unbuiltPages?.length)
        throw new Error(t("shapes.errors.layout"));
      const r = [...a.rects].sort(
          (a, b) => b.width * b.height - a.width * a.height,
        )[0],
        p = r && g.getPageRect(r.pageIndex);
      if (!r || !p) throw new Error(t("shapes.errors.layout"));
      const schaal = 9525 / g.layout.zoom;
      uit.set(keuze[i].sleutel, {
        x: Math.round((r.x - p.x) * schaal),
        y: Math.round((r.y - p.y) * schaal),
        breedte: Math.round(r.width * schaal),
        hoogte: Math.round(r.height * schaal),
        pagina: r.pageIndex,
      });
    });
    return uit;
  }
  function vervangKind(
    v: VormPlek["vorm"],
    pad: number[],
    nieuw: VormPlek["vorm"],
  ): VormPlek["vorm"] {
    if (!pad.length) return nieuw;
    return {
      ...v,
      scene: undefined,
      children: v.children!.map((c, i) =>
        i === pad[0] ? vervangKind(c, pad.slice(1), nieuw) : c,
      ),
    };
  }
  function onderdelen(
    v: VormPlek,
    children: VormPlek["vorm"][],
    pad: number[] = [],
  ): ReactNode {
    return children.map((c, j) => {
      const p = [...pad, j];
      return (
        <Fragment key={p.join(".")}>
          <button
            type="button"
            className="werkruimte-knop vorm-kind"
            style={{ marginInlineStart: p.length * 12 }}
            aria-pressed={JSON.stringify(kind) === JSON.stringify(p)}
            onClick={() => kies(v, p)}
          >
            {c.name || t("shapes.part") + " " + p.map((i) => i + 1).join(".")}
          </button>
          {c.children && onderdelen(v, c.children, p)}
        </Fragment>
      );
    });
  }
  async function groepActie(opheffen = false) {
    try {
      if (opheffen) {
        if (!plek) return;
        let k: VormKader | undefined;
        try {
          k = (await leesKaders([plek])).get(plek.sleutel);
        } catch {
          /* Inline-buren hebben geen meting nodig. */
        }
        voer(() => {
          hefGroepOp(e.sessie, plek, k);
          kies(null);
        });
      } else {
        const keuze = lijst.filter((v) => selectie.includes(v.sleutel));
        const inline = keuze.every(
          (v, i) =>
            !v.vorm.position &&
            v.loc.paraId === keuze[0].loc.paraId &&
            (i === 0 || v.index === keuze[i - 1].index + 1),
        );
        const k = inline ? undefined : await leesKaders(keuze);
        voer(() => {
          groepeerVormen(e.sessie, keuze, k);
          kies(null);
        });
      }
    } catch (error) {
      setBericht(fout(error));
    }
  }
  function voer(doe: () => void, sluiten = false) {
    try {
      if (e.sessie.version() !== versie) throw new Error(t("shapes.changed"));
      const voor = e.sessie.version();
      begin(e);
      try {
        doe();
      } finally {
        if (e.sessie.version() !== voor)
          klaar(e, [
            ...new Set([loc?.story ?? "body", ...lijst.map((v) => v.story)]),
          ]);
        else sluitStap(e);
      }
      setVersie(e.sessie.version());
      setLijst(vormenLijst(e.sessie));
      setSelectie([]);
      if (sluiten) {
        sluit();
        api.tekst()?.focus();
      }
    } catch (error) {
      setBericht(fout(error));
    }
  }
  const kleur = (veld: "vulling" | "lijn" | "tekstKleur", label: string) => (
    <label className="werkruimte-veld">
      <span>{label}</span>
      <div className="vorm-kleur">
        {veld !== "tekstKleur" && (
          <label>
            <input
              type="checkbox"
              checked={!!opties[veld]}
              onChange={(ev) =>
                zet({ [veld]: ev.target.checked ? "#2468ab" : "" })
              }
            />
            {t("shapes.enabled")}
          </label>
        )}
        <input
          type="color"
          aria-label={label}
          value={opties[veld] || "#000000"}
          disabled={!opties[veld]}
          onChange={(ev) => zet({ [veld]: ev.target.value })}
        />
      </div>
    </label>
  );
  return (
    <Dialoog
      titel={t("shapes.group")}
      sluit={sluit}
      className="tw-venster is-breed"
      acties={
        <>
          <button className="werkruimte-knop" onClick={sluit}>
            {common("cancel")}
          </button>
          <button
            className="werkruimte-knop is-primair"
            type="submit"
            form={id}
            disabled={!bewerkbaar}
          >
            {gekozen ? t("shapes.apply") : t("shapes.insert")}
          </button>
        </>
      }
    >
      <div className="vormen-editor">
        <aside className="vormen-lijst">
          <button
            type="button"
            className="werkruimte-knop"
            onClick={() => kies(null)}
          >
            {t("shapes.new")}
          </button>
          {(["proces", "organisatie"] as const).map((soort) => (
            <button
              key={soort}
              type="button"
              className="werkruimte-knop"
              onClick={() =>
                voer(() => {
                  if (!loc) throw new Error(t("shapes.cursor"));
                  voegVormInSessie(e.sessie, loc, maakSchema(soort, opties));
                }, true)
              }
            >
              {t("shapes." + soort)}
            </button>
          ))}
          {lijst.map((v, i) => (
            <div className="vorm-lijstregel" key={v.sleutel}>
              <input
                type="checkbox"
                aria-label={`${t("shapes.select")} ${i + 1}`}
                checked={selectie.includes(v.sleutel)}
                onChange={(ev) =>
                  setSelectie((s) =>
                    ev.target.checked
                      ? [...s, v.sleutel]
                      : s.filter((x) => x !== v.sleutel),
                  )
                }
              />
              <button
                type="button"
                className="werkruimte-knop"
                aria-pressed={gekozen === v.sleutel && kind === null}
                onClick={() => kies(v)}
              >
                {v.vorm.name ||
                  `${t(`shapes.types.${v.vorm.shapeType}`, { defaultValue: v.vorm.shapeType })} ${i + 1}`}
              </button>
              {gekozen === v.sleutel &&
                v.vorm.children &&
                onderdelen(v, v.vorm.children)}
            </div>
          ))}
          {!lijst.length && <p>{t("shapes.empty")}</p>}
          <p className="werkruimte-uitleg">{t("shapes.groupTip")}</p>
          <button
            type="button"
            className="werkruimte-knop"
            disabled={selectie.length < 2}
            onClick={() => void groepActie()}
          >
            {t("shapes.groupAction")}
          </button>
          <button
            type="button"
            className="werkruimte-knop"
            disabled={
              !plek?.vorm.children?.length || !vormBewerkbaar(plek.vorm)
            }
            onClick={() => void groepActie(true)}
          >
            {t("shapes.ungroup")}
          </button>
        </aside>
        <form
          id={id}
          className="vormen-formulier"
          onSubmit={(ev) => {
            ev.preventDefault();
            voer(() => {
              const vorm = vormUitOpties(opties, doel);
              if (plek) {
                const gewijzigd =
                  kind === null ? vorm : vervangKind(plek.vorm, kind, vorm);
                wijzigVormInSessie(e.sessie, plek, gewijzigd);
              } else {
                if (!loc) throw new Error(t("shapes.cursor"));
                voegVormInSessie(e.sessie, loc, vorm);
              }
            }, true);
          }}
        >
          {!bewerkbaar && (
            <p className="werkruimte-uitleg">{t("shapes.unsupported")}</p>
          )}
          <fieldset disabled={!bewerkbaar} className="vorm-velden">
            <label className="werkruimte-veld">
              <span>{t("shapes.type")}</span>
              <select
                value={opties.soort}
                disabled={!!doel?.children?.length}
                onChange={(ev) => {
                  const soort = ev.target.value as VormOpties["soort"];
                  zet({
                    soort,
                    ...(soort === "line" ? { vulling: "", hoogte: 0 } : {}),
                    ...(soort === "textBox"
                      ? { vulling: "", lijn: "#000000", tekstKleur: "#000000" }
                      : {}),
                  });
                }}
              >
                {!VORMEN.includes(opties.soort as (typeof VORMEN)[number]) && (
                  <option value={opties.soort}>{opties.soort}</option>
                )}
                {VORMEN.map((v) => (
                  <option key={v} value={v}>
                    {t(`shapes.types.${v}`)}
                  </option>
                ))}
              </select>
            </label>
            <div className="tw-raster2">
              {(["breedte", "hoogte"] as const).map((k) => (
                <label className="werkruimte-veld" key={k}>
                  <span>{t(`shapes.${k}`)}</span>
                  <input
                    type="number"
                    required
                    min={opties.soort === "line" ? "0" : "0.1"}
                    max="100"
                    step="0.01"
                    value={opties[k]}
                    onChange={(ev) => zet({ [k]: Number(ev.target.value) })}
                  />
                </label>
              ))}
            </div>
            <label className="werkruimte-veld">
              <span>{t("shapes.text")}</span>
              <textarea
                disabled={groepDoel}
                rows={3}
                value={opties.tekst}
                onChange={(ev) => zet({ tekst: ev.target.value })}
              />
            </label>
            <fieldset disabled={groepDoel} className="vorm-velden">
              <div className="tw-raster2">
                {kleur("vulling", t("shapes.fill"))}
                {kleur("lijn", t("shapes.outline"))}
                {kleur("tekstKleur", t("shapes.textColor"))}
                <label className="werkruimte-veld">
                  <span>{t("shapes.lineWidth")}</span>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.25"
                    value={opties.lijnDikte}
                    onChange={(ev) =>
                      zet({ lijnDikte: Number(ev.target.value) })
                    }
                  />
                </label>
              </div>
              <label className="werkruimte-vink">
                <input
                  type="checkbox"
                  checked={opties.schaduw}
                  onChange={(ev) => zet({ schaduw: ev.target.checked })}
                />
                {t("shapes.shadow")}
              </label>
            </fieldset>
            {groepDoel && (
              <p className="werkruimte-uitleg">{t("shapes.groupEdit")}</p>
            )}
            {kind === null && (
              <>
                <label className="werkruimte-veld">
                  <span>{t("shapes.wrap")}</span>
                  <select
                    value={opties.terugloop}
                    onChange={(ev) =>
                      zet({
                        terugloop: ev.target.value as VormOpties["terugloop"],
                      })
                    }
                  >
                    {(
                      [
                        "inline",
                        "square",
                        "tight",
                        "through",
                        "topAndBottom",
                        "behind",
                        "inFront",
                      ] as const
                    ).map((v) => (
                      <option value={v} key={v}>
                        {t(`shapes.wraps.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {opties.terugloop !== "inline" && (
                  <div className="tw-raster2">
                    {(["links", "boven"] as const).map((k) => (
                      <label key={k} className="werkruimte-veld">
                        <span>{t(`shapes.${k}`)}</span>
                        <input
                          type="number"
                          step="0.1"
                          value={opties[k]}
                          onChange={(ev) =>
                            zet({ [k]: Number(ev.target.value) })
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
            {kind !== null && (
              <div className="tw-raster2">
                {(["links", "boven"] as const).map((k) => (
                  <label className="werkruimte-veld" key={k}>
                    <span>{t("shapes." + k)}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={opties[k]}
                      onChange={(ev) => zet({ [k]: Number(ev.target.value) })}
                    />
                  </label>
                ))}
              </div>
            )}
            {plek && kind === null && (
              <div className="vorm-acties">
                <button
                  className="werkruimte-knop"
                  type="button"
                  disabled={opties.terugloop === "inline"}
                  onClick={() =>
                    voer(
                      () =>
                        zetVormLaag(
                          e.sessie,
                          plek,
                          true,
                          vormUitOpties(opties, plek.vorm),
                        ),
                      true,
                    )
                  }
                >
                  {t("shapes.front")}
                </button>
                <button
                  className="werkruimte-knop"
                  type="button"
                  disabled={opties.terugloop === "inline"}
                  onClick={() =>
                    voer(
                      () =>
                        zetVormLaag(
                          e.sessie,
                          plek,
                          false,
                          vormUitOpties(opties, plek.vorm),
                        ),
                      true,
                    )
                  }
                >
                  {t("shapes.back")}
                </button>
                <button
                  className="werkruimte-knop"
                  type="button"
                  onClick={() =>
                    voer(() => verwijderVormInSessie(e.sessie, plek), true)
                  }
                >
                  {t("shapes.remove")}
                </button>
              </div>
            )}
          </fieldset>
        </form>
      </div>
      {bericht && (
        <p role="alert" className="werkruimte-fout">
          {bericht}
        </p>
      )}
    </Dialoog>
  );
}
