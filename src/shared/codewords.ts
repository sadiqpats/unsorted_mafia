/**
 * Room codes and rejoin codes are short everyday words (CUP, RAT, LAMP) so they are easy to say across a room.
 * Rules for this list: 3 or 4 letters, easy to spell, no word sounds like another (no SEA/SEE, BEAR/BARE),
 * and no word is the start of another (no CAR + CARD), so a code is complete the moment it matches.
 */
export const CODE_WORDS: readonly string[] = `
CUP RAT CAT DOG COW PIG OWL FOX BAT YAK HEN EMU APE BUS CAR VAN JET BOX KEY PEN MAP HAT CAP BAG BED FAN JAR MUG
POT PAN LOG NUT EGG JAM BUN PEA YAM OAK ICE SKY WEB ZIP GUM TOY RUG MOP TUB LID DOT ARM LEG LIP GEM ZOO GYM SPA
FIG PIE AXE ANT
KIWI LIME PLUM DATE CORN RICE MILK CAKE TACO SOUP TOFU MINT CHAI LAMP BELL BOAT SHIP KITE BALL BOOK DESK SOFA DOOR
RING SOCK SHOE VASE FORK BOWL DISH ROPE NAIL COIN GOLD SALT LION WOLF FROG DUCK SWAN CRAB FISH SEAL GOAT MULE LAMB
MOTH WORM TOAD MOLE PUMA YETI DOVE CROW HAWK KING MOON STAR RAIN SNOW WIND LEAF TREE LILY FERN MOSS HILL LAKE POND
SAND ROCK CAVE FIRE GIFT DICE GAME JOKE SONG HORN FLAG TENT FARM BARN NEST WAVE SURF FOAM TAXI BIKE TRAM MASK BOOT
BELT GLUE TAPE CLIP PIPE SOAP COMB DRUM HARP BEAN LEEK KALE TART DOSA NAAN ROTI IDLI PAAN ALOO
SILK WOOL JADE RUBY OPAL ONYX ZINC TINY BLUE PINK GREY JUNE JULY OVAL CUBE LOOP KNOB SLED SKIS POLO GOLF
TUNA CLAM WASP SLUG CALF COLT FAWN PONY KOI ORCA MINK
PALM VINE ROOT SEED CONE BARK REEF DUNE MIST HAIL GLOW ECHO
`
  .trim()
  .split(/\s+/)
  .filter((w) => /^[A-Z]{3,4}$/.test(w));

const WORD_SET = new Set(CODE_WORDS);

/** Letters and digits only, upper case: "  cup " and "c-u-p" both become "CUP". */
export const normalizeCode = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** True when the text is a whole word from the list (so the join box can look it up straight away). */
export const isCodeWord = (s: string) => WORD_SET.has(normalizeCode(s));
