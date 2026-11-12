// OpenAEC: bewaak canonieke bytes bij andere sorteeralgoritmen (2026-11-12).
use super::*;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, sync::Arc};

#[test]
fn sleutelvolgorde_behoudt_de_vastgelegde_any_en_json_bytes() {
    let mut som = Sha256::new();
    let mut aantal = 0;
    for n in [0, 1, 2, 3, 4, 7, 8, 16, 32, 64, 128] {
        for zaad in 0..32 {
            let mut waarden = HashMap::new();
            for k in (0..n).rev() {
                let waarde = match (k + zaad) % 13 {
                    0 => Any::Undefined,
                    1 => Any::Null,
                    2 => Any::Bool(k % 2 == 0),
                    3 => Any::Number(f64::NAN),
                    4 => Any::Number(-0.0),
                    5 => Any::Number(f64::INFINITY),
                    6 => Any::Number(k as f64 + 0.25),
                    7 => Any::BigInt(i64::MIN + k as i64),
                    8 => Any::Buffer(Arc::from([0u8, 127, 255])),
                    9 => Any::from("\\\"\n😀"),
                    _ => Any::Number(k as f64),
                };
                waarden.insert(
                    format!("{}-{k:03}", if k % 2 == 0 { "😀" } else { "é" }),
                    waarde,
                );
            }
            let map = Any::Map(Arc::new(waarden));
            for waarde in [
                map.clone(),
                Any::Array(Arc::from([map.clone(), Any::Null, map])),
            ] {
                let mut any = Vec::new();
                encode_any(&waarde, &mut any);
                let mut json = DeterministicEncoderV1::new();
                json.write_json(&waarde);
                for bytes in [any, json.to_vec()] {
                    som.update((bytes.len() as u64).to_le_bytes());
                    som.update(&bytes);
                }
                aantal += 1;
            }
        }
    }
    assert_eq!(aantal, 704);
    let gevonden = format!("{:x}", som.finalize());
    // Gouden controlesom van de oorspronkelijke boomencoder, vóór de wijziging.
    assert_eq!(
        gevonden,
        "df68e07c726a0124a33b45b01cad3aae1e6c107487576e63af615bd416e0e148"
    );
}
