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
import { MAX_MARKDOWN_TEKENS } from "./model";
import { bewerkMarkdown, type MarkdownOpdracht } from "./markdown-bewerking";
import "./markdown.css";

export type MarkdownActies = { voerUit: (opdracht: MarkdownOpdracht) => void };

export const MarkdownVoorbeeld = memo(function MarkdownVoorbeeld({
  tekst,
}: {
  tekst: string;
}) {
  if (tekst.length > 100000)
    return (
      <p className="notities-md-uitleg">
        Deze pagina is te groot voor het directe voorbeeld. Alle tekst blijft
        beschikbaar in de editor en in je export.
      </p>
    );
  return (
    <div className="notities-md-inhoud">
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
              Afbeelding: {alt || "zonder beschrijving"}
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
          <div role="group" aria-label="Markdownweergave">
            {(
              [
                ["bron", "Bron", Code2],
                ["gedeeld", "Naast elkaar", Columns2],
                ["voorbeeld", "Voorbeeld", Eye],
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
        <small>{tekst.length.toLocaleString("nl-NL")} tekens</small>
      </div>
      <div className={`notities-md-panelen beeld-${gekozen}`}>
        {gekozen !== "voorbeeld" && (
          <label className="notities-md-bron">
            <span>Broncode</span>
            <textarea
              ref={bron}
              aria-label="Markdowntekst"
              value={tekst}
              maxLength={MAX_MARKDOWN_TEKENS}
              placeholder={
                "## Een nieuw idee\n\nSchrijf hier je notitie in Markdown…"
              }
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
            aria-label="Markdownvoorbeeld"
            aria-busy={voorbeeld !== tekst}
          >
            <span className="notities-md-paneellabel">Voorbeeld</span>
            {tekst ? (
              <MarkdownVoorbeeld tekst={voorbeeld} />
            ) : (
              <p className="notities-md-leeg">
                Je ideeën krijgen hier vorm.
                <small>Gebruik # voor koppen, **vet** en - voor lijsten.</small>
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
