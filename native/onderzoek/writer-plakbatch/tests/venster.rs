use yrs::types::{
    Attrs,
    text::{Diff, YChange},
};
use yrs::{Any, Doc, Map, MapPrelim, OffsetKind, Options, ReadTxn, Text, TextRef, Transact};
fn lengte(d: &Diff<YChange>) -> u32 {
    match &d.insert {
        yrs::Out::Any(Any::String(s)) => s.encode_utf16().count() as u32,
        _ => 1,
    }
}
fn controleer<T: ReadTxn>(t: &TextRef, txn: &T) {
    let vol = t.diff(txn, YChange::identity);
    let mut offset_embed = 0;
    let verwacht_embeds: Vec<_> = t
        .diff(txn, YChange::identity)
        .into_iter()
        .filter_map(|d| {
            let at = offset_embed;
            offset_embed += lengte(&d);
            if matches!(&d.insert, yrs::Out::Any(Any::String(_))) {
                None
            } else {
                Some((at, d.insert))
            }
        })
        .collect();
    let mut werkelijk_embeds = Vec::new();
    t.visit_utf16_embeds(txn, |at, out| {
        werkelijk_embeds.push((at, out));
        true
    });
    assert_eq!(werkelijk_embeds, verwacht_embeds);
    let mut eerste = Vec::new();
    t.visit_utf16_embeds(txn, |at, out| {
        eerste.push((at, out));
        false
    });
    assert_eq!(
        eerste,
        verwacht_embeds.into_iter().take(1).collect::<Vec<_>>()
    );

    let mut offset = 0;
    let runs: Vec<_> = vol
        .into_iter()
        .map(|d| {
            let at = offset;
            offset += lengte(&d);
            (at, d)
        })
        .collect();
    for lo in 0..=offset + 1 {
        for hi in lo..=offset + 1 {
            let verwacht: Vec<_> = runs
                .iter()
                .filter(|(at, d)| *at + lengte(d) > lo && *at < hi)
                .map(|(at, d)| (*at, Diff::new(d.insert.clone(), d.attributes.clone())))
                .collect();
            let mut werkelijk = Vec::new();
            t.visit_utf16_window(txn, lo, |at, d| {
                if at >= hi {
                    return false;
                }
                werkelijk.push((at, d));
                true
            });
            assert_eq!(werkelijk, verwacht, "Venster {lo}..{hi}");
        }
    }
}
#[test]
fn vensters_behouden_volle_unicode_runs_en_ingesloten_objecten() {
    let mut options = Options::with_client_id(yrs::ClientID::new(9876));
    options.offset_kind = OffsetKind::Utf16;
    let d = Doc::with_options(options);
    let t = d.get_or_insert_text("tekst");
    {
        let mut txn = d.transact_mut();
        t.insert(&mut txn, 0, "A😀é漢z");
        t.format(
            &mut txn,
            3,
            2,
            Attrs::from([("vet".into(), Any::Bool(true))]),
        );
        let m = t.insert_embed(&mut txn, 3, MapPrelim::default());
        m.insert(&mut txn, "soort", "alinea");
        t.insert_embed(&mut txn, 4, MapPrelim::default());
        t.insert(&mut txn, 4, "Tussen");
        let einde = t.len(&txn);
        t.insert_embed(&mut txn, einde, Any::from("afbeelding"));
        controleer(&t, &txn);
    }
    controleer(&t, &d.transact());
    {
        let mut txn = d.transact_mut();
        t.remove_range(&mut txn, 1, 2);
        t.format(
            &mut txn,
            0,
            2,
            Attrs::from([("kleur".into(), Any::from("123456"))]),
        );
        controleer(&t, &txn);
    }
    controleer(&t, &d.transact());
}
#[test]
fn opeenvolgende_opmaak_en_verwijderingen_houden_dezelfde_runs() {
    let mut options = Options::with_client_id(yrs::ClientID::new(1234));
    options.offset_kind = OffsetKind::Utf16;
    options.skip_gc = true;
    let d = Doc::with_options(options);
    let t = d.get_or_insert_text("tekst");
    for i in 0..24 {
        {
            let mut txn = d.transact_mut();
            let einde = t.len(&txn);
            t.insert(&mut txn, einde, if i % 3 == 0 { "😀é" } else { "ab" });
            let einde = t.len(&txn);
            t.format(
                &mut txn,
                0,
                einde,
                Attrs::from([(
                    "vet".into(),
                    if i % 2 == 0 {
                        Any::Bool(true)
                    } else {
                        Any::Null
                    },
                )]),
            );
            t.insert(&mut txn, 0, "x");
            t.remove_range(&mut txn, 0, 1);
            if i % 4 == 0 {
                let m = t.insert_embed(&mut txn, 0, MapPrelim::default());
                m.insert(&mut txn, "nummer", i);
            }
            controleer(&t, &txn);
        }
        controleer(&t, &d.transact());
    }
}
