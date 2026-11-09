import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Link, Shapes, SquarePen, List } from "lucide-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Actie, Groep } from "../Ribbon";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import {
  alleenLezen,
  bewerktTekst,
  leesSelectie,
  rekenbladHost,
} from "../lint/rekenblad-opdrachten";
import {
  adres as celAdres,
  bereikA1,
  ontleedAdres,
} from "../lint/rekenblad-logica";
import { useEditorApi, useEditorZichtbaar } from "../lint/editorApi";
import { useSneltoetsen } from "../lint/sneltoetsen";
import {
  bewaarKoppeling,
  leesKoppeling,
  openKoppeling,
  type KoppelingDoel,
  type Koppelingsoort,
} from "./koppelingen";
import { tekenobjecten } from "./tekenAnkers";
import { bewerkObjectPakket, registreerObjectVenster } from "./objectBewerking";
import {
  voegTekenobjectToe,
  wijzigTekenobject,
  type NieuwObject,
  type Tekenobject,
} from "./tekenobjecten";
import type { Herladen } from "../lint/editorApi";
import { beeldAfmetingen } from "./beeldAfmetingen";

interface ObjectDoel {
  versie: string;
  blad: number;
  nieuw?: NieuwObject;
  object?: Tekenobject;
}

export function useObjectenGroep(uit: boolean) {
  const { t } = useTranslation("spreadsheet");
  const { rekenblad: api, herlaad, bestandKoppeling } = useEditorApi();
  const zichtbaar = useEditorZichtbaar();
  const [doel, setDoel] = useState<KoppelingDoel | null>(null);
  const [fout, setFout] = useState("");
  const [objectDoel, setObjectDoel] = useState<ObjectDoel | null>(null);
  const [lijst, setLijst] = useState(false);
  const bestand = useRef<HTMLInputElement>(null);
  const beeldDoel = useRef<ObjectDoel | null>(null);
  useEffect(() => {
    const host = rekenbladHost();
    if (!api || !host || !zichtbaar) return;
    const klik = (e: MouseEvent) => {
      if (
        !(e.ctrlKey || e.metaKey) ||
        e.button !== 0 ||
        !(e.target instanceof HTMLCanvasElement)
      )
        return;
      const p = api.getPositionAtPoint(e.clientX, e.clientY);
      if (!p) return;
      const bereik = { top: p.row, left: p.col, bottom: p.row, right: p.col };
      const link = leesKoppeling(api, {
        blad: p.sheet,
        sheetId: api.handle.sheetInfo().sheetIds[p.sheet],
        focus: p,
        bereik,
      });
      const adres = link?.location ?? link?.externalTarget;
      if (!link || !adres) return;
      const soort = link.location
        ? "cel"
        : /^(https?:|mailto:)/i.test(adres)
          ? "web"
          : "bestand";
      if (!link.formule && soort !== "bestand") return;
      e.preventDefault();
      e.stopPropagation();
      void openKoppeling(api, soort, adres, bestandKoppeling).catch((error) =>
        setFout(tekstVan(error)),
      );
    };
    host.addEventListener("click", klik, true);
    return () => host.removeEventListener("click", klik, true);
  }, [api, bestandKoppeling, zichtbaar]);
  useEffect(() => {
    setDoel(null);
    setObjectDoel(null);
    setLijst(false);
    return api
      ? registreerObjectVenster(api.handle, (object, versie) => {
          setObjectDoel({
            versie: versie ?? api.handle.version(),
            blad: object.blad,
            object,
          });
          setLijst(false);
        })
      : undefined;
  }, [api]);
  const nieuw = (vorm: string, tekst = ""): ObjectDoel | null => {
    if (!api || alleenLezen(api)) return null;
    const selectie = leesSelectie(api);
    return {
      versie: api.handle.version(),
      blad: selectie.blad,
      nieuw: {
        naam: t(tekst ? "objects.textBox" : "objects.shape"),
        vorm,
        tekst,
        vulling: tekst ? "none" : "#E9F0E8",
        lijn: "#36363E",
        plek: { ...selectie.focus, x: 0, y: 0, breedte: 200, hoogte: 100 },
      },
    };
  };
  const open = async () => {
    if (!api || alleenLezen(api)) return;
    try {
      const versie = await api.version();
      setDoel({ ...leesSelectie(api), versie });
      setFout("");
    } catch (e) {
      setFout(tekstVan(e));
    }
  };
  useSneltoetsen(
    rekenbladHost,
    [
      {
        toets: "Ctrl+K",
        beschikbaar: () => !!api && !uit && !bewerktTekst(),
        uitvoeren: () => void open(),
      },
    ],
    "rekenblad",
  );
  return {
    groep: (
      <Groep naam={t("objects.group")}>
        <Actie
          naam={t("objects.link")}
          icoon={Link}
          disabled={uit}
          onClick={() => void open()}
        />
        <Actie
          naam={t("objects.image")}
          icoon={ImagePlus}
          disabled={uit || !herlaad}
          onClick={() => {
            beeldDoel.current = nieuw("rect");
            bestand.current?.click();
          }}
        />
        <Actie
          naam={t("objects.shape")}
          icoon={Shapes}
          disabled={uit || !herlaad}
          onClick={() => setObjectDoel(nieuw("rect"))}
        />
        <Actie
          naam={t("objects.textBox")}
          icoon={SquarePen}
          disabled={uit || !herlaad}
          onClick={() => setObjectDoel(nieuw("rect", t("objects.textBox")))}
        />
        <Actie
          naam={t("objects.manage")}
          icoon={List}
          disabled={uit || !herlaad}
          onClick={() => setLijst(true)}
        />
        <input
          ref={bestand}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/gif,image/bmp,image/webp"
          aria-label={t("objects.imageFile")}
          onChange={async (e) => {
            const file = e.target.files?.[0],
              target = beeldDoel.current;
            e.target.value = "";
            if (!file || !target || !api) return;
            let bitmap: ImageBitmap | undefined;
            try {
              if (file.size > 20 * 1024 * 1024)
                throw new Error(t("objects.invalidImage"));
              let bytes = new Uint8Array(await file.arrayBuffer());
              if (!beeldAfmetingen(bytes))
                throw new Error(t("objects.invalidImage"));
              bitmap = await createImageBitmap(file);
              if (
                !bitmap.width ||
                !bitmap.height ||
                bitmap.width * bitmap.height > 64 * 1024 * 1024
              )
                throw new Error(t("objects.invalidImage"));
              if (!/image\/(png|jpeg|gif|bmp)/.test(file.type)) {
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
                const blob = await new Promise<Blob>((resolve, reject) =>
                  canvas.toBlob(
                    (b) =>
                      b
                        ? resolve(b)
                        : reject(new Error(t("objects.invalidImage"))),
                    "image/png",
                  ),
                );
                bytes = new Uint8Array(await blob.arrayBuffer());
              }
              const schaal = Math.min(
                1,
                480 / bitmap.width,
                320 / bitmap.height,
              );
              setObjectDoel({
                ...target,
                nieuw: {
                  ...target.nieuw!,
                  naam: file.name,
                  afbeelding: bytes,
                  plek: {
                    ...target.nieuw!.plek,
                    breedte: bitmap.width * schaal,
                    hoogte: bitmap.height * schaal,
                  },
                },
              });
            } catch (e) {
              setFout(tekstVan(e));
            } finally {
              bitmap?.close();
            }
          }}
        />
      </Groep>
    ),
    venster: zichtbaar ? (
      <>
        {fout && (
          <Paneel titel={t("objects.link")} sluiten={() => setFout("")}>
            <p role="alert">{fout}</p>
          </Paneel>
        )}
        {api && doel && (
          <KoppelingVenster
            api={api}
            doel={doel}
            sluiten={() => {
              setDoel(null);
              api.focus();
            }}
          />
        )}
        {api && herlaad && objectDoel && (
          <ObjectVenster
            key={`${objectDoel.versie}:${objectDoel.object?.id ?? "nieuw"}`}
            api={api}
            herlaad={herlaad}
            doel={objectDoel}
            sluiten={() => {
              setObjectDoel(null);
              api.focus();
            }}
          />
        )}
        {api && lijst && (
          <Paneel titel={t("objects.manage")} sluiten={() => setLijst(false)}>
            <div className="rekenblad-objectlijst">
              {tekenobjecten(
                api.handle,
                api.handle.sheetInfo().activeSheet,
              ).map((o) => (
                <button
                  key={`${o.tekening}:${o.id}`}
                  onClick={() => {
                    setObjectDoel({
                      versie: api.handle.version(),
                      blad: o.blad,
                      object: o,
                    });
                    setLijst(false);
                  }}
                >
                  {o.naam}
                </button>
              ))}
            </div>
          </Paneel>
        )}
      </>
    ) : null,
  };
}

