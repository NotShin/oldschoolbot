import { randInt } from 'e';
import { Bank } from 'oldschooljs';

import { Emoji } from '../../lib/constants';
import { globalDroprates } from '../../lib/data/globalDroprates';
import { SkillsEnum } from '../../lib/skilling/types';
import type { ActivityTaskOptionsWithQuantity } from '../../lib/types/minions';
import { roll } from '../../lib/util';
import { handleTripFinish } from '../../lib/util/handleTripFinish';
import { MAX_GLOBAL_QP } from '../../mahoji/lib/abstracted_commands/questCommand';

export const questingTask: MinionTask = {
	type: 'Questing',
	async run(data: ActivityTaskOptionsWithQuantity) {
		const { userID, channelID } = data;
		const user = await mUserFetch(userID);
		const currentQP = user.QP;

		// This assumes you do quests in order of scaling difficulty, ~115 hours for max qp
		let qpReceived = randInt(1, 30);

		const newQP = currentQP + qpReceived;

		// The minion could be at (MAX_GLOBAL_QP - 1) QP, but gain 4 QP here, so we'll trim that down from 4 to 1.
		if (newQP > MAX_GLOBAL_QP) {
			qpReceived -= newQP - MAX_GLOBAL_QP;
		}

		let str = `${user}, ${
			user.minionName
		} finished questing, you received ${qpReceived.toLocaleString()} QP. Your current QP is ${
			currentQP + qpReceived
		}.`;

		const hasMaxQP = newQP >= MAX_GLOBAL_QP;
		if (hasMaxQP) {
			str += `\n\nYou have achieved the maximum amount of ${MAX_GLOBAL_QP} Quest Points!`;
		}

		await user.update({
			QP: {
				increment: qpReceived
			}
		});
		const herbLevel = user.skillLevel(SkillsEnum.Herblore);
		if (herbLevel === 1 && newQP > 5 && roll(2)) {
			await user.addXP({ skillName: SkillsEnum.Herblore, amount: 250 });
			str += `${Emoji.Herblore} You received 250 Herblore XP for completing Druidic Ritual.`;
		}

		if (roll(globalDroprates.zippyQuesting.baseRate)) {
			str +=
				'\n<:zippy:749240799090180196> While you walk through the forest north of falador, a small ferret jumps onto your back and joins you on your adventures!';
			await user.addItemsToBank({ items: new Bank().add('Zippy'), collectionLog: true });
		}

		const magicXP = Number(user.user.skills_magic);
		if (magicXP === 0 && roll(2)) {
			await user.addXP({ skillName: SkillsEnum.Magic, amount: 325 });
			str += `${Emoji.Magic} You received 325 Magic XP for completing Witch's Potion.`;
		} else if (magicXP < 1000 && newQP > 15 && roll(2)) {
			await user.addXP({ skillName: SkillsEnum.Magic, amount: 1000 });
			str += `${Emoji.Magic} You received 1000 Magic XP for completing Fairytale I - Growing Pains.`;
		} else if (user.skillLevel(SkillsEnum.Cooking) >= 40 && newQP > 50 && magicXP < 2500 && roll(2)) {
			await user.addXP({ skillName: SkillsEnum.Magic, amount: 2500 });
			str += `${Emoji.Magic} You received 2500 Magic XP for completing Recipe For Disaster (Lumbridge guide subquest).`;
		}

		handleTripFinish(user, channelID, str, undefined, data, null);
	}
};
