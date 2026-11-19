"""Constants for the Madplan integration."""

from datetime import timedelta

DOMAIN = "madplan"

CONF_TOKEN = "token"
CONF_SLUG = "slug"

DEFAULT_PORT = 8100
# The app's internal API version this integration understands (see server/src/internal/api.ts).
SUPPORTED_API_VERSION = 1

# Safety net next to the push updates over /internal/v1/events.
UPDATE_INTERVAL = timedelta(minutes=5)
