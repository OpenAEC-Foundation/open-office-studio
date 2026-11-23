// Standalone QA: native AX observations and bounded input only. No app/model setters.
import AppKit
import ApplicationServices
import Foundation
import Darwin

let arguments = CommandLine.arguments
var report: [String: Any] = ["trusted": AXIsProcessTrusted(),
    "screenCaptureAuthorized": CGPreflightScreenCaptureAccess(),
    "eventPostingAuthorized": CGPreflightPostEventAccess(), "status": "blocked"]
func finish(_ code: Int32 = 0) -> Never {
    let data = try! JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!); exit(code)
}
if arguments.count == 2 && arguments[1] == "capabilities" {
    report["status"] = "observed"; report["applicationLaunched"] = false
    report["guiSession"] = CGSessionCopyCurrentDictionary() as? [String: Any] ?? [:]
    finish()
}
guard arguments.count >= 3, let pid = Int32(arguments[1]), pid > 0,
      let running = NSRunningApplication(processIdentifier: pid) else {
    report["reason"] = "Actual owned PID required"; finish(2)
}
let action = arguments[2]
report["pid"] = pid; report["action"] = action
report["bundleIdentifier"] = running.bundleIdentifier.map { $0 as Any } ?? NSNull()
report["executableURL"] = running.executableURL.map { $0.path as Any } ?? NSNull()
report["bundleURL"] = running.bundleURL.map { $0.path as Any } ?? NSNull()
report["frontmost"] = NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
let display=CGDisplayBounds(CGMainDisplayID())
report["mainDisplay"]=["X":display.minX,"Y":display.minY,"Width":display.width,"Height":display.height]
let app = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app, 0.3)
let deadline = Date().addingTimeInterval(10)
func attr(_ e: AXUIElement, _ name: String) -> CFTypeRef? {
    guard Date() < deadline else { return nil }
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(e, name as CFString, &value) == .success ? value : nil
}
func string(_ e: AXUIElement, _ name: String) -> String { attr(e,name) as? String ?? "" }
func frame(_ e: AXUIElement) -> CGRect? {
    guard let p=attr(e,kAXPositionAttribute), let s=attr(e,kAXSizeAttribute),
          CFGetTypeID(p)==AXValueGetTypeID(), CFGetTypeID(s)==AXValueGetTypeID() else {return nil}
    var point=CGPoint.zero;var size=CGSize.zero
    guard AXValueGetValue(p as! AXValue,.cgPoint,&point),AXValueGetValue(s as! AXValue,.cgSize,&size),
          point.x.isFinite,point.y.isFinite,size.width.isFinite,size.height.isFinite,
          size.width > 1,size.height > 1 else {return nil}
    return CGRect(origin:point,size:size)
}
func nativeMouseClick(_ point: CGPoint) -> Bool {
    // Same HID transport as the validated native358 policy. postToPid does not
    // move the physical cursor and opened the Apple menu in Suite45148679849.
    let all=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
    let owned=all.filter {($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value==pid && ($0[kCGWindowLayer as String] as? NSNumber)?.intValue==0}
    let containing=owned.filter {w in
        guard let b=w[kCGWindowBounds as String] as? [String:Double],let x=b["X"],let y=b["Y"],let width=b["Width"],let height=b["Height"] else {return false}
        return point.x>x && point.x<x+width && point.y>y && point.y<y+height
    }
    guard point.x.isFinite,point.y.isFinite,!containing.isEmpty,display.contains(point),running.isActive,
          NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else {
        report["reason"]="HID mouse requires an owned on-screen window and frontmost actual PID";return false
    }
    report["pointerOwnedWindowId"]=containing[0][kCGWindowNumber as String] ?? NSNull()
    if let before=CGEvent(source:nil)?.location {report["pointerBefore"]=["x":before.x,"y":before.y]}
    CGEvent(mouseEventSource:nil,mouseType:.mouseMoved,mouseCursorPosition:point,mouseButton:.left)?.post(tap:.cghidEventTap)
    Thread.sleep(forTimeInterval:0.1)
    guard let moved=CGEvent(source:nil)?.location,abs(moved.x-point.x)<=1,abs(moved.y-point.y)<=1,
          running.isActive,NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else {
        report["reason"]="Physical cursor did not reach verified target; no button input sent";return false
    }
    report["pointerAfterMove"]=["x":moved.x,"y":moved.y]
    CGEvent(mouseEventSource:nil,mouseType:.leftMouseDown,mouseCursorPosition:point,mouseButton:.left)?.post(tap:.cghidEventTap)
    Thread.sleep(forTimeInterval:0.05)
    CGEvent(mouseEventSource:nil,mouseType:.leftMouseUp,mouseCursorPosition:point,mouseButton:.left)?.post(tap:.cghidEventTap)
    Thread.sleep(forTimeInterval:0.1)
    report["pointerTransport"]="native HID mouseMoved, physical cursor verification, down/up"
    return true
}
func record(_ e: AXUIElement) -> [String: Any] {
    var result: [String: Any]=[:]
    let secure=string(e,kAXSubroleAttribute)=="AXSecureTextField"
    for key in [kAXRoleAttribute,kAXSubroleAttribute,kAXTitleAttribute,kAXDescriptionAttribute,
                kAXHelpAttribute,kAXIdentifierAttribute,kAXEnabledAttribute,kAXFocusedAttribute,kAXValueAttribute,
                kAXRoleDescriptionAttribute,kAXModalAttribute,kAXSelectedAttribute] {
        if secure && key==kAXValueAttribute {result[key]="[secure value omitted]";continue}
        if let text=attr(e,key) as? String {result[key]=String(text.prefix(4096))}
        else if let number=attr(e,key) as? NSNumber {result[key]=number}
    }
    if let f=frame(e) {result["frame"]=["x":f.minX,"y":f.minY,"width":f.width,"height":f.height]}
    var actions: CFArray?;let error=AXUIElementCopyActionNames(e,&actions)
    result["actions"]=actions as? [String] ?? [];result["actionsError"]=error.rawValue
    return result
}
guard AXIsProcessTrusted() else {report["reason"]="Accessibility unavailable; privacy settings unchanged";finish(3)}
let screenWindows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String: Any]] ?? []
report["ownedScreenWindows"]=screenWindows.filter {($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value==pid}
guard let windows=attr(app,kAXWindowsAttribute) as? [AXUIElement], !windows.isEmpty else {
    report["reason"]="Owned native windows unavailable";finish(3)
}
var queue=windows.map {($0,0,-1)};var index=0;var nodes:[[String: Any]]=[]
while index<queue.count && index<2200 && Date()<deadline {
    let (e,depth,parent)=queue[index]
    nodes.append(["index":index,"parent":parent,"depth":depth,"attributes":record(e)])
    if depth<30, let children=attr(e,kAXChildrenAttribute) as? [AXUIElement] {
        if children.count>160 {report["childrenTruncated"]=true}
        queue.append(contentsOf:children.prefix(160).map {($0,depth+1,index)})
    }
    index+=1
}
report["rawNodes"]=nodes;report["bounded"]=index>=2200 || Date()>=deadline
if let focused=attr(app,kAXFocusedUIElementAttribute),CFGetTypeID(focused)==AXUIElementGetTypeID() {
    report["focused"]=record(focused as! AXUIElement)
}
if action=="snapshot" {report["status"]="observed";finish()}
guard report["bounded"] as? Bool == false, report["childrenTruncated"] as? Bool != true else {
    report["reason"]="Native tree was truncated; uniqueness cannot be established";finish(3)
}
guard CGPreflightPostEventAccess() else {report["reason"]="Native event posting unavailable";finish(3)}
guard running.activate(options: []) else {report["reason"]="Owned application activation failed";finish(3)}
Thread.sleep(forTimeInterval:0.2)
guard NSWorkspace.shared.frontmostApplication?.processIdentifier==pid else {
    report["reason"]="Target did not become frontmost";finish(3)
}
if action=="activate" {
    report["status"]="input-sent";finish()
} else if action=="click-point" {
    let fresh=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
    let owned=fresh.filter {($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value==pid && ($0[kCGWindowLayer as String] as? NSNumber)?.intValue==0}
    guard running.bundleIdentifier=="org.openaec.writer-studio",owned.count==1,arguments.count==4,
          let raw=arguments[3].data(using:.utf8),let spec=try? JSONSerialization.jsonObject(with:raw) as? [String:Any],
          spec["source"] as? String=="native-original-ocr",let word=spec["word"] as? String,["velvet","marigold","TITLE","MARIGOLD"].contains(word),
          let confidence=spec["confidence"] as? Double,confidence>=0.8,
          let hash=spec["imageSHA256"] as? String,hash.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil,
          let id=spec["windowId"] as? NSNumber,let actualId=owned[0][kCGWindowNumber as String] as? NSNumber,id==actualId,
          let expected=spec["bounds"] as? [String:Double],let actual=owned[0][kCGWindowBounds as String] as? [String:Double],
          ["X","Y","Width","Height"].allSatisfy({k in
              guard let a=actual[k],let b=expected[k] else {return false}
              return a.isFinite && b.isFinite && abs(a-b)<0.5
          }),let x=spec["x"] as? Double,let y=spec["y"] as? Double,x.isFinite,y.isFinite,
          let left=actual["X"],let top=actual["Y"],let width=actual["Width"],let height=actual["Height"],
          width>=800,height>=600,left>=display.minX,top>=display.minY,left+width<=display.maxX,top+height<=display.maxY,
          x>left,x<left+width,y>top+235,y<top+height-35 else {
        report["reason"]="Original OCR word/window/frontmost geometry no longer valid";finish(3)
    }
    guard nativeMouseClick(CGPoint(x:x,y:y)) else {finish(3)}
    report["clickedOriginalWord"]=spec
} else if action=="press" || action=="click" {
    guard arguments.count==4,let data=arguments[3].data(using:.utf8),
          let spec=try? JSONSerialization.jsonObject(with:data) as? [String: Any],
          let role=spec["role"] as? String,let field=spec["field"] as? String,let value=spec["value"] as? String,
          !value.isEmpty,[kAXTitleAttribute,kAXDescriptionAttribute,kAXIdentifierAttribute,kAXValueAttribute].contains(field),
          ["AXButton","AXRadioButton","AXCheckBox","AXPopUpButton","AXTextField","AXTextArea","AXComboBox","AXStaticText","AXRow","AXCell"].contains(role) else {
        report["reason"]="Exact semantic native control selector required";finish(2)
    }
    let matches=queue.prefix(index).filter {
        guard string($0.0,kAXRoleAttribute)==role && string($0.0,field)==value,
              let actual=frame($0.0),let expected=spec["frame"] as? [String:Double],
              let x=expected["x"],let y=expected["y"],let w=expected["width"],let h=expected["height"] else {return false}
        return abs(actual.minX-x)<2 && abs(actual.minY-y)<2 && abs(actual.width-w)<2 && abs(actual.height-h)<2
    }
    guard matches.count==1,let target=matches.first?.0,let f=frame(target),
          windows.contains(where:{frame($0)?.contains(f)==true}),
          (attr(target,kAXEnabledAttribute) as? Bool) != false else {
        report["reason"]="Native role/name/frame does not identify one owned enabled control";finish(3)
    }
    report["target"]=record(target)
    if action=="press" {
        var names:CFArray?
        guard AXUIElementCopyActionNames(target,&names) == .success,
              (names as? [String] ?? []).contains(kAXPressAction),
              AXUIElementPerformAction(target,kAXPressAction as CFString) == .success else {
            report["reason"]="Actual control has no successful AXPress";finish(3)
        }
    } else {
        guard nativeMouseClick(CGPoint(x:f.midX,y:f.midY)) else {finish(3)}
    }
} else if action=="key" {
    let keys:[String:(CGKeyCode,CGEventFlags)]=[
        "cmd-o":(31,.maskCommand),"cmd-s":(1,.maskCommand),"cmd-shift-s":(1,[.maskCommand,.maskShift]),
        "cmd-q":(12,.maskCommand),"cmd-a":(0,.maskCommand),"cmd-z":(6,.maskCommand),
        "cmd-end":(125,.maskCommand),"cmd-shift-g":(5,[.maskCommand,.maskShift]),
        "return":(36,[]),"tab":(48,[]),"escape":(53,[]),"right":(124,[]),"down":(125,[]),"end":(119,[])]
    guard arguments.count==4,let (code,flags)=keys[arguments[3]] else {report["reason"]="Unsupported native key";finish(2)}
    for down in [true,false] {
        let event=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:down);event?.flags=flags;event?.postToPid(pid)
    }
} else if action=="type" {
    guard arguments.count==4,arguments[3].utf16.count<=8192,
          let focused=attr(app,kAXFocusedUIElementAttribute),CFGetTypeID(focused)==AXUIElementGetTypeID(),
          ["AXTextField","AXTextArea","AXComboBox"].contains(string(focused as! AXUIElement,kAXRoleAttribute)) else {
        report["reason"]="Typing requires actual owned focused text control";finish(3)
    }
    // Same one-character event granularity as the native control preflight.
    for character in arguments[3] {
        let chunk=Array(String(character).utf16)
        for down in [true,false] {
            let event=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down)
            event?.flags=[]
            event?.keyboardSetUnicodeString(stringLength:chunk.count,unicodeString:chunk);event?.postToPid(pid)
        }
        Thread.sleep(forTimeInterval:0.01)
    }
} else {report["reason"]="Unknown native action";finish(2)}
report["status"]="input-sent";finish()
