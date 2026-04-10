import { Api } from 'telegram';
import { HTMLParser } from 'telegram/extensions/html';

type Stringable = { toString: () => string } | string | number | bigint;

type TelegramMessageEntityView = {
	className?: string;
	_?: string;
	offset?: number;
	length?: number;
	url?: string;
	userId?: Stringable;
	user_id?: Stringable;
	language?: string;
	documentId?: Stringable;
	document_id?: Stringable;
};

type Replacement = {
	start: number;
	end: number;
	value: string;
};

const SUPPORTED_HTML_TAG_PATTERN =
	/<(a|b|strong|i|em|u|s|strike|del|code|pre|spoiler|blockquote|tg-emoji)\b/i;

const MARKDOWNISH_PATTERN =
	/!\[[^\]]*]\(tg:\/\/emoji\?id=\d+\)|\[[^\]]+]\([^)]+\)|\*\*[\s\S]+?\*\*|~~[\s\S]+?~~|```[\s\S]+?```|`[^`\n]+`|__[\s\S]+?__|\|\|[\s\S]+?\|\||(^|[^\w])_[^_\n]+_($|[^\w])/m;

export function renderTelegramEntities(text: string, entities: unknown[] | undefined): string {
	if (!text || !Array.isArray(entities) || entities.length === 0) {
		return text;
	}

	const htmlRendered = convertTelegramHtmlToMarkdown(
		HTMLParser.unparse(text, entities as Api.TypeMessageEntity[]),
	);
	if (htmlRendered !== text) {
		return htmlRendered;
	}

	return renderTelegramEntitiesFallback(
		text,
		entities.filter(
			(entity): entity is TelegramMessageEntityView =>
				typeof entity === 'object' && entity !== null,
		),
	);
}

export function prepareTelegramTextInput(text: string): {
	text: string;
	parseMode?: 'html';
} {
	if (!text) {
		return { text };
	}

	if (!MARKDOWNISH_PATTERN.test(text) && !SUPPORTED_HTML_TAG_PATTERN.test(text)) {
		return { text };
	}

	if (SUPPORTED_HTML_TAG_PATTERN.test(text) && !MARKDOWNISH_PATTERN.test(text)) {
		return { text, parseMode: 'html' };
	}

	let html = text;

	html = html.replace(
		/!\[([^\]]*)]\(tg:\/\/emoji\?id=(\d+)\)/g,
		'<tg-emoji emoji-id="$2">$1</tg-emoji>',
	);

	html = html.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_match, language: string, code: string) => {
		const trimmedLanguage = language.trim();
		return trimmedLanguage
			? `<pre><code class="language-${trimmedLanguage}">${code}</code></pre>`
			: `<pre>${code}</pre>`;
	});

	html = html.replace(/\[([^\]]+)]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
	html = html.replace(/\|\|([\s\S]+?)\|\|/g, '<spoiler>$1</spoiler>');
	html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');
	html = html.replace(/__([\s\S]+?)__/g, '<em>$1</em>');
	html = html.replace(/(^|[^\w])_([^_\n]+)_($|[^\w])/gm, '$1<em>$2</em>$3');
	html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

	return { text: html, parseMode: 'html' };
}

function convertTelegramHtmlToMarkdown(html: string): string {
	return html
		.replace(
			/<pre><code class="language-([^"]+)">([\s\S]*?)<\/code><\/pre>/g,
			(_match, language: string, code: string) => `\`\`\`${language}\n${code}\`\`\``,
		)
		.replace(/<pre>([\s\S]*?)<\/pre>/g, (_match, code: string) => `\`\`\`${code}\`\`\``)
		.replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_match, content: string) =>
			content
				.split('\n')
				.map((line) => (line.length > 0 ? `> ${line}` : '>'))
				.join('\n'),
		)
		.replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**')
		.replace(/<em>([\s\S]*?)<\/em>/g, '_$1_')
		.replace(/<del>([\s\S]*?)<\/del>/g, '~~$1~~')
		.replace(/<code>([\s\S]*?)<\/code>/g, '`$1`')
		.replace(/<u>([\s\S]*?)<\/u>/g, '<u>$1</u>')
		.replace(/<spoiler>([\s\S]*?)<\/spoiler>/g, '||$1||')
		.replace(/<a href="([^"]+)">([\s\S]*?)<\/a>/g, '[$2]($1)')
		.replace(/<tg-emoji emoji-id="([^"]+)">([\s\S]*?)<\/tg-emoji>/g, '![$2](tg://emoji?id=$1)');
}

