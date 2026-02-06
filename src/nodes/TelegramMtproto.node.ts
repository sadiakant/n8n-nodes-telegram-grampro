import { IExecuteFunctions } from 'n8n-workflow';
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
        
        // HIDE CREDENTIALS when doing Initial Authentication
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
                    { name: 'Session Generator', value: 'authentication' },
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
					{ name: 'Send Text', value: 'sendText' },
					{ name: 'Forward Message', value: 'forwardMessage' },
					{ name: 'Copy Message', value: 'copyMessage' },
					{ name: 'Get Messages', value: 'getHistory' },
					{ name: 'Edit Message', value: 'editMessage' },    
					{ name: 'Edit Message Media', value: 'editMessageMedia' },
					{ name: 'Delete Message', value: 'deleteMessage' },
					{ name: 'Pin Message', value: 'pinMessage' },
					{ name: 'Unpin Message', value: 'unpinMessage' },
        			{ name: 'Send Poll', value: 'sendPoll' }, 
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
					{ name: 'Get Chat', value: 'getChat' },
					{ name: 'Get Dialogs', value: 'getDialogs' },
					{ name: 'Join Channel', value: 'joinChat' },   
    				{ name: 'Leave Channel', value: 'leaveChat' }, 
					{ name: 'Join Group', value: 'joinGroup' },
					{ name: 'Leave Group', value: 'leaveGroup' },
					{ name: 'Create Group', value: 'createChat' },
					{ name: 'Create Channel', value: 'createChannel' },
				],
				default: 'getChat',
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
					{ name: 'Get Me', value: 'getMe' },
					{
						name: 'Get Full User Info',
						value: 'getFullUser',
						description: 'Get detailed information about a user including bio and common chats',
						action: 'Get full user info',
					},
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
					{ name: 'Download Media', value: 'downloadMedia' },
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
					{ name: 'Get Admin & Bots', value: 'getParticipants' },
					{ name: 'Get Public Members', value: 'getMembers' },
					{ name: 'Add Member', value: 'addMember' },
					{ name: 'Remove Member', value: 'removeMember' },
					{ name: 'Ban User', value: 'banUser' },
					{ name: 'Unban User', value: 'unbanUser' },
					{ name: 'Promote User to Admin', value: 'promoteUser' },
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
					{ name: 'Step:1 RequestCode', value: 'requestCode' },
					{ name: 'Step:2 Generate String', value: 'signIn' },
				],
				default: 'requestCode',
			},

            // AUTHENTICATION FIELDS
			{
				displayName: 'API ID',
				name: 'apiId',
				type: 'number',
				default: '={{ $json.apiId }}', // Added default expression
				required: true,
				displayOptions: {
					show: {
						resource: ['authentication'],
					},
				},
				description: 'Your Telegram API ID from https://my.telegram.org',
			},
			{
				displayName: 'API Hash',
				name: 'apiHash',
				type: 'string',
				default: '={{ $json.apiHash }}', // Added default expression
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
				default: '={{ $json.phoneNumber }}', // Added default expression
				required: true,
				displayOptions: {
					show: {
						resource: ['authentication'],
					},
				},
				description: 'Phone number in international format (e.g., +1234567890)',
			},
			{
				displayName: 'Phone Code',
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
				default: '={{ $json.phoneCodeHash }}', // Added default expression
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
				default: '={{ $json.preAuthSession }}', // Added default expression
				displayOptions: {
					show: {
						resource: ['authentication'],
						operation: ['signIn'],
					},
				},
				description: 'The temporary session string returned by the Request Code operation',
			},
			{
				displayName: '2FA Password',
				name: 'password2fa',
				type: 'string',
				typeOptions: {
					password: true,
				},
				default: '={{ $json.password2fa }}', // Added default expression
				displayOptions: {
					show: {
						resource: ['authentication'],
					},
				},
				description: 'Optional 2FA password if your account has 2FA enabled',
			},

			// COMMON FIELDS

			{
				displayName: 'Chat ID',
				name: 'chatId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['sendText', 'getChat', 'getUsers'],
					},
				},
			},

			{
				displayName: 'Message',
				name: 'text',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['sendText','editMessage'],
					},
				},
			},

			{
				displayName: 'From Chat',
				name: 'fromChatId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['forwardMessage'],
					},
				},
			},

			{
				displayName: 'To Chat',
				name: 'toChatId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['forwardMessage'],
					},
				},
			},

			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessage', 'editMessageMedia', 'deleteMessage', 'pinMessage', 'unpinMessage', 'forwardMessage', 'copyMessage'],
					},
				},
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
				displayName: 'Limit',
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
						operation: ['deleteMessage'],
					},
				},
				description: 'Whether to delete the message for everyone or just for you',
			},

			{
				displayName: 'Notify Players',
				name: 'notify',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['pinMessage'],
					},
				},
				description: 'Whether to send a notification to all chat members about the pinned message',
			},

			{
				displayName: 'Reply to Message ID',
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
				displayName: 'Chat ID',
				name: 'chatId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessageMedia'],
					},
				},
				description: 'Username (@channel), Invite Link (t.me/...), or numeric ID',
			},
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
				description: 'Text formatting mode for the caption',
			},
			// --- COPY MESSAGE PROPERTIES ---
			{
				displayName: 'From Chat',
				name: 'fromChatId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyMessage'],
					},
				},
				description: 'The chat ID, username (@channel), or invite link where the original message is located',
			},
			{
				displayName: 'To Chat',
				name: 'toChatId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['copyMessage'],
					},
				},
				description: 'The chat ID, username (@channel), or invite link where the message will be copied to',
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
				displayName: 'Chat ID / Invite Link',
				name: 'chatId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['message', 'chat'], // Ensure 'message' resource is included
						operation: [
							'getHistory', 'editMessage', 
							'deleteMessage', 'pinMessage', 'unpinMessage', 
							'sendPoll', 'joinChat', 'leaveChat', 'joinGroup', 'leaveGroup'
						],
					},
                },
				description: 'Username (@channel), Invite Link (t.me/...), or numeric ID',
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
				default: true, // Default to true (Safe for Channels)
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
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['getFullUser'],
					},
				},
				placeholder: '@username or 123456789',
				description: 'The username or numeric ID of the user to fetch details for',
			},

			// MEDIA FIELDS
			{
				displayName: 'Chat ID',
				name: 'chatId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['media'],
						operation: ['downloadMedia'],
					},
				},
				description: 'Chat ID or username where the message with media is located',
			},
			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						resource: ['media'],
						operation: ['downloadMedia'],
					},
				},
				description: 'The ID of the message containing the media to download',
			},

			// CHANNEL FIELDS
			{
				displayName: 'Channel ID',
				name: 'channelId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['getParticipants', 'getMembers', 'addMember', 'removeMember'],
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
						operation: ['getParticipants', 'getMembers'],
					},
				},
				description: 'Maximum number of members to retrieve (leave empty to get all members)',
			},
			{
				displayName: 'Filter Admin Participants',
				name: 'filterAdmins',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['getParticipants'],
					},
				},
				description: 'Whether to filter and show only admin participants',
			},
			{
				displayName: 'Filter Bot Participants',
				name: 'filterBots',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['getParticipants'],
					},
				},
				description: 'Whether to filter and show only bot participants',
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
				description: 'Whether to show only online members',
			},
			{
				displayName: 'User ID to Add',
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
				displayName: 'User ID to Remove',
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
				displayName: 'Channel ID',
				name: 'channelId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['banUser'],
					},
				},
				description: 'Channel or group ID, username (@channel), or invite link',
			},
			{
				displayName: 'User ID to Ban',
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
				displayName: 'Channel ID',
				name: 'channelId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['unbanUser'],
					},
				},
				description: 'Channel or group ID, username (@channel), or invite link',
			},
			{
				displayName: 'User ID to Unban',
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
				displayName: 'Channel ID',
				name: 'channelId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['channel'],
						operation: ['promoteUser'],
					},
				},
				description: 'Channel or group ID, username (@channel), or invite link',
			},
			{
				displayName: 'User ID to Promote',
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
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['user'],
						operation: ['getProfilePhoto'],
					},
				},
				placeholder: '@username or 123456789',
				description: 'The username or numeric ID of the user to get profile photo for',
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

		],
	};

	// ---------------- EXECUTOR ----------------
    async execute(this: IExecuteFunctions) {
        const resource = this.getNodeParameter('resource', 0) as string;
        const operation = this.getNodeParameter('operation', 0) as string;
        
        // --- RETRY CONFIGURATION ---
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 2000;
        
        let lastError: any;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                // Determine which router to call
                let result;
                switch (resource) {
                    case 'authentication': 
                        result = await authenticationRouter.call(this, operation);
                        break;
                    case 'message': 
                        result = await messageRouter.call(this, operation);
                        break;
                    case 'chat': 
                        result = await chatRouter.call(this, operation);
                        break;
                    case 'user': 
                        result = await userRouter.call(this, operation);
                        break;
                    case 'media': 
                        result = await mediaRouter.call(this, operation);
                        break;
                    case 'channel': 
                        result = await channelRouter.call(this, operation);
                        break;
                    default:
                        throw new Error(`Resource ${resource} is not supported.`);
                }
                
                // If successful, return the result immediately
                return result;

            } catch (error) {
                lastError = error;
                const errorMessage = (error.message || JSON.stringify(error)).toLowerCase();
                
                // Check if the error is related to connection issues
                const isConnectionError = 
                    errorMessage.includes('timeout') || 
                    errorMessage.includes('not connected') || 
                    errorMessage.includes('connection closed') ||
                    errorMessage.includes('stale') ||
                    errorMessage.includes('socket');

                if (isConnectionError && attempt < MAX_RETRIES) {
                    console.warn(`[TelegramMtproto] Attempt ${attempt} failed with connection error: "${errorMessage}". Retrying in ${RETRY_DELAY_MS}ms...`);
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    continue;
                } else {
                    // If it's not a connection error or we've run out of retries, throw it
                    if (attempt === MAX_RETRIES && isConnectionError) {
                         throw new NodeOperationError(this.getNode(), `Telegram Connection Failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
                    }
                    throw error;
                }
            }
        }
    }
}
