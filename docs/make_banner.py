"""Render docs/banner.png (README top + GitHub social preview, 1280x640) in the site's night look (Teal instrument).

    .venv/Scripts/python.exe docs/make_banner.py

Colours and fonts follow DESIGN.md: the slate panel, one readout panel, a row of milestone lamps
(the next one lit teal), IBM Plex Sans Condensed + Plex Mono.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "site" / "fonts"
W, H = 1280, 640

SCREEN, PANEL, LINE = "#0e1316", "#1f2930", "#2a353d"
FG, MUTED, CLOCK, LAMP = "#eef2f3", "#9aa8b0", "#eef2f3", "#3cc9b0"
TEAL, AMBER = "#3cc9b0", "#ffb000"
MILESTONES = [("SUBMIT", TEAL), ("REVIEWS", AMBER), ("DECISION", "#5aa7ff"), ("CAMERA", "#8d9aa2"), ("CONF", "#eef2f3")]


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


SANS_B = lambda s: font("IBMPlexSansCondensed-Bold.ttf", s)
SANS_SB = lambda s: font("IBMPlexSansCondensed-SemiBold.ttf", s)
MONO = lambda s: font("IBMPlexMono-SemiBold.ttf", s)


def spaced(d, xy, text, f, fill, track, anchor="ls"):
    """Draw capitals with letter spacing (PIL has none), left-aligned at xy."""
    x, y = xy
    if anchor == "ms":
        x -= (sum(d.textlength(c, font=f) for c in text) + track * (len(text) - 1)) / 2
    for c in text:
        d.text((x, y), c, font=f, fill=fill, anchor="ls")
        x += d.textlength(c, font=f) + track


def main():
    img = Image.new("RGB", (W, H), SCREEN)
    d = ImageDraw.Draw(img)

    # Brand: the lamp mark and the domain.
    cx, cy = 104, 112
    d.ellipse((cx - 20, cy - 20, cx + 20, cy + 20), outline=MUTED, width=4)
    d.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), fill=TEAL)
    d.text((140, cy), "ai-deadlines.ruzcko.com", font=SANS_SB(28), fill=MUTED, anchor="lm")

    # Title and tagline.
    d.text((84, 252), "AI Conference", font=SANS_B(80), fill=FG, anchor="ls")
    d.text((84, 334), "Deadlines", font=SANS_B(80), fill=FG, anchor="ls")
    tag = SANS_SB(28)
    d.text((84, 404), "Live countdowns from submission to", font=tag, fill=MUTED, anchor="ls")
    d.text((84, 442), "camera-ready, a map and calendar feeds.", font=tag, fill=MUTED, anchor="ls")

    # The readout panel: four units, thin rules between them.
    px0, py0, px1, py1 = 680, 176, 1196, 356
    d.rounded_rectangle((px0, py0, px1, py1), radius=4, fill=PANEL, outline=LINE, width=2)
    units = [("26", "DAYS"), ("23", "HOURS"), ("41", "MIN"), ("07", "SEC")]
    cw = (px1 - px0) / 4
    for i, (n, label) in enumerate(units):
        x = px0 + cw * i + cw / 2
        if i:
            d.line((px0 + cw * i, py0 + 24, px0 + cw * i, py1 - 24), fill=LINE, width=2)
        d.text((x, py0 + 112), n, font=MONO(76), fill=CLOCK, anchor="ms")
        spaced(d, (x, py0 + 152), label, SANS_SB(17), MUTED, 2.5, anchor="ms")

    # The lamp row: the next milestone lit amber, the rest unlit rings.
    lw = (px1 - px0) / 5
    for i, (label, colour) in enumerate(MILESTONES):
        x = px0 + lw * i + lw / 2
        y = 404
        if i == 0:
            d.ellipse((x - 17, y - 17, x + 17, y + 17), fill="#1d4a44")  # the lit lamp's halo
            d.ellipse((x - 11, y - 11, x + 11, y + 11), fill=LAMP)
        else:
            d.ellipse((x - 10, y - 10, x + 10, y + 10), outline=MUTED, width=3)
        spaced(d, (x, y + 44), label, SANS_SB(17), LAMP if i == 0 else MUTED, 2, anchor="ms")

    # Footer line: what the lamps mean, in the milestone colours.
    x = 84
    y = 560
    for label, colour in [("Submission", TEAL), ("Reviews", AMBER), ("Decision", "#5aa7ff"), ("Camera-ready", "#8d9aa2"), ("Conference", "#eef2f3")]:
        d.ellipse((x, y - 16, x + 14, y - 2), fill=colour)
        d.text((x + 24, y), label, font=SANS_SB(24), fill=MUTED, anchor="ls")
        x += 24 + d.textlength(label, font=SANS_SB(24)) + 40
    assert x - 40 <= W - 84, f"footer overflows: {x}"

    out = ROOT / "docs" / "banner.png"
    img.save(out, optimize=True)
    print(out, img.size)


if __name__ == "__main__":
    main()
