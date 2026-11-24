// Own helper metadata only; never asks for or changes privacy permissions.
import ApplicationServices
import CoreGraphics
import Foundation
let value:[String:Any] = ["accessibility":AXIsProcessTrusted(),
 "eventPosting":CGPreflightPostEventAccess(),"screenCapture":CGPreflightScreenCaptureAccess()]
let data=try JSONSerialization.data(withJSONObject:value,options:[.sortedKeys])
print(String(data:data,encoding:.utf8)!)
