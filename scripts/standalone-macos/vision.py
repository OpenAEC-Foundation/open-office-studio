"""Bind a visible word to untouched owned-window pixels; AX mirrors are not paint proof."""
import math
from native import Unavailable


def visible_word(ocr,snapshot,pid,image_sha,text):
    if (ocr.get("imageSha256")!=image_sha or ocr.get("imageModified") is not False
            or snapshot.get("pid")!=pid or snapshot.get("frontmost") is not True
            or snapshot.get("screenCaptureAuthorized") is not True):
        raise Unavailable("Exact original capture and frontmost owned PID required")
    windows=[w for w in snapshot.get("ownedScreenWindows",[]) if w.get("kCGWindowOwnerPID")==pid and w.get("kCGWindowLayer")==0]
    if len(windows)!=1:raise Unavailable("Exactly one original owned body window required")
    window=windows[0];bounds=window.get("kCGWindowBounds",{});display=snapshot.get("mainDisplay",{})
    if not all(type(b.get(k)) in (int,float) and math.isfinite(b[k]) for b in (bounds,display) for k in ("X","Y","Width","Height")):
        raise Unavailable("Finite native window/display geometry required")
    if (bounds["Width"]<800 or bounds["Height"]<600 or bounds["X"]<display["X"] or bounds["Y"]<display["Y"]
            or bounds["X"]+bounds["Width"]>display["X"]+display["Width"] or bounds["Y"]+bounds["Height"]>display["Y"]+display["Height"]):
        raise Unavailable("Owned body window must be fully on-screen at supported size")
    sx,sy=ocr["width"]/bounds["Width"],ocr["height"]/bounds["Height"]
    if not 1<=sx<=3 or abs(sx-sy)>.001:raise Unavailable("Original no-shadow PNG scale does not match native window")
    matches=[w for w in ocr.get("wordObservations",[]) if w.get("text")==text and w.get("confidence",0)>=.8]
    if len(matches)!=1:raise Unavailable("Unique readable original body word unavailable: "+text)
    box=matches[0]["normalizedBottomLeft"]
    if not all(type(box.get(k)) in (int,float) and math.isfinite(box[k]) for k in ("x","y","width","height")):
        raise Unavailable("Finite OCR bounds required")
    if min(box["x"],box["y"])<0 or min(box["width"],box["height"])<=0 or box["x"]+box["width"]>1 or box["y"]+box["height"]>1:
        raise Unavailable("Visible word must be wholly inside original image")
    point={"x":bounds["X"]+(box["x"]+box["width"]/2)*bounds["Width"],
           "y":bounds["Y"]+(1-box["y"]-box["height"]/2)*bounds["Height"]}
    if not bounds["Y"]+235<point["y"]<bounds["Y"]+bounds["Height"]-35:
        raise Unavailable("OCR target is outside document body or overlaps ribbon/status")
    return {**point,"windowId":window["kCGWindowNumber"],"bounds":bounds,"imageSHA256":image_sha,
            "word":text,"confidence":matches[0]["confidence"],"source":"native-original-ocr"}
