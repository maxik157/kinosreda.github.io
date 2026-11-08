from io import BytesIO
import base64
import json
import re
import requests

from fastapi import FastAPI, Response, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

from withoutbg import WithoutBG


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


model = WithoutBG.opensource()
POSTIMAGES_API_ENDPOINT = "https://api.imageban.ru/v1"
POSTIMAGES_API_KEY = "oJrs5gqThbiY2Tl1p7m85Nb5dW2fwshD1eK"


def extract_image_link(payload, raw_text):
    if isinstance(payload, dict):
        for key in (
            "url",
            "link",
            "direct_url",
            "image_url",
        ):
            if payload.get(key):
                return payload[key]
        for nested_key in ("data", "result", "image"):
            nested = payload.get(nested_key)
            if isinstance(nested, list) and nested:
                first = nested[0]
                if isinstance(first, dict):
                    for key in ("link", "short_link", "url", "direct_url", "image_url"):
                        if first.get(key):
                            return first[key]
            if isinstance(nested, dict):
                for key in ("url", "link", "direct_url", "image_url", "display_url"):
                    if nested.get(key):
                        return nested[key]
                image = nested.get("image")
                if isinstance(image, dict):
                    for key in ("url", "display_url"):
                        if image.get(key):
                            return image[key]
    if raw_text:
        match = re.search(r"https?://[^\s\"']+", raw_text)
        if match:
            return match.group(0)
    return ""


@app.post("/remove-bg")
def remove_bg(payload: RemoveRequest):
    raw = base64.b64decode(payload.image_base64)
    with Image.open(BytesIO(raw)) as img:
        result = model.remove_background(img)
    buffer = BytesIO()
    result.save(buffer, format="PNG")
    result_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return {"result_base64": result_b64}


@app.get("/fetch-image")
def fetch_image_get(url: str = ""):
    clean = (url or "").strip()
    if not clean or not (clean.startswith("http://") or clean.startswith("https://")):
        return Response(content=b"", status_code=400)
    resp = requests.get(clean, timeout=15)
    resp.raise_for_status()
    content_type = resp.headers.get("content-type") or "image/png"
    return Response(content=resp.content, media_type=content_type)


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


@app.post("/upload-image")
async def upload_image(
    image: UploadFile = File(...),
    key: str | None = Form(None),
):
    api_key = (key or "").strip() or POSTIMAGES_API_KEY
    if not api_key:
        return {"error": "postimages_key_missing"}
    content = await image.read()
    if not content:
        return {"error": "postimages_invalid"}
    files = {"image": (image.filename or "image.png", content, image.content_type or "image/png")}
    headers = {"Authorization": f"Bearer {api_key}"}
    resp = requests.post(POSTIMAGES_API_ENDPOINT, headers=headers, files=files, timeout=30)
    raw_text = resp.text or ""
    payload = None
    try:
        payload = resp.json()
    except Exception:
        try:
            payload = json.loads(raw_text)
        except Exception:
            payload = None
    link = extract_image_link(payload, raw_text)
    if not link:
        return {"error": "postimages_no_url", "raw": raw_text[:500]}
    return {"url": link}
