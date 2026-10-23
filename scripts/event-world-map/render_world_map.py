#!/usr/bin/env python3
"""Render 10-second MP4 from anonymised Firestore event locations."""
import argparse
import datetime as dt
import json
import pathlib
import subprocess
import urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageFont

START = dt.datetime(2025, 4, 1, tzinfo=dt.timezone.utc)
END = dt.datetime(2026, 10, 23, 23, 59, 59, tzinfo=dt.timezone.utc)
W, H, FPS = 1600, 900, 30
HERE = pathlib.Path(__file__).resolve().parent
URL = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson"
GOLD = (251, 206, 64)

def font(size):
    for filename in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/Library/Fonts/Arial.ttf"):
        if pathlib.Path(filename).exists():
            return ImageFont.truetype(filename, size)
    return ImageFont.load_default()

TITLE, MED, SMALL = font(49), font(26), font(17)

def xy(lon, lat):
    return 68 + (lon + 180) * 1464 / 360, 173 + (79 - lat) * 505 / 141

def load(path):
    rows = json.loads(pathlib.Path(path).read_text())
    if isinstance(rows, dict):
        rows = rows.get("events", [])
    out = []
    for row in rows:
        try:
            moment = dt.datetime.fromisoformat(row["createdAt"].replace("Z", "+00:00"))
            if moment.tzinfo is None:
                moment = moment.replace(tzinfo=dt.timezone.utc)
            moment = moment.astimezone(dt.timezone.utc)
            lat, lon = float(row["lat"]), float(row["lon"])
            if START <= moment <= END and -85 <= lat <= 85 and -180 <= lon <= 180:
                out.append(((moment - START) / (END - START), lat, lon))
        except (KeyError, ValueError, TypeError):
            continue
    if not out:
        raise SystemExit("No valid real events were provided; declining to render invented data")
    out.sort()
    return out

def background():
    img = Image.new("RGB", (W, H), (8, 20, 32))
    pen = ImageDraw.Draw(img)
    for longitude in range(-150, 180, 30):
        x, _ = xy(longitude, 0)
        pen.line((x, 173, x, 678), fill=(23, 47, 63))
    for latitude in (-60, -30, 0, 30, 60):
        _, y = xy(0, latitude)
        pen.line((68, y, 1532, y), fill=(23, 47, 63))
    geom = HERE / "world.geojson"
    if not geom.exists():
        request = urllib.request.Request(URL, headers={"User-Agent": "SetTheDateWorldMap/1.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            geom.write_bytes(response.read(8000000))
    countries = json.loads(geom.read_text())
    land = Image.new("RGBA", (W, H))
    polygons = ImageDraw.Draw(land)
    for feature in countries.get("features", []):
        geo = feature.get("geometry") or {}
        rings = geo.get("coordinates") or []
        groups = [rings] if geo.get("type") == "Polygon" else rings if geo.get("type") == "MultiPolygon" else []
        for group in groups:
            if not group or len(group[0]) < 3:
                continue
            outline = [xy(lon, lat) for lon, lat in group[0]]
            polygons.polygon(outline, fill=(43, 69, 80, 240))
            polygons.line(outline + [outline[0]], fill=(110, 143, 155, 170), width=1)
    img.paste(land.crop((68, 173, 1532, 678)), (68, 173), land.crop((68, 173, 1532, 678)))
    pen = ImageDraw.Draw(img)
    pen.text((70, 42), "SET THE DATE", font=MED, fill=GOLD)
    pen.text((70, 97), "A world of plans.", font=TITLE, fill="white")
    pen.text((70, 158), "April 2025 – October 2026", font=SMALL, fill=(157, 184, 192))
    pen.text((70, 727), "EVENTS CREATED OVER TIME", font=SMALL, fill=(156, 180, 187))
    pen.line((72, 805, 1528, 805), fill=(76, 116, 135), width=5)
    for name, year, month in (("APR 25", 2025, 4), ("JUL 25", 2025, 7), ("OCT 25", 2025, 10), ("JAN 26", 2026, 1), ("APR 26", 2026, 4), ("JUL 26", 2026, 7), ("OCT 26", 2026, 10)):
        moment = dt.datetime(year, month, 1, tzinfo=dt.timezone.utc)
        x = 72 + 1456 * ((moment - START) / (END - START))
        pen.line((x, 796, x, 816), fill=(147, 178, 189), width=2)
        pen.text((x - 36, 837), name, font=SMALL, fill=(164, 184, 193))
    pen.text((70, 872), "EVENT DESTINATIONS · APPROXIMATE LOCATIONS", font=SMALL, fill=(149, 178, 189))
    return img

def render_frame(base, entries, n, glow):
    pos = n / (FPS * 10 - 1)
    active = [event for event in entries if event[0] <= pos]
    layer = Image.new("RGBA", (W, H))
    ink = ImageDraw.Draw(layer)
    points = {}
    for created, lat, lon in active:
        points[(lat, lon)] = points.get((lat, lon), 0) + 1
    for (lat, lon), weight in points.items():
        x, y = xy(lon, lat)
        if not (68 <= x <= 1532 and 173 <= y <= 678):
            continue
        layer.alpha_composite(glow, (round(x)-44, round(y)-44))
        radius = 4 + min(3, weight * .5)
        ink.ellipse((x-radius,y-radius,x+radius,y+radius), fill=(*GOLD,255))
        ink.ellipse((x-2,y-2,x+2,y+2), fill=(255,255,234,255))
    for when, lat, lon in active:
        age = pos - when
        if age <= .065:
            x, y = xy(lon, lat)
            radius = 7 + 38 * age / .065
            ink.ellipse((x-radius,y-radius,x+radius,y+radius), outline=(*GOLD,int(190*(1-age/.065))), width=2)
    slider = 72 + 1456 * pos
    ink.line((72,805,slider,805), fill=(*GOLD,255), width=5)
    ink.ellipse((slider-10,795,slider+10,815), fill=(*GOLD,255))
    month = START + (END - START) * pos
    ink.text((70, 686), month.strftime("%B %Y").upper(), font=MED, fill=(*GOLD,255))
    ink.text((1345, 684), str(len(active)), font=MED, fill=(255,255,255,255))
    ink.text((1320, 726), "EVENTS MAPPED", font=SMALL, fill=(165,190,199,255))
    return Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="JSON generated by export_firestore_events.py")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    events = load(args.data)
    output = pathlib.Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    base = background()
    glow = Image.new("RGBA", (88, 88))
    ImageDraw.Draw(glow).ellipse((9,9,79,79), fill=(*GOLD,80))
    glow = glow.filter(ImageFilter.GaussianBlur(16))
    render_frame(base, events, 299, glow).save(output.with_suffix(".png"))
    cmd = ["ffmpeg","-hide_banner","-loglevel","error","-y",
           "-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}",
           "-r",str(FPS),"-i","-","-t","10","-an",
           "-c:v","libx264","-preset","veryfast","-crf","19",
           "-pix_fmt","yuv420p","-movflags","+faststart",str(output)]
    process = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(300):
        process.stdin.write(render_frame(base, events, i, glow).tobytes())
    process.stdin.close()
    if process.wait() != 0:
        raise SystemExit("Encoding failed")
    print(f"Video created: {output}; events: {len(events)}")

if __name__ == "__main__":
    main()
