import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { leesFormulefout, type Formulefout } from "./formulefouten";

export function FormulefoutMelding({
  api,
  sheetId,
  row,
  col,
}: {
  api: XlsxEditorApi;
  sheetId: string;
  row: number;
  col: number;
}) {
  const { t } = useTranslation("spreadsheet");
  const [fout, setFout] = useState<Formulefout | null>(null);
  useEffect(() => {
    const ververs = () => {
      const nieuw = leesFormulefout(api.handle, sheetId, row, col);
      setFout((oud) =>
        oud?.soort === nieuw?.soort &&
        oud?.waarde === nieuw?.waarde &&
        oud?.cel === nieuw?.cel
          ? oud
          : nieuw,
      );
    };
    ververs();
    return api.handle.onUpdate(ververs);
  }, [api, sheetId, row, col]);
  if (!fout) return null;
  const titel = t(`formulaErrors.${fout.soort}.title`),
    uitleg = t(`formulaErrors.${fout.soort}.help`);
  return (
    <details
      className="rekenblad-formulefout"
      key={`${sheetId}:${row}:${col}:${fout.soort}`}
    >
      <summary
        aria-label={t("formulaErrors.explain", {
          cell: fout.cel,
          error: titel,
        })}
        title={`${fout.cel}: ${titel} — ${uitleg}`}
      >
        <TriangleAlert size={16} />
        <span>
          {fout.soort === "cycle" || fout.soort === "limited"
            ? titel
            : fout.waarde}
        </span>
      </summary>
      <div role="status">
        <strong>
          {fout.cel}: {titel}
        </strong>
        <p>{uitleg}</p>
      </div>
    </details>
  );
}
