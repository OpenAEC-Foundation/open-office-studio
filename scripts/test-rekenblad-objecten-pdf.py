"""Independently inspect the actual vector PDFs, including rotated group text."""
import json
import math
from pathlib import Path
from pypdf import PdfReader
import pypdfium2

directory = Path('.local/proef-rekenblad-objecten-print')
results = []
for name, expected in [('objects', 'Printed shape'), ('group', 'OK'), ('group-flipped', 'OK')]:
    reader = PdfReader(directory / f'{name}.pdf')
    assert len(reader.pages) == 1, name
    page = reader.pages[0]
    text = page.extract_text()
    assert expected in text, (name, text)
    assert len(page.images) == 1, (name, len(page.images))
    result = {'name': name, 'pages': 1, 'embeddedImages': 1, 'searchableText': expected}
    if name.startswith('group'):
        document = pypdfium2.PdfDocument(str(directory / f'{name}.pdf'))
        pdf_page = document[0]
        bitmap = pdf_page.render(scale=96/72)
        image = bitmap.to_pil().convert('RGB')
        points = [(x, y) for y in range(image.height) for x in range(image.width)
                  if (lambda c: c[0] > 240 and 115 < c[1] < 155 and c[2] < 20)(image.getpixel((x, y)))]
        assert len(points) > 1800, (name, len(points))
        mx = sum(x for x, y in points) / len(points)
        my = sum(y for x, y in points) / len(points)
        xx = sum((x-mx)**2 for x, y in points)
        yy = sum((y-my)**2 for x, y in points)
        xy = sum((x-mx)*(y-my) for x, y in points)
        angle = math.degrees(math.atan2(2*xy, xx-yy))/2
        expected_angle = 45 if name == 'group' else 75
        assert abs(angle-expected_angle) < 3, (name, angle, expected_angle)
        result['independentlyRenderedAngle'] = round(angle, 2)
        bitmap.close(); pdf_page.close(); document.close()
    results.append(result)
(directory / 'pdf-check.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
print(json.dumps(results))
