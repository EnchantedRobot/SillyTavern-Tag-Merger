#!/usr/bin/env python3
"""
Assign every source tag from card-tags.json to exactly one canonical tag
(from canonical-tags.json), or to junk (removedTags), or to a holiday.

Rules:
- A source tag collapses into exactly ONE canonical (alias match wins).
- Junk classes (events, dates, handles, meta, body/appearance, invented worlds,
  POV, jokes, transient moods) are dropped to removedTags.
- Holiday-dated tags (christmas2024, valentine2025...) map to the Holiday category.
- The coarse "Fetish" bucket absorbs the long tail of niche kinks.

There is one alias() call per canonical. Output: base-mapping-v2.json
"""
import json, re, sys
from collections import defaultdict

ROOT = __file__.rsplit('/scripts/', 1)[0]

def norm(t):
    t = t.strip().lstrip('#').strip()
    t = re.sub(r'\s+', ' ', t)
    return t.lower()

# ---- load source universe -------------------------------------------------
# The tag universe comes from the extracted card-tags.json (scripts/extract-tags.py
# output). Collect every tag referenced into one universe.
from pathlib import Path
src_path = f'{ROOT}/card-tags.json'
if not Path(src_path).exists():
    sys.exit(f'missing {src_path} — run scripts/extract-tags.py first')
src = json.load(open(src_path))
universe = set()
for k, v in src.get('mapping', {}).items():
    universe.add(k)
    universe.update(v)
universe.update(src.get('allTags', []))
universe.update(src.get('removedTags', []))

norm_to_orig = defaultdict(set)
for t in universe:
    norm_to_orig[norm(t)].add(t)

canon = json.load(open(f'{ROOT}/canonical-tags.json'))
CANON_BY_CAT = canon['categories']
ALL_CANON = [c for cat in CANON_BY_CAT.values() for c in cat]

# ---- alias table: normalized source -> Canonical --------------------------
# Every canonical auto-aliases from its own normalized form. One call per canonical.
ALIASES = {norm(c): c for c in ALL_CANON}

def alias(canonical, *variants):
    for v in variants:
        ALIASES[norm(v)] = canonical

# Genre
alias('Romance', 'confession', 'contemporary romance', 'cupid', 'dark romance', 'dramaandromance', 'drunk confession',
      'falling in love', 'feelings realization', 'first love', 'genuine', 'intimate', 'love',
      'love is a battlefield', 'loveatfirstfright', 'loveconquersall', 'lover', 'morning after',
      'passionate', 'practice kissing', 'rom', 'romantic', 'soulmate', 'true love',
      'unconditional love', 'virgin emotions', 'yearning')
alias('Comedy', 'comedic', 'dark comedy', 'funny', 'humor', 'humorous', 'satire', 'silly')
alias('Romantic Comedy', 'romanticcomedy', 'romcom')
alias('Slice of Life', 'casual', 'casual conversation', 'coffee and conversation', 'convenient intimacy',
      'domestic', 'everyday', 'grounded', 'low maintenance', 'slice-of-life', 'sliceoflife',
      'small talk', 'sol')
alias('Fantasy', 'fantasies', 'fantastic', 'fantasty', 'fantasysetting', 'gothic fantasy', 'high fantasy',
      'low fantasy', 'magic', 'magical', 'medieval fantasy', 'medievalfantasy', 'modern fantasy',
      'modernfantasy', 'murim', 'prophecy', 'urban fantasy', 'urbanfantasy', 'xianxia')
alias('Dark Fantasy', 'darkurbanfantasy')
alias('Science Fiction', 'sci fi', 'sci-fi', 'sci_fi', 'scifi')
alias('Cyberpunk', 'cyberpunk 2077', 'cyberpunk2077')
alias('Horror', 'blood and gore', 'body horror', 'cosmic horror', 'cosmichorror', 'gore', 'gothic',
      'gothic horror', 'morbid', 'psychological horror', 'scary', 'survival horror', 'urban horror')
alias('Thriller', 'suspense', 'thrillerandmystery')
alias('Mystery', 'mysteries', 'noir')
alias('Adventure', 'exploration', 'journey', 'rescue mission', 'survival')
alias('Action', 'battle', 'chase', 'combat', 'fight', 'fighting', 'guns', 'violence', 'violent', 'war')
alias('Isekai', 'alternate universe', 'gate', 'portal fantasy', 'reverse isekai', 'reverseisekai')
alias('Crime', 'criminal underworld', 'murder')
alias('Coming of Age', 'coming-of-age')
alias('Tragedy', 'death', 'dieing', 'tradegy', 'tragic')
alias('Superhero', 'hero', 'speedster', 'super hero', 'superheroine', 'superpower', 'superpowers')
alias('Steampunk', 'gothic steampunk')
alias('Supernatural', 'curse', 'cursed', 'occult', 'paranormal', 'supernatural thriller', 'tarot')

# Tone / Mood
alias('Wholesome', 'comfort', 'comfy', 'cozy', 'cuddles', 'healing', 'heartwarming', 'surprisingly wholesome')
alias('Fluff', 'domestic intimacy', 'fluffweek', 'fluffy', 'gift giving')
alias('Angst', 'breaking', 'emotional damage', 'emotional erosion', 'heavyangst', 'heavyangstdrama')
alias('Hurt/Comfort', 'comfortsex', 'emotional vulnerability', 'hurt-comfort', 'hurtcomfort',
      'traumacomfort', 'vulnerability')
alias('Dark', 'dead dove', 'notforall', 'nsfl', 'twisted')
alias('Story Driven', 'character depth', 'lore friendly', 'plot', 'plotheavy', 'psychological depth',
      'storydriven', 'storyfocused', 'storyheavy', 'worldbuilding')

# Setting / Era
alias('Modern Day', 'city', 'modern', 'modernday', 'present', 'real world', 'real-world', 'realism',
      'realistic')
alias('Historical', 'coldwarera', 'colonization', 'historical/ancient', 'history', 'regency era',
      'renaissance', 'retro', 'victorian')
alias('Ancient', 'ancientgreece', 'rome', 'sparta')
alias('Post-Apocalyptic', 'apocalypse', 'post apocalyptic', 'post-apocalypse', 'postapocalpytic',
      'postapocalyptic', 'zombie apocalypse')
alias('Dystopia', 'dystopian')
alias('Space', 'astronaut', 'military scifi', 'outer space', 'space adventure', 'space girl', 'space opera',
      'space pirate', 'spaceship', 'starship')
alias('Western', 'cowboy/cowgirl', 'cowgirl', 'frontier', 'gold rush', 'weird west', 'weirdwest',
      'wild west')
