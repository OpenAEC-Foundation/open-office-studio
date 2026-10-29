import {
  memo,
  useDeferredValue,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Code2, Columns2, Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOpmaak } from "../i18n/opmaak";
import { MAX_MARKDOWN_TEKENS } from "./model";
import { bewerkMarkdown, type MarkdownOpdracht } from "./markdown-bewerking";
import "./markdown.css";

export type MarkdownActies = { voerUit: (opdracht: MarkdownOpdracht) => void };

export const MarkdownVoorbeeld = memo(function MarkdownVoorbeeld({
  tekst,
}: {
  tekst: string;
}) {
  const { t } = useTranslation("notes");
  if (tekst.length > 100000)
    return (
      <p className="notities-md-uitleg">
        {t("markdown.tooLargeForPreview")}
      </p>
    );
  return (
    <div className="notities-md-inhoud" dir="auto">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt, src }) => (
            <span className="notities-md-afbeelding">
              {t("markdown.image", {
                description: alt || t("markdown.noDescription"),
              })}
              <small>{src}</small>
            </span>
          ),
        }}
      >
        {tekst}
      </Markdown>
    </div>
  );
});

export function MarkdownEditor({
  tekst,
  wijzig,
  acties,
  alleenLezen = false,
}: {
  tekst: string;
  wijzig: (tekst: string, opmaak?: boolean) => void;
  acties: RefObject<MarkdownActies | null>;
  alleenLezen?: boolean;
}) {
  const { t } = useTranslation("notes");
  const opmaak = useOpmaak();
  const bron = useRef<HTMLTextAreaElement>(null);
  const [beeld, setBeeld] = useState<"bron" | "gedeeld" | "voorbeeld">(
    "gedeeld",
  );
  const voorbeeld = useDeferredValue(tekst);
  function voerUit(opdracht: MarkdownOpdracht) {
    if (alleenLezen) return;
    const resultaat = bewerkMarkdown(
      // Selectieposities horen bij de textarea; die normaliseert Windows-regelafbrekingen.
      bron.current?.value ?? tekst,
      bron.current?.selectionStart ?? tekst.length,
      bron.current?.selectionEnd ?? tekst.length,
      opdracht,
    );
    if (resultaat.tekst.length > MAX_MARKDOWN_TEKENS) return;
    wijzig(resultaat.tekst, true);
    if (beeld === "voorbeeld") setBeeld("gedeeld");
    requestAnimationFrame(() => {
      bron.current?.focus();
      bron.current?.setSelectionRange(resultaat.start, resultaat.einde);
    });
  }
  useImperativeHandle(acties, () => ({ voerUit }));
  const gekozen = alleenLezen ? "voorbeeld" : beeld;
  return (
    <div className="notities-markdown">
      <div className="notities-md-balk">
        <span>Markdown</span>
        {!alleenLezen && (
          <div role="group" aria-label={t("markdown.viewLabel")}>
            {(
              [
                ["bron", t("markdown.source"), Code2],
                ["gedeeld", t("markdown.sideBySide"), Columns2],
                ["voorbeeld", t("markdown.preview"), Eye],
              ] as const
            ).map(([id, naam, Icoon]) => (
              <button
                key={id}
                aria-pressed={beeld === id}
                onClick={() => setBeeld(id)}
              >
                <Icoon size={14} />
                {naam}
              </button>
            ))}
          </div>
        )}
        <small>
          {t("markdown.characters", {
            count: tekst.length,
            characters: opmaak.getal(tekst.length),
          })}
        </small>
      </div>
      <div className={`notities-md-panelen beeld-${gekozen}`}>
        {gekozen !== "voorbeeld" && (
          <label className="notities-md-bron">
            <span>{t("markdown.sourceCode")}</span>
            <textarea
              ref={bron}
              dir="auto"
              aria-label={t("markdown.textLabel")}
              value={tekst}
              maxLength={MAX_MARKDOWN_TEKENS}
              placeholder={t("markdown.placeholder")}
              spellCheck={false}
              onChange={(e) => wijzig(e.target.value)}
              onKeyDown={(e) => {
                if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
                const opdracht = (
                  { b: "vet", i: "cursief", k: "link" } as const
                )[e.key.toLowerCase() as "b" | "i" | "k"];
                if (opdracht) {
                  e.preventDefault();
                  voerUit(opdracht);
                }
              }}
            />
          </label>
        )}
        {gekozen !== "bron" && (
          <section
            className="notities-md-voorbeeld"
            aria-label={t("markdown.previewLabel")}
            aria-busy={voorbeeld !== tekst}
          >
            <span className="notities-md-paneellabel">
              {t("markdown.preview")}
            </span>
            {tekst ? (
              <MarkdownVoorbeeld tekst={voorbeeld} />
            ) : (
              <p className="notities-md-leeg">
                {t("markdown.emptyTitle")}
                <small>{t("markdown.emptyHint")}</small>
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
