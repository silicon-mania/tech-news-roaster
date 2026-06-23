# Tech News Roaster

This context is the language of a product that turns a source tweet about tech news into multiple witty social drafts. It exists to keep product and editorial concepts precise as the tool takes shape.

## Language

**Generation Run**:
The parent attempt to turn a source tweet into candidate drafts and optional image options for the quote tweet.
_Avoid_: Session, job, request

**Manual Run**:
A generation run started by the user submitting a source tweet URL in the source tweet bar, keeping user-owned image selection and user image prompt.
_Avoid_: Interactive run, browser run, classic run

**Automated Run**:
A generation run started by the system from a discovered viral tweet while the user is away, owned by the operator account, and able to reach a final quote tweet image without human input while every system choice remains overridable afterward. It prepares the final quote tweet image and selected draft but never publishes to X; the operator still copies or downloads the pieces and posts manually.
_Avoid_: Background job, cron run, bot run

**Automated Selection**:
The rule by which an automated run makes, without human input, the choices a manual run leaves to the user: the first text draft, the first image original candidate, and the first generated variation. Each remains overridable once the operator opens the run.
_Avoid_: Auto-publish, locked choice, final pick

**Operator Account**:
An authenticated account that owns its operator's manual and automated runs. The tool admits a small Operator Allowlist of these independent accounts rather than one; each owns its runs in isolation (automated runs are copied per account, never shared), so this is still not a shared workspace.
_Avoid_: Multi-user workspace, team account, admin role

**Operator Allowlist**:
The normalized set of emails (parsed from the comma-separated `OPERATOR_ALLOWLISTED_EMAILS`) allowed to sign in, each provisioning its own Operator Account through the email-OTP flow. Membership — not equality against one address — decides admission; an unset or empty value admits nobody.
_Avoid_: Whitelist, user table, team roster

**Primary Operator**:
The first email in the Operator Allowlist. The unattended Discovery Sweep anchors its dedup state (seen tweets, News Coverage Clusters, author baselines) and the single expensive composition under this account before fanning each finished automated run out to the others. The first entry is therefore load-bearing — reordering or removing it re-anchors discovery under empty state and can start duplicate runs.
_Avoid_: Admin, owner, default operator

**Viral Tweet**:
A tweet from the discovery source that has crossed the system's virality bar and therefore qualifies to start an automated run, regardless of whether it carries images, videos, or text only.
_Avoid_: Trending topic, popular tweet, top tweet

**Discovery Source**:
The operator's followed accounts, watched by the system as the origin of viral tweets for automated runs. The algorithmic For You feed is deliberately excluded from the discovery source and reaches the product only through manual runs.
_Avoid_: For You feed, timeline scrape, home feed

**Tweet Discovery**:
The recurring, scheduled system activity that scans the discovery source over a trailing time window for viral tweets and starts automated runs from them, distinct from the per-run tweet retrieval that fetches one source tweet and its replies.
_Avoid_: Scroll, feed crawl, ingestion

**Discovery Sweep**:
One scheduled execution of tweet discovery, covering the tweets posted in the trailing window since the previous sweep. Consecutive sweeps may overlap their windows, and the system remembers which tweets it has already considered so the same tweet is never processed by two sweeps.
_Avoid_: Cron tick, batch job, poll cycle

**Discovery Service**:
The provider-agnostic server-side boundary that scans the discovery source and surfaces candidate viral tweets without binding the product language to a specific provider or access mechanism.
_Avoid_: X scraper, list poller, timeline client

**Author Baseline**:
The system's record of an author's normal engagement velocity, used to judge whether one of their tweets is viral relative to themselves rather than against a global threshold, so small and large accounts are treated fairly.
_Avoid_: Follower count, global threshold, average likes

**Newsworthiness Filter**:
The lightweight, permissive language-model judgment applied to a viral tweet before committing an automated run, deciding whether it is tech news worth a recap rather than off-topic viral noise. A tweet it rejects is dropped permanently and is not surfaced for manual recovery.
_Avoid_: Moderation, spam filter, keyword match

