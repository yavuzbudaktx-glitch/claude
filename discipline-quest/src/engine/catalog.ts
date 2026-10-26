import type { Equipped, ItemId } from "./types";

export type Category =
  | "fixture"
  | "furniture"
  | "faith"
  | "wall"
  | "wallpaper"
  | "floor"
  | "rug"
  | "outfit"
  | "room"
  | "pet"
  | "car";

/** Categories where you own several but equip exactly one. */
export const EQUIP_SLOT: Partial<Record<Category, keyof Equipped>> = {
  outfit: "outfit",
  wallpaper: "wallpaper",
  floor: "floor",
  rug: "rug",
  room: "room",
  car: "car",
};

export type RoomTier = "studio" | "apartment" | "penthouse";
export const TIER_ORDER: RoomTier[] = ["studio", "apartment", "penthouse"];

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
}

const I = (
  id: string, name: string, category: Category, price: number | null, level: number, blurb: string,
  extra: Partial<CatalogItem> = {},
): CatalogItem => ({ id, name, category, price, level, blurb, ...extra });

const S = (w: number, d: number): Partial<CatalogItem> => ({ size: [w, d] });

export const CATALOG: CatalogItem[] = [
  // Fixtures you start with (movable, not sold)
  I("bed", "Bed", "fixture", null, 1, "Where 08:30 starts.", { starter: true, size: [3, 2] }),
  I("kitchen", "Kitchen", "fixture", null, 1, "Fridge, sink and stove.", { starter: true, size: [3, 1] }),
  I("prayerrug", "Prayer Rug", "fixture", null, 1, "Your spot for salah.", { starter: true, size: [1, 2], flat: true }),

  // Furniture
  I("plant", "Potted Plant", "furniture", 40, 1, "Something alive in here.", S(1, 1)),
  I("lamp", "Floor Lamp", "furniture", 60, 1, "Warm light for late Isha. Tap to switch.", S(1, 1)),
  I("coffee", "Coffee Station", "furniture", 90, 2, "Fuel for the 08:30 alarm.", S(1, 1)),
  I("bookshelf", "Bookshelf", "furniture", 150, 3, "Grab a book and read on the sofa.", S(1, 1)),
  I("monstera", "Big Monstera", "furniture", 120, 3, "Grows like your streak.", S(1, 1)),
  I("sofa", "Sofa", "furniture", 250, 4, "Sit, read, watch.", S(1, 2)),
  I("recordplayer", "Record Player", "furniture", 200, 4, "Vinyl and two speakers.", S(1, 1)),
  I("tv", "Smart TV", "furniture", 300, 5, "Thin 65-inch on a low console.", S(1, 2)),
  I("aquarium", "Aquarium", "furniture", 350, 6, "Calm fish, calm mind.", S(1, 1)),
  I("clarinet", "Clarinet Stand", "furniture", 300, 7, "Your clarinet. Tap to play.", S(1, 1)),
  I("arcade", "Arcade Cabinet", "furniture", 600, 9, "High score: your streak.", S(1, 1)),
  I("desk", "Desk + Gaming PC", "furniture", 500, 9, "RGB included.", { size: [2, 1], tier: "apartment" }),
  I("chair", "Gaming Chair", "furniture", 250, 10, "Put it at the desk.", { size: [1, 1], tier: "apartment" }),
  I("gymbench", "Weight Bench", "furniture", 450, 11, "Barbell and plates.", { size: [1, 2], tier: "apartment" }),
  I("treadmill", "Treadmill", "furniture", 700, 12, "Cardio while the city sleeps.", { size: [1, 2], tier: "apartment" }),
  I("trophycase", "Trophy Case", "furniture", 1200, 18, "For a man with this many badges.", { size: [1, 1], tier: "penthouse" }),

  // Faith corner
  I("rehal", "Quran Stand", "faith", 60, 1, "A rehal with a mushaf.", S(1, 1)),
  I("lantern", "Ramadan Lantern", "faith", 120, 2, "A fanous that glows at night.", S(1, 1)),

  // Wall decor
  I("clock", "Wall Clock", "wall", 50, 1, "Time is the one thing you can't buy back."),
  I("calligraphy", "Bismillah Frame", "wall", 150, 3, "Start everything with it."),
  I("madinah", "Masjid an-Nabawi Poster", "wall", 180, 5, "The green dome."),
  I("shelf", "Trophy Shelf", "wall", 300, 8, "Little trophies for big streaks."),
  I("neon", "Neon Sign", "wall", 500, 12, "DISCIPLINE, in pink neon.", { tier: "apartment" }),

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
  I("room-penthouse", "Penthouse", "room", 3000, 14, "12×12 with a city skyline."),

  // Pet
  I("cat", "Cat", "pet", 500, 7, "Follows you around. Judges your screen time."),

  // Cars (your real ones, in order)
  I("car-mini", "2016 Mini Cooper", "car", null, 1, "Your first car. Cream with black bonnet stripes.", { starter: true }),
  I("car-q50", "2016 Infiniti Q50", "car", null, 1, "Hagane Blue with a black roof. Unlocks at 30 clean days."),
  I("car-ioniq5", "2027 Hyundai Ioniq 5", "car", null, 1, "Atlas White. Unlocks at 90 clean days."),
];

export const ITEMS: Record<ItemId, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

export const STARTERS: ItemId[] = CATALOG.filter((c) => c.starter).map((c) => c.id);

/** Things that go on the floor and can be moved in decorate mode. */
export const isPlaceable = (id: ItemId) => !!ITEMS[id]?.size;

export const DEFAULT_EQUIPPED: Equipped = {
  outfit: "fit-coat",
  wallpaper: "wp-sky",
  floor: "fl-tile",
  rug: "rug-green",
  room: "room-studio",
  car: "car-mini",
};

export function tierOf(roomId: ItemId): RoomTier {
  return (roomId.replace("room-", "") as RoomTier) ?? "studio";
}

export const ROOM_SIZE: Record<RoomTier, number> = { studio: 8, apartment: 10, penthouse: 12 };

/** Cars unlock by clean days, in the order you owned them. */
export const CAR_UNLOCKS: { id: ItemId; cleanDays: number }[] = [
  { id: "car-q50", cleanDays: 30 },
  { id: "car-ioniq5", cleanDays: 90 },
];

/** v2 items that no longer exist, with the coins refunded if you owned them. */
export const REMOVED_REFUNDS: Record<string, number> = {
  beanbag: 70,
  mabkhara: 80,
  tasbihshelf: 120,
  dumbbells: 140,
  "paint-teal": 500,
  pony: 150,
};