alias('School', 'academy', 'cafeteria', 'high school', 'highschool', 'highschool reunion', 'reunion',
      'highschooldrama', 'kouhai', 'schoolgirl', 'student council', 'studentcouncil')
alias('College', 'campus life', 'college dorm', 'college girl', 'college life', 'college student',
      'collegestudent', 'dorm', 'dormitory', 'english major', 'hazing', 'sorority girl', 'university',
      'university student')
alias('Workplace', 'corporate cruelty', 'office', 'office drama', 'office setting')
alias('Small Town', 'countryside', 'suburban', 'suburbs', 'village')
alias('Rural', 'cottagecore', 'country girl', 'farm', 'farm girl', 'farm/ranch/homestead', 'farmer',
      'farmer/farmhand', 'farmergirl', 'peasant')
alias('Magic Academy', 'magicacademy', 'magical academy', 'magicalacademy')
alias('Vacation', 'amusement park', 'beach', 'cabin', 'cabin beach weekend', 'camping',
      'holiday', 'hot spring', 'island', 'onsen', 'remote cabin', 'road trip',
      'site seeing', 'spa', 'summer', 'tahiti', 'theme park', 'tourist', 'travel', 'wilderness')

# Species / Non-Human
alias('Demi-Human', 'animal ears', 'animal girl', 'beargirl', 'beastkin', 'demihuman',
      'dog girl', 'doggirl', 'fluffy tail', 'horns', 'hybriddemihuman', 'kemonomimi',
      'lynx girl', 'mothgirl', 'mousegirl', 'ottergirl', 'owlgirl', 'sheep girl', 'tail', 'tails')
alias('Non-Human', 'anthropomorphic', 'chimera', 'demihumanuser', 'halfbreed', 'humanoid',
      'interspecies', 'monster', 'monsters', 'mutant', 'nonhuman character', 'nonhuman protagonist',
      'parasite')
alias('Monster Girl', 'bear girl', 'cow udders', 'cow-girl', 'deer girl', 'goatgirl', 'goblin girl',
      'gremlin', 'horse girl', 'monstergirl', 'sheep', 'sheepgirl', 'sheepkin', 'snake girl', 'wildgirl')
alias('Cat Girl', 'cat ears and cat tail', 'catgirl', 'magiccat', 'neko', 'nekomimi', 'orange tabby',
      'panthergirl')
alias('Fox Girl', 'foxgirl', 'gumiho', 'kitsune')
alias('Wolf Girl', 'wolf', 'wolfgirl')
alias('Bunny Girl', 'bunny', 'bunny suit', 'bunnygirl', 'bunnygirloutfit', 'rabbit anthro', 'rabbit girl')
alias('Elf', 'elf princess', 'elves', 'half-elf', 'high elf', 'sand elf')
alias('Dark Elf', 'darkelf', 'drow')
alias('Demon', 'demon girl', 'demon lord', 'demon summoning', 'demonqueen', 'demons', 'oni')
alias('Succubus', 'succubus summons')
alias('Vampire', 'vampires')
alias('Angel', 'fallen angel', 'guardian angel')
alias('Goddess', 'banished goddess', 'deity', 'deity / god / goddess', 'divine', 'divinity', 'goddesbot',
      'godtier')
alias('Robot', 'android', 'artificial intelligence', 'artificialinteligence', 'cyborg', 'hologram',
      'holographic', 'mech pilot', 'mecha', 'robot girl', 'sentience')
alias('Alien', 'alien girl')
alias('Dragon', 'dragon girl', 'dragonborn', 'dragongirl')
alias('Ghost', 'ghost girl', 'haunted', 'incorporeal', 'possession', 'spirit possession')
alias('Slime Girl', 'slime', 'slimegirl')
alias('Lamia', 'gorgon')
alias('Furry', 'anthro', 'anthro days', 'anthropomorphic animals')
alias('Undead', 'necromancer', 'zombie', 'zombie girl')
alias('Fairy', 'dryad', 'faerie', 'nymph', 'pixie', 'sprite')
alias('Spirit', 'celestial', 'folklore entity', 'shinigami')
alias('Orc', 'goblin')
alias('Werewolf', 'wolfwife')
alias('Giant', 'giantuser')
alias('Genie', 'wish granting')
alias('Elemental', 'esper', 'fire', 'shadow')

# Ethnicity / Culture
alias('Asian', 'asian female', 'asian supermodel', 'asian themed', 'east asian', 'south asian', 'thai')
alias('Japanese', 'japan', 'japanese setting', 'kimono')
alias('Korean', 'korea', 'south korea')
alias('Chinese', 'china')
alias('Latina', 'filipina', 'filipino', 'hispanic')
alias('Black', 'african american', 'african-american', 'ebony')
alias('White', 'caucasian', 'white girl', 'white woman')
alias('Indian', 'bollywood')
alias('Middle Eastern', 'arabian', 'egyptian')
alias('Native American', 'aztec', 'indigenous', 'mesoamerican', 'native', 'tribal')
alias('Slavic', 'gopnik', 'russian')
alias('European', 'british', 'english', 'europe', 'french', 'irish', 'italian', 'scottish', 'swedish')
alias('Romani', 'gypsy', 'gypsies', 'roma')

# Personality / Archetype
alias('Tsundere', 'tsundere (kind of)', 'tsunderetoyandere', 'yanderetsunderehybrid')
alias('Yandere', 'slight yandere', 'soft yandere')
alias('Brat', 'brat taming', 'bratt', 'brattaming', 'bratty', 'himedere', 'spoiled brat')
alias('Shy', 'awkward', 'introvert', 'nervous', 'quiet', 'repressed', 'reserved', 'timid')
alias('Cold', 'cold anger', 'deadpan', 'emotionless', 'icequeen')
alias('Cheerful', 'bubbly', 'genki', 'perky')
alias('Energetic', 'adrenaline junkie', 'hyper', 'hyperactive', 'manic')
alias('Playful', 'mischevious', 'mischievous', 'quirky', 'trickster')
alias('Flirty', 'flirtatious', 'tease', 'teasing')
alias('Seductive', 'lewd', 'sultry')
alias('Possessive', 'obsessed', 'obsessive')
alias('Jealous', 'jealouswife', 'jealousy', 'jelousy')
alias('Sarcastic', 'banter', 'deflection', 'sassy', 'smart-assy', 'smartassy', 'smug', 'snarky')
alias('Kind', 'deredere', 'devoted', 'friendly', 'gentle', 'helpful', 'kindacheating', 'loving', 'soft',
      'sweet')
alias('Caring', 'affectionate', 'caretaker', 'motherly', 'nurturing')
alias('Protective', 'strongbutgentle')
alias('Insecure', 'crybaby', 'low self esteem', 'low self-esteem', 'self-conscious', 'selfconsciouschar',
      'vulnerable')
