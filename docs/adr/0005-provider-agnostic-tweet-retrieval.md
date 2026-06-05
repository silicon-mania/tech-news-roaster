# Provider-Agnostic Tweet Retrieval

The product uses a server-side tweet retrieval service that can call whichever external provider reliably returns the source tweet and replies, rather than binding the application directly to the official X API. We chose this because tweet and reply access is a critical dependency for product quality, and a provider-agnostic boundary gives us more flexibility around reliability, quotas, and retrieval constraints.
