"""Build the CRRT plugin ZIP without including repository files or credentials."""
import json
from pathlib import Path
import re
import zipfile


ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "plugin.json",
    "mcp.json",
    "assets/icon.png",
    "skills/feedback-to-fix/SKILL.md",
)


def package_plugin(source: Path, output: Path) -> Path:
    # An explicit inventory keeps review notes, credentials, and build debris out.
    for name in FILES:
        path = source / name
        if any(parent.is_symlink() for parent in (path, *path.parents)):
            raise ValueError(f"Symlink not allowed: {name}")
        if not path.is_file():
            raise ValueError(f"Missing package file: {name}")
    manifest = json.loads((source / "plugin.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Plugin version must be major.minor.patch")
    output.mkdir(parents=True, exist_ok=True)
    target = output / f"crrt-chatgpt-{version}.zip"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in FILES:
            # Fixed timestamps and inventory make identical inputs reproducible.
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (source / name).read_bytes())
    return target


if __name__ == "__main__":
    print(package_plugin(ROOT / "plugins/crrt", ROOT / "artifacts"))