alias('Clingy', 'attachment', 'clingly', 'clingy girl', 'needy', 'needy_clingy', 'needyandclingy')
alias('Tomboy', 'muscular tomboy', 'tomboyish', 'toned tomboy')
alias('Nerd', 'bookish', 'bookworm', 'dorky', 'geek', 'hot nerd', 'nerd girl', 'nerd virgin', 'nerdgirl',
      'nerdy', 'otaku', 'weeaboo', 'weeb')
alias('Bimbo', 'airhead', 'bakadere', 'bimbo/himbo', 'ditzy', 'dumb', 'dumb bimbo', 'dummy',
      'intelligent bimbo', 'stupid', 'gal', 'Gyaru')
alias('Mean', 'bitchy', 'brash', 'chav', 'cocky', 'greedy', 'hateful', 'haughty', 'kamidere',
      'karen', 'mean girl', 'mean/catty', 'mean_catty', 'meangirl', 'queen bee', 'queenbee', 'rude')
alias('Manipulative', 'blackmail', 'deception', 'emotional manipulation', 'gaslighting',
      'manipulatedchar', 'manipulation', 'manipulativebutcute')
alias('Cunning', 'savvy', 'scheming', 'sneaky')
alias('Innocent', 'clueless', 'cute and innocent', 'fakeinnocent', 'gullible', 'innocence', 'innocenceweek',
      'innocentpure', 'naive', 'oblivious', 'pure')
alias('Clumsy', 'klutz', 'klutzy')
alias('Crazy', 'batshitcrazy', 'delusional', 'insane', 'psychopath', 'psychosis', 'psychotic', 'schizo',
      'schizophrenia', 'sociopath', 'unhinged')
alias('Lonely', 'isolated', 'isolation', 'touch starved', 'touch starvation', 'touch-starved', 'touchedstarved')
alias('Pushover', 'damselindistress', 'doormat', 'people pleaser')
alias('Pervert', 'degenerate', 'filthy', 'goon', 'gooner', 'goonette', 'gooning', 'perverted',
      'secret slut', 'secretly horny', 'shameless')
alias('Goth', 'emo', 'goth girl', 'gothgirl', 'mall goth', 'scene girl')
alias('Punk', 'heavy metal', 'metalhead', 'punkrock', 'punkrocker')
alias('Stoner', 'pothead', 'smoker', 'vape smoker', 'weed')
alias('Villain', 'antagonist', 'anti hero', 'anti-hero', 'corrupt', 'evil', 'morallygray', 'supervillain',
      'tragic villain', 'villain protagonist', 'villainess')
alias('Rich', 'chaebol', 'heiress', 'ojou-sama', 'rich girl', 'wealthy')
alias('Loser', 'femcel', 'girl failure', 'girlfailure', 'hikikomori', 'hotmess', 'incel', 'incel/femcel', 'neet', 'neet girl', 'unpopularuser')
alias('Delinquent', 'troublemaker')
alias('Cosplay', 'cosplayer')

# Relationship / Role
alias('Girlfriend', 'college girlfriend', 'exgirlfriend', 'first girlfriend', 'girlfriendchar',
      'loving girlfriend')
alias('Wife', 'badwife', 'ex-wife', 'exwife', 'fallingmarriage', 'housespouse', 'housewife', 'loving wife',
      'married woman', 'messybreakup', 'neglected wife', 'trad wife')
alias('Childhood Friend', 'childhood best friend', 'childhoodbestfriend', 'childhoodfriend')
alias('Best Friend', 'bestfriend', 'bff')
alias('Friend', 'platonic')
alias('Friends to Lovers', 'childhood friends to lovers', 'friendstolover', 'friendstolovers')
alias('Enemies to Lovers', 'enemies', 'rival', 'rivalry', 'rivals')
alias('Friends with Benefits', 'casual encounters', 'enemies with benefits', 'friendswithbenefits',
      'fuckbuddies', 'fwb')
alias('Stranger', 'chance meeting', 'meeting', 'random encounter', 'strangerstolovers', 'strangerstomore')
alias('Roommate', 'cohabitation', 'housemate', 'live-in relationship', 'roomate')
alias('Neighbor', 'neigbor', 'neighborchar', 'neighbour', 'person next door')
alias('Coworker', 'colleague', 'office girl', 'office lady')
alias('Classmate', 'schoolmate')
alias('Boss', 'ceo', 'manager')
alias('Teacher', 'professor', 'professoruser', 'tutor', 'virgin teacher')
alias('Student', 'trainee')
alias('Mother', 'adoptivemom', 'aftermotherhood', 'mama', 'milf mom', 'mom', 'mommy', 'mother and daughter',
      'mother and son')
alias('Stepmother', 'step mom', 'step mother', 'stepmom')
alias('Sister', 'big sister', 'imouto', 'little sister', 'older sister', 'oldersister', 'sis',
      'younger sister', 'youngersister')
alias('Stepsister', 'step sister', 'step-sibling', 'stepsibling', 'stepsis')
alias('Daughter', 'sons girlfriend', 'sonsgirlfriend',
      'step daughter', 'stepcest', 'stepdaughter')
alias('Milf', 'girlfriend\'s mom', 'girlfriendsmom', 'mature', 'milfmonth')
alias('Single Mother', 'single mom', 'singlemom', 'surrogatemother')
alias('Married', 'marriage', 'married couple', 'married life', 'marriedlife', 'spouse', 'wedding ring')
alias('Arranged Marriage', 'arranged relationship', 'arrangedmariage', 'arrangedmarriage',
      'contractual relationship', 'forced marriage', 'forcedmarriage')
alias('Slow Burn', 'lingering', 'mutual pining', 'patience', 'slow burn escalation', 'slow burn rescue',
      'slow-burn', 'slowburn', 'slowburnromance', 'waiting')
alias('Forbidden Romance', 'forbidden', 'forbidden desire', 'forbidden love', 'forbiddenromance', 'taboo')
alias('Royalty', 'nobility', 'noble', 'noblerights', 'noblewoman', 'prince', 'princess', 'queen', 'royal')
alias('Nun', 'priestess', 'priestessnun', 'shrine maiden')
alias('Idol', 'idol manager', 'j-pop', 'jpop', 'kpop', 'kpop idol', 'pop idol', 'popstar',
      'k-pop', 'k-pop idol', 'songaloid', 'virtual idol')
alias('Streamer', 'content creator', 'livestreamer', 'twitch streamer', 'twitchstreamer', 'vtuber', 'vtuberchar', 'youtuber')
alias('Celebrity', 'celebchar', 'fame', 'famous', 'influencer', 'instagram', 'internet celebrities', 'internet famous',
      'itgirl', 'popular', 'popular girl', 'egirl', 'e-girl')
