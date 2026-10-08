# MindNote v9-Fixed: Deployment Guide

## Quick Start

### Option 1: GitHub Pages (Recommended for Public Access)

1. **Create/Use GitHub Repository**
   ```bash
   git clone https://github.com/yourusername/mindnote.git
   cd mindnote
   ```

2. **Replace Files**
   - Extract `MindNote-v9-fixed-production.zip`
   - Copy all files into your repository root

3. **Push to GitHub**
   ```bash
   git add .
   git commit -m "feat: MindNote v9-fixed with connection deletion fix and notes feature"
   git push origin main
   ```

4. **Enable GitHub Pages**
   - Go to repository Settings → Pages
   - Select `main` branch as source
   - Save
   - Your app will be live at: `https://yourusername.github.io/mindnote`

---

### Option 2: Self-Hosted (Any Web Server)

1. **Extract the ZIP**
   ```bash
   unzip MindNote-v9-fixed-production.zip
   cd MindNote-v9-fixed
   ```

2. **Serve Locally**
   ```bash
   # Using Python 3
   python3 -m http.server 8000
   
   # Or using Node.js (if installed)
   npx http-server
   ```
   
   Access at: `http://localhost:8000`

3. **Deploy to Server**
   - Upload all files to your web server's public directory
   - Ensure `index.html` is served for routes (for service worker)
   - HTTPS is recommended for PWA features

---

### Option 3: Direct GitHub Push (If You Have Push Access)

Let me know your GitHub repository URL and I can push directly:

```bash
# Format: https://github.com/username/repository.git
```

---

## File Structure

```
MindNote-v9-fixed/
├── index.html          # Main application entry point
├── app.js              # Core application logic (FIXED)
├── styles.css          # Styling and theme
├── sw.js               # Service worker for offline support
├── sync.js             # Cross-device sync orchestration
├── manifest.json       # PWA manifest
├── favicon.ico         # App icon
├── icons/              # Icon assets for PWA
├── api/
│   └── sync.js         # Backend sync API
├── README.md           # Feature documentation
├── CHANGES.md          # Detailed changelog (NEW)
├── DEPLOYMENT.md       # This file
└── .gitignore          # Git ignore patterns
```

---

## What's Fixed in v9

### Bug Fixes
✅ **Connection Re-appearance Bug** - Connections no longer resurrect after deletion
- Implemented tombstone tracking system
- Connections are filtered on load, render, and sync
- Fully backward compatible

### New Features
✅ **Connection Notes** - Add metadata to connections
- 📝 Button in connection toolbar
- Textarea editor with auto-save
- Undo/redo support
- Syncs across devices

---

## Pre-Deployment Checklist

- [ ] All files extracted correctly
- [ ] `app.js` contains all 6 fixes (check for `d.conngone`)
- [ ] `CHANGES.md` is included in repository
- [ ] `.gitignore` is present
- [ ] No merge conflicts in `app.js`
- [ ] Service worker (`sw.js`) is unchanged

---

## Testing After Deployment

1. **Open the app** - Access at your deployed URL
2. **Test deletion fix:**
   - Create 2+ connections
   - Delete one
   - Refresh page → connection should stay deleted
   - Open in another device → connection should remain deleted

3. **Test connection notes:**
   - Select a connection
   - Click "Add note" button
   - Add text and click away
   - Refresh → note should persist
   - Sync to another device → note should appear

4. **Test sync:**
   - Open in two browser windows
   - Make changes in one → should sync to other
   - Try deleting connections → should sync deletion
   - Add notes → should sync across devices

---

## Troubleshooting

### "Connection Deleted" but Still Shows
- **Check:** Browser cache might have old version
- **Fix:** Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- **Verify:** DevTools → Application → Clear cache storage

### Connection Notes Not Saving
- **Check:** Ensure `app.js` EDIT 6 is present (editConnNote function)
- **Fix:** Search for `editConnNote` in app.js - should be around line 2088
- **Verify:** Check browser console for errors

### Sync Not Working
- **Check:** Ensure sync server is running (check `/api/sync.js`)
- **Fix:** Verify workspace code is entered in sync panel
- **Verify:** Check network tab in DevTools for `/api/sync` requests

### Service Worker Issues
- **Check:** Ensure `sw.js` is in root directory
- **Fix:** DevTools → Application → Service Workers → check status
- **Verify:** Clear cache and reload

---

## Environment Variables

No environment variables required for basic deployment. 

**Optional for sync backend:**
- `SYNC_API_URL` - Point to custom sync server (default: `/api/sync`)

---

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome/Edge | ✅ Full | Best experience |
| Firefox | ✅ Full | Full offline support |
| Safari | ✅ Good | PWA limited on iOS |
| Mobile | ✅ Full | Touch optimized |

---

## GitHub Actions CI/CD (Optional)

For automatic deployment on push:

**.github/workflows/deploy.yml**
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
```

---

## Support

If you encounter issues:

1. Check the **CHANGES.md** for what was fixed
2. Review **README.md** for feature documentation
3. Check browser console for errors (DevTools → Console)
4. Verify all files are deployed (check Network tab)

---

## Version Tracking

- **Current Version:** MindNote v9-fixed
- **Base Version:** MindNote v9
- **Last Updated:** October 8, 2026
- **Status:** Production Ready ✅

---

**Ready to deploy! 🚀**
