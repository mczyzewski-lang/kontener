"""Generates the PWA icons: a terracotta square with a white serif "h" and accent dot (no gradients)."""
from PIL import Image, ImageDraw, ImageFont
import sys

ACCENT = (194, 69, 45)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

def icon(size, path, radius_ratio=0.0):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if radius_ratio:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=ACCENT)
    else:
        d.rectangle([0, 0, size, size], fill=ACCENT)
    font = ImageFont.truetype(FONT, int(size * 0.62))
    text = "h"
    bbox = d.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - w) / 2 - bbox[0] - size * 0.04
    y = (size - h) / 2 - bbox[1]
    d.text((x, y), text, font=font, fill=(255, 255, 255))
    r = size * 0.055
    cx, cy = size * 0.72, size * 0.66
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255))
    img.save(path)

out = sys.argv[1]
icon(512, f"{out}/icon-512.png")
icon(192, f"{out}/icon-192.png")
icon(180, f"{out}/apple-icon.png")
icon(48, f"{out}/favicon.png", 0.2)
