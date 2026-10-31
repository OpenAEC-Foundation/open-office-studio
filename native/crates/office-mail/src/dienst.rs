//! Een eigen Tokio-runtime voor de native interface. De vensterdraad en de
//! documentwerkdraad wachten nooit op netwerk- of sleutelhangerverkeer.
use crate::email::{
    accounts::{AccountOpslag, Kluis},
    fout::{MailFout, Uitkomst},
};
use crate::{Account, AccountInvoer, Bericht, BerichtLijst, EmailKern, Lijstverzoek, Map};
use futures::channel::oneshot;
use std::{
    path::PathBuf,
    sync::{Arc, mpsc},
};

#[derive(Debug, Clone)]
pub enum Opdracht {
    Accounts,
    Bewaar(Box<AccountInvoer>),
    Mappen(String),
    Berichten(String, Lijstverzoek),
    Bericht(String, String, u32),
    Bron(String, String, u32),
}
#[derive(Debug, Clone)]
pub enum Antwoord {
    Accounts(Vec<Account>),
    Bewaard(Account),
    Mappen(Vec<Map>),
    Berichten(BerichtLijst),
    Bericht(Bericht),
    Bron(Vec<u8>),
}
struct Taak {
    opdracht: Opdracht,
    antwoord: oneshot::Sender<Uitkomst<Antwoord>>,
}
#[derive(Clone)]
pub struct Dienst {
    zender: mpsc::Sender<Taak>,
}
impl Dienst {
    pub fn start(map: PathBuf, kluis: Arc<dyn Kluis>) -> Result<Self, std::io::Error> {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()?;
        let (zender, ontvanger) = mpsc::channel::<Taak>();
        std::thread::Builder::new()
            .name("office-mail".into())
            .spawn(move || {
                let kern = EmailKern::nieuw(AccountOpslag::nieuw(&map), kluis);
                for taak in ontvanger {
                    let resultaat = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        runtime.block_on(async {
                            Ok(match taak.opdracht {
                                Opdracht::Accounts => Antwoord::Accounts(kern.accounts().await?),
                                Opdracht::Bewaar(a) => {
                                    Antwoord::Bewaard(kern.bewaar_account(*a).await?)
                                }
                                Opdracht::Mappen(a) => Antwoord::Mappen(kern.mappen(&a).await?),
                                Opdracht::Berichten(a, v) => {
                                    Antwoord::Berichten(kern.berichten(&a, v).await?)
                                }
                                Opdracht::Bericht(a, m, u) => {
                                    Antwoord::Bericht(kern.bericht(&a, &m, u).await?)
                                }
                                Opdracht::Bron(a, m, u) => {
                                    Antwoord::Bron(kern.bron(&a, &m, u).await?)
                                }
                            })
                        })
                    }))
                    .unwrap_or_else(|_| Err(MailFout::intern("De mailtaak is afgebroken")));
                    let _ = taak.antwoord.send(resultaat);
                }
            })?;
        Ok(Self { zender })
    }
    pub async fn voer_uit(self, opdracht: Opdracht) -> Uitkomst<Antwoord> {
        let (antwoord, ontvanger) = oneshot::channel();
        self.zender
            .send(Taak { opdracht, antwoord })
            .map_err(|_| MailFout::intern("De mailwerkdraad is gestopt"))?;
        ontvanger
            .await
            .map_err(|_| MailFout::intern("De mailwerkdraad is gestopt"))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email::accounts::{GeheugenKluis, tests::invoer};
    #[test]
    fn runtime_is_onafhankelijk_van_venster_en_bewaart_geen_geheimen_in_json() {
        let map = tempfile::tempdir().unwrap();
        let kluis = Arc::new(GeheugenKluis::default());
        let dienst = Dienst::start(map.path().into(), kluis.clone()).unwrap();
        // De aanroeper heeft bewust geen Tokio-runtime: precies zoals Iced.
        let antwoord =
            futures::executor::block_on(dienst.clone().voer_uit(Opdracht::Accounts)).unwrap();
        assert!(matches!(antwoord, Antwoord::Accounts(a) if a.is_empty()));
        let a = invoer("127.0.0.1", 993, 465, crate::Beveiliging::Ssl);
        let geheim = a.wachtwoord.clone().unwrap();
        let antwoord =
            futures::executor::block_on(dienst.clone().voer_uit(Opdracht::Bewaar(Box::new(a))))
                .unwrap();
        let Antwoord::Bewaard(a) = antwoord else {
            panic!()
        };
        assert!(kluis.inhoud.lock().unwrap().contains_key(&a.id));
        let json = std::fs::read_to_string(map.path().join(crate::email::accounts::ACCOUNTBESTAND))
            .unwrap();
        assert!(!json.contains(&geheim));
        let antwoord = futures::executor::block_on(dienst.voer_uit(Opdracht::Accounts)).unwrap();
        assert!(
            matches!(antwoord, Antwoord::Accounts(lijst) if lijst.len()==1 && lijst[0].id==a.id)
        );
    }
}