alias('Fiancee', 'bride', 'engaged')
alias('Widow', 'widowed')
alias('Bully', 'bullied', 'bulliedchar', 'bulluser', 'bully victim', 'bullying', 'bullyuser',
      'childhood bully', 'exbully', 'female bully', 'formerbully')
alias('Landlord', 'landlord and tenant')
alias('Tenant', 'freeloader')
alias('Sugar Mommy', 'sugarmommy')
alias('Age Gap', 'age difference', 'agedifference', 'agegap', 'older female')
alias('Fake Dating', 'fake relationship', 'fakedating')
alias('Friends to Enemies', 'lovers to enemies', 'loverstoenemies')
alias('Father', 'dad', 'dad and son', 'daddy', 'daddy issues', 'daughterandfather', 'father and daughter',
      'father-daughter', 'gangster-dad')
alias('Family', 'adoption', 'familyissues', 'familyreunion', 'familyviolence', 'found family',
      'granddaughter', 'niece', 'sibling')
alias('Dating', 'blind date', 'catfish', 'date', 'dating app', 'dating sim', 'dating simulator',
      'double date', 'exchange student', 'foreign exchange', 'foreign exchange student', 'hookup',
      'hookup app', 'meet-cute', 'new relationship', 'newrelationship', 'somethingmore', 'speed dating',
      'love interest', 'speeddating', 'the perfect match', 'tinder', 'tinder match')
alias('Unrequited Love', 'crush', 'fangirl', 'friendzone', 'friendzoned', 'hidden desire', 'hiddenfeelings',
      'innocent flirting', 'oppositeattract', 'opposites attract', 'secret crush', 'secretattraction',
      'secretcrush', 'unrequitedlove')
alias('Long Distance', 'online relationship')
alias('Ex-Girlfriend', 'ex girlfriend', 'exgirlfriendssister', 'friendssister', 'wifesfriend')
alias('Companion', 'assistant', 'helper', 'helpers', 'rpg companion', 'wingwoman')

# Age
alias('Age Defined', 'ddlg', 'legal teen', 'loli', 'shota', 'teen', 'teenager', 'toddler', 'underage',
      'young', 'young adult', 'young adult female', 'young adult girl', 'young adult woman', 'youngeruser',
      'zoomer')

# Gender
alias('Female', 'female', 'female character', 'female protagonist', 'females', 'gender: female', 'girl',
      'girls', 'woman', 'women')
alias('Male', 'gender: male', 'male', 'male character', 'male protagonist', 'males', 'man', 'men')

# Cast
alias('Multiple Characters', 'ensemble', 'ensemble cast', 'group chat', 'groupchat', 'multiple',
      'multiple characters', 'multiple protagonists')

# Sexuality
alias('Lesbian', 'lesbian (w4w)', 'lesbian cheating', 'wlw')
alias('Bisexual', 'bi', 'pansexual')
alias('Asexual', 'ace', 'aromantic')

# Activity
alias('Sports', 'athlete', 'athletic', 'basketball', 'boxer', 'boxing', 'cheerleader', 'cheerleaders',
      'college cheerleader', 'competitive', 'figure skater', 'firstdayatthegym', 'fitness', 'gym',
      'gymnast', 'gymnast girl', 'gymnastics', 'hiking', 'jock', 'racer', 'racing', 'rollerderby',
      'sport', 'sportgirl', 'sporty', 'surfer', 'volleyball', 'workout', 'wrestling', 'yoga')
alias('Gaming', 'anime game characters', 'fighting game', 'game', 'game characters', 'game show', 'gamer',
      'gamer girl', 'gamergirl', 'games',
      'open world', 'otome', 'rpg', 'spinner', 'tabletop', 'video game', 'video games', 'videogame', 'vr',
      'vrmmo')
alias('Music', 'band', 'dancer', 'musician', 'musicianchar', 'rapper', 'singer', 'song references',
      'soundcloud')
alias('Nightlife', 'bar', 'club', 'clubbing', 'disco', 'festival', 'gala', 'night out', 'nightclub', 'party',
      'party girl', 'party scene', 'party/festival', 'partygirl', 'partying', 'partyscene', 'pub', 'rave')
alias('Gambling', 'casino', 'debt', 'high stakes', 'poker')

# Holiday
alias('Christmas', '2025christmas', 'christmas2024', 'xmas')
alias('Halloween', 'halloween2024', 'spooktober')
alias('Valentine\'s Day', 'thevalentine', 'valentine2025', 'valentines day', 'valentinesday')
alias('Birthday', 'bday')

# Content Rating
alias('SFW', 'safe for work')
alias('NSFW', 'anal', 'blowjob', 'blowjobs', 'casual sex', 'caught', 'caught masturbating', 'dirty',
      'erotic', 'erotica', 'exploration of sexuality', 'first time', 'freakinthesheets', 'horny',
      'hornybum', 'kinky', 'lewd content', 'lust', 'masturbation', 'moaning', 'oral', 'porn',
      'porn studio', 'pornography', 'sex', 'sex positive', 'sex with strangers', 'sexual tension',
      'smut', 'smut 🔥❤', 'smutbait', 'smutifuserwants', 'temptation', 'xrated21orabove')
alias('Can Be Wholesome, Can Be Sexy', 'can be sexy', 'can be wholesome', 'can be wholesome can be sexy',
      'canbesmutflufforangst', 'sfw &lt;-&gt; nsfw', 'sfw <-> nsfw')

# NSFW Theme / Kink
alias('NTR', 'avoidablentr', 'avoidablesa', 'avoidabletf', 'consensualntr', 'corruption ntr',
      'double netori', 'fakentr', 'fuckntr', 'hardntr', 'netorare', 'ntr avoidable', 'ntr cheating wife',
      'ntr crusade', 'ntr-adjacent', 'ntrbait', 'possible ntr', 'possiblentr', 'post-ntr', 'postntr',
      'potentialntr', 'prentr', 'reversentr', 'unavoidablentr')
alias('Anti-NTR', 'antintr', 'no-ntr', 'nonntr', 'nontr', 'notntr')
alias('Netori', 'optionalnetori')
alias('Netorase', 'nts')
alias('Cheating', 'affair', 'cheateruser', 'cheating wife', 'emotional cheating', 'emotionalcheating',
      'impliedcheating', 'infidelity', 'possiblecheating')
alias('Harem', 'multiple girls')
alias('Dominant', 'dom', 'dommy', 'gentledom', 'servicetop', 'soft dom')
alias('Submissive', 'bottom', 'forced submission', 'healslut', 'reluctant submission', 'soft submissive',
      'sub', 'submissive female')
