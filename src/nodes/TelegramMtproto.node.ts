import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { INodeType, INodeTypeDescription, NodeOperationError } from 'n8n-workflow';

import { messageRouter } from './resources/message.operations';
import { chatRouter } from './resources/chat.operations';
import { userRouter } from './resources/user.operations';
import { mediaRouter } from './resources/media.operations';
import { channelRouter } from './resources/channel.operations';
import { authenticationRouter } from './resources/authentication.operations';

export class TelegramMtproto implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Telegram GramPro',
		name: 'telegramMtproto',
		icon: 'file:icons/telegram.svg',
		group: ['transform'],
		version: 1,
		description: 'Advanced Telegram MTProto client',
		defaults: { name: 'Telegram GramPro' },
		inputs: ['main'],
		outputs: ['main'],

		credentials: [
			{
				name: 'telegramApi',
				required: true,
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
				displayOptions: {
					show: {
						resource: ['message'],
					},
				},
				options: [
					{ name: 'Send Message', value: 'sendText', action: 'Send Message' },
					{ name: 'Forward Message', value: 'forwardMessage', action: 'Forward Message' },
					{ name: 'Copy Message', value: 'copyMessage', action: 'Copy Message' },
					{ name: 'Get Chat History', value: 'getHistory', action: 'Get Chat History' },
					{ name: 'Edit Message', value: 'editMessage', action: 'Edit Message' },
					{ name: 'Edit Message Media', value: 'editMessageMedia', action: 'Edit Message Media' },
					{ name: 'Delete Message', value: 'deleteMessage', action: 'Delete Message' },
					{ name: 'Clear Chat History', value: 'deleteHistory', action: 'Clear Chat History' },
					{ name: 'Pin Message', value: 'pinMessage', action: 'Pin Message' },
					{ name: 'Unpin Message', value: 'unpinMessage', action: 'Unpin Message' },
					{ name: 'Create Poll', value: 'sendPoll', action: 'Create Poll' },
					{ name: 'Copy Restricted Content', value: 'copyRestrictedContent', action: 'Copy Restricted Content' },
				],
				default: 'sendText',
			},

			// CHAT OPS
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['chat'],
					},
				},
				options: [
					{ name: 'Get Chat Info', value: 'getChat', action: 'Get Chat Info' },
					{ name: 'Get Chats List', value: 'getDialogs', action: 'Get Chats List' },
					{ name: 'Join Channel / Supergroup', value: 'joinChat', action: 'Join Channel / Supergroup' },
					{ name: 'Leave Channel / Group', value: 'leaveChat', action: 'Leave Channel / Group' },
					{ name: 'Create Group', value: 'createChat', action: 'Create Group' },
					{ name: 'Create Channel', value: 'createChannel', action: 'Create Channel' },
				],
				default: 'getChat',
			},
			{
				displayName: 'Number of Results',
				name: 'limit',
				type: 'number',
				default: 50,
				displayOptions: {
					show: {
						resource: ['chat'],
						operation: ['getDialogs'],
					},
				},
				description: 'Maximum number of chats to return',
			},

			// USER OPS
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['user'],
					},
				},
				options: [
					{ name: 'Get My Profile', value: 'getMe', action: 'Get My Profile' },
					{
						name: 'Get User Profile',
						value: 'getFullUser',
						description: 'Get detailed information about a user including bio and common chats',
						action: 'Get User Profile',
					},
					{ name: 'Update My Profile', value: 'updateProfile', action: 'Update My Profile' },
					{ name: 'Update My Username', value: 'updateUsername', action: 'Update My Username' },
					{ name: 'Get Profile Photo', value: 'getProfilePhoto', action: 'Get Profile Photo' },
				],
				default: 'getFullUser',
			},

			// MEDIA OPS
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['media'],
					},
				},
				options: [
					{ name: 'Download Media', value: 'downloadMedia', action: 'Download Media' },
				],
				default: 'downloadMedia',
			},

			// CHANNEL OPS
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['channel'],
					},
				},
				options: [
					{ name: 'Get Members', value: 'getMembers', action: 'Get Members' },
					{ name: 'Add Member', value: 'addMember', action: 'Add Member' },
					{ name: 'Remove Member', value: 'removeMember', action: 'Remove Member' },
					{ name: 'Ban User', value: 'banUser', action: 'Ban User' },
					{ name: 'Unban User', value: 'unbanUser', action: 'Unban User' },
					{ name: 'Promote to Admin', value: 'promoteUser', action: 'Promote to Admin' },
				],
				default: 'getParticipants',
			},

			// AUTHENTICATION OPS
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['authentication'],
					},
				},
				options: [
					{ name: 'Request Login Code', value: 'requestCode', action: 'Request Login Code' },
					{ name: 'Complete Login', value: 'signIn', action: 'Complete Login' },
				],
				default: 'requestCode',
			},

			// AUTHENTICATION FIELDS
			{
				displayName: 'App api_id',
				name: 'apiId',
				type: 'number',
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
				displayName: 'App api_hash',
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
				displayName: 'Phone Code Hash',
				name: 'phoneCodeHash',
				type: 'string',
				default: '={{ $json.phoneCodeHash }}',
				displayOptions: {
					show: {
						resource: ['authentication'],
						operation: ['signIn'],
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
						operation: ['signIn'],
					},
				},
				description: 'The temporary session string returned by the Request Code operation',
			},
			{
				displayName: 'Two-Step Verification Password',
				name: 'password2fa',
				type: 'string',
				typeOptions: {
					password: true,
				},
				default: '={{ $json.password2fa }}',
				displayOptions: {
					show: {
						resource: ['authentication'],
					},
				},
				description: 'Optional 2FA password if your account has 2FA enabled',
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
							'sendText', 'getChat', 'getHistory', 'editMessage',
							'deleteMessage', 'deleteHistory', 'pinMessage',
							'unpinMessage', 'sendPoll', 'joinChat', 'leaveChat',
							'leaveGroup', 'editMessageMedia', 'downloadMedia',
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
				description: 'If enabled, message is sent to your Saved Messages (me) and the chat field is hidden',
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
				description: 'If enabled, edits a message in your Saved Messages (me) and hides the chat field',
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
				description: 'If enabled, edits message media in your Saved Messages (me) and hides the chat field',
			},
			{
				displayName: 'Get from Saved Messages',
				name: 'historyFromSelf',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['getHistory'],
					},
				},
				description: 'If enabled, fetches history from your Saved Messages (me) and hides the chat field',
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
				description: 'Enable link previews when the message contains URLs',
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
				description: 'Upload a photo, video, or document with the message',
			},
			{
				displayName: 'Media Type',
				name: 'mediaType',
				type: 'options',
				default: 'document',
				options: [
					{ name: 'Photo', value: 'photo' },
					{ name: 'Video', value: 'video' },
					{ name: 'Document', value: 'document' },
				],
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendText'],
						attachMedia: [true],
					},
				},
				description: 'Select the kind of media you are attaching',
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
				description: 'Optional direct URL to a file (photo/video/document). If provided, it will be used when no binary data is supplied.',
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
				description: 'If true, forwards to your Saved Messages instead of target chat',
			},

			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				options: [
					{ name: 'Recent Messages (Limit)', value: 'limit' },
					{ name: 'Last X Hours', value: 'hours' },
					{ name: 'Date Range', value: 'range' },
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
				default: 10,
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
				description: 'Whether to only return messages that contain media (photos, videos, documents)',
			},
			{
				displayName: 'Media Type',
				name: 'mediaType',
				type: 'multiOptions',
				options: [
					{ name: 'Photo', value: 'photo' },
					{ name: 'Video', value: 'video' },
					{ name: 'Document', value: 'document' },
				],
				default: [],
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['getHistory'],
						onlyMedia: [true],
					},
				},
				description: 'Filter by specific media types. Leave empty to allow all media.',
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
                description: 'New caption for the media. If left empty, the original caption will be preserved.',
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
			{
				displayName: 'Parse Mode',
				name: 'parseMode',
				type: 'options',
				default: 'default',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessageMedia'],
					},
				},
				options: [
					{ name: 'Default', value: 'default' },
					{ name: 'HTML', value: 'html' },
					{ name: 'Markdown', value: 'markdown' },
				],
				description: 'Text formatting mode for the caption. Telegram Markdown is limited (no headings/tables); use HTML for headings or table-like layouts.',
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
				description: 'The chat ID, username (@channel), or invite link where the original message is located',
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
				description: 'If true, copies to your Saved Messages instead of target chat',
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
				description: 'The chat ID, username (@channel), or invite link where the message will be copied to',
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
				description: 'Optional caption to replace the original message text. If empty, the original message text will be used.',
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
				description: 'If true, no one can see who voted for what. Required for Channels.',
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
				description: 'If true, gets your own profile photo without requiring userId',
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
						operation: ['getMembers', 'addMember', 'removeMember', 'banUser', 'unbanUser', 'promoteUser'],
					},
				},
				description: 'Channel or group ID, username (@channel), or invite link',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				required: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['getMembers'],
					},
				},
				description: 'Maximum number of members to retrieve (leave empty to get all)',
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
				},
				description: 'Show only admin participants',
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
				},
				description: 'Show only bot participants',
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
				},
				description: 'If enabled, remove admins from the results (overrides Filter Admin Participants)',
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
				},
				description: 'If enabled, remove bots from the results (overrides Filter Bot Participants)',
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
				},
				description: 'Exclude deleted accounts and users with long-ago status',
			},
			{
				displayName: 'Show Only Online Members',
				name: 'onlyOnline',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['getMembers'],
					},
				},
				description: 'Show only online members',
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
				displayName: 'Ban Duration (days)',
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
					{ name: 'Small', value: 'small' },
					{ name: 'Medium', value: 'medium' },
					{ name: 'Large', value: 'large' },
					{ name: 'Full', value: 'full' },
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
				required: false,
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
				description: 'If true, sends to your Saved Messages instead of target chat',
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
				description: 'Include the original message caption/text',
			},
			{
				displayName: 'Download Timeout (seconds)',
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
						throw new Error(`Resource ${resource} is not supported.`);
				}

				if (result && result.length > 0) {
					returnData.push(...result);
				}

			} catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
