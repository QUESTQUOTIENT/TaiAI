# src/free_providers.py
"""
Registry of free chat-completion API providers the user can one-click
add as model endpoints.

Honesty note: only providers with a real public OpenAI-compatible (or
documented Google-style) chat-completions endpoint are listed here.
"Web app only" services (Bolt.new, JDoodle, Kilo Live Leaderboard,
NoteGPT AI Chat, EaseMate AI, SurfSense, ChatBotChatApp, Vibe Coding)
and rate-limited unofficial proxies (Duck.ai) are intentionally
excluded — wiring them up would either not work or violate the
provider's terms. Users who have specific endpoints can still add
them manually via the Settings → Models panel ("Add endpoint").
"""

# Each provider entry:
#   id            — stable internal id
#   name          — display name shown in the picker
#   base_url      — OpenAI-compatible chat completions URL (no trailing slash on path root)
#   provider      — provider string the rest of the app recognises
#   models_url    — GET path for model list (OAI-compatible by default)
#   models        — list of well-known free-tier model ids (used to seed the picker)
#   needs_api_key — whether this provider requires a user-supplied API key
#   key_help      — human URL where the user gets a key
#   key_label     — placeholder for the API key input
#   logo          — single emoji or short label
#   description   — 1-line marketing copy for the picker card
#   api_format    — "openai" or "google" (drives request body shape)

FREE_PROVIDERS = [
    {
        "id": "google-ai-studio",
        "name": "Google AI Studio",
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "provider": "google",
        "models_url": "https://generativelanguage.googleapis.com/v1beta/models",
        "needs_api_key": True,
        "key_help": "https://aistudio.google.com/apikey",
        "key_label": "AI Studio API key (starts with AIza…)",
        "logo": "✦",
        "description": "Google's Gemini models. Generous free tier, no credit card.",
        "models": [
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-1.5-flash",
            "gemini-1.5-flash-8b",
            "gemini-1.5-pro",
        ],
        "api_format": "google",
    },
    {
        "id": "openrouter-free",
        "name": "OpenRouter Free Collection",
        "base_url": "https://openrouter.ai/api/v1",
        "provider": "openrouter",
        "models_url": "https://openrouter.ai/api/v1/models",
        "needs_api_key": True,
        "key_help": "https://openrouter.ai/settings/keys",
        "key_label": "OpenRouter API key (sk-or-…)",
        "logo": "◢",
        "description": "100+ models via one endpoint. Models with ':free' suffix are no-cost.",
        "models": [
            # Curated free-tier models; user can also pick any :free model after enabling.
            "meta-llama/llama-3.3-70b-instruct:free",
            "meta-llama/llama-3.2-11b-vision-instruct:free",
            "google/gemini-2.0-flash-exp:free",
            "mistralai/mistral-7b-instruct:free",
            "qwen/qwen-2.5-72b-instruct:free",
            "deepseek/deepseek-chat:free",
        ],
        "api_format": "openai",
    },
    {
        "id": "huggingface-router",
        "name": "HuggingChat",
        "base_url": "https://router.huggingface.co/v1",
        "provider": "huggingface",
        "models_url": "https://router.huggingface.co/v1/models",
        "needs_api_key": True,
        "key_help": "https://huggingface.co/settings/tokens",
        "key_label": "HuggingFace access token (hf_…)",
        "logo": "🤗",
        "description": "HuggingFace's OpenAI-compatible router — free tier for many open models.",
        "models": [
            "meta-llama/Meta-Llama-3-8B-Instruct",
            "meta-llama/Llama-3.2-3B-Instruct",
            "mistralai/Mistral-7B-Instruct-v0.3",
            "Qwen/Qwen2.5-7B-Instruct",
            "google/gemma-2-9b-it",
        ],
        "api_format": "openai",
    },
    {
        "id": "deepai",
        "name": "DeepAI Code Chat",
        "base_url": "https://api.deepai.org",
        "provider": "openai",
        "models_url": "https://api.deepai.org/models_list",
        "needs_api_key": True,
        "key_help": "https://deepai.org/dashboard/profile",
        "key_label": "DeepAI API key",
        "logo": "◆",
        "description": "Simple free text-generation API. Good for casual chat.",
        "models": [
            "deepai-chat",
            "deepai-text-generator",
        ],
        "api_format": "openai",
    },
]


def list_providers():
    """Return the registry as a JSON-safe list."""
    return [dict(p) for p in FREE_PROVIDERS]


def get_provider(pid: str):
    """Look up a single provider by id (or None)."""
    for p in FREE_PROVIDERS:
        if p["id"] == pid:
            return dict(p)
    return None


def provider_card_data(p: dict) -> dict:
    """Subset of provider info safe to send to the browser picker UI
    (excludes anything that should not be exposed)."""
    return {
        "id": p["id"],
        "name": p["name"],
        "provider": p["provider"],
        "needs_api_key": p["needs_api_key"],
        "key_help": p.get("key_help", ""),
        "key_label": p.get("key_label", ""),
        "logo": p.get("logo", ""),
        "description": p.get("description", ""),
        "models": p.get("models", []),
    }
