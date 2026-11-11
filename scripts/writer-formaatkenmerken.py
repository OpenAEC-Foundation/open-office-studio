"""Independent stdlib paragraph/feature oracle for synthetic Writer fixtures.

This compares text and feature counts, not visual layout or arbitrary ODF/Word
semantics. Input files remain untouched. Document content is emitted only for
the caller's local comparison, not included in the committed test reports.
"""
import collections
import json
import sys
import xml.etree.ElementTree as E
import zipfile

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
T = '{urn:oasis:names:tc:opendocument:xmlns:text:1.0}'
O = '{urn:oasis:names:tc:opendocument:xmlns:office:1.0}'
S = '{urn:oasis:names:tc:opendocument:xmlns:style:1.0}'
D = '{urn:oasis:names:tc:opendocument:xmlns:drawing:1.0}'
B = '{urn:oasis:names:tc:opendocument:xmlns:table:1.0}'


def kenmerken(path):
    texts = []
    features = collections.Counter()

    def odf(root):
        for node in root.iter():
            if node.tag in (T+'p', T+'h'):
                text = ' '.join(''.join(node.itertext()).split())
                if text:
                    texts.append(text)
            if node.tag in (T+'changed-region', O+'annotation', T+'note', D+'image', B+'table', S+'header', S+'footer'):
                features[node.tag] += 1

    if not zipfile.is_zipfile(path):
        odf(E.parse(path).getroot())
    else:
        with zipfile.ZipFile(path) as package:
            names = package.namelist()
            if 'content.xml' in names:
                for name in ('content.xml', 'styles.xml'):
                    if name in names:
                        odf(E.fromstring(package.read(name)))
            else:
                for name in names:
                    if name == 'word/document.xml' or (name.startswith('word/') and name.endswith('.xml') and any(name.split('/')[-1].startswith(k) for k in ('header', 'footer', 'footnotes', 'endnotes', 'comments'))):
                        root = E.fromstring(package.read(name))
                        for node in root.iter():
                            if node.tag == W+'p':
                                text = ' '.join(''.join(n.text or '' for n in node.iter() if n.tag in (W+'t', W+'delText')).split())
                                if text:
                                    texts.append(text)
                            if node.tag in (W+'ins', W+'del', W+'footnote', W+'endnote', W+'comment', W+'tbl', W+'drawing', W+'hdr', W+'ftr'):
                                features[node.tag] += 1
    return {'texts': sorted(texts), 'features': features}


if __name__ == '__main__':
    print(json.dumps(kenmerken(sys.argv[1]), ensure_ascii=True))
