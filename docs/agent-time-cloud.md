# Agent Time cloud connection

Agent Time runs on the desktop as a user service and sends interval summaries to the protected cloud relay once per minute. The relay stores only start/end time, agent, project name, and live status—never transcript text, local paths, or prompts.

For a TimeTracker instance running on another machine or VM, set these server-only environment variables and restart TimeTracker:

```env
AGENT_TIME_REMOTE_URL=https://agent-time-cloud-production.up.railway.app/v1/snapshot
AGENT_TIME_API_KEY=<the private key stored in the desktop's agent-time-cloud.key file>
```

Do not prefix either variable with `NEXT_PUBLIC_`, and do not commit the key. Once set, TimeTracker's **Import Agent Time** button automatically reads the cloud relay instead of requiring a local Agent Time port.
