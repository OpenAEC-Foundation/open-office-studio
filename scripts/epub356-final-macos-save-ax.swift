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
var queue: [(AXUIElement, Int)] = (attribute(app, kAXWindowsAttribute) as? [AXUIElement] ?? []).map { ($0, 0) }
var metadata: [[String: Any]] = []
var filenameFields: [AXUIElement] = [], saveButtons: [AXUIElement] = [], goButtons: [AXUIElement] = []
var index = 0
while index < queue.count && index < 600 && Date() < deadline {
    let (e, depth) = queue[index]; index += 1
    let role = string(e, kAXRoleAttribute)
    if role == "AXWebArea" || role == "AXTextArea" { continue }
    let title = string(e, kAXTitleAttribute), description = string(e, kAXDescriptionAttribute)
    let enabled = attribute(e, kAXEnabledAttribute) as? Bool ?? false
    metadata.append(["role": role, "title": title, "description": description, "enabled": enabled])
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
    if depth < 14 { queue.append(contentsOf: children(e).map { ($0, depth + 1) }) }
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
    // The focused path field must be on the owned app's native Go-to-Folder
    // panel with its unique Go button; never type into a web/editor field.
    if goButtons.count == 1, let focused = attribute(app, kAXFocusedUIElementAttribute), CFGetTypeID(focused) == AXUIElementGetTypeID() {
        let e = focused as! AXUIElement
        let role = string(e, kAXRoleAttribute)
        if ["AXTextField", "AXComboBox"].contains(role) && folder.hasPrefix("/") {
            let result = AXUIElementSetAttributeValue(e, kAXValueAttribute as CFString, folder as CFString)
            report["setPathError"] = result.rawValue
            if result == .success {
                if attribute(goButtons[0], kAXEnabledAttribute) as? Bool == true {
                    let press = AXUIElementPerformAction(goButtons[0], kAXPressAction as CFString)
                    report["pressError"] = press.rawValue
                    if press == .success { report["status"] = "acted" }
                } else { report["reason"] = "The native Go button is not enabled after path entry" }
            }
        } else { report["reason"] = "The owned native folder path field is not focused" }
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
