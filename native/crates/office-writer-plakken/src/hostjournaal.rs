//! Wirecontract voor expliciete desktopleases. De host levert zelf de vensternaam.
//! Levensduren zijn decimale strings: geen precisieverlies in JavaScript.
#[cfg(feature = "writer-bronjournaal")]
use crate::bronjournaal::{AdapterFout, Binding, Voorraad, VoorraadFout, WerkerFout};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostJournaalFout {
    pub soort: &'static str,
    pub melding: String,
}
fn fout(soort: &'static str, melding: impl Into<String>) -> HostJournaalFout {
    HostJournaalFout {
        soort,
        melding: melding.into(),
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Koppeling {
    document_id: String,
    levensduur: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Opening {
    document_id: String,
    opt_in: bool,
}
#[cfg(feature = "writer-bronjournaal")]
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Opdracht {
    koppeling: Koppeling,
    volgnummer: u64,
    aanvraag: crate::IncrementeleTekstAanvraag,
}
fn lees<T: serde::de::DeserializeOwned>(v: Value) -> Result<T, HostJournaalFout> {
    serde_json::from_value(v).map_err(|e| {
        fout(
            "ongeldig",
            format!("Ongeldige Writer-journaalopdracht: {e}"),
        )
    })
}

#[derive(Clone)]
#[cfg_attr(not(feature = "writer-bronjournaal"), derive(Default))]
pub struct HostJournaal {
    #[cfg(feature = "writer-bronjournaal")]
    voorraad: Voorraad,
}
#[cfg(feature = "writer-bronjournaal")]
impl Default for HostJournaal {
    fn default() -> Self {
        Self {
            #[cfg(feature = "writer-bronjournaal")]
            voorraad: Voorraad::nieuw(true, 4, 256 * 1024 * 1024)
                .expect("Vaste positieve Writer-voorraadgrenzen"),
        }
    }
}
impl HostJournaal {
    pub fn mogelijkheden(&self) -> Value {
        json!({"schema":3,"beschikbaar":cfg!(feature = "writer-bronjournaal"),
            "standaardIngeschakeld":false,"levensduurCodering":"decimaal",
            "maxVolgnummer":9_007_199_254_740_991_u64})
    }
    pub fn open(&self, eigenaar: &str, gegevens: Value) -> Result<Value, HostJournaalFout> {
        let a: Opening = lees(gegevens)?;
        if !a.opt_in || !cfg!(feature = "writer-bronjournaal") {
            return Err(fout(
                "uitgeschakeld",
                "Het Writer-bronjournaal is niet ingeschakeld",
            ));
        }
        if eigenaar.is_empty() || a.document_id.is_empty() {
            return Err(fout("ongeldig", "Venster en document moeten bekend zijn"));
        }
        #[cfg(feature = "writer-bronjournaal")]
        {
            let b = self
                .voorraad
                .open(eigenaar, &a.document_id)
                .map_err(vertaal)?;
            Ok(json!({"documentId":b.document,"levensduur":b.levensduur.to_string()}))
        }
        #[cfg(not(feature = "writer-bronjournaal"))]
        Err(fout(
            "uitgeschakeld",
            "Het Writer-bronjournaal is niet beschikbaar",
        ))
    }
    pub fn bereid(&self, eigenaar: &str, gegevens: Value) -> Result<Value, HostJournaalFout> {
        #[cfg(feature = "writer-bronjournaal")]
        {
            let a: Opdracht = lees(gegevens)?;
            if !(1..=9_007_199_254_740_991).contains(&a.volgnummer) {
                return Err(fout("ongeldig", "Ongeldig Writer-volgnummer"));
            }
            let b = binding(eigenaar, &a.koppeling)?;
            let mut r = self
                .voorraad
                .bereid(eigenaar, &b, a.volgnummer, a.aanvraag)
                .map_err(vertaal)?;
            r["levensduur"] = json!(b.levensduur.to_string());
            Ok(r)
        }
        #[cfg(not(feature = "writer-bronjournaal"))]
        {
            let _ = (eigenaar, gegevens);
            Err(fout(
                "uitgeschakeld",
                "Het Writer-bronjournaal is niet beschikbaar",
            ))
        }
    }
    pub fn vergeet(&self, eigenaar: &str, gegevens: Value) -> Result<(), HostJournaalFout> {
        let k: Koppeling = lees(gegevens)?;
        #[cfg(feature = "writer-bronjournaal")]
        return self
            .voorraad
            .vergeet(eigenaar, &binding(eigenaar, &k)?)
            .map_err(vertaal);
        #[cfg(not(feature = "writer-bronjournaal"))]
        {
            let _ = (eigenaar, k);
            Err(fout(
                "uitgeschakeld",
                "Het Writer-bronjournaal is niet beschikbaar",
            ))
        }
    }
    pub fn vergeet_eigenaar(&self, eigenaar: &str) -> Result<(), HostJournaalFout> {
        #[cfg(feature = "writer-bronjournaal")]
        return self.voorraad.vergeet_eigenaar(eigenaar).map_err(vertaal);
        #[cfg(not(feature = "writer-bronjournaal"))]
        {
            let _ = eigenaar;
            Ok(())
        }
    }
    /// Ook na de await in Tauri controleren, voordat het antwoord teruggaat.
    /// Frontendcontrole blijft vereist bij ontvangst/toepassen.
    pub fn controleer_antwoord(
        &self,
        eigenaar: &str,
        antwoord: &Value,
    ) -> Result<(), HostJournaalFout> {
        #[cfg(feature = "writer-bronjournaal")]
        {
            let k: Koppeling = lees(json!({"documentId":antwoord["documentId"],
                "levensduur":antwoord["levensduur"]}))?;
            if !self
                .voorraad
                .actueel(eigenaar, &binding(eigenaar, &k)?)
                .map_err(vertaal)?
            {
                return Err(fout(
                    "verouderd",
                    "Deze Writer-koppeling is niet meer actief",
                ));
            }
            Ok(())
        }
        #[cfg(not(feature = "writer-bronjournaal"))]
        {
            let _ = (eigenaar, antwoord);
            Err(fout(
                "uitgeschakeld",
                "Het Writer-bronjournaal is niet beschikbaar",
            ))
        }
    }
}
#[cfg(feature = "writer-bronjournaal")]
fn binding(eigenaar: &str, k: &Koppeling) -> Result<Binding, HostJournaalFout> {
    let n = k
        .levensduur
        .parse::<u64>()
        .ok()
        .filter(|n| *n != 0 && n.to_string() == k.levensduur)
        .ok_or_else(|| fout("ongeldig", "Ongeldige Writer-levensduur"))?;
    if eigenaar.is_empty() || k.document_id.is_empty() {
        return Err(fout("ongeldig", "Venster en document moeten bekend zijn"));
    }
    Ok(Binding {
        eigenaar: eigenaar.into(),
        document: k.document_id.clone(),
        levensduur: n,
    })
}
#[cfg(feature = "writer-bronjournaal")]
fn vertaal(e: VoorraadFout) -> HostJournaalFout {
    match e {
        VoorraadFout::Uitgeschakeld => fout(
            "uitgeschakeld",
            "Het Writer-bronjournaal is niet ingeschakeld",
        ),
        VoorraadFout::Ongeldig => fout("ongeldig", "Ongeldige of reeds geopende Writer-koppeling"),
        VoorraadFout::Verouderd
        | VoorraadFout::Werker(
            WerkerFout::Verouderd | WerkerFout::Adapter(AdapterFout::Verouderd),
        ) => fout("verouderd", "Deze Writer-koppeling is niet meer actief"),
        VoorraadFout::Capaciteit => fout(
            "capaciteit",
            "De Writer-werkervoorraad is vol; kies expliciet een nieuwe bronroute",
        ),
        VoorraadFout::NietBeschikbaar | VoorraadFout::Werker(WerkerFout::Gestopt) => {
            fout("nietBeschikbaar", "De Writer-werker is niet beschikbaar")
        }
        VoorraadFout::Werker(WerkerFout::Adapter(AdapterFout::Volgorde)) => {
            fout("volgorde", "Het Writer-volgnummer sluit niet aan")
        }
        VoorraadFout::Werker(WerkerFout::Adapter(AdapterFout::Uitgeschakeld)) => {
            fout("uitgeschakeld", "De Writer-werker is niet ingeschakeld")
        }
        VoorraadFout::Werker(WerkerFout::Adapter(AdapterFout::Ongeldig(e))) => fout("ongeldig", e),
    }
}
#[cfg(test)]
#[path = "hostjournaalproef.rs"]
mod proef;
