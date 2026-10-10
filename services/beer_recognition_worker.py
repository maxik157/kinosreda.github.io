"""Persistent label matcher. Photos are processed in memory and never saved.

SIFT + geometric verification handles crop/rotation/perspective; optional native
Tesseract reads labels when visual evidence is weak. JSON-lines IPC on stdin/stdout.
"""
import base64
import io
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

import cv2
import numpy as np

cv2.setNumThreads(2)
MAX_PIXELS = 20_000_000
STOP_WORDS = {'beer', 'bier', 'пиво', 'brewery', 'brewing', 'premium'}


def tokens(value):
    value = unicodedata.normalize('NFKD', str(value or '').lower().replace('ё', 'е'))
    value = ''.join(c for c in value if not unicodedata.combining(c))
    return [t for t in re.findall(r'[^\W_]+(?:[.,]\d+)?', value) if len(t) > 1 and t not in STOP_WORDS]


def rank_text(text, catalog):
    words = tokens(text)
    results = []
    for key, record in catalog.items():
        name = tokens(record.get('name'))
        if not name:
            continue
        scores = [max((SequenceMatcher(None, term, word).ratio() if min(len(term), len(word)) >= 4 else float(term == word)
                       for word in words), default=0) for term in name]
        # Every variant word matters: a brand alone must never select a subtype.
        coverage = sum(s >= .84 for s in scores) / len(name)
        if coverage < .5 or max(scores, default=0) < .84:
            continue
        exact = all(s >= .92 for s in scores)
        score = coverage * .7 + sum(scores) / len(name) * .3
        results.append({'key': key, 'score': round(score, 4), 'exact': exact, 'method': 'text'})
    return sorted(results, key=lambda item: item['score'], reverse=True)[:5]


def decode_image(encoded):
    raw = base64.b64decode(encoded, validate=True)
    if len(raw) > 3 * 1024 * 1024:
        raise ValueError('image_too_large')
    image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None or image.shape[0] * image.shape[1] > MAX_PIXELS:
        raise ValueError('invalid_image')
    if image.ndim == 3 and image.shape[2] == 4:
        alpha = image[:, :, 3:4].astype(np.float32) / 255
        image = (image[:, :, :3] * alpha + 255 * (1 - alpha)).astype(np.uint8)
    if image.ndim == 3:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    scale = min(1, 1000 / max(image.shape))
    if scale < 1:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return image


