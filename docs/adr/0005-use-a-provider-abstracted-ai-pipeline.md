# Use A Provider-Abstracted AI Pipeline

Sharebook will route Capture Analysis through provider-abstracted AI tasks rather than hardcoding one model into product logic. The default strategy is to use cheap multimodal extraction first, keep OpenAI as a quality fallback and embedding provider, record model and prompt versions with each result, and let the evaluation harness decide when a model should be promoted, replaced, or reserved for fallback.
