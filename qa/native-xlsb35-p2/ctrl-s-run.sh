#!/usr/bin/env bash
set -euo pipefail
test "${GITHUB_ACTIONS:-}" = true
test "$(uname -s)" = Linux
dbus-update-activation-environment DISPLAY XAUTHORITY XDG_CURRENT_DESKTOP XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME GDK_BACKEND
baseline=$(gsettings get org.gnome.desktop.interface toolkit-accessibility)
restore() {
  result=$?
  gsettings set org.gnome.desktop.interface toolkit-accessibility "$baseline"
  gsettings get org.gnome.desktop.interface toolkit-accessibility > .local/linux-p2-native/xlsb35-ctrl-s/accessibility-after.txt
  exit "$result"
}
trap restore EXIT
printf '%s\n' "$baseline" > .local/linux-p2-native/xlsb35-ctrl-s/accessibility-before.txt
gsettings set org.gnome.desktop.interface toolkit-accessibility true
node .local/native-xlsb-harness/qa/native-xlsb35-p2/ctrl-s-driver.mjs
