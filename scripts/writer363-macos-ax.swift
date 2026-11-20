// #363 only: native AX inspection/whitelisted presses, no app/model/value setters.
import ApplicationServices
import AppKit
import Foundation
import Darwin

let args = CommandLine.arguments
guard args.count >= 3, let pid = Int32(args[1]), pid > 0 else { exit(2) }
let action = args[2]
let app = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app, 0.4)
let deadline = Date().addingTimeInterval(12)
var report: [String: Any] = ["pid": pid, "action": action, "trusted": AXIsProcessTrusted(), "status": "blocked"]
var errors: [String: Int] = [:]
func attr(_ e: AXUIElement, _ key: String) -> CFTypeRef? {
    guard Date() < deadline else { return nil }
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(e, key as CFString, &value)
    if result != .success { errors[String(result.rawValue), default: 0] += 1 }
    return value
}
func string(_ e: AXUIElement, _ key: String) -> String { attr(e, key) as? String ?? "" }
func box(_ e: AXUIElement) -> (CGPoint, CGSize)? {
    guard let p = attr(e, kAXPositionAttribute), let s = attr(e, kAXSizeAttribute),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero; var size = CGSize.zero
    guard AXValueGetValue(p as! AXValue, .cgPoint, &point), AXValueGetValue(s as! AXValue, .cgSize, &size),
          point.x.isFinite, point.y.isFinite, size.width.isFinite, size.height.isFinite,
          size.width > 1, size.height > 1 else { return nil }
    return (point, size)
}
func raw(_ e: AXUIElement) -> [String: Any] {
    var result: [String: Any] = [:]
    let role = string(e, kAXRoleAttribute)
    for key in [kAXRoleAttribute, kAXSubroleAttribute, kAXTitleAttribute, kAXDescriptionAttribute, kAXHelpAttribute,
                kAXIdentifierAttribute, kAXEnabledAttribute, kAXSelectedAttribute, kAXFocusedAttribute,
                kAXPositionAttribute, kAXSizeAttribute, kAXValueAttribute] {
        if key == kAXValueAttribute && role == "AXTextArea" {
            result[key] = ["status": "omitted", "reason": "Document value outside label scope"]; continue
        }
        var value: CFTypeRef?
        guard Date() < deadline else { result[key] = ["status": "unavailable", "reason": "deadline"]; continue }
        let error = AXUIElementCopyAttributeValue(e, key as CFString, &value)
        guard error == .success, let v = value else { result[key] = ["status": "unavailable", "axError": error.rawValue]; continue }
        if let text = v as? String {
            result[key] = ["status": "available", "value": String(text.prefix(2048)), "truncated": text.count > 2048]
        } else if let number = v as? NSNumber { result[key] = ["status": "available", "value": number] }
        else if CFGetTypeID(v) == AXValueGetTypeID() {
            var p = CGPoint.zero; var s = CGSize.zero
            if AXValueGetType(v as! AXValue) == .cgPoint, AXValueGetValue(v as! AXValue, .cgPoint, &p) {
                result[key] = ["status": "available", "value": ["x": p.x, "y": p.y]]
            } else if AXValueGetType(v as! AXValue) == .cgSize, AXValueGetValue(v as! AXValue, .cgSize, &s) {
                result[key] = ["status": "available", "value": ["width": s.width, "height": s.height]]
            } else { result[key] = ["status": "unavailable", "reason": "unsupported AXValue"] }
        } else { result[key] = ["status": "unavailable", "reason": "unsupported type"] }
    }
    var actions: CFArray?
    let error = AXUIElementCopyActionNames(e, &actions)
    result["actions"] = ["axError": error.rawValue, "value": actions as? [String] ?? []]
    return result
}
func permitted(_ kind: String, _ role: String, _ label: String) -> Bool {
    let tabs = ["Home", "Start", "Insert", "Invoegen", "Format", "Opmaak", "Header & Footer", "Kop- en voettekst", "References", "Verwijzingen", "Styles", "Stijlen", "Layout", "Indeling", "Review", "Controleren", "View", "Beeld", "Tools", "Extra"]
    switch kind {
    case "ribbon-tab": return ["AXRadioButton", "AXTab"].contains(role) && tabs.contains(label)
    case "management-toggle": return role == "AXButton" && ["Styles", "Stijlen"].contains(label)
    case "maximize": return role == "AXButton" && label == "Maximize"
    case "settings-open": return role == "AXButton" && ["Settings", "Instellingen"].contains(label)
    case "settings-save": return role == "AXButton" && ["Save", "Opslaan"].contains(label)
    case "settings-cancel": return role == "AXButton" && ["Cancel", "Annuleren"].contains(label)
    case "language-trigger": return ["AXButton", "AXPopUpButton"].contains(role) && ["Language: English", "Taal: English", "Language: Nederlands", "Taal: Nederlands"].contains(label)
    case "language-option": return ["AXMenuItem", "AXButton", "AXRow"].contains(role) && ["Nederlands", "Nederlands Dutch", "Nederlands Nederlands", "English", "English English", "English Engels"].contains(label)
    default: return false
    }
}
func contained(_ p: CGPoint, _ s: CGSize, _ wp: CGPoint, _ ws: CGSize) -> Bool {
    p.x >= wp.x && p.y >= wp.y && p.x+s.width <= wp.x+ws.width+1 && p.y+s.height <= wp.y+ws.height+1
}
func allowedGeometry(_ p: CGPoint, _ s: CGSize, _ wp: CGPoint, _ ws: CGSize, _ kind: String, _ role: String, _ label: String) -> Bool {
    if contained(p, s, wp, ws) { return true }
    // AXPopUpButton can report the popup's union frame above the actual window.
    // This exact native language trigger is pressed with AXPress, never XY input.
    return kind == "language-trigger" && role == "AXPopUpButton" && permitted(kind, role, label)
        && p.x < wp.x+ws.width && p.y < wp.y+ws.height && p.x+s.width > wp.x && p.y+s.height > wp.y
}
let cgWindows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let owned = cgWindows.filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid && ($0[kCGWindowLayer as String] as? NSNumber)?.intValue == 0 }
report["ownedScreenWindows"] = owned.map { w in ["id": w[kCGWindowNumber as String] ?? NSNull(), "bounds": w[kCGWindowBounds as String] ?? NSNull(), "title": w[kCGWindowName as String] ?? NSNull(), "pid": pid] as [String: Any] }
report["screenCaptureAuthorized"] = CGPreflightScreenCaptureAccess()
let display = CGDisplayBounds(CGMainDisplayID())
report["mainDisplay"] = ["bounds": ["X": display.origin.x, "Y": display.origin.y, "Width": display.width, "Height": display.height]]
if !AXIsProcessTrusted() { report["reason"] = "Accessibility unavailable; no privacy changes attempted" }
else if let windows = attr(app, kAXWindowsAttribute) as? [AXUIElement], windows.count == 1, owned.count == 1 {
    var queue: [(AXUIElement, Int, Int)] = [(windows[0], 0, -1)]
    var nodes: [[String: Any]] = []
    var index = 0
    while index < queue.count && index < 1500 && Date() < deadline {
        let (element, depth, parent) = queue[index]
        let attributes = raw(element)
        nodes.append(["index": index, "parent": parent, "depth": depth, "attributes": attributes])
        if string(element, kAXRoleAttribute) != "AXTextArea" && depth < 25 {
            var count: CFIndex = 0; var children: CFArray?
            if AXUIElementGetAttributeValueCount(element, kAXChildrenAttribute as CFString, &count) == .success, count > 0 {
                if count > 128 { report["childListsTruncated"] = true }
                if AXUIElementCopyAttributeValues(element, kAXChildrenAttribute as CFString, 0, min(count, 128), &children) == .success {
                    queue.append(contentsOf: (children as? [AXUIElement] ?? []).map { ($0, depth+1, index) })
                }
            }
        } else if depth >= 25 { report["depthBoundReached"] = true }
        index += 1
    }
    report["rawNodes"] = nodes
    report["bounded"] = Date() >= deadline || index >= 1500
    report["status"] = "observed"
    if action == "press" {
        if args.count > 3, let data = args[3].data(using: .utf8), let spec = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let kind = spec["kind"] as? String, let role = spec["role"] as? String, let label = spec["label"] as? String,
           let x = spec["x"] as? Double, let y = spec["y"] as? Double, let width = spec["width"] as? Double, let height = spec["height"] as? Double,
           permitted(kind, role, label) {
            let matches = queue.prefix(index).filter { item in
                let e = item.0
                guard string(e, kAXRoleAttribute) == role, [string(e, kAXTitleAttribute), string(e, kAXDescriptionAttribute)].contains(label),
                      (attr(e, kAXEnabledAttribute) as? Bool) == true, let (p,s) = box(e) else { return false }
                return abs(p.x-x) < 2 && abs(p.y-y) < 2 && abs(s.width-width) < 2 && abs(s.height-height) < 2
            }
            if matches.count == 1, let (p,s) = box(matches[0].0), let (wp,ws) = box(windows[0]),
               allowedGeometry(p, s, wp, ws, kind, role, label) {
                let eligible = queue.prefix(index).filter { item in
                    guard kind == "language-trigger", role == "AXPopUpButton" else { return false }
                    let e = item.0
                    guard string(e, kAXRoleAttribute) == role, [string(e, kAXTitleAttribute), string(e, kAXDescriptionAttribute)].contains(label),
                          (attr(e, kAXEnabledAttribute) as? Bool) == true, let (ep,es) = box(e) else { return false }
                    return allowedGeometry(ep, es, wp, ws, kind, role, label)
                }
                var names: CFArray?
                let error = AXUIElementCopyActionNames(matches[0].0, &names)
                if (kind != "language-trigger" || role != "AXPopUpButton" || eligible.count == 1), error == .success, (names as? [String] ?? []).contains(kAXPressAction) {
                    NSRunningApplication(processIdentifier: pid)?.activate(options: [])
                    let result = AXUIElementPerformAction(matches[0].0, kAXPressAction as CFString)
                    report["pressError"] = result.rawValue
                    report["pressed"] = spec
                    report["actualGeometryPolicy"] = contained(p,s,wp,ws) ? "fully-contained-native-control" : "partial-native-language-popup-AXPress-only"
                    report["status"] = result == .success ? "input-sent" : "blocked"
                } else { report["status"] = "blocked"; report["reason"] = "Unique actual control has no AXPress" }
            } else { report["status"] = "blocked"; report["reason"] = "Role/name/native geometry no longer uniquely match" }
        } else { report["status"] = "blocked"; report["reason"] = "Unsupported whitelisted native control request" }
    } else if action == "chord" {
        let target = args.count > 3 ? args[3] : ""
        if target == "cmd-q" || target == "escape" {
            let code: CGKeyCode = target == "cmd-q" ? 12 : 53
            for down in [true, false] {
                let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down)
                if target == "cmd-q" { event?.flags = .maskCommand }
                event?.postToPid(pid)
            }
            report["status"] = "input-sent"; report["chord"] = target
        } else { report["status"] = "blocked"; report["reason"] = "Unsupported bounded chord" }
    } else if action != "snapshot" { report["status"] = "blocked"; report["reason"] = "Unknown action" }
} else { report["reason"] = "Exactly one owned native AX/CG window required" }
report["errors"] = errors
let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
