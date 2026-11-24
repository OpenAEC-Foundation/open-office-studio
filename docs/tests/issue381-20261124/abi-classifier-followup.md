# Scoped QA export-classifier correction

Integration authorized only this QA correction and local checks on retained ELF
bytes while critical publication run 45376499489 is active. No new library
build, runtime invocation, download, VM or CI run was started.

`qa/issue381/abi_contract.py` replaces the demangled substring heuristic with
an explicit symbol contract. The three direct API names from the original
runtime are enumerated in `abi-symbol-policy.json`; all must remain defined
GLOBAL/FUNC/DEFAULT symbols. The four observed `std::_Rb_tree` instantiations
are listed separately by their exact mangled names and must remain
WEAK/FUNC/DEFAULT. Missing or changed API, unknown libwps-related symbols,
new RTTI/vtables, changed template bindings and duplicate API names reject.
This is not a blanket exemption for standard-library or weak symbols.

The build report explicitly says `completeAbiCompatibility=false`. The public
symbol contract is one prerequisite, not a complete ABI verdict. Existing
SONAME, exact NEEDED names, `$ORIGIN`, dependency resolution, actual loaded ELF,
full canonical manifest/modes and strict typed source/engine/save/new-process
reopen assertions remain unchanged. The original shared verifier is untouched.

Eleven local unit tests passed on the same original artifact 14910758776 / SHA
`9752a031fcce02a403127141bae34fc7c4031755f8ac5f440b501355f9b85b29`.
The tests independently parse both original ELF `.dynsym` sections with the
already-present pyelftools 0.32. Positive checks classify three real API
exports and four separate weak extras correctly. Negative checks retain
failures for each missing API, binding/type/visibility changes, unknown
namespace/RTTI/template exports, duplicates and undefined-only symbols.
The GNU readelf field adapter is checked against those independently parsed
symbol rows. These are QA classifier tests, not new converter or ABI passes.

Replay using the existing local read-only parser dependency:

```sh
python qa/issue381/abi_contract_test.py -v
```

The failed original witness remains unchanged and fully retained. The product
proposal `b9233f3c` is unchanged. A new runtime allocation and frozen request
must be reviewed by integration before any further executing push. Current P5,
publication inputs, runtime pins, main and tags are unaffected.
