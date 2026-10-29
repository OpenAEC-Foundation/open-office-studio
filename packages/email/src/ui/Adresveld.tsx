import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Adres, MailBackend } from "../contract";
import { formatAdres, isGeldigAdres, parseAdressen, uniekeAdressen } from "../adressen";

/**
 * Ontvangersveld met adreschips en aanvullen uit `contacten`. Typen of plakken
 * van meerdere adressen (komma, puntkomma, Enter) maakt er chips van.
 */
export function Adresveld({
  label,
  waarde,
  wijzig,
  backend,
  accountId,
  autoFocus,
}: {
  label: string;
  waarde: Adres[];
  wijzig: (adressen: Adres[]) => void;
  backend: MailBackend;
  accountId: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation("email");
  const [invoer, setInvoer] = useState("");
  const [voorstellen, setVoorstellen] = useState<Adres[]>([]);
  const [gekozen, setGekozen] = useState(0);
  const veld = useRef<HTMLInputElement>(null);
  const lijstId = useId();
  useEffect(() => {
    const term = invoer.trim();
    if (term.length < 2) {
      setVoorstellen([]);
      return;
    }
    let actueel = true;
    const wacht = setTimeout(() => {
      backend
        .contacten(accountId, term)
        .then((adressen) => {
          if (!actueel) return;
          setVoorstellen(uniekeAdressen(adressen, waarde.map((a) => a.adres)).slice(0, 8));
          setGekozen(0);
        })
        .catch(() => actueel && setVoorstellen([]));
    }, 180);
    return () => {
      actueel = false;
      clearTimeout(wacht);
    };
  }, [invoer, backend, accountId, waarde]);

  function voegToe(tekst: string) {
    const nieuw = parseAdressen(tekst);
    if (nieuw.length) wijzig(uniekeAdressen([...waarde, ...nieuw]));
    setInvoer("");
    setVoorstellen([]);
  }
  function kies(adres: Adres) {
    wijzig(uniekeAdressen([...waarde, adres]));
    setInvoer("");
    setVoorstellen([]);
    veld.current?.focus();
  }

  return (
    <div className="email-adresveld" onClick={() => veld.current?.focus()}>
      <label className="email-veldlabel" htmlFor={`${lijstId}-invoer`}>
        {label}
      </label>
      <div className="email-chips">
        {waarde.map((adres, i) => (
          <span
            key={adres.adres + i}
            className={`email-chip ${isGeldigAdres(adres.adres) ? "" : "is-ongeldig"}`}
            title={isGeldigAdres(adres.adres) ? formatAdres(adres) : t("address.invalid", { address: adres.adres })}
          >
            {adres.naam || adres.adres}
            <button
              type="button"
              aria-label={t("address.remove", { address: adres.adres })}
              onClick={(e) => {
                e.stopPropagation();
                wijzig(waarde.filter((_, j) => j !== i));
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          id={`${lijstId}-invoer`}
          ref={veld}
          autoFocus={autoFocus}
          value={invoer}
          role="combobox"
          aria-expanded={voorstellen.length > 0}
          aria-controls={lijstId}
          aria-autocomplete="list"
          aria-activedescendant={voorstellen.length ? `${lijstId}-${gekozen}` : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            const tekst = e.target.value;
            if (/[,;]\s*$/.test(tekst) && !/"[^"]*$/.test(tekst.replace(/"[^"]*"/g, ""))) voegToe(tekst);
            else setInvoer(tekst);
          }}
          onPaste={(e) => {
            const tekst = e.clipboardData.getData("text");
            if (/[,;\n]/.test(tekst)) {
              e.preventDefault();
              voegToe(invoer + tekst);
            }
          }}
          onBlur={() => {
            // Een getypt adres niet verliezen bij het verlaten van het veld.
            setTimeout(() => {
              if (veld.current && document.activeElement !== veld.current && veld.current.value.trim()) voegToe(veld.current.value);
            }, 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && voorstellen.length) {
              e.preventDefault();
              setGekozen((gekozen + 1) % voorstellen.length);
            } else if (e.key === "ArrowUp" && voorstellen.length) {
              e.preventDefault();
              setGekozen((gekozen + voorstellen.length - 1) % voorstellen.length);
            } else if ((e.key === "Enter" || e.key === "Tab") && voorstellen.length && invoer.trim()) {
              e.preventDefault();
              kies(voorstellen[gekozen]);
            } else if (e.key === "Enter" && invoer.trim()) {
              e.preventDefault();
              voegToe(invoer);
            } else if (e.key === "Escape" && voorstellen.length) {
              e.stopPropagation();
              setVoorstellen([]);
            } else if (e.key === "Backspace" && !invoer && waarde.length) {
              wijzig(waarde.slice(0, -1));
            }
          }}
        />
      </div>
      {voorstellen.length > 0 && (
        <ul className="email-voorstellen" role="listbox" id={lijstId}>
          {voorstellen.map((adres, i) => (
            <li
              key={adres.adres}
              id={`${lijstId}-${i}`}
              role="option"
              aria-selected={i === gekozen}
              onMouseDown={(e) => {
                e.preventDefault();
                kies(adres);
              }}
            >
              <strong>{adres.naam || adres.adres}</strong>
              {adres.naam && <small>{adres.adres}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
