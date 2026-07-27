import os
import tempfile
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from google.cloud import storage
from pydantic import BaseModel, Field

MODEL_ID = os.getenv("MODEL_ID", "iic/emotion2vec_plus_base")
MODEL_HUB = os.getenv("MODEL_HUB", "hf")
LABELS = [
    "angry",
    "disgusted",
    "fearful",
    "happy",
    "neutral",
    "other",
    "sad",
    "surprised",
    "unknown",
]

app = FastAPI(title="Adventure Diary emotion2vec service", version="1.0.0")
storage_client = storage.Client()
model: Any | None = None


class AnalyzeRequest(BaseModel):
    bucket: str = Field(min_length=3, max_length=222)
    objectPath: str = Field(min_length=8, max_length=1024)


def get_model() -> Any:
    global model
    if model is None:
        from funasr import AutoModel

        model = AutoModel(model=MODEL_ID, hub=MODEL_HUB)
    return model


def normalize_result(result: Any) -> list[dict[str, float | str]]:
    if isinstance(result, list):
        if not result:
            raise ValueError("emotion2vec returned no results")
        result = result[0]
    if not isinstance(result, dict):
        raise ValueError("emotion2vec returned an unexpected result")

    labels = result.get("labels") or LABELS
    raw_scores = result.get("scores")
    if raw_scores is None:
        raise ValueError("emotion2vec did not return scores")
    if raw_scores and isinstance(raw_scores[0], list):
        raw_scores = raw_scores[0]

    scores = [
        {"label": str(label).lower(), "score": float(score)}
        for label, score in zip(labels, raw_scores, strict=False)
    ]
    if len(scores) != 9:
        raise ValueError(f"expected 9 emotion scores, received {len(scores)}")
    return sorted(scores, key=lambda item: item["score"], reverse=True)


@app.on_event("startup")
def warm_model() -> None:
    get_model()


@app.get("/healthz")
def health() -> dict[str, str]:
    return {"status": "ok", "modelVersion": MODEL_ID}


@app.post("/v1/analyze")
def analyze(payload: AnalyzeRequest) -> dict[str, Any]:
    if not payload.objectPath.startswith("audio/") or ".." in payload.objectPath:
        raise HTTPException(status_code=400, detail="invalid audio object path")

    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="emotion2vec-") as directory:
        local_path = Path(directory) / "attempt.wav"
        try:
            storage_client.bucket(payload.bucket).blob(
                payload.objectPath
            ).download_to_filename(local_path)
            result = get_model().generate(
                input=str(local_path),
                output_dir=None,
                granularity="utterance",
                extract_embedding=False,
            )
            scores = normalize_result(result)
        except Exception as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    return {
        "scores": scores,
        "modelVersion": MODEL_ID,
        "inferenceMs": round((time.perf_counter() - started) * 1000),
    }
