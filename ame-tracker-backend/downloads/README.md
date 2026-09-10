# Place the built AME Tracker Sync Agent installer here.
#
# Expected filename: AME-Tracker-Sync-Agent-Setup.exe
#
# Build steps:
#   cd ame-tracker-sync-agent
#   npm run dist
#   copy dist\AME Tracker Sync Agent Setup 1.0.0.exe ..\ame-tracker-backend\downloads\AME-Tracker-Sync-Agent-Setup.exe
#
# The backend will then serve this file at:
#   GET /downloads/AME-Tracker-Sync-Agent-Setup.exe   (static)
#   GET /api/downloads/sync-agent/file                 (streamed download)
