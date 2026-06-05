# Tech News Roaster

This context is the language of a product that turns a source tweet about tech news into multiple witty social drafts. It exists to keep product and editorial concepts precise as the tool takes shape.

## Language

**Generation Run**:
One complete attempt to turn a source tweet and any user-provided steer into exactly three candidate drafts.
_Avoid_: Session, job, request

**Saved Run**:
A generation run that remains available to the user after creation, including its source tweet, user's direction, model provenance, date, and the latest edited version of each draft, and that can be reopened, edited again, or deleted by the user without ever regenerating its drafts.
_Avoid_: History item, cache entry, record

**Running Run**:
A generation run that has been created and is visible in the runs list before all three drafts are available.
_Avoid_: Pending save, loading item, temporary run

**Run Label**:
A short generated label used to identify a run in the unified runs list. The default label is replaced by the first provider-generated label that becomes available, and the user does not edit it.
_Avoid_: Title, custom name, editable name

**User's Direction**:
Optional freeform guidance provided by the user to influence or challenge the creative angle of a generation run. In v1, it is the only explicit user-controlled way to steer the outputs.
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

**Model Provenance**:
The visible record of which AI company and model produced a draft within a generation run.
_Avoid_: Source, backend, engine

**Replies**:
The raw responses posted under the source tweet that may contain phrasing, jokes, criticism, or interpretations worth reusing or reacting to.
_Avoid_: Comments, thread noise

**Reply Signals**:
The inferred patterns, tensions, and recurring interpretations extracted from replies to help identify stronger editorial angles.
_Avoid_: Sentiment, reply summary

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

## Publish Modes

**Quote Tweet**:
A draft published as added commentary while reposting the source tweet.
_Avoid_: Repost, retweet with text
