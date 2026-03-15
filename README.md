## Claude in Chrome - Arc Sidebar Fix

This is an extension you can load in arc where it makes a popup for claude in chrome.

Just go to chrome://extensions, enable developer mode, load unpacked - and add this folder.

All this is, is the latest claude in chrome extension, with a minor tweak that makes the window a pop-up instead of integrated sidebar, thus allowing it to work with Arc.

It works with page context, teach claude mode, etc.

- - -

This tool may also be needed for this to work: https://github.com/stolot0mt0m/claude-chromium-native-messaging


You can follow the install instructions from there, very easy - just download it and run a command to auto install. 

<details> <summary>
Or you can copy and paste one file for manual installation(I've included the file here):
</summary>

copy 'claude-arc-patch/NativeMessagingHosts/NEWcom.anthropic.claude_browser_extension.json'

paste in '/Users/~/Library/Application Support/Arc/User Data/NativeMessagingHosts/com.anthropic.claude_browser_extension.json'

and rename to remove NEW

Not sure if that is actually needed- I'll test.
</details>

- - -

Made this late at night with claude's help- will improve readme/installation instructions and functionality if desired.
