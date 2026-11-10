all:
    Location: checked
    Camera: checked
    Microphone: checked
    Sound: checked
    Images: checked
    Fonts: checked
    Automatic downloads: checked
   
    Motion sensors
    Notifications
    JavaScript
    Pop-ups and redirects
    Intrusive ads
    Background sync
    MIDI device control and reprogramme
    USB devices
    Serial ports
    File editing
    HID devices
    Clipboard
    Payment handlers
    Insecure content
    V8 optimiser
    Third-party sign-in
    Augmented reality
    Virtual reality
    Your device use
    Window management
    Automatic picture-in-picture
    Scrolling and zooming shared tabs
    Automatic full screen


controlled frame:
# Permission decisions

`app/data.svelte.js` owns the permission store in `app/lib/permissions.js`.
Remembered rules are ordinary documents in the `darc` PouchDB database.
The data module loads them independently of the tab query and applies live
changes before guests are mounted. Pending native controllers stay in memory.

Each rule is scoped to the existing `darcInstanceId` from localStorage,
the storage partition, the top-level origin, the requesting origin, and a
permission descriptor. Its deterministic ID encodes those fields.
The instance ID identifies app storage, not the user or hardware; synced
rules for another instance do not authorize this one.

Pending requests snapshot their original URL, frame, and partition. Answering
a card uses its request ID and stored scope, independently of the active tab.
A live approval is rejected if its requesting tab has changed URL, frame, or
partition. Denying or resetting a saved permission still targets the original
scope even when another site is visible.

```json
{
  "_id": "darc:permission:example-instance:persist%3Amyapp:https%3A%2F%2Fexample.com:https%3A%2F%2Fexample.com:media:camera",
  "type": "permission",
  "schemaVersion": 1,
  "instanceId": "example-instance",
  "partition": "persist:myapp",
  "topLevelOrigin": "https://example.com",
  "requestingOrigin": "https://example.com",
  "permission": { "name": "media", "capability": "camera" },
  "decision": "allow",
  "lifetime": "persistent",
  "created": 1794009600000,
  "modified": 1794009600000,
  "sort": 0
}
```

PouchDB adds `_rev`. Always allow and Deny are remembered; resetting a rule
removes it. Session grants last until the current window closes. Allow once
resolves only the selected native request. For controllers that cannot be
deferred, it arms one retry in that same frame and page for up to 60 seconds.
Ignore dismisses the selected request without remembering a decision.

Revocation is centralized in the store's document-ingestion path for both local
and incoming changes. Live grants are tracked separately from remembered
decisions so consuming an Allow once grant does not prevent its later
revocation. Reset or denial reloads matching live pages and cancels their
pending native controllers; releasing one frame preserves grants still in use
by other frames. Popup and navigation policy changes do not reload pages.

The native event handler and `data.permissionRequest` are synchronous. Only
saving a user's answer is asynchronous. Chromium's flat event exposes
`event.request.allow()` / `event.request.deny()`; calling `preventDefault()`
during dispatch keeps that controller available for a later user answer.
Without deferral, an unanswered request is denied during dispatch and a
later approval applies to a retry. The draft's nested form instead uses
`event.permissionRequest.request.allow()` / `.cancel()`. Both paths retain
the request controller; neither calls allow or deny on the event itself.
See [Chromium's controller implementation](https://raw.githubusercontent.com/chromium/chromium/main/extensions/renderer/resources/guest_view/web_view/web_view_action_requests.js)
and the [draft event definition](https://wicg.github.io/controlled-frame/#permissionrequest).

The motion-sensor availability probe retains
`DeviceOrientationEvent.requestPermission()` with a TODO to evaluate whether
it is needed for window management or related handlers. Resources currently
skips that probe and disables permission controls until a guest motion-sensor
permission handler is implemented.

Unanswered requests appear as cards at the top right of the current window.
They use the same card component and actions as the Resources sidebar and
remain until answered, ignored, or expired by the request handler. Clicking
the card opens Resources; clicking an action resolves only that request.
The close button appears on hover or keyboard focus and performs Ignore.
While Resources is open, its cards replace the toasts; closing it shows any
requests that are still unanswered, including requests already marked seen.

The implemented descriptors are `open-tab`, `navigate-off-origin`,
`geolocation`, `pointerLock`, `download`, `filesystem`, `fullscreen`, `hid`,
`clipboardReadWrite`, `clipboardSanitizedWrite`, and `media` with a `camera`
or `microphone` capability. Requests for both capabilities need both decisions.
Media requests that do not identify their capabilities are denied and shown
as unsupported. Filesystem refers to the guest sandbox, not unrestricted
editing of files on the host.

Unknown requests, invalid or opaque origins, unsupported schema versions,
and conflicting saved decisions cannot grant access. Revision conflicts are
retried; an explicit new decision also removes conflicting revision leaves.
Registry entries without enforcement have disabled permission controls.
Other availability checks do not prompt. Mock is disabled with a “Not implemented yet”
tooltip.

Popups, including OAuth windows, use the ordinary guest lifecycle and retain
their native window controller and opener partition. The `open-tab` policy
defaults to a lightbox. Its header settings can remember opening in a new tab,
navigating the opener in the same tab (`decision: "same-tab"`), deny future
openings, or restore the default. Choosing same-tab also navigates to the
currently displayed lightbox URL and closes that lightbox. The same choice
lets off-origin navigation continue in place. Explicit modifier-clicks retain
the new-tab behavior unless the opening policy is denied. Forced off-origin
lightboxes also honor denial.

The guest console bridge uses a module-generated secret with a separate token
per frame, held in the injected script's closure. Unsigned messages, messages
from other frames, and messages from released frames are ignored. The IPC
handshake validates trusted embedder messages and authenticates messages over
the transferred port; its public connection message contains no secret.
Privileged input forwarding ignores synthetic events. This is an interim
guard while console commands move to the IPC layer.

Run the focused tests with:

```sh
deno test --no-check --allow-read --allow-env tests/permissions.test.js tests/frame-ipc.test.js tests/direct-navigation.test.js tests/controlled-frame-cleanup.test.js tests/frame-lifecycle.test.js tests/hovercard-navigation.test.js tests/shortcuts.test.js tests/tab-activation-history.test.js
deno run --unstable-bare-node-builtins --allow-env --allow-read --allow-sys --allow-write=./,/tmp --allow-ffi --allow-net --allow-run tests/permissions-browser.js
```

The browser fixture verifies PouchDB persistence, cross-window updates,
the actual header/resource controls, and disabled Mock behavior in Chromium.
It does not emulate a native IWA controlled-frame guest.
The permission unit tests use separate frozen Chromium and draft controllers,
real cancelable/noncancelable events, and dispatch-lifetime checks to catch late
responses, repeated answers, incorrect receivers, and incorrect denial methods.
