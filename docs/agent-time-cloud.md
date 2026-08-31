# Agent Time local-network connection

Agent Time runs directly on the desktop as a user service. TimeTracker on the VM reads it over the local network; no cloud relay, account, or API key is used. The default is already set for this network.

For a TimeTracker instance on `10.40.40.3`, Agent Time on `10.40.40.10` works automatically. If the address changes later, override it with this server-only environment variable and restart TimeTracker:

```env
AGENT_TIME_REMOTE_URL=http://10.40.40.10:8765/api/data
```

Do not prefix the variable with `NEXT_PUBLIC_`. The Agent Time service binds only to `10.40.40.10` and accepts API requests only from `10.40.40.3`, so it is reachable only for the VM on the LAN. Once set, TimeTracker's **Import Agent Time** button reads Agent Time directly.
