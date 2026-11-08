# Open In Conversation (Thunderbird 128+ port)

Port of https://github.com/jhartz/thunderbird-open-in-conversation (a legacy XUL overlay, dead since
Thunderbird 78) to a MailExtension with an Experiment API. Tested on Thunderbird 159.

What it does: Enter or double-click on a message in the thread pane opens the **conversation** (the same
view as right-click > "Open Message in Conversation": every message of the thread, from any folder, sent
mail included) instead of just that one message. Falls back to the normal open when the message is not
indexed yet by the global search, in Drafts / Templates, and on middle-click.

Options (Add-ons Manager > Open In Conversation > Preferences): choose which triggers apply (Enter,
double-click, middle-click) and whether single messages (no replies anywhere, Sent included) open as a plain
message instead of a conversation tab (on by default). Shortcut **Ctrl+Shift+O** always opens the conversation
of the selected message; change it under "Manage Extension Shortcuts". English and Bulgarian.

Requirements: *Settings > General > Indexing > Enable Global Search and Indexer* (on by default).

Download: the built add-on is attached to the latest release:
https://github.com/darvodelecbg/thunderbird-open-in-conversation/releases/latest

Build from source: `py -3 -I build.py` writes `open-in-conversation.xpi` next to this file.
Install: Thunderbird > Add-ons Manager > gear icon > *Install Add-on From File...* > pick the .xpi.
Thunderbird warns that it is an experiment with full access; accept. No restart needed.
