"""Tests for main.py helper functions."""
import pytest
from main import _pages_to_credits


def test_pages_to_credits_tier_1():
    assert _pages_to_credits(1) == 1
    assert _pages_to_credits(25) == 1


def test_pages_to_credits_tier_2():
    assert _pages_to_credits(26) == 2
    assert _pages_to_credits(75) == 2


def test_pages_to_credits_tier_3():
    assert _pages_to_credits(76) == 3
    assert _pages_to_credits(150) == 3


def test_pages_to_credits_tier_4():
    assert _pages_to_credits(151) == 4
    assert _pages_to_credits(300) == 4


def test_pages_to_credits_over_limit_raises():
    with pytest.raises(ValueError, match="300-page"):
        _pages_to_credits(301)
