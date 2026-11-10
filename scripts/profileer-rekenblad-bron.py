"""Instrument only the private diagnostic extract, never the vendor or patch chain."""
from pathlib import Path
import sys

path = Path(sys.argv[1]) / 'crates/betteroffice-xlsx/src/authority.rs'
source = path.read_text(encoding='utf-8')
start = source.index('    fn from_source_with_seed_chunk(')
end = source.index('    pub(crate) fn client_id(', start)
body = source[start:end]


def report(phase):
    return f'''        eprintln!("OOS_AUTH_PHASE {{}}", serde_json::json!({{"phase":"{phase}","ms":oos_phase.elapsed().as_secs_f64()*1000.0}}));
        let oos_phase = std::time::Instant::now();
'''


changes = [
    ('        let base = WorkbookBase::from_model_with_style_readings(',
     '        let oos_phase = std::time::Instant::now();\n        let base = WorkbookBase::from_model_with_style_readings('),
    ('        if client_id == Some(base.bootstrap_client_id) {',
     report('fingerprints') + '        if client_id == Some(base.bootstrap_client_id) {'),
    ('        drop(bootstrap);', '        drop(bootstrap);\n' + report('seedAndEncode')),
    ('        let authority = Self::hydrated(doc, Arc::new(base), 0);',
     report('hydrate') + '        let authority = Self::hydrated(doc, Arc::new(base), 0);'),
    ('        Ok((authority, model, structure))',
     report('projection') + '        let _ = oos_phase;\n        Ok((authority, model, structure))'),
]
for old, new in changes:
    assert body.count(old) == 1, old
    body = body.replace(old, new)
path.write_text(source[:start] + body + source[end:], encoding='utf-8')
print('Added phase timers only to the diagnostic source extract')
