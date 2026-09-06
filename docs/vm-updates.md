# Automatic VM updates

The production VM is `10.40.40.3`. PM2 manages the `timetracker` app on port 3000.
A systemd timer checks GitHub's `master` branch every minute. Only pushed commits
are deployed; uncommitted desktop edits are not published.

Each update installs dependencies from the lockfile, runs unit tests and a production
build in a new directory, and then restarts the PM2 app. The updater checks the
tracker page and the served commit ID before marking a release healthy. Build
failures leave the current app running; activation or health failures restore the
previous release. Failed commits are held until another commit arrives or an
administrator explicitly retries them.

The original checkout `/root/timetracker` remains intact. Its `.env.local` is shared
with release directories, so application credentials and email-key changes persist.
Releases live in `/root/timetracker-releases`; the updater keeps the current and
previous release. The PM2 baseline and updater state are private files in
`/var/lib/timetracker-deploy`. Existing PM2 environment settings are preserved.

## Operations on the VM

```bash
# Timer status and update logs
sudo systemctl status timetracker-update.timer
sudo journalctl -u timetracker-update.service -n 60 --no-pager

# Live commit
curl -fsS http://127.0.0.1:3000/deploy-version.txt

# Check master immediately
sudo systemctl start timetracker-update.service

# Retry a failed commit
sudo /usr/local/sbin/timetracker-update --retry

# Restore the previous release and hold the current master commit
sudo /usr/local/sbin/timetracker-update --rollback

# Pause or resume automatic checks
sudo systemctl disable --now timetracker-update.timer
sudo systemctl enable --now timetracker-update.timer
```

The root-owned updater is installed at `/usr/local/sbin/timetracker-update`, with
configuration in `/etc/timetracker-deploy.conf`. Its reviewed sources and systemd
units are in `scripts/deploy/`. Changes to these infrastructure files require an
explicit reinstall; application deploys do not replace the updater itself.

Before pushing production changes, follow the repository's mobile fixture verification
in `AGENTS.md`. The VM runs build and unit checks again. No GitHub Actions runner or
Codex installation is needed on the VM, and no inbound GitHub connection is required.
