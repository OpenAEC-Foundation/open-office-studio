//! Een klok hoort bij de documentensessie; tests wijzigen nooit de procesklok.
use chrono::{DateTime, SecondsFormat, Utc};

pub trait Klok: Send + Sync {
    fn nu(&self) -> DateTime<Utc>;
}
#[derive(Default)]
pub struct SysteemKlok;
impl Klok for SysteemKlok {
    fn nu(&self) -> DateTime<Utc> {
        Utc::now()
    }
}
#[derive(Clone)]
pub struct VasteKlok(DateTime<Utc>);
impl VasteKlok {
    pub fn parseer(tijd: &str) -> Result<Self, chrono::ParseError> {
        Ok(Self(
            DateTime::parse_from_rfc3339(tijd)?.with_timezone(&Utc),
        ))
    }
}
impl Klok for VasteKlok {
    fn nu(&self) -> DateTime<Utc> {
        self.0
    }
}
pub(crate) fn tijdstempel(klok: &dyn Klok) -> String {
    klok.nu().to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Alleen de weergave kiest een dagzone; opgeslagen tijdstempels blijven UTC.
#[derive(Clone, Copy, Debug, Default)]
pub enum Dagzone {
    #[default]
    Systeem,
    Utc,
    Vast(chrono::FixedOffset),
}
impl Dagzone {
    pub fn vast(seconden: i32) -> Option<Self> {
        chrono::FixedOffset::east_opt(seconden).map(Self::Vast)
    }
    pub fn kalenderdag(self, tijd: &str) -> Option<(i32, u32, u32)> {
        use chrono::Datelike;
        let tijd = DateTime::parse_from_rfc3339(tijd).ok()?;
        let dag = match self {
            Self::Systeem => tijd.with_timezone(&chrono::Local).date_naive(),
            Self::Utc => tijd.with_timezone(&Utc).date_naive(),
            Self::Vast(zone) => tijd.with_timezone(&zone).date_naive(),
        };
        Some((dag.year(), dag.month(), dag.day()))
    }
}
