/** 52-card flourish */
export const FIFTY_TWO_CARD_FLOURISH =
	'move 3⡃b 8S→cell (flourish52 33357d226765475665745627157ab15775185187781581571578 AS,AD,AC,2S,2D,2C,3D,AH,2H,3S,3C,3H,4S,4D,4C,4H,5S,5D,5C,5H,6S,6D,6C,6H,7S,7D,7C,7H,8S,8D,8C,8H,9S,9D,9C,9H,TS,TD,TC,TH,JS,JD,JC,JH,QS,QD,QC,QH,KS,KD,KC,KH)';

/**
	these are <action> -> <state immediately before the action>

	that is to say, here is a game state, where, we can apply this specific action

	- REVIEW (techdebt) (actionText) every `move \w\w ` should be replaced, aallll 400 of them

	- REVIEW (techdebt) (actionText) (test) compare `ACTION_TEXT_EXAMPLES` to test data
	   - log every single `Freecell.action.text` that goes through the `Freecell.constructor`
	   - log every action in `Freecell.history`
	   - categorize them
	      - select ⨉ pile∊fixture
	      - move ⨉ pile∊fixture ⨉ pile∊fixture
	   - etc
	   - ensure they are covered here
	   - store and test every game state in example game #5
	   - and vice-versa because some of these are outdate

	- REVIEW (techdebt) (actionText) (test) [Fuzzing Programs to Find Bugs · Computerphile](https://www.youtube.com/watch?v=kaD54VXxGrI)
	   - apparently, this is what I want to do ^^: build a corpus of examples
	   - start with Game #5 as a base, including every single move
	   - include the other defined games (probably cleanest to just include the whole thing, than figure out layering them)
	   - we already found random game states to test, so include those (through actual gameplay or otherwise)
	   - do we write a fuzzing?
	      - e.g. While Game #5 has a set of actual moves, we could spot check all the moves it did not make (valid yes, invalid?)
	      - e.g. Discard history and swap random cards on the board (making both valid and invalid states), and then retry the given move
	      - the important thing is, we need to know if the fuzzing is worth recording, how to automatically generate it and automatically evaluate it?
*/
export const ACTION_TEXT_EXAMPLES: Record<string, string> = {
	'init': '', // we cannot "take an action" to make an init
	'init with invalid history': '', // we cannot "take an action" to make an init with invalid history
	'init partial': '',
	// 'hand-jammed': '', // XXX (techdebt) as much as this isn't _supposed_ to be supported, it kind of is part of the tests now
	'shuffle deck (1)':
		'                         \n' +
		'                         \n' +
		':d KS KH KD KC QS QH QD QC JS JH JD JC TS TH TD TC 9S 9H 9D 9C 8S 8H 8D 8C 7S 7H 7D 7C 6S 6H 6D 6C 5S 5H 5D 5C 4S 4H 4D 4C 3S 3H 3D 3C 2S 2H 2D 2C AS AH AD AC ',
	'deal 1 card': '',
	'deal 2 cards': '',
	'deal 44 cards': '',
	'deal all cards': '',
	'cursor set': '',
	'cursor set KH': '',
	'cursor set b': '',
	'cursor set h⡂': '', // home needs coords
	'cursor set h AD': '', // unless we have a card
	'cursor set 6 2D': '',
	'cursor set 3': '', // a cascade without coords means it's 0 (no card, empty cascade)
	'cursor set k': '',
	'cursor set k KH': '',
	'cursor up': '',
	'cursor left': '',
	'cursor down': '',
	'cursor right': '',
	'cursor up wrap': '',
	'cursor left wrap': '',
	'cursor down wrap': '',
	'cursor right wrap': '',
	'cursor stop': '',
	'cursor stop KH': '',
	'cursor stop b': '',
	'cursor stop h⡂': '',
	'cursor stop h AD': '',
	'cursor stop 6 2D': '',
	'cursor stop 3': '',
	'peek 8 QS': '',
	'peek 8 4D-3S-2D': '',
	'select 8 7C': '',
	'select 8 4D-3S-2D': '',
	'deselect 6 2D': '',
	'deselect 6 4D-3S-2D': '',
	'touch stop':
		'             QC TD KH 9S \n' +
		' QS KC       TS          \n' +
		' JD QD       KS          \n' +
		' KD JS                   \n' +
		' hand-jammed',
	'move 3⡂a KC→cell':
		'             AD 3C 4H 3S \n' +
		' QH TS 2D 7C 4C 7D QC KH \n' +
		' JC 9D 9C 6H 4D 6C JD QS \n' +
		' TH 8C KC 5S KD 5H    JH \n' +
		'             8H 4S    TC \n' +
		'             KS 3D    9H \n' +
		'             QD       8S \n' +
		'             JS       7H \n' +
		'             TD       6S \n' +
		'             9S       5D \n' +
		'             8D          \n' +
		'             7S          \n' +
		'             6D          \n' +
		'             5C          \n' +
		' move 37 JD→QC\n' +
		':h shuffle32 5\n' +
		' 53 6a 65 67 85 a8 68 27 \n' +
		' 67 1a 1b 13 15 a5 1a 1c \n' +
		' 86 85 86 86 21 25 2b 27 \n' +
		' 42 45 c5 42 47 4h 48 48 \n' +
		' 78 7c 7h 71 78 7h ah b8 \n' +
		' 34 31 32 c7 37 ',
	'move 8h AD→foundation': '',
	'move 57 KS→cascade': '',
	'move 2⡀3 KC-QD-JS→cascade':
		'             QC TD KH 9S \n' +
		' QS KC       TS          \n' +
		' JD QD       KS          \n' +
		' KD JS                   \n' +
		' hand-jammed',
	'move 1⡃5⡆ TD→JS':
		' 9S 2H       AD 2C       \n' +
		' AH 8S 2D QS 4C    2S 3D \n' +
		' 5C AS 9C KH 4D    3C 4S \n' +
		' 3S 5D KC 3H KD    6S 8D \n' +
		' TD 7S JD 7H 8H    JC 7D \n' +
		'    QH 8C 9D KS    4H 6C \n' +
		'       TH 6D QD    QC 5H \n' +
		'       7C TS JS    JH    \n' +
		'       6H          TC    \n' +
		'       5S          9H    \n' +
		' move 13 5S→6H\n' +
		':h shuffle32 5\n' +
		' 53 6a 65 67 85 a8 68 27 \n' +
		' 67 1a 1b 13 ',
	'move 78 JH-TC-9H-8S-7H→QS': '',
	'move 5⡅3⡆ 6H→7C (auto-foundation 2 AD)':
		'                         \n' +
		' AH 8S 2D QS 4C 9H 2S 3D \n' +
		' 5C AS 9C KH 4D 2C 3C 4S \n' +
		' 3S 5D KC 3H KD 5H 6S 8D \n' +
		' TD 7S JD 7H 8H JH JC 7D \n' +
		' 5S QH 8C 9D KS QD 4H AC \n' +
		' 2H TC TH 6D 6H 6C QC JS \n' +
		' 9S AD 7C TS             \n' +
		' deal all cards\n' +
		':h shuffle32 5',
	'move 1⡁4⡎ 2S→3D (auto-foundation 14 AS,2S)':
		'    3H 8D 4D AC 2D AH    \n' +
		' AS JC 9D 9C KD KC KS 5C \n' +
		' 2S JD 8S 4C QS    QH 2H \n' +
		'    6D 7D 3C       JS TD \n' +
		'    6H 6C 7S       TH 9S \n' +
		'    QC 5H QD          2C \n' +
		'    KH    TS          5S \n' +
		'    8H    JH          4H \n' +
		'    7C    TC          3S \n' +
		'          9H             \n' +
		'          8C             \n' +
		'          7H             \n' +
		'          6S             \n' +
		'          5D             \n' +
		'          4S             \n' +
		'          3D             \n' +
		' move 16 KC→cascade\n' +
		':h shuffle32 2107\n' +
		' 64 62 6a 6b 3c 34 14 74 \n' +
		' 34 38 3d 34 18 15 73 71 \n' +
		' 73 57 53 57 54 13 a5 16 ',
	'move 2⡆1 8H-7C→cascade':
		'    3H 8D 4D AC 2D AH 2S \n' +
		'    JC 9D 9C KD KC KS 5C \n' +
		'    JD 8S 4C QS    QH 2H \n' +
		'    6D 7D 3C       JS TD \n' +
		'    6H 6C 7S       TH 9S \n' +
		'    QC 5H QD          2C \n' +
		'    KH    TS          5S \n' +
		'    8H    JH          4H \n' +
		'    7C    TC          3S \n' +
		'          9H             \n' +
		'          8C             \n' +
		'          7H             \n' +
		'          6S             \n' +
		'          5D             \n' +
		'          4S             \n' +
		'          3D             \n' +
		' move 14 2S→3D (auto-foundation 14 AS,2S)\n' +
		':h shuffle32 2107\n' +
		' 64 62 6a 6b 3c 34 14 74 \n' +
		' 34 38 3d 34 18 15 73 71 \n' +
		' 73 57 53 57 54 13 a5 16 \n' +
		' 14 ',
	[FIFTY_TWO_CARD_FLOURISH]:
		' 7H       2C             \n' +
		' KS 6C AC 5H KD 6D KC KH \n' +
		' QD AH AD 4S QC 5S QH QS \n' +
		' JC 3D AS    JH 4H JS JD \n' +
		' TD    8S    TS 3C TH TC \n' +
		' 9C          9D 2H 9S 9H \n' +
		' 8D          8C    8H    \n' +
		' 7S          7D    7C    \n' +
		'             6S    6H    \n' +
		'             5D    5C    \n' +
		'             4C    4D    \n' +
		'             3H    3S    \n' +
		'             2S    2D    \n' +
		' move 3a 7H→cell\n' +
		':h shuffle32 23190\n' +
		' 6d 76 75 d5 7d 75 72 7a \n' +
		' 37 57 27 31 37 17 d3 5d \n' +
		' 57 5c 57 5b 52 a2 c5 b5 \n' +
		' 1c 12 15 17 16 15 d1 c1 \n' +
		' 85 85 45 4d 4c 41 46 45 \n' +
		' d4 c5 25 86 81 8a 48 64 \n' +
		' 6b 61 6c 62 6d a6 c6 86 \n' +
		' b8 48 24 21 3a ',
	'auto-foundation 56 KD,KS': '',
	'flourish 56 KD,KS': '',
	'invalid move 86 7D→9C': '',
	'invalid move 75 6D-5S-4D-3C→7C':
		' TD       TC AH 2S       \n' +
		' QD AC AD 5D 9H JH 4H 6S \n' +
		' 2H 4C QS KD 8C 5C>6D|QH \n' +
		' 3D 8H 3S 2D 3H 8D|5S|JS \n' +
		' JD 4S 2C KC 7C JC|4D|TS \n' +
		' 7S 9D 6H 7D    QC|3C|7H \n' +
		' 9S TH    6C    KS    9C \n' +
		' 8S KH    5H             \n' +
		' move 54 6C-5H→7D\n' +
		' hand-jammed',
	'invalid move hc AC→cell': '',
	'invalid move 1c KC-QD-JC→cell': '',
	'invalid move kb 6H→cell': '',
	'invalid move ah 3C→foundation':
		'' + //
		' 3C          AD AH       \n' +
		' 9C TH                   \n' +
		' hand-jammed',
	'invalid move 1h 9C→foundation':
		'' + //
		' 3C          AD AH       \n' +
		' 9C TH                   \n' +
		' hand-jammed',
	'invalid move ah⡂ 3C→foundation':
		'' + //
		' 3C          AD AH       \n' +
		' 9C TH                   \n' +
		' hand-jammed',
	'invalid move 1⡁h⡂ 9C→foundation':
		'' + //
		' 3C          AD AH       \n' +
		' 9C TH                   \n' +
		' hand-jammed',
	'invalid move 2h TH→AH':
		'' + //
		' 3C          AD AH       \n' +
		' 9C TH                   \n' +
		' hand-jammed',
	'invalid move 13 KC-QD-JC→cascade': '',
	'invalid move k1 KH→cascade': '',
	'invalid move bk 6C→deck':
		' 6H|6C|QC JS 9S AD 7C TS \n' +
		' AH 8S 2D QS 4C 9H 2S 3D \n' +
		' 5C AS 9C KH 4D 2C 3C 4S \n' +
		' 3S 5D KC 3H KD 5H 6S 8D \n' +
		' TD 7S JD 7H 8H JH JC 7D \n' +
		' 5S QH 8C 9D KS QD 4H AC \n' +
		' 2H TC TH 6D             \n' +
		':d>   \n' +
		' invalid move bk 6C→deck',
	'invalid move hk TD→deck':
		' QC QD QH QS TC 9D TH TS \n' +
		' KC       KS JC JD JH JS \n' +
		':d>TD KH KD \n' +
		' invalid move hk TD→deck',
	'invalid move 4k 6D→deck':
		'                         \n' +
		' AH 8S 2D QS 4C 9H 2S 3D \n' +
		' 5C AS 9C KH 4D 2C 3C 4S \n' +
		' 3S 5D KC 3H KD 5H 6S 8D \n' +
		' TD 7S JD 7H 8H JH JC 7D \n' +
		' 5S QH 8C 9D KS QD 4H AC \n' +
		' 2H TC TH                \n' +
		':d>6D 6H 6C QC JS 9S AD 7C TS \n' +
		' invalid move 4k 6D→deck',
	'invalid move 2k TC-9D-8C→deck':
		'             7C 8D TH KS \n' +
		'          KD JH 9C QD KH \n' +
		'          QC       JC KC \n' +
		'          JD       TD QH \n' +
		':d TC 9D>8C \n' +
		' invalid move 2k TC-9D-8C→deck',
};

export function pullActionTextExamples(actionTextExamples: string[], actionText: string) {
	const index = actionTextExamples.findIndex((example) => example === actionText);
	if (index > -1) actionTextExamples.splice(index, 1);
	else throw new Error(`should we add "${actionText}" to ACTION_TEXT_EXAMPLES?`);
}