**News Coverage Cluster**:
The single tech-news event that several viral tweets are witnesses to, formed by grouping the viral tweets that are about the same news so that the event produces at most one automated run. The earliest viral tweet that crossed virality becomes that run's source tweet, with ties broken toward media presence and then author authority. Once a cluster has produced a run, later viral tweets joining the same cluster do not start another run.
_Avoid_: Story, topic, trend, thread

**Saved Run**:
A generation run that remains available to the user after creation, including its source tweet, user's direction, joke context snapshot, persisted selected image originals, user image prompt, image sets (including any Uploaded Image Sets), model provenance, run provenance (its origin — manual or automated — the image prompt source — user or default — and, for automated runs, the news coverage cluster it came from), date, and the latest edited version of each draft, and that can be reopened, edited again, inspected, downloaded, or deleted by the user without ever regenerating its drafts or images.
_Avoid_: History item, cache entry, record

**Saved Run Retention**:
The rule that every successful run is kept server-side under the operator account without a fixed count limit, while running and failed runs are not retained. An age-based limit may be introduced later if storage grows.
_Avoid_: Storage cleanup, pruning, history cap

**Successful Run**:
A generation run where joke context gathering has succeeded and at least one creative result area has succeeded, while text generation and image generation keep independent success or failure states.
_Avoid_: finished job, fully generated run

**Complete Run**:
A successful run that carries both pieces a Run Card needs — at least one draft and at least one generated image variation — so it can render a full Quote Repost. Only complete runs appear in the Runs Feed. A successful but incomplete run (image generation failed or never run) is still kept, but excluded from the feed and reachable only through the workspace's runs sidebar, where it can be inspected or deleted. Narrower than a Successful Run, which may have one creative area fail.
_Avoid_: Successful Run, partial run, ready-to-post run

**Running Run**:
A generation run that has been created and is visible in the runs list while joke context gathering, text generation, news-linked image discovery, or image generation is still in flight.
_Avoid_: Pending save, loading item, temporary run

**Run Label**:
A short generated label used to identify a run in the unified runs list. The default label is replaced by the first provider-generated label that becomes available, and the user does not edit it.
_Avoid_: Title, custom name, editable name, News Category

**User's Direction**:
Optional freeform guidance provided by the user to influence or challenge the creative angle of the text drafts. It does not steer image generation.
_Avoid_: Direction, prompt, instruction, preset

**Source Tweet**:
The original tweet selected by the user as the item to analyze and quote.
_Avoid_: Tweet, tweet URL, original post

**Source Tweet Preview**:
The visible representation of the source tweet shown alongside the drafts so the user can judge the quote-tweet candidates against the original post.
_Avoid_: Embed, metadata block, raw URL

**Source Tweet Bar**:
The workspace bar where the user submits a source tweet URL to start a generation run, shown in a primary presentation before any runs exist and a compressed presentation once runs are visible. Starting a run is confirmed as "Run started."
_Avoid_: Intake bar, search bar, URL field

**Source Tweet Media Reference**:
A neutral pointer to media attached to the Source Tweet, with only retrieval-oriented metadata such as kind, URL, preview URL, alt text, dimensions, or duration. It is not media bytes and does not interpret what the media shows.
_Avoid_: Media read, media extraction, image analysis

**Tweet Retrieval Service**:
The server-side integration layer that fetches the source tweet and its replies from an external retrieval provider without binding the product language to a specific API vendor.
_Avoid_: X API client, scraper, provider SDK

**Media Understanding Service**:
The service boundary that interprets source tweet media after tweet retrieval, including OCR, image reading, product UI interpretation, chart reading, and video frame understanding.
_Avoid_: Tweet Retrieval Service, image discovery, media downloader

