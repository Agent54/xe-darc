# open -a "Google Chrome Beta" --args -   --cardboard  
#  --no-startup-window  --managed-mode --remote-debug-mode
# /Users/jan/Library/Application\ Support/Google/Chrome\ Beta/ Profile\ 1
# /Applications/Google\ Chrome\ Beta.app/Contents/MacOS/Google\ Chrome\ Beta --user-data-dir=/Users/jan/Dev/xe/darc/profile2 --silent-launch --remote-debugging-port=9226 --remote-allow-origins=https://localhost:5194 isolated-app://j3ehgmq7ow3bbasrwtnk5dfp66jg6geu7gn3dipnqysqlmsji2qqaaac


# open -a "Google Chrome Beta" --args -   --cardboard  
#  --no-startup-window  --managed-mode --remote-debug-mode
# /Users/jan/Library/Application\ Support/Google/Chrome\ Beta/ Profile\ 1
# /Applications/Google\ Chrome\ Beta.app/Contents/MacOS/Google\ Chrome\ Beta --user-data-dir=/Users/jan/Dev/xe/darc/profilerepro --silent-launch --remote-debug-mode --no-startup-window

dtach -A /tmp/darc.socket /Applications/Google\ Chrome\ Beta.app/Contents/MacOS/Google\ Chrome\ Beta --user-data-dir=/Users/jan/Dev/xe/darc/profile2 --silent-launch --remote-debugging-port=9226 --disable-features=CADisplayLinkInBrowser --remote-allow-origins=https://localhost:5194 isolated-app://j3ehgmq7ow3bbasrwtnk5dfp66jg6geu7gn3dipnqysqlmsji2qqaaac
