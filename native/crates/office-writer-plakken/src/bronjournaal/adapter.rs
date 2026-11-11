//! Experimenteel adaptercontract; geen automatische Tauri-inschakeling.
use super::journaal::{Fout, Journaal, Middelengrens};
use crate::IncrementeleTekstAanvraag as Vraag;
use serde_json::{Value, json};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Binding {
    pub eigenaar: String,
    pub document: String,
    pub levensduur: u64,
}
#[derive(Debug, PartialEq, Eq)]
pub enum AdapterFout {
    Uitgeschakeld,
    Verouderd,
    Volgorde,
    Ongeldig(String),
}
/// Alleen op de documentwerker aanmaken/gebruiken/vernietigen: de kern bezit
/// threadgebonden EditingDocs. Transportgegevens mogen wel over een kanaal.
pub struct Adapter {
    actief: Option<Binding>,
    laatste: u64,
    journaal: Journaal,
}
impl Adapter {
    pub fn nieuw(ingeschakeld: bool, binding: Binding) -> Result<Self, AdapterFout> {
        if !ingeschakeld {
            return Err(AdapterFout::Uitgeschakeld);
        }
        if binding.eigenaar.is_empty() || binding.document.is_empty() || binding.levensduur == 0 {
            return Err(AdapterFout::Ongeldig("Ongeldige levensduurbinding".into()));
        }
        Ok(Self {
            actief: Some(binding),
            laatste: 0,
            journaal: Journaal::default(),
        })
    }
    pub fn vergeet(&mut self) {
        self.actief = None;
        self.journaal = Journaal::default()
    }
    /// Toelating verbruikt het volgnummer ook bij een kernfout of bronverzoek.
    /// De UI blijft verantwoordelijk voor actuele versie/selectie vóór toepassen.
    pub fn bereid(
        &mut self,
        binding: &Binding,
        volgnummer: u64,
        a: Vraag,
    ) -> Result<Value, AdapterFout> {
        if self.actief.as_ref() != Some(binding) || a.document_id != binding.document {
            return Err(AdapterFout::Verouderd);
        }
        if self.laatste.checked_add(1) != Some(volgnummer) {
            return Err(AdapterFout::Volgorde);
        }
        if a.schema != 3 {
            return Err(AdapterFout::Ongeldig("Alleen onderzoeksschema 3".into()));
        }
        self.laatste = volgnummer;
        let mut envelop = json!({"schema":3,"requestId":a.request_id,"documentId":a.document_id,"sourceVersion":a.source_version,"snapshotSha256":a.snapshot_sha256,"clientId":a.client_id});
        let mut antwoord = match self.journaal.bereid_getypeerd(a) {
            Ok(Some(mut r)) => {
                r["route"] = json!("gereed");
                r
            }
            Ok(None) => {
                envelop["route"] = json!("volledigeBron");
                envelop["retryFull"] = json!(true);
                envelop
            }
            Err(Fout::BestaandeRouteNodig(reden)) => {
                envelop["route"] = json!("bestaandeRoute");
                envelop["fallbackSchema"] = json!(2);
                envelop["requiresFull"] = json!(true);
                envelop["reden"] = json!(match reden {
                    Middelengrens::Bron => "bron",
                    Middelengrens::BevestigdJournaal => "bevestigdJournaal",
                    Middelengrens::JournaalEnVoorstel => "journaalEnVoorstel",
                });
                envelop
            }
            Err(Fout::Ongeldig(e)) => return Err(AdapterFout::Ongeldig(e)),
        };
        antwoord["levensduur"] = json!(binding.levensduur);
        antwoord["volgnummer"] = json!(volgnummer);
        Ok(antwoord)
    }
    /// Reeds berekende antwoorden opnieuw aan de actieve levensduur binden.
    /// Een gesloten of vervangen document mag geen laat antwoord toepassen.
    #[cfg(test)]
    pub fn antwoord_actueel(&self, binding: &Binding) -> bool {
        self.actief.as_ref() == Some(binding)
    }
    pub fn opgeslagen_bytes(&self) -> usize {
        self.journaal.bytes()
    }
    #[cfg(test)]
    pub fn stel_proefgrens(&mut self, bytes: usize) {
        self.journaal.grens = bytes
    }
}
