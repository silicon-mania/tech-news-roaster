# Client Brief — AI Tweet Angle Generator for Tech News

## 1. Product idea

The goal is to build a product where a user can provide a tweet URL and the tool generates three or four different tweet drafts about the same piece of information.

The source tweet will usually be about a fresh tech-related news item, for example:

- a company raising money;
- a company launching a product;
- another kind of recent tech announcement or news event.

The product should analyze the tweet itself and also look at how people react in the comments/replies. The purpose of this analysis is to find a more interesting news angle, not simply to summarize the information.

## 2. Core objective

The expected output is not a boring, basic, neutral, objective summary of the news.

The client specifically does **not** want the tool to behave like many existing companies or media tools that simply summarize information. The core value is to generate a tweet that feels fun, fresh, slightly different, and memorable.

The generated tweet should make people on Twitter/X think something like:

> “They found a really funny, sarcastic, or different way to explain the news.”

The information itself may already be available to everyone. The differentiation should come from the angle, tone, framing, and way of presenting the news.

## 3. Desired tone and editorial direction

The output should give the information in a more engaging way than a classic tech media post.

Desired qualities:

- fun;
- fresh;
- different;
- memorable;
- sometimes sarcastic;
- sometimes slightly second-degree;
- sometimes roast-oriented;
- sometimes humorous, but not necessarily in a “haha joke” way;
- able to use implication, subtext, and indirect meaning;
- able to adapt the tone depending on the news item and context.

The client does not want forced comedy. The desired effect is more subtle: a smart, witty, slightly offbeat way to talk about a tech news item.

The output should create a gap between the generated tweet and the kind of content usually produced by a very classic tech media account.

## 4. Reference example: Burger King community management style

The client gave Burger King’s community management as the best example of the kind of approach they like.

The example mentioned was around the French baccalauréat period.

Context:

- young people around 18 years old were waiting for their baccalauréat exam results;
- some people were tweeting things like they were stressed and had only two days left before the results;
- Burger King’s community manager answered in a way that implied: “Only two days left before we receive your CVs so you can work with us.”

The point of the example is that the tweet does not explicitly say “you are going to fail your exam.” However, everyone understands the implied joke: if you fail the exam, think about applying to Burger King.

The client likes this because:

- it reuses an existing situation or piece of information;
- it creates a funny and indirect angle;
- it uses subtext instead of explaining everything directly;
- it makes people talk about the brand;
- it is short, sharp, and memorable;
- it can be a bit cheeky or roast-like without being too explicit.

The product should be able to generate tweets that aim for this kind of effect when appropriate.

## 5. Expected product workflow

The user should be able to use the tool very quickly.

The basic flow:

1. The user pastes a tweet URL into an input.
2. Optionally, the user can add extra context, notes, rules, or an initial angle in a text area below the URL input.
3. The tool analyzes the tweet.
4. The tool analyzes the comments/replies and how people are reacting.
5. The tool identifies possible editorial angles for the news.
6. The tool generates three or four different tweet versions.
7. The generated versions should be ready to review, compare, and potentially use on Twitter/X.

## 6. Main input: tweet URL

The primary input should be a tweet URL.

The tweet URL is the only mandatory input.

The tweet may be viral, very short, or missing broader context. Even if the tweet itself is short, it may still be the most relevant source because it is the tweet that went viral.

The tool should be able to start from this tweet and infer or reconstruct enough of the news angle to generate a strong new tweet.

## 7. Optional input: user notes / context / direction

Below the tweet URL input, there should be an optional text area where the user can write additional information.

This field should not be mandatory.

The user may use this field for different purposes, including:

- giving an idea for a sarcastic or different angle;
- giving an initial creative direction;
- warning the AI not to go in a specific direction;
- adding missing context that is not present in the tweet;
- explaining that the tweet is short but viral and needs additional background to be understood;
- adding details such as “you need to understand that X, Y, and Z are also part of the story”;
- proposing a possible reply or tweet idea;
- asking the AI to analyze the proposed idea and build from the underlying news if the idea is legitimate;
- giving rules or constraints that the AI may or may not follow depending on relevance.

The optional note can be something like:

- “Here is the idea I had.”
- “Do not talk about it from this angle.”
- “This is the context missing from the tweet.”
- “The tweet is short, but it went viral; to understand it, you need to know this.”
- “Here is a possible response idea. Analyze it and restart from the actual news if relevant.”

The AI should be able to take this optional note into account, but it should also be able to decide whether the note is relevant or not.

If the user does not provide any note, the tool should still be able to generate a funny, fresh, or interesting tweet about the news by itself.

## 8. Expected generated output

The tool should return three or four different tweet drafts.

These drafts should represent different ways of talking about the same information.

The drafts can vary in length:

- some can be very short;
- some can be slightly longer if needed to explain the news;
- the format does not have to be only a short reaction to a specific tweet;
- the output can also explain the news more directly, as long as it keeps a distinctive angle.

The goal is still to talk about the news item itself, not necessarily to produce a direct hot-take reply to the original tweet.

Each draft should be different enough to make comparison useful.

## 9. What the generated tweet should avoid

The generated tweet should avoid:

- being a plain summary;
- being too neutral;
- being too objective in a media-style way;
- being boring;
- sounding like a generic tech news outlet;
- simply repeating information that everyone already has;
- producing forced jokes;
- relying only on “haha funny” humor;
- ignoring the comments/reactions around the original tweet;
- blindly following user notes if they are not relevant;
- requiring the user to add optional context before the tool can work.

## 10. Use of multiple AI models

A key requirement is to use three or four different AI models.

