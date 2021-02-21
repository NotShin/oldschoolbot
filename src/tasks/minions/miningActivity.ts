import { roll } from 'e';
import { Task } from 'klasa';
import { Bank } from 'oldschooljs';

import { Emoji, Events, Time } from '../../lib/constants';
import { getRandomMysteryBox } from '../../lib/data/openables';
import { hasArrayOfItemsEquipped } from '../../lib/gear';
import addSkillingClueToLoot from '../../lib/minions/functions/addSkillingClueToLoot';
import Mining from '../../lib/skilling/skills/mining';
import Smithing from '../../lib/skilling/skills/smithing';
import { SkillsEnum } from '../../lib/skilling/types';
import { MiningActivityTaskOptions } from '../../lib/types/minions';
import { itemID, multiplyBank, rand } from '../../lib/util';
import createReadableItemListFromBank from '../../lib/util/createReadableItemListFromTuple';
import { handleTripFinish } from '../../lib/util/handleTripFinish';

export default class extends Task {
	async run(data: MiningActivityTaskOptions) {
		const { oreID, quantity, userID, channelID, duration } = data;
		const user = await this.client.users.fetch(userID);
		user.incrementMinionDailyDuration(duration);
		const currentLevel = user.skillLevel(SkillsEnum.Mining);

		const ore = Mining.Ores.find(ore => ore.id === oreID);

		if (!ore) return;

		let xpReceived = quantity * ore.xp;
		let bonusXP = 0;

		// If they have the entire prospector outfit, give an extra 0.5% xp bonus
		if (
			hasArrayOfItemsEquipped(
				Object.keys(Mining.prospectorItems).map(i => parseInt(i)),
				user.getGear('skilling')
			)
		) {
			const amountToAdd = Math.floor(xpReceived * (2.5 / 100));
			xpReceived += amountToAdd;
			bonusXP += amountToAdd;
		} else {
			// For each prospector item, check if they have it, give its' XP boost if so.
			for (const [itemID, bonus] of Object.entries(Mining.prospectorItems)) {
				if (user.hasItemEquippedAnywhere(parseInt(itemID))) {
					const amountToAdd = Math.floor(xpReceived * (bonus / 100));
					xpReceived += amountToAdd;
					bonusXP += amountToAdd;
				}
			}
		}

		await user.addXP(SkillsEnum.Mining, xpReceived);
		const newLevel = user.skillLevel(SkillsEnum.Mining);

		let str = `${user}, ${user.minionName} finished mining ${quantity} ${
			ore.name
		}, you also received ${xpReceived.toLocaleString()} XP.`;

		if (newLevel > currentLevel) {
			str += `\n\n${user.minionName}'s Mining level is now ${newLevel}!`;
		}

		const loot = new Bank();

		const numberOfMinutes = duration / Time.Minute;

		if (user.equippedPet() === itemID('Doug') && numberOfMinutes >= 7) {
			for (const randOre of Mining.Ores.sort(() => 0.5 - Math.random()).slice(
				0,
				rand(1, Math.floor(numberOfMinutes / 7))
			)) {
				const qty = rand(1, numberOfMinutes * 3);
				const amountToAdd = randOre.xp * qty;
				xpReceived += amountToAdd;
				bonusXP += amountToAdd;
				loot.add(randOre.id, qty);
			}
		}

		if (roll(10)) {
			if (duration > Time.Minute * 10) {
				loot.bank = multiplyBank(loot.values(), 2);
				loot.add(getRandomMysteryBox(), 1);
			}
		}

		// Add clue scrolls
		if (ore.clueScrollChance) {
			addSkillingClueToLoot(
				user,
				SkillsEnum.Mining,
				quantity,
				ore.clueScrollChance,
				loot.values()
			);
		}

		// Roll for pet
		if (
			ore.petChance &&
			roll((ore.petChance - user.skillLevel(SkillsEnum.Mining) * 25) / quantity)
		) {
			loot.add('Rock golem');
			str += `\nYou have a funny feeling you're being followed...`;
			this.client.emit(
				Events.ServerNotification,
				`${Emoji.Mining} **${user.username}'s** minion, ${user.minionName}, just received a Rock golem while mining ${ore.name} at level ${currentLevel} Mining!`
			);
		}

		if (numberOfMinutes > 10 && ore.nuggets) {
			const numberOfNuggets = rand(0, Math.floor(numberOfMinutes / 4));
			loot.add('Golden nugget', numberOfNuggets);
		} else if (numberOfMinutes > 10 && ore.minerals) {
			let numberOfMinerals = 0;
			for (let i = 0; i < quantity; i++) {
				if (roll(ore.minerals)) numberOfMinerals++;
			}

			if (numberOfMinerals > 0) {
				loot.add('Unidentified minerals', numberOfMinerals);
			}
		}

		const minutesInTrip = Math.ceil(duration / Time.Minute);
		for (let i = 0; i < minutesInTrip; i++) {
			if (roll(3000)) {
				loot.add('Doug');
				str += `\n<:doug:748892864813203591> A pink-colored mole emerges from where you're mining, and decides to join you on your adventures after seeing your groundbreaking new methods of mining.`;
				break;
			}
		}

		// Gem rocks roll off the GemRockTable
		if (ore.id === 1625) {
			for (let i = 0; i < quantity; i++) {
				loot.add(Mining.GemRockTable.roll());
			}
		} else {
			loot.add(ore.id, quantity);
		}

		const hasKlik = user.equippedPet() === itemID('Klik');
		if (hasKlik) {
			const smeltedOre = Smithing.Bars.find(
				o => o.inputOres[ore.id] && Object.keys(o.inputOres).length === 1
			);
			if (smeltedOre) {
				loot.remove(ore.id, loot.amount(ore.id));
				loot.add(smeltedOre.id, quantity);
				str += `\n<:klik:749945070932721676> Klik breathes a incredibly hot fire breath, and smelts all your ores!`;
			}
		}

		str += `\n\nYou received: ${await createReadableItemListFromBank(
			this.client,
			loot.values()
		)}.`;
		if (bonusXP > 0) {
			str += `\n\n**Bonus XP:** ${bonusXP.toLocaleString()}`;
		}

		await user.addItemsToBank(loot.values(), true);

		handleTripFinish(
			this.client,
			user,
			channelID,
			str,
			res => {
				user.log(`continued trip of ${quantity}x ${ore.name}[${ore.id}]`);
				return this.client.commands.get('mine')!.run(res, [quantity, ore.name]);
			},
			undefined,
			data
		);
	}
}
