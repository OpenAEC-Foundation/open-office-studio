import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bold,
  Italic,
  Underline,
  Undo2,
  Redo2,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import {
  notitieTekst,
  stijlOp,
  vervangNotitieTekst,
  formatteerNotities,
  formatteerAlineas,
  notitieStap,
  type NotitieDocument,
  type NotitieStijl,
} from "./notitiesModel";
import {
  herstelNotitieSelectie,
  leesNotitieSelectie,
  tekenNotitieEditor,
  notitieDomVerschil,
  leesNotitieHtml,
  type NotitieSelectie,
} from "./notitiesDom";
export function RijkeNotitieWeergave({ doc }: { doc: NotitieDocument }) {
  let nummer = 0;
  return (
    <div className="rijke-notitie-weergave">
      {doc.paragraphs.map((p) => {
        nummer = p.list === "number" ? nummer + 1 : 0;
        return (
          <p key={p.id} data-list={p.list} style={{ textAlign: p.align }}>
            {p.list !== "none" && (
              <span aria-hidden="true" className="notitie-lijstteken">
                {p.list === "bullet" ? "• " : `${nummer}. `}
              </span>
            )}
            {p.runs.map((r) => (
              <span
                key={r.id}
                style={{
                  fontWeight: r.style.bold ? 700 : 400,
                  fontStyle: r.style.italic ? "italic" : "normal",
                  textDecoration: r.style.underline ? "underline" : "none",
                  color: r.style.color,
                  fontFamily: r.style.font,
                  fontSize: r.style.size ? `${r.style.size / 12}em` : undefined,
                }}
              >
                {r.text}
              </span>
            ))}
            {!p.runs.length && <br />}
          </p>
        );
      })}
    </div>
  );
}
interface Props {
  doc: NotitieDocument;
  editable: boolean;
  undo: boolean;
  redo: boolean;
  wijzig: (d: NotitieDocument, kind: string) => void;
  ongedaan: () => void;
  opnieuw: () => void;
  opslaan: () => void;
  fout: (e: unknown) => void;
}
export function RijkeNotitieBewerker(props: Props) {
  const { t } = useTranslation("presentation"),
    root = useRef<HTMLDivElement>(null),
    doc = useRef(props.doc),
    selection = useRef<NotitieSelectie>({ start: 0, end: 0 }),
    composing = useRef(false),
    typing = useRef<NotitieStijl | null>(null),
    restore = useRef(false),
    actions = useRef(props);
  actions.current = props;
  doc.current = props.doc;
  const [active, setActive] = useState<NotitieStijl>({});
  const capture = () => {
    if (root.current) {
      const sel = leesNotitieSelectie(root.current);
      if (sel) {
        selection.current = sel;
        return sel;
      }
    }
    return selection.current;
  };
  function change(
    next: NotitieDocument,
    sel: NotitieSelectie,
    kind = "format",
  ) {
    try {
      actions.current.wijzig(next, kind);
      doc.current = next;
      selection.current = sel;
      restore.current = true;
    } catch (e) {
      actions.current.fout(e);
    }
  }
  function format(style: NotitieStijl) {
    if (!props.editable) return;
    const s = capture();
    try {
      if (s.start === s.end) {
        typing.current = {
          ...stijlOp(doc.current, s.start),
          ...typing.current,
          ...style,
        };
        setActive(typing.current);
        root.current?.focus();
        return;
      }
      typing.current = null;
      change(formatteerNotities(doc.current, s.start, s.end, style), s);
    } catch (e) {
      props.fout(e);
    }
  }
  function paragraph(style: Parameters<typeof formatteerAlineas>[3]) {
    if (!props.editable) return;
    const s = capture();
    try {
      change(formatteerAlineas(doc.current, s.start, s.end, style), s);
    } catch (e) {
      props.fout(e);
    }
  }
  useLayoutEffect(() => {
    if (!root.current || composing.current) return;
    const focused =
      root.current.contains(root.current.ownerDocument.activeElement) ||
      restore.current;
    tekenNotitieEditor(root.current, props.doc);
    if (focused) {
      root.current.focus();
      herstelNotitieSelectie(root.current, props.doc, selection.current);
    }
    restore.current = false;
  }, [props.doc]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const sel = () => {
      const s = leesNotitieSelectie(el);
      if (s) {
        const changed =
          s.start !== selection.current.start ||
          s.end !== selection.current.end;
        selection.current = s;
        if (changed) typing.current = null;
        try {
          setActive(
            typing.current ??
              stijlOp(
                doc.current,
                Math.min(s.start, notitieTekst(doc.current).length),
              ),
          );
        } catch {
          /* Document changed while selection moved. */
        }
      }
    };
    el.ownerDocument.addEventListener("selectionchange", sel);
    return () => el.ownerDocument.removeEventListener("selectionchange", sel);
  }, []);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const input = (e: InputEvent) => {
      if (!actions.current.editable) {
        e.preventDefault();
        return;
      }
      if (e.isComposing || composing.current) return;
      const s = capture(),
        text = notitieTekst(doc.current);
      let a = s.start,
        b = s.end,
        insert = "";
      const type = e.inputType;
      if (type === "historyUndo" || type === "historyRedo") {
        e.preventDefault();
        restore.current = true;
        type === "historyUndo"
          ? actions.current.ongedaan()
          : actions.current.opnieuw();
        return;
      }
      if (["insertText", "insertReplacementText"].includes(type)) {
        if (e.data === null) return;
        insert = e.data;
      } else if (["insertParagraph", "insertLineBreak"].includes(type))
        insert = type === "insertLineBreak" ? "\u2028" : "\n";
      else if (type.startsWith("delete")) {
        if (a === b) {
          if (type.includes("Backward"))
            a = type.includes("Word")
              ? Math.max(
                  0,
                  a - (text.slice(0, a).match(/\s*\S+\s*$/u)?.[0].length ?? 1),
                )
              : notitieStap(text, a, -1);
          else
            b = type.includes("Word")
              ? Math.min(
                  text.length,
                  b + (text.slice(b).match(/^\s*\S+\s*/u)?.[0].length ?? 1),
                )
              : notitieStap(text, b, 1);
        }
      } else if (type.startsWith("format")) {
        e.preventDefault();
        return;
      } else return;
      e.preventDefault();
      try {
        const style = typing.current ?? stijlOp(doc.current, a);
        const next = vervangNotitieTekst(doc.current, a, b, insert, style);
        if (type === "insertParagraph") typing.current = style;
        change(
          next,
          { start: a + insert.length, end: a + insert.length },
          type === "insertParagraph" ? "structure" : "typing",
        );
      } catch (error) {
        actions.current.fout(error);
      }
    };
    el.addEventListener("beforeinput", input);
    return () => el.removeEventListener("beforeinput", input);
  }, []);
  const button = (
    label: string,
    Icon: typeof Bold,
    action: () => void,
    pressed?: boolean,
    disabled = false,
  ) => (
    <button
      type="button"
      className="werkruimte-knop notitie-opmaakknop"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={!props.editable || disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
    >
      <Icon size={15} />
    </button>
  );
  return (
    <>
      <div
        className="rijke-notitie-werkbalk"
        role="toolbar"
        aria-label={t("richNotes.formatting")}
      >
        {button(
          t("richNotes.undo"),
          Undo2,
          () => {
            restore.current = true;
            props.ongedaan();
          },
          undefined,
          !props.undo,
        )}
        {button(
          t("richNotes.redo"),
          Redo2,
          () => {
            restore.current = true;
            props.opnieuw();
          },
          undefined,
          !props.redo,
        )}
        {button(
          t("richNotes.bold"),
          Bold,
          () => format({ bold: !active.bold }),
          !!active.bold,
        )}
        {button(
          t("richNotes.italic"),
          Italic,
          () => format({ italic: !active.italic }),
          !!active.italic,
        )}
        {button(
          t("richNotes.underline"),
          Underline,
          () => format({ underline: !active.underline }),
          !!active.underline,
        )}
        <label>
          {t("richNotes.fontSize")}
          <select
            aria-label={t("richNotes.fontSize")}
            value={active.size ?? 12}
            disabled={!props.editable}
            onFocus={capture}
            onChange={(e) => format({ size: Number(e.target.value) })}
          >
            {[
              10,
              12,
              14,
              16,
              18,
              20,
              24,
              28,
              32,
              36,
              48,
              ...(active.size &&
              ![10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48].includes(
                active.size,
              )
                ? [active.size]
                : []),
            ]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
          </select>
        </label>
        <label>
          {t("richNotes.color")}
          <input
            type="color"
            aria-label={t("richNotes.color")}
            value={active.color ?? "#000000"}
            disabled={!props.editable}
            onFocus={capture}
            onChange={(e) => format({ color: e.target.value })}
          />
        </label>
        {button(t("richNotes.bullets"), List, () =>
          paragraph({ list: "bullet" }),
        )}
        {button(t("richNotes.numbered"), ListOrdered, () =>
          paragraph({ list: "number" }),
        )}
        {button(t("richNotes.left"), AlignLeft, () =>
          paragraph({ align: "left" }),
        )}
        {button(t("richNotes.center"), AlignCenter, () =>
          paragraph({ align: "center" }),
        )}
        {button(t("richNotes.right"), AlignRight, () =>
          paragraph({ align: "right" }),
        )}
        <button
          type="button"
          className="werkruimte-knop"
          disabled={!props.editable}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => paragraph({ list: "none" })}
        >
          {t("richNotes.noList")}
        </button>
      </div>
      <div
        ref={root}
        className="rijke-notitie-editor"
        data-testid="rich-notes-editor"
        contentEditable={props.editable}
        suppressContentEditableWarning
        role="textbox"
        aria-label={t("richNotes.editor")}
        aria-multiline="true"
        aria-readonly={!props.editable}
        spellCheck={false}
        onFocus={() => {
          restore.current = false;
        }}
        onBlur={capture}
        onPointerUp={capture}
        onKeyUp={capture}
        onKeyDown={(e) => {
          if (e.ctrlKey || e.metaKey) {
            const k = e.key.toLowerCase();
            if (["s", "z", "y", "b", "i", "u"].includes(k)) {
              e.preventDefault();
              e.stopPropagation();
              if (k === "s") props.opslaan();
              else if (!props.editable) return;
              else if (k === "z" || k === "y") {
                restore.current = true;
                k === "y" || e.shiftKey ? props.opnieuw() : props.ongedaan();
              } else
                format(
                  k === "b"
                    ? { bold: !active.bold }
                    : k === "i"
                      ? { italic: !active.italic }
                      : { underline: !active.underline },
                );
              return;
            }
          }
          e.stopPropagation();
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          if (!root.current || !props.editable) return;
          const s = capture(),
            diff = notitieDomVerschil(root.current, doc.current);
          try {
            if (diff.start !== diff.end || diff.text)
              change(
                vervangNotitieTekst(
                  doc.current,
                  diff.start,
                  diff.end,
                  diff.text,
                  typing.current ?? stijlOp(doc.current, diff.start),
                ),
                s,
                "typing",
              );
          } catch (e) {
            props.fout(e);
            tekenNotitieEditor(root.current, doc.current);
          }
        }}
        onInput={() => {
          if (composing.current || !root.current || !props.editable) return;
          const diff = notitieDomVerschil(root.current, doc.current);
          if (diff.start === diff.end && !diff.text) return;
          const s = capture();
          try {
            change(
              vervangNotitieTekst(doc.current, diff.start, diff.end, diff.text),
              s,
              "typing",
            );
          } catch (e) {
            props.fout(e);
            tekenNotitieEditor(root.current, doc.current);
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!props.editable) return;
          const s = capture();
          try {
            const html = e.clipboardData.getData("text/html"),
              fragment = html
                ? leesNotitieHtml(html, e.currentTarget.ownerDocument)
                : null,
              text = fragment
                ? notitieTekst(fragment)
                : e.clipboardData.getData("text/plain");
            let next = vervangNotitieTekst(
              doc.current,
              s.start,
              s.end,
              text,
              typing.current ?? stijlOp(doc.current, s.start),
            );
            if (fragment) {
              let n = s.start;
              for (const p of fragment.paragraphs) {
                const begin = n;
                for (const r of p.runs) {
                  next = formatteerNotities(
                    next,
                    n,
                    n + r.text.length,
                    r.style,
                  );
                  n += r.text.length;
                }
                next = formatteerAlineas(next, begin, n, {
                  align: p.align,
                  list: p.list,
                });
                n++;
              }
            }
            change(
              next,
              { start: s.start + text.length, end: s.start + text.length },
              "paste",
            );
          } catch (error) {
            props.fout(error);
          }
        }}
        onCut={(e) => {
          if (!props.editable) return;
          const s = capture();
          e.preventDefault();
          e.clipboardData.setData(
            "text/plain",
            notitieTekst(doc.current).slice(s.start, s.end),
          );
          try {
            change(
              vervangNotitieTekst(doc.current, s.start, s.end, ""),
              { start: s.start, end: s.start },
              "cut",
            );
          } catch (error) {
            props.fout(error);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
        }}
      />
    </>
  );
}
