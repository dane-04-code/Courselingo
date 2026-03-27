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
    the list.  Sends all texts to DeepL in a single batch call for speed.
    """
    # Collect indices and texts that actually need translation
    to_translate: list[tuple[int, str]] = []
    for i, block in enumerate(blocks):
        text = block.get("text", "")
        if text.strip():
            to_translate.append((i, text))

    if not to_translate:
        return blocks

    texts = [t for _, t in to_translate]

    try:
        translator = deepl.Translator(api_key)
        results = translator.translate_text(texts, target_lang=target_lang)

        # translate_text returns a single result for one string, list for many
        if not isinstance(results, list):
            results = [results]

        for (idx, _), result in zip(to_translate, results):
            blocks[idx]["text"] = result.text
    except deepl.DeepLException as exc:
        raise TranslationError(f"DeepL API error: {exc}") from exc
    except Exception as exc:
        raise TranslationError(f"Unexpected translation error: {exc}") from exc

    return blocks
