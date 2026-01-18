from io import BytesIO
import base64
import os
import requests

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from withoutbg import WithoutBG

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
os.environ.setdefault("ORT_DISABLE_GPU", "1")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RemoveRequest(BaseModel):
    image_base64: str


class FetchRequest(BaseModel):
    url: str


_model = None


def get_model():
    global _model
    if _model is None:
        _model = WithoutBG.opensource()
    return _model


@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/remove-bg")
def remove_bg(payload: RemoveRequest):
    raw = base64.b64decode(payload.image_base64)
    with Image.open(BytesIO(raw)) as img:
        result = get_model().remove_background(img)
    buffer = BytesIO()
    result.save(buffer, format="PNG")
    result_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return {"result_base64": result_b64}


@app.post("/fetch-image")
def fetch_image(payload: FetchRequest):
    url = (payload.url or "").strip()
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        return {"error": "invalid_url"}
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    with Image.open(BytesIO(resp.content)) as img:
        buffer = BytesIO()
        img.save(buffer, format="PNG")
    result_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return {"result_base64": result_b64}


__all__ = ["app"]
