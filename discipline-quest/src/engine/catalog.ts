import type { Equipped, ItemId, Space } from "./types";

export type Category =
  | "fixture"
  | "furniture"
  | "fitness"
  | "faith"
  | "plants"
  | "floorrug"
  | "wall"
  | "wallpaper"
  | "floor"
  | "rug"
  | "outfit"
  | "room"
  | "pet"
  | "gym"
  | "gymroom"
  | "car";

/** Categories where you own several but equip exactly one. */
export const EQUIP_SLOT: Partial<Record<Category, keyof Equipped>> = {
  outfit: "outfit",
  wallpaper: "wallpaper",
  floor: "floor",
  rug: "rug",
  room: "room",
  car: "car",
  gymroom: "gym",
};

export type RoomTier = "studio" | "apartment" | "penthouse" | "loft" | "villa";
export const TIER_ORDER: RoomTier[] = ["studio", "apartment", "penthouse", "loft", "villa"];
export const ROOM_SIZE: Record<RoomTier, number> = { studio: 8, apartment: 10, penthouse: 12, loft: 14, villa: 16 };

/** Gym room tiers, in order. The first one unlocks with your first full gym week. */
export const GYM_TIERS = ["gym-garage", "gym-home", "gym-pro"] as const;
export type GymTier = (typeof GYM_TIERS)[number];
export const GYM_SIZE: Record<GymTier, number> = { "gym-garage": 8, "gym-home": 10, "gym-pro": 12 };
export const isGymTier = (id: string): id is GymTier => (GYM_TIERS as readonly string[]).includes(id);

export interface CatalogItem {
  id: ItemId;
  name: string;
  category: Category;
  /** null = can't be bought (starter or milestone). */
  price: number | null;
  level: number;
  blurb: string;
  /** Minimum room size needed to place it. */
  tier?: RoomTier;
  /** Owned from the start. */
  starter?: boolean;
  /** Floor footprint in tiles (w along X, d along Y) for placeable things. */
  size?: [number, number];
  /** Flat on the floor: people can stand on it. */
  flat?: boolean;
  /** Wall decor: width along the wall in world units (a tile is 16). */
  wallWidth?: number;
  /** Only goes in this room (gym equipment and gym posters). */
  space?: Space;
  /** Lifetime gym visits needed before you can buy it. */
  gymVisits?: number;
  /** Minimum gym room tier needed to place it. */
  gymTier?: GymTier;
  /** Small things can stand on top of furniture with a surface (height of its top in world units). */
  surface?: number;
  small?: boolean;
}

/** Everything bought got cheaper when the catalog tripled, so ~everything still unlocks in about 4 months. */
const PRICE_SCALE = 0.45;
const price = (p: number) => Math.max(20, Math.round((p * PRICE_SCALE) / 10) * 10);

const I = (
  id: string, name: string, category: Category, cost: number | null, level: number, blurb: string,
  extra: Partial<CatalogItem> = {},
): CatalogItem => ({ id, name, category, price: cost === null ? null : price(cost), level, blurb, ...extra });

const S = (w: number, d: number, extra: Partial<CatalogItem> = {}): Partial<CatalogItem> => ({ size: [w, d], ...extra });
const W = (width: number, extra: Partial<CatalogItem> = {}): Partial<CatalogItem> => ({ wallWidth: width, ...extra });

