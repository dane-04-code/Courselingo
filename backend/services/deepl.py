"""DeepL integration service — translates text via the DeepL API."""

from __future__ import annotations

import deepl


class TranslationError(Exception):
    """Raised when the DeepL API call fails."""


def translate_text(text: str, target_lang: str, api_key: str) -> str:
    """
    Translate *text* into *target_lang* using the DeepL API.

    Parameters
    ----------
    text : str
        Source text to translate.
    target_lang : str
        Target language code accepted by DeepL (e.g. ``"DE"``, ``"FR"``, ``"ES"``).
    api_key : str
        DeepL authentication key.

    Returns
    -------
    str
        The translated text.

    Raises
    ------
    TranslationError
        If the API call fails for any reason.
    """
    if not text.strip():
        return text

    try:
        translator = deepl.Translator(api_key)
        result = translator.translate_text(text, target_lang=target_lang)
        return result.text  # type: ignore[union-attr]
    except deepl.DeepLException as exc:
        raise TranslationError(f"DeepL API error: {exc}") from exc
    except Exception as exc:
        raise TranslationError(f"Unexpected translation error: {exc}") from exc


def translate_blocks(
    blocks: list[dict], target_lang: str, api_key: str
) -> list[dict]:
    """
    Translate the ``text`` field of every block dict **in-place** and return
    the list.  Non-text or empty blocks are left untouched.
    """
    for block in blocks:
        original = block.get("text", "")
        if original.strip():
            block["text"] = translate_text(original, target_lang, api_key)
    return blocks
