"""HTTP service for removing an image background with rembg."""

import base64
import binascii
import hashlib
import os
import threading
from collections import OrderedDict
from io import BytesIO
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image, ImageOps, UnidentifiedImageError


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=(
        r"^(?:https://(?:kinosreda\.github\.io|kinosreda\.(?:рф|xn--p1ai))"
        r"|http://(?:localhost|127\.0\.0\.1):\d+)$"
    ),
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["*"],
)

MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
REMBG_MODEL = os.environ.get("REMBG_MODEL", "u2net")
REMBG_QUEUE_TIMEOUT = max(0.0, float(os.environ.get("REMBG_QUEUE_TIMEOUT", "8")))


class RemoveBackgroundRequest(BaseModel):
    image_base64: str


_session: Any | None = None
_session_lock = threading.Lock()
_inference_semaphore = threading.BoundedSemaphore(1)
_result_cache: OrderedDict[str, str] = OrderedDict()
_result_cache_lock = threading.Lock()
REMBG_RESULT_CACHE_SIZE = max(1, int(os.environ.get("REMBG_RESULT_CACHE_SIZE", "24")))
REMBG_RESULT_CACHE_BYTES = max(1, int(os.environ.get("REMBG_RESULT_CACHE_BYTES", str(32 * 1024 * 1024))))


class ImageTooLargeError(ValueError):
    """Raised when an image exceeds this service's resource limits."""


class BackgroundRemovalBusyError(RuntimeError):
    """Raised when the single inference slot cannot be reached promptly."""


def get_cached_result(cache_key: str) -> str | None:
    with _result_cache_lock:
        value = _result_cache.get(cache_key)
        if value is not None:
            _result_cache.move_to_end(cache_key)
        return value


def cache_result(cache_key: str, value: str) -> None:
    with _result_cache_lock:
        _result_cache[cache_key] = value
        _result_cache.move_to_end(cache_key)
        while len(_result_cache) > REMBG_RESULT_CACHE_SIZE or sum(map(len, _result_cache.values())) > REMBG_RESULT_CACHE_BYTES:
            _result_cache.popitem(last=False)


def get_session() -> Any:
    """Create the rembg session only when the first image is processed."""
    global _session
    if _session is None:
        with _session_lock:
            if _session is None:
                from rembg import new_session

                _session = new_session(REMBG_MODEL)
    return _session


def remove_background(image: Image.Image) -> Image.Image:
    """Run rembg while keeping its import and model initialization lazy."""
    from rembg import remove

    session = get_session()
    if not _inference_semaphore.acquire(timeout=REMBG_QUEUE_TIMEOUT):
        raise BackgroundRemovalBusyError
    try:
        return remove(image, session=session)
    finally:
        _inference_semaphore.release()


def decode_image(image_base64: str) -> Image.Image:
    """Decode and fully validate a base64-encoded image."""
    try:
        raw_image = base64.b64decode(image_base64, validate=True)
        if len(raw_image) > MAX_IMAGE_BYTES:
            raise ImageTooLargeError
        with Image.open(BytesIO(raw_image)) as image:
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ImageTooLargeError
            image.load()
            return ImageOps.exif_transpose(image).convert("RGBA")
    except ImageTooLargeError:
        raise
    except Image.DecompressionBombError as exc:
        raise ImageTooLargeError from exc
    except (binascii.Error, SyntaxError, ValueError, OSError, UnidentifiedImageError) as exc:
        raise ValueError("invalid_image") from exc


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {"ok": True, "model": REMBG_MODEL, "ready": _session is not None}


@app.post("/remove-bg")
def remove_bg(payload: RemoveBackgroundRequest) -> dict[str, str]:
    cache_key = hashlib.sha256(payload.image_base64.encode("ascii", "ignore")).hexdigest()
    try:
        image = decode_image(payload.image_base64)
    except ImageTooLargeError as exc:
        raise HTTPException(status_code=413, detail="image_too_large") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid_image") from exc
    use_cache = image.width * image.height > 4096
    cached = get_cached_result(cache_key) if use_cache else None
    if cached:
        return {"result_base64": cached}

    try:
        result = remove_background(image).convert("RGBA")
        buffer = BytesIO()
        result.save(buffer, format="PNG", compress_level=3)
    except BackgroundRemovalBusyError as exc:
        raise HTTPException(
            status_code=503,
            detail="background_removal_busy",
            headers={"Retry-After": "2"},
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="background_removal_failed") from exc

    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    if use_cache:
        cache_result(cache_key, encoded)
    return {"result_base64": encoded}