function renderTelegramEntitiesFallback(
	text: string,
	entities: TelegramMessageEntityView[],
): string {
	const replacements: Replacement[] = [];

	for (const entity of entities) {
		const start = entity.offset ?? 0;
		const length = entity.length ?? 0;
		const end = start + length;

		if (start < 0 || length <= 0 || end > text.length) {
			continue;
		}

		const entityText = text.slice(start, end);
		const rendered = renderEntityText(entity, entityText);
		if (rendered !== entityText) {
			replacements.push({ start, end, value: rendered });
		}
	}

	if (replacements.length === 0) {
		return text;
	}

	replacements.sort((a, b) => {
		if (a.start !== b.start) {
			return b.start - a.start;
		}

		return b.end - a.end;
	});

	let result = text;
	let lastAppliedStart = Number.MAX_SAFE_INTEGER;

	for (const replacement of replacements) {
		if (replacement.end > lastAppliedStart) {
			continue;
		}

		result = result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end);
		lastAppliedStart = replacement.start;
	}

	return result;
}

function renderEntityText(entity: TelegramMessageEntityView, entityText: string): string {
	const entityType = entity.className ?? entity._ ?? '';

	switch (entityType) {
		case 'MessageEntityTextUrl':
		case 'messageEntityTextUrl':
			return entity.url ? `[${entityText}](${entity.url})` : entityText;
		case 'MessageEntityUrl':
		case 'messageEntityUrl':
			return `[${entityText}](${entityText})`;
		case 'MessageEntityEmail':
		case 'messageEntityEmail':
			return `[${entityText}](mailto:${entityText})`;
		case 'MessageEntityPhone':
		case 'messageEntityPhone':
			return `[${entityText}](tel:${entityText})`;
		case 'MessageEntityBold':
		case 'messageEntityBold':
			return `**${entityText}**`;
		case 'MessageEntityItalic':
		case 'messageEntityItalic':
			return `_${entityText}_`;
		case 'MessageEntityStrike':
		case 'messageEntityStrike':
			return `~~${entityText}~~`;
		case 'MessageEntityUnderline':
		case 'messageEntityUnderline':
			return `<u>${entityText}</u>`;
		case 'MessageEntitySpoiler':
		case 'messageEntitySpoiler':
			return `||${entityText}||`;
		case 'MessageEntityCode':
		case 'messageEntityCode':
			return `\`${entityText}\``;
		case 'MessageEntityPre':
		case 'messageEntityPre':
			return `\`\`\`${entity.language ? entity.language + '\n' : ''}${entityText}\`\`\``;
		case 'MessageEntityBlockquote':
		case 'messageEntityBlockquote':
			return entityText
				.split('\n')
				.map((line) => (line.length > 0 ? `> ${line}` : '>'))
				.join('\n');
		case 'MessageEntityMentionName':
		case 'messageEntityMentionName':
		case 'InputMessageEntityMentionName':
		case 'inputMessageEntityMentionName': {
			const userId = toIdString(entity.userId ?? entity.user_id);
			return userId ? `[${entityText}](tg://user?id=${userId})` : entityText;
		}
		case 'MessageEntityCustomEmoji':
		case 'messageEntityCustomEmoji': {
			const documentId = toIdString(entity.documentId ?? entity.document_id);
			return documentId ? `![${entityText}](tg://emoji?id=${documentId})` : entityText;
		}
		default:
			return entityText;
	}
}

function toIdString(value: Stringable | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	return value.toString();
}
