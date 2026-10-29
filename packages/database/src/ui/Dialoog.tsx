/**
 * Toegankelijke modale dialogen (role="dialog", focus vasthouden en
 * terugzetten, Escape) en een kleine dienst om ze als belofte te gebruiken:
 * bevestigen, tekst vragen, queryparameters en VBA-MsgBox/InputBox.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, HelpCircle, Info, XCircle } from "lucide-react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";

const FOCUSBAAR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialoog({
  titel,
  children,
  onSluit,
  acties,
  breed,
  className = "",
}: {
  titel: string;
  children: ReactNode;
  /** Escape of de sluitknop; ontbreekt = niet zonder keuze te sluiten. */
  onSluit?: () => void;
  acties?: ReactNode;
  breed?: boolean;
  className?: string;
}) {
  const vlak = useRef<HTMLDivElement>(null);
  const titelId = useId();
  const sluit = useRef(onSluit);
  sluit.current = onSluit;
  useEffect(() => {
    const vorige = document.activeElement as HTMLElement | null;
    const eerste =
      vlak.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      vlak.current?.querySelector<HTMLElement>(FOCUSBAAR);
    (eerste ?? vlak.current)?.focus();
    return () => {
      if (vorige?.isConnected) vorige.focus();
    };
  }, []);
  return (
    <div className="database-dialoog-achtergrond">
      <div
        ref={vlak}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        tabIndex={-1}
        className={`database-dialoog ${breed ? "is-breed" : ""} ${className}`}
        onKeyDown={(e) => {
          if (e.key === "Escape" && sluit.current) {
            e.preventDefault();
            e.stopPropagation();
            sluit.current();
            return;
          }
          if (e.key !== "Tab") return;
          const lijst = [...(vlak.current?.querySelectorAll<HTMLElement>(FOCUSBAAR) ?? [])].filter(
            (el) => el.offsetParent !== null || el === document.activeElement,
          );
          if (!lijst.length) return;
          const eerste = lijst[0];
          const laatste = lijst[lijst.length - 1];
          if (e.shiftKey && document.activeElement === eerste) {
            e.preventDefault();
            laatste.focus();
          } else if (!e.shiftKey && document.activeElement === laatste) {
            e.preventDefault();
            eerste.focus();
          }
        }}
      >
        <h2 id={titelId}>{titel}</h2>
        <div className="database-dialoog-inhoud">{children}</div>
        {acties && <div className="database-dialoog-acties">{acties}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export interface BevestigOpties {
  titel: string;
  tekst: ReactNode;
  ja?: string;
  nee?: string;
  gevaarlijk?: boolean;
  /** Focus standaard op “nee” (veilige keuze), zonder de rode gevaarstijl. */
  standaardNee?: boolean;
}
export interface VraagOpties {
  titel: string;
  label: string;
  standaard?: string;
  ok?: string;
  /** Geeft een foutmelding of null als de invoer geldig is. */
  controleer?: (waarde: string) => string | null;
}
export interface MsgBoxOpties {
  tekst: string;
  knoppen: number;
  titel: string;
}

type Verzoek =
  | { soort: "bevestig"; opties: BevestigOpties; klaar: (w: boolean) => void }
  | { soort: "vraag"; opties: VraagOpties; klaar: (w: string | null) => void }
  | { soort: "parameters"; titel: string; namen: string[]; klaar: (w: Record<string, string> | null) => void }
  | { soort: "msgbox"; opties: MsgBoxOpties; klaar: (w: number) => void }
  | { soort: "melding"; titel: string; tekst: ReactNode; klaar: () => void };

export interface Dialogen {
  bevestig(opties: BevestigOpties): Promise<boolean>;
  vraag(opties: VraagOpties): Promise<string | null>;
  /** Vraagt waarden voor queryparameters; null = geannuleerd. */
  parameters(titel: string, namen: string[]): Promise<Record<string, string> | null>;
  msgBox(opties: MsgBoxOpties): Promise<number>;
  melding(titel: string, tekst: ReactNode): Promise<void>;
}

const DialoogContext = createContext<Dialogen | null>(null);

export function useDialogen(): Dialogen {
  const d = useContext(DialoogContext);
  if (!d) throw new Error("useDialogen buiten DialoogBron.");
  return d;
}

export function DialoogBron({ children, onDialogen }: { children: ReactNode; onDialogen?: (d: Dialogen) => void }) {
  const [rij, setRij] = useState<(Verzoek & { nr: number })[]>([]);
  const teller = useRef(0);
  const voeg = useCallback((v: Verzoek) => {
    const nr = ++teller.current;
    setRij((r) => [...r, { ...v, nr }]);
  }, []);
  const dialogen = useMemo<Dialogen>(
    () => ({
      bevestig: (opties) => new Promise((klaar) => voeg({ soort: "bevestig", opties, klaar })),
      vraag: (opties) => new Promise((klaar) => voeg({ soort: "vraag", opties, klaar })),
      parameters: (titel, namen) => new Promise((klaar) => voeg({ soort: "parameters", titel, namen, klaar })),
      msgBox: (opties) => new Promise((klaar) => voeg({ soort: "msgbox", opties, klaar })),
      melding: (titel, tekst) => new Promise((klaar) => voeg({ soort: "melding", titel, tekst, klaar })),
    }),
    [voeg],
  );
  useEffect(() => onDialogen?.(dialogen), [dialogen, onDialogen]);
  const huidig = rij[0];
  const klaar = () => setRij((r) => r.slice(1));
  return (
    <DialoogContext.Provider value={dialogen}>
      {children}
      {huidig && <VerzoekDialoog key={huidig.nr} verzoek={huidig} klaar={klaar} />}
    </DialoogContext.Provider>
  );
}

/** VBA-MsgBox-knoppen (vbOKOnly … vbRetryCancel): waarde en sleutel in dialogs.msgBox.*. */
const MSGBOX_KNOPPEN: [number, string][][] = [
  [[1, "ok"]],
  [
    [1, "ok"],
    [2, "cancel"],
  ],
  [
    [3, "abort"],
    [4, "retry"],
    [5, "ignore"],
  ],
  [
    [6, "yes"],
    [7, "no"],
    [2, "cancel"],
  ],
  [
    [6, "yes"],
    [7, "no"],
  ],
  [
    [4, "retry"],
    [2, "cancel"],
  ],
];

/** Knoppen, pictogram en standaardknop van een VBA-MsgBox. */
export function msgBoxOpbouw(knoppen: number) {
  const lijst = (MSGBOX_KNOPPEN[knoppen & 7] ?? MSGBOX_KNOPPEN[0]).map(
    ([w, sleutel]) => [w, i18next.t(`database:dialogs.msgBox.${sleutel}`)] as [number, string],
  );
  const pictogram = knoppen & 0x70;
  const standaard = Math.min((knoppen & 0x300) >> 8, lijst.length - 1);
  const escape = lijst.some(([w]) => w === 2) ? 2 : lijst.length === 1 ? 1 : null;
  return { lijst, pictogram, standaard, escape };
}

function VerzoekDialoog({ verzoek, klaar }: { verzoek: Verzoek; klaar: () => void }) {
  const [tekst, setTekst] = useState(verzoek.soort === "vraag" ? (verzoek.opties.standaard ?? "") : "");
  const [waarden, setWaarden] = useState<Record<string, string>>({});
  const [fout, setFout] = useState("");
  const id = useId();
  const { t } = useTranslation("database");
  if (verzoek.soort === "bevestig") {
    const { titel, tekst: inhoud, ja = t("common:ok"), nee = t("common:cancel"), gevaarlijk, standaardNee } = verzoek.opties;
    const neeEerst = gevaarlijk || standaardNee;
    const kies = (w: boolean) => {
      verzoek.klaar(w);
      klaar();
    };
    return (
      <Dialoog
        titel={titel}
        onSluit={() => kies(false)}
        acties={
          <>
            <button data-autofocus={neeEerst ? undefined : true} className={gevaarlijk ? "is-gevaar" : "primary"} onClick={() => kies(true)}>
              {ja}
            </button>
            <button data-autofocus={neeEerst ? true : undefined} onClick={() => kies(false)}>
              {nee}
            </button>
          </>
        }
      >
        <div>{inhoud}</div>
      </Dialoog>
    );
  }
  if (verzoek.soort === "melding") {
    const sluit = () => {
      verzoek.klaar();
      klaar();
    };
    return (
      <Dialoog titel={verzoek.titel} onSluit={sluit} acties={<button className="primary" onClick={sluit}>{t("common:ok")}</button>}>
        <div>{verzoek.tekst}</div>
      </Dialoog>
    );
  }
  if (verzoek.soort === "vraag") {
    const { titel, label, ok = t("common:ok"), controleer } = verzoek.opties;
    const bevestig = () => {
      const f = controleer?.(tekst) ?? null;
      if (f) return setFout(f);
      verzoek.klaar(tekst);
      klaar();
    };
    const annuleer = () => {
      verzoek.klaar(null);
      klaar();
    };
    return (
      <Dialoog
        titel={titel}
        onSluit={annuleer}
        acties={
          <>
            <button className="primary" onClick={bevestig}>
              {ok}
            </button>
            <button onClick={annuleer}>{t("common:cancel")}</button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            bevestig();
          }}
        >
          <label className="database-veld" htmlFor={id}>
            <span>{label}</span>
            <input
              id={id}
              data-autofocus
              value={tekst}
              aria-invalid={!!fout}
              aria-describedby={fout ? `${id}-fout` : undefined}
              onChange={(e) => {
                setTekst(e.target.value);
                setFout("");
              }}
            />
          </label>
          {fout && (
            <p id={`${id}-fout`} className="database-veldfout" role="alert">
              {fout}
            </p>
          )}
        </form>
      </Dialoog>
    );
  }
  if (verzoek.soort === "parameters") {
    const bevestig = () => {
      verzoek.klaar(Object.fromEntries(verzoek.namen.map((n) => [n, waarden[n] ?? ""])));
      klaar();
    };
    const annuleer = () => {
      verzoek.klaar(null);
      klaar();
    };
    return (
      <Dialoog
        titel={verzoek.titel}
        onSluit={annuleer}
        acties={
          <>
            <button className="primary" onClick={bevestig}>
              {t("dialogs.parameters.run")}
            </button>
            <button onClick={annuleer}>{t("common:cancel")}</button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            bevestig();
          }}
        >
          <p className="muted">{t("dialogs.parameters.hint")}</p>
          {verzoek.namen.map((naam, i) => (
            <label key={naam} className="database-veld" htmlFor={`${id}-${i}`}>
              <span>{naam}</span>
              <input
                id={`${id}-${i}`}
                data-autofocus={i === 0 ? true : undefined}
                value={waarden[naam] ?? ""}
                onChange={(e) => setWaarden((w) => ({ ...w, [naam]: e.target.value }))}
              />
            </label>
          ))}
          <button type="submit" hidden />
        </form>
      </Dialoog>
    );
  }
  // VBA-MsgBox
  const { tekst: inhoud, titel, knoppen } = verzoek.opties;
  const { lijst, pictogram, standaard, escape } = msgBoxOpbouw(knoppen);
  const kies = (w: number) => {
    verzoek.klaar(w);
    klaar();
  };
  const Icoon = pictogram === 16 ? XCircle : pictogram === 32 ? HelpCircle : pictogram === 48 ? AlertTriangle : pictogram === 64 ? Info : null;
  return (
    <Dialoog
      titel={titel || t("dialogs.msgBox.defaultTitle")}
      className="database-msgbox"
      onSluit={escape === null ? undefined : () => kies(escape)}
      acties={lijst.map(([w, naam], i) => (
        <button key={w} data-autofocus={i === standaard ? true : undefined} className={i === standaard ? "primary" : ""} onClick={() => kies(w)}>
          {naam}
        </button>
      ))}
    >
      <div className="database-msgbox-tekst">
        {Icoon && <Icoon size={28} aria-hidden />}
        <p>{inhoud}</p>
      </div>
      <p className="muted">{t("dialogs.msgBox.fromVba")}</p>
    </Dialoog>
  );
}
