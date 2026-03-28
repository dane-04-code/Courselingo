"""Pytest configuration — add the backend root to sys.path so
   `from services.xxx import ...` works without installing the package."""
import sys
import os

# Insert backend/ at the front of the path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
