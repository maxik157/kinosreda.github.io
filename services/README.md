# rembg service

## Beer label recognition

`server.js` exposes `GET /beer-recognize/status` and `POST /beer-recognize`.
The POST body is a JPEG, PNG or WebP (max 3 MiB). The browser reduces photos
to 1200 pixels before sending them. Results contain only keys, names and IDs
from the existing `beerRating` database; full cards use the browser's current
Firebase records. Uncertain scans also return `ocrText` (up to 3000 characters)
so an unknown label can prefill the add-beer form. Uploaded photos and recognized
text are never saved or logged; a new record is saved only when the user submits
the add form.

Install the separate recognition runtime from the repository root:

```sh
python3 -m venv .venv-beer
.venv-beer/bin/python -m pip install -r services/beer-recognition-requirements.txt
```

For OCR on Linux, install Tesseract with English and Russian language data
(`apt-get install tesseract-ocr tesseract-ocr-eng tesseract-ocr-rus`). On macOS,
either use Tesseract or compile the native Vision helper:

```sh
swiftc -O services/beer_label_ocr.swift -o .venv-beer/bin/beer-label-ocr
```

Run `node server.js`, then open `http://127.0.0.1:8090/beer-shelf.html`.
The persistent worker warms the reference index at startup, downloads at most
four references concurrently, and refreshes the database every minute. Reference
features are cached in SQLite; scans have priority over background indexing.
Visual matching uses SIFT plus a perspective transform check. OCR is a fallback.
Uncertain matches are shown as choices; unknown labels are never automatically
mapped to the nearest beer. A first run needs time to download the reference
photos. Network transfer, camera quality and OCR affect total scan latency;
the measured warm visual lookup time alone is not an end-to-end guarantee.

Configuration:

- `BEER_RECOGNITION_PYTHON`: alternative Python executable.
- `BEER_RECOGNITION_DATABASE_URL`: server-controlled Firebase catalog URL.
- `BEER_RECOGNITION_CACHE`: SQLite reference cache path (default `/tmp/kinosreda-beer-features.sqlite`).
- `BEER_TESSERACT_BIN`, `BEER_NATIVE_OCR`: alternative native OCR executable paths.
- `window.BEER_RECOGNITION_API_BASE`: browser API origin; localhost uses the
  local server, production defaults to the existing realtime server.

For production, deploy the new server/worker files and install this runtime on
the realtime server alongside the frontend files. The existing static hosting
alone cannot run recognition. The shelf iframe allows camera access; browsers
require HTTPS in production or localhost during development.

Name-based form autofill uses `GET /beer-data-search` on the realtime server in
production and the local origin in development. `window.BEER_DATA_API_BASE` can
override that address. Both the shelf and table load `beer-data-autofill.js`;
publish `beer-form.css` alongside the updated frontend files. After updating
the Python worker on the realtime server, restart Node to return OCR text for
unknown labels.

Recognition tests:

```sh
.venv-beer/bin/python -m pip install pytest
.venv-beer/bin/python -m pytest tests/test_beer_recognition.py -q
node --test tests/beer-recognition.test.js
```

## Background removal

An isolated FastAPI service exposing `POST /remove-bg` for background removal.

Production Nginx owns the CORS policy for `/remove-bg`, including preflight,
upstream failures and its own 413/502/504 responses. A `map` at HTTP scope is
intentional: location rewrite variables are not initialized when Nginx rejects
a body as too large. Upstream CORS headers are hidden to prevent duplicates.
Only the listed site origins and local development origins receive access.
The 21 MiB JSON limit accommodates a 15 MiB image after base64 expansion.

`kinosreda-rembg.service` starts even if optional swap preparation fails.
`ensure_rembg_swap.sh` initializes compressed swap without resetting the device
during boot or disabling active swap during upgrades. The health timer checks
the worker every minute and restores an inactive or unresponsive service.
Use `scripts/realtime/install_rembg.sh` to install these units together.

Regression checks (the Nginx suite uses isolated loopback ports):

```sh
python3 -m unittest discover -s tests -p test_rembg_nginx.py -v
python3 scripts/realtime/verify_rembg.py
```

The first command requires Nginx. It tests success, 400/413/422/500/503 responses,
gateway disconnects, gateway timeouts, oversized bodies, preflight independence
and rejection of untrusted origins. The second checks the published endpoint
without loading an inference model or uploading photographs, and runs after
installation reloads Nginx.

## Runtime

Requires-Python: >=3.11

Install runtime dependencies with:

```sh
python -m pip install -r services/rembg-requirements.txt
```

Run the service with:

```sh
uvicorn services.rembg_service:app --host 127.0.0.1 --port 8787
```

## Tests

Install test dependencies with:

```sh
python -m pip install -r services/rembg-test-requirements.txt
```

Then run:

```sh
python -m pytest tests/test_rembg_service.py -q
```
