"""Upload release artifacts to Volcengine TOS (cn-beijing).

Usage:
  python scripts/upload-tos.py --channel release --dist-dir dist/
  python scripts/upload-tos.py --channel nightly --dist-dir dist/

Environment variables:
  VOLC_ACCESS_KEY  - Volcengine access key ID
  VOLC_SECRET_KEY  - Volcengine secret access key

Uploads .dmg, .zip, .blockmap, and latest-mac*.yml files to:
  releases/<channel>/
"""

import argparse
import glob
import os
import sys


def main():
    parser = argparse.ArgumentParser(description="Upload artifacts to Volcengine TOS")
    parser.add_argument(
        "--channel",
        required=True,
        choices=["release", "nightly"],
        help="Release channel (determines TOS prefix)",
    )
    parser.add_argument(
        "--dist-dir", required=True, help="Directory containing build artifacts"
    )
    args = parser.parse_args()

    ak = os.environ.get("VOLC_ACCESS_KEY")
    sk = os.environ.get("VOLC_SECRET_KEY")
    if not ak or not sk:
        print("Error: VOLC_ACCESS_KEY and VOLC_SECRET_KEY must be set", file=sys.stderr)
        sys.exit(1)

    try:
        import tos
    except ImportError:
        print("Error: 'tos' package not installed. Run: pip install tos", file=sys.stderr)
        sys.exit(1)

    client = tos.TosClientV2(
        ak=ak,
        sk=sk,
        endpoint="tos-cn-beijing.volces.com",
        region="cn-beijing",
    )

    bucket = "ma-agent-releases"
    prefix = f"releases/{args.channel}"

    # Patterns for artifacts to upload
    # electron-builder may emit channel-specific yml (e.g. nightly-mac.yml)
    patterns = ["*.dmg", "*.zip", "*.blockmap", "*-mac*.yml"]
    files_to_upload = []
    for pattern in patterns:
        files_to_upload.extend(glob.glob(os.path.join(args.dist_dir, pattern)))

    if not files_to_upload:
        print(f"Error: No artifacts found in {args.dist_dir}", file=sys.stderr)
        sys.exit(1)

    # Verify updater metadata yml is present
    yml_files = [f for f in files_to_upload if f.endswith(".yml")]
    if not yml_files:
        print("Error: No updater metadata (*-mac*.yml) found in artifacts", file=sys.stderr)
        sys.exit(1)

    print(f"Uploading {len(files_to_upload)} file(s) to tos://{bucket}/{prefix}/")

    for filepath in files_to_upload:
        filename = os.path.basename(filepath)
        key = f"{prefix}/{filename}"
        size_mb = os.path.getsize(filepath) / (1024 * 1024)
        print(f"  Uploading {filename} ({size_mb:.1f} MB) -> {key}")
        client.put_object_from_file(bucket, key, filepath)
        print(f"  Done: {filename}")

    print(f"\nAll {len(files_to_upload)} file(s) uploaded successfully.")
    print(f"URL base: https://ma-agent-releases.tos-cn-beijing.volces.com/{prefix}/")


if __name__ == "__main__":
    main()
