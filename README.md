# Builder's Desk Labs

A modular portfolio lab for production-style client MVPs, AI agents, workflow automation, data platforms, and full-stack product demonstrations.

## Architecture spine

Every demo follows a consistent product spine:

**Command Center → Workspace → Modules → Data Registry → Integrations → System Health**

Client-specific implementations live on dedicated `agent/*` branches and enter `main` through reviewed pull requests. Demo data must be synthetic and must never contain client secrets or personal records.
