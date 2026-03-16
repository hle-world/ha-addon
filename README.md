# HomeLab Everywhere — Home Assistant Add-on

Expose Home Assistant and other homelab services to the internet via [HLE](https://hle.world) tunnels, with built-in SSO. Manage all your tunnels and access rules directly from the HA sidebar.

## Installation

[![Add repository to my Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fhle-world%2Fha-addon)

Or manually:

1. Go to **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
2. Add `https://github.com/hle-world/ha-addon`
3. Install **HomeLab Everywhere**
4. Get an API key at [hle.world/dashboard](https://hle.world/dashboard)
5. Enter the key in the add-on **Settings** tab and start the add-on

For detailed setup with screenshots, see the [full guide on hle.world/docs](https://hle.world/docs/integrations/home-assistant/).

## Features

- Expose Home Assistant itself with one click
- Add tunnels for any service on your homelab (by URL)
- Manage SSO allow-lists per tunnel
- Per-tunnel start/stop controls
- Live tunnel status in the HA sidebar panel
