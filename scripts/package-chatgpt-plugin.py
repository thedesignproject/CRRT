"""Build the CRRT plugin ZIP without including repository files or credentials."""
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


def package_plugin(source: Path, output: Path, registered_app_id: str | None = None) -> Path:
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
    contents = {name: (source / name).read_bytes() for name in FILES}
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
    output.mkdir(parents=True, exist_ok=True)
    suffix = "-registered" if registered_app_id is not None else ""
    target = output / f"crrt-chatgpt-{version}{suffix}.zip"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in contents.items():
            # Fixed timestamps and inventory make identical inputs reproducible.
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content)
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registered-app-id", help="ChatGPT connection ID for a private web/desktop build")
    args = parser.parse_args()
    print(package_plugin(ROOT / "plugins/crrt", ROOT / "artifacts", args.registered_app_id))
