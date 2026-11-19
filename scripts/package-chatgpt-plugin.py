"""Build the CRRT plugin ZIPs without including repository files or credentials."""
from __future__ import annotations

import argparse
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
CLAUDE_FILES = (
    ".claude-plugin/plugin.json",
    ".mcp.json",
    "README.md",
    "assets/icon.png",
    "skills/feedback-to-fix/SKILL.md",
)


def checked_contents(source: Path, files: tuple[str, ...]) -> dict[str, bytes]:
    for name in files:
        # Only links inside the plugin matter; system temp dirs may sit under a symlink.
        parts = Path(name).parts
        if source.is_symlink() or any((source.joinpath(*parts[:i + 1])).is_symlink() for i in range(len(parts))):
            raise ValueError(f"Symlink not allowed: {name}")
        if not (source / name).is_file():
            raise ValueError(f"Missing package file: {name}")
    return {name: (source / name).read_bytes() for name in files}


def plugin_version(manifest: dict) -> str:
    version = manifest["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Plugin version must be major.minor.patch")
    return version


def write_archive(target: Path, contents: dict[str, bytes]) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in contents.items():
            # Fixed timestamps and inventory make identical inputs reproducible.
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content)
    return target


def package_claude_plugin(source: Path, output: Path) -> Path:
    contents = checked_contents(source, CLAUDE_FILES)
    version = plugin_version(json.loads(contents[".claude-plugin/plugin.json"]))
    return write_archive(output / f"crrt-claude-{version}.zip", contents)


def package_plugin(source: Path, output: Path, registered_app_id: str | None = None) -> Path:
    # An explicit inventory keeps review notes, credentials, and build debris out.
    contents = checked_contents(source, FILES)
    manifest = json.loads(contents["plugin.json"])
    version = plugin_version(manifest)
    if registered_app_id is not None:
        app_id = registered_app_id.removeprefix("plugin_")
        if not re.fullmatch(r"(?:asdk_app|connector)_[A-Za-z0-9_-]+", app_id):
            raise ValueError("Expected a registered ChatGPT app ID")
        # Private portable imports do not activate registered apps in Codex.
        # Use its supported compatibility format for this optional build profile.
        openai = manifest.get("extensions", {}).get("com.openai", {})
        compatibility = {key: value for key, value in manifest.items()
                         if key in {"name", "version", "description", "author"}}
        compatibility.update(interface=openai.get("interface", {}), skills="./skills",
                             apps="./.app.json", mcpServers="./.mcp.json")
        compatibility["extensions"] = {"com.openai": {
            key: value for key, value in openai.items()
            if key not in {"interface", "apps", "mcpServers", "skills"}
        }}
        portable_mcp = json.loads(contents.pop("mcp.json"))
        native_mcp = {"mcpServers": {
            name: {key: value for key, value in server.items() if key != "type"}
            for name, server in portable_mcp["mcpServers"].items()
        }}
        contents.pop("plugin.json")
        for name, value in {
            ".codex-plugin/plugin.json": compatibility,
            ".mcp.json": native_mcp,
            ".app.json": {"apps": {"crrt": {"id": app_id, "required": True}}},
        }.items():
            contents[name] = (json.dumps(value, indent=2) + "\n").encode("utf-8")
    suffix = "-registered" if registered_app_id is not None else ""
    return write_archive(output / f"crrt-chatgpt-{version}{suffix}.zip", contents)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registered-app-id", help="ChatGPT connection ID for a private web/desktop build")
    parser.add_argument("--claude", action="store_true", help="Build the Claude plugin ZIP instead")
    args = parser.parse_args()
    if args.claude and args.registered_app_id:
        parser.error("--registered-app-id applies only to the ChatGPT package")
    if args.claude:
        print(package_claude_plugin(ROOT / "plugins/crrt", ROOT / "artifacts"))
    else:
        print(package_plugin(ROOT / "plugins/crrt", ROOT / "artifacts", args.registered_app_id))
