/** Read-only package-control metadata; never installs a helper or changes policy. */
export function declaresZenity(dependencies) {
  return /(?:^|[,|])\s*zenity(?::[a-z0-9]+)?(?:\s|[,|]|$)/.test(dependencies);
}