export const CATALOG: CatalogItem[] = [
  // Fixtures you start with (movable, not sold)
  I("bed", "Bed", "fixture", null, 1, "Where 08:30 starts.", { starter: true, size: [3, 2] }),
  I("kitchen", "Kitchen", "fixture", null, 1, "Fridge, sink and stove.", { starter: true, size: [3, 1] }),
  I("prayerrug", "Prayer Rug", "fixture", null, 1, "Your spot for salah.", { starter: true, size: [1, 2], flat: true }),

  // Living
  I("lamp", "Floor Lamp", "furniture", 60, 1, "Warm light. Tap to switch.", S(1, 1)),
  I("fan", "Standing Fan", "furniture", 80, 2, "Spins. That's it. That's the fan.", S(1, 1)),
  I("coffee", "Coffee Machine", "furniture", 90, 2, "Fuel for the 08:30 alarm. Fits on a counter.", S(1, 1, { small: true })),
  I("coffeetable", "Coffee Table", "furniture", 140, 3, "Put small things on it.", S(1, 1, { surface: 9 })),
  I("bookshelf", "Bookshelf", "furniture", 150, 3, "Grab a book and read on the sofa.", S(1, 1)),
  I("globe", "Globe", "furniture", 120, 4, "Spin it, pick a country, never go.", S(1, 1, { small: true })),
  I("armchair", "Leather Armchair", "furniture", 220, 4, "Cognac leather. Smells expensive.", S(1, 1)),
  I("sofa", "Sofa", "furniture", 250, 4, "Sit, read, watch.", S(1, 2)),
  I("recordplayer", "Record Player", "furniture", 200, 4, "Vinyl and two speakers.", S(1, 1, { small: true })),
  I("tv", "Smart TV", "furniture", 300, 5, "Thin 65-inch on a low console.", S(1, 2)),
  I("wardrobe", "Wardrobe", "furniture", 320, 5, "Where the hoodies live.", S(2, 1)),
  I("aquarium", "Aquarium", "furniture", 350, 6, "Calm fish, calm mind.", S(1, 1)),
  I("sideboard", "Sideboard", "furniture", 260, 6, "Walnut. Put things on top.", S(2, 1, { surface: 17 })),
  I("majlis", "Majlis Cushions", "furniture", 300, 6, "Floor seating for when the cousins come.", S(2, 1)),
  I("dresser", "Dresser + Mirror", "furniture", 280, 7, "Check the hair before Jumu'ah.", S(2, 1, { surface: 18 })),
  I("console", "Game Console", "furniture", 350, 7, "Put it on the desk. One match. Okay two.", S(1, 1, { small: true })),
  I("clarinet", "Clarinet Stand", "furniture", 300, 7, "Your clarinet. Tap to play.", S(1, 1)),
  I("dining", "Dining Table", "furniture", 450, 8, "Table for four.", S(2, 2, { tier: "apartment" })),
  I("arcade", "Arcade Cabinet", "furniture", 600, 9, "High score: your streak.", S(1, 1)),
  I("desk", "Desk + Gaming PC", "furniture", 500, 9, "RGB included. Room for a console.", S(2, 1, { tier: "apartment", surface: 19 })),
  I("chair", "Leather Desk Chair", "furniture", 250, 10, "Beige leather, tufted, very CEO.", S(1, 1, { tier: "apartment" })),
  I("island", "Kitchen Island", "furniture", 500, 10, "Marble top, two bar stools.", S(2, 1, { tier: "apartment", surface: 20 })),
  I("telescope", "Telescope", "furniture", 380, 10, "Tap to look at the moon.", S(1, 1)),
  I("fireplace", "Electric Fireplace", "furniture", 600, 11, "Fake fire, real cozy.", S(2, 1)),
  I("vending", "Vending Machine", "furniture", 800, 13, "Tap for a drink. Free, because it's yours.", S(1, 1)),
  I("pingpong", "Ping-Pong Table", "furniture", 900, 15, "Needs a big room.", S(3, 2, { tier: "loft" })),
  I("pooltable", "Pool Table", "furniture", 1400, 17, "Tap to break.", S(3, 2, { tier: "loft" })),
  I("hottub", "Hot Tub", "furniture", 2200, 21, "Earned it.", S(2, 2, { tier: "villa" })),

  // Fitness (home or gym)
  I("yogamat", "Yoga Mat", "fitness", 90, 3, "Tap to stretch.", S(1, 2, { flat: true })),
  I("gymbench", "Weight Bench", "fitness", 450, 11, "Barbell and plates.", S(1, 2, { tier: "apartment" })),
  I("bike", "Road Bike Trainer", "fitness", 650, 12, "Tap to ride nowhere, fast.", S(2, 1)),
  I("treadmill", "Treadmill", "fitness", 700, 12, "Cardio while the city sleeps.", S(1, 2, { tier: "apartment" })),

  // Plants
  I("cactus", "Cactus", "plants", 50, 2, "Hard to kill. Like your streak.", S(1, 1, { small: true })),
  I("plant", "Fern", "plants", 40, 1, "Something alive in here. Fits on a shelf.", S(1, 1, { small: true })),
  I("snakeplant", "Snake Plant", "plants", 70, 2, "Tall, striped, unkillable.", S(1, 1)),
  I("bonsai", "Bonsai", "plants", 100, 3, "Patience, in a pot. Fits on a desk.", S(1, 1, { small: true })),
  I("monstera", "Big Monstera", "plants", 120, 3, "Grows like your streak.", S(1, 1)),
  I("olivetree", "Olive Tree", "plants", 260, 9, "Mediterranean energy.", S(1, 1)),

  // Faith corner
  I("rehal", "Quran Stand", "faith", 60, 1, "A carved rehal with an open mushaf.", S(1, 1)),
  I("tasbih", "Tasbih Dish", "faith", 60, 2, "Prayer beads in a little brass dish. Fits on a table.", S(1, 1, { small: true })),
  I("quranshelf", "Quran Shelf", "faith", 160, 4, "A wooden wall shelf with the mushaf and tafsir.", W(22)),
  I("mihrab", "Mihrab Panel", "faith", 300, 6, "An arch for your prayer corner.", W(26)),
  I("ayatkursi", "Ayat al-Kursi Frame", "faith", 260, 8, "Gold thuluth on deep green.", W(30)),

  // Floor rugs (not for prayer)
  I("kilim", "Kilim Rug", "floorrug", 250, 5, "Anatolian pattern.", S(2, 2, { flat: true })),
  I("persian", "Persian Rug", "floorrug", 400, 8, "Big, red, classic.", S(3, 2, { flat: true })),

  // Pets
  I("cat", "Cat", "pet", 500, 7, "Follows you around. Judges your screen time."),
  I("budgie", "Budgie (Muhabbet Kuşu)", "pet", 250, 4, "Tap the cage and it flies around.", S(1, 1, { small: true })),
  I("hamster", "Hamster Cage", "pet", 200, 5, "Tap to make him run.", S(1, 1, { small: true })),
  I("turtle", "Turtle Tank", "pet", 450, 9, "Slow and steady. Looks good on a sideboard.", S(2, 1, { small: true })),
  I("snake", "Snake Terrarium", "pet", 600, 11, "Corn snake. Harmless. Mostly.", S(2, 1, { small: true })),

  // Wall decor
  I("clock", "Wall Clock", "wall", 50, 1, "Time is the one thing you can't buy back.", W(14)),
  I("nozero", "\"No Zero Days\" Poster", "wall", 80, 2, "Do one thing. Every day.", W(18)),
  I("nazar", "Nazar Boncuğu", "wall", 60, 2, "Keeps the evil eye off the streak.", W(12)),
  I("calligraphy", "Bismillah Frame", "wall", 150, 3, "Start everything with it.", W(28)),
  I("corkboard", "Corkboard", "wall", 120, 3, "Notes, plans, a receipt you'll never need.", W(24)),
  I("mirror", "Wall Mirror", "wall", 150, 4, "Looking good. Gym's working.", W(14)),
  I("dartboard", "Dartboard", "wall", 140, 4, "Triple twenty, eventually.", W(14)),
  I("madinah", "Masjid an-Nabawi Poster", "wall", 180, 5, "The green dome.", W(22)),
  I("istanbul", "Istanbul Skyline Print", "wall", 200, 5, "Galata at sunset.", W(30)),
  I("bluemosque", "Blue Mosque Print", "wall", 200, 6, "Six minarets.", W(24)),
  I("plantshelf", "Wall Plant Shelf", "wall", 180, 6, "Hanging pothos.", W(24)),
  I("worldmap", "World Map", "wall", 250, 7, "Pins for where you'll drive the Ioniq.", W(36)),
  I("shelf", "Trophy Shelf", "wall", 300, 8, "Little trophies for big streaks.", W(14)),
  I("guitar", "Wall Guitar", "wall", 220, 8, "Decorative. For now.", W(12)),
  I("ioniqposter", "Ioniq 5 Poster", "wall", 150, 9, "Manifesting.", W(26)),
  I("vinylwall", "Vinyl Record Wall", "wall", 300, 10, "Six records, zero dust.", W(30)),
  I("neon", "Neon Sign", "wall", 500, 12, "DISCIPLINE, in pink neon.", W(26, { tier: "apartment" })),
  I("walltv", "Wall TV", "wall", 600, 13, "Floating 75-inch.", W(40, { tier: "apartment" })),
  I("curtains", "Curtains", "wall", 160, 4, "On every window. Automatic."),
  I("ledstrip", "LED Strip", "wall", 350, 10, "Purple glow along the ceiling at night. Automatic."),

  // Gym room tiers
  I("gym-garage", "Garage Gym", "gymroom", null, 1, "8×8. Unlocks with your first full gym week."),
  I("gym-home", "Home Gym", "gymroom", 1500, 8, "10×10 on rubber floors.", { gymVisits: 20 }),
  I("gym-pro", "Pro Gym", "gymroom", 4000, 14, "12×12 with a mirror wall and spotlights.", { gymVisits: 60 }),

  // Gym equipment: coins plus gym visits
  I("foamroller", "Foam Roller", "gym", 80, 1, "Hurts so good.", S(1, 1, { space: "gym", gymVisits: 1 })),
  I("kettlebells", "Kettlebells", "gym", 150, 2, "Three bells, 8 to 24 kg.", S(1, 1, { space: "gym", gymVisits: 2 })),
  I("chalkbowl", "Chalk Bowl", "gym", 100, 3, "Serious lifters only.", S(1, 1, { space: "gym", gymVisits: 3 })),
  I("dumbbellrack", "Dumbbell Rack", "gym", 400, 4, "Pairs from 5 to 30 kg. Tap for curls.", S(2, 1, { space: "gym", gymVisits: 4 })),
  I("squatrack", "Squat Rack", "gym", 600, 5, "Tap to squat. Depth is not optional.", S(1, 2, { space: "gym", gymVisits: 6 })),
  I("platetree", "Plate Tree", "gym", 200, 5, "Bumper plates, colour-coded.", S(1, 1, { space: "gym", gymVisits: 8 })),
  I("watercooler", "Water Cooler", "gym", 300, 6, "Hydrate. Tap for a cup.", S(1, 1, { space: "gym", gymVisits: 8 })),
  I("punchbag", "Punching Bag", "gym", 400, 7, "On a heavy stand. Tap to punch out the urge.", S(1, 1, { space: "gym", gymVisits: 10 })),
  I("speaker", "Gym Speaker", "gym", 350, 7, "Tap for the hype playlist.", S(1, 1, { space: "gym", gymVisits: 10 })),
  I("battleropes", "Battle Ropes", "gym", 500, 8, "Tap for thirty seconds of regret.", S(1, 2, { space: "gym", gymVisits: 12 })),
  I("rower", "Rowing Machine", "gym", 900, 9, "Tap to row.", S(2, 1, { space: "gym", gymVisits: 15 })),
  I("legpress", "Leg Press", "gym", 1500, 12, "Never skip.", S(1, 2, { space: "gym", gymVisits: 30, gymTier: "gym-home" })),
  I("powerrack", "Power Rack", "gym", 1600, 12, "Full cage, bar and plates.", S(2, 2, { space: "gym", gymVisits: 30, gymTier: "gym-home" })),
  I("cable", "Cable Machine", "gym", 1800, 14, "Tap for rows.", S(2, 1, { space: "gym", gymVisits: 40, gymTier: "gym-home" })),
  I("p-lightweight", "\"Light Weight, Baby!\" Poster", "gym", 120, 2, "Yeah buddy.", W(20, { space: "gym", gymVisits: 2 })),
  I("p-anatomy", "Muscle Chart", "gym", 160, 5, "So you know what's sore.", W(20, { space: "gym", gymVisits: 6 })),
  I("p-silhouette", "Champion Poster", "gym", 200, 7, "A bodybuilder silhouette at golden hour.", W(22, { space: "gym", gymVisits: 12 })),
  I("p-nopain", "\"Stay Hard\" Neon", "gym", 450, 11, "Red neon for the last rep.", W(28, { space: "gym", gymVisits: 25 })),
  I("gymmirror", "Mirror Wall", "gym", 600, 10, "Check form. Mostly check the pump.", W(48, { space: "gym", gymVisits: 25 })),

  // Wallpapers
  I("wp-sky", "Sky Blue Walls", "wallpaper", null, 1, "The original.", { starter: true }),
  I("wp-sand", "Desert Sand", "wallpaper", 80, 2, "Warm and calm."),
  I("wp-sage", "Sage Green", "wallpaper", 120, 3, "Fresh, like a clean start."),
  I("wp-navy", "Midnight Navy", "wallpaper", 180, 4, "Moody. Great at night."),
  I("wp-brick", "Brick Loft", "wallpaper", 350, 8, "Exposed brick, New York style."),
  I("wp-wood", "Wood Panels", "wallpaper", 450, 10, "Walnut slats."),
  I("wp-zellige", "Zellige Tiles", "wallpaper", 700, 15, "Moroccan star pattern."),

  // Floors
  I("fl-tile", "Beige Tiles", "floor", null, 1, "The original.", { starter: true }),
  I("fl-carpet", "Grey Carpet", "floor", 100, 2, "Quiet footsteps."),
  I("fl-oak", "Oak Planks", "floor", 150, 3, "Warm wood floor."),
  I("fl-checker", "Checkerboard", "floor", 300, 7, "Diner vibes."),
  I("fl-marble", "White Marble", "floor", 600, 14, "Cold, clean, expensive."),

  // Prayer rug designs
  I("rug-green", "Green Prayer Rug", "rug", null, 1, "The original.", { starter: true }),
  I("rug-red", "Crimson Rug", "rug", 120, 3, "Classic Turkish red."),
  I("rug-blue", "Iznik Blue Rug", "rug", 250, 6, "Blue like Iznik tiles."),
  I("rug-gold", "Royal Gold Rug", "rug", 600, 16, "Fit for a sultan."),

  // Outfits
  I("fit-coat", "Charcoal Coat", "outfit", null, 1, "Black zip-up and the wool coat.", { starter: true }),
  I("fit-hoodie", "Grey Hoodie", "outfit", 120, 2, "Jeans and white sneakers."),
  I("fit-gym", "Gym Fit", "outfit", 150, 3, "Black tee and shorts. Shows your progress."),
  I("fit-thobe", "White Thobe", "outfit", 250, 5, "With a kufi. Jumu'ah ready."),
  I("fit-leather", "Leather Jacket", "outfit", 450, 9, "White tee, dark denim."),
  I("fit-suit", "Navy Suit", "outfit", 800, 17, "For when you've made it."),

  // Room tiers
  I("room-studio", "Studio", "room", null, 1, "8×8. Where it starts.", { starter: true }),
  I("room-apartment", "Apartment", "room", 1200, 8, "10×10 with a second window."),
  I("room-penthouse", "Penthouse", "room", 3000, 13, "12×12 with a city skyline."),
  I("room-loft", "Loft", "room", 5000, 17, "14×14, high ceilings, huge windows."),
  I("room-villa", "Villa", "room", 8000, 22, "16×16 with a balcony door."),

  // Cars (your real ones, in order)
  I("car-mini", "2016 Mini Cooper", "car", null, 1, "Your first car. Cream with black bonnet stripes.", { starter: true }),
  I("car-q50", "2016 Infiniti Q50", "car", null, 1, "Hagane Blue with a black roof. Unlocks at 30 clean days."),
  I("car-ioniq5", "2027 Hyundai Ioniq 5", "car", null, 1, "Atlas White. Unlocks at 90 clean days."),
];

