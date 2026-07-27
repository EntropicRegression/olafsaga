import csv
import io
import json
import os
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from google.cloud import firestore, storage


def json_default(value: Any) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def main() -> None:
    export_id = os.environ["EXPORT_ID"]
    export_prefix = os.environ.get("EXPORT_PREFIX", f"exports/{export_id}")
    bucket_name = os.environ["STORAGE_BUCKET"]
    if not export_id.startswith("export-") or ".." in export_prefix:
        raise ValueError("invalid export parameters")

    db = firestore.Client()
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    export_ref = db.collection("exports").document(export_id)
    export_ref.set(
        {
            "status": "creating_zip",
            "wavZipStatus": "running",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        },
        merge=True,
    )

    attempts: list[dict[str, Any]] = []
    for snapshot in db.collection_group("attempts").stream():
        row = snapshot.to_dict()
        row["id"] = snapshot.id
        row["sessionId"] = snapshot.reference.parent.parent.id
        attempts.append(row)

    manifest_fields = [
        "id",
        "sessionId",
        "participantCode",
        "classId",
        "group",
        "nodeId",
        "round",
        "attemptNumber",
        "status",
        "decision",
        "transcript",
        "storagePath",
        "createdAt",
    ]

    with tempfile.TemporaryDirectory(prefix="wav-export-") as directory:
        zip_path = Path(directory) / "audio.zip"
        with zipfile.ZipFile(
            zip_path, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True
        ) as archive:
            manifest_buffer = io.StringIO()
            writer = csv.DictWriter(
                manifest_buffer,
                fieldnames=manifest_fields,
                extrasaction="ignore",
            )
            writer.writeheader()
            writer.writerows(attempts)
            archive.writestr("manifest.csv", manifest_buffer.getvalue())
            archive.writestr(
                "manifest.json",
                json.dumps(
                    attempts,
                    ensure_ascii=False,
                    indent=2,
                    default=json_default,
                ),
            )

            for attempt in attempts:
                object_path = attempt.get("storagePath")
                if not isinstance(object_path, str) or not object_path.startswith(
                    "audio/"
                ):
                    continue
                blob = bucket.blob(object_path)
                if not blob.exists():
                    continue
                archive_name = (
                    f"wav/{attempt.get('participantCode', 'unknown')}/"
                    f"{attempt['sessionId']}/{attempt['id']}.wav"
                )
                with archive.open(archive_name, "w") as destination:
                    blob.download_to_file(destination)

        zip_object = f"{export_prefix}/audio.zip"
        bucket.blob(zip_object).upload_from_filename(
            zip_path, content_type="application/zip"
        )

    export_ref.set(
        {
            "status": "ready",
            "wavZipStatus": "ready",
            "wavZipPath": zip_object,
            "wavCount": len(
                [
                    row
                    for row in attempts
                    if isinstance(row.get("storagePath"), str)
                ]
            ),
            "completedAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        },
        merge=True,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        export_id = os.getenv("EXPORT_ID")
        if export_id:
            firestore.Client().collection("exports").document(export_id).set(
                {
                    "status": "data_ready",
                    "wavZipStatus": "error",
                    "wavZipError": str(error),
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                },
                merge=True,
            )
        raise
