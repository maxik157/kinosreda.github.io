# rembg service

An isolated FastAPI service exposing `POST /remove-bg` for background removal.

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
