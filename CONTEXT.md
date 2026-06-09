# Tech News Roaster

This context is the language of a product that turns a source tweet about tech news into multiple witty social drafts. It exists to keep product and editorial concepts precise as the tool takes shape.

## Language

**Generation Run**:
The parent attempt to turn a source tweet into candidate drafts, a visual joke set, and optional image options for the quote tweet.
_Avoid_: Session, job, request

**Saved Run**:
A generation run that remains available to the user after creation, including its source tweet, user's direction, joke context snapshot, visual joke direction, visual joke set, selected visual joke, persisted selected image originals, user image prompt, image sets, model provenance, date, and the latest edited version of each draft, and that can be reopened, edited again, inspected, downloaded, or deleted by the user without ever regenerating its drafts, visual jokes, or images.
_Avoid_: History item, cache entry, record

**Saved Run Retention**:
The automatic limit that keeps only the ten latest successful saved runs in browser-only storage, without counting running or failed runs toward that limit.
_Avoid_: Storage cleanup, pruning, history cap

**Successful Run**:
A generation run where joke context gathering has succeeded and at least one creative result area has succeeded, while text generation, visual joke generation, and image generation keep independent success or failure states.
_Avoid_: Complete run, finished job, fully generated run

**Running Run**:
A generation run that has been created and is visible in the runs list while joke context gathering, text generation, visual joke generation, news-linked image discovery, or image generation is still in flight.
_Avoid_: Pending save, loading item, temporary run

**Run Label**:
A short generated label used to identify a run in the unified runs list. The default label is replaced by the first provider-generated label that becomes available, and the user does not edit it.
_Avoid_: Title, custom name, editable name

**User's Direction**:
Optional freeform guidance provided by the user to influence or challenge the creative angle of the text drafts. It does not steer visual joke generation or image generation.
_Avoid_: Direction, prompt, instruction, preset

**Source Tweet**:
The original tweet selected by the user as the item to analyze and quote.
_Avoid_: Tweet, tweet URL, original post

**Source Tweet Preview**:
The visible representation of the source tweet shown alongside the drafts so the user can judge the quote-tweet candidates against the original post.
_Avoid_: Embed, metadata block, raw URL

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
The product's one responsive page that contains generation, source tweet reference, draft editing, and saved run access without navigating to separate pages.
_Avoid_: Multi-page flow, wizard, separate editor

**Generation Progress**:
The compact status surface that shows where context gathering, text generation, news-linked image discovery, visual joke generation, and image generation are in the run without becoming a research panel.
_Avoid_: Research console, verbose timeline, hidden background work

**Creative Result Area**:
A distinct workspace area for one kind of generated output, such as candidate drafts, image options, or visual jokes, with its own progress and failure state.
_Avoid_: Mixed output feed, combined result card, monolithic result

**Quiet Failure Details**:
The hidden technical detail or log reveal available from a failed context or creative result area, while the main workspace shows only a concise failure state.
_Avoid_: Error wall, visible stack trace, recovery workflow

**Active Run**:
The single run currently shown in the center workspace. Selecting another run replaces it rather than opening multiple workspaces at once.
_Avoid_: Tab, secondary workspace, side-by-side run

**Draft Stack**:
The vertical set of three drafts inside the active run where one draft is expanded for full reading and editing while the others stay collapsed as compact previews.
_Avoid_: Three-column board, equal cards grid, side-by-side comparison

**Draft**:
A publishable candidate tweet produced within a generation run and intended for direct comparison, editing, and eventual posting as a quote tweet.
_Avoid_: Output, completion, response

**Text Generation**:
The part of a generation run that creates exactly three candidate drafts from the joke context snapshot and user's direction.
_Avoid_: Text generation run, copy job, draft workflow

**Image Set**:
One user-selected news-linked image plus exactly two generated image variations derived from it for use with a quote tweet. A generation run may include one or two image sets.
_Avoid_: Visual set, image bundle, image pack

**News-Linked Images**:
The one to five images gathered during news-linked image discovery that are directly tied to the underlying news and eligible for user selection before image generation.
_Avoid_: Search images, candidate images, scraped images

**News-Linked Image Discovery**:
The automatic initial-run step that gathers original image candidates directly tied to the underlying news for later image generation, separate from joke context gathering.
_Avoid_: Joke Context Gathering, visual joke research, generic image search

