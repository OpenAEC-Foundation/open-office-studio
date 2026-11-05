//! Een sectiekopie krijgt eigen identiteit; alle oorspronkelijke inhoud blijft intact.
use super::*;

fn begrens(tekst: &str, maximum: usize) -> String {
    let mut aantal = 0;
    tekst
        .chars()
        .take_while(|c| {
            aantal += c.len_utf16();
            aantal <= maximum
        })
        .collect()
}
fn markdown(pagina: &Value) -> Resultaat<String> {
    let mut vakken: Vec<_> = pagina["vakken"].as_array().into_iter().flatten().collect();
    vakken.sort_by(|a, b| {
        let getal = |v: &Value, k: &str| v[k].as_f64().unwrap_or_default();
        getal(a, "y")
            .total_cmp(&getal(b, "y"))
            .then_with(|| getal(a, "x").total_cmp(&getal(b, "x")))
    });
    let mut uit = String::new();
    let mut aantal = 0;
    let mut eerste = true;
    for b in vakken
        .iter()
        .flat_map(|v| v["blokken"].as_array().into_iter().flatten())
    {
        let bron = b["tekst"].as_str().unwrap_or_default();
        if bron.encode_utf16().take(500_001).count() > 500_000 {
            return Err(fout("Pagina te groot voor een Markdownkopie"));
        }
        let mut tekst = String::new();
        for c in bron.chars() {
            if "\\`*_[]<>".contains(c) {
                tekst.push('\\');
            }
            tekst.push(c);
        }
        if b["vet"] == true {
            tekst = format!("**{tekst}**");
        }
        if b["cursief"] == true {
            tekst = format!("*{tekst}*");
        }
        let prefix = match b["soort"].as_str().unwrap_or("tekst") {
            "kop" => "## ",
            "subkop" => "### ",
            "opsomming" => "- ",
            "taak" if b["klaar"] == true => "- [x] ",
            "taak" => "- [ ] ",
            _ => "",
        };
        if !prefix.is_empty() {
            tekst = tekst.replace('\n', "\n  ");
        }
        let scheiding = if eerste { "" } else { "\n\n" };
        aantal += scheiding.len() + prefix.len() + tekst.encode_utf16().count();
        // Ook de afsluitende regeleinde telt mee, net als in de bestaande editor.
        if aantal >= 500_000 {
            return Err(fout("Pagina te groot voor een Markdownkopie"));
        }
        uit.push_str(scheiding);
        uit.push_str(prefix);
        uit.push_str(&tekst);
        eerste = false;
    }
    uit.push('\n');
    Ok(uit)
}
fn tekstvakken(tekst: &str) -> Value {
    let mut v = vak(40., 32.);
    let mut blokken = Vec::new();
    let mut begin = 0;
    let mut aantal = 0;
    for (positie, c) in tekst.char_indices() {
        if aantal + c.len_utf16() > 100_000 {
            let mut b = blok();
            b["tekst"] = json!(&tekst[begin..positie]);
            blokken.push(b);
            begin = positie;
            aantal = 0;
        }
        aantal += c.len_utf16();
    }
    let mut b = blok();
    b["tekst"] = json!(&tekst[begin..]);
    blokken.push(b);
    v["blokken"] = json!(blokken);
    json!([v])
}
pub(super) fn kopieer(d: &mut Value, sectiepad: &str, naar_markdown: bool) -> Resultaat<String> {
    let bron = d
        .pointer(sectiepad)
        .ok_or_else(|| fout("Sectie ontbreekt"))?;
    if (bron["soort"] == "markdown") == naar_markdown {
        return Err(fout("Kies een andere sectiesoort"));
    }
    let mut kopie = bron.clone();
    kopie["id"] = json!(id());
    kopie["soort"] = json!(if naar_markdown { "markdown" } else { "canvas" });
    let soort = if naar_markdown { "Markdown" } else { "Canvas" };
    let basis = format!(
        "{} ({soort})",
        begrens(bron["naam"].as_str().unwrap_or("Sectie"), 180)
    );
    let boekpad = sectiepad.rsplit_once("/secties/").unwrap().0;
    let secties = d
        .pointer(&format!("{boekpad}/secties"))
        .and_then(Value::as_array)
        .ok_or_else(|| fout("Secties ontbreken"))?;
    let mut naam = basis.clone();
    let mut nummer = 2;
    while secties.iter().any(|s| s["naam"] == naam) {
        naam = format!("{} ({nummer})", begrens(&basis, 180));
        nummer += 1;
    }
    kopie["naam"] = json!(naam);
    let lijst = kopie["paginas"]
        .as_array_mut()
        .ok_or_else(|| fout("Pagina's ontbreken"))?;
    if lijst.is_empty() {
        return Err(fout("Sectie heeft geen pagina's om te kopiëren"));
    }
    for pagina in lijst.iter_mut() {
        pagina["id"] = json!(id());
        if naar_markdown {
            pagina["markdown"] = json!(markdown(pagina)?);
            pagina["vakken"] = json!([]);
        } else {
            pagina["vakken"] = tekstvakken(pagina["markdown"].as_str().unwrap_or_default());
            pagina["markdown"] = json!("");
        }
    }
    let pagina = lijst
        .iter()
        .position(|p| p["verwijderd"] != true)
        .unwrap_or(0);
    let nieuw = format!("{boekpad}/secties/{}/paginas/{pagina}", secties.len());
    d.pointer_mut(&format!("{boekpad}/secties"))
        .unwrap()
        .as_array_mut()
        .unwrap()
        .push(kopie);
    Ok(nieuw)
}
