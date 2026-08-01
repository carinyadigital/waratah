/**
 * The two pieces written by hand, end to end.
 *
 * The prose is authored here with the same claim-annotation contract the
 * writer subagent will use (Lexical claim nodes bound to pack entry ids),
 * validated on write, and emitted to .agency/content/drafts/. Running the
 * gate suite over these two pieces is the acceptance test for the gate suite.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  claimNode,
  doc,
  heading,
  link,
  paragraph,
  textNode,
  textOf,
} from '../../packages/content-pipeline/src/lexical/claim';
import { assertValid } from '../../packages/content-pipeline/src/validate';
import type { DraftArtifact } from '../../packages/content-pipeline/src/gates/types';

const t = textNode;

const baseline: DraftArtifact = {
  slug: 'measuring-soil-carbon-baseline',
  title: 'The baseline comes first: measuring before claiming',
  surface: 'blog',
  content: doc(
    heading('h2', 'Why we measured before we claimed'),
    paragraph(
      t(
        'Every farm like ours wants to tell you the land is getting better. Most are guessing. We decided the first honest thing we could publish was not a promise but a number — the state of our paddocks on the day we started, measured properly, so that every claim we make later has something to be checked against.',
      ),
    ),
    paragraph(
      t('This is not just temperament. '),
      claimNode('c4', 'Australian regulators expect environmental claims to be substantiated before they are made'),
      t(
        ' — the ACCC has been explicit about it, and green claims without evidence are exactly the habit this industry needs to lose. The cheapest way to comply is also the most useful one: measure first, talk second.',
      ),
    ),
    heading('h2', 'What we did'),
    paragraph(
      claimNode(
        'c3',
        'We sampled 40 GPS-logged points across eight paddocks, cored to 30 centimetres, and sent the lot to a lab for analysis',
      ),
      t(
        '. No selective sampling near the good tree lines, and no quiet skipping of the compacted gateway country. The grid was set before anyone walked out with an auger, and the point locations are logged so the same spots can be resampled in two years.',
      ),
    ),
    paragraph(
      t(
        'The results were about what a set of tired grazing paddocks should produce. Nothing to brag about, which is rather the point. ',
      ),
      claimNode('c1', 'Organic carbon in Australian agricultural topsoils commonly sits between about 1 and 4 per cent'),
      t(
        ', and ours sit toward the bottom of that range. That is the baseline. It is not a story about how special this place is — it is the before photo, taken with witnesses.',
      ),
    ),
    paragraph(
      t(
        'All of it — sampling design, point locations, lab results — is published in the open repository. If you want to argue with our numbers, you can find them. Open books are the point of the exercise: a measurement nobody can check is just an anecdote with a spreadsheet.',
      ),
    ),
    paragraph(
      t(
        'Two decisions mattered more than the gear. First, depth: sampling to 30 centimetres rather than the flattering top ten, because that is where the change we care about will or will not happen. Second, consistency: one lab, one method, the same season each round, so the only variable moving between samplings is the ground itself. Boring choices, deliberately made — comparability is worth more than precision we cannot repeat.',
      ),
    ),
    heading('h2', 'What we expect to happen'),
    paragraph(
      t('Slowly. Anyone selling you a fast fix for degraded ground is selling you something else too. '),
      claimNode('c2', 'Rebuilding organic carbon in a paddock is slow, and gains of a few tenths of a percentage point take years'),
      t(
        '. We plan to resample the same points on the same grid every two years and publish whatever comes back, including the paddocks that go backwards. Some will. A trend needs at least three points before it deserves the name, which puts our first honest trend line several years away. We can live with that.',
      ),
    ),
    paragraph(
      t(
        'What we will not do is put a number on the future. No forecast tonnage, no promised percentages, no timeline with a marketing department behind it. The paddocks have not earned that yet, and neither have we.',
      ),
    ),
    heading('h2', 'Where the beef comes in'),
    paragraph(
      t('The herd is how the plan pays its way while the ground does its slow work. If you would rather meet the end product than the spreadsheet, start with the '),
      link('/slow-roasted-highland-beef', 'slow-roasted Highland beef'),
      t(
        ' and taste what the paddocks are feeding. The measuring continues either way — the next sampling round lands in spring, and the numbers go up on this page whether they flatter us or not.',
      ),
    ),
    paragraph(
      t(
        'If you are running your own patch and want the sampling design, take it. It is not clever, it is just written down — which, as far as we can tell, is the main thing missing from most claims made about ground like ours.',
      ),
    ),
  ),
};

const roast: DraftArtifact = {
  slug: 'slow-roasted-highland-beef',
  title: 'Slow-roasted Highland beef',
  surface: 'recipes',
  content: doc(
    heading('h2', 'Why this cut, why this method'),
    paragraph(
      t(
        'Highland cattle grow slowly and carry their fat differently, and the shoulder rewards a low oven and patience more than it rewards technique. This is the method we cook at the farmhouse when there are people to feed and jobs to finish before dinner.',
      ),
    ),
    paragraph(
      claimNode('c2', 'The herd is raised on pasture at The Branch and finished on grass'),
      t(', and the herd records are open if you want to check. '),
      claimNode('c1', 'Grass-finishing lifts omega-3 precursors and antioxidant levels relative to grain-finishing'),
      t(
        ' — that is the sourced version. We will not pretend to breed-specific numbers nobody has measured.',
      ),
    ),
    heading('h2', 'Ingredients'),
    paragraph(
      t(
        'A 1.5 to 2 kg Highland shoulder roast. Two brown onions, quartered. A whole garlic bulb, halved across. Three carrots in thick chunks. A cup of beef stock. Olive oil, salt, pepper, and two sprigs of rosemary from wherever rosemary survives at your place.',
      ),
    ),
    heading('h2', 'Method'),
    paragraph(
      t(
        'Take the roast out of the fridge an hour before cooking so it comes to the oven at room temperature. Set the oven to 140°C fan-forced.',
      ),
    ),
    paragraph(
      t(
        'Salt the meat well on every side. Brown it hard in an ovenproof pot with a little oil — all sides, no shortcuts, this is where the flavour is made. Lift it out and set it aside.',
      ),
    ),
    paragraph(
      t(
        'Soften the onions and carrots in the same pot for five minutes, add the garlic cut-side down, then return the roast to sit on top. Pour in the stock, add the rosemary, and put the lid on.',
      ),
    ),
    paragraph(
      t(
        'Into the oven for three and a half to four hours. It is done when a fork twists through the middle without argument. If it argues, give it another half hour.',
      ),
    ),
    paragraph(
      t(
        'Rest it for twenty minutes with the lid ajar before carving. The vegetables and pot juices are the sauce — mash the garlic into them and taste before you add anything.',
      ),
    ),
    heading('h2', 'Where it comes from'),
    paragraph(
      t('The paddocks behind this roast have a published baseline — the measuring is at '),
      link('/measuring-soil-carbon-baseline', 'the baseline post'),
      t(', numbers and all. Dinner and the evidence, from the same ground.'),
    ),
  ),
};

const outDir = path.resolve(process.cwd(), '.agency/content/drafts');
mkdirSync(outDir, { recursive: true });

for (const draft of [baseline, roast]) {
  assertValid('draft', draft, draft.slug);
  const words = textOf(draft.content.root).split(/\s+/).filter(Boolean).length;
  writeFileSync(path.join(outDir, `${draft.slug}.json`), `${JSON.stringify(draft, null, 2)}\n`);
  console.log(`${draft.slug}: ${words} words, staged to drafts/`);
}
