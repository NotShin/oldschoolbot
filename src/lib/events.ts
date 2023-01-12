import { Embed } from '@discordjs/builders';
import { BaseMessageOptions, bold, Message } from 'discord.js';
import { Time } from 'e';
import { bulkUpdateCommands } from 'mahoji/dist/lib/util';
import { Items } from 'oldschooljs';

import { ADMIN_IDS, CLIENT_ID, OWNER_IDS } from '../config';
import { PATRON_DOUBLE_LOOT_COOLDOWN } from '../mahoji/commands/tools';
import { minionStatusCommand } from '../mahoji/lib/abstracted_commands/minionStatusCommand';
import { Cooldowns } from '../mahoji/lib/Cooldowns';
import { Emoji, secretItems } from './constants';
import { customItems } from './customItems/util';
import { giveBoxResetTime, itemContractResetTime, spawnLampResetTime } from './MUser';
import { prisma } from './settings/prisma';
import { channelIsSendable, formatDuration, isFunction, toKMB } from './util';
import { makeBankImage } from './util/makeBankImage';
import { minionStatsEmbed } from './util/minionStatsEmbed';

const mentionText = `<@${CLIENT_ID}>`;

const cooldownTimers: { name: string; timeStamp: (user: MUser) => number; cd: number | ((user: MUser) => number) }[] = [
	{
		name: 'Tears of Guthix',
		timeStamp: (user: MUser) => Number(user.user.lastTearsOfGuthixTimestamp),
		cd: Time.Day * 7
	},
	{
		name: 'Daily',
		timeStamp: (user: MUser) => Number(user.user.lastDailyTimestamp),
		cd: Time.Hour * 12
	},
	{
		name: 'Spawn Lamp',
		timeStamp: (user: MUser) => Number(user.user.lastSpawnLamp),
		cd: (user: MUser) => spawnLampResetTime(user)
	},
	{
		name: 'Spawn Box',
		timeStamp: (user: MUser) => Cooldowns.cooldownMap.get(user.id)?.get('SPAWN_BOX') ?? 0,
		cd: Time.Minute * 45
	},
	{
		name: 'Give Box',
		timeStamp: (user: MUser) => Number(user.user.lastGivenBoxx),
		cd: giveBoxResetTime
	},
	{
		name: 'Item Contract',
		timeStamp: (user: MUser) => Number(user.user.last_item_contract_date),
		cd: itemContractResetTime
	},
	{
		name: 'Monthly Double Loot',
		timeStamp: (user: MUser) => Number(user.user.last_patron_double_time_trigger),
		cd: PATRON_DOUBLE_LOOT_COOLDOWN
	}
];

interface MentionCommandOptions {
	msg: Message;
	user: MUser;
	components: BaseMessageOptions['components'];
	content: string;
}
interface MentionCommand {
	name: string;
	aliases: string[];
	description: string;
	run: (options: MentionCommandOptions) => Promise<unknown>;
}

