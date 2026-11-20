// Isolated-CI NSSavePanel actions, bound to the owned app's native AX tree.
// Never traverses document text areas or WKWebView content; no permission grants.
import ApplicationServices
import Foundation

let pid = pid_t(CommandLine.arguments[1])!
let expectedName = CommandLine.arguments[2]
let action = CommandLine.arguments[3]
let folder = CommandLine.arguments.count > 4 ? CommandLine.arguments[4] : ""
let app = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app, 0.5)
let deadline = Date().addingTimeInterval(7)
var errors: [String: Int] = [:]
func attribute(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
    if Date() >= deadline { return nil }
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(e, name as CFString, &value)
    if result != .success { errors[String(result.rawValue), default: 0] += 1 }
    return value
}
func string(_ e: AXUIElement, _ name: String) -> String { String((attribute(e, name) as? String ?? "").prefix(500)) }
func children(_ e: AXUIElement) -> [AXUIElement] {
    if Date() >= deadline { return [] }
    var count: CFIndex = 0
    guard AXUIElementGetAttributeValueCount(e, kAXChildrenAttribute as CFString, &count) == .success && count > 0 else { return [] }
    var result: CFArray?
    if AXUIElementCopyAttributeValues(e, kAXChildrenAttribute as CFString, 0, min(count, 64), &result) == .success {
        return result as? [AXUIElement] ?? []
    }
    return []
}

var report: [String: Any] = ["pid": pid, "trusted": AXIsProcessTrusted(), "status": "blocked", "action": action]
var queue: [(AXUIElement, Int, [AXUIElement])] = (attribute(app, kAXWindowsAttribute) as? [AXUIElement] ?? []).map { ($0, 0, []) }
var metadata: [[String: Any]] = []
var filenameFields: [AXUIElement] = [], saveButtons: [AXUIElement] = [], goButtons: [AXUIElement] = []
var nativeFields: [(element: AXUIElement, sheets: [AXUIElement])] = []
var index = 0
while index < queue.count && index < 600 && Date() < deadline {
    let (e, depth, ancestorSheets) = queue[index]; index += 1
    let role = string(e, kAXRoleAttribute)
    if role == "AXWebArea" || role == "AXTextArea" { continue }
    let sheets = role == "AXSheet" ? ancestorSheets + [e] : ancestorSheets
    let title = string(e, kAXTitleAttribute), description = string(e, kAXDescriptionAttribute)
    let enabled = attribute(e, kAXEnabledAttribute) as? Bool ?? false
    metadata.append(["role": role, "title": title, "description": description, "enabled": enabled,
                     "nativeSheetDepth": sheets.count])
    if ["AXTextField", "AXComboBox"].contains(role) { nativeFields.append((e, sheets)) }
    if role == "AXTextField" {
        let value = string(e, kAXValueAttribute)
        if value == expectedName || value == (expectedName as NSString).deletingPathExtension { filenameFields.append(e) }
    }
    if role == "AXButton" {
        if enabled && (["Save", "Opslaan"].contains(title) || ["Save", "Opslaan"].contains(description)) { saveButtons.append(e) }
        // A blank Go-to-Folder field can leave Go disabled. Identify the
        // native panel first so setting its path can enable that same button.
        if ["Go", "Ga"].contains(title) || ["Go", "Ga"].contains(description) { goButtons.append(e) }
    }
    if depth < 14 { queue.append(contentsOf: children(e).map { ($0, depth + 1, sheets) }) }
}
report["nodes"] = metadata
report["visited"] = index
report["bounded"] = index >= 600 || Date() >= deadline
report["filenameMatches"] = filenameFields.count
report["saveButtons"] = saveButtons.count
report["goButtons"] = goButtons.count

if !AXIsProcessTrusted() {
    report["reason"] = "Native Accessibility is unavailable; no permission changes attempted"
} else if action == "inspect" {
    if filenameFields.count == 1 && saveButtons.count == 1 && goButtons.isEmpty {
        report["status"] = "ready"
    } else { report["reason"] = "A unique native filename field and Save button are required outside WKWebView" }
} else if action == "go" {
    // macOS 26's real Go-to-Folder sheet has no Go button. Require a focused
    // native field in an additional sheet inside the same identified Save
    // sheet, distinct from its filename field. Never use title-only ownership
    // or accept a field reached through WKWebView/document text.
    if filenameFields.count == 1 && goButtons.count <= 1,
       let focused = attribute(app, kAXFocusedUIElementAttribute), CFGetTypeID(focused) == AXUIElementGetTypeID() {
        let e = focused as! AXUIElement
        let role = string(e, kAXRoleAttribute)
        var focusedPid: pid_t = 0
        let pidError = AXUIElementGetPid(e, &focusedPid)
        let field = nativeFields.first { CFEqual($0.element, e) }
        let filename = nativeFields.first { CFEqual($0.element, filenameFields[0]) }
        let sameSaveSheet = field != nil && filename != nil && !filename!.sheets.isEmpty
            && field!.sheets.count > filename!.sheets.count
            && zip(filename!.sheets, field!.sheets).allSatisfy { CFEqual($0.0, $0.1) }
        report["focusedRole"] = role
        report["focusedPid"] = focusedPid
        report["focusedPidError"] = pidError.rawValue
        report["focusedNativeSheetDepth"] = field?.sheets.count ?? 0
        report["filenameNativeSheetDepth"] = filename?.sheets.count ?? 0
        report["sameOwnedSaveSheet"] = sameSaveSheet
        if ["AXTextField", "AXComboBox"].contains(role) && folder.hasPrefix("/")
            && pidError == .success && focusedPid == pid && sameSaveSheet && !CFEqual(e, filenameFields[0]) {
            let result = AXUIElementSetAttributeValue(e, kAXValueAttribute as CFString, folder as CFString)
            report["setPathError"] = result.rawValue
            let readback = string(e, kAXValueAttribute)
            report["pathReadbackMatches"] = readback == folder
            if result == .success && readback == folder {
                if goButtons.isEmpty {
                    report["status"] = "path-entered-awaiting-native-return"
                } else if attribute(goButtons[0], kAXEnabledAttribute) as? Bool == true {
                    let press = AXUIElementPerformAction(goButtons[0], kAXPressAction as CFString)
                    report["pressError"] = press.rawValue
                    if press == .success { report["status"] = "acted" }
                } else { report["reason"] = "The native Go button is not enabled after path entry" }
            }
        } else { report["reason"] = "The focused native path field is not in the owned nested Save sheet" }
    } else { report["reason"] = "The owned native Go-to-Folder panel is unavailable or ambiguous" }
} else if action == "save" {
    if filenameFields.count == 1 && saveButtons.count == 1 && goButtons.isEmpty {
        let result = AXUIElementPerformAction(saveButtons[0], kAXPressAction as CFString)
        report["pressError"] = result.rawValue
        if result == .success { report["status"] = "acted" }
    } else { report["reason"] = "The owned native Save panel is unavailable or ambiguous" }
} else { report["reason"] = "Unknown native save action" }
report["errors"] = errors
let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