**Generation Orchestrator**:
The server-side boundary that calls the connected AI providers, tracks provider progress, applies fallback rules, and returns a complete generation run to the client.
_Avoid_: Client coordinator, frontend workflow, provider client

**Single-Page Workspace**:
The manual-generation surface: one responsive page containing generation, source tweet reference, draft editing, and access to all saved runs. The Runs Feed is the product's landing page; the workspace is reached from it by the New Manual Run button. "Workspace" is the canonical feature name for this surface in code.
_Avoid_: Multi-page flow, wizard, separate editor, intake

**Generation Progress**:
The compact status surface that shows where context gathering, text generation, news-linked image discovery, and image generation are in the run without becoming a research panel.
_Avoid_: Research console, verbose timeline, hidden background work

**Runtime Status**:
The compact environment readiness surface that reports which Generation Run service boundaries are live, configured, local, unavailable, or degraded before the operator starts work.
_Avoid_: Debug dashboard, raw environment dump, hidden health check

**Runtime Readiness Gate**:
The rule that work cannot start unless every required service boundary is configured and ready: it disables the manual Generation Run action until the full live workflow is ready, and independently decides whether an automated Discovery Sweep starts at all — a not-ready sweep starts nothing that cycle, judged on a deliberately narrower ruleset than the manual gate. It favors full live workflow confidence over partial startup.
_Avoid_: Partial readiness, best-effort run, optional service startup

**Creative Result Area**:
A distinct workspace area for one kind of generated output, such as candidate drafts or image options, with its own progress and failure state.
_Avoid_: Mixed output feed, combined result card, monolithic result

**Quiet Failure Details**:
The hidden technical detail or log reveal available from a failed context or creative result area, while the main workspace shows only a concise failure state.
_Avoid_: Error wall, visible stack trace, recovery workflow

**Active Run**:
The single run currently shown in the center workspace — the manual-run surface, reached from the Runs Feed by a button. Selecting another run inside the workspace replaces it rather than opening multiple workspaces at once. Existing successful runs can also be browsed and edited from the Runs Feed as the Selected Run, without entering the workspace.
_Avoid_: Tab, secondary workspace, side-by-side run

**Runs Feed**:
The product's main page: the operator's successful runs shown newest-first as an infinite-scrolling list, each rendered as a card that previews the run as the quote tweet it will become. Selecting a card opens that run as the Selected Run for editing.
_Avoid_: Runs list, history sidebar, gallery, dashboard

**Selected Run**:
The single successful run whose editor is open in the right sidebar of the Runs Feed. Selecting a run card opens its sidebar, where the operator edits that run's draft text and switches its selected draft and selected generated image — all without entering the center workspace. The sidebar scrolls to expose every draft and image variation. From the sidebar the operator can also download the run's Final Quote Tweet Image — the same export already available in the workspace. Distinct from the Active Run, which is the run being generated in the center workspace.
_Avoid_: Active Run, opened run, focused card, preview

**Run Card**:
The unit of the Runs Feed: a faithful preview of the Quote Repost a successful run will become, rendered as an X quote-repost post — the Operator Account header (fixed brand name, handle, and avatar), the Selected Draft as commentary, the Final Quote Tweet Image as media, and the Source Tweet embedded as the quoted post — with static, decorative engagement chrome. Each of the two slots shows the operator's explicit choice, or the first of each — first draft, first generated variation — when none was chosen, so the card is ready as soon as both exist. Beneath it sit the run's generated time and the source tweet's posted time. Selecting a card opens its Selected Run editor.
_Avoid_: Final Quote Tweet Image, Source Tweet Preview, thumbnail, list row

**Draft Stack**:
The vertical set of three drafts inside the active run where one draft is expanded for full reading and editing while the others stay collapsed as compact previews.
_Avoid_: Three-column board, equal cards grid, side-by-side comparison

**Draft**:
A publishable candidate tweet produced within a generation run and intended for direct comparison, editing, and eventual posting as a quote tweet.
_Avoid_: Output, completion, response

