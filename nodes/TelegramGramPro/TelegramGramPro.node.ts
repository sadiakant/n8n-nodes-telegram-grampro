import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';
import { testTelegramApi } from '../../credentials/TelegramGramProApi.credentials';

import { messageRouter } from './resources/message.operations';
import { chatRouter } from './resources/chat.operations';
import { userRouter } from './resources/user.operations';
import { mediaRouter } from './resources/media.operations';
import { channelRouter } from './resources/channel.operations';
import { authenticationRouter } from './resources/authentication.operations';

const messageTypeOptions = [
	{ name: 'Text', value: 'text' },
	{ name: 'Photo', value: 'photo' },
	{ name: 'Video', value: 'video' },
	{ name: 'Document', value: 'document' },
	{ name: 'Other', value: 'other' },
];

export class TelegramGramPro implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Telegram GramPro',
		name: 'telegramGramPro',
		icon: 'file:telegram-grampro.svg',
		group: ['transform'],
		version: 1,
		description: 'Advanced Telegram MTProto client',
		defaults: { name: 'Telegram GramPro' },
		codex: {
			categories: ['Communication'],
			alias: ['Telegram GramPro', 'GramPro'],
			subcategories: {
				'Telegram GramPro': ['telegramGramProTrigger'],
			},
			resources: {
				credentialDocumentation: [
					{
						url: 'https://github.com/sadiakant/n8n-nodes-telegram-grampro#credentials',
					},
				],
				primaryDocumentation: [
					{
						url: 'https://github.com/sadiakant/n8n-nodes-telegram-grampro#readme',
					},
				],
			},
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],

		credentials: [
			{
				name: 'telegramGramProApi',
				required: true,
				testedBy: 'testTelegramApi',
				displayOptions: {
					hide: {
						resource: ['authentication'],
					},
				},
			},
		],

		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Auth', value: 'authentication' },
					{ name: 'Channel', value: 'channel' },
					{ name: 'Chat', value: 'chat' },
					{ name: 'Media', value: 'media' },
					{ name: 'Message', value: 'message' },
					{ name: 'User', value: 'user' },
				],
				default: 'message',
			},
			// MESSAGE OPS
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['message'],
					},
				},
				options: [
					{
						name: 'Clear Chat History',
						value: 'deleteHistory',
						action: 'Clear chat history',
					},
					{
						name: 'Copy Message',
						value: 'copyMessage',
						action: 'Copy message',
					},
					{
						name: 'Copy Restricted Content',
						value: 'copyRestrictedContent',
						action: 'Copy restricted content',
					},
					{ name: 'Create Poll', value: 'sendPoll', action: 'Create poll' },
					{
						name: 'Delete Message',
						value: 'deleteMessage',
						action: 'Delete message',
					},
					{
						name: 'Edit Message',
						value: 'editMessage',
						action: 'Edit message',
					},
					{
						name: 'Edit Message Media',
						value: 'editMessageMedia',
						action: 'Edit message media',
					},
					{
						name: 'Forward Message',
						value: 'forwardMessage',
						action: 'Forward message',
					},
					{
						name: 'Get Chat History',
						value: 'getHistory',
						action: 'Get chat history',
					},
					{ name: 'Pin Message', value: 'pinMessage', action: 'Pin message' },
					{ name: 'Send Message', value: 'sendText', action: 'Send message' },
					{ name: 'Unpin Message', value: 'unpinMessage', action: 'Unpin message' },
				],
				default: 'sendText',
			},

			// CHAT OPS
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['chat'],
					},
				},
				options: [
					{ name: 'Create Channel', value: 'createChannel', action: 'Create channel' },
					{ name: 'Create Group', value: 'createChat', action: 'Create group' },
					{ name: 'Get Chat Info', value: 'getChat', action: 'Get chat info' },
					{
						name: 'Get Chats List',
						value: 'getDialogs',
						action: 'Get chats list',
					},
					{
						name: 'Join Channel / Supergroup',
						value: 'joinChat',
						action: 'Join channel supergroup',
					},
					{
						name: 'Leave Channel / Group',
						value: 'leaveChat',
						action: 'Leave channel group',
					},
				],
				default: 'getChat',
			},
			{
				displayName: 'Number of Results',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['chat'],
						operation: ['getDialogs'],
					},
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Group by Folders',
				name: 'groupByFolders',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['chat'],
						operation: ['getDialogs'],
					},
				},
				description: 'Whether to group chats by their Telegram folders (Dialog Filters)',
			},

			// USER OPS
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['user'],
					},
				},
				options: [
					{ name: 'Get My Profile', value: 'getMe', action: 'Get my profile' },
					{
						name: 'Get Profile Photo',
						value: 'getProfilePhoto',
						action: 'Get profile photo',
					},
					{
						name: 'Get User Profile',
						value: 'getFullUser',
						description: 'Get detailed information about a user including bio and common chats',
						action: 'Get user profile',
					},
					{
						name: 'Update My Profile',
						value: 'updateProfile',
						action: 'Update my profile',
					},
					{
						name: 'Update My Username',
						value: 'updateUsername',
						action: 'Update my username',
					},
				],
				default: 'getFullUser',
			},

			// MEDIA OPS
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['media'],
					},
				},
				options: [
					{
						name: 'Download Media',
						value: 'downloadMedia',
						action: 'Download media',
					},
				],
				default: 'downloadMedia',
			},

			// CHANNEL OPS
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['channel'],
					},
				},
				options: [
					{ name: 'Add Member', value: 'addMember', action: 'Add member' },
					{ name: 'Ban User', value: 'banUser', action: 'Ban user' },
					{ name: 'Get Members', value: 'getMembers', action: 'Get members' },
					{
						name: 'Promote to Admin',
						value: 'promoteUser',
						action: 'Promote to admin',
					},
					{
						name: 'Remove Member',
						value: 'removeMember',
						action: 'Remove member',
					},
					{ name: 'Unban User', value: 'unbanUser', action: 'Unban user' },
				],
				default: 'getMembers',
			},

			// AUTHENTICATION OPS
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['authentication'],
					},
				},
				options: [
					{
						name: 'A1: QR Login - Generate Code',
						value: 'requestQr',
						action: 'A1: Qr login - generate code',
					},
					{
						name: 'A2: QR Login - Authenticate',
						value: 'completeQr',
						action: 'A2: Qr login - authenticate',
					},
					{
						name: 'B1: Phone Login - Request Code',
						value: 'requestCode',
						action: 'B1: Phone login - request code',
					},
					{
						name: 'B2: Phone Login - Resend Code',
						value: 'resendCode',
						action: 'B2: Phone login - resend code',
					},
					{
						name: 'B3: Phone Login - Sign in',
						value: 'signIn',
						action: 'B3: Phone login - sign in',
					},
				],
				default: 'requestCode',
			},

			// AUTHENTICATION FIELDS
			{
				displayName: 'App Api_id',
				name: 'apiId',
				type: 'string',
				default: '={{ $json.apiId }}',
				required: true,
				displayOptions: {
					show: {
						resource: ['authentication'],
					},
				},
				description: 'Your Telegram API ID from https://my.telegram.org',
			},
			{
				displayName: 'App Api_hash',
				name: 'apiHash',
				type: 'string',
				default: '={{ $json.apiHash }}',
				required: true,
				displayOptions: {
					show: {
						resource: ['authentication'],
					},
				},
				description: 'Your Telegram API Hash from https://my.telegram.org',
			},
			{
				displayName: 'Phone Number',
				name: 'phoneNumber',
				type: 'string',
				default: '={{ $json.phoneNumber }}',
				required: true,
				displayOptions: {
					show: {
						resource: ['authentication'],
						operation: ['requestCode', 'signIn', 'resendCode'],
					},
				},
				description: 'Phone number in international format (e.g., +1234567890)',
			},
			{
				displayName: 'Verification Code',
				name: 'phoneCode',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['authentication'],
						operation: ['signIn'],
					},
				},
				description: 'The verification code sent to your phone',
			},
			{
				displayName: 'Two-Step Verification Password',
				name: 'password2fa',
				type: 'string',
				typeOptions: { password: true },
				default: '={{ $json.password2fa }}',
				displayOptions: {
					show: {
						resource: ['authentication'],
						operation: ['requestCode', 'signIn', 'completeQr'],
					},
				},
				description: 'Optional 2FA password if your account has 2FA enabled',
			},
			{
				displayName: 'Phone Code Hash',
				name: 'phoneCodeHash',
				type: 'string',
				default: '={{ $json.phoneCodeHash }}',
				displayOptions: {
					show: {
						resource: ['authentication'],
						operation: ['signIn', 'resendCode'],
					},
				},
				description: 'The phone code hash from the Request Code operation',
			},
			{
				displayName: 'Pre-Auth Session String',
				name: 'preAuthSession',
				type: 'string',
				default: '={{ $json.preAuthSession }}',
				displayOptions: {
					show: {
						resource: ['authentication'],
						operation: ['signIn', 'resendCode', 'completeQr'],
					},
				},
				description: 'The temporary session string returned by the Request Code operation',
			},

			// COMMON FIELDS

			{
				displayName: 'Chat / Username',
				name: 'chatId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['message', 'chat', 'media'],
						operation: [
							'sendText',
							'getChat',
							'getHistory',
							'editMessage',
							'deleteMessage',
							'deleteHistory',
							'pinMessage',
							'unpinMessage',
							'sendPoll',
							'joinChat',
							'leaveChat',
							'leaveGroup',
							'editMessageMedia',
							'downloadMedia',
						],
					},
					hide: {
						sendToSelf: [true],
						editFromSelf: [true],
						editMediaFromSelf: [true],
						historyFromSelf: [true],
					},
				},
				description: 'Username (@channel), Invite Link (t.me/...), or numeric ID',
			},
			{
				displayName: 'Send to Saved Messages',
				name: 'sendToSelf',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendText'],
					},
				},
				description:
					'Whether to send the message to your Saved Messages (me) and hide the chat field',
			},
			{
				displayName: 'Edit in Saved Messages',
				name: 'editFromSelf',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessage'],
					},
				},
				description:
					'Whether to edit a message in your Saved Messages (me) and hide the chat field',
			},
			{
				displayName: 'Edit Media in Saved Messages',
				name: 'editMediaFromSelf',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessageMedia'],
					},
				},
				description:
					'Whether to edit message media in your Saved Messages (me) and hide the chat field',
			},
			{
				displayName: 'Get From Saved Messages',
				name: 'historyFromSelf',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['getHistory'],
					},
				},
				description:
					'Whether to fetch history from your Saved Messages (me) and hide the chat field',
			},

			{
				displayName: 'Message Text',
				name: 'text',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['sendText', 'editMessage'],
					},
				},
			},
			{
				displayName: 'Show Web Preview',
				name: 'webPreview',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendText'],
					},
				},
				description: 'Whether to enable link previews when the message contains URLs',
			},
			{
				displayName: 'Attach Media',
				name: 'attachMedia',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendText'],
					},
				},
				description: 'Whether to upload a photo, video, document, or other file with the message',
			},
			{
				displayName: 'Media Type',
				name: 'mediaType',
				type: 'options',
				default: 'document',
				options: messageTypeOptions,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendText'],
						attachMedia: [true],
					},
				},
				description:
					'Select the message type. Choose Text to send the message without attaching media.',
			},
			{
				displayName: 'Binary Property',
				name: 'mediaBinaryProperty',
				type: 'string',
				default: 'data',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendText'],
						attachMedia: [true],
					},
				},
				description: 'Name of the binary property that contains the file to upload',
			},
			{
				displayName: 'Media URL',
				name: 'mediaUrl',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendText'],
						attachMedia: [true],
					},
				},
				description:
					'Optional direct URL to a file (photo/video/document). If provided, it will be used when no binary data is supplied.',
			},

			{
				displayName: 'Source Chat',
				name: 'sourceChatId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['forwardMessage'],
					},
				},
				description: 'Username (@channel), Invite Link, or ID',
			},
			{
				displayName: 'Target Chat',
				name: 'targetChatId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['forwardMessage'],
						saveToSavedMessages: [false],
					},
				},
				description: 'Username (@channel), Invite Link, or ID',
			},
			{
				displayName: 'Forward to Saved Messages',
				name: 'saveToSavedMessages',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['forwardMessage'],
					},
				},
				description:
					'Whether to forward the message to your Saved Messages instead of the target chat',
			},

			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				options: [
					{ name: 'Date Range', value: 'range' },
					{ name: 'Last X Hours', value: 'hours' },
					{ name: 'Recent Messages (Limit)', value: 'limit' },
				],
				default: 'limit',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['getHistory'],
					},
				},
			},
			{
				displayName: 'Number of Results',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				description: 'Max number of results to return',
				default: 50,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['getHistory'],
						mode: ['limit'],
					},
				},
			},
			{
				displayName: 'Last Hours',
				name: 'hours',
				type: 'number',
				default: 24,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['getHistory'],
						mode: ['hours'],
					},
				},
			},
			{
				displayName: 'From Date',
				name: 'fromDate',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['getHistory'],
						mode: ['range'],
					},
				},
			},
			{
				displayName: 'To Date',
				name: 'toDate',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['getHistory'],
						mode: ['range'],
					},
				},
			},
			{
				displayName: 'Max Messages',
				name: 'maxMessages',
				type: 'number',
				default: 500,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['getHistory'],
						mode: ['hours', 'range'],
					},
				},
				description: 'Safety cap for very active chats',
			},
			{
				displayName: 'Has Media',
				name: 'onlyMedia',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['getHistory'],
					},
				},
				description:
					'Whether to filter by media or message type. Leave Media Type empty to only return messages that contain media.',
			},
			{
				displayName: 'Media Type',
				name: 'mediaType',
				type: 'multiOptions',
				options: messageTypeOptions,
				default: [],
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['getHistory'],
						onlyMedia: [true],
					},
				},
				description: 'Filter by specific message or media types. Leave empty to allow all media.',
			},

			{
				displayName: 'Delete for Everyone',
				name: 'revoke',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['deleteMessage', 'deleteHistory'],
					},
				},
				description: 'Whether to delete message(s) for everyone',
			},

			{
				displayName: 'Notify Members',
				name: 'notify',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['pinMessage'],
					},
				},
				description: 'Whether to send a notification to all chat members',
			},

			{
				displayName: 'Reply to Message (ID)',
				name: 'replyTo',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendText'],
					},
				},
				description: 'The ID of the message to reply to',
			},
			{
				displayName: 'Disable Link Preview',
				name: 'noWebpage',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessage'],
					},
				},
				description: 'Whether to disable the link preview for URLs in the message',
			},
			// --- EDIT MESSAGE MEDIA PROPERTIES ---

			{
				displayName: 'Media',
				name: 'media',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessageMedia'],
					},
				},
				description: 'The media to edit the message with (InputMedia type)',
			},
			{
				displayName: 'Caption',
				name: 'caption',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessageMedia'],
					},
				},
				description:
					'New caption for the media. If left empty, the original caption will be preserved.',
			},
			{
				displayName: 'Caption Entities',
				name: 'captionEntities',
				type: 'json',
				default: [],
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessageMedia'],
					},
				},
				description: 'Optional formatting entities for the caption (e.g., bold, italic, links)',
			},
			// --- COPY MESSAGE PROPERTIES ---
			{
				displayName: 'Source Chat',
				name: 'sourceChatId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyMessage'],
					},
				},
				description:
					'The chat ID, username (@channel), or invite link where the original message is located',
			},
			{
				displayName: 'Save to Saved Messages',
				name: 'saveToSavedMessages',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyMessage'],
					},
				},
				description:
					'Whether to copy the message to your Saved Messages instead of the target chat',
			},
			{
				displayName: 'Target Chat',
				name: 'targetChatId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyMessage'],
						saveToSavedMessages: [false],
					},
				},
				description:
					'The chat ID, username (@channel), or invite link where the message will be copied to',
			},
			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: ['message', 'media'],
						operation: [
							'editMessage',
							'editMessageMedia',
							'deleteMessage',
							'pinMessage',
							'unpinMessage',
							'forwardMessage',
							'copyMessage',
							'downloadMedia',
						],
					},
				},
				description: 'The ID of the message',
			},
			{
				displayName: 'Caption',
				name: 'caption',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyMessage'],
					},
				},
				description:
					'Optional caption to replace the original message text. If empty, the original message text will be used.',
			},
			{
				displayName: 'Disable Link Preview',
				name: 'disableLinkPreview',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyMessage'],
					},
				},
				description: 'Whether to disable link previews in the copied message',
			},

			{
				displayName: 'Max Message ID',
				name: 'maxId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['deleteHistory'],
					},
				},
				description: 'Maximum ID of message to delete. 0 to delete all messages.',
			},
			// --- POLL PROPERTIES ---
			{
				displayName: 'Question',
				name: 'pollQuestion',
				type: 'string',
				default: '',
				displayOptions: {
					show: { resource: ['message'], operation: ['sendPoll'] },
				},
				placeholder: 'Are you Gay?',
			},
			{
				displayName: 'Options',
				name: 'pollOptions',
				type: 'string',
				typeOptions: { multipleValues: true },
				default: [],
				displayOptions: {
					show: { resource: ['message'], operation: ['sendPoll'] },
				},
				placeholder: 'Add an option',
			},
			{
				displayName: 'Is Quiz',
				name: 'isQuiz',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: { resource: ['message'], operation: ['sendPoll'] },
				},
			},

			{
				displayName: 'Title',
				name: 'chatTitle',
				type: 'string',
				default: '',
				displayOptions: {
					show: { operation: ['createChat', 'createChannel'] },
				},
				required: true,
			},
			{
				displayName: 'About',
				name: 'chatAbout',
				type: 'string',
				default: '',
				displayOptions: {
					show: { operation: ['createChat', 'createChannel'] },
				},
				description: 'The description of the group or channel',
			},

			{
				displayName: 'Anonymous Voting',
				name: 'anonymous',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: { resource: ['message'], operation: ['sendPoll'] },
				},
				description: 'Whether votes are anonymous. Required for channels.',
			},

			{
				displayName: 'Correct Answer Index',
				name: 'correctAnswerIndex',
				type: 'number',
				default: 0,
				typeOptions: {
					minValue: 0,
				},
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendPoll'],
						isQuiz: [true],
					},
				},
				description: 'The 0-based index of the correct answer (e.g., 0 for the first option)',
			},

			{
				displayName: 'My Profile Photo Only',
				name: 'myProfilePhotoOnly',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['getProfilePhoto'],
					},
				},
				description: 'Whether to get your own profile photo without requiring userId',
			},

			{
				displayName: 'User',
				name: 'userId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['getFullUser', 'getProfilePhoto'],
					},
					hide: {
						myProfilePhotoOnly: [true],
					},
				},
				placeholder: '@username or 123456789',
				description: 'Username or numeric ID',
			},

			// MEDIA FIELDS

			// CHANNEL FIELDS
			{
				displayName: 'Channel / Group',
				name: 'channelId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: [
							'getMembers',
							'addMember',
							'removeMember',
							'banUser',
							'unbanUser',
							'promoteUser',
						],
					},
				},
				placeholder: 'username or 12345678 or -100123456789',
				description: 'Channel or group ID, username (channel), or invite link',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['getMembers'],
					},
				},
				placeholder: 'Leave empty to get all members',
				description: 'Max number of results to return',
			},
			{
				displayName: 'Filter Online & Recently Active',
				name: 'onlyOnline',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['getMembers'],
					},
					hide: {
						excludeDeletedAndLongAgo: [true],
					},
				},
				description: 'Whether to show only members who are currently online or recently active',
			},
			{
				displayName: 'Filter Admin Participants',
				name: 'filterAdmins',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['getMembers'],
					},
					hide: {
						excludeAdmins: [true],
					},
				},
				description: 'Whether to show only admin participants',
			},
			{
				displayName: 'Filter Bot Participants',
				name: 'filterBots',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['getMembers'],
					},
					hide: {
						excludeBots: [true],
					},
				},
				description: 'Whether to show only bot participants',
			},
			{
				displayName: 'Exclude Deleted / Long Ago',
				name: 'excludeDeletedAndLongAgo',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['getMembers'],
					},
					hide: {
						onlyOnline: [true],
					},
				},
				description: 'Whether to exclude deleted accounts and users with long-ago status',
			},
			{
				displayName: 'Exclude Admins',
				name: 'excludeAdmins',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['getMembers'],
					},
					hide: {
						filterAdmins: [true],
					},
				},
				description: 'Whether to remove admins from the results',
			},
			{
				displayName: 'Exclude Bots',
				name: 'excludeBots',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['getMembers'],
					},
					hide: {
						filterBots: [true],
					},
				},
				description: 'Whether to remove bots from the results',
			},
			{
				displayName: 'User to Add',
				name: 'userIdToAdd',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['addMember'],
					},
				},
				placeholder: '@username or 123456789',
				description: 'The username or numeric ID of the user to add to the channel/group',
			},
			{
				displayName: 'User to Remove',
				name: 'userIdToRemove',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['removeMember'],
					},
				},
				placeholder: '@username or 123456789',
				description: 'The username or numeric ID of the user to remove from the channel/group',
			},

			{
				displayName: 'User to Ban',
				name: 'userIdToBan',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['banUser'],
					},
				},
				placeholder: '@username or 123456789',
				description: 'The username or numeric ID of the user to ban from the channel/group',
			},
			{
				displayName: 'Ban Duration (Days)',
				name: 'banDuration',
				type: 'number',
				default: 1,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['banUser'],
					},
				},
				description: 'Number of days to ban the user (0 for permanent ban)',
			},
			{
				displayName: 'Ban Reason',
				name: 'banReason',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['banUser'],
					},
				},
				description: 'Reason for banning the user',
			},

			{
				displayName: 'User to Unban',
				name: 'userIdToUnban',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['unbanUser'],
					},
				},
				placeholder: '@username or 123456789',
				description: 'The username or numeric ID of the user to unban from the channel/group',
			},

			{
				displayName: 'User to Promote',
				name: 'userIdToPromote',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				placeholder: '@username or 123456789',
				description: 'The username or numeric ID of the user to promote to admin',
			},
			{
				displayName: 'Admin Title',
				name: 'adminTitle',
				type: 'string',
				default: 'Admin',
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Custom title for the promoted admin',
			},
			{
				displayName: 'Can Change Info',
				name: 'canChangeInfo',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can change chat title, photo, and other settings',
			},
			{
				displayName: 'Can Post Messages',
				name: 'canPostMessages',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can post messages (channels only)',
			},
			{
				displayName: 'Can Edit Messages',
				name: 'canEditMessages',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can edit messages of other users',
			},
			{
				displayName: 'Can Delete Messages',
				name: 'canDeleteMessages',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can delete messages of other users',
			},
			{
				displayName: 'Can Invite Users',
				name: 'canInviteUsers',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can invite new users',
			},
			{
				displayName: 'Can Restrict Members',
				name: 'canRestrictMembers',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can restrict/ban users',
			},
			{
				displayName: 'Can Pin Messages',
				name: 'canPinMessages',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can pin messages',
			},
			{
				displayName: 'Can Promote Members',
				name: 'canPromoteMembers',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can add new admins with the same rights',
			},
			{
				displayName: 'Can Manage Chat',
				name: 'canManageChat',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can access group analytics',
			},
			{
				displayName: 'Can Manage Voice Chats',
				name: 'canManageVoiceChats',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can manage voice chats',
			},
			{
				displayName: 'Can Post Stories',
				name: 'canPostStories',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can post stories (channels only)',
			},
			{
				displayName: 'Can Edit Stories',
				name: 'canEditStories',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can edit stories (channels only)',
			},
			{
				displayName: 'Can Delete Stories',
				name: 'canDeleteStories',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Whether the admin can delete stories (channels only)',
			},
			{
				displayName: 'First Name',
				name: 'firstName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['updateProfile'],
					},
				},
				description: 'New first name for your profile',
			},
			{
				displayName: 'Last Name',
				name: 'lastName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['updateProfile'],
					},
				},
				description: 'New last name for your profile',
			},
			{
				displayName: 'About',
				name: 'about',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['updateProfile'],
					},
				},
				description: 'New bio/about text for your profile',
			},
			{
				displayName: 'New Username',
				name: 'newUsername',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['updateUsername'],
					},
				},
				description: 'New username for your account',
			},

			{
				displayName: 'Photo Size',
				name: 'photoSize',
				type: 'options',
				default: 'medium',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['getProfilePhoto'],
					},
				},
				options: [
					{ name: 'Full', value: 'full' },
					{ name: 'Large', value: 'large' },
					{ name: 'Medium', value: 'medium' },
					{ name: 'Small', value: 'small' },
				],
				description: 'Size of the profile photo to download',
			},

			// --- COPY RESTRICTED CONTENT FIELDS ---
			{
				displayName: 'Source Chat / Username',
				name: 'sourceChatId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyRestrictedContent'],
					},
				},
				description: 'Username (@channel), Invite Link, or ID',
			},
			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyRestrictedContent'],
					},
				},
				description: 'The ID of the message to copy',
			},
			{
				displayName: 'Target Chat / Username',
				name: 'targetChatId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyRestrictedContent'],
						saveToSavedMessages: [false],
					},
				},
				description: 'Username (@channel), Invite Link, or ID',
			},
			{
				displayName: 'Save to Saved Messages',
				name: 'saveToSavedMessages',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyRestrictedContent'],
					},
				},
				description:
					'Whether to send the content to your Saved Messages instead of the target chat',
			},
			{
				displayName: 'Include Caption',
				name: 'includeCaption',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyRestrictedContent'],
					},
				},
				description: 'Whether to include the original message caption or text',
			},
			{
				displayName: 'Download Timeout (Seconds)',
				name: 'downloadTimeout',
				type: 'number',
				default: 60,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyRestrictedContent'],
					},
				},
				description: 'Timeout for downloading large media files',
			},
		],
		usableAsTool: true,
	};

	methods = {
		credentialTest: {
			testTelegramApi,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;

			try {
				let result: INodeExecutionData[] = [];

				switch (resource) {
					case 'authentication':
						result = await authenticationRouter.call(this, operation, i);
						break;
					case 'message':
						result = await messageRouter.call(this, operation, i);
						break;
					case 'chat':
						result = await chatRouter.call(this, operation, i);
						break;
					case 'user':
						result = await userRouter.call(this, operation, i);
						break;
					case 'media':
						result = await mediaRouter.call(this, operation, i);
						break;
					case 'channel':
						result = await channelRouter.call(this, operation, i);
						break;
					default:
						throw new NodeOperationError(this.getNode(), `Resource ${resource} is not supported.`, {
							itemIndex: i,
						});
				}

				if (result && result.length > 0) {
					returnData.push(...result);
				}
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);

				if (this.continueOnFail()) {
					returnData.push({
						json: { error: message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error instanceof Error ? error : message, {
					itemIndex: i,
				});
			}
		}

		return [returnData];
	}
}
