import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location(
    "package_plugin", Path(__file__).with_name("package-chatgpt-plugin.py")
)
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class PluginArchiveTests(unittest.TestCase):
    def fixture(self, root):
        source = root / "plugin"
        for name in package.FILES:
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture", encoding="utf-8")
        (source / "plugin.json").write_text(json.dumps({"version": "0.1.0"}))
        return source

    def test_archive_is_reproducible_and_excludes_secrets_and_review_notes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            (source / ".env").write_text("SECRET=private")
            (source / "review.md").write_text("private reviewer account")
            target = package.package_plugin(source, root / "output")
            original = target.read_bytes()
            self.assertEqual(package.package_plugin(source, root / "output").read_bytes(), original)
            with zipfile.ZipFile(target) as archive:
                self.assertEqual(set(archive.namelist()), set(package.FILES))
                self.assertIsNone(archive.testzip())
                for name in package.FILES:
                    self.assertEqual(archive.read(name), (source / name).read_bytes())

    def test_missing_file_does_not_produce_an_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            (source / "mcp.json").unlink()
            with self.assertRaisesRegex(ValueError, "Missing package file"):
                package.package_plugin(source, root / "output")

    def test_registered_build_routes_web_and_desktop_to_the_same_connection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            openai = {"interface": {"displayName": "CRRT"},
                      "onboardingSkill": "./skills/feedback-to-fix/SKILL.md"}
            (source / "plugin.json").write_text(json.dumps({
                "name": "crrt", "version": "0.2.2",
                "extensions": {"com.openai": openai},
            }))
            (source / "mcp.json").write_text(json.dumps({
                "mcpServers": {"crrt": {"type": "streamable-http",
                                          "url": "https://crrt.ai/api/mcp/v1"}},
            }))
            (source / ".env").write_text("SECRET=private")
            original = (source / "plugin.json").read_bytes()
            target = package.package_plugin(source, root / "output", "plugin_asdk_app_test")
            with zipfile.ZipFile(target) as archive:
                self.assertEqual(set(archive.namelist()), {
                    ".codex-plugin/plugin.json", ".mcp.json", ".app.json",
                    "assets/icon.png", "skills/feedback-to-fix/SKILL.md",
                })
                manifest = json.loads(archive.read(".codex-plugin/plugin.json"))
                self.assertEqual(manifest["apps"], "./.app.json")
                self.assertEqual(manifest["mcpServers"], "./.mcp.json")
                self.assertEqual(manifest["interface"], openai["interface"])
                self.assertEqual(manifest["extensions"]["com.openai"]["onboardingSkill"],
                                 openai["onboardingSkill"])
                self.assertEqual(json.loads(archive.read(".app.json")), {
                    "apps": {"crrt": {"id": "asdk_app_test", "required": True}},
                })
                self.assertEqual(json.loads(archive.read(".mcp.json")), {
                    "mcpServers": {"crrt": {"url": "https://crrt.ai/api/mcp/v1"}},
                })
            self.assertEqual(target.name, "crrt-chatgpt-0.2.2-registered.zip")
            self.assertEqual((source / "plugin.json").read_bytes(), original)
            registered_original = target.read_bytes()
            self.assertEqual(package.package_plugin(source, root / "output", "asdk_app_test").read_bytes(),
                             registered_original)

    def test_registered_build_rejects_credentials_and_non_app_identifiers(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            for invalid in ("", "https://example.com/mcp", "Bearer secret", "asdk_app_../secret"):
                with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, "ChatGPT app ID"):
                    package.package_plugin(source, root / "output", invalid)
            self.assertFalse((root / "output").exists())

    def test_symlink_is_rejected_before_reading_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            with patch.object(Path, "is_symlink", return_value=True):
                with self.assertRaisesRegex(ValueError, "Symlink not allowed"):
                    package.package_plugin(source, root / "output")

    def test_version_cannot_escape_the_artifact_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            (source / "plugin.json").write_text(json.dumps({"version": "../../private"}))
            with self.assertRaisesRegex(ValueError, "major.minor.patch"):
                package.package_plugin(source, root / "output")
            self.assertFalse((root / "output").exists())

    def test_version_cannot_escape_output_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root)
            (source / "plugin.json").write_text(json.dumps({"version": "../../outside"}))
            with self.assertRaisesRegex(ValueError, "version"):
                package.package_plugin(source, root / "output")


if __name__ == "__main__":
    unittest.main()
