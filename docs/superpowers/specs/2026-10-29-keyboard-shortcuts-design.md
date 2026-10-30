# Personal keyboard shortcut preferences

The requested opt-out is a personal browser preference, not a project or team policy.
Add Keyboard shortcuts On/Off to the widget launcher menu and dashboard user menu,
using existing surfaces and styling. Keep enabled by default for compatibility.

Store widget and dashboard preferences separately in localStorage. Widget settings
apply to this host origin; they cannot synchronize across unrelated websites. Share
changes among mounted components and across tabs. If storage is unavailable, keep
changes for the current page. No account login or backend migration is required.

Disable CRRT global action/navigation shortcuts, including widget submit accelerators
and dashboard search shortcuts. Preserve native focus/button activation, local dialog
navigation, and Escape dismissal/cancellation. Keep mouse actions and the preference
control available. Hide shortcut hints when they are disabled.

Validate default behavior, opt-out and opt-in, reload persistence, surface isolation,
cross-tab updates, blocked storage, retained pointer actions and Escape, and both
project feedback and personal Inbox navigation. This PR does not remap shortcuts or
change landing UI.
