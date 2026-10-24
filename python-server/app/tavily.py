import httpx
from fastapi import HTTPException
from .config import get_settings


async def search(query: str, max_results: int = 5) -> list[dict]:
    key = get_settings().tavily_api_key
    if not key:
        return []
    payload = {"query": query, "search_depth": "advanced", "max_results": max_results, "include_answer": True}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post("https://api.tavily.com/search",
                                        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                        json=payload)
        if response.status_code == 429:
            raise HTTPException(429, "Tavily search quota or rate limit reached.")
        if response.status_code >= 400:
            raise HTTPException(502, f"Tavily returned status {response.status_code}.")
        data = response.json()
        return [{"title": x.get("title", ""), "url": x.get("url", ""), "content": x.get("content", "")} for x in data.get("results", [])]
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Tavily search is temporarily unavailable.") from exc
