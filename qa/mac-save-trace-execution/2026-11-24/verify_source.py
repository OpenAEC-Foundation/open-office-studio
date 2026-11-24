"""Exact isolated source check; does not build or change files."""
from pathlib import Path
import sys
from contract import policy,validate_source
if __name__=='__main__':
    validate_source(Path(sys.argv[1]).resolve(),policy())
    print('Clean exact derived source and only reviewed observer/identity delta verified')
