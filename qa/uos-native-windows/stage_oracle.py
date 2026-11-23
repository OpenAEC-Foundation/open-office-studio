"""Preserve original UOF oracle; add only the explicit intermediate SUM stage."""
from decimal import Decimal
import importlib.util
import json
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location('uos_source_oracle', Path(__file__).parent / 'fixture/oracle.py')
original = importlib.util.module_from_spec(spec); spec.loader.exec_module(original)

def check(source, file, stage):
    oracle = original.parse_source(source)
    if stage in ('original', 'final'):
        return original.verify_xlsx(oracle, file, stage == 'final')
    assert stage == 'sum'
    actual = original.read_xlsx(file)
    assert [s['name'] for s in actual] == [s['name'] for s in oracle['sheets']]
    cfg = oracle['expected']['edit']; checked = 0
    for source_sheet, result in zip(oracle['sheets'], actual):
        expected = dict(source_sheet['cells'])
        if source_sheet['name'] == cfg['sheet']:
            expected[cfg['formulaCell']] = dict(kind='number', value=oracle['expected']['before'], formula=cfg['formula'].lstrip('='))
        assert set(result['cells']) == set(expected)
        for address, wanted in expected.items():
            found = result['cells'][address]
            assert found['formula'] == wanted.get('formula'), address
            if wanted['kind'] == 'number':
                assert found['kind'] == 'n' and Decimal(found['value']) == Decimal(wanted['value']), address
            else:
                assert found['kind'] in ('s', 'inlineStr', 'str') and found['value'] == wanted['value'], address
            checked += 1
    assert checked == 157
    return dict(passed=True, stage=stage, sha256=original.sha(Path(file).read_bytes()), sheets=3,
                checkedPopulatedCells=checked, sourceFormulaCount=0, addedFormulaCount=1,
                expectedResult=oracle['expected']['before'], sourceSha256=oracle['source']['sha256'])

if __name__ == '__main__':
    source, file, stage, output = sys.argv[1:]
    report = check(source, file, stage)
    Path(output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))
