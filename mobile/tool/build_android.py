"""Build small, release-mode Android APKs for direct device testing."""
from pathlib import Path
import os
import shutil
import subprocess
import zipfile

command = [
    "flutter", "build", "apk", "--release", "--split-per-abi",
    "--split-debug-info=build/android-symbols", "--no-pub",
    "--dart-define=API_BASE_URL=https://api-project.maxkabechani.dev",
]
if os.environ.get("GITHUB_RUN_NUMBER"):
    command.append("--build-number=" + os.environ["GITHUB_RUN_NUMBER"])
subprocess.run(command, check=True)

output = Path("build/app/outputs/flutter-apk")
packages = {
    "arm64-v8a": "Smart-Access.apk",
    "armeabi-v7a": "Smart-Access-armeabi-v7a.apk",
    "x86_64": "Smart-Access-x86_64.apk",
}
report = [
    "## Android release APK sizes", "",
    "The default Smart-Access.apk targets ARM64 phones. "
    "The armeabi-v7a build is for older 32-bit phones; x86_64 is for emulators.", "",
    "| APK | Architecture | Download size |",
    "| --- | --- | ---: |",
]
for abi, name in packages.items():
    source = output / f"app-{abi}-release.apk"
    with zipfile.ZipFile(source) as apk:
        entries = apk.namelist()
        architectures = {p.split("/")[1] for p in entries if p.startswith("lib/") and p.endswith(".so")}
        if architectures != {abi}:
            raise SystemExit(f"{source}: expected only {abi}, found {architectures}")
        if f"lib/{abi}/libapp.so" not in entries or any(p.endswith("/kernel_blob.bin") for p in entries):
            raise SystemExit(f"{source}: expected a release AOT build without the debug kernel")
    target = output / name
    shutil.copy2(source, target)
    size = target.stat().st_size
    report.append(f"| {name} | {abi} | {size / 1_000_000:.2f} MB ({size:,} bytes) |")

summary = "\n".join(report) + "\n"
print(summary)
if os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as stream:
        stream.write(summary)
