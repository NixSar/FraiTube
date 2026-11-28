# Changelog

## Unreleased

- Backups are zip files. A 7z backup made by version 0.9.10 or older is restored with version 0.9.10; make a new backup after updating.
- 7-Zip is no longer part of FraiTube. Zip files are read and written with fflate.

## 0.9.10 - 2026-11-27

- Search shows videos and channels together, and suggests searches as you type.
- Going back to a search brings its results back right away.
- Shorts can be shown. Turn on Show Shorts in Settings.
- Settings are in a new order, the most important ones first.
- Clicking the timeline right next to the current position jumps there.

## 0.9.9 - 2026-11-25

- ARM64 versions for Windows and Linux: FraiTube-0.9.9-setup-arm64.exe for Windows on ARM and FraiTube-0.9.9-aarch64.AppImage for ARM64 Linux. The update check downloads the file for the computer's processor.

## 0.9.8 - 2026-11-24

- Back and forward: arrows in the top bar, Alt+Left and Alt+Right, and the mouse side buttons. A page reached by going back or forward returns to where it was scrolled.
- A search button in the search field.
- New window on a video's page opens the start page, not the same video again.

## 0.9.7 - 2026-11-24

- Update check: when FraiTube starts, a banner says when a newer version is out, and the About page checks for updates. Download fetches the installer from GitHub and checks it against GitHub's checksum. On Windows it can then install it, and on Linux it shows the AppImage in its folder. A setting in General turns off the check on start.

## 0.9.6 - 2026-11-24

- Default quality replaces Highest automatic quality: choose Max, any YouTube quality from 4320p to 144p, or Auto. Videos start at the nearest quality they have, and Auto is no longer held at 1080p.

## 0.9.5 - 2026-11-24

- Channel pages: click a channel's name or icon to see its newest videos, with a search field that searches inside the channel.
- Live streams: a Live filter in search, live playback, and the live streams of subscribed channels in New videos.
- A setting for how often New videos refreshes, from every hour to every 24 hours, or only on Refresh.
- Filters on New videos: videos or live streams, unwatched or in progress, date, channel and title.
- Search history under the search box. It syncs, and Settings can turn it off, set how many searches are kept, and clear it.
- Screenshots and a download link in the README.

## 0.9.0 - 2026-11-23

- Favorites: add a video from its ⋮ menu and find it on the Favorites page.
- A ⋮ menu on every video: play in a new window, mark as watched or unwatched, add to favorites.
- Videos are marked as watched once they play to their end.
- New videos shows the last loaded videos at once while it checks for more.
- An About page with the version, license, links, data folder and the projects FraiTube is built on.
- Reload and Share on the watch page, and a clear message when YouTube refuses subtitles.
- A setting to move the video to picture-in-picture when leaving its page.
- Clear buttons ask before clearing.
- Icons in the side column, a one-row player bar with a subtitles menu, and layouts that fit narrow windows.
- The side column has New videos for the video feed and Subscriptions for the channel list.
- Starting FraiTube while it runs opens a new window in the running app.

## 0.8.0 - 2026-11-23

The first version.

- Search for videos and channels, and open a YouTube video link from the search bar.
- A player with chapters, frame previews on the timeline, subtitles and volume up to 200%.
- SponsorBlock segment skipping.
- The video's description, channel and comments under the player.
- Subscriptions without an account, with a feed of new videos and each channel's icon.
- History that remembers where each video stopped, with Continue watching.
- Picture-in-picture in its own always-on-top window.
- Many windows.
- Import of subscriptions and history from FreeTube and NewPipe.
- Sync between computers through a shared folder or rclone.
- Backup to a single 7z file, and restore from it.
- Themes, an accent color and a choice of start page.
