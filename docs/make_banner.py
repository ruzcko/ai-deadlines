"""Render docs/banner.png (README top + GitHub social preview, 1280x640).

    .venv/Scripts/python.exe docs/make_banner.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "site" / "fonts"
W, H = 1280, 640
BG, INK, MUTED, RED, GREEN = "#0f1115", "#f3f4f6", "#9a9fab", "#ff6369", "#4ade80"
TILE_BG, TILE_LINE = "#171a20", "#262a33"


def font(name, size):
    return ImageFont.truetype(str(FONTS / f"Inter-{name}.ttf"), size)


def main():
    img = Image.new("RGB", (W, H), BG)
    # Soft red glow, top right.
    glow = Image.new("RGB", (W, H), BG)
    ImageDraw.Draw(glow).ellipse((W - 420, -260, W + 220, 300), fill="#2a1518")
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(120)), 1.0)
    d = ImageDraw.Draw(img)

    # Clock mark + domain.
    cx, cy, r = 122, 148, 30
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=RED, width=6)
    d.line((cx, cy - 16, cx, cy), fill=RED, width=6)
    d.line((cx, cy, cx + 12, cy + 10), fill=RED, width=6)
    d.text((174, 148), "ai-deadlines.ruzcko.com", font=font("Medium", 26), fill=MUTED, anchor="lm")

    # Title.
    big = font("ExtraBold", 104)
    d.text((88, 292), "AI Conference", font=big, fill=INK, anchor="ls")
    d.text((88, 394), "Deadlines", font=big, fill=RED, anchor="ls")

    # Tagline.
    tag = font("Medium", 30)
    d.text((88, 450), "Live countdowns from submission to camera-ready, a map of where", font=tag, fill=MUTED, anchor="lm")
    d.text((88, 490), "each conference is, and calendar feeds for every milestone type.", font=tag, fill=MUTED, anchor="lm")

    # Tiles: each sized to its text, so nothing clips.
    num_f, unit_f, lab_f = font("ExtraBold", 34), font("Medium", 20), font("Medium", 20)
    tiles = [
        ("31", "days", "CVPR 2027 · Paper", RED),
        ("57", "days", "NeurIPS 2026 · Conference", RED),
        ("2", "sources", "cross-checked", GREEN),
    ]
    x, y, h, pad, gap = 88, 548, 60, 18, 14
    for num, unit, label, color in tiles:
        wn = d.textlength(num, font=num_f)
        wu = d.textlength(unit, font=unit_f)
        wl = d.textlength(label, font=lab_f)
        w = pad + wn + 6 + wu + 16 + wl + pad
        d.rounded_rectangle((x, y, x + w, y + h), radius=12, fill=TILE_BG, outline=TILE_LINE, width=2)
        cx = x + pad
        d.text((cx, y + h / 2 + 1), num, font=num_f, fill=color, anchor="lm")
        cx += wn + 6
        d.text((cx, y + h / 2 + 4), unit, font=unit_f, fill=color, anchor="lm")
        cx += wu + 16
        d.text((cx, y + h / 2 + 1), label, font=lab_f, fill=INK, anchor="lm")
        x += w + gap
    assert x - gap <= W - 88, f"tiles overflow: {x}"

    out = ROOT / "docs" / "banner.png"
    img.save(out, optimize=True)
    print(out, img.size, "tiles end at", round(x - gap))


if __name__ == "__main__":
    main()