The client mentioned:

- OpenAI / ChatGPT;
- Anthropic;
- Gemini.

The objective is to quickly obtain different versions of the tweet based on the same source tweet and optional additional information.

At minimum, the tool should be able to produce:

- one OpenAI version;
- one Gemini version;
- one Anthropic version.

Potentially, each AI model could generate two versions.

For example, for each model:

1. one version that follows the user-provided rules, notes, or creative direction if any were given;
2. one version that does not follow those rules directly, challenges them, ignores them, or proposes a different direction if the rules are not relevant.

If no user rules or notes are provided, each model could still generate two distinct versions.

The purpose of using several models is to quickly compare different creative outputs and increase the chance of finding a strong editorial angle.

## 11. Handling optional rules and user directions

When the user provides notes or rules, the tool should not treat them as absolute instructions in every case.

The AI should be able to:

- follow the user’s direction when it makes sense;
- partially incorporate the user’s direction;
- ignore or challenge the user’s direction if it is not relevant;
- produce one version aligned with the user’s direction and another version that explores a different angle;
- evaluate whether the user’s suggested tweet or response idea is legitimate;
- restart from the underlying news item instead of only modifying the user’s idea.

This means the tool should support both assisted creativity and autonomous creative generation.

## 12. Comments/replies analysis

The tool should analyze not only the original tweet, but also the comments and reactions under it.

The reactions may help identify:

- what people find funny;
- what people are criticizing;
- what people misunderstand;
- what angle is already emerging naturally;
- whether there is a sarcastic, roast, or second-degree opportunity;
- what social context surrounds the news;
- what makes the tweet viral or interesting.

This analysis should help the tool generate a better angle than a standard news summary.

## 13. News angle requirements

The tool should find a “nice” or interesting angle for the news.

The angle should be different from what classic tech media would do.

Possible angle types include:

- sarcastic framing;
- roast framing;
- second-degree framing;
- implied joke;
- brand-like community management reaction;
- playful explanation of the news;
- short and punchy observation;
- slightly longer explanation with a fresh twist;
- framing based on public reaction in the comments;
- framing based on what is absurd, ironic, or unexpected in the news.

The output should still communicate the core news item.

## 14. UX expectations

The client seems to want a simple and fast interface.

Expected UX elements:

- a tweet URL input;
- an optional text area below the URL input;
- a way to launch generation;
- generated results grouped by AI model and/or version;
- probably clear comparison between OpenAI, Gemini, and Anthropic outputs;
- possibly multiple outputs per model;
- no requirement for the user to provide manual notes.

The product should make it easy to paste a tweet and quickly get usable ideas.

## 15. Product positioning

This is not primarily a summarization tool.

It is closer to:

- an editorial angle generator;
- a social media creative assistant;
- a tech news tweet generator;
- a community-manager-style writing assistant;
- a tool that transforms tech news into witty Twitter/X content.

The differentiating promise is:

> Take a fresh tech news tweet and turn it into several witty, memorable, non-boring Twitter/X drafts using multiple AI models and social reaction analysis.

## 16. Technical implications to challenge later

The brief implies several technical areas that should be challenged separately:

- tweet URL ingestion;
- access to tweet content;
- access to comments/replies;
- handling Twitter/X API limitations or scraping constraints;
- extracting the actual news from a short or viral tweet;
- enriching context when the tweet is too short;
- detecting and summarizing comment sentiment and reaction patterns;
- prompt design for humor, sarcasm, second-degree, and roast-like outputs;
- moderation and safety boundaries for roast-oriented content;
- model orchestration across OpenAI, Anthropic, and Gemini;
- comparing outputs from different models;
- handling optional user notes as soft guidance rather than strict rules;
- generating multiple variants per model;
- presenting outputs clearly in the UI;
- avoiding generic summaries;
- measuring whether an output is actually fun, fresh, or differentiated;
- supporting both short punchlines and slightly longer explanatory tweets.

## 17. Open product questions

These were not explicitly answered in the transcript and should be clarified or challenged later:

- Should the tool generate tweets in French, English, or both?
- Should the generated output always respect Twitter/X character limits?
- Should the product generate standalone tweets, replies, quote-tweets, or all of them?
- Should the tool include hashtags, emojis, or links?
- Should the tool allow users to select tone intensity, such as light humor, sarcastic, roast, or more serious?
- Should the tool rank the generated outputs?
- Should the tool explain why each angle was chosen?
- Should the user be able to regenerate only one model’s result?
- Should comments/replies be summarized visibly, or only used internally?
- Should the tool support news enrichment from sources outside Twitter/X?
- How far can the roast/sarcasm go before it becomes too risky for a brand?
- Should the tool include brand voice presets, for example “Burger King-style,” “tech media with edge,” or “VC Twitter parody”?
- Should the AI ever refuse user-provided directions that are too aggressive, defamatory, or unsafe?

## 18. Summary

The client wants a simple tool where a user can paste a tweet URL about fresh tech news, optionally add context or creative direction, and receive several tweet drafts generated by different AI models.

The central requirement is not factual summarization but creative reframing. The generated tweets should explain the news in a way that is more fun, sarcastic, fresh, or roast-like than a standard tech media post.

The tool should analyze both the original tweet and the comments/reactions around it, use that social context to find interesting angles, and generate multiple versions from OpenAI, Anthropic, Gemini, and possibly other models.

The optional user note should be helpful but not required. The tool should work even with only the tweet URL.

The ideal output should feel closer to clever community management, like Burger King’s indirect and subtext-based replies, than to classic tech journalism.
