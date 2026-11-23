# Cancelled diagnostic setup: no native app observation

Run 45164287255, QA 86cb51086f9c71743ced44d173a91c885c506096, artifact 14814751501, ZIP 6238d01e77c0e27f76eacf6443a8b6d26c9b576b1f6772acde367de407b87c4d. Cancellation was requested after noticing invalid Swift .5 literals. The setup compiler independently reported those exact errors before app installation/launch or any native action; the whole run is cancelled, while its retained report records setup failure. This is driver evidence only.

Raw report has diagnosticOnly=false because the old acceptance setup assigned it before the diagnostic branch; nativePass=false and empty checks are authoritative. No Tab or body observation came from this run. The corrected run uses 0.5 with identical geometry tolerance. All payload members were hashed from the immutable ZIP.
