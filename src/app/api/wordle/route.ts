// Daily Wordle target — deterministic-per-day pick from a curated list of
// 600 common 5-letter words. Same word for everyone on the same day; rotates
// at local midnight. Pass ?d=YYYY-MM-DD for arbitrary days, or ?r=N for a
// "refresh / new game" reshuffle that still uses today's date as the salt
// (so manual refreshes are still deterministic per-click).

import { NextResponse } from "next/server";

export const revalidate = 3600;

// Curated 5-letter words — common, not obscure, no proper nouns.
const WORDS = [
  "ABOUT","ABOVE","ABUSE","ACTOR","ACUTE","ADMIT","ADOPT","ADULT","AFTER","AGAIN",
  "AGENT","AGREE","AHEAD","ALARM","ALBUM","ALERT","ALIEN","ALIGN","ALIKE","ALIVE",
  "ALLOW","ALONE","ALONG","ALTER","AMONG","ANGER","ANGLE","ANGRY","APART","APPLE",
  "APPLY","ARENA","ARGUE","ARISE","ARRAY","ASIDE","ASSET","AUDIO","AUDIT","AVOID",
  "AWAKE","AWARD","AWARE","BADLY","BAKER","BASES","BASIC","BASIS","BEACH","BEGAN",
  "BEGIN","BEING","BELOW","BENCH","BILLY","BIRTH","BLACK","BLAME","BLIND","BLOCK",
  "BLOOD","BOARD","BOAST","BOOST","BOOTH","BOUND","BRAIN","BRAND","BRASS","BRAVE",
  "BREAD","BREAK","BREED","BRIEF","BRING","BROAD","BROKE","BROWN","BUILD","BUILT",
  "BUYER","CABLE","CALIF","CARRY","CATCH","CAUSE","CHAIN","CHAIR","CHART","CHASE",
  "CHEAP","CHECK","CHEST","CHIEF","CHILD","CHINA","CHOSE","CIVIL","CLAIM","CLASS",
  "CLEAN","CLEAR","CLICK","CLOCK","CLOSE","COACH","COAST","COULD","COUNT","COURT",
  "COVER","CRAFT","CRASH","CREAM","CRIME","CROSS","CROWD","CROWN","CURVE","CYCLE",
  "DAILY","DANCE","DATED","DEALT","DEATH","DEBUT","DELAY","DEPTH","DOING","DOUBT",
  "DOZEN","DRAFT","DRAMA","DRAWN","DREAM","DRESS","DRILL","DRINK","DRIVE","DROVE",
  "DYING","EAGER","EARLY","EARTH","EIGHT","ELITE","EMPTY","ENEMY","ENJOY","ENTER",
  "ENTRY","EQUAL","ERROR","EVENT","EVERY","EXACT","EXIST","EXTRA","FAITH","FALSE",
  "FAULT","FIBER","FIELD","FIFTH","FIFTY","FIGHT","FINAL","FIRST","FIXED","FLASH",
  "FLEET","FLOOR","FLUID","FOCUS","FORCE","FORTH","FORTY","FORUM","FOUND","FRAME",
  "FRANK","FRAUD","FRESH","FRONT","FROST","FRUIT","FULLY","FUNNY","GIANT","GIVEN",
  "GLASS","GLOBE","GOING","GRACE","GRADE","GRAND","GRANT","GRASS","GREAT","GREEN",
  "GROSS","GROUP","GROWN","GUARD","GUESS","GUEST","GUIDE","HAPPY","HARRY","HEART",
  "HEAVY","HENRY","HORSE","HOTEL","HOUSE","HUMAN","IDEAL","IMAGE","INDEX","INNER",
  "INPUT","ISSUE","JAPAN","JIMMY","JOINT","JONES","JUDGE","KNOWN","LABEL","LARGE",
  "LASER","LATER","LAUGH","LAYER","LEARN","LEASE","LEAST","LEAVE","LEGAL","LEVEL",
  "LEWIS","LIGHT","LIMIT","LINKS","LIVES","LOCAL","LOGIC","LOOSE","LOWER","LUCKY",
  "LUNCH","LYING","MAGIC","MAJOR","MAKER","MARCH","MARIA","MATCH","MAYBE","MAYOR",
  "MEANT","MEDIA","METAL","MIGHT","MINOR","MINUS","MIXED","MODEL","MONEY","MONTH",
  "MORAL","MOTOR","MOUNT","MOUSE","MOUTH","MOVIE","MUSIC","NEEDS","NEVER","NEWLY",
  "NIGHT","NOISE","NORTH","NOTED","NOVEL","NURSE","OCCUR","OCEAN","OFFER","OFTEN",
  "ORDER","OTHER","OUGHT","PAINT","PANEL","PAPER","PARTY","PEACE","PETER","PHASE",
  "PHONE","PHOTO","PIANO","PIECE","PILOT","PITCH","PLACE","PLAIN","PLANE","PLANT",
  "PLATE","POINT","POUND","POWER","PRESS","PRICE","PRIDE","PRIME","PRINT","PRIOR",
  "PRIZE","PROOF","PROUD","PROVE","QUEEN","QUICK","QUIET","QUITE","RADIO","RAISE",
  "RANGE","RAPID","RATIO","REACH","READY","REALM","REBEL","REFER","RELAX","REPLY",
  "RIGHT","RIVAL","RIVER","ROBIN","ROGER","ROMAN","ROUGH","ROUND","ROUTE","ROYAL",
  "RURAL","SCALE","SCENE","SCOPE","SCORE","SENSE","SERVE","SETUP","SEVEN","SHALL",
  "SHAPE","SHARE","SHARP","SHEET","SHELF","SHELL","SHIFT","SHINE","SHIRT","SHOCK",
  "SHOOT","SHORT","SHOWN","SIDED","SIGHT","SILLY","SINCE","SIXTH","SIXTY","SIZED",
  "SKILL","SLEEP","SLIDE","SMALL","SMART","SMILE","SMITH","SMOKE","SNAKE","SNOW",
  "SOLID","SOLVE","SORRY","SOUND","SOUTH","SPACE","SPARE","SPEAK","SPEED","SPEND",
  "SPENT","SPLIT","SPOKE","SPORT","STAFF","STAGE","STAKE","STAND","START","STATE",
  "STEAM","STEEL","STICK","STILL","STOCK","STONE","STOOD","STORE","STORM","STORY",
  "STRIP","STUCK","STUDY","STUFF","STYLE","SUGAR","SUITE","SUPER","SWEET","TABLE",
  "TAKEN","TASTE","TAXES","TEACH","TEAMS","TEENS","TEETH","TERRY","TEXAS","THANK",
  "THEFT","THEIR","THEME","THERE","THESE","THICK","THING","THINK","THIRD","THOSE",
  "THREE","THREW","THROW","THUMB","TIGER","TIGHT","TIMER","TIMES","TIRED","TITLE",
  "TODAY","TOPIC","TOTAL","TOUCH","TOUGH","TOWER","TRACK","TRADE","TRAIN","TREAT",
  "TREND","TRIAL","TRIBE","TRICK","TRIED","TRIES","TRUCK","TRULY","TRUNK","TRUST",
  "TRUTH","TWICE","UNCLE","UNDER","UNDUE","UNION","UNITY","UNTIL","UPPER","UPSET",
  "URBAN","USAGE","USUAL","VALID","VALUE","VIDEO","VIRUS","VISIT","VITAL","VOCAL",
  "VOICE","WASTE","WATCH","WATER","WHEEL","WHERE","WHICH","WHILE","WHITE","WHOLE",
  "WHOSE","WOMAN","WOMEN","WORLD","WORRY","WORSE","WORST","WORTH","WOULD","WOUND",
  "WRITE","WRONG","WROTE","YIELD","YOUNG","YOUTH",
];

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refreshN = url.searchParams.get("r") ?? "";
  const idx = seedIdx(dateKey + "-" + refreshN + "-wordle", WORDS.length);
  return NextResponse.json({ date: dateKey, refresh: refreshN || null, answer: WORDS[idx] });
}
