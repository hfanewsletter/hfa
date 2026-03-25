from src.providers.storage.base import StorageProvider
from src.providers.storage.local import LocalStorageProvider


def get_storage_provider(provider_name: str, config: dict) -> StorageProvider:
    """
    Factory function. Returns appropriate storage provider instance.
    To add a new provider: implement StorageProvider and add it here.
    """
    if provider_name == "supabase":
        from src.providers.storage.supabase_storage import SupabaseStorageProvider
        return SupabaseStorageProvider(config)

    providers = {
        "local": LocalStorageProvider,
        # "s3": S3StorageProvider,      # Uncomment when implementing
        # "azure": AzureStorageProvider, # Uncomment when implementing
        # "gcs": GCSStorageProvider,     # Uncomment when implementing
    }
    if provider_name not in providers:
        raise ValueError(
            f"Unknown storage provider: '{provider_name}'. "
            f"Available: {list(providers.keys())}"
        )
    return providers[provider_name](config)


__all__ = ["StorageProvider", "get_storage_provider"]