**Selected Image Original**:
A news-linked image chosen by the user for image generation and preserved as the original image option inside an image set.
_Avoid_: Source image, input image, chosen image

**Image Option**:
A non-editable image inside an image set, either the original news-linked image or one generated variation derived from it, that can be opened for full-screen inspection or downloaded individually.
_Avoid_: Asset, picture, visual output

**Image Generation**:
The one-time part of a generation run where the user selects one or two news-linked images and provides one user image prompt before one configured image model creates variations using only the selected images and that prompt, without using the joke context snapshot in v3.
_Avoid_: Image generation run, visual job, image workflow

**Image Generation Service**:
The server-side integration layer that prepares selected image originals, calls the configured image model, and returns image sets without binding the product language to a specific image provider.
_Avoid_: Image provider client, Gemini client, visual generator

**Visual Joke Generation**:
The part of a generation run that starts after joke context gathering and creates candidate visual jokes from the joke context snapshot and visual joke direction, without depending on text generation, image selection, or placing those jokes on an image.
_Avoid_: Better draft generation, image generation with text, caption overlay

**Visual Joke Workflow**:
The internal creative process for visual joke generation that can gather context, extract jokeable tensions, generate pattern-diverse candidates, critique them against visual joke taste, and return the strongest visual joke set.
_Avoid_: Single prompt, joke completion, caption call

**Visual Joke Service**:
The provider-agnostic service boundary that runs the visual joke workflow and returns a visual joke set without binding product language to a specific AI provider or model.
_Avoid_: OpenAI joke call, Gemini joke call, caption generator

**Visual Joke Critic**:
The internal quality filter that ranks or rejects visual joke candidates against visual joke taste, joke title length, factual support, joke target, earned edge, and joke pattern diversity before the visual joke set is returned.
_Avoid_: User rating, moderation panel, visible score

**Boring Accuracy**:
A factually correct but flat visual joke candidate that summarizes the news without surprise, tension, misdirection, or a strong punchline, and should be rejected by the visual joke critic.
_Avoid_: Safe summary, neutral title, accurate caption

**Visual Joke Direction**:
Global system-owned guidance for visual joke generation that steers the joke's tone, angle, and style separately from the user's direction and the user image prompt, and is only inspectable as the full internal prompt through a quiet UI reveal.
_Avoid_: User's Direction, User Image Prompt, image prompt

**Visual Joke Taste**:
The system-owned humor standard for visual jokes, favoring dark, sharp tech satire that reads as a ruthless observer of tech incentives while avoiding condescending, patronizing, or mean-spirited jokes.
_Avoid_: Prompt wording, personal preference, joke settings

**Tech-Native Punchline**:
A punchline that usually uses the language, references, and absurdities of the tech ecosystem to make the news feel instantly legible to the intended audience, without forcing a tech term when a sharper joke works better.
_Avoid_: Generic joke, broad meme, non-tech punchline

**Context-Supported Reference**:
A reference used in a visual joke that is either broadly legible to the tech audience or explicitly present in the joke context snapshot, avoiding obscure outside knowledge that would fail at scroll speed.
_Avoid_: Deep lore, random drama reference, unexplained niche callback

**Truthful Misdirection**:
A visual joke pattern that frames a real technical or contextual fact in a surprising way that sounds wrong at first but becomes defensible once the reader understands the reference.
_Avoid_: Misinformation, clickbait lie, unsupported twist

**Earned Edge**:
The selective use of profanity, sexual bluntness, dark humor, or harsh phrasing when it clarifies the absurdity of public news involving named news actors or makes the punchline stronger, rather than acting as decorative shock value or private humiliation.
_Avoid_: Random profanity, shock value, edgy filler

**User Image Prompt**:
Required freeform guidance provided by the user to steer generated image variations for the selected news-linked image or images.
_Avoid_: Image prompt, visual direction, generation prompt

**Model Provenance**:
The visible record of which AI company and model produced a draft, plus the configured image model used by image generation.
_Avoid_: Source, backend, engine

**Replies**:
The raw responses posted under the source tweet that may contain phrasing, jokes, criticism, or interpretations worth reusing or reacting to.
_Avoid_: Comments, thread noise

**Reply Signals**:
The inferred patterns, tensions, jokes, backlash, confusion, corrections, recurring interpretations, and representative snippets extracted from replies to help identify stronger editorial angles and visual joke opportunities without carrying every raw reply.
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

