# Scheduled Invoice Cron Setup (Self-Hosted VM)

The app's scheduled-invoice runner is exposed as a single HTTP endpoint:

```
POST /api/cron/send-scheduled-invoices
Authorization: Bearer $CRON_SECRET
Content-Type: application/json

{ "dryRun": false }
```

It iterates clients with `invoice_schedule_enabled = true`, checks each
client's `invoice_schedule_weeks` interval against either `last_invoice_sent`
or `invoice_schedule_anchor`, and for any client that's due:

1. Pulls all billable time entries newer than `last_invoice_sent`.
2. Pulls all uninvoiced expenses for the client's projects.
3. Creates an invoice draft, marks expenses as `invoiced=true`, increments `next_invoice_number`.
4. If `invoice_schedule_auto_send=true`, sends the invoice via Resend using your **Email Format** template.
5. Updates the invoice status to `sent` and stamps `last_invoice_sent`.

A `GET` on the same path returns a preview of upcoming runs (used by the calendar's "Automated Email Being Sent" markers).

---

## 1. Set the cron secret

Add to `.env.local` (or your VM's environment):

```
CRON_SECRET=<long-random-string>
```

Generate with: `openssl rand -hex 32`

Restart the Next.js process so the new env var is picked up.

---

## 2. Hosting modes

### A) Linux VM (systemd timer — recommended)

Create `/etc/systemd/system/timetracker-invoices.service`:

```ini
[Unit]
Description=TimeTracker scheduled-invoice runner
After=network.target

[Service]
Type=oneshot
EnvironmentFile=/etc/timetracker.env
ExecStart=/usr/bin/curl -fsS -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://127.0.0.1:3000/api/cron/send-scheduled-invoices
```

Create `/etc/systemd/system/timetracker-invoices.timer`:

```ini
[Unit]
Description=Run TimeTracker invoice runner every 2 weeks

[Timer]
# Fires every day at 09:00 — the endpoint itself decides which clients are due.
# Run daily so a 2-week schedule never drifts past its anchor by more than 24h.
OnCalendar=*-*-* 09:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Place `CRON_SECRET=...` in `/etc/timetracker.env` (chmod 600), then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now timetracker-invoices.timer
systemctl list-timers timetracker-invoices.timer
```

### B) Linux VM (classic cron)

```cron
# /etc/cron.d/timetracker-invoices
CRON_SECRET=<your-secret>
0 9 * * * www-data curl -fsS -X POST -H "Authorization: Bearer ${CRON_SECRET}" -H "Content-Type: application/json" -d '{}' http://127.0.0.1:3000/api/cron/send-scheduled-invoices >> /var/log/timetracker-invoices.log 2>&1
```

### C) Windows VM (Task Scheduler)

```powershell
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument @'
-NoProfile -Command "Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/cron/send-scheduled-invoices -Headers @{Authorization='Bearer YOUR_SECRET'} -ContentType application/json -Body '{}'"
'@
$trigger = New-ScheduledTaskTrigger -Daily -At 9am
Register-ScheduledTask `
  -TaskName "TimeTracker Invoices" `
  -Action $action `
  -Trigger $trigger `
  -RunLevel Highest
```

---

## Why daily, not every-2-weeks?

A 2-week cron interval means a single missed run (VM reboot, network blip)
delays the invoice by another full 2 weeks. Running daily is cheap (the
endpoint short-circuits when nothing is due) and keeps each client's actual
schedule pinned to its `invoice_schedule_anchor` instead of drifting.

The interval per client is set in **Clients → Edit → Auto-invoice on a schedule → Every (weeks)**.

---

## Manual / test runs

Dry run (computes what would be invoiced but skips DB writes and sending):

```bash
curl -X POST http://localhost:3000/api/cron/send-scheduled-invoices \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

Check upcoming schedule (no auth required, used by the Calendar page):

```bash
curl http://localhost:3000/api/cron/send-scheduled-invoices
```

---

## What lands in each scheduled invoice

- **Time entries** — every `billable=true` time entry across the client's projects, dated **after** the previous `last_invoice_sent`.
- **Expenses** — every `invoiced=false` expense across the client's projects (regardless of date). Expenses are auto-marked `invoiced=true` once added to the draft so they aren't billed twice.
- **Tax** — defaults to 0 on scheduled invoices. Adjust the draft before send if you need tax — set `invoice_schedule_auto_send=false` to force draft-only mode.