alias('Switch', 'dominant <-> submissive')
alias('BDSM', 'aftercare', 'consensual power exchange', 'magical control', 'permission')
alias('Bondage', 'magical bondage', 'restraints', 'rope bunny', 'shibari')
alias('Free Use', 'freeuse', 'freeusegirl', 'freeuseworld')
alias('Exhibitionism', 'accidentalnudity', 'casual nudity', 'exhibitionist', 'nudist', 'public',
      'public nudity', 'publichumiliation')
alias('Voyeurism', 'vouyerism', 'voyeur')
alias('Pregnancy', 'abortion', 'breast feeding', 'breastfeeding', 'impregnation', 'lactation', 'pragnent',
      'pregananant', 'pregant', 'pregegnant', 'preggo', 'pregnant', 'pregonant')
alias('Corruption', 'corrupted', 'corruptyourfriend', 'slow corruption')
alias('Mind Control', 'brainwashed', 'brainwashing', 'mind break', 'mind games', 'mindbreak')
alias('Hypnosis', 'hypnosisapp', 'hypnotism', 'hypnotist', 'hypnotized')
alias('Non-Con', 'assault', 'extremenoncon', 'made for rape', 'noncon', 'noncon/dubcon',
      'nonconsensual', 'rape', 'rape fantasy', 'rape victim', 'reverse rape', 'sexual assault',
      'sexual harassment', 'sexual predator')
alias('Dubcon', 'cnc', 'cncpossible', 'coercion', 'coersion', 'dub-con')
alias('Sex Work', 'brothel', 'concubine', 'hooker', 'onlyfans', 'pimp', 'prostitute', 'prostitution',
      'sex industry', 'sex worker', 'sexworker', 'street hooker', 'whore')
alias('Slavery', 'hostage', 'indentured', 'owner', 'ownership', 'servant', 'sex slave', 'sex slavery',
      'slave', 'slave girl', 'slavechar', 'slaveuser', 'trafficked', 'master-servant')
alias('Cuckold', 'cuck', 'cuckolding', 'cuckquean', 'hotwife')
alias('Futanari', 'futa')
alias('Public Sex', 'stealth sex')
alias('Rough Sex', 'hate sex')
alias('Virgin', 'kissless virgin', 'virginity')
alias('Nympho', 'hypersexuality', 'nymphomaniac', 'promiscuous', 'sex addict', 'slut', 'slutty')
alias('Degradation', 'degradationkink', 'degredation', 'degrading', 'humiliation', 'objectification')
alias('Group Sex', 'orgy', 'groupsex', 'threesome', 'foursome')
alias('Gangbang', 'gangbangs', 'gangrape')
alias('Gender Bender', 'gendebent', 'genderbend', 'genderbent', 'genderswap', 'multiple genders', 'tomgirl')
alias('Femboy', 'femboynpc', 'trap')
alias('Sex Toys', 'dildo', 'sex toy', 'sextoy', 'toys')
alias('Polyamory', 'poly', 'polyamarous', 'polyamorous', 'polyamorous relationship',
      'polyamorous relationships')
alias('Open Relationship', 'open marriage', 'openmarriage', 'openrelationship')
alias('Swingers', 'swinging', 'wife sharing')
alias('Incest', 'oyakodon', 'step incest', 'twincest')
alias('Fetish', 'accidental sex', 'age play', 'anal fixation', 'anal virginity',
      'aphrodisiac', 'armpit', 'ass worship', 'beastiality', 'begging', 'bestiality', 'bimbofication',
      'bloodplay', 'body betrayal', 'body odor', 'body worship', 'bromidrophilia', 'bukkake', 'chastity',
      'chikan', 'cock addict', 'cock worship', 'control kink', 'couch sex', 'cum addict', 'cum play',
      'cumdump', 'cumfetish', 'cunt torture', 'denial', 'detailed kinks', 'dollification', 'edging', 'enf',
      'face sitting', 'feminization', 'fingering', 'foulmouthedinbed', 'glory hole', 'gloryhole',
      'guided masturbation', 'guilt kink', 'hair kink', 'inanimatetf', 'kitchen sex', 'medical kink',
      'non-human genitalia', 'oral fixation', 'oral sex', 'oralfixation', 'orgasm control', 'orgasm denial',
      'overstimulation', 'painal', 'pegging', 'period sex', 'periodsex', 'primaldenial', 'raceplay',
      'rimming', 'risqué', 'scat', 'secretlykinky', 'sensory play', 'sexual awakening',
      'sexual roleplay', 'shame play', 'size difference', 'size queen', 'sizeplay', 'smell',
      'smellfetish', 'smellkink', 'smelly', 'squirt', 'squirting',
      'stinky', 'sweat', 'tantric', 'thighjob', 'worship',
      'zoophilia')
alias('Femdom', 'dommy mommy', 'dommymommy', 'femdom', 'findom', 'gentle femdom', 'gentlefemdom',
      'gothmommy', 'muscle mommy', 'soft femdom')
alias('Breeding', 'alien breeding', 'breedable', 'breeding', 'breeding kink', 'breeding program',
      'creampie', 'fertility law', 'milking farm cow', 'womb tattoo', 'wombtattoo')
alias('Foot Fetish', 'feet', 'feet fetish', 'foot fetish', 'footfetish', 'footjob', 'footworship',
      'trampling')
alias('Sadomasochism', 'masochism', 'masochist', 'masochistic', 'ryona', 'sadism', 'sadist', 'sadistic')
alias('Pet Play', 'claiming', 'heat cycle', 'heat cycles', 'heat/rut', 'in heat', 'lifestyle pet play', 'marking',
      'pet', 'pet play', 'petplay', 'predator/prey', 'prey', 'prey/predator', 'primal', 'scent marking',
      'territorial', 'willing prey')
alias('Watersports', 'bladder desperation', 'desperation', 'holding contest', 'hydration kink',
      'omorashi', 'pee', 'piss', 'piss kink', 'piss play', 'pisskink', 'plug play', 'watersports')

# Occupation
alias('Knight', 'barbarian', 'female knight', 'highlander', 'paladin')
alias('Warrior', 'fighter', 'gladiator', 'martial artist', 'martial arts', 'summoner', 'tamer', 'tank')
alias('Magical Girl',  'magical girl')
alias('Mage', 'cleric', 'enchantress', 'holy magic', 'magi', 'magic user','magician', 'mudang', 'shaman',
      'sorcerer', 'sorceress', 'witch', 'witchcraft', 'wizard')
alias('Assassin', 'assasin', 'hitman', 'killer')
alias('Doctor', 'doctorchar', 'healer', 'health', 'healthcare', 'hospital',
      'medical student')