**Author Context**:
The structured reading of who posted the source tweet, why their identity matters to the news, and whether they are acting as a founder, employee, journalist, researcher, company account, investor, or commentator, without becoming a full profile dossier.
_Avoid_: Biography, profile research, persona file

**Joke Context Quality**:
The internal confidence that joke context gathering has enough understanding to support strong visual jokes, especially when the source tweet is short and its media carries much of the context.
_Avoid_: Completeness score, research status, media success flag

**Joke Context Snapshot**:
The full structured context gathered from the source tweet, media, replies, author context, and supporting research that the user can inspect in a clean format through a quiet UI reveal, without acting as an approval checkpoint for visual joke generation.
_Avoid_: Research panel, debug output, retry form

**Joke Context Debug Log**:
The complete failure log for joke context gathering that is hidden behind a quiet reveal when context gathering fails, while the main UI shows only a concise failure state.
_Avoid_: Normal research output, visible stack trace, user action form

**Structured Joke Context**:
The fixed shape of the joke context snapshot that separates the source tweet's claim, media read, author context, reply signals, supporting facts, unknowns, jokeable tensions, forbidden assumptions, and context quality.
_Avoid_: Loose summary, raw research dump, model notes

**Jokeable Tensions**:
The contradictions, pressures, absurdities, and uncomfortable trade-offs in the source tweet's context that can become the raw material for strong visual jokes.
_Avoid_: Summary points, joke ideas, funny facts

**Forbidden Assumptions**:
The unsupported claims or misleading leaps that joke context gathering explicitly marks as unavailable, so visual jokes can use truthful misdirection without becoming misinformation.
_Avoid_: Safety disclaimer, moderation policy, fact-check report

**Joke Target**:
The system, incentive, product dynamic, company behavior, platform power, market logic, or hype cycle that a visual joke aims its bite at, rather than individual users or harmless people.
_Avoid_: Victim, punchline subject, mocked person

**Named News Actor**:
A public figure, company, brand, product, or organization that is central to the source tweet's news and can be named directly in a visual joke.
_Avoid_: Random celebrity, unrelated brand, private person

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

**Visual Joke**:
A short, non-editable joke or caption generated from the source tweet, its media, replies, author context, and supporting research, intended to be the first readable element on the Quote Tweet image and available for copy or selection.
_Avoid_: Image caption, meme text, overlay text

**Joke Title**:
The preferred format for a visual joke: a short, title-like one-liner that gives a fast read on the news while landing like an insider punchline, usually three to twelve words.
_Avoid_: Paragraph joke, long caption, explanatory copy

**Visual Joke Set**:
The ranked five to eight polished, publishable visual jokes produced for one generation run, with eight as the default target and the strongest candidate shown first.
_Avoid_: Joke list, caption batch, meme options

**Recommended Visual Joke**:
The first visual joke in the ranked visual joke set, shown with a quiet recommended label while all other visual jokes remain visible.
_Avoid_: Winner, only option, hidden ranking

**Bold Joke Candidate**:
A higher-risk visual joke candidate included when the context supports earned edge, named news actors, or strong truthful misdirection, so the visual joke set can explore a possible standout without making every joke risky.
_Avoid_: Unsafe joke, random shock, default edge

**Selected Visual Joke**:
The optional visual joke chosen by the user from the visual joke set and persisted for later image/title work without gating image generation in v3.
_Avoid_: Required joke choice, final caption, edited joke

**Joke Pattern Diversity**:
The requirement that a visual joke set explores different joke patterns such as truthful misdirection, dark tech satire, tech-native metaphor, fake product naming, deadpan diagnosis, incentive roast, absurd headline, and earned edge instead of repeating one idea.
_Avoid_: Variation spread, paraphrase diversity, random variety

**Visual Joke Metadata**:
The internal structure attached to a visual joke, such as its joke pattern, joke target, referenced fact, and short rationale, while the user-facing surface shows only the joke title without any visible rationale.
_Avoid_: Visible explanation, joke card details, debug notes

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
The rule that failed joke context gathering, text generation, visual joke generation, news-linked image discovery, image generation, or provider calls are not automatically retried by the product.
_Avoid_: Retry policy, silent retry, background retry

## Publish Modes

**Quote Tweet**:
A draft published as added commentary while reposting the source tweet.
_Avoid_: Repost, quote repost, retweet with text