function ObjectVenster({
  api,
  herlaad,
  doel,
  sluiten,
}: {
  api: XlsxEditorApi;
  herlaad: Herladen;
  doel: ObjectDoel;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const bron = doel.object ?? doel.nieuw!,
    origineel = doel.object;
  const [naam, setNaam] = useState(bron.naam),
    [tekst, setTekst] = useState(bron.tekst ?? "");
  const [vorm, setVorm] = useState(bron.vorm ?? "rect"),
    [vulling, setVulling] = useState(bron.vulling ?? "#E9F0E8"),
    [lijn, setLijn] = useState(bron.lijn ?? "#36363E");
  const [cel, setCel] = useState(celAdres(bron.plek)),
    [plek, setPlek] = useState(bron.plek);
  const [bezig, setBezig] = useState(false),
    [fout, setFout] = useState("");
  const afbeelding =
    !!doel.nieuw?.afbeelding || origineel?.soort === "afbeelding";
  const uit = bezig || !!origineel?.beveiligd || alleenLezen(api);
  const bewaar = async (verwijder = false) => {
    if (uit) return;
    setBezig(true);
    setFout("");
    try {
      const anker = ontleedAdres(cel);
      if (!anker) throw new Error(t("objects.invalidSize"));
      const plaats = { ...plek, ...anker };
      await bewerkObjectPakket(
        api,
        herlaad,
        doel.versie,
        doel.blad,
        (bytes) =>
          origineel
            ? wijzigTekenobject(bytes, origineel, verwijder ? null : plaats, {
                ...(naam !== origineel.naam ? { naam } : {}),
                ...(tekst !== origineel.tekst ? { tekst } : {}),
                ...(vulling !== origineel.vulling ? { vulling } : {}),
                ...(lijn !== origineel.lijn ? { lijn } : {}),
              })
            : voegTekenobjectToe(bytes, doel.blad, {
                ...doel.nieuw!,
                naam,
                tekst,
                vorm,
                vulling,
                lijn,
                plek: plaats,
              }),
        plaats,
      );
      sluiten();
    } catch (e) {
      setFout(tekstVan(e));
      setBezig(false);
    }
  };
  return (
    <Paneel
      titel={t(afbeelding ? "objects.image" : "objects.shape")}
      sluiten={sluiten}
    >
      <form
        className="rekenblad-objectformulier"
        onSubmit={(e) => {
          e.preventDefault();
          void bewaar();
        }}
      >
        <label>
          {t("objects.name")}
          <input
            autoFocus
            value={naam}
            disabled={uit}
            onChange={(e) => setNaam(e.target.value)}
          />
        </label>
        <label>
          {t("objects.anchor")}
          <input
            value={cel}
            disabled={uit}
            onChange={(e) => setCel(e.target.value)}
          />
        </label>
        {(["breedte", "hoogte", "x", "y"] as const).map((key) => (
          <label key={key}>
            {t(`objects.${key}`)}
            <input
              type="number"
              step="any"
              min={key === "x" || key === "y" ? 0 : 1}
              max={key === "x" || key === "y" ? undefined : 16384}
              value={Number(plek[key].toFixed(3))}
              disabled={uit}
              onChange={(e) =>
                setPlek({ ...plek, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
        {!afbeelding && origineel?.soort !== "onbekend" && (
          <>
            {!origineel && (
              <label>
                {t("objects.shape")}
                <select
                  value={vorm}
                  disabled={uit}
                  onChange={(e) => setVorm(e.target.value)}
                >
                  {[
                    "rect",
                    "roundRect",
                    "ellipse",
                    "triangle",
                    "diamond",
                    "line",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {t(`objects.shapes.${v}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {t("objects.text")}
              <textarea
                aria-label={t("objects.text")}
                value={tekst}
                disabled={uit}
                onChange={(e) => setTekst(e.target.value)}
              />
            </label>
            <label>
              {t("objects.fill")}
              <select
                value={vulling === "none" ? "none" : "color"}
                disabled={uit}
                onChange={(e) =>
                  setVulling(e.target.value === "none" ? "none" : "#E9F0E8")
                }
              >
                <option value="none">{t("objects.noFill")}</option>
                <option value="color">{t("objects.color")}</option>
              </select>
              {vulling !== "none" && (
                <input
                  aria-label={t("objects.fill")}
                  type="color"
                  value={vulling}
                  disabled={uit}
                  onChange={(e) => setVulling(e.target.value)}
                />
              )}
            </label>
            <label>
              {t("objects.line")}
              <input
                type="color"
                value={lijn === "none" ? "#36363E" : lijn}
                disabled={uit}
                onChange={(e) => setLijn(e.target.value)}
              />
            </label>
          </>
        )}
        <p role="note">{t("objects.reloadHistory")}</p>
        {(origineel?.soort === "onbekend" ||
          (origineel?.soort === "afbeelding" && !origineel.mime)) && (
          <p role="note">{t("objects.previewLimited")}</p>
        )}
        {origineel?.beveiligd && <p role="alert">{t("objects.protected")}</p>}
        {fout && <p role="alert">{fout}</p>}
        <footer>
          <button type="submit" disabled={uit}>
            {t("objects.save")}
          </button>
          {origineel && (
            <button
              type="button"
              disabled={uit}
              onClick={() => void bewaar(true)}
            >
              {t("objects.removeObject")}
            </button>
          )}
          <button type="button" disabled={bezig} onClick={sluiten}>
            {t("common:cancel")}
          </button>
        </footer>
      </form>
    </Paneel>
  );
}

function KoppelingVenster({
  api,
  doel,
  sluiten,
}: {
  api: XlsxEditorApi;
  doel: KoppelingDoel;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const { bestandKoppeling } = useEditorApi();
  const [bestaand] = useState(() => leesKoppeling(api, doel));
  const [soort, setSoort] = useState<Koppelingsoort>(
    bestaand?.location
      ? "cel"
      : bestaand?.externalTarget &&
          !/^(https?:|mailto:)/i.test(bestaand.externalTarget)
        ? "bestand"
        : "web",
  );
  const [adres, setAdres] = useState(
    bestaand?.location ?? bestaand?.externalTarget ?? "",
  );
  const [tekst, setTekst] = useState(() => {
    const r = api.handle.readCells({
      ranges: [
        {
          sheetId: doel.sheetId,
          range: {
            kind: "a1",
            a1: bereikA1({
              ...doel.bereik,
              bottom: doel.bereik.top,
              right: doel.bereik.left,
            }),
          },
        },
      ],
    });
    return r.ok ? (r.ranges[0].cells[0]?.[0]?.displayText ?? "") : "";
  });
  const [tip, setTip] = useState(bestaand?.tooltip ?? "");
  const [status, setStatus] = useState("");
  const [bezig, setBezig] = useState(false);
  const formule = api.handle.cell(
    doel.blad,
    doel.bereik.top,
    doel.bereik.left,
  ).isFormula;
  const bewaar = async (verwijder = false) => {
    setBezig(true);
    setStatus("");
    try {
      await bewaarKoppeling(
        api,
        doel,
        verwijder ? null : { soort, adres, tekst, tip },
      );
      sluiten();
    } catch (e) {
      setStatus(tekstVan(e));
      setBezig(false);
    }
  };
  return (
    <Paneel titel={t("objects.link")} sluiten={sluiten}>
      <form
        className="rekenblad-objectformulier"
        onSubmit={(e) => {
          e.preventDefault();
          void bewaar();
        }}
      >
        <p>
          {api.handle.sheetInfo().sheetNames[doel.blad]}!{bereikA1(doel.bereik)}
        </p>
        <label>
          {t("objects.linkType")}
          <select
            aria-label={t("objects.linkType")}
            value={soort}
            disabled={bezig}
            onChange={(e) => setSoort(e.target.value as Koppelingsoort)}
          >
            <option value="web">{t("objects.web")}</option>
            <option value="bestand">{t("objects.file")}</option>
            <option value="cel">{t("objects.cell")}</option>
          </select>
        </label>
        <label>
          {t("objects.address")}
          <input
            autoFocus
            value={adres}
            disabled={bezig}
            onChange={(e) => setAdres(e.target.value)}
            placeholder={
              soort === "cel"
                ? "'Sheet 1'!A1"
                : soort === "web"
                  ? "https://"
                  : "../Report.xlsx"
            }
          />
        </label>
        <label>
          {t("objects.display")}
          <input
            value={tekst}
            disabled={bezig || formule}
            onChange={(e) => setTekst(e.target.value)}
          />
        </label>
        <label>
          {t("objects.tooltip")}
          <input
            value={tip}
            disabled={bezig}
            onChange={(e) => setTip(e.target.value)}
          />
        </label>
        {status && <p role="alert">{status}</p>}
        <footer>
          <button type="submit" disabled={bezig || !adres.trim()}>
            {t("objects.save")}
          </button>
          <button
            type="button"
            disabled={bezig || !adres.trim()}
            onClick={() => {
              setStatus("");
              void openKoppeling(api, soort, adres, bestandKoppeling)
                .then(sluiten)
                .catch((e) => setStatus(tekstVan(e)));
            }}
          >
            {t("objects.openLink")}
          </button>
          {bestaand && !bestaand.formule && (
            <button
              type="button"
              disabled={bezig}
              onClick={() => void bewaar(true)}
            >
              {t("objects.remove")}
            </button>
          )}
          <button type="button" onClick={sluiten} disabled={bezig}>
            {t("common:cancel")}
          </button>
        </footer>
      </form>
    </Paneel>
  );
}
