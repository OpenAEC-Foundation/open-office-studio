//! Diagnostic integration probe, copied into the verified native source tree.
//! Uses bounded fixtures; the output is not the #74 full-editor acceptance test.
use betteroffice_xlsx::{CalculationOptions, Workbook};
use std::time::Instant;

#[test]
fn bounded_open_phases() {
    let directory = std::env::var("OOS_OPEN_PROFILE_DIR").unwrap();
    for rows in [1000, 4000, 10000] {
        let bytes = std::fs::read(format!("{directory}/{rows}.xlsx")).unwrap();
        let start = Instant::now();
        let parts = ooxml_opc::unzip_parts(&bytes).unwrap();
        let unzip_ms = start.elapsed().as_secs_f64() * 1000.0;
        let start = Instant::now();
        let parsed = xlsx_parse::parse_workbook_with_owned_package(parts).unwrap();
        let parse_ms = start.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(parsed.workbook.sheets[0].iter_cells().count(), rows * 30);
        let start = Instant::now();
        let mut workbook = Workbook::from_model(parsed.workbook).unwrap();
        let authority_ms = start.elapsed().as_secs_f64() * 1000.0;
        let start = Instant::now();
        workbook.recalculate_all(CalculationOptions::default());
        let recalc_ms = start.elapsed().as_secs_f64() * 1000.0;
        println!("OOS_OPEN_PROFILE {}", serde_json::json!({
            "rows":rows,"columns":30,"cells":rows*30,
            "unzipMs":unzip_ms,"parseMs":parse_ms,
            "authorityAndProjectionMs":authority_ms,"recalculateMs":recalc_ms,
        }));
    }
}
