import zipfile
import os
import subprocess
import shutil
import sys

def package():
    apk_path = "app/frontend/android/app/build/outputs/apk/debug/app-debug.apk"
    bundle_path = "app/frontend/android/app/src/main/assets/index.android.bundle"
    output_apk = "app/frontend/android/app/build/outputs/apk/debug/app-debug-offline.apk"
    
    if not os.path.exists(apk_path):
        print(f"Error: {apk_path} not found")
        sys.exit(1)
        
    if not os.path.exists(bundle_path):
        print(f"Error: {bundle_path} not found")
        sys.exit(1)

    print(f"Source APK size: {os.path.getsize(apk_path)} bytes")
    print(f"Bundle size: {os.path.getsize(bundle_path)} bytes")

    # Read existing APK
    with zipfile.ZipFile(apk_path, 'r') as zin:
        entries = zin.namelist()
        has_bundle = "assets/index.android.bundle" in entries
        print(f"Existing APK has assets/index.android.bundle: {has_bundle}")
        
        # We will write new apk
        with zipfile.ZipFile(output_apk, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename.startswith("META-INF/") and (item.filename.endswith(".SF") or item.filename.endswith(".RSA") or item.filename.endswith(".MF")):
                    # strip signature so apksigner can cleanly resign
                    continue
                if item.filename == "assets/index.android.bundle":
                    continue
                zout.writestr(item, zin.read(item.filename))
            
            # Now add fresh bundle
            zout.write(bundle_path, "assets/index.android.bundle")
            print("Successfully injected assets/index.android.bundle into output APK")

    print(f"Offline APK created: {output_apk} (size: {os.path.getsize(output_apk)} bytes)")

    # Find apksigner
    apksigner_candidates = [
        r"C:\Android\Sdk\build-tools\36.0.0\apksigner.bat",
        r"C:\Android\Sdk\build-tools\35.0.0\apksigner.bat",
        r"C:\Android\Sdk\build-tools\34.0.0\apksigner.bat",
    ]
    apksigner = None
    for cand in apksigner_candidates:
        if os.path.exists(cand):
            apksigner = cand
            break

    keystore_candidates = [
        os.path.expanduser("~/.android/debug.keystore"),
        "app/frontend/android/app/debug.keystore",
    ]
    keystore = None
    for cand in keystore_candidates:
        if os.path.exists(cand):
            keystore = cand
            break

    if apksigner and keystore:
        print(f"Signing with {apksigner} using {keystore}...")
        cmd = [
            apksigner, "sign",
            "--ks", keystore,
            "--ks-key-alias", "androiddebugkey",
            "--ks-pass", "pass:android",
            "--key-pass", "pass:android",
            output_apk
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        print("apksigner stdout:", res.stdout)
        print("apksigner stderr:", res.stderr)
        if res.returncode == 0:
            print("APK signed successfully!")
        else:
            print(f"apksigner failed with returncode {res.returncode}")
    else:
        print("Warning: Could not find apksigner or keystore, skipping signing step.")

if __name__ == "__main__":
    package()
