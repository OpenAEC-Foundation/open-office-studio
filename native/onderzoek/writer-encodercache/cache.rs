// Alleen een afzonderlijke proef: geen globale opslag of wijziging van de app.
use std::{mem::size_of, sync::Arc};
struct CacheWaarde { sleutel: (u8, usize, usize), _eigenaar: Any, bytes: Vec<u8>, gewicht: usize }
struct WaardeCache { plaatsen: Box<[Option<CacheWaarde>]>, gebruikt: usize, grens: usize, treffers: usize, missers: usize }
impl WaardeCache {
    fn nieuw(grens: usize) -> Self {
        let aantal = (grens / size_of::<Option<CacheWaarde>>() / 8).min(16384);
        let plaatsen = (0..aantal).map(|_| None).collect::<Vec<_>>().into_boxed_slice();
        Self { gebruikt: plaatsen.len()*size_of::<Option<CacheWaarde>>(), plaatsen, grens, treffers: 0, missers: 0 }
    }
    fn sleutel(a: &Any, json: bool) -> Option<(u8,usize,usize)> {
        match a {
            Any::Map(m) => Some((u8::from(json)*2, Arc::as_ptr(m) as usize, 0)),
            Any::Array(v) => Some((u8::from(json)*2+1, v.as_ptr() as usize, v.len())),
            _ => None,
        }
    }
    // Boekhoudgewicht, geen claim over allocator-/proces-RSS. Gedeelde
    // subwaarden worden bewust opnieuw geteld; onderliggende capaciteit telt mee.
    fn gewicht(a: &Any) -> usize {
        let extra = match a {
            Any::Map(m) => 64usize.saturating_add(m.capacity().saturating_mul(size_of::<(String,Any)>()+32))
                .saturating_add(m.iter().fold(0usize, |n,(k,v)| n.saturating_add(k.capacity()).saturating_add(Self::gewicht(v)))),
            Any::Array(v) => 32usize.saturating_add(v.len().saturating_mul(size_of::<Any>()))
                .saturating_add(v.iter().fold(0usize, |n,v| n.saturating_add(Self::gewicht(v)))),
            Any::String(s) => 32usize.saturating_add(s.len()),
            Any::Buffer(b) => 32usize.saturating_add(b.len()),
            _ => 0,
        }; extra
    }
    fn schrijf<W: Write>(&mut self, a: &Any, json: bool, uit: &mut W) {
        let Some(sleutel) = Self::sleutel(a,json) else { schrijf_ongewijzigd(a,json,uit); return; };
        if self.plaatsen.is_empty() { schrijf_ongewijzigd(a,json,uit); return; }
        let begin = (sleutel.1.rotate_right(4) ^ sleutel.2.wrapping_mul(31) ^ usize::from(sleutel.0).wrapping_mul(997)) % self.plaatsen.len();
        // Begrensd zoeken voorkomt kwadratische vertraging bij een volle index.
        let mut leeg = None;
        for stap in 0..16.min(self.plaatsen.len()) {
            let i = (begin+stap)%self.plaatsen.len();
            match &self.plaatsen[i] {
                Some(v) if v.sleutel == sleutel => { self.treffers+=1; uit.write_all(&v.bytes); return; },
                None => { leeg=Some(i); break; }, _=>{},
            }
        }
        self.missers+=1;
        let Some(i) = leeg else { schrijf_ongewijzigd(a,json,uit); return; };
        let mut bytes = Vec::new(); schrijf_ongewijzigd(a,json,&mut bytes);
        let gewicht = bytes.capacity().saturating_add(Self::gewicht(a));
        uit.write_all(&bytes);
        if gewicht <= self.grens.saturating_sub(self.gebruikt) {
            self.gebruikt+=gewicht;
            self.plaatsen[i]=Some(CacheWaarde { sleutel, _eigenaar:a.clone(), bytes, gewicht });
        }
    }
}
fn schrijf_ongewijzigd<W: Write>(a:&Any,json:bool,uit:&mut W) {
    if json { uit.write_string(&serde_json::to_string(&json_value(a)).unwrap()); }
    else { encode_any(a,uit); }
}
// De cache kan uitsluitend met zijn eigen replica worden gebruikt. Nieuwe bron
// betekent een nieuw object, ook als tekst en clientnummer toevallig gelijk zijn.
pub struct ProefReplica { doc: docx_edit::EditingDoc, cache: WaardeCache }
impl ProefReplica {
    pub fn nieuw(bytes:&[u8],grens:usize)->Self {
        use yrs::Transact;
        let doc=docx_edit::EditingDoc::new(20264562); doc.keep_deleted();
        doc.yrs_doc().transact_mut().apply_update(Update::decode_v1(bytes).unwrap()).unwrap();
        Self {doc,cache:WaardeCache::nieuw(grens)}
    }
    pub fn snapshot(&mut self)->Vec<u8> {
        use yrs::Transact;
        let txn=self.doc.yrs_doc().transact();
        // Deze eerste proef beperkt zich tot geïntegreerde bronnen. Geen
        // alternatieve samenvoegroute of herinterpretatie van pending updates.
        assert!(txn.store().pending_update().is_none() && txn.store().pending_ds().is_none());
        let mut encoder=DeterministicEncoderV1(EncoderV1::new(),Some(&mut self.cache));
        txn.encode_state_as_update(&StateVector::default(),&mut encoder); encoder.to_vec()
    }
    pub fn cijfers(&self)->(usize,usize,usize,usize) {(self.cache.gebruikt,self.cache.grens,self.cache.treffers,self.cache.missers)}
}
#[cfg(test)]
mod cacheproeven {
    use super::*;
    #[test]
    fn vormen_mutaties_en_sterke_eigendom() {
        use std::collections::HashMap;
        let mut cache=WaardeCache::nieuw(1024*1024);
        let mut a=Any::Map(Arc::new(HashMap::from([("eigen".into(),Any::Array(Arc::from([Any::from("eerste"),Any::Null])))])));
        for json in [false,true,false,true] {
            let mut verwacht=Vec::new(); schrijf_ongewijzigd(&a,json,&mut verwacht);
            let mut uit=Vec::new();cache.schrijf(&a,json,&mut uit);assert_eq!(uit,verwacht);
        }
        assert_eq!(cache.treffers,2);
        let oud=WaardeCache::sleutel(&a,false);
        if let Any::Map(m)=&mut a {Arc::make_mut(m).insert("eigen".into(),Any::from("veranderd"));}
        assert_ne!(oud,WaardeCache::sleutel(&a,false));
        for json in [true,false] { let mut uit=Vec::new();cache.schrijf(&a,json,&mut uit);let mut verwacht=Vec::new();schrijf_ongewijzigd(&a,json,&mut verwacht);assert_eq!(uit,verwacht); }
        assert!(cache.gebruikt<=cache.grens);
        assert_eq!(cache.gebruikt,cache.plaatsen.len()*size_of::<Option<CacheWaarde>>()+cache.plaatsen.iter().flatten().map(|v|v.gewicht).sum::<usize>());
    }
    #[test]
    fn nul_kleine_en_volle_grens_blijven_exact() {
        for grens in [0,1,128,1024,8192] {
            let mut cache=WaardeCache::nieuw(grens);
            for i in 0..300 {
                let a=Any::Array(Arc::from([Any::from(format!("waarde-{i}")),Any::Number(i as f64)]));
                for json in [false,true] { let mut verwacht=Vec::new();schrijf_ongewijzigd(&a,json,&mut verwacht);for _ in 0..2 {let mut uit=Vec::new();cache.schrijf(&a,json,&mut uit);assert_eq!(uit,verwacht);} }
                assert!(cache.gebruikt<=grens);
            }
        }
    }
}
#[cfg(test)]
mod replicaproeven {
    use super::*;
    use yrs::{Map,Text,Transact};
    #[test]
    fn twee_eigenaren_mutaties_en_externe_updates_blijven_exact() {
        let origineel=docx_edit::EditingDoc::new(77);origineel.keep_deleted();
        let basis=origineel.encode_state_as_update_v1();
        let mut a=ProefReplica::nieuw(&basis,1024*1024);
        let mut b=ProefReplica::nieuw(&basis,1024*1024);
        let tekst=a.doc.yrs_doc().get_or_insert_text("eigen proeftekst");
        let kaart=a.doc.yrs_doc().get_or_insert_map("eigen proefwaarden");
        for i in 0..20 {
            tekst.insert(&mut a.doc.yrs_doc().transact_mut(),0,"nieuwe woorden ");
            if i%2==0 {tekst.remove_range(&mut a.doc.yrs_doc().transact_mut(),0,2);}
            kaart.insert(&mut a.doc.yrs_doc().transact_mut(),"genest",Any::Array(Arc::from([Any::from(format!("waarde-{i}")),Any::Null])));
            for _ in 0..2 {assert_eq!(a.snapshot(),a.doc.encode_state_as_update_v1());}
            assert_eq!(b.snapshot(),basis,"Een andere eigenaar mag niet veranderen");
            assert!(a.cache.gebruikt<=a.cache.grens);
        }
        let peer=yrs::Doc::new();
        peer.transact_mut().apply_update(Update::decode_v1(&a.snapshot()).unwrap()).unwrap();
        peer.get_or_insert_text("eigen proeftekst").insert(&mut peer.transact_mut(),0,"extern ");
        let extern_bytes=peer.transact().encode_state_as_update_v1(&StateVector::default());
        a.doc.yrs_doc().transact_mut().apply_update(Update::decode_v1(&extern_bytes).unwrap()).unwrap();
        assert_eq!(a.snapshot(),a.doc.encode_state_as_update_v1());
        assert_eq!(b.snapshot(),basis);
        let nieuw=ProefReplica::nieuw(&a.snapshot(),1024*1024);
        assert_eq!(nieuw.cache.treffers,0,"Nieuwe bron krijgt een koude cache");
    }
}