alias('Police Officer', 'cop', 'police', 'policegirl')
alias('Soldier', 'bodyguard', 'captain', 'mercenary', 'military', 'veteran')
alias('Mafia', 'cartel', 'crime syndicate', 'gangster', 'mob', 'yakuza')
alias('Bartender', 'barista', 'barmaid', 'taverngirl')
alias('Waitress', 'maid cafe', 'waiter')
alias('Artist', 'fashion designer', 'florist', 'guitarist', 'mangaka', 'painter', 'photography', 'vocalist')
alias('Writer', 'author')
alias('Scientist', 'archeologist', 'marine biology', 'science')
alias('Stripper', 'pole dancer')
alias('Pornstar', 'porn star')
alias('Spy', 'defector', 'pmc', 'secret agent', 'sniper', 'spychar')
alias('Viking', 'norse', 'vikings')
alias('Samurai', 'ronin', 'swordsman')
alias('Ninja', 'shinobi')
alias('Therapist', 'psychiatrist', 'psychologist', 'therapy')
alias('Thief', 'con artist', 'con-artist', 'grifter', 'hustler', 'outlaw', 'pickpocket', 'rogue', 'scam',
      'scammer')
alias('Secretary', 'assistant/secretary')
alias('Model', 'supermodel')
alias('Bard', 'minstrel')
alias('Hunter', 'archer', 'huntedchar', 'ranger')
alias('Adventurer', 'a-rank', 'adventurer guild', 'adventurer party', 'guild', 'guild leader',
      'guild master', 'guild rpg', 'rookie', 's-rank', 'wolf adventurer')
alias('Detective', 'noir detective')
alias('Hacker', 'cybercrime', 'engineering', 'programmer', 'programming')
alias('Librarian', 'bookstore')
alias('Entertainer', 'actress', 'performer', 'theatre')
alias('Intern', 'job interview')
alias('Working Class', 'baker', 'biker', 'bikerbabe', 'blue collar', 'business owner', 'cashier', 'cook',
      'executive', 'ghetto', 'mail carrier', 'massage', 'massage therapist', 'part-timer', 'pink collar',
      'receptionist', 'retail', 'stuntwoman',
      'unemployed', 'white collar')

# Plot / Theme
alias('Betrayal', 'bestfriendbetrayal', 'possiblebetrayal')
alias('Revenge', 'vengeance')
alias('Kidnapping', 'captive', 'captivity', 'capture', 'home invasion', 'homeinvasion', 'kidnapped',
      'kidnapper', 'prison', 'prisoner', 'trapped')
alias('Toxic Relationship', 'codependent', 'controlling', 'controllingpartner', 'power play',
      'powerimbalance', 'toxic', 'unhealthy relationship')
alias('Power Imbalance', 'class difference', 'classdifference', 'control', 'power dynamics', 'power fantasy')
alias('Stalker', 'stalking')
alias('Redemption', 'newbeginnings', 'redemptionweek', 'second chance', 'secondchance')
alias('Secret Identity', 'double life', 'false identity', 'hidden identity', 'masks', 'secret',
      'secret princess', 'secretlife', 'secretpast', 'secretprincess')
alias('Time Travel', 'deathloop', 'time loop', 'time traveler', 'time travelling', 'timeleap', 'timeloop')
alias('Religion', 'catholic', 'christian', 'christianity', 'church', 'conversion', 'cult', 'exorcism',
      'faith', 'folklore', 'heaven', 'hell', 'monk', 'muslim', 'mythological', 'mythology', 'priest',
      'religious', 'saintess', 'spirituality', 'temple/church')
alias('Drugs', 'drug addict', 'drug dealer', 'drug use', 'drugaddict', 'drugged', 'drugging',
      'drugs/addiction', 'meth')
alias('Alcohol', 'alcoholic', 'drunk')
alias('Savior', 'reverse savior', 'saved from rape', 'saveher', 'saviorfagging', 'saviorkink')
alias('Stockholm Syndrome', 'stockholmsyndrome')
alias('Heartbreak', 'break up', 'breakup', 'messyromance', 'moving on', 'movingon', 'rejection')
alias('Refugee', 'survivor', 'foreign character(s)', 'foreigner', 'homeless', 'homelesschar', 'immigrant',
      'non-english', 'orphan', 'poor', 'runaway')
alias('Sleep', 'insomnia', 'sleep paralysis', 'sleeping', 'sleepover', 'sleepwalking', 'sleepy', 'sleep sex', 'somnophilia')
alias('Philosophical', 'existential', 'freedom', 'identity', 'justice', 'knowledge', 'meta', 'philosophy',
      'psychological', 'psychology')
alias('Politics', 'anti-gay', 'conservative', 'feminist', 'liberation', 'misandrist', 'politics', 'racism',
      'rebellion')

# Fandom
alias('Genshin Impact', 'genshinimpact', 'miyoverse')
alias('Honkai: Star Rail', 'honkai star rail', 'honkaistarrail')
alias('Zenless Zone Zero', 'zzz')
alias('Wuthering Waves', 'wutheringwaves')
alias('Final Fantasy XIV', 'ffxiv')
alias('League of Legends', 'arcane', 'leagueoflegends')
alias('World of Warcraft', 'wow')
alias('Warhammer', 'warhammer 40k', 'warhammer fantasy', 'warhammerfantasy')
alias('Star Wars', 'jedi', 'old republic', 'oldrepublic', 'sith', 'starwars')
alias('Baldur\'s Gate', 'baldurs gate')
alias('Dungeons & Dragons', 'd&amp;d', 'd&d', 'dnd', 'dungeon and dragons', 'dungeons and dragons',
      'faerun', 'forgotten realms')
alias('Harry Potter', 'hogwarts')
alias('Disney', 'disney princess', 'disneyland', 'dreamworks', 'the incredibles')

# Fandom — coined "series / universe" worlds private to the card-creator scene
# (promoted out of junk; display names get proper casing/spacing, smushed source form kept as alias)
alias('The Eternal Concord', 'theeternalconcord')
alias('Arloxe', 'arloxe')
alias('Alteyra', 'alteyra')
alias('Arcanthea', 'arcanthea')
alias('Memoria', 'memoria')
alias('Saga of Light and Shadow', 'saga of light and shadow')
alias('Broken Lace', 'brokenlace')
alias('Drakonia', 'drakonia')
alias('Nyxia', 'nyxia')
alias('Virtularia', 'virtularia')

# Mental Health / Condition
alias('Depression', 'bpd', 'depressed', 'mental illness', 'mentally ill', 'suicidal',
      'suicidalchar')
