import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Blok } from "./model";

export function TekstBlok({
  blok,
  actief,
  wijzig,
  kies,
  splits,
  verwijder,
}: {
  blok: Blok;
  actief: boolean;
  wijzig: (patch: Partial<Blok>) => void;
  kies: () => void;
  splits: (positie: number, einde: number) => void;
  verwijder: () => void;
}) {
  const { t } = useTranslation("notes");
  const veld = useRef<HTMLTextAreaElement>(null);
  function pasHoogteAan() {
    if (!veld.current) return;
    veld.current.style.height = "0";
    veld.current.style.height = `${veld.current.scrollHeight}px`;
  }
  useLayoutEffect(pasHoogteAan, [
    blok.tekst,
    blok.soort,
    blok.vet,
    blok.cursief,
  ]);
  useLayoutEffect(() => {
    if (!veld.current) return;
    let breedte = veld.current.clientWidth;
    const observer = new ResizeObserver(() => {
      if (veld.current && veld.current.clientWidth !== breedte) {
        breedte = veld.current.clientWidth;
        pasHoogteAan();
      }
    });
    observer.observe(veld.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className={`notities-blok is-${blok.soort} ${actief ? "is-actief" : ""} ${blok.klaar && blok.soort === "taak" ? "is-klaar" : ""}`}
    >
      {blok.soort === "taak" && (
        <input
          type="checkbox"
          checked={blok.klaar}
          onChange={(e) => wijzig({ klaar: e.target.checked })}
          aria-label={t("block.completeTask", {
            text: blok.tekst || t("defaults.untitled"),
          })}
        />
      )}
      {blok.soort === "opsomming" && (
        <span className="notities-punt" aria-hidden="true">
          •
        </span>
      )}
      <textarea
        ref={veld}
        dir="auto"
        aria-label={
          blok.soort === "taak"
            ? t("block.taskText")
            : blok.soort === "kop" || blok.soort === "subkop"
              ? t("block.headingText")
              : t("block.noteText")
        }
        value={blok.tekst}
        maxLength={100000}
        rows={1}
        placeholder={
          blok.soort === "taak"
            ? t("block.taskPlaceholder")
            : t("block.placeholder")
        }
        style={{
          fontWeight: blok.vet ? 700 : undefined,
          fontStyle: blok.cursief ? "italic" : undefined,
        }}
        onFocus={kies}
        onChange={(e) => wijzig({ tekst: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            splits(
              e.currentTarget.selectionStart,
              e.currentTarget.selectionEnd,
            );
          }
          if (e.key === "Backspace" && !blok.tekst) {
            e.preventDefault();
            verwijder();
          }
        }}
      />
    </div>
  );
}
