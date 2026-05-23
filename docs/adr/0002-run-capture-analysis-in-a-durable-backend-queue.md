# Run Capture Analysis In A Durable Backend Queue

Sharebook will run Capture Analysis backend-side through durable asynchronous work rather than tying analysis to the mobile app process or a short-lived edge function. Capture must survive app closure, show a visible Analysis State, and eventually resolve to ready, partial, failed, or needs review without blocking the user's save flow. Supabase Edge Functions may handle fast intake and orchestration, but long-running AI enrichment should run in a managed background job runner with retries, concurrency controls, and observability.