alias('Anxiety', 'anxious')
alias('Trauma', 'abandoned', 'abandonment issues', 'abuse', 'abuse victim', 'abuseaftermath', 'abusive',
      'broken', 'coping mechanisms', 'cruelfate', 'ptsd', 'domesticviolence', 'emotionaldamage', 'grief',
      'sadbackstory', 'traumabond', 'traumatic', 'traumatized')
alias('Autism', 'adhd', 'autistic', 'neurodivergent')
alias('Disability', 'anorexic', 'blind', 'cancer', 'cripple', 'deaf', 'disabled', 'disabledchar',
      'handicapped', 'incurabledisease', 'injured', 'terminal illness', 'terminalillness', 'terminallyill')
alias('Amnesia', 'amnesic', 'memory loss')
alias('Self-Harm', 'self harm', 'self-harm/suicide', 'selfharm')
alias('Addiction', 'addiction')

# ---- junk: dropped to removedTags -----------------------------------------
JUNK_EXACT = set(map(norm, [
    # second-pass additions (no descriptive content / abstract / invented handles)
    '5 greetings', 'aftermath', 'anatomical detail', 'authentic responses', 'body language',
    'body positive', 'brands', 'bullysmother', 'crush crush', 'elevator', 'embarrassment',
    'empire', 'filing system', 'found again', 'gigachadpov',
    'glitch', 'khevari', 'lntuniversity', 'losingbff', 'original world',
    'pattern recognition', 'performance vs reality', 'pinkpanther', 'separation', 'special',
    'specific preferences', 'stargate', 'stray', 'support', 'thegoat', 'thin walls', 'train',
    '1870s', '1950s', '2009', '2025', '500tokenpower', 'abandoned demihumans botjam [the orchard]',
    'accent', 'accident', 'adolion', 'adorable', 'adorkable', 'aegis city heroes', 'aetherlink', 'ai',
    'alichat', 'ambitious', 'amogus', 'among us', 'amymatzumi', 'animals', 'animation',
    'anime', 'anthro days,', 'any', 'any pov', 'any_pov', 'anypov',
    'apartment', 'app', 'aremm', 'arlo', 'art', 'asha', 'assassinpov',
    'asylum', 'athletic girl', 'athletic women', 'autistic as fuck bruh', 'baby', 'badassy',
    'baddecisions', 'badpersonpov', 'bbgenrejam', 'bbw', 'beautiful',
    'bedroom', 'big ass', 'big boobies', 'big boobs', 'big breast', 'big breasts', 'big butt',
    'big thighs', 'big tits', 'big woman', 'bikini', 'bitch', 'bitchuniversity', 'black hair',
    'blackrose', 'bleached', 'blonde', 'blonde hair', 'blue eyes', 'blue hair', 'blue skin', 'bmovie',
    'body modification', 'bohemian', 'books', 'botmas', 'botmas 25', 'botmas25', 'british accent',
    'brown skin', 'brunette', 'bullypov', 'bullyweek', 'burn scars', 'bwc',
    'cafe', 'café', 'cai', 'canon compliant', 'canon_compliant', 'canyousaveher', 'caregiver',
    'cartoon', 'chameleon', 'chaotic', 'character', 'character expressions',
    'charismatic', 'chat', 'chat image', 'chat images', 'chatbot', 'chatroom', 'chess', 'chub',
    'chub love 2025', 'chubaween 2023', 'chubby', 'circus', 'city of darkness',
    'city of darkness villain', 'classy', 'claude', 'closeted', 'clothesdontfitweek',
    'confident', 'confrontation', 'consensual', 'contest', 'conversation',
    'cooked', 'coombot', 'crestfalltown', 'crestfalltownoc', 'cringe but cute', 'cringey', 'culture',
    'cupidconnections', 'curious', 'curvy', 'curvy figure', 'cute', 'cute speech pattern',
    'cutebutdangerous', 'daredevil', 'dark-skinned', 'deadwood', 'demipov', 'demiweek',
    'demon pov', 'desert', 'detroit2220', 'dhu', 'diner', 'direct message', 'disabled user',
    'divided skies', 'doll', 'dork', 'drowned earth', 'dumbasabrick', 'dungeon',
    'eaglefangseries', 'eltaraseries', 'emergency', 'emotional intimacy', 'emotionally unavailable',
    'empath', 'empathetic', 'endoftheuniverse', 'enhanced', 'entertainment',
    'experimental', 'expression pack', 'expressions pack', 'extrovert', 'extroverted', 'fadeddreams',
    'fantasyweek', 'fem/femme', 'fempov', 'fictional',
    'fictional character', 'finalgirljam', 'first person', 'fish', 'fishoutofwater', 'fit',
    'flat chest', 'flatchested', 'forced proximity',
    'fork', 'fork of a fork', 'france', 'freakacademy', 'freakyahhbot', 'freckles',
    'freezing', 'friendstosomething', 'fujoshi', 'gallery', 'gardenofsins',
    'geekdom', 'ginger', 'glasses', 'glowup',
    'gonuts', 'goodluckdude', 'goodpersonpov', 'gorgeous',
    'gpt3.5turbo', 'gpt4', 'green eyes', 'greeting art', 'greeting images',
    'groupiepov', 'grumpy', 'hallura', 'handlewithcare', 'hardtimes', 'harmony heroines',
    'heroparty', 'hiddenpersonality', 'holidays', 'holidays2025', 'home', 'homestay', 'horse',
    'horse streamer', 'horsecock', 'hot', 'hotel', 'huge ass', 'huge breasts',
    'huge butt', 'hyper butt', 'i love cheesecake', 'ilovewomen', 'image generating',
    'image greetings', 'images in gallery', 'immortal', 'incrediblydumb', 'independent',
    'indie', 'inner thoughts', 'intelligent', 'interactiveimages',
    'interracial', 'interview', 'introverted', 'inverted nipples', 'islaport', 'itskandi',
    'kakkodere', 'kayra', 'kinda cringe', 'kindofbrattyiguess', 'klinaterra',
    'large anatomy', 'large breasts', 'large butt', 'lassie', 'little', 'little breasts', 'loj',
    'long hair', 'long legs', 'lore', 'lorebook', 'lorebook included', 'lorebookincluded',
    'los angeles', 'los arcanos', 'los fangeles', 'lost', 'lyozes', 'm4a', 'm4f',
    'magia', 'magika', 'maincharactersyndrome', 'malaysia', 'malepov',
    'manga', 'mao bao', 'marysue', 'massive ass', 'massive breasts', 'medium breasts',
    'megane', 'meganekko', 'meltsyourheart', 'memes', 'meowami',
    'minneapolis', 'misunderstanding', 'mitsuri', 'mitsurikanroji', 'miyabisearstd6',
    'monsterpov', 'moondropvalley', 'moraldilemma', 'more death threats than a call of duty lobby',
    'moth', 'movie', 'movies & tv', 'multiple greetings',
    'multiple personality', 'multiple scenarios', 'multiple_greetings', 'muscle', 'muscular',
    'music maina', 'music mania', 'musicmaina2', 'musicmania', 'musicmania2', 'mythomax', 'new houston',
    'nicetbrazilianromance', 'no limits', 'non-humanpov', 'nosebleed',
    'not oc because its a fork hihiha', 'novelai', 'nsfwpics', 'oai', 'oc', 'oneofthebros',
    'oneorangebraincell', 'online', 'online chat', 'orange eyes', 'orca', 'original character',
    'original characters', 'original_prose', 'pale skin', 'parallel universe', 'parasocial',
    'passporttopages', 'paul', 'peace', 'perfect body',
    'petalsinwinter', 'petite', 'petrock', 'pets', 'physics', 'pictures', 'piercings',
    'pink hair', 'pixie cut', 'plus size', 'pointed ears', 'possible', 'possiblefluff',
    'possibleromance', 'post', 'poundseries', 'practice', 'presidentsdaughter', 'probably racist 👀',
    'propagate her', 'psychiatristpov', 'purple eyes', 'raccoon',
    'ragequitter', 'reality tv', 'red eyes', 'red hair',
    'redhead', 'restaurant', 'reupload', 'reversed personality', 'richarrd', 'rimevale',
    'rokos basilisk', 'roleplay', 'root', 's.t.a.l.k.e.r', 's.t.a.l.k.e.r.', 'sacrifice',
    'sandbox', 'sapiosexual', 'sarah', 'sarntetralogy', 'scenario',
    'second person-pov', 'self insert', 'self-aware', 'selfbot', 'selfdestructive', 'selfinsert',
    'sensitive', 'sequel card', 'sexbot', 'sexy', 'shadow clones', 'shaved', 'sheaveragefr',
    'sheepinwolfsclothing', 'sheiscrazy', 'shetallfr', 'short', 'short hair', 'shortstack', 'shotapov',
    'silly tavern', 'sillytavern', 'simulation', 'simulator', 'sitchel', 'skinny', 'small anatomy',
    'small breasts', 'smallbreasts', 'smuff', 'snake', 'social skills', 'southern', 'southern accent',
    'snowstorm', 'special5k', 'spider', 'springfever', 'srank',
    'starlight superhero universe', 'stars', 'starstruck world', 'std', 'stealingclothes', 'stepford',
    'straight', 'strong woman', 'stuck', 'stuckinanelevator', 'stuckindryer', 'stuckwithyou!',
    'suburbangothic', 'succession', 'supercity', 'superpowerweek', 'supportive', 'suspiciousbehavior',
    'swimsuit', 'tall', 'tall woman', 'tanned', 'tattoos', 'tavern', 'teasingaffecftion', 'tech',
    'technology', 'texting', 'the beginning', 'thebasement',
    'thesunderedstars', 'theunderworldchapter', 'theworldofterra', 'thicc', 'thick', 'thick thighs',
    'thigh', 'third person', 'time', 'tiny', 'tiny titties', 'tits', 'toned muscles',
    'trust', 'twintails', 'ughhhhyixuannnn', 'undeniably a coom bot', 'underagepov',
    'unestablished relationship', 'unity space opera', 'unreliable narrator', 'unreliable/flakey',
    'unsealed', 'untaguniverse', 'urban fiction', 'urbex gone wrong', 'user harm', 'vartania',
    'velkora', 'veltharion', 'veyonis', 'vikingpov', 'villainpov', 'voluptous', 'voruun',
    'w4a', 'w4m', 'weird!!! shes weird!!!!', 'well-intentioned extremist', 'wench',
    'what am i doing with my life', 'white hair', 'white worship', 'wholeawesome', 'wholesomeweek',
    'wide hips', 'wish.com botjam', 'wmaf', 'woman', 'workshop botmas 25', 'xenosis', 'year900',
    'zooweemama', '👤 anypov',
]))

