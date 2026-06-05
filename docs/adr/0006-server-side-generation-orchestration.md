# Server-Side Generation Orchestration

The application uses a server-side generation orchestrator behind internal Next.js API routes rather than coordinating provider calls directly in the browser. We chose this because provider keys, prompting, fallback logic, and provider-specific behavior belong behind a protected boundary, while the client still receives progressive updates so the running run can feel immediate and visibly advance as drafts arrive.
