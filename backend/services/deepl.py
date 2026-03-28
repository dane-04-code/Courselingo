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

    Blocks whose text contains ``\\n`` (e.g. bullet lists) are split into
    per-line segments before sending, so DeepL translates each segment
    independently.  This prevents word-order shifts from moving translated
    text across line boundaries.  The ``\\n`` positions are then restored
    exactly in the translated output.
    """
    # Build a flat batch of segments to translate.
    # Each entry records (block_idx, line_idx) so we can reassemble afterwards.
    segments: list[tuple[int, int, str]] = []  # (block_idx, line_idx, text)

    for i, block in enumerate(blocks):
        text = block.get("text", "")
        if not text.strip():
            continue
        for j, line in enumerate(text.split("\n")):
            if line.strip():
                segments.append((i, j, line))

    if not segments:
        return blocks

    texts = [seg[2] for seg in segments]

    try:
        translator = deepl.Translator(api_key)
        results = translator.translate_text(texts, target_lang=target_lang)

        # translate_text returns a single result for one string, list for many
        if not isinstance(results, list):
            results = [results]

        # Map (block_idx, line_idx) → translated text
        translated: dict[tuple[int, int], str] = {
            (block_idx, line_idx): result.text
            for (block_idx, line_idx, _), result in zip(segments, results)
        }

        # Reassemble block texts, preserving \n positions exactly
        for i, block in enumerate(blocks):
            text = block.get("text", "")
            if not text.strip():
                continue
            lines = text.split("\n")
            block["text"] = "\n".join(
                translated.get((i, j), line)
                for j, line in enumerate(lines)
            )

    except deepl.DeepLException as exc:
        raise TranslationError(f"DeepL API error: {exc}") from exc
    except Exception as exc:
        raise TranslationError(f"Unexpected translation error: {exc}") from exc

    return blocks