# transient single-word moods with no archetype home (folded-to-junk per review)
MOOD_JUNK = set(map(norm, [
    'angry', 'arrogant', 'desperate', 'emotional', 'guilty', 'happy', 'hedonistic', 'lustful',
    'melancholic', 'nihilistic', 'reluctant', 'sad',
]))

HOLIDAY_PAT = [
    (re.compile(r'christmas'), 'Christmas'),
    (re.compile(r'halloween'), 'Halloween'),
    (re.compile(r'valentine'), "Valentine's Day"),
    (re.compile(r'easter'), 'Easter'),
]

# ---- classify -------------------------------------------------------------
mapping = defaultdict(set)
removed = set()
unmapped = set()

for n, origs in norm_to_orig.items():
    if n in ALIASES:
        mapping[ALIASES[n]].update(origs)
        continue
    if n in JUNK_EXACT or n in MOOD_JUNK:
        removed.update(origs)
        continue
    matched = False
    for pat, canonical in HOLIDAY_PAT:
        if pat.search(n):
            mapping[canonical].update(origs)
            matched = True
            break
    if not matched:
        unmapped.update(origs)

# ---- emit -----------------------------------------------------------------
out = {
    'generatedAt': src.get('generatedAt'),
    'cardCount': src.get('cardCount'),
    'canonicalCategories': CANON_BY_CAT,
    'mapping': {k: sorted(mapping[k]) for k in sorted(mapping)},
    'removedTags': sorted(removed),
    'unmapped': sorted(unmapped, key=str.lower),
}
json.dump(out, open(f'{ROOT}/base-mapping-v2.json', 'w'), indent=2, ensure_ascii=False)

# validation: each canonical belongs to exactly one category; no orphan mapping keys
seen = {}
for cat, tags in CANON_BY_CAT.items():
    for t in tags:
        if t in seen:
            print(f'WARNING: canonical "{t}" in both "{seen[t]}" and "{cat}"', file=sys.stderr)
        seen[t] = cat
for k in mapping:
    if k not in seen:
        print(f'WARNING: mapping key "{k}" is not a defined canonical', file=sys.stderr)

print(f'normalized source tags : {len(norm_to_orig)}')
print(f'mapped to canonical    : {sum(1 for n in norm_to_orig if n in ALIASES or any(p.search(n) for p,_ in HOLIDAY_PAT))}')
print(f'  (orig spellings       : {sum(len(v) for v in mapping.values())})')
print(f'removed (junk)         : {len(removed)}')
print(f'unmapped (for review)  : {len(unmapped)}')
print(f'canonical defined/used : {len(ALL_CANON)} / {len(mapping)}')
print(f'canonical UNUSED       : {sorted(set(ALL_CANON) - set(mapping))}')
