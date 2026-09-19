import os
import sys
import subprocess
import shutil

def build_standalone_sidecar():
    print("=" * 70)
    print("BATCHFETCH — COMPILING STANDALONE INFERENCE SIDECAR (PyInstaller)")
    print("=" * 70)

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    sidecar_script = os.path.join(repo_root, "src", "main", "ai", "sidecar", "inferenceWorker.py")
    output_dir = os.path.join(repo_root, "resources", "bin")
    build_dir = os.path.join(repo_root, "build", "pyinstaller")

    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(build_dir, exist_ok=True)

    # PyInstaller command: compile to onedir for fast zero-overhead startup
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onedir",
        "--name",
        "inferenceWorker",
        "--distpath",
        output_dir,
        "--workpath",
        build_dir,
        "--clean",
        sidecar_script
    ]

    print(f"Running command: {' '.join(cmd)}")
    subprocess.check_call(cmd, cwd=repo_root)

    target_exe = os.path.join(output_dir, "inferenceWorker", "inferenceWorker.exe")
    if os.path.exists(target_exe):
        size_mb = os.path.getsize(target_exe) / (1024 * 1024)
        print(f"\n[SUCCESS] Standalone executable compiled: {target_exe} ({size_mb:.2f} MB)")
        
        # Also create a launcher or copy to resources/bin/inferenceWorker.exe if preferred
        direct_exe = os.path.join(output_dir, "inferenceWorker.exe")
        print(f"Standalone deployment ready at {target_exe}")
    else:
        print(f"\n[ERROR] Target binary not found at {target_exe}")
        sys.exit(1)

if __name__ == "__main__":
    build_standalone_sidecar()
