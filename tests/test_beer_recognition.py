import base64
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.beer_recognition_worker import Matcher, rank_text


def encode(image):
    return base64.b64encode(cv2.imencode('.png', image)[1]).decode()


def label(seed, title):
    rng = np.random.default_rng(seed)
    image = np.full((480, 320, 3), 235, np.uint8)
    for _ in range(100):
        center = tuple(int(x) for x in rng.integers([15, 15], [305, 465]))
        color = tuple(int(x) for x in rng.integers(10, 190, 3))
        cv2.circle(image, center, int(rng.integers(3, 15)), color, 2)
    cv2.putText(image, title, (20, 220), cv2.FONT_HERSHEY_SIMPLEX, .8, (0, 0, 0), 2)
    return image


@pytest.fixture
def matcher(tmp_path):
    engine = Matcher(str(tmp_path / 'features.sqlite'))
    engine.ocr = None
    engine.native_ocr = None
    yield engine
    engine.cache.close()


def test_finds_rotated_perspective_label_among_different_beers(matcher):
    records = {'a': {'name': 'Amber Lager', 'id': '123', 'imageUrl': 'https://example.com/a'},
               'b': {'name': 'Dark Stout', 'imageUrl': 'https://example.com/b'}}
    matcher.catalog_update(records)
    original = label(4, 'AMBER LAGER')
    matcher.index_image('a', encode(original))
    matcher.index_image('b', encode(label(8, 'DARK STOUT')))
    corners = np.float32([[0, 0], [319, 0], [319, 479], [0, 479]])
    transformed = np.float32([[170, 100], [460, 140], [420, 580], [120, 530]])
    photo = cv2.warpPerspective(original, cv2.getPerspectiveTransform(corners, transformed), (640, 720), borderValue=(80, 80, 80))
    photo = cv2.GaussianBlur(photo, (3, 3), .5)
    result = matcher.recognize(encode(photo))
    assert result['matches'][0]['key'] == 'a'
    assert result['matches'][0]['recordId'] == '123'
    assert result['confident']
    assert result['matches'][0]['inliers'] >= 18


def test_blank_and_unrelated_photos_do_not_select_a_beer(matcher):
    matcher.catalog_update({'a': {'name': 'Amber Lager', 'imageUrl': 'https://example.com/a'}})
    matcher.index_image('a', encode(label(4, 'AMBER')))
    for image in [np.full((480, 320, 3), 255, np.uint8), label(58, 'UNKNOWN')]:
        result = matcher.recognize(encode(image))
        assert not result['confident']
        assert not result['matches']


def test_cached_index_restores_and_deleted_or_changed_records_are_removed(matcher, tmp_path):
    record = {'a': {'name': 'Amber Lager', 'imageUrl': 'https://example.com/a'}}
    matcher.catalog_update(record)
    matcher.index_image('a', encode(label(4, 'AMBER')))
    restored = Matcher(str(tmp_path / 'features.sqlite'))
    assert restored.catalog_update(record)['missing'] == []
    assert restored.catalog_update({'a': {**record['a'], 'imageUrl': 'https://example.com/new'}})['missing']
    assert not restored.features
    matcher.catalog_update({})
    assert not matcher.recognize(encode(label(4, 'AMBER')))['matches']
    restored.cache.close()


def test_ocr_keeps_variants_and_does_not_invent_unknown_products():
    records = {'original': {'name': 'Heineken Original'}, 'zero': {'name': 'Heineken 0.0'},
               'wheat': {'name': 'Allgäuer Stolz Hefeweizen'}, 'hell': {'name': 'Allgäuer Stolz Hell'}}
    zero = rank_text('HEINEKEN 0.0 alcohol free beer', records)
    assert zero[0]['key'] == 'zero'
    assert zero[0]['exact']
    variant = rank_text('ALLGAUER STOLZ HEFEWEIZEN', records)
    assert variant[0]['key'] == 'wheat'
    assert not rank_text('totally unrelated typography', records)


def test_ocr_brand_without_variant_is_not_confident():
    records = {'a': {'name': 'Paulaner Weissbier'}, 'b': {'name': 'Paulaner Dunkel'}}
    matches = rank_text('PAULANER', records)
    assert len(matches) == 2
    assert not any(item['exact'] for item in matches)


def test_unknown_label_returns_ocr_for_prefilling_a_new_beer(matcher, monkeypatch):
    matcher.catalog_update({'a': {'name': 'Amber Lager', 'imageUrl': 'https://example.com/a'}})
    monkeypatch.setattr(matcher, 'read_text', lambda _: 'NEW BREW\nSummer Wheat\n500 ml')
    result = matcher.recognize(encode(np.full((480, 320, 3), 255, np.uint8)))
    assert not result['matches']
    assert not result['confident']
    assert result['ocrText'] == 'NEW BREW\nSummer Wheat\n500 ml'


def test_rejects_invalid_image_before_matching(matcher):
    with pytest.raises(ValueError):
        matcher.recognize('not-base64')


def test_identical_photos_offer_choices_instead_of_selecting_arbitrarily(matcher):
    matcher.catalog_update({'a': {'name': 'Amber Lager', 'imageUrl': 'https://example.com/same'},
                            'b': {'name': 'Amber Zero', 'imageUrl': 'https://example.com/same'}})
    image = encode(label(4, 'AMBER'))
    matcher.index_image('a', image)
    matcher.index_image('b', image)
    result = matcher.recognize(image)
    assert {item['key'] for item in result['matches']} == {'a', 'b'}
    assert not result['confident']
