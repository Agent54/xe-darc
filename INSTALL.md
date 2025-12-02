Darc currently supports Helium or Chrome as the base engine.
Helium is more minimal and often a bit snappier, but it lacks Widevine, so Spotify/Netflix won’t work there.

We’re working on an install script and stand-alone installer.
The instructions below are only needed if you want to try an early preview or want to contribute and hack on it right now.

Setup instructions

Clone this repo:

Use the int branch to get the latest state.

Use the main branch for a more stable and reviewed version.
As of today, it’s recommended to use int, as things change so rapidly that main might be missing core features.

Run pnpm install.

Cd into the ./certs and
Run the cert creation script: ./create.sh
Just press enter for all prompts except Common Name, where you must enter localhost.

navigate the browser to about:settings and search for certificate open privacy and security and click security.
go to manage certificates, local certificates and click trusted.
open installed by you. select the localhost.crt certificate.

Start the dev server with: pnpm dev.

Start the browser you want to use as the base engine and navigate to about://flags.

Use the search field to find and enable the following flags (exact names might differ slightly):

Isolated Web Apps

Isolated Web Apps Dev Mode

Borderless PWA / IWA

Navigate to about://web-app-internals.

Enter https://localhost:5194 in the field “Install IWA via Dev Mode Proxy” and click Install.

A folder with an app shim should open. You can now close the browser window (but do not quit the browser process) and open that app shim.

You should now see a new window with a black top bar and three dots in the top-right corner.
Open the app menu by clicking this icon and select App settings.

Enable all permissions on the first screen. Then go to More settings and enable all permissions you want to use in Darc, but make sure at least Window management is selected.

A Reload button should appear in the header of the Darc window. Click that, or close and reopen the window.

Congrats – you installed Darc successfully! 🎉

Please report any issues or ask for help on our Discord!