**Selected Draft**:
The one candidate draft chosen as the run's quote-tweet commentary. The user chooses it in a manual run and the system takes the first draft in an automated run, and it can be changed afterward without regenerating the drafts.
_Avoid_: Final draft, winning draft, expanded draft

**Text Generation**:
The part of a generation run that creates exactly three candidate drafts from the joke context snapshot and user's direction.
_Avoid_: Text generation run, copy job, draft workflow

**Image Set**:
One selected image original plus exactly four generated image variations derived from it for use with a quote tweet. A generation run carries one source-derived image set plus zero or more Uploaded Image Sets; all are retained and shown.
_Avoid_: Visual set, image bundle, image pack

**Uploaded Image Set**:
An Image Set seeded by an Uploaded Image Original instead of a source-tweet or news-linked candidate, carrying that one uploaded original plus four generated variations made with the Default Image Prompt. A run may carry many, added at any point once the run exists and independent of whether its source-derived image set has been generated — so a manual run may reach a Complete Run through uploaded sets alone, never selecting a candidate. Each is retained and shown in upload order beneath any source-derived image set. A generation attempt that fails is itself retained as a failed Uploaded Image Set so its Quiet Failure Details stay available.
_Avoid_: Re-roll, regenerated image set, replacement image set

**Uploaded Image Original**:
The user-provided image that seeds an Uploaded Image Set, supplied directly by the operator rather than chosen from Image Original Candidates. Its origin is user-uploaded, distinct from source-tweet media and news-linked images, and it is stored as soon as it is uploaded so it stays visible even when its variations fail to generate.
_Avoid_: Selected Image Original, Image Original Candidate, source image

**News-Linked Images**:
Images gathered during news-linked image discovery that are directly tied to the underlying news, used to top up the image original candidates to four when the source tweet does not carry enough usable media.
_Avoid_: Search images, candidate images, scraped images

**News-Linked Image Discovery**:
The automatic initial-run step that gathers original image candidates directly tied to the underlying news, used to fill the image original candidates up to four when the source tweet has fewer than four usable images, separate from joke context gathering.
_Avoid_: Joke Context Gathering, generic image search

**Image Original Candidate**:
One of exactly four images offered for the image original selection, drawn first from the source tweet's own media and topped up with news-linked images when the tweet carries fewer than four usable images.
_Avoid_: News-Linked Image, thumbnail, search result

**Selected Image Original**:
The single image chosen as the input to image generation, taken from the source tweet's own media when available and otherwise from news-linked images, and preserved as the original image option inside the image set. It is locked once its four variations are generated and cannot be changed afterward without a new run.
_Avoid_: Source image, input image, chosen image

**Image Option**:
A non-editable image inside an image set, either the selected image original or one of the four generated variations derived from it, that can be opened for full-screen inspection or downloaded individually.
_Avoid_: Asset, picture, visual output

**Image Generation**:
The part of a generation run where one configured image model creates four variations from a single selected original and a prompt, using only that original and prompt and not the joke context snapshot. Its source-derived form runs once: exactly one image original is selected from four candidates and a prompt is provided — the user image prompt in a manual run, the default image prompt in an automated run. A run additionally accepts repeatable Uploaded Image Set generation, which appends new sets from Uploaded Image Originals using the default image prompt.
_Avoid_: Image generation run, visual job, image workflow

**Image Generation Service**:
The server-side integration layer that prepares selected image originals, calls the configured image model, and returns image sets without binding the product language to a specific image provider.
_Avoid_: Image provider client, Gemini client, visual generator

**User Image Prompt**:
Required freeform guidance provided by the user in a manual run to steer the four generated image variations for the selected image original.
_Avoid_: Image prompt, visual direction, generation prompt

**Default Image Prompt**:
The system-owned image prompt that an automated run uses in place of the user image prompt when generating the four image variations.
_Avoid_: User image prompt, fallback prompt, hardcoded prompt