export const ITEMS: Record<ItemId, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

export const STARTERS: ItemId[] = CATALOG.filter((c) => c.starter).map((c) => c.id);

/** Things that go on the floor and can be moved in decorate mode. */
export const isPlaceable = (id: ItemId) => !!ITEMS[id]?.size;
/** Wall decor you can slide along the walls (curtains and the LED strip place themselves). */
export const isWallItem = (id: ItemId) => !!ITEMS[id]?.wallWidth;

export const DEFAULT_EQUIPPED: Equipped = {
  outfit: "fit-coat",
  wallpaper: "wp-sky",
  floor: "fl-tile",
  rug: "rug-green",
  room: "room-studio",
  car: "car-mini",
  gym: "",
};

export function tierOf(roomId: ItemId): RoomTier {
  const t = roomId.replace("room-", "") as RoomTier;
  return TIER_ORDER.includes(t) ? t : "studio";
}

/** Cars unlock by clean days, in the order you owned them. */
export const CAR_UNLOCKS: { id: ItemId; cleanDays: number }[] = [
  { id: "car-q50", cleanDays: 30 },
  { id: "car-ioniq5", cleanDays: 90 },
];

export const CAR_ORDER: ItemId[] = ["car-mini", "car-q50", "car-ioniq5"];

/** Items that no longer exist, with the coins refunded if you owned them. */
export const REMOVED_REFUNDS: Record<string, number> = {
  beanbag: 70,
  mabkhara: 80,
  tasbihshelf: 120,
  dumbbells: 140,
  "paint-teal": 500,
  pony: 150,
  trophycase: 1200,
  massage: 410,
  fountain: 720,
  pullup: 140,
  lantern: 50,
};
