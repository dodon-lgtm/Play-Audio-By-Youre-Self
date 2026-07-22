# TODO: Media Session API - Android Notification Fix

## Steps:
- [x] Step 1: Analyze code and create plan
- [x] Step 2: Edit `js/player.js` - Add `import { getCover } from './db.js'`
- [x] Step 3: Edit `js/player.js` - Modify `_updateMediaSession()` to be async with artwork support
- [x] Step 4: Edit `js/player.js` - Call `_updateMediaSession()` from `bindAndPlayTrack()`
- [x] Step 5: Added `blobToDataURL()` helper function to `player.js`
- [x] Step 6: Verify no other files need changes

