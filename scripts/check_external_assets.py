#!/usr/bin/env python3
"""
Section 4 Verification Gate:
1. Offline / Air-Gapped Asset Gate: Scans frontend source and dist output for any external URLs or CDNs.
2. Dual-Theme WCAG AA Contrast Gate: Verifies that all text, brand, and status tokens in
   :root[data-theme="dark"] and :root[data-theme="light"] meet >= 4.5:1 contrast against all 3 surface tokens.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
TOKENS_CSS = FRONTEND / "src" / "styles" / "tokens.css"
DIST_DIR = FRONTEND / "dist"

EXTERNAL_ASSET_RE = re.compile(
    r"(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|"
    r"https?://[^\s\"')<>]+\.(?:woff2?|ttf|otf|css|js|png|jpe?g|svg|webp|ico))",
    re.IGNORECASE,
)


def rel_luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = [int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]

    def _chan(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * _chan(r) + 0.7152 * _chan(g) + 0.0722 * _chan(b)


def contrast_ratio(hex1: str, hex2: str) -> float:
    l1 = rel_luminance(hex1)
    l2 = rel_luminance(hex2)
    bright = max(l1, l2)
    dark = min(l1, l2)
    return (bright + 0.05) / (dark + 0.05)


def extract_theme_tokens(css_text: str, theme: str) -> dict[str, str]:
    pattern = re.compile(
        rf':root\[data-theme="{theme}"\]\s*\{{([^}}]+)\}}',
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(css_text)
    if not match:
        return {}
    block = match.group(1)
    tokens: dict[str, str] = {}
    for name, val in re.findall(r"(--color-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})", block):
        tokens[name] = val
    return tokens


def verify_wcag_contrast() -> bool:
    if not TOKENS_CSS.exists():
        print(f"FAIL: Missing token file {TOKENS_CSS}")
        return False

    css_text = TOKENS_CSS.read_text(encoding="utf-8")
    ok = True
    surfaces = ["--color-bg-base", "--color-bg-surface", "--color-bg-elevated"]
    foregrounds = [
        "--color-text-main",
        "--color-text-sub",
        "--color-text-muted",
        "--color-brand",
        "--color-accent-green",
        "--color-accent-gold",
        "--color-accent-red",
    ]

    for theme in ("dark", "light"):
        tokens = extract_theme_tokens(css_text, theme)
        if not tokens:
            print(f"FAIL: Theme block :root[data-theme=\"{theme}\"] not found in tokens.css")
            ok = False
            continue
        for surf in surfaces:
            for fg in foregrounds:
                s_hex = tokens.get(surf)
                f_hex = tokens.get(fg)
                if not s_hex or not f_hex:
                    print(f"FAIL [{theme}]: Missing token {surf} or {fg}")
                    ok = False
                    continue
                ratio = contrast_ratio(s_hex, f_hex)
                if ratio < 4.5:
                    print(f"FAIL [{theme}]: Contrast {fg} ({f_hex}) on {surf} ({s_hex}) is {ratio:.2f}:1 (< 4.5:1)")
                    ok = False
    if ok:
        print("PASS: Dual-theme WCAG AA contrast (>= 4.5:1) verified across all surfaces in dark and light themes.")
    return ok


def verify_offline_assets() -> bool:
    scan_paths: list[Path] = []
    for sub in ("src", "public"):
        p = FRONTEND / sub
        if p.exists():
            scan_paths.extend([f for f in p.rglob("*") if f.is_file() and f.suffix in (".ts", ".tsx", ".css", ".html", ".json")])
    index_html = FRONTEND / "index.html"
    if index_html.exists():
        scan_paths.append(index_html)
    if DIST_DIR.exists():
        scan_paths.extend([f for f in DIST_DIR.rglob("*") if f.is_file() and f.suffix in (".html", ".css", ".js")])

    violations: list[str] = []
    for path in scan_paths:
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in EXTERNAL_ASSET_RE.finditer(text):
            violations.append(f"{path.relative_to(ROOT)}: {m.group(0)}")

    if violations:
        print("FAIL: External asset or CDN references found:")
        for v in violations:
            print(f"  - {v}")
        return False

    # Verify self-hosted woff2 font files exist
    fonts_dir = FRONTEND / "public" / "assets" / "fonts"
    required_fonts = [
        "IBMPlexSans-Regular.woff2",
        "IBMPlexSans-SemiBold.woff2",
        "IBMPlexMono-Regular.woff2",
        "MaterialSymbolsOutlined.woff2",
    ]
    for fname in required_fonts:
        fpath = fonts_dir / fname
        if not fpath.exists() or fpath.stat().st_size < 100:
            print(f"FAIL: Missing self-hosted font file {fpath.relative_to(ROOT)}")
            return False

    print(f"PASS: Scanned {len(scan_paths)} files and verified 4 self-hosted woff2 fonts; zero external assets.")
    return True


def main() -> int:
    print("=== Section 4: Offline Asset & Dual-Theme Contrast Gate ===")
    c_ok = verify_wcag_contrast()
    a_ok = verify_offline_assets()
    return 0 if (c_ok and a_ok) else 1


if __name__ == "__main__":
    sys.exit(main())
