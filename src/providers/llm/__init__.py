from src.providers.llm.base import LLMProvider
from src.providers.llm.gemini import GeminiProvider


def get_llm_provider(provider_name: str, api_key: str, model: str, embedding_model: str = "gemini-embedding-exp-03-07", max_concurrent: int = 3) -> LLMProvider:
    """
    Factory function. Returns appropriate LLM provider instance.
    To add a new provider: create a new file in this directory implementing LLMProvider,
    then add it to this factory. No other code changes needed.
    """
    providers = {
        "gemini": GeminiProvider,
        # "openai": OpenAIProvider,  # Uncomment when implementing
    }
    if provider_name not in providers:
        raise ValueError(
            f"Unknown LLM provider: '{provider_name}'. "
            f"Available: {list(providers.keys())}"
        )
    return providers[provider_name](api_key=api_key, model=model, embedding_model=embedding_model, max_concurrent=max_concurrent)


__all__ = ["LLMProvider", "get_llm_provider"]
