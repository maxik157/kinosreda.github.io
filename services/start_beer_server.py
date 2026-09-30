"""Start the local server with the existing image hosting configuration."""
import ast
import os
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
environment = os.environ.copy()
if not environment.get("SERPER_API_KEY"):
    try:
        remote = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5",
             "root@realtime.xn--80ahcljthqi.xn--p1ai",
             "cat /etc/default/kinosreda-realtime"],
            capture_output=True, text=True, timeout=10, check=True,
        )
        for line in remote.stdout.splitlines():
            key, separator, value = line.strip().partition("=")
            if separator and key == "SERPER_API_KEY":
                environment[key] = value.strip().strip("\"'")
    except (OSError, subprocess.SubprocessError):
        pass
legacy_config = root / "withoutbg_local_server.py"
if legacy_config.exists():
    # Read constant configuration without importing the old neural network.
    tree = ast.parse(legacy_config.read_text(encoding="utf-8"))
    for node in tree.body:
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Constant):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id in (
                "POSTIMAGES_API_KEY", "POSTIMAGES_API_ENDPOINT"
            ) and not environment.get(target.id):
                environment[target.id] = str(node.value.value)
os.chdir(root)
os.execvpe("node", ["node", "server.js"], environment)
