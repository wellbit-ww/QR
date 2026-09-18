#!/usr/bin/env python3
"""Generate portal login sticker PNG from template + login/password."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import deque
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:  # pragma: no cover - runtime dependency hint
    print(
        "Pillow is required. Install with:\n"
        "  python -m pip install -r scripts/requirements-sticker.txt",
        file=sys.stderr,
    )
    raise SystemExit(2) from exc

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES_DIR = ROOT / "templates"
DEFAULT_LAYOUT = TEMPLATES_DIR / "sticker-sdb1106nm.layout.json"
DEFAULT_OUTPUT_DIR = ROOT / "stickers"
WINDOWS_FONTS = Path(r"C:\Windows\Fonts")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate portal sticker PNG.")
    parser.add_argument("--title", default="", help="Equipment title printed on sticker")
    parser.add_argument("--login", required=True, help="Portal login")
    parser.add_argument("--password", required=True, help="Portal password")
    parser.add_argument(
        "--layout",
        default=str(DEFAULT_LAYOUT),
        help="Path to layout JSON",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Output PNG path (default: stickers/<login>.png)",
    )
    return parser.parse_args()


def sanitize_filename(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", value.strip().lower())
    return cleaned or "sticker"


def resolve_font_path(font_name: str) -> Path:
    candidates = [
        TEMPLATES_DIR / font_name,
        ROOT / "templates" / font_name,
        WINDOWS_FONTS / font_name,
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        f"Font not found: {font_name}. Place it in templates/ or install Arial Bold."
    )


def fit_font(text: str, draw_box: list[int], font_path: Path, max_size: int, min_size: int):
    x0, _, x1, _ = draw_box
    max_width = max(40, x1 - x0 - 4)
    for size in range(max_size, min_size - 1, -1):
        font = ImageFont.truetype(str(font_path), size)
        bbox = font.getbbox(text)
        width = bbox[2] - bbox[0]
        if width <= max_width:
            return font
    return ImageFont.truetype(str(font_path), min_size)


def text_size(font: ImageFont.FreeTypeFont, text: str) -> tuple[int, int]:
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def line_advance(font: ImageFont.FreeTypeFont, line_spacing: int) -> int:
    ascent, descent = font.getmetrics()
    return ascent + descent + line_spacing


def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    explicit_lines = [line.strip() for line in str(text or "").splitlines() if line.strip()]
    if not explicit_lines:
        explicit_lines = [str(text or "").strip()]

    out = []
    for line in explicit_lines:
        words = line.split()
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if not current or text_size(font, candidate)[0] <= max_width:
                current = candidate
            else:
                out.append(current)
                current = word
        if current:
            out.append(current)
    return out


def fit_multiline_font(
    text: str,
    draw_box: list[int],
    font_path: Path,
    max_size: int,
    min_size: int,
    line_spacing: int,
) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    x0, y0, x1, y1 = draw_box
    max_width = max(40, x1 - x0)
    max_height = max(40, y1 - y0)
    for size in range(max_size, min_size - 1, -1):
        font = ImageFont.truetype(str(font_path), size)
        lines = wrap_text(text, font, max_width)
        total_height = max(0, len(lines)) * line_advance(font, line_spacing) - line_spacing
        widest = max((text_size(font, line)[0] for line in lines), default=0)
        if widest <= max_width and total_height <= max_height:
            return font, lines
    font = ImageFont.truetype(str(font_path), min_size)
    return font, wrap_text(text, font, max_width)


def draw_title_field(
    draw: ImageDraw.ImageDraw,
    field_cfg: dict,
    value: str,
    font_path: Path,
    color: tuple[int, int, int],
) -> None:
    text = str(value or "").strip()
    if not text:
        return
    box = field_cfg["valueBox"]
    line_spacing = int(field_cfg.get("lineSpacing", 6))
    font, lines = fit_multiline_font(
        text,
        list(box),
        font_path,
        int(field_cfg.get("valueMaxFontSize", 44)),
        int(field_cfg.get("valueMinFontSize", 24)),
        line_spacing,
    )
    x0, y0, x1, _ = box
    y = y0
    advance = line_advance(font, line_spacing)
    align = field_cfg.get("align", "left")
    center_x = (x0 + x1) // 2
    for line in lines:
        if align == "center":
            draw.text((center_x, y), line, fill=color, font=font, anchor="ma")
        else:
            draw.text((x0, y), line, fill=color, font=font, anchor="la")
        y += advance


def average_light_row_color(image: Image.Image, box: tuple[int, int, int, int], y: int) -> tuple[int, int, int]:
    x0, _, x1, _ = box
    samples = []
    for x in range(x0, x1):
        r, g, b = image.getpixel((x, y))[:3]
        if r > 220 and g > 220 and b > 220:
            samples.append((r, g, b))
    if not samples:
        return (248, 248, 248)
    return tuple(sum(sample[i] for sample in samples) // len(samples) for i in range(3))


def clean_text_area(source: Image.Image, image: Image.Image, box: list[int]) -> None:
    x0, y0, x1, y1 = box
    source_px = source.load()
    image_px = image.load()

    for y in range(y0, y1):
        row_color = average_light_row_color(source, (x0, y0, x1, y1), y)
        for x in range(x0, x1):
            r, g, b = source_px[x, y][:3]
            # Remove baked-in placeholder text and antialiasing, but keep the light template background.
            if r < 220 or g < 220 or b < 220:
                image_px[x, y] = row_color


def left_aligned_text_center_x(
    text: str,
    value_box: list[int],
    font_path: Path,
    max_size: int,
    min_size: int,
) -> int:
    font = fit_font(text, value_box, font_path, max_size, min_size)
    bbox = font.getbbox(text, anchor="la")
    return int(value_box[0] + (bbox[0] + bbox[2]) / 2)


def draw_credential_field(
    draw: ImageDraw.ImageDraw,
    field_cfg: dict,
    value: str,
    font_path: Path,
    label_color: tuple[int, int, int],
    value_color: tuple[int, int, int],
) -> None:
    value_box = field_cfg["valueBox"]

    label = field_cfg.get("label")
    label_box = field_cfg.get("labelBox")
    if label and label_box:
        label_font = fit_font(
            label,
            list(label_box),
            font_path,
            int(field_cfg.get("labelMaxFontSize", 34)),
            int(field_cfg.get("labelMinFontSize", 24)),
        )
        label_y = (label_box[1] + label_box[3]) // 2
        draw.text((label_box[0], label_y), label, fill=label_color, font=label_font, anchor="lm")

    value_font = fit_font(
        value,
        list(value_box),
        font_path,
        int(field_cfg.get("valueMaxFontSize", 34)),
        int(field_cfg.get("valueMinFontSize", 18)),
    )

    value_align = field_cfg.get("align", "left")
    if value_align == "center":
        value_x = int(field_cfg["centerX"]) if field_cfg.get("centerX") is not None else (value_box[0] + value_box[2]) // 2
        anchor = "mm"
        bottom_anchor = "ma"
    elif value_align == "right":
        value_x = value_box[2]
        anchor = "rm"
        bottom_anchor = "ra"
    else:
        value_x = value_box[0]
        anchor = "lm"
        bottom_anchor = "la"

    if field_cfg.get("bottomY") is not None:
        bbox = value_font.getbbox(value, anchor=bottom_anchor)
        value_y = int(field_cfg["bottomY"]) - bbox[3]
        draw.text((value_x, value_y), value, fill=value_color, font=value_font, anchor=bottom_anchor)
    else:
        value_y = (value_box[1] + value_box[3]) // 2
        draw.text((value_x, value_y), value, fill=value_color, font=value_font, anchor=anchor)


def resolve_background_color(layout: dict, image: Image.Image, field_cfg: dict) -> tuple[int, int, int]:
    sample = field_cfg.get("bgSample")
    if sample and len(sample) >= 2:
        return image.getpixel((int(sample[0]), int(sample[1])))[:3]

    configured = layout.get("backgroundColor")
    if configured and len(configured) >= 3:
        return tuple(int(v) for v in configured[:3])

    x0, y0, x1, y1 = field_cfg["clearBox"]
    px = image.load()
    samples = []
    for y in range(y0 + 2, y1 - 1, max(1, (y1 - y0 - 3) // 3)):
        for x in range(x0 + 2, x1 - 1, max(1, (x1 - x0 - 3) // 3)):
            r, g, b = px[x, y]
            if r > 200 and g > 200 and b > 200:
                samples.append((r, g, b))
    if samples:
        return tuple(sum(channel[i] for channel in samples) // len(samples) for i in range(3))
    return (248, 248, 248)


def patch_field_background(source: Image.Image, image: Image.Image, field_cfg: dict) -> None:
    x0, y0, x1, y1 = field_cfg["clearBox"]
    width = x1 - x0
    height = y1 - y0
    patch_from = field_cfg.get("patchFrom")
    if patch_from and len(patch_from) >= 2:
        src_x = int(patch_from[0])
        src_y = int(patch_from[1])
    else:
        src_x = x0
        src_y = max(0, y0 - 30)
    patch = source.crop((src_x, src_y, src_x + width, src_y + height))
    image.paste(patch, (x0, y0))


def paint_field(
    draw: ImageDraw.ImageDraw,
    source: Image.Image,
    image: Image.Image,
    layout: dict,
    field_cfg: dict,
    text: str,
    font_path: Path,
    color: tuple[int, int, int],
):
    if field_cfg.get("valueBox"):
        if field_cfg.get("cleanBox"):
            clean_text_area(source, image, field_cfg["cleanBox"])
        draw_credential_field(
            draw,
            field_cfg,
            text,
            font_path,
            tuple(int(v) for v in field_cfg.get("labelColor", [10, 10, 10])[:3]),
            color,
        )
        return

    clear_box = tuple(field_cfg["clearBox"])
    draw_box = tuple(field_cfg["drawBox"])
    if field_cfg.get("patchFrom"):
        patch_field_background(source, image, field_cfg)
    else:
        fill_color = resolve_background_color(layout, image, field_cfg)
        draw.rectangle(clear_box, fill=fill_color)

    line_text = text
    if field_cfg.get("prefix"):
        line_text = f"{field_cfg['prefix']}{text}"
    font = fit_font(
        line_text,
        list(draw_box),
        font_path,
        int(field_cfg.get("maxFontSize", 32)),
        int(field_cfg.get("minFontSize", 18)),
    )
    x0, y0, x1, y1 = draw_box
    mid_y = (y0 + y1) // 2
    draw.text((x0, mid_y), line_text, fill=color, font=font, anchor="lm")


def whiten_corner_dead_zones(image: Image.Image, threshold: int = 40) -> Image.Image:
    """Replace dark padding outside rounded sticker corners with white."""
    px = image.load()
    width, height = image.size
    white = (255, 255, 255)
    corners = ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1))
    to_paint: set[tuple[int, int]] = set()

    for sx, sy in corners:
        if max(px[sx, sy]) >= threshold:
            continue
        queue = deque([(sx, sy)])
        while queue:
            x, y = queue.popleft()
            if (x, y) in to_paint or x < 0 or y < 0 or x >= width or y >= height:
                continue
            if max(px[x, y]) >= threshold:
                continue
            to_paint.add((x, y))
            queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    for x, y in to_paint:
        px[x, y] = white
    return image


def generate_sticker(title: str, login: str, password: str, layout_path: Path, output_path: Path) -> Path:
    layout = json.loads(layout_path.read_text(encoding="utf-8"))
    template_path = TEMPLATES_DIR / layout["template"]
    if not template_path.exists():
        raise FileNotFoundError(f"Sticker template not found: {template_path}")

    image = Image.open(template_path).convert("RGB")
    whiten_corner_dead_zones(image)
    source = image.copy()
    draw = ImageDraw.Draw(image)
    font_path = resolve_font_path(layout.get("fontFamily", "arialbd.ttf"))
    color_list = layout.get("textColor", [35, 35, 35])
    color = tuple(int(v) for v in color_list[:3])

    if layout["fields"].get("title"):
        draw_title_field(draw, layout["fields"]["title"], title, font_path, color)

    login_cfg = layout["fields"]["login"]
    password_cfg = layout["fields"]["password"]
    if login_cfg.get("align") == "center" and login_cfg.get("alignToField") == "password":
        login_cfg = {
            **login_cfg,
            "centerX": left_aligned_text_center_x(
                password,
                password_cfg["valueBox"],
                font_path,
                int(password_cfg.get("valueMaxFontSize", 34)),
                int(password_cfg.get("valueMinFontSize", 18)),
            ),
        }

    paint_field(draw, source, image, layout, login_cfg, login, font_path, color)
    paint_field(draw, source, image, layout, password_cfg, password, font_path, color)

    whiten_corner_dead_zones(image)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    dpi = int(layout.get("dpi", 300))
    image.save(output_path, format="PNG", dpi=(dpi, dpi), optimize=True)
    return output_path


def main() -> int:
    args = parse_args()
    layout_path = Path(args.layout).resolve()
    output_path = (
        Path(args.output).resolve()
        if args.output
        else DEFAULT_OUTPUT_DIR / f"{sanitize_filename(args.login)}.png"
    )

    try:
        result = generate_sticker(args.title, args.login, args.password, layout_path, output_path)
    except Exception as error:  # pragma: no cover - CLI surface
        print(f"Sticker generation failed: {error}", file=sys.stderr)
        return 1

    print(str(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