**Model Provenance**:
The visible record of which AI company and model produced a draft, plus the configured image model used by image generation.
_Avoid_: Source, backend, engine

**Replies**:
The raw responses posted under the source tweet that may contain phrasing, jokes, criticism, or interpretations worth reusing or reacting to.
_Avoid_: Comments, thread noise

**Reply Signals**:
The inferred patterns, tensions, jokes, backlash, confusion, corrections, recurring interpretations, and representative snippets extracted from replies to help identify stronger editorial angles without carrying every raw reply.
_Avoid_: Sentiment, reply summary

**Outside-X Enrichment**:
Mandatory supporting context gathered beyond X in v2 to recover the underlying news and gather news-linked images, while keeping the source tweet as the anchor.
_Avoid_: Research panel, external source of truth

**Joke Context Gathering**:
The shared prerequisite context-gathering step for creative result areas that interprets the source tweet, its media, replies, author context, and supporting research so outputs can understand the fresh news even when few external reports exist yet.
_Avoid_: Outside-X Enrichment, basic tweet retrieval, web search

**Source Tweet Media Extraction**:
The first-class part of joke context gathering that reads images, screenshots, charts, product UI, video frames, and visible text inside the source tweet's media so the creative result areas can understand news carried by the media itself.
_Avoid_: Image discovery, thumbnail preview, attachment metadata

**Image Read**:
A structured interpretation of a Source Tweet image that captures what is visible, OCR-like text, and relevant screenshot, chart, or product UI cues.
_Avoid_: Image caption, image search result, thumbnail metadata

**Video Read**:
A structured interpretation of a Source Tweet video that may combine spoken transcript, sampled-frame summaries, visible text, and stated limitations. It is not merely an audio transcript.
_Avoid_: Transcript, video download, full video analysis

**Author Context**:
The structured reading of who posted the source tweet, why their identity matters to the news, and whether they are acting as a founder, employee, journalist, researcher, company account, investor, or commentator, without becoming a full profile dossier.
_Avoid_: Biography, profile research, persona file

**Joke Context Quality**:
The internal confidence that joke context gathering has enough understanding to support strong drafts, especially when the source tweet is short and its media carries much of the context.
_Avoid_: Completeness score, research status, media success flag

**Joke Context Snapshot**:
The full structured context gathered from the source tweet, media, replies, author context, and supporting research that the user can inspect in a clean format through a quiet UI reveal, without acting as an approval checkpoint for generation.
_Avoid_: Research panel, debug output, retry form

**Joke Context Debug Log**:
The complete failure log for joke context gathering that is hidden behind a quiet reveal when context gathering fails, while the main UI shows only a concise failure state.
_Avoid_: Normal research output, visible stack trace, user action form

**Structured Joke Context**:
The fixed shape of the joke context snapshot that separates the source tweet's claim, media read, author context, reply signals, supporting facts, unknowns, jokeable tensions, forbidden assumptions, and context quality.
_Avoid_: Loose summary, raw research dump, model notes

**Jokeable Tensions**:
The contradictions, pressures, absurdities, and uncomfortable trade-offs in the source tweet's context that can become the raw material for strong drafts.
_Avoid_: Summary points, joke ideas, funny facts

**Forbidden Assumptions**:
The unsupported claims or misleading leaps that joke context gathering explicitly marks as unavailable, so drafts can reframe facts surprisingly without becoming misinformation.
_Avoid_: Safety disclaimer, moderation policy, fact-check report

**Editorial Interpretation**:
The system's overall reading of the source tweet, replies, and surrounding context that it uses to choose an angle and a draft's tone.
_Avoid_: Analysis, reasoning, understanding

**Visible Rationale**:
A user-revealed explanation of why a draft was generated with a particular angle or draft's tone.
_Avoid_: Analysis panel, explanation, chain of thought

