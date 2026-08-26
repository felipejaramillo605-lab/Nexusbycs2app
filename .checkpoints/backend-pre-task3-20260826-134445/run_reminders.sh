#!/bin/bash
# Cron job to run reminder service every hour
# Add to crontab with: crontab -e
# Then add this line:
# 0 * * * * /app/backend/run_reminders.sh >> /var/log/nexus_reminders.log 2>&1

cd /app/backend
python3 send_reminders.py
