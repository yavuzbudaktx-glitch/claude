import type { Equipped, ItemId } from "./types";

export type Category =
  | "furniture"
  | "faith"
  | "wall"
  | "wallpaper"
  | "floor"
  | "rug"
  | "outfit"
  | "room"
  | "pet"
  | "paint"
  | "milestone";

/** Categories where you own several but equip exactly one. */
export const EQUIP_SLOT: Partial<Record<Category, keyof Equipped>> = {
  outfit: "outfit",
  wallpaper: "wallpaper",
  floor: "floor",
  rug: "rug",
  room: "room",
  paint: "paint",
};

export type RoomTier = "studio" | "apartment" | "penthouse";
export const TIER_ORDER: RoomTier[] = ["studio", "apartment", "penthouse"];

export interface CatalogItem {
  id: ItemId;
  name: string;
  category: Category;
  /** null = can't be bought (default or milestone). */
  price: number | null;
  level: number;
  blurb: string;
  /** Minimum room size needed to place it. */
  tier?: RoomTier;
  /** Owned from the start. */
  starter?: boolean;
  /** Needs this item first (e.g. car paint needs the car). */
  requires?: ItemId;
}

const I = (
  id: string,
  name: string,
  category: Category,
  price: number | null,
  level: number,
  blurb: string,
  extra: Partial<CatalogItem> = {},
): CatalogItem => ({ id, name, category, price, level, blurb, ...extra });

