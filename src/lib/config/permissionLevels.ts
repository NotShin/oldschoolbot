import { PermissionLevels, KlasaMessage } from 'klasa';
import { Permissions } from 'discord.js';

import { PermissionLevelsEnum } from '../constants';

const permissionLevels = new PermissionLevels()
	.add(0, () => true)
	.add(
		PermissionLevelsEnum.Moderator,
		(message: KlasaMessage) =>
			!!message.guild &&
			!!message.member &&
			message.member.permissions.has(Permissions.FLAGS.BAN_MEMBERS),
		{
			fetch: true
		}
	)
	.add(
		PermissionLevelsEnum.Admin,
		(message: KlasaMessage) =>
			!!message.guild &&
			!!message.member &&
			message.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR),
		{
			fetch: true
		}
	)
	.add(9, (message: KlasaMessage) => message.client.owners.has(message.author), { break: true })
	.add(PermissionLevelsEnum.Owner, (message: KlasaMessage) =>
		message.client.owners.has(message.author)
	);

export default permissionLevels;