class Matcher:
    def __init__(self, cache_path):
        self.sift = cv2.SIFT_create(nfeatures=600, contrastThreshold=.025)
        self.catalog = {}
        self.features = {}
        self.dirty = True
        self.flann = None
        self.owners = []
        self.cache = sqlite3.connect(cache_path)
        self.cache.execute('CREATE TABLE IF NOT EXISTS features (url TEXT PRIMARY KEY, data BLOB)')
        self.ocr = shutil.which(os.environ.get('BEER_TESSERACT_BIN', 'tesseract'))
        native_path = os.environ.get('BEER_NATIVE_OCR', str(Path(__file__).resolve().parents[1] / '.venv-beer/bin/beer-label-ocr'))
        self.native_ocr = native_path if sys.platform == 'darwin' and os.access(native_path, os.X_OK) else None
        self.languages = 'eng'
        if self.ocr:
            try:
                installed = subprocess.run([self.ocr, '--list-langs'], capture_output=True, timeout=3).stdout.decode()
                self.languages = '+'.join(lang for lang in ['eng', 'rus'] if re.search(rf'^{lang}$', installed, re.M)) or 'eng'
            except (OSError, subprocess.TimeoutExpired):
                self.ocr = None

    def describe(self, image):
        points, descriptors = self.sift.detectAndCompute(image, None)
        coords = np.array([p.pt for p in points], dtype=np.float32).reshape(-1, 2)
        return coords, descriptors

    def catalog_update(self, catalog):
        previous_features = dict(self.features)
        next_catalog = {str(key): record for key, record in catalog.items() if isinstance(record, dict) and record.get('name')}
        self.features = {key: value for key, value in self.features.items()
                         if key in next_catalog and self.catalog.get(key, {}).get('imageUrl') == next_catalog[key].get('imageUrl')}
        self.catalog = next_catalog
        missing = []
        for key, record in self.catalog.items():
            url = record.get('imageUrl')
            if not url or key in self.features:
                continue
            cached = self.cache.execute('SELECT data FROM features WHERE url=?', (url,)).fetchone()
            if cached:
                try:
                    with np.load(io.BytesIO(cached[0]), allow_pickle=False) as data:
                        self.features[key] = (data['points'], data['descriptors'])
                    continue
                except (ValueError, KeyError):
                    pass
            missing.append({'key': key, 'url': url})
        # Bound persistent storage; outdated URLs are no longer needed.
        urls = {str(r.get('imageUrl')) for r in self.catalog.values() if r.get('imageUrl')}
        for (url,) in self.cache.execute('SELECT url FROM features').fetchall():
            if url not in urls:
                self.cache.execute('DELETE FROM features WHERE url=?', (url,))
        self.cache.commit()
        if self.features.keys() != previous_features.keys() or any(
                value is not previous_features.get(key) for key, value in self.features.items()):
            self.dirty = True
        return {'missing': missing, 'catalogSize': len(self.catalog), 'indexed': len(self.features)}

    def index_image(self, key, encoded):
        if key not in self.catalog:
            return {}
        points, descriptors = self.describe(decode_image(encoded))
        if descriptors is None or len(points) < 8:
            return {'indexed': len(self.features)}
        self.features[key] = (points, descriptors)
        self.dirty = True
        data = io.BytesIO()
        np.savez_compressed(data, points=points, descriptors=descriptors)
        self.cache.execute('INSERT OR REPLACE INTO features VALUES (?,?)', (self.catalog[key]['imageUrl'], data.getvalue()))
        self.cache.commit()
        return {'indexed': len(self.features)}

    def rebuild(self):
        if not self.dirty:
            return
        self.flann = cv2.FlannBasedMatcher(dict(algorithm=1, trees=4), dict(checks=48))
        self.owners = []
        descriptors = []
        unique = {}
        for key, (_, values) in self.features.items():
            fingerprint = hashlib.sha256(values.tobytes()).digest()
            if fingerprint in unique:
                offset = unique[fingerprint]
                for index in range(len(values)):
                    self.owners[offset + index][0].append(key)
                continue
            unique[fingerprint] = len(self.owners)
            self.owners.extend(([key], i) for i in range(len(values)))
            descriptors.append(values)
        if descriptors:
            self.flann.add([np.concatenate(descriptors)])
            self.flann.train()
        self.dirty = False

    def visual(self, image):
        self.rebuild()
        points, descriptors = self.describe(image)
        if descriptors is None or len(self.owners) < 2:
            return []
        grouped = defaultdict(list)
        for neighbors in self.flann.knnMatch(descriptors, k=2):
            if len(neighbors) == 2 and neighbors[0].distance < .73 * neighbors[1].distance:
                match = neighbors[0]
                keys, index = self.owners[match.trainIdx]
                for key in keys:
                    grouped[key].append((match.queryIdx, index))
        results = []
        for key in sorted(grouped, key=lambda k: len(grouped[k]), reverse=True)[:8]:
            pairs = grouped[key]
            if len(pairs) < 8:
                continue
            reference = self.features[key][0]
            src = np.float32([reference[j] for _, j in pairs])
            dst = np.float32([points[i] for i, _ in pairs])
            matrix, mask = cv2.findHomography(src, dst, cv2.RANSAC, 4)
            if matrix is None or mask is None:
                continue
            count = int(mask.sum())
            ratio = count / len(pairs)
            inlier_src = src[mask.ravel().astype(bool)]
            inlier_dst = dst[mask.ravel().astype(bool)]
            # Reject repeated logos/text confined to a tiny patch.
            area = cv2.contourArea(cv2.convexHull(inlier_src)) if count >= 3 else 0
            span = np.ptp(reference, axis=0)
            coverage = area / max(1, float(span[0] * span[1]))
            dest_area = cv2.contourArea(cv2.convexHull(inlier_dst)) if count >= 3 else 0
            if count < 8 or ratio < .45 or coverage < .015 or dest_area < 80:
                continue
            score = min(.99, .45 + min(count, 50) / 100 + min(coverage, .2) * .2)
            results.append({'key': key, 'score': round(score, 4), 'inliers': count,
                            'strong': count >= 18 and ratio >= .6 and coverage >= .045, 'method': 'visual'})
        return sorted(results, key=lambda item: item['score'], reverse=True)[:5]

    def read_text(self, image):
        if not self.ocr and not self.native_ocr:
            return ''
        png = cv2.imencode('.png', image)[1].tobytes()
        try:
            command = [self.native_ocr] if self.native_ocr else [self.ocr, 'stdin', 'stdout', '-l', self.languages, '--psm', '11']
            result = subprocess.run(command,
                                    input=png, capture_output=True, timeout=3)
            return result.stdout.decode('utf-8', errors='replace')[:3000] if result.returncode == 0 else ''
        except (OSError, subprocess.TimeoutExpired):
            return ''

    def recognize(self, encoded):
        started = time.perf_counter()
        image = decode_image(encoded)
        matches = self.visual(image)
        ocr_text = ''
        confident = bool(matches and matches[0]['strong'] and
                         (len(matches) == 1 or matches[0]['score'] - matches[1]['score'] >= .12))
        if not confident:
            ocr_text = self.read_text(image)
            text_matches = rank_text(ocr_text, self.catalog)
            by_key = {item['key']: item for item in matches}
            for item in text_matches:
                if item['key'] in by_key:
                    visual = by_key[item['key']]
                    visual['score'] = min(.99, visual['score'] + .06 * item['score'])
                    visual['strong'] = visual['strong'] or (item['exact'] and visual['inliers'] >= 12)
                else:
                    by_key[item['key']] = item
            matches = sorted(by_key.values(), key=lambda item: item['score'], reverse=True)[:5]
            confident = bool(matches and (matches[0].get('strong') or matches[0].get('exact')) and
                             (len(matches) == 1 or matches[0]['score'] - matches[1]['score'] >= .12))
        for match in matches:
            match['name'] = self.catalog[match['key']]['name']
            match['recordId'] = str(self.catalog[match['key']].get('id', ''))
        return {'matches': matches, 'confident': confident, 'elapsedMs': round((time.perf_counter() - started) * 1000),
                'ocrText': ocr_text[:3000], 'catalogSize': len(self.catalog), 'indexed': len(self.features), 'ocrAvailable': bool(self.ocr or self.native_ocr)}


def main():
    matcher = Matcher(os.environ.get('BEER_RECOGNITION_CACHE', '/tmp/kinosreda-beer-features.sqlite'))
    print(json.dumps({'ready': True, 'ocrAvailable': bool(matcher.ocr or matcher.native_ocr)}), flush=True)
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            operation = request['op']
            if operation == 'catalog':
                result = matcher.catalog_update(request['catalog'])
            elif operation == 'index':
                result = matcher.index_image(request['key'], request['image'])
            elif operation == 'recognize':
                result = matcher.recognize(request['image'])
            elif operation == 'prepare':
                matcher.rebuild()
                result = {'indexed': len(matcher.features)}
            else:
                raise ValueError('invalid_operation')
            print(json.dumps({'id': request['id'], 'result': result}), flush=True)
        except Exception as error:
            print(json.dumps({'id': request.get('id'), 'error': type(error).__name__}), flush=True)


if __name__ == '__main__':
    main()