**Angle**:
The editorial framing through which a draft presents the source tweet and its surrounding context.
_Avoid_: Joke, take, spin

**Angle Diversity**:
The requirement that drafts within a generation run explore meaningfully different editorial angles rather than near-duplicate phrasings of the same idea.
_Avoid_: Variety, randomness, paraphrase spread

**Direction Coverage**:
The requirement that at least one draft in a generation run meaningfully reflects the user's direction when that direction is relevant.
_Avoid_: Prompt obedience, instruction following

**Attention Length**:
The practical length constraint that keeps a draft short and compact enough to hold a reader's attention, independent of any platform-imposed character limit.
_Avoid_: Character limit, max length, platform limit

**Draft's Tone**:
The expressive manner a draft uses to deliver its angle, such as dry, sharp, sarcastic, understated, or roast-leaning.
_Avoid_: Tone, vibe, mood

**Selected Generated Image**:
The one generated Image Option — always one of the four variations, never an original — chosen as the picture placed inside the Final Quote Tweet Image, and resolvable to a variation in any of the run's image sets, source-derived or uploaded: the user chooses it in a manual run and the system takes the first variation in an automated run. It is distinct from the Selected Image Original, which is the input to image generation.
_Avoid_: Selected Image Original, selected variation, composite image, chosen image

**Final Quote Tweet Image**:
The shareable image a generation run produces by placing the run's News Category stamp over the Selected Generated Image, using the fixed Silicon Mania layout while leaving every other visual element of that layout unchanged.
_Avoid_: Quote Tweet image, final card, composite, meme

**News Category**:
The fixed-vocabulary classification of the source tweet's news, rendered as the headline stamp on the Final Quote Tweet Image. A language model auto-selects one value while the run generates; the operator can override it afterward — re-picking another value or entering a custom word — and the chosen value is the one the run keeps. The ten values are LAUNCHED (a new company appears or leaves stealth), DROPPED (a substantial product or body of work ships — an app, a major release, an album, a model), ACQUIRED (one company buys or merges with another), SIGNED (a notable person joins a different company), FIRED (a person is forced out, or staff are laid off), RESIGNED (a person voluntarily steps down), FUNDED (a company raises a funding round in exchange for shares), PUBLISHED (a lighter editorial or creative piece — an essay, article, blog post, or single song), DRAMA (public controversy fitting none of the above), and VIRAL (the residual when nothing more specific applies, also shown when classification fails).
_Avoid_: Run Label, label, tag, headline, LABEL GOES HERE

## Editing

**Plain-Text Editing**:
Drafts are edited as plain text, without rich-text formatting controls, while preserving user-entered line breaks for copying and reuse.
_Avoid_: Rich text, WYSIWYG editor, formatted editor

**Autosave**:
The automatic persistence behavior that saves a generation run immediately after successful generation and saves later draft edits without a manual save action, using a short debounce.
_Avoid_: Save action, submit edits, manual save

**Provider Fallback**:
The text-generation-only behavior that preserves a complete three-draft result by substituting a failed provider draft with another successful provider draft, while keeping model provenance visible to the user and disclosing that fallback occurred.
_Avoid_: Retry noise, hidden substitution, silent replacement

**No Automatic Retry**:
The rule that failed joke context gathering, text generation, news-linked image discovery, image generation, or provider calls are not automatically retried by the product.
_Avoid_: Retry policy, silent retry, background retry

## Publish Modes

**Quote Repost**:
The final piece of content a generation run exists to produce: the Operator Account's quote of the Source Tweet — the Selected Draft shown as commentary above the Final Quote Tweet Image as media, quoting the embedded Source Tweet. The product never publishes it; the operator copies or downloads the pieces and posts the Quote Repost manually on X. This is the canonical name for the final content. "Quote Tweet" survives only inside the established "Final Quote Tweet Image" asset name.
_Avoid_: Quote Tweet, retweet with text, reply, repost