const mentionCommands: MentionCommand[] = [
	{
		name: 'bs',
		aliases: ['bs'],
		description: 'Searches your bank.',
		run: async ({ msg, user, components, content }: MentionCommandOptions) => {
			msg.reply({
				files: [
					(
						await makeBankImage({
							bank: user.bankWithGP.filter(i => i.name.toLowerCase().includes(content.toLowerCase())),
							title: 'Your Bank',
							user
						})
					).file.attachment
				],
				components
			});
		}
	},
	{
		name: 'bal',
		aliases: ['bal', 'gp'],
		description: 'Shows how much GP you have.',
		run: async ({ msg, user, components }: MentionCommandOptions) => {
			msg.reply({
				content: `${Emoji.MoneyBag} You have ${toKMB(user.GP)} (${user.GP.toLocaleString()}) GP.`,
				components
			});
		}
	},
	{
		name: 'is',
		aliases: ['is'],
		description: 'Searches for items.',
		run: async ({ msg, components, user, content }: MentionCommandOptions) => {
			const items = Items.filter(
				i =>
					[i.id.toString(), i.name.toLowerCase()].includes(content.toLowerCase()) &&
					!secretItems.includes(i.id)
			).array();
			if (items.length === 0) return msg.reply('No results for that item.');

			const gettedItem = items[0];

			let str = `Found ${items.length} items:\n${items
				.slice(0, 5)
				.map((item, index) => {
					const icons = [];

					if (user.cl.has(item.id)) icons.push(Emoji.CollectionLog);
					if (user.bank.has(item.id)) icons.push(Emoji.Bank);
					if (user.sacrificedItems.has(item.id)) icons.push(Emoji.Incinerator);
					const isCustom = customItems.includes(item.id);
					if (isCustom) icons.push(Emoji.BSO);

					const price = toKMB(Math.floor(item.price));

					const wikiURL = isCustom ? '' : `[Wiki Page](${item.wiki_url}) `;
					let str = `${index + 1}. ${item.name} ID[${item.id}] Price[${price}] ${
						item.tradeable ? 'Tradeable' : 'Untradeable'
					} ${wikiURL}${icons.join(' ')}`;
					if (gettedItem.id === item.id) {
						str = bold(str);
					}

					return str;
				})
				.join('\n')}`;

			if (items.length > 5) {
				str += `\n...and ${items.length - 5} others`;
			}

			return msg.reply({ embeds: [new Embed().setDescription(str)], components });
		}
	},
	{
		name: 'bank',
		aliases: ['b', 'bank'],
		description: 'Shows your bank.',
		run: async ({ msg, user, components }: MentionCommandOptions) => {
			msg.reply({
				files: [
					(
						await makeBankImage({
							bank: user.bankWithGP,
							title: 'Your Bank',
							user,
							flags: {
								page: 0
							}
						})
					).file.attachment
				],
				components
			});
		}
	},
	{
		name: 'cd',
		aliases: ['cd'],
		description: 'Shows your cooldowns.',
		run: async ({ msg, user, components }: MentionCommandOptions) => {
			msg.reply({
				content: cooldownTimers
					.map(cd => {
						const lastDone = cd.timeStamp(user);
						const difference = Date.now() - lastDone;
						const cooldown = isFunction(cd.cd) ? cd.cd(user) : cd.cd;
						if (difference < cooldown) {
							const durationRemaining = formatDuration(Date.now() - (lastDone + cooldown));
							return `${cd.name}: ${durationRemaining}`;
						}
						return bold(`${cd.name}: Ready`);
					})
					.join('\n'),
				components
			});
		}
	},
	{
		name: 'sync',
		aliases: ['sync'],
		description: 'Sync.',
		run: async ({ msg, user }: MentionCommandOptions) => {
			if (![...OWNER_IDS, ADMIN_IDS].includes(user.id)) return;
			const global = true;
			const guildID = '342983479501389826';
			const totalCommands = globalClient.mahojiClient.commands.values;
			const globalCommands = totalCommands.filter(i => !i.guildID);
			const guildCommands = totalCommands.filter(i => Boolean(i.guildID));
			if (global) {
				await bulkUpdateCommands({
					client: globalClient.mahojiClient,
					commands: globalCommands,
					guildID: null
				});
				await bulkUpdateCommands({
					client: globalClient.mahojiClient,
					commands: guildCommands,
					guildID: guildID.toString()
				});
			} else {
				await bulkUpdateCommands({
					client: globalClient.mahojiClient,
					commands: totalCommands,
					guildID: guildID.toString()
				});
			}

			return msg.reply(`Synced commands ${global ? 'globally' : 'locally'}.
${totalCommands.length} Total commands
${globalCommands.length} Global commands
${guildCommands.length} Guild commands`);
		}
	},
	{
		name: 's',
		aliases: ['s', 'stats'],
		description: 'Shows your stats.',
		run: async ({ msg, user, components }: MentionCommandOptions) => {
			msg.reply({
				embeds: [await minionStatsEmbed(user)],
				components
			});
		}
	}
];

export async function onMessage(msg: Message) {
	if (!msg.content || msg.author.bot || !channelIsSendable(msg.channel)) return;
	const content = msg.content.trim();
	if (!content.includes(mentionText)) return;
	const user = await mUserFetch(msg.author.id);
	const result = await minionStatusCommand(user, msg.channelId);
	const { components } = result;

	const command = mentionCommands.find(i =>
		i.aliases.some(alias => msg.content.startsWith(`${mentionText} ${alias}`))
	);
	if (command) {
		const msgContentWithoutCommand = msg.content.split(' ').slice(2).join(' ');
		await prisma.commandUsage.create({
			data: {
				user_id: BigInt(user.id),
				channel_id: BigInt(msg.channelId),
				guild_id: msg.guildId ? BigInt(msg.guildId) : undefined,
				command_name: command.name,
				args: msgContentWithoutCommand,
				flags: undefined,
				inhibited: false,
				is_mention_command: true
			}
		});
		await command.run({ msg, user, components, content: msgContentWithoutCommand });
		return;
	}

	msg.reply({
		content: result.content,
		components
	});
}
