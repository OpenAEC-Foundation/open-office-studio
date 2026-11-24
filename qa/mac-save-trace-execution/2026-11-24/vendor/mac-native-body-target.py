"""Validate one visible OCR body target; no input or app lifecycle operations."""
import math


def visible_body_target(ocr, snapshot, pid, expected_image_sha, text="alpha"):
    if (ocr.get("imageSha256") != expected_image_sha or ocr.get("imageModified") is not False
            or snapshot.get("applicationActive") is not True or snapshot.get("frontmostPid") != pid
            or snapshot.get("screenCaptureAuthorized") is not True):
        raise PermissionError("Exact unchanged original capture and frontmost owned app required")
    windows = [w for w in snapshot.get("ownedScreenWindows", []) if w.get("pid") == pid]
    if len(windows) != 1:
        raise PermissionError("Exactly one owned on-screen window required")
    bounds = windows[0]["bounds"]
    display = snapshot["mainDisplay"]["bounds"]
    if not all(type(bounds.get(k)) in (int, float) and math.isfinite(bounds[k]) for k in ("X", "Y", "Width", "Height")):
        raise PermissionError("Finite window geometry required")
    if (bounds["Width"] < 800 or bounds["Height"] < 600 or bounds["X"] < display["X"]
            or bounds["Y"] < display["Y"] or bounds["X"]+bounds["Width"] > display["X"]+display["Width"]
            or bounds["Y"]+bounds["Height"] > display["Y"]+display["Height"]):
        raise PermissionError("Owned window must be fully on-screen at supported dimensions")
    sx, sy = ocr["width"]/bounds["Width"], ocr["height"]/bounds["Height"]
    if not 1 <= sx <= 3 or abs(sx-sy) > .001:
        raise PermissionError("No-shadow capture must match the owned window at one uniform pixel scale")
    candidates = ocr.get("wordObservations", ocr.get("observations", [])) if len(text.split()) == 1 else ocr.get("observations", [])
    matches = [o for o in candidates if o.get("text") == text and o.get("confidence", 0) >= .8]
    if len(matches) != 1:
        raise PermissionError("Expected one confidently visible original body word: "+text)
    match = matches[0]
    rect = match["normalizedBottomLeft"]
    if not all(type(rect.get(k)) in (int, float) and math.isfinite(rect[k]) for k in ("x", "y", "width", "height")):
        raise PermissionError("Finite OCR rectangle required")
    if (rect["width"] <= 0 or rect["height"] <= 0 or rect["x"] < 0 or rect["y"] < 0
            or rect["x"]+rect["width"] > 1 or rect["y"]+rect["height"] > 1):
        raise PermissionError("OCR word must lie entirely in the original image")
    point = {"x": bounds["X"] + (rect["x"]+rect["width"]/2)*bounds["Width"],
             "y": bounds["Y"] + (1-rect["y"]-rect["height"]/2)*bounds["Height"]}
    if not bounds["Y"]+235 < point["y"] < bounds["Y"]+bounds["Height"]-35:
        raise PermissionError("OCR word must lie in the visible document body, away from ribbon/status controls")
    return {"text": text, "confidence": match["confidence"], "point": point,
            "pixelScale": sx, "originalImageSha256": expected_image_sha,
            "nativeWindow": windows[0], "source": "Vision OCR on untouched no-shadow native capture"}
