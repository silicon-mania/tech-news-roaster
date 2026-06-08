# Tech News Roaster

This context is the language of a product that turns a source tweet about tech news into multiple witty social drafts. It exists to keep product and editorial concepts precise as the tool takes shape.

## Language

**Generation Run**:
The parent attempt to turn a source tweet and user-provided guidance into exactly three candidate drafts plus optional image options for the quote tweet.
_Avoid_: Session, job, request

**Saved Run**:
A generation run that remains available to the user after creation, including its source tweet, user's direction, persisted selected image originals, user image prompt, image sets, model provenance, date, and the latest edited version of each draft, and that can be reopened, edited again, inspected, downloaded, or deleted by the user without ever regenerating its drafts or images.
_Avoid_: History item, cache entry, record

**Saved Run Retention**:
The automatic limit that keeps only the ten latest successful saved runs in browser-only storage, without counting running or failed runs toward that limit.
_Avoid_: Storage cleanup, pruning, history cap

**Successful Run**:
A generation run where outside-X enrichment and text generation have succeeded, regardless of whether optional image generation later succeeds or fails.
_Avoid_: Complete run, finished job, fully generated run

**Running Run**:
A generation run that has been created and is visible in the runs list while outside-X enrichment, text generation, or image generation is still in flight.
_Avoid_: Pending save, loading item, temporary run

**Run Label**:
A short generated label used to identify a run in the unified runs list. The default label is replaced by the first provider-generated label that becomes available, and the user does not edit it.
_Avoid_: Title, custom name, editable name

**User's Direction**:
Optional freeform guidance provided by the user to influence or challenge the creative angle of the text drafts. It does not steer image generation.
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

**Generation Orchestrator**:
The server-side boundary that calls the connected AI providers, tracks provider progress, applies fallback rules, and returns a complete generation run to the client.
_Avoid_: Client coordinator, frontend workflow, provider client

**Single-Page Workspace**:
The product's one responsive page that contains generation, source tweet reference, draft editing, and saved run access without navigating to separate pages.
_Avoid_: Multi-page flow, wizard, separate editor

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
The part of a generation run that creates exactly three candidate drafts from the source tweet, replies, outside-X enrichment, and user's direction.
_Avoid_: Text generation run, copy job, draft workflow

**Image Set**:
One user-selected news-linked image plus exactly two generated image variations derived from it for use with a quote tweet. A generation run may include one or two image sets.
_Avoid_: Visual set, image bundle, image pack

**News-Linked Images**:
The one to five images gathered during outside-X enrichment that are directly tied to the underlying news and eligible for user selection before image generation.
_Avoid_: Search images, candidate images, scraped images

**Selected Image Original**:
A news-linked image chosen by the user for image generation and preserved as the original image option inside an image set.
_Avoid_: Source image, input image, chosen image

**Image Option**:
A non-editable image inside an image set, either the original news-linked image or one generated variation derived from it, that can be opened for full-screen inspection or downloaded individually.
_Avoid_: Asset, picture, visual output

**Image Generation**:
The one-time part of a generation run where the user selects one or two news-linked images and provides one user image prompt before one configured image model creates variations using only the selected images and that prompt.
_Avoid_: Image generation run, visual job, image workflow

**Image Generation Service**:
The server-side integration layer that prepares selected image originals, calls the configured image model, and returns image sets without binding the product language to a specific image provider.
_Avoid_: Image provider client, Gemini client, visual generator

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
The inferred patterns, tensions, and recurring interpretations extracted from replies to help identify stronger editorial angles.
_Avoid_: Sentiment, reply summary

**Outside-X Enrichment**:
Mandatory supporting context gathered beyond X in v2 to recover the underlying news and gather news-linked images, while keeping the source tweet as the anchor.
_Avoid_: Research panel, external source of truth

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

## Editing

**Plain-Text Editing**:
Drafts are edited as plain text, without rich-text formatting controls, while preserving user-entered line breaks for copying and reuse.
_Avoid_: Rich text, WYSIWYG editor, formatted editor

**Autosave**:
The automatic persistence behavior that saves a generation run immediately after successful generation and saves later draft edits without a manual save action, using a short debounce.
_Avoid_: Save action, submit edits, manual save

**Provider Fallback**:
The behavior that preserves a complete three-draft generation run by substituting a failed provider draft with another successful provider draft, while keeping model provenance visible to the user and disclosing that fallback occurred.
_Avoid_: Retry noise, hidden substitution, silent replacement

**No Automatic Retry**:
The rule that failed enrichment, text generation, image generation, or provider calls are not automatically retried by the product.
_Avoid_: Retry policy, silent retry, background retry

## Publish Modes

**Quote Tweet**:
A draft published as added commentary while reposting the source tweet.
_Avoid_: Repost, quote repost, retweet with text
