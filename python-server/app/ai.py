
import json
import logging
import re
from typing import Any

from fastapi import HTTPException
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI

from .config import get_settings


logger = logging.getLogger(__name__)

JSON_INSTRUCTION = """
You are generating structured data for a FastAPI application.

Return exactly one valid JSON object.
Do not use Markdown code fences.
Do not include explanations before or after the JSON.
Use double-quoted JSON keys and string values.
Use true, false, and null where appropriate.
Do not use trailing commas.
Follow the exact structure and field names requested.
Include all required fields.
Do not invent additional fields unless requested.
"""


def _message_text(content: Any) -> str:
    """Convert message content to text for LangChain."""
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts = []

        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if isinstance(item.get("text"), str):
                    parts.append(item["text"])

        return "\n".join(parts)

    if content is None:
        return ""

    return json.dumps(content, ensure_ascii=False)


def _to_langchain_messages(
    messages: list[dict],
    json_mode: bool = False,
) -> list:
    """Convert existing role/content dictionaries to LangChain messages."""
    converted = []

    for message in messages:
        role = message.get("role", "user")
        content = _message_text(message.get("content", ""))

        if role in ("system", "developer"):
            converted.append(SystemMessage(content=content))
        elif role in ("user", "human"):
            converted.append(HumanMessage(content=content))
        elif role in ("assistant", "ai", "model"):
            converted.append(AIMessage(content=content))
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported message role: {role}",
            )

    if json_mode:
        system_index = next(
            (
                index
                for index, message in enumerate(converted)
                if isinstance(message, SystemMessage)
            ),
            None,
        )

        if system_index is not None:
            old_message = converted[system_index]
            converted[system_index] = SystemMessage(
                content=(
                    f"{_message_text(old_message.content)}\n\n"
                    f"{JSON_INSTRUCTION}"
                )
            )
        else:
            converted.insert(
                0,
                SystemMessage(content=JSON_INSTRUCTION),
            )

    if not any(
        isinstance(message, (HumanMessage, AIMessage))
        for message in converted
    ):
        raise HTTPException(
            status_code=400,
            detail="At least one user or assistant message is required.",
        )

    return converted


def _response_text(content: Any) -> str:
    """Extract generated text from a LangChain response."""
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts = []

        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if isinstance(item.get("text"), str):
                    parts.append(item["text"])
                elif (
                    item.get("type") == "text"
                    and isinstance(item.get("content"), str)
                ):
                    parts.append(item["content"])

        return "\n".join(parts).strip()

    return ""


def _as_prompt(messages: list[dict]) -> str:
    """Keep compatibility with code that uses this helper."""
    return "\n\n".join(
        f"{message.get('role', 'user').upper()}: "
        f"{_message_text(message.get('content', ''))}"
        for message in messages
    )


async def _chat_gemini(
    messages: list[dict],
    temperature: float,
    s,
    json_mode: bool = False,
) -> str:
    """Generate a response using Gemini through LangChain."""
    if not s.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured.",
        )

    try:
        options = {
            "model": "gemini-3.6-flash",
            "google_api_key": s.gemini_api_key,
            "max_retries": 2,
        }

        # Some Gemini models use fixed sampling defaults.
        # Avoid passing temperature to prevent sampling warnings.
        if json_mode:
            options["response_mime_type"] = "application/json"

        llm = ChatGoogleGenerativeAI(**options)

        response = await llm.ainvoke(
            _to_langchain_messages(messages, json_mode)
        )

        result = _response_text(response.content)

        if not result:
            metadata = getattr(response, "response_metadata", {})
            logger.warning(
                "Gemini returned empty text. Metadata: %s",
                metadata,
            )
            raise RuntimeError("Gemini returned an empty response.")

        return result

    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(
            "Gemini LangChain request failed: %s: %s",
            type(exc).__name__,
            str(exc)[:500],
        )
        raise RuntimeError(
            f"Gemini request failed: {type(exc).__name__}: "
            f"{str(exc)[:400]}"
        ) from exc


