# Tab pins

Pin **location** determines availability. Pin **display** determines how a full
space or global pin opens. Sidebar pins are ordinary tabs and groups kept in a
separate, manually ordered section.

| Location | Sidebar appearance | Content behavior |
| --- | --- | --- |
| Tab group | Favicon in the group's left or right header stack | Left or right sidepin only; available with its group |
| Space | Square favicon button above the fixed sidebar pins | Normal (default), Menu, Left sidepin, or Right sidepin; available throughout that space |
| Global | Square favicon button above the spaces | Same displays as space pins; available in every space |
| Scrolling sidebar | Ordinary tab or expandable group above normal tab creation positions | Ordinary tab/group behavior; scrolls with the list; always manually sorted |
| Fixed sidebar | Ordinary tab or expandable group below space favicon pins and above New Tab | Same behavior as scrolling sidebar pins; stays outside the scrolling list |

## Sidepins

A sidepin is a webpage pane to the left or right of the current tab group.
Group, space, and global pins each have their own visibility slots: each location
can show at most one left and one right sidepin. Opening another pin in a slot
hides its peer. The opposite side and other locations remain unchanged. Group
selections survive switching groups; visibility is restored for each window.

## Full space and global pins

New full pins default to **Normal**, including installed apps and drops into the
space/global favicon grids. Existing explicit Left/Right choices are retained.

- **Normal** opens the pin alone in the main content area as a virtual group with
  one tab. The favicon stays in its pin grid.
- **Menu** opens the webpage in a temporary panel beside the sidebar, with the
  same gap and viewport fitting used by sidebar hovercards. It leaves the active
  tab/group selected. The panel has a shorter-than-window height; dragging its
  right edge resizes it, and its width is saved on that individual pin. Clicking
  outside or pressing Escape closes it. A press that starts inside and ends
  outside does not dismiss it.
- **Left sidepin** and **Right sidepin** use the visibility slots above.

The tab context menu exposes pin location and display separately. Group pins
support only the two sidepin displays. Sidebar pins offer neither sidepins nor
Normal/Menu displays; they use ordinary tab/group content.

## Sidebar pin groups and order

Pinning a group moves all its members together and retains its identity, name,
icon, expansion controls, and member order. Moving a group between scrolling,
fixed, and normal sections keeps the group intact. An individual tab dragged out
of a group becomes a standalone tab, matching the normal list. Dropping a tab
into a pinned group gives it the destination's sidebar pin location.

Both sidebar pin sections have their own saved manual order, independent of the
activity sort mode. New normal tabs enter the normal section below scrolling
pins. Pinning a group does not turn its members into full space/global pins.

## Drag and drop

All insertion and group-join targets use the shared white line indicator. Targets
never add placeholders, outlines, or change row geometry during a drag. Hovering
a group long enough selects a group join with an inset white line; it does not
automatically expand the group and shift neighboring targets. Expanded groups
accept member insertions using the same line behavior as the main tab list.

## Stored fields

- `pinned`: `left`, `right`, `normal`, or `menu`; legacy `true` means left.
- `pinScope`: `group`, `space`, or `global`; legacy scope inference is preserved.
- `pinOrder`: full-pin ordering; `pinMenuWidth`: saved width of a Menu pin.
- `sidebarPinned`: `true` for scrolling or `fixed` for non-scrolling sidebar pins.
- `sidebarPinOrder`: manual section rank, shared by members of a pinned group.
- `tabGroupId` and `tabGroupOrder`: ordinary group identity and member order.