export const CATALOG: CatalogItem[] = [
  // Furniture
  I("plant", "Potted Plant", "furniture", 40, 1, "Something alive in here."),
  I("lamp", "Floor Lamp", "furniture", 60, 1, "Warm light for late Isha. Glows at night."),
  I("coffee", "Coffee Station", "furniture", 90, 2, "Fuel for the 08:30 alarm."),
  I("bookshelf", "Bookshelf", "furniture", 120, 2, "Read more, scroll less."),
  I("tv", "Retro TV", "furniture", 150, 2, "Earned screen time."),
  I("beanbag", "Beanbag", "furniture", 70, 2, "A soft place to sit and reflect."),
  I("dumbbells", "Dumbbell Rack", "furniture", 140, 3, "Diet is half. Lift is the other half."),
  I("sofa", "Sofa", "furniture", 200, 3, "Rest is part of discipline."),
  I("monstera", "Big Monstera", "furniture", 110, 3, "Grows like your streak."),
  I("aquarium", "Aquarium", "furniture", 250, 4, "Calm fish, calm mind."),
  I("desk", "Desk + PC", "furniture", 350, 5, "Build things instead of scrolling.", { tier: "apartment" }),
  I("chair", "Gaming Chair", "furniture", 180, 5, "For the desk. Posture matters.", { tier: "apartment" }),
  I("arcade", "Arcade Cabinet", "furniture", 400, 6, "High score: your streak."),
  I("treadmill", "Treadmill", "furniture", 450, 7, "Cardio while the city sleeps.", { tier: "apartment" }),
  I("piano", "Piano", "furniture", 700, 9, "A penthouse deserves one.", { tier: "penthouse" }),
  I("trophycase", "Trophy Case", "furniture", 900, 11, "For a man with this many badges.", { tier: "penthouse" }),

  // Faith corner
  I("rehal", "Quran Stand", "faith", 60, 1, "A rehal with a mushaf, next to your rug."),
  I("lantern", "Ramadan Lantern", "faith", 90, 2, "A fanous that glows at night."),
  I("mabkhara", "Incense Burner", "faith", 80, 3, "Bakhoor before Jumu'ah."),
  I("tasbihshelf", "Tasbih Shelf", "faith", 120, 4, "Prayer beads and a little oud bottle."),

  // Wall decor
  I("clock", "Wall Clock", "wall", 50, 1, "Time is the one thing you can't buy back."),
  I("calligraphy", "Bismillah Frame", "wall", 100, 3, "Start everything with it."),
  I("madinah", "Masjid an-Nabawi Poster", "wall", 120, 4, "The green dome."),
  I("shelf", "Trophy Shelf", "wall", 200, 6, "Little trophies for big streaks."),
  I("neon", "Neon Sign", "wall", 300, 8, "DISCIPLINE, in pink neon.", { tier: "apartment" }),

  // Wallpapers
  I("wp-sky", "Sky Blue Walls", "wallpaper", null, 1, "The original.", { starter: true }),
  I("wp-sand", "Desert Sand", "wallpaper", 60, 1, "Warm and calm."),
  I("wp-sage", "Sage Green", "wallpaper", 80, 2, "Fresh, like a clean start."),
  I("wp-navy", "Midnight Navy", "wallpaper", 120, 3, "Moody. Great at night."),
  I("wp-brick", "Brick Loft", "wallpaper", 200, 5, "Exposed brick, New York style."),
  I("wp-wood", "Wood Panels", "wallpaper", 250, 6, "Walnut slats."),
  I("wp-zellige", "Zellige Tiles", "wallpaper", 350, 8, "Moroccan star pattern."),

  // Floors
  I("fl-tile", "Beige Tiles", "floor", null, 1, "The original.", { starter: true }),
  I("fl-carpet", "Grey Carpet", "floor", 80, 2, "Quiet footsteps."),
  I("fl-oak", "Oak Planks", "floor", 100, 2, "Warm wood floor."),
  I("fl-checker", "Checkerboard", "floor", 150, 4, "Diner vibes."),
  I("fl-marble", "White Marble", "floor", 250, 5, "Cold, clean, expensive."),

  // Prayer rugs
  I("rug-green", "Green Prayer Rug", "rug", null, 1, "The original.", { starter: true }),
  I("rug-red", "Crimson Rug", "rug", 80, 2, "Classic Turkish red."),
  I("rug-blue", "Iznik Blue Rug", "rug", 120, 4, "Blue like Iznik tiles."),
  I("rug-gold", "Royal Gold Rug", "rug", 300, 8, "Fit for a sultan."),

  // Outfits
  I("fit-coat", "Charcoal Coat", "outfit", null, 1, "Black zip-up and the wool coat.", { starter: true }),
  I("fit-hoodie", "Grey Hoodie", "outfit", 90, 2, "Jeans and white sneakers."),
  I("fit-gym", "Gym Fit", "outfit", 120, 3, "Black tee and shorts."),
  I("fit-thobe", "White Thobe", "outfit", 150, 3, "With a kufi. Jumu'ah ready."),
  I("fit-leather", "Leather Jacket", "outfit", 250, 5, "White tee, dark denim."),
  I("fit-suit", "Navy Suit", "outfit", 400, 7, "For when you've made it."),

  // Room tiers
  I("room-studio", "Studio", "room", null, 1, "8×8. Where it starts.", { starter: true }),
  I("room-apartment", "Apartment", "room", 600, 5, "10×10 with a second window."),
  I("room-penthouse", "Penthouse", "room", 1500, 10, "12×12 with a city skyline."),

  // Pet
  I("cat", "Cat", "pet", 300, 4, "Follows you around. Judges your screen time."),

  // Car + paint
  I("ioniq5", "Hyundai Ioniq 5", "milestone", null, 1, "Atlas White. Unlocks at 30 clean days."),
  I("paint-white", "Atlas White", "paint", null, 1, "Factory white.", { starter: true }),
  I("paint-teal", "Digital Teal", "paint", 500, 8, "Ioniq 5 paint.", { requires: "ioniq5" }),
  I("paint-gold", "Gravity Gold Matte", "paint", null, 1, "Unlocks at 90 clean days.", { requires: "ioniq5" }),
];

export const ITEMS: Record<ItemId, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

export const STARTERS: ItemId[] = CATALOG.filter((c) => c.starter).map((c) => c.id);

export const DEFAULT_EQUIPPED: Equipped = {
  outfit: "fit-coat",
  wallpaper: "wp-sky",
  floor: "fl-tile",
  rug: "rug-green",
  room: "room-studio",
  paint: "paint-white",
};

export function tierOf(roomId: ItemId): RoomTier {
  return (roomId.replace("room-", "") as RoomTier) ?? "studio";
}

export const CATEGORY_LABELS: Record<Category, string> = {
  furniture: "Furniture",
  faith: "Faith corner",
  wall: "Wall decor",
  wallpaper: "Walls",
  floor: "Floors",
  rug: "Prayer rugs",
  outfit: "Outfits",
  room: "Rooms",
  pet: "Pets",
  paint: "Car paint",
  milestone: "Milestones",
};