async def _chat_groq(
    messages: list[dict],
    temperature: float,
    s,
    json_mode: bool = False,
) -> str:
    """Generate a response using Groq through LangChain."""
    if not s.groq_api_key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not configured.",
        )

    try:
        options = {
            "model": "openai/gpt-oss-20b",
            "api_key": s.groq_api_key,
            "temperature": min(temperature, 0.2)
            if json_mode
            else temperature,
            "max_retries": 2,
        }

        # Use the JSON instruction in the prompt rather than forcing
        # response_format, which previously caused Groq validation errors.
        llm = ChatGroq(**options)

        response = await llm.ainvoke(
            _to_langchain_messages(messages, json_mode)
        )

        result = _response_text(response.content)

        if not result:
            metadata = getattr(response, "response_metadata", {})
            usage = getattr(response, "usage_metadata", None)

            logger.warning(
                "Groq returned empty text. Metadata: %s; usage: %s",
                metadata,
                usage,
            )
            raise RuntimeError("Groq returned an empty response.")

        return result

    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(
            "Groq LangChain request failed: %s: %s",
            type(exc).__name__,
            str(exc)[:500],
        )
        raise RuntimeError(
            f"Groq request failed: {type(exc).__name__}: "
            f"{str(exc)[:400]}"
        ) from exc


async def _call_provider(
    provider: str,
    messages: list[dict],
    temperature: float,
    settings,
    json_mode: bool,
) -> str:
    """Call a provider and validate its JSON output when requested."""
    if provider == "gemini":
        result = await _chat_gemini(
            messages,
            temperature,
            settings,
            json_mode,
        )
    elif provider == "groq":
        result = await _chat_groq(
            messages,
            temperature,
            settings,
            json_mode,
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported AI provider: {provider}",
        )

    if json_mode:
        parsed = parse_json(result)

        # Preserve the existing chat() return type: str.
        return json.dumps(parsed, ensure_ascii=False)

    return result


async def chat(
    messages: list[dict],
    temperature: float = 0.5,
    provider: str | None = None,
    json_mode: bool = False,
) -> str:
    """
    Call the selected AI provider, then try the other provider if needed.

    Existing callers can continue using:
        await chat(messages, 0.6, json_mode=True)
        await chat(messages, 0.3, provider="gemini")
        await chat(messages, 0.4, provider="groq")
    """
    settings = get_settings()
    selected = (provider or settings.selected_provider).lower()

    if selected not in ("gemini", "groq"):
        raise HTTPException(
            status_code=400,
            detail="Unsupported AI provider. Use 'gemini' or 'groq'.",
        )

    fallback = "groq" if selected == "gemini" else "gemini"

    logger.info(
        "AI request: selected=%s fallback=%s json_mode=%s",
        selected,
        fallback,
        json_mode,
    )

    provider_keys = {
        "gemini": settings.gemini_api_key,
        "groq": settings.groq_api_key,
    }

    errors = []

    # Try the selected provider first, then the other provider.
    for current_provider in (selected, fallback):
        if not provider_keys.get(current_provider):
            errors.append(
                f"{current_provider}: API key is not configured"
            )
            logger.warning(
                "Skipping %s because its API key is missing.",
                current_provider,
            )
            continue

        try:
            result = await _call_provider(
                current_provider,
                messages,
                temperature,
                settings,
                json_mode,
            )

            logger.info(
                "AI provider succeeded: %s",
                current_provider,
            )
            return result

        except Exception as exc:
            error = (
                f"{current_provider}: "
                f"{type(exc).__name__}: {str(exc)[:400]}"
            )
            errors.append(error)

            logger.warning(
                "AI provider failed: %s",
                error,
            )

    # Neither provider produced a usable response.
    raise HTTPException(
        status_code=502,
        detail="Both AI providers failed. " + " | ".join(errors),
    )


def parse_json(raw: str):
    """
    Parse a JSON object or array.

    Supports fenced JSON and JSON surrounded by explanatory text.
    The caller should validate the parsed value against its Pydantic model.
    """
    if not isinstance(raw, str) or not raw.strip():
        raise HTTPException(
            status_code=502,
            detail="The AI returned an empty response.",
        )

    text = raw.strip()

    # Remove a Markdown fence if it wraps the entire response.
    match = re.fullmatch(
        r"```(?:json)?\s*(.*?)\s*```",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )

    if match:
        text = match.group(1).strip()

    # Prefer strict parsing of the entire response.
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Recover the first complete JSON value from surrounding text.
    decoder = json.JSONDecoder()

    for index, char in enumerate(text):
        if char not in "{[":
            continue

        try:
            value, _ = decoder.raw_decode(text[index:])
            return value
        except json.JSONDecodeError:
            continue

    logger.warning(
        "AI returned invalid JSON. Response starts with: %r",
        text[:300],
    )

    raise HTTPException(
        status_code=502,
        detail=(
            "The AI provider returned invalid JSON. "
            f"Response starts with: {text[:200]!r}"
        ),
    )
