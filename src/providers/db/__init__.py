import os

from src.providers.db.base import DBProvider


def get_db_provider() -> DBProvider:
    """
    Return the appropriate DB provider based on environment variables.

    - If SUPABASE_URL and a service/anon key are set → SupabaseDBProvider (production)
    - Otherwise → SQLiteDBProvider (local development, no cloud credentials needed)

    Key priority: SUPABASE_SERVICE_KEY (bypasses RLS) > SUPABASE_KEY (may be anon key).
    """
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_KEY", "").strip()
        or os.getenv("SUPABASE_KEY", "").strip()
    )

    if supabase_url and supabase_key:
        from src.providers.db.supabase_provider import SupabaseDBProvider
        return SupabaseDBProvider(supabase_url, supabase_key)

    from src.providers.db.sqlite import SQLiteDBProvider
    return SQLiteDBProvider()
