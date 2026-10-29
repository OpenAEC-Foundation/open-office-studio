"""Render the English Open Office Studio promo from real screen recordings.

Inputs:  promo/scenes.json, promo/output/capture/<take>/ (from capture.mjs),
         promo/output/capture/stills/ and the repository's brand assets.
Outputs: promo/output/open-office-studio-promo-en.mp4  (16:9, 1920x1080)
         promo/output/open-office-studio-short-en.mp4  (9:16, 1080x1920)
         promo/output/open-office-studio-en.srt, promo/output/storyboard.jpg

Dependencies: Pillow, numpy, imageio-ffmpeg, edge-tts (see requirements.txt).
Usage: python promo/render.py [--stills-only] [--skip-voice] [--only main|short]

Only the public narration text in scenes.json is sent to Edge TTS; each
sentence is cached by a hash of voice, rate and text. The music is
synthesised here; no samples or stock music are used.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import re
import subprocess
import wave
from functools import lru_cache
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROMO = ROOT / "promo"
OUT = PROMO / "output"
CAPTURE = OUT / "capture"
STILLS = CAPTURE / "stills"
VOICE_DIR = OUT / "voice"
CFG = json.loads((PROMO / "scenes.json").read_text())
SCENES = CFG["scenes"]
FPS = CFG.get("fps", 24)
SR = 48000
W, H = 1920, 1080
SW, SH = 1080, 1920  # short (9:16)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# OpenAEC style book (src/stijl/colors.json)
NIGHT = (42, 42, 50)
FORGE = (54, 54, 62)
AMBER = (217, 119, 6)
GOLD = (245, 158, 11)
WHITE = (250, 250, 249)
CONCRETE = (245, 245, 244)
SCAFFOLD = (161, 161, 170)
GRIDLINE = (49, 49, 57)
MUTED = (190, 190, 198)

FONT_FILES = {
    "display": ROOT / "node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff",
    "display-m": ROOT / "node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff",
    "ui": ROOT / "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
    "ui-m": ROOT / "node_modules/@fontsource/inter/files/inter-latin-500-normal.woff",
    "ui-sb": ROOT / "node_modules/@fontsource/inter/files/inter-latin-600-normal.woff",
    "ui-b": ROOT / "node_modules/@fontsource/inter/files/inter-latin-700-normal.woff",
}
FALLBACK = Path("/usr/share/fonts/truetype/dejavu")


@lru_cache(maxsize=None)
def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    path = FONT_FILES[kind]
    if path.exists():
        return ImageFont.truetype(str(path), size)
    bold = kind in ("display", "ui-b", "ui-sb")
    return ImageFont.truetype(str(FALLBACK / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")), size)


def ease(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def ease_out(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def back_out(x: float) -> float:
    x = max(0.0, min(1.0, x))
    c = 1.4
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(len(a)))


def spaced(text: str) -> str:
    return " ".join(text)  # letter-spaced caps for eyebrows


# --------------------------------------------------------------- assets

def load_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


APP_ICON = load_rgba(ROOT / "src-tauri/icons/icon.png")
SYMBOL = load_rgba(STILLS / "openaec-symbol.png") if (STILLS / "openaec-symbol.png").exists() else None


@lru_cache(maxsize=64)
def icon(size: int) -> Image.Image:
    return APP_ICON.resize((size, size), Image.Resampling.LANCZOS)


@lru_cache(maxsize=16)
def symbol(height: int) -> Image.Image | None:
    if SYMBOL is None:
        return None
    bbox = SYMBOL.getbbox()
    s = SYMBOL.crop(bbox)
    return s.resize((round(s.width * height / s.height), height), Image.Resampling.LANCZOS)


def plate(w: int, h: int) -> Image.Image:
    im = Image.new("RGB", (w, h), NIGHT)
    d = ImageDraw.Draw(im)
    for x in range(0, w, 64):
        d.line((x, 0, x, h), fill=GRIDLINE)
    for y in range(0, h, 64):
        d.line((0, y, w, y), fill=GRIDLINE)
    # soft vignette towards the corners
    v = Image.new("L", (w // 8, h // 8), 0)
    vd = ImageDraw.Draw(v)
    vd.ellipse((-w // 16, -h // 16, w // 8 + w // 16, h // 8 + h // 16), fill=255)
    v = v.filter(ImageFilter.GaussianBlur(18)).resize((w, h))
    dark = Image.new("RGB", (w, h), (30, 30, 37))
    return Image.composite(im, dark, v)


PLATE = plate(W, H)
SPLATE = plate(SW, SH)


def rounded_mask(w: int, h: int, r: int) -> Image.Image:
    big = Image.new("L", (w * 2, h * 2), 0)
    ImageDraw.Draw(big).rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), r * 2, fill=255)
    return big.resize((w, h), Image.Resampling.LANCZOS)


@lru_cache(maxsize=32)
def shadow(w: int, h: int, r: int, blur: int = 26, alpha: int = 150) -> Image.Image:
    pad = blur * 3
    im = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((pad, pad + blur // 2, pad + w, pad + h + blur // 2), r, fill=(0, 0, 0, alpha))
    return im.filter(ImageFilter.GaussianBlur(blur))


def paste_shadow(canvas: Image.Image, x: int, y: int, w: int, h: int, r: int = 14):
    s = shadow(w, h, r)
    pad = (s.width - w) // 2
    canvas.paste(s, (x - pad, y - pad), s)


def text(d: ImageDraw.ImageDraw, xy, value, kind="ui", size=28, fill=WHITE, anchor="la"):
    d.text(xy, value, font=font(kind, size), fill=fill, anchor=anchor)


def wrap(d: ImageDraw.ImageDraw, value: str, f: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines, line = [], ""
    for word in value.split():
        cand = (line + " " + word).strip()
        if d.textlength(cand, font=f) > width and line:
            lines.append(line)
            line = word
        else:
            line = cand
    if line:
        lines.append(line)
    return lines


# --------------------------------------------------------------- takes

class Take:
    def __init__(self, name: str):
        self.name = name
        self.dir = CAPTURE / name
        meta = json.loads((self.dir / "cursor.json").read_text())
        self.frames = meta["frames"]
        self.marks = meta.get("marks", {})
        self.fps = meta["fps"]
        self.scale = meta["scale"]
        self.presses = [i for i, f in enumerate(self.frames) if f["d"] >= 0.99]
        self.popup_start = next((i for i, f in enumerate(self.frames) if f.get("p")), None)

    def frame_index(self, at) -> int:
        if isinstance(at, (int, float)):
            return int(at)
        mark, seconds = at
        return int(self.marks[mark] + seconds * self.fps)

    @lru_cache(maxsize=6)
    def image(self, i: int) -> Image.Image:
        return Image.open(self.dir / f"f{i:05d}.jpg").convert("RGB")

    @lru_cache(maxsize=4)
    def popup(self, i: int) -> Image.Image:
        return Image.open(self.dir / f"p{i:05d}.jpg").convert("RGB")


TAKES: dict[str, Take] = {}


def take(name: str) -> Take:
    if name not in TAKES:
        TAKES[name] = Take(name)
    return TAKES[name]


# Cursor sprite (classic arrow), rendered at 4x for smooth edges.
def cursor_sprite(size: int) -> Image.Image:
    k = 4
    pts = [(0, 0), (0, 17), (4.2, 13.2), (7.2, 20), (10, 18.8), (7.1, 12.2), (12.6, 12.2)]
    s = size / 20
    big = Image.new("RGBA", (int(16 * s * k) + 8, int(22 * s * k) + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    poly = [(4 + x * s * k, 4 + y * s * k) for x, y in pts]
    d.polygon(poly, fill=(20, 20, 24, 255))
    inner = [(4 + x * s * k, 4 + y * s * k) for x, y in [(1.3, 2.9), (1.3, 14.2), (4.5, 11.2), (7.6, 18.2), (8.7, 17.7), (5.6, 10.8), (9.8, 10.8)]]
    d.polygon(inner, fill=(255, 255, 255, 255))
    return big.resize((big.width // k, big.height // k), Image.Resampling.LANCZOS)


@lru_cache(maxsize=8)
def cursor_img(size: int) -> Image.Image:
    sprite = cursor_sprite(size)
    sh = Image.new("RGBA", (sprite.width + 12, sprite.height + 12), (0, 0, 0, 0))
    alpha = sprite.split()[3].point(lambda a: a * 0.35)
    sh.paste((0, 0, 0, 255), (5, 7), alpha)
    sh = sh.filter(ImageFilter.GaussianBlur(2.2))
    sh.alpha_composite(sprite, (2, 2))
    return sh


class Camera:
    """Keyframed camera in CSS pixels of the recording (centre x/y and zoom)."""

    def __init__(self, keys: list[dict], tk: Take, start: int):
        self.keys = sorted(((tk.frame_index(k["at"]) - start, k["x"], k["y"], k["zoom"]) for k in keys), key=lambda k: k[0])

    def at(self, i: float):
        ks = self.keys
        if i <= ks[0][0]:
            return ks[0][1:]
        for a, b in zip(ks, ks[1:]):
            if a[0] <= i <= b[0]:
                move = min(b[0] - a[0], FPS * 1.0)
                t = ease((i - (b[0] - move)) / move) if move > 0 else 1
                return tuple(a[j] + (b[j] - a[j]) * t for j in (1, 2, 3))
        return ks[-1][1:]


def scene_sequence(scene: dict):
    clip = scene["clips"][0]
    tk = take(clip["take"])
    start = tk.frame_index(clip["from"]) if "from" in clip else 0
    end = tk.frame_index(clip["to"]) if "to" in clip else len(tk.frames)
    return tk, start, end


def speed_for(scene: dict, duration: float) -> float:
    tk, start, end = scene_sequence(scene)
    length = (end - start) / tk.fps
    usable = duration - 0.25
    return max(0.85, min(1.75, length / usable))


def app_view(scene: dict, t: float, duration: float, pw: int, ph: int, cam_key: str = "camera") -> Image.Image:
    """The recording at scene time t, cropped by the camera to pw x ph, with cursor and popup."""
    tk, start, end = scene_sequence(scene)
    speed = speed_for(scene, duration)
    pos = min(end - 1 - start, t * tk.fps * speed)
    i = start + int(pos)
    cam = Camera(scene.get(cam_key) or scene["camera"], tk, start)
    cx, cy, z = cam.at(pos)
    zmin = max(pw / W, ph / H)
    z = max(z, zmin)
    cw, ch = pw / z, ph / z
    x0 = min(max(cx - cw / 2, 0), W - cw)
    y0 = min(max(cy - ch / 2, 0), H - ch)
    s = tk.scale
    src = tk.image(i)
    view = src.resize((pw, ph), Image.Resampling.BICUBIC, box=(x0 * s, y0 * s, (x0 + cw) * s, (y0 + ch) * s)).convert("RGBA")
    f = tk.frames[i]
    # Popup window (a tab moved into its own window), composited as a floating window.
    if f.get("p") and tk.popup_start is not None:
        age = (i - tk.popup_start) / tk.fps / speed
        a = ease_out(age / 0.45)
        pop = tk.popup(i)
        pwid = int(pw * 0.6)
        phei = int(pwid * pop.height / pop.width)
        bar = 30
        sc = 0.92 + 0.08 * a
        ww, hh = int(pwid * sc), int((phei + bar) * sc)
        win = Image.new("RGBA", (pwid, phei + bar), FORGE + (255,))
        wd = ImageDraw.Draw(win)
        text(wd, (14, bar // 2), "Naamloos 1.xlsx · Open Office Studio", "ui-m", 15, (230, 230, 232), "lm")
        for k, sym in enumerate(("×", "□", "–")):
            text(wd, (pwid - 22 - k * 30, bar // 2), sym, "ui-m", 16, (210, 210, 214), "mm")
        win.paste(pop.resize((pwid, phei), Image.Resampling.LANCZOS), (0, bar))
        win = win.resize((ww, hh), Image.Resampling.BICUBIC)
        win.putalpha(Image.eval(rounded_mask(ww, hh, 10), lambda v: int(v * a)))
        px = pw - ww - int(pw * 0.05)
        py = ph - hh - int(ph * 0.06) + int((1 - a) * 40)
        sh = shadow(ww, hh, 10, 22, int(170 * a))
        pad = (sh.width - ww) // 2
        view.alpha_composite(sh, (px - pad, py - pad))
        view.alpha_composite(win, (px, py))
    # Cursor and click ripple.
    cxp = (f["x"] - x0) * z
    cyp = (f["y"] - y0) * z
    last = max((p for p in tk.presses if p <= i), default=None)
    if last is not None:
        age = (i - last) / tk.fps / speed
        if age < 0.45:
            r = 8 + 30 * ease_out(age / 0.45)
            al = int(170 * (1 - age / 0.45))
            rip = Image.new("RGBA", view.size, (0, 0, 0, 0))
            ImageDraw.Draw(rip).ellipse((cxp - r, cyp - r, cxp + r, cyp + r), outline=AMBER + (al,), width=4, fill=AMBER + (al // 4,))
            view.alpha_composite(rip)
    if -40 < cxp < pw + 40 and -40 < cyp < ph + 40:
        cur = cursor_img(int(24 * min(max(z, 1.0), 1.5)))
        view.alpha_composite(cur, (int(cxp) - 2, int(cyp) - 2))
    return view


# --------------------------------------------------------------- narration

def sentences(value: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", value.strip()) if s]


def voice_path(sentence: str) -> Path:
    key = hashlib.sha1(f"{CFG['voice']}|{CFG['rate']}|{sentence}".encode()).hexdigest()[:14]
    return VOICE_DIR / f"{key}.mp3"


async def narrate(lines: list[str]):
    import edge_tts

    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    for line in lines:
        for s in sentences(line):
            p = voice_path(s)
            if p.exists() and p.stat().st_size > 1000:
                continue
            print("  voice:", s, flush=True)
            await asyncio.wait_for(edge_tts.Communicate(s, CFG["voice"], rate=CFG["rate"]).save(str(p)), timeout=60)


@lru_cache(maxsize=None)
def decode(path: Path) -> np.ndarray:
    raw = subprocess.check_output([FFMPEG, "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"])
    a = np.frombuffer(raw, np.float32).copy()
    env = np.convolve(np.abs(a), np.ones(480) / 480, "same")
    act = np.where(env > 0.008)[0]
    if len(act):
        a = a[max(0, act[0] - 1200): min(len(a), act[-1] + 2400)]
    fade = min(len(a), 480)
    a[:fade] *= np.linspace(0, 1, fade)
    a[-fade:] *= np.linspace(1, 0, fade)
    return a


def place_voice(text_value: str, start: float, limit: float, label: str):
    """Returns [(sample_start, audio)], [(caption_start, caption_end, sentence)]."""
    parts, caps, t = [], [], start
    for s in sentences(text_value):
        a = decode(voice_path(s))
        dur = len(a) / SR
        parts.append((t, a))
        caps.append((t, t + dur, s))
        t += dur + 0.28
    end = caps[-1][1] if caps else start
    if end > limit:
        raise ValueError(f"{label}: narration ends at {end:.2f}s, after the slot end {limit:.2f}s; lengthen the scene or shorten the text.")
    return parts, caps


# --------------------------------------------------------------- music

def note_hz(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


def one_pole(x: np.ndarray, cutoff: float) -> np.ndarray:
    a = math.exp(-2 * math.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    # chunked IIR via scipy-free loop on a decimated signal for speed
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def soft_saw(hz: float, t: np.ndarray, harmonics: int = 6) -> np.ndarray:
    out = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        out += np.sin(2 * np.pi * hz * k * t + 0.3 * k) / (k ** 1.35)
    return out


def music(total: float, intro: bool = True, outro_at: float | None = None, seed: int = 7) -> np.ndarray:
    """Original programmatic score: warm pad, plucked arpeggio, soft pulse and an intro build."""
    rng = np.random.default_rng(seed)
    n = int(total * SR)
    t = np.arange(n) / SR
    out = np.zeros(n, np.float32)
    beat = 60 / 96
    bar = beat * 4
    prog = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]]  # D, Bm, G, A
    start_full = 5.6 if intro else 0.0
    bars = int(math.ceil(total / bar)) + 1
    for b in range(bars):
        b0 = b * bar
        if b0 >= total:
            break
        chord = prog[b % 4]
        i0, i1 = int(b0 * SR), min(n, int((b0 + bar + 0.6) * SR))
        lt = t[i0:i1] - b0
        env = np.minimum(lt / 0.9, 1) * np.clip((bar + 0.6 - lt) / 0.9, 0, 1)
        pad = np.zeros_like(lt)
        for note in chord[1:]:
            for det in (-0.06, 0.06):
                pad += soft_saw(note_hz(note + det), lt, 5)
        pad += 0.8 * np.sin(2 * np.pi * note_hz(chord[0] - 12) * lt)
        lvl = 0.010
        if intro and b0 < start_full:
            lvl *= 0.35 + 0.65 * (b0 / start_full)
        out[i0:i1] += (lvl * pad * env).astype(np.float32)
        # arpeggio of plucks (eighth notes) once the full arrangement runs
        for k in range(8):
            s0 = b0 + k * beat / 2
            if s0 < start_full - 0.01 or s0 >= total:
                continue
            note = chord[[1, 2, 3, 2, 1, 2, 3, 2][k]] + 12
            j0, j1 = int(s0 * SR), min(n, int((s0 + 0.9) * SR))
            pt = t[j0:j1] - s0
            pl = (np.sin(2 * np.pi * note_hz(note) * pt) + 0.3 * np.sin(4 * np.pi * note_hz(note) * pt)) * np.exp(-5.5 * pt) * np.minimum(pt / 0.004, 1)
            out[j0:j1] += (0.020 * pl).astype(np.float32)
        # soft kick on beats 1 and 3, light shaker on off-beats
        for k in range(4):
            s0 = b0 + k * beat
            if s0 < start_full or s0 >= total:
                continue
            if k in (0, 2):
                j0, j1 = int(s0 * SR), min(n, int((s0 + 0.35) * SR))
                kt = t[j0:j1] - s0
                f = 50 + 70 * np.exp(-25 * kt)
                kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-9 * kt)
                out[j0:j1] += (0.07 * kick).astype(np.float32)
            j0 = int((s0 + beat / 2) * SR)
            j1 = min(n, j0 + int(0.06 * SR))
            if j0 < n:
                nz = rng.standard_normal(j1 - j0) * np.exp(-60 * (t[j0:j1] - t[j0]))
                out[j0:j1] += (0.006 * np.diff(np.concatenate([[0], nz]))).astype(np.float32)
    if intro:
        # riser: filtered noise and a rising tone towards the title hit at 1.75 s, then a low impact
        r1 = int(1.75 * SR)
        rt = t[:r1]
        noise = rng.standard_normal(r1)
        noise = np.convolve(noise, np.ones(24) / 24, "same")
        out[:r1] += (0.05 * noise * (rt / 1.75) ** 2).astype(np.float32)
        sweep = np.sin(2 * np.pi * np.cumsum(220 + 440 * (rt / 1.75) ** 2) / SR)
        out[:r1] += (0.012 * sweep * (rt / 1.75) ** 3).astype(np.float32)
        h0, h1 = r1, min(n, r1 + int(2.5 * SR))
        ht = t[h0:h1] - t[h0]
        boom = np.sin(2 * np.pi * np.cumsum(38 + 50 * np.exp(-6 * ht)) / SR) * np.exp(-2.2 * ht)
        stab = sum(soft_saw(note_hz(nn), ht, 4) for nn in (62, 66, 69)) * np.exp(-2.8 * ht)
        out[h0:h1] += (0.11 * boom + 0.012 * stab).astype(np.float32)
    # gentle echo for space
    d = int(0.33 * SR)
    wet = np.zeros_like(out)
    wet[d:] = out[:-d] * 0.28
    wet[2 * d:] += out[:-2 * d] * 0.12
    out = out + wet
    fade_in = np.minimum(t / (0.4 if intro else 0.8), 1)
    end = outro_at if outro_at is not None else total - 2.5
    fade_out = np.clip((total - t) / max(0.1, total - end), 0, 1)
    out *= (fade_in * fade_out).astype(np.float32)
    return out


def mixdown(voice: np.ndarray, bed: np.ndarray) -> np.ndarray:
    # duck the music under the narration (smoothed envelope)
    env = np.convolve(np.abs(voice), np.ones(4800) / 4800, "same")
    env = np.clip(env / 0.02, 0, 1)
    k = int(0.25 * SR)
    env = np.convolve(env, np.ones(k) / k, "same")
    gain = 1.0 - 0.55 * env
    m = voice * 1.0 + bed * gain * 1.15
    peak = float(np.max(np.abs(m)))
    if peak > 0.97:
        m *= 0.97 / peak
    return m


def write_wav(path: Path, mono: np.ndarray):
    with wave.open(str(path), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        pcm = (np.clip(mono, -1, 1) * 32767).astype("<i2")
        f.writeframes(np.repeat(pcm[:, None], 2, axis=1).tobytes())


def srt_stamp(t: float) -> str:
    ms = round(t * 1000)
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


# --------------------------------------------------------------- layouts (16:9)

PANEL = (64, 148, 1792, 864)


def header(canvas: Image.Image, scene: dict, t: float, index: int, total_t: float, elapsed: float):
    d = ImageDraw.Draw(canvas)
    a = ease_out(t / 0.6)
    dy = int((1 - a) * 18)
    col = mix(NIGHT, AMBER, a)
    if scene.get("eyebrow"):
        text(d, (66, 30 + dy), spaced(scene["eyebrow"]), "ui-b", 15, col)
    title = scene["title"][0]
    text(d, (62, 54 + dy), title, "display", 54, mix(NIGHT, WHITE, a))
    # brand at the right
    ic = icon(34)
    canvas.paste(ic, (1856 - 34, 40), ic)
    text(d, (1856 - 46, 57), spaced("OPEN OFFICE STUDIO"), "ui-b", 14, MUTED, "rm")


def footer(canvas: Image.Image, index: int, elapsed: float, total_t: float):
    d = ImageDraw.Draw(canvas)
    d.line((64, 1030, 1856, 1030), fill=(70, 70, 78), width=2)
    d.line((64, 1030, 64 + int(1792 * elapsed / total_t), 1030), fill=AMBER, width=3)
    text(d, (64, 1052), spaced("FREE & OPEN SOURCE  ·  OPENAEC FOUNDATION"), "ui-sb", 12, SCAFFOLD, "lm")
    text(d, (1856, 1052), f"{index:02d} / {len(SCENES) - 1:02d}" if index else "", "ui-sb", 13, SCAFFOLD, "rm")


def caption_box(canvas: Image.Image, value: str, box: tuple[int, int, int, int], size: int = 30, inside: bool = True):
    x, y, w, h = box
    over = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    f = font("ui-sb", size)
    lines = wrap(d, value, f, min(1320, w - 120))
    lh = int(size * 1.34)
    bh = lh * len(lines) + 26
    widths = [d.textlength(l, font=f) for l in lines]
    bw = int(max(widths) + 56)
    bx = x + (w - bw) // 2
    by = y + h - bh - 26 if inside else y
    d.rounded_rectangle((bx, by, bx + bw, by + bh), 12, fill=(24, 24, 30, 214))
    for k, l in enumerate(lines):
        d.text((x + w / 2, by + 13 + k * lh + lh / 2), l, font=f, fill=WHITE + (255,), anchor="mm")
    canvas.alpha_composite(over)


def active_caption(caps, elapsed):
    return next((c[2] for c in caps if c[0] - 0.05 <= elapsed < c[1] + 0.25), None)


def window_panel(canvas: Image.Image, view: Image.Image, box):
    x, y, w, h = box
    paste_shadow(canvas, x, y, w, h, 14)
    canvas.paste(view.convert("RGB"), (x, y), rounded_mask(w, h, 14))


def render_app(scene, t, duration):
    canvas = PLATE.copy().convert("RGBA")
    x, y, w, h = PANEL
    view = app_view(scene, t, duration, w, h)
    window_panel(canvas, view, PANEL)
    return canvas


STILL_CACHE: dict[str, Image.Image] = {}


def still(name: str) -> Image.Image:
    if name not in STILL_CACHE:
        STILL_CACHE[name] = Image.open(STILLS / f"{name}.jpg").convert("RGB")
    return STILL_CACHE[name]


def mini_window(name: str, label: str, w: int) -> Image.Image:
    im = still(name)
    h = int(w * 1080 / 1920)
    bar = max(18, w // 22)
    win = Image.new("RGBA", (w, h + bar), FORGE + (255,))
    d = ImageDraw.Draw(win)
    text(d, (12, bar // 2), label, "ui-sb", max(11, bar // 2), (232, 232, 235), "lm")
    for k in range(3):
        d.ellipse((w - 18 - k * 16, bar // 2 - 4, w - 10 - k * 16, bar // 2 + 4), fill=(110, 110, 118))
    win.paste(im.resize((w, h), Image.Resampling.LANCZOS), (0, bar))
    win.putalpha(rounded_mask(w, h + bar, 10))
    return win


def render_collapse(scene, t, duration):
    canvas = PLATE.copy().convert("RGBA")
    x, y, w, h = PANEL
    items = [("writer", "Text editor"), ("sheet", "Spreadsheet"), ("database", "Database"), ("email", "Email")]
    spots = [(330, 300, -5), (1010, 250, 4), (420, 660, 3), (1120, 640, -4)]
    merge0, merge1 = 2.7, 3.9
    final = still("writer").resize((w, h), Image.Resampling.LANCZOS) if t > merge0 else None
    if t < merge1:
        for k, ((name, label), (sx, sy, rot)) in enumerate(zip(items, spots)):
            appear = ease_out((t - 0.15 - k * 0.28) / 0.5)
            if appear <= 0:
                continue
            m = ease((t - merge0 - k * 0.06) / (merge1 - merge0 - 0.2))
            bob = math.sin(t * 2.1 + k * 1.7) * 9 * (1 - m)
            ww = int((560 + 30 * math.sin(k)) * (1 - m) + w * m * 0.98)
            win = mini_window(name, label, max(120, ww))
            r = rot * (1 - m)
            if abs(r) > 0.05:
                win = win.rotate(r, resample=Image.Resampling.BICUBIC, expand=True)
            cx = sx * (1 - m) + (x + w / 2) * m
            cy = sy + bob
            cy = cy * (1 - m) + (y + h / 2) * m
            a = appear * (1 - ease((t - merge1 + 0.35) / 0.35))
            if a <= 0:
                continue
            win.putalpha(Image.eval(win.split()[3], lambda v: int(v * a)))
            sh = shadow(win.width, win.height, 12, 20, int(140 * a))
            pad = (sh.width - win.width) // 2
            px, py = int(cx - win.width / 2), int(cy - win.height / 2)
            canvas.alpha_composite(sh, (px - pad, py - pad))
            canvas.alpha_composite(win, (px, py))
    if final is not None:
        a = ease((t - merge1 + 0.5) / 0.6)
        if a > 0:
            # zoom gently towards the tab bar once the windows have merged
            z = 1 + 0.18 * ease((t - merge1 - 0.6) / 2.2)
            src = still("writer")
            sw_, sh_ = src.width / z, src.height / z
            fx, fy = 0, 0
            view = src.resize((w, h), Image.Resampling.BICUBIC, box=(fx, fy, fx + sw_, fy + sh_ * (h / w) / (1080 / 1920)))
            layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            paste_shadow(layer, x, y, w, h, 14)
            mask = Image.eval(rounded_mask(w, h, 14), lambda v: int(v * a))
            layer.paste(view, (x, y), mask)
            canvas.alpha_composite(layer)
            # highlight the tab bar
            hl = ease((t - merge1 - 0.4) / 0.5)
            if hl > 0:
                sc = w / (1920 / z)
                tb = (x + 6 * sc, y + 41 * sc, x + 700 * sc, y + 73 * sc)
                o = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
                ImageDraw.Draw(o).rounded_rectangle(tb, 8, outline=AMBER + (int(255 * hl),), width=4)
                canvas.alpha_composite(o)
    return canvas


def render_intro(scene, t, duration):
    canvas = PLATE.copy().convert("RGBA")
    d = ImageDraw.Draw(canvas)
    # amber glow behind the icon
    glow_a = ease((t - 0.4) / 1.2)
    if glow_a > 0:
        g = Image.new("RGBA", (700, 700), (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse((150, 150, 550, 550), fill=AMBER + (int(90 * glow_a),))
        g = g.filter(ImageFilter.GaussianBlur(90))
        canvas.alpha_composite(g, (430 - 350 + 120, 540 - 350))
    a = back_out((t - 0.5) / 1.1)
    size = 230
    ic = icon(size)
    ix = int(-260 + (430 - -260) * a)
    alpha = ease((t - 0.5) / 0.5)
    if alpha > 0:
        tmp = ic.copy()
        tmp.putalpha(Image.eval(ic.split()[3], lambda v: int(v * alpha)))
        canvas.alpha_composite(tmp, (ix, 540 - size // 2))
    ta = ease_out((t - 1.45) / 0.7)
    if ta > 0:
        f = font("display", 112)
        layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.text((720, 520 + int((1 - ta) * 40)), "Open Office Studio", font=f, fill=WHITE + (int(255 * ta),), anchor="ls")
        canvas.alpha_composite(layer)
        d = ImageDraw.Draw(canvas)
        lw = int(560 * ease_out((t - 1.9) / 0.7))
        if lw > 0:
            d.rectangle((724, 556, 724 + lw, 562), fill=AMBER)
    sa = ease((t - 2.4) / 0.7)
    if sa > 0:
        layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        sym = symbol(46)
        if sym is not None:
            s2 = sym.copy()
            s2.putalpha(Image.eval(sym.split()[3], lambda v: int(v * sa)))
            layer.alpha_composite(s2, (724, 590))
        ImageDraw.Draw(layer).text((724 + 56, 614), "Part of the OpenAEC Foundation", font=font("ui-m", 38), fill=MUTED + (int(255 * sa),), anchor="lm")
        canvas.alpha_composite(layer)
    return canvas


def render_ecosystem(scene, t, duration):
    canvas = PLATE.copy().convert("RGBA")
    tools = scene["tools"]
    names = tools[:5] + ["Open Office Studio"] + tools[5:]
    cols, rows = 4, 4
    gx, gy, gw, gh = 64, 176, 1792, 760
    cw = (gw - 3 * 22) // cols
    ch = (gh - 3 * 22) // rows
    for k, name in enumerate(names[: cols * rows]):
        r, c = divmod(k, cols)
        a = ease_out((t - 0.25 - k * 0.07) / 0.45)
        if a <= 0:
            continue
        x = gx + c * (cw + 22)
        y = gy + r * (ch + 22) + int((1 - a) * 24)
        mine = name == "Open Office Studio"
        layer = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        if mine:
            pulse = 0.5 + 0.5 * math.sin(max(0, t - 2.0) * 3)
            ld.rounded_rectangle((0, 0, cw - 1, ch - 1), 14, fill=AMBER + (255,))
            ic = icon(84)
            layer.alpha_composite(ic, (22, (ch - 84) // 2))
            ld.text((124, ch // 2 - 16), "Open Office Studio", font=font("display", 34), fill=(30, 30, 36, 255), anchor="lm")
            ld.text((124, ch // 2 + 24), "this app", font=font("ui-sb", 18), fill=(60, 40, 10, 255), anchor="lm")
            glow = Image.new("RGBA", (cw + 80, ch + 80), (0, 0, 0, 0))
            ImageDraw.Draw(glow).rounded_rectangle((40, 40, cw + 40, ch + 40), 16, fill=GOLD + (int(70 + 60 * pulse),))
            glow = glow.filter(ImageFilter.GaussianBlur(22))
            g2 = Image.eval(glow.split()[3], lambda v: int(v * a))
            glow.putalpha(g2)
            canvas.alpha_composite(glow, (x - 40, y - 40))
        else:
            ld.rounded_rectangle((0, 0, cw - 1, ch - 1), 14, fill=FORGE + (255,), outline=(74, 74, 82, 255), width=2)
            f = font("display-m", 30)
            label = name
            lines = wrap(ld, label, f, cw - 48)
            if len(lines) > 2:
                f = font("display-m", 24)
                lines = wrap(ld, label, f, cw - 48)
            lh = int(f.size * 1.2)
            top = ch // 2 - lh * len(lines) // 2
            for j, l in enumerate(lines):
                ld.text((26, top + j * lh + lh // 2), l, font=f, fill=(236, 236, 238, 255), anchor="lm")
        layer.putalpha(Image.eval(layer.split()[3], lambda v: int(v * a)))
        canvas.alpha_composite(layer, (x, y))
    d = ImageDraw.Draw(canvas)
    sa = ease((t - 1.6) / 0.6)
    if sa > 0:
        sym = symbol(40)
        if sym is not None:
            s2 = sym.copy()
            s2.putalpha(Image.eval(sym.split()[3], lambda v: int(v * sa)))
            canvas.alpha_composite(s2, (64, 962))
        text(d, (64 + 50, 984), "OpenAEC Foundation  ·  github.com/OpenAEC-Foundation", "ui-m", 22, mix(NIGHT, MUTED, sa), "lm")
    return canvas


def render_end(scene, t, duration):
    canvas = PLATE.copy().convert("RGBA")
    d = ImageDraw.Draw(canvas)
    a = ease_out(t / 0.8)
    ic = icon(250)
    canvas.alpha_composite(ic, (150, 300 + int((1 - a) * 30)))
    text(d, (470, 250), spaced(scene["eyebrow"]), "ui-b", 18, mix(NIGHT, AMBER, a))
    text(d, (462, 400 + int((1 - a) * 30)), scene["title"][0], "display", 112, mix(NIGHT, WHITE, a), "ls")
    ba = ease_out((t - 0.6) / 0.6)
    if ba > 0:
        bw = 420
        d.rounded_rectangle((470, 450, 470 + int(bw * ba), 530), 14, fill=AMBER)
        if ba > 0.9:
            text(d, (470 + bw // 2, 490), scene["detail"], "ui-b", 34, (28, 28, 34), "mm")
    fa = ease((t - 1.2) / 0.6)
    if fa > 0:
        text(d, (470, 600), scene["facts"], "ui-m", 34, mix(NIGHT, WHITE, fa))
        text(d, (470, 660), scene["url"], "ui-sb", 30, mix(NIGHT, GOLD, fa))
        sym = symbol(44)
        if sym is not None:
            s2 = sym.copy()
            s2.putalpha(Image.eval(sym.split()[3], lambda v: int(v * fa)))
            canvas.alpha_composite(s2, (470, 760))
        text(d, (470 + 56, 782), "OpenAEC Foundation", "ui-m", 26, mix(NIGHT, MUTED, fa), "lm")
    return canvas


LAYOUTS = {"intro": render_intro, "collapse": render_collapse, "app": render_app, "ecosystem": render_ecosystem, "end": render_end}


def compose(index: int, t: float, elapsed: float, total_t: float, caps, prev_last: Image.Image | None):
    scene = SCENES[index]
    canvas = LAYOUTS[scene["layout"]](scene, t, scene["duration"])
    if scene["layout"] in ("collapse", "app", "ecosystem"):
        header(canvas, scene, t, index, total_t, elapsed)
    footer(canvas, index, elapsed, total_t)
    cap = active_caption(caps, elapsed) if caps else None
    if cap and scene["layout"] not in ("intro",):
        if scene["layout"] in ("app", "collapse"):
            caption_box(canvas, cap, PANEL)
        else:
            caption_box(canvas, cap, (0, 0, W, 1000))
    img = canvas.convert("RGB")
    if index == 0 and t < 0.5:
        img = Image.blend(Image.new("RGB", (W, H), (20, 20, 24)), img, ease(t / 0.5))
    elif prev_last is not None and t < 0.35:
        img = Image.blend(prev_last, img, ease(t / 0.35))
    if index == len(SCENES) - 1:
        fade = ease((scene["duration"] - t) / 0.9)
        if fade < 1:
            img = Image.blend(Image.new("RGB", (W, H), (12, 12, 15)), img, fade)
    return img


# --------------------------------------------------------------- short (9:16)

SPANEL = (40, 420, 1000, 1080)


def short_compose(item, t, elapsed, total_t, caps, prev_last):
    canvas = SPLATE.copy().convert("RGBA")
    d = ImageDraw.Draw(canvas)
    kind, scene = item
    if kind == "intro":
        a = back_out((t - 0.1) / 0.9)
        ic = icon(260)
        canvas.alpha_composite(ic, (540 - 130, int(560 + (1 - a) * 160)))
        ta = ease_out((t - 0.6) / 0.6)
        text(d, (540, 960 + int((1 - ta) * 30)), "Open Office Studio", "display", 92, mix(NIGHT, WHITE, ta), "mm")
        sa = ease((t - 1.1) / 0.6)
        text(d, (540, 1060), "Part of the OpenAEC Foundation", "ui-m", 40, mix(NIGHT, MUTED, sa), "mm")
        img = canvas.convert("RGB")
        if t < 0.4:
            img = Image.blend(Image.new("RGB", (SW, SH), (20, 20, 24)), img, ease(t / 0.4))
        return img
    if kind == "end":
        a = ease_out(t / 0.7)
        ic = icon(220)
        canvas.alpha_composite(ic, (540 - 110, 420))
        text(d, (540, 780 + int((1 - a) * 30)), "Open Office Studio.", "display", 96, mix(NIGHT, WHITE, a), "mm")
        ba = ease_out((t - 0.5) / 0.5)
        if ba > 0:
            d.rounded_rectangle((540 - 260, 880, 540 + 260, 980), 16, fill=AMBER)
            text(d, (540, 930), "Download it free.", "ui-b", 44, (28, 28, 34), "mm")
        fa = ease((t - 1.0) / 0.6)
        text(d, (540, 1080), "Free · Open source", "ui-m", 40, mix(NIGHT, WHITE, fa), "mm")
        text(d, (540, 1136), "Windows · macOS · Linux", "ui-m", 40, mix(NIGHT, WHITE, fa), "mm")
        text(d, (540, 1230), "github.com/OpenAEC-Foundation/", "ui-sb", 34, mix(NIGHT, GOLD, fa), "mm")
        text(d, (540, 1276), "open-office-studio", "ui-sb", 34, mix(NIGHT, GOLD, fa), "mm")
    else:
        x, y, w, h = SPANEL
        view = app_view(scene, t, scene["short_duration"], w, h, "short_camera")
        paste_shadow(canvas, x, y, w, h, 18)
        canvas.paste(view.convert("RGB"), (x, y), rounded_mask(w, h, 18))
        a = ease_out(t / 0.6)
        text(d, (60, 200), spaced(scene["eyebrow"]), "ui-b", 22, mix(NIGHT, AMBER, a))
        f = font("display", 74)
        lines = wrap(d, scene["title"][0], f, 960)
        for k, l in enumerate(lines):
            text(d, (56, 240 + k * 84 + int((1 - a) * 20)), l, "display", 74, mix(NIGHT, WHITE, a))
    ic = icon(44)
    canvas.alpha_composite(ic, (60, 80))
    text(d, (118, 102), spaced("OPEN OFFICE STUDIO"), "ui-b", 18, MUTED, "lm")
    d.line((60, 1852, 1020, 1852), fill=(70, 70, 78), width=3)
    d.line((60, 1852, 60 + int(960 * elapsed / total_t), 1852), fill=AMBER, width=4)
    cap = active_caption(caps, elapsed)
    if cap:
        over = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        od = ImageDraw.Draw(over)
        f = font("ui-sb", 42)
        lines = wrap(od, cap, f, 940)
        top = 1560 if kind != "end" else 1420
        for k, l in enumerate(lines):
            od.text((540, top + k * 58), l, font=f, fill=WHITE + (255,), anchor="mm")
        canvas.alpha_composite(over)
    img = canvas.convert("RGB")
    if prev_last is not None and t < 0.3:
        img = Image.blend(prev_last, img, ease(t / 0.3))
    if kind == "end":
        fade = ease((item[1]["duration"] - t) / 0.7)
        if fade < 1:
            img = Image.blend(Image.new("RGB", (SW, SH), (12, 12, 15)), img, fade)
    return img


# --------------------------------------------------------------- main

def encode(path: Path, size, frames_iter, audio: Path, total: float):
    cmd = [FFMPEG, "-y", "-v", "warning", "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{size[0]}x{size[1]}", "-r", str(FPS), "-i", "-",
           "-i", str(audio), "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-profile:v", "high",
           "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{total:.3f}", str(path)]
    with subprocess.Popen(cmd, stdin=subprocess.PIPE) as proc:
        for img in frames_iter:
            proc.stdin.write(img.tobytes())
        proc.stdin.close()
        if proc.wait():
            raise RuntimeError("FFmpeg failed")


def main_timeline():
    starts, acc = [], 0.0
    for s in SCENES:
        starts.append(acc)
        acc += s["duration"]
    return starts, acc


def build_main_audio(starts, total):
    voice = np.zeros(int(total * SR) + SR, np.float32)
    caps = []
    for s, st in zip(SCENES, starts):
        parts, c = place_voice(s["voice"], st + s.get("voice_at", 0.45), st + s["duration"] - 0.2, s["id"])
        for t0, a in parts:
            i = int(t0 * SR)
            voice[i:i + len(a)] += a
        caps += c
    voice = voice[: int(total * SR)]
    bed = music(total, intro=True, outro_at=total - 3.2)
    return mixdown(voice, bed), caps


def render_main(args, caps, total, starts):
    OUT.mkdir(parents=True, exist_ok=True)

    def frames():
        prev_last = None
        for i, s in enumerate(SCENES):
            n = round(s["duration"] * FPS)
            print(f"  scene {i}: {s['id']} ({n} frames)", flush=True)
            img = None
            for k in range(n):
                t = k / FPS
                img = compose(i, t, starts[i] + t, total, caps, prev_last)
                yield img
            prev_last = img

    encode(OUT / "open-office-studio-promo-en.mp4", (W, H), frames(), OUT / "soundtrack-main.wav", total)


def short_plan():
    sc = CFG["short"]
    by_id = {s["id"]: s for s in SCENES}
    items = [("intro", {"duration": sc["intro"]["duration"]})]
    for sid in sc["scenes"]:
        s = dict(by_id[sid])
        s["short_duration"] = s["duration"]
        items.append(("app", s))
    items.append(("end", {"duration": sc["end"]["duration"], "voice": sc["end"]["voice"]}))
    starts, acc = [], 0.0
    for _, s in items:
        starts.append(acc)
        acc += s["duration"]
    return items, starts, acc


def render_short(args):
    items, starts, total = short_plan()
    voice = np.zeros(int(total * SR) + SR, np.float32)
    caps = []
    for (kind, s), st in zip(items, starts):
        if "voice" not in s:
            continue
        parts, c = place_voice(s["voice"], st + (0.45 if kind != "end" else 0.35), st + s["duration"] - 0.15, f"short {kind}")
        for t0, a in parts:
            i = int(t0 * SR)
            voice[i:i + len(a)] += a
        caps += c
    voice = voice[: int(total * SR)]
    bed = music(total, intro=False, outro_at=total - 2.0, seed=11)
    write_wav(OUT / "soundtrack-short.wav", mixdown(voice, bed))

    def frames():
        prev_last = None
        for (kind, s), st in zip(items, starts):
            n = round(s["duration"] * FPS)
            print(f"  short {kind} ({n} frames)", flush=True)
            img = None
            for k in range(n):
                t = k / FPS
                img = short_compose((kind, s), t, st + t, total, caps, prev_last)
                yield img
            prev_last = img

    encode(OUT / "open-office-studio-short-en.mp4", (SW, SH), frames(), OUT / "soundtrack-short.wav", total)
    return total


def storyboard(caps, total, starts):
    cols = 2
    rows = math.ceil(len(SCENES) / cols)
    sheet = Image.new("RGB", (960 * cols, 540 * rows), NIGHT)
    for i, s in enumerate(SCENES):
        t = s.get("poster", s["duration"] * 0.62)
        img = compose(i, t, starts[i] + t, total, caps, None)
        img.save(OUT / f"scene-{i:02d}.jpg", quality=90)
        sheet.paste(img.resize((960, 540), Image.Resampling.LANCZOS), ((i % cols) * 960, (i // cols) * 540))
    sheet.save(OUT / "storyboard.jpg", quality=88)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills-only", action="store_true", help="storyboard and scene frames only (no voice, no video)")
    ap.add_argument("--skip-voice", action="store_true", help="use cached narration only")
    ap.add_argument("--only", choices=["main", "short"], help="render one of the two videos")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    starts, total = main_timeline()
    for s in SCENES:
        if s["layout"] == "app":
            sp = speed_for(s, s["duration"])
            tk, a, b = scene_sequence(s)
            print(f"  {s['id']}: recording {(b - a) / tk.fps:.1f}s in {s['duration']:.1f}s (x{sp:.2f})")
    if args.stills_only:
        storyboard([], total, starts)
        print(OUT / "storyboard.jpg")
        return
    lines = [s["voice"] for s in SCENES] + [CFG["short"]["end"]["voice"]]
    if not args.skip_voice:
        asyncio.run(narrate(lines))
    mix_main, caps = build_main_audio(starts, total)
    write_wav(OUT / "soundtrack-main.wav", mix_main)
    (OUT / "open-office-studio-en.srt").write_text(
        "\n\n".join(f"{k + 1}\n{srt_stamp(a)} --> {srt_stamp(b)}\n{c}" for k, (a, b, c) in enumerate(caps)) + "\n"
    )
    storyboard(caps, total, starts)
    if args.only in (None, "main"):
        render_main(args, caps, total, starts)
        print(OUT / "open-office-studio-promo-en.mp4", f"{total:.1f}s")
    if args.only in (None, "short"):
        st = render_short(args)
        print(OUT / "open-office-studio-short-en.mp4", f"{st:.1f}s")


if __name__ == "__main__":
    main()